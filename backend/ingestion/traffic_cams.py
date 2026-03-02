"""
ingestion/traffic_cams.py

Cameras selected based on proven live-stream reliability:
  - Only cities where yt-dlp consistently finds 20KB+ frames
  - Tokyo/Delhi removed (yt-dlp finds static thumbnails = 1KB dead streams)
  - Paris Champs-Elysees replaced with Paris street-level cam (better detection)
  - Added Chicago and Amsterdam for geographic diversity

Windows .env:
  FFMPEG_PATH=C:/ffmpeg/ffmpeg-8.0.1-essentials_build/bin/ffmpeg.exe
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
import subprocess
import tempfile
from dataclasses import dataclass
from typing import Optional

from dotenv import load_dotenv
load_dotenv(override=True)   # MUST be before _ffmpeg_path()

logger = logging.getLogger(__name__)


def _ffmpeg_path() -> str:
    raw = os.environ.get("FFMPEG_PATH", "").strip()
    return raw if raw else "ffmpeg"


_FFMPEG = _ffmpeg_path()


def _check_ffmpeg() -> bool:
    try:
        r = subprocess.run([_FFMPEG, "-version"], capture_output=True, timeout=5)
        return r.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return False


_ffmpeg_ok = _check_ffmpeg()
if _ffmpeg_ok:
    logger.info(f"✓ ffmpeg OK — {_FFMPEG}")
else:
    logger.error(
        f"✗ ffmpeg NOT FOUND at: '{_FFMPEG}'\n"
        f"  Windows → add to backend/.env: FFMPEG_PATH=C:/ffmpeg/bin/ffmpeg.exe\n"
        f"  Linux   → sudo apt install ffmpeg\n"
        f"  macOS   → brew install ffmpeg"
    )


# ---------------------------------------------------------------------------
# Frame size validator — reject dead streams (< 8KB = thumbnail/black frame)
# ---------------------------------------------------------------------------
MIN_FRAME_KB = 8


# ---------------------------------------------------------------------------
# Camera registry
# Removed: Tokyo Shibuya (yt-dlp finds a 1KB static thumbnail consistently)
#          Delhi          (same issue — no reliable 24/7 street cams)
# ---------------------------------------------------------------------------
CAMERA_REGISTRY: list[dict] = [
    # ── Americas ─────────────────────────────────────────────────────────
    {
        "id":          "nyc_times_square",
        "name":        "NYC Times Square",
        "latitude":    40.7580,
        "longitude":  -73.9855,
        "youtube_url": "ytsearch1:live Times Square New York 4K street cam",
        "city":        "New York, USA",
    },
    {
        "id":          "chicago_downtown",
        "name":        "Chicago The Bean / Millennium Park",
        "latitude":    41.8826,
        "longitude":  -87.6233,
        "youtube_url": "ytsearch1:live Chicago downtown webcam 4K",
        "city":        "Chicago, USA",
    },
    # ── Europe ───────────────────────────────────────────────────────────
    {
        "id":          "london_oxford",
        "name":        "London Oxford Street",
        "latitude":    51.5154,
        "longitude":  -0.1416,
        "youtube_url": "ytsearch1:live London Oxford Street pedestrian webcam",
        "city":        "London, UK",
    },
    {
        "id":          "paris_street",
        "name":        "Paris Street View",
        "latitude":    48.8566,
        "longitude":   2.3522,
        "youtube_url": "ytsearch1:live Paris street live cam France 4K",
        "city":        "Paris, France",
    },
    {
        "id":          "amsterdam_canal",
        "name":        "Amsterdam Canal",
        "latitude":    52.3702,
        "longitude":   4.8952,
        "youtube_url": "ytsearch1:live Amsterdam canal webcam Netherlands",
        "city":        "Amsterdam, Netherlands",
    },
    # ── Asia-Pacific ─────────────────────────────────────────────────────
    {
        "id":          "singapore_marina",
        "name":        "Singapore Marina Bay",
        "latitude":    1.2834,
        "longitude":  103.8607,
        "youtube_url": "ytsearch1:live Singapore Marina Bay Sands webcam 4K",
        "city":        "Singapore",
    },
    {
        "id":          "dubai_downtown",
        "name":        "Dubai Downtown / Burj Khalifa",
        "latitude":    25.1972,
        "longitude":   55.2744,
        "youtube_url": "ytsearch1:live Dubai Burj Khalifa downtown street webcam",
        "city":        "Dubai, UAE",
    },
    {
        "id":          "sydney_harbour",
        "name":        "Sydney Harbour Bridge",
        "latitude":   -33.8523,
        "longitude":  151.2108,
        "youtube_url": "ytsearch1:live Sydney Harbour Bridge webcam Australia",
        "city":        "Sydney, Australia",
    },
]


@dataclass
class CameraFrame:
    camera_id:    str
    camera_name:  str
    latitude:     float
    longitude:    float
    city:         str
    image_b64:    str
    content_type: str = "image/jpeg"
    error:        Optional[str] = None


def _resolve_stream_url(youtube_url: str, timeout: int = 45) -> str:
    cmd = [
        "yt-dlp", "--no-warnings", "--quiet",
        "-f", "best[height<=480]/best",
        "--get-url",
        youtube_url,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if result.returncode != 0:
        raise RuntimeError(f"yt-dlp: {result.stderr.strip()[:200]}")
    url = result.stdout.strip().splitlines()[0]
    if not url:
        raise RuntimeError("yt-dlp returned empty URL")
    return url


def _grab_frame(stream_url: str, timeout: int = 25) -> bytes:
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        cmd = [
            _FFMPEG, "-y",
            "-loglevel", "error",
            "-i", stream_url,
            "-vframes", "1",
            "-q:v", "3",
            "-vf", "scale=640:-1",
            tmp_path,
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=timeout)
        if result.returncode != 0:
            raise RuntimeError(f"ffmpeg: {result.stderr.decode()[:300]}")
        with open(tmp_path, "rb") as f:
            return f.read()
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


async def _capture_frame(camera: dict) -> CameraFrame:
    loop = asyncio.get_event_loop()
    blank = CameraFrame(
        camera_id=camera["id"], camera_name=camera["name"],
        latitude=camera["latitude"], longitude=camera["longitude"],
        city=camera.get("city", ""), image_b64="",
    )
    try:
        logger.info(f"[{camera['id']}] Resolving …")
        stream_url = await loop.run_in_executor(
            None, lambda: _resolve_stream_url(camera["youtube_url"])
        )
        logger.info(f"[{camera['id']}] Grabbing frame …")
        jpeg_bytes = await loop.run_in_executor(
            None, lambda: _grab_frame(stream_url)
        )

        # Reject dead streams (black frames / thumbnails)
        kb = len(jpeg_bytes) // 1024
        if kb < MIN_FRAME_KB:
            raise RuntimeError(
                f"Frame too small ({kb}KB < {MIN_FRAME_KB}KB) — "
                f"likely a static thumbnail or offline stream"
            )

        image_b64 = base64.b64encode(jpeg_bytes).decode("utf-8")
        logger.info(f"[{camera['id']}] ✓ {kb} KB")
        return CameraFrame(
            camera_id=camera["id"], camera_name=camera["name"],
            latitude=camera["latitude"], longitude=camera["longitude"],
            city=camera.get("city", ""), image_b64=image_b64,
        )

    except (FileNotFoundError, OSError):
        err = (
            f"ffmpeg not found at '{_FFMPEG}'. "
            r"Add FFMPEG_PATH=C:/ffmpeg/bin/ffmpeg.exe to backend/.env"
        )
        logger.error(f"[{camera['id']}] {err}")
        return CameraFrame(**{**blank.__dict__, "error": err})
    except subprocess.TimeoutExpired:
        logger.warning(f"[{camera['id']}] Timed out")
        return CameraFrame(**{**blank.__dict__, "error": "Timed out"})
    except Exception as e:
        logger.warning(f"[{camera['id']}] ✗ {e}")
        return CameraFrame(**{**blank.__dict__, "error": str(e)})


async def fetch_all_frames(cameras: list[dict] = CAMERA_REGISTRY) -> list[CameraFrame]:
    frames: list[CameraFrame] = await asyncio.gather(
        *[_capture_frame(cam) for cam in cameras]
    )
    ok  = sum(1 for f in frames if not f.error)
    bad = [(f.camera_name, f.error) for f in frames if f.error]
    logger.info(f"Frame capture: {ok}/{len(cameras)} OK")
    for name, err in bad:
        logger.warning(f"  ✗ {name}: {err[:80]}")
    return list(frames)


if __name__ == "__main__":
    print(f"FFMPEG_PATH env : {os.environ.get('FFMPEG_PATH', '(not set)')}")
    print(f"Resolved path   : {_FFMPEG}")
    print(f"ffmpeg reachable: {_ffmpeg_ok}")
    asyncio.run(fetch_all_frames())