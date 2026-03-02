"""
ingestion/context_data.py
Weather + news for all tracked cities.
"""

from __future__ import annotations
import logging, os
import httpx
from dotenv import load_dotenv
load_dotenv()

logger = logging.getLogger(__name__)

CITY_COORDS: dict[str, dict] = {
    "nyc":       {"lat": 40.7580,  "lon": -73.9855, "name": "New York"},
    "chicago":   {"lat": 41.8826,  "lon": -87.6233, "name": "Chicago"},
    "london":    {"lat": 51.5154,  "lon":  -0.1416, "name": "London"},
    "paris":     {"lat": 48.8566,  "lon":   2.3522, "name": "Paris"},
    "amsterdam": {"lat": 52.3702,  "lon":   4.8952, "name": "Amsterdam"},
    "singapore": {"lat":  1.2834,  "lon": 103.8607, "name": "Singapore"},
    "dubai":     {"lat": 25.1972,  "lon":  55.2744, "name": "Dubai"},
    "sydney":    {"lat": -33.8523, "lon": 151.2108, "name": "Sydney"},
    # Overview regions (weather only, no camera)
    "india":     {"lat": 20.5937,  "lon":  78.9629, "name": "India"},
}


async def fetch_city_intelligence(city_id: str) -> dict:
    info = CITY_COORDS.get(city_id, CITY_COORDS["nyc"])
    lat, lon, name = info["lat"], info["lon"], info["name"]

    weather_key = os.getenv("OPENWEATHER_API_KEY")
    news_key    = os.getenv("NEWS_API_KEY")

    weather = {"temp": "N/A", "condition": "N/A", "visibility": "N/A", "wind": "N/A"}
    if weather_key:
        try:
            async with httpx.AsyncClient(timeout=6) as client:
                resp = await client.get(
                    "https://api.openweathermap.org/data/2.5/weather",
                    params={"lat": lat, "lon": lon, "appid": weather_key, "units": "metric"},
                )
                if resp.status_code == 200:
                    d = resp.json()
                    weather = {
                        "temp":       f"{round(d['main']['temp'])}°C",
                        "condition":  d["weather"][0]["main"],
                        "visibility": f"{d.get('visibility', 0) // 1000}km",
                        "wind":       f"{round(d['wind']['speed'] * 3.6)} km/h",
                    }
        except Exception as e:
            logger.warning(f"Weather [{city_id}]: {e}")

    news: list[str] = [f"Live news sync pending for {name}…"]
    if news_key:
        try:
            async with httpx.AsyncClient(timeout=6) as client:
                resp = await client.get(
                    "https://newsapi.org/v2/everything",
                    params={"q": name, "apiKey": news_key, "pageSize": 5,
                            "language": "en", "sortBy": "publishedAt"},
                )
                if resp.status_code == 200:
                    articles = resp.json().get("articles", [])
                    if articles:
                        news = [a["title"] for a in articles[:3] if a.get("title")]
        except Exception as e:
            logger.warning(f"News [{city_id}]: {e}")

    return {"weather": weather, "news": news}