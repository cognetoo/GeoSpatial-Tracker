"""
ingestion/opensky.py
Fetches live aircraft from OpenSky Network across multiple world regions.

Rate-limit strategy (avoids the 429 / 10-second-per-IP wall):
  - Anonymous: 1 request / 10 s, max 400 results per call.
  - We make ONE call per cycle covering a wide global bounding box
    instead of multiple regional calls — this uses only 1 of our quota
    slots and returns more data than region-by-region requests.
  - Optional OAuth2 client credentials (OPENSKY_CLIENT_ID / SECRET)
    give 2× the quota if you have a registered account.
  - Results are tagged with a 'region' label by post-processing.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time

import httpx

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Region bounding boxes — used for labelling only (not separate API calls)
# ---------------------------------------------------------------------------
REGIONS: dict[str, dict] = {
    "India":         {"min_lat":  8.0, "max_lat": 37.0, "min_lon":  68.0, "max_lon":  97.0},
    "USA_NYC":       {"min_lat": 40.4, "max_lat": 41.0, "min_lon": -74.3, "max_lon": -73.6},
    "UK_London":     {"min_lat": 51.2, "max_lat": 51.8, "min_lon":  -0.6, "max_lon":   0.4},
    "Japan_Tokyo":   {"min_lat": 35.3, "max_lat": 36.0, "min_lon": 139.3, "max_lon": 140.2},
    "France_Paris":  {"min_lat": 48.6, "max_lat": 49.1, "min_lon":   2.0, "max_lon":   2.7},
    "Singapore":     {"min_lat":  1.1, "max_lat":  1.5, "min_lon": 103.6, "max_lon": 104.1},
    "Australia":     {"min_lat":-38.0, "max_lat":-28.0, "min_lon": 140.0, "max_lon": 155.0},
    "UAE_Dubai":     {"min_lat": 24.6, "max_lat": 25.6, "min_lon":  54.8, "max_lon":  55.8},
}

# Single wide bounding box that covers all regions in one API request
GLOBAL_BBOX = {
    "lamin": -45.0,
    "lomin": -130.0,
    "lamax":  65.0,
    "lomax":  160.0,
}

# ---------------------------------------------------------------------------
# OAuth2 token cache (for registered OpenSky accounts — doubles quota)
# ---------------------------------------------------------------------------
_cached_token: str | None = None
_token_expiry: float = 0.0


async def _get_access_token() -> str | None:
    global _cached_token, _token_expiry
    if _cached_token and time.time() < (_token_expiry - 60):
        return _cached_token
    cid = os.getenv("OPENSKY_CLIENT_ID")
    sec = os.getenv("OPENSKY_CLIENT_SECRET")
    if not cid or not sec:
        return None
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://auth.opensky-network.org/auth/realms/opensky-network"
                "/protocol/openid-connect/token",
                data={
                    "grant_type":    "client_credentials",
                    "client_id":     cid,
                    "client_secret": sec,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            _cached_token  = data.get("access_token")
            _token_expiry  = time.time() + data.get("expires_in", 1800)
            logger.info("OpenSky OAuth2 token refreshed")
            return _cached_token
    except Exception as e:
        logger.warning(f"OpenSky token refresh failed: {e}")
        return None


# ---------------------------------------------------------------------------
# Region tagger
# ---------------------------------------------------------------------------

def _tag_region(lat: float, lon: float) -> str:
    for name, b in REGIONS.items():
        if b["min_lat"] <= lat <= b["max_lat"] and b["min_lon"] <= lon <= b["max_lon"]:
            return name
    return "Global"


# ---------------------------------------------------------------------------
# Main fetch function — one request, global bbox, region-tagged output
# ---------------------------------------------------------------------------

async def fetch_aircraft(timeout: int = 15) -> list[dict]:
    """
    Fetch all aircraft in the global bounding box in a single API call.
    Returns a list of normalised aircraft dicts ready for GeoJSON encoding.
    """
    token   = await _get_access_token()
    headers = {"Authorization": f"Bearer {token}"} if token else {}

    params = {k: v for k, v in GLOBAL_BBOX.items()}

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(
                "https://opensky-network.org/api/states/all",
                params=params,
                headers=headers,
            )
            if resp.status_code == 429:
                logger.warning("OpenSky rate-limited (429) — returning empty list")
                return []
            resp.raise_for_status()
            states = resp.json().get("states") or []
    except httpx.HTTPStatusError as e:
        logger.error(f"OpenSky HTTP error: {e}")
        return []
    except Exception as e:
        logger.error(f"OpenSky fetch failed: {e}")
        return []

    aircraft: list[dict] = []
    for s in states:
        lon = s[5]
        lat = s[6]
        if lon is None or lat is None:
            continue
        aircraft.append({
            "icao24":       s[0],
            "callsign":     (s[1] or "???").strip(),
            "longitude":    lon,
            "latitude":     lat,
            "altitude_m":   s[7],
            "velocity_ms":  s[9],
            "heading":      s[10] or 0,
            "vertical_rate": s[11],
            "on_ground":    s[8],
            "region":       _tag_region(lat, lon),
            "source":       "opensky",
        })

    logger.info(f"OpenSky: {len(aircraft)} aircraft fetched (1 API call)")
    return aircraft


if __name__ == "__main__":
    result = asyncio.run(fetch_aircraft())
    by_region: dict[str, int] = {}
    for a in result:
        by_region[a["region"]] = by_region.get(a["region"], 0) + 1
    for region, count in sorted(by_region.items(), key=lambda x: -x[1]):
        print(f"  {region}: {count}")
    print(f"Total: {len(result)}")