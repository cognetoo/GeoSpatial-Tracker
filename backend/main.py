"""
main.py  —  Geospatial AI Tracker v2.1
FastAPI WebSocket hub:
  • 60-second ingestion loop
  • OpenSky aircraft (single global call, rate-limit safe)
  • YouTube live-stream frames via yt-dlp + ffmpeg (6 cities)
  • Gemini 1.5 Flash vision analysis
  • OpenWeatherMap + NewsAPI city intelligence
  • GeoJSON broadcast to all WS clients
"""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from analysis.gemini_client import analyse_all_frames
from ingestion.opensky import fetch_aircraft
from ingestion.traffic_cams import CAMERA_REGISTRY, fetch_all_frames
from ingestion.context_data import fetch_city_intelligence, CITY_COORDS
from models.schemas import (
    AircraftProperties,
    BroadcastPayload,
    GeoJSONFeature,
    GeoJSONFeatureCollection,
    GeoJSONPoint,
    GeminiCameraAnalysis,
    VehicleProperties,
)

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("main")

LOOP_INTERVAL = int(os.getenv("LOOP_INTERVAL", "60"))


# ---------------------------------------------------------------------------
# WebSocket connection manager
# ---------------------------------------------------------------------------

class ConnectionManager:
    def __init__(self) -> None:
        self.active: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self.active.append(ws)
        logger.info(f"WS connected — total: {len(self.active)}")

    def disconnect(self, ws: WebSocket) -> None:
        self.active = [c for c in self.active if c is not ws]
        logger.info(f"WS disconnected — total: {len(self.active)}")

    async def broadcast(self, message: str) -> None:
        dead: list[WebSocket] = []
        for ws in self.active:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


manager = ConnectionManager()


# ---------------------------------------------------------------------------
# GeoJSON builders
# ---------------------------------------------------------------------------

def _aircraft_to_features(aircraft_list: list[dict]) -> list[GeoJSONFeature]:
    features: list[GeoJSONFeature] = []
    for a in aircraft_list:
        try:
            features.append(GeoJSONFeature(
                geometry=GeoJSONPoint(
                    coordinates=[a["longitude"], a["latitude"]]
                ),
                properties=AircraftProperties(
                    icao24=a["icao24"],
                    callsign=a["callsign"],
                    altitude_m=a.get("altitude_m"),
                    velocity_ms=a.get("velocity_ms"),
                    heading=a.get("heading"),
                    on_ground=a.get("on_ground", False),
                    region=a.get("region", "Global"),
                ),
            ))
        except (ValidationError, Exception) as e:
            logger.debug(f"Aircraft skipped: {e}")
    return features


def _gemini_to_features(
    analyses: list[GeminiCameraAnalysis],
) -> list[GeoJSONFeature]:
    features: list[GeoJSONFeature] = []
    for analysis in analyses:
        for vehicle in analysis.vehicles:
            try:
                features.append(GeoJSONFeature(
                    geometry=GeoJSONPoint(
                        coordinates=[vehicle.longitude, vehicle.latitude]
                    ),
                    properties=VehicleProperties(
                        camera_id=analysis.camera_id,
                        camera_name=analysis.camera_name,
                        vehicle_type=vehicle.vehicle_type.value,
                        count=vehicle.count,
                        confidence=vehicle.confidence,
                        congestion_level=analysis.congestion_level,
                        scene_summary=analysis.scene_summary,
                    ),
                ))
            except (ValidationError, Exception) as e:
                logger.debug(f"Vehicle skipped: {e}")
    return features


def build_geojson(
    aircraft: list[dict],
    analyses: list[GeminiCameraAnalysis],
    intelligence: dict[str, Any],
) -> GeoJSONFeatureCollection:
    features = _aircraft_to_features(aircraft) + _gemini_to_features(analyses)
    return GeoJSONFeatureCollection(
        features=features,
        metadata={
            "timestamp_utc":     datetime.now(timezone.utc).isoformat(),
            "aircraft_count":    len(aircraft),
            "camera_analyses":   len(analyses),
            "total_features":    len(features),
            "city_intelligence": intelligence,
        },
    )


# ---------------------------------------------------------------------------
# Background ingestion loop
# ---------------------------------------------------------------------------

async def ingestion_loop() -> None:
    logger.info(f"Ingestion loop started — interval={LOOP_INTERVAL}s")

    while True:
        try:
            logger.info("── Cycle start ──")

            # Parallel: aircraft + camera frames + city intelligence
            city_ids = list(CITY_COORDS.keys())
            aircraft_task = asyncio.create_task(fetch_aircraft())
            frames_task   = asyncio.create_task(fetch_all_frames(CAMERA_REGISTRY))
            intel_tasks   = [fetch_city_intelligence(c) for c in city_ids]

            aircraft, frames, intel_results = await asyncio.gather(
                aircraft_task,
                frames_task,
                asyncio.gather(*intel_tasks),
            )

            intelligence = dict(zip(city_ids, intel_results))

            # Gemini vision
            gemini_key = os.getenv("GEMINI_API_KEY")
            if gemini_key:
                analyses = await analyse_all_frames(frames)
            else:
                logger.warning("GEMINI_API_KEY not set — skipping vision")
                analyses = []

            collection = build_geojson(aircraft, analyses, intelligence)
            payload    = BroadcastPayload(payload=collection)
            await manager.broadcast(payload.model_dump_json())

            logger.info(
                f"Broadcast — aircraft: {len(aircraft)} | "
                f"cameras: {len(analyses)} | "
                f"features: {len(collection.features)}"
            )

        except Exception as e:
            logger.error(f"Ingestion loop error: {e}", exc_info=True)

        await asyncio.sleep(LOOP_INTERVAL)


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(ingestion_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="Geospatial AI Tracker — Global v2.1",
    version="2.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status":             "ok",
        "active_connections": len(manager.active),
        "loop_interval_s":    LOOP_INTERVAL,
        "cameras":            [c["name"] for c in CAMERA_REGISTRY],
    }


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await manager.connect(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(ws)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)