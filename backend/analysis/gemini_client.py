import asyncio
import base64
import json
import logging
import os
import re
import httpx 
from datetime import datetime, timezone
from dotenv import load_dotenv

from ingestion.traffic_cams import CameraFrame
from models.schemas import DetectedVehicle, GeminiCameraAnalysis

# Load environment variables from .env file
load_dotenv()

logger = logging.getLogger(__name__)

# --- STABLE CONFIGURATION ---
API_KEY = os.getenv("GEMINI_API_KEY")

STABLE_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={API_KEY}"


SYSTEM_PROMPT = (
    "Analyze this traffic camera frame. Return ONLY a valid JSON object. "
    "Do not include markdown fences like ```json. "
    "Structure: {\"vehicles\": [{\"vehicle_type\": \"Car|Bus|Pedestrian\", \"count\": 1, "
    "\"latitude\": float, \"longitude\": float, \"confidence\": float, \"description\": \"string\"}], "
    "\"congestion_level\": \"Low|Moderate|High|Severe\", \"scene_summary\": \"string\"}"
)

async def analyse_frame(frame: CameraFrame) -> GeminiCameraAnalysis | None:
    """
    Sends a captured camera frame to Gemini 1.5 Flash via direct HTTP REST.
    Bypasses library bugs by using a simplified payload.
    """
    if not API_KEY:
        logger.error("GEMINI_API_KEY not found in environment. Check your .env file.")
        return None

    if frame.error or not frame.image_b64:
        return None

    # --- SIMPLIFIED REST PAYLOAD ---
    # We remove 'generation_config' because the REST API often rejects 
    # 'response_mime_type' depending on the specific model version.
    payload = {
        "contents": [{
            "parts": [
                {"text": f"{SYSTEM_PROMPT}\nLocation Context: {frame.camera_name}"},
                {"inline_data": {
                    "mime_type": frame.content_type, 
                    "data": frame.image_b64
                }}
            ]
        }]
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(STABLE_API_URL, json=payload)
            
            if response.status_code != 200:
                logger.error(f"Gemini API Error [{frame.camera_id}]: {response.status_code} - {response.text}")
                return None
            
            result = response.json()
            
            try:
                # Extract text from the standard Google AI response structure
                raw_text = result['candidates'][0]['content']['parts'][0]['text']
                
                # Defensively clean any markdown formatting if the model ignored instructions
                cleaned = re.sub(r"```(?:json)?", "", raw_text).strip().strip("`").strip()
                data = json.loads(cleaned)
            except (KeyError, IndexError, json.JSONDecodeError) as parse_err:
                logger.error(f"Failed to parse Gemini response for {frame.camera_id}: {parse_err}")
                return None
            
            # Map detected objects to Pydantic models for the frontend
            validated_vehicles = []
            for v in data.get("vehicles", []):
                try:
                    validated_vehicles.append(DetectedVehicle(**v))
                except Exception:
                    continue

            analysis = GeminiCameraAnalysis(
                camera_id=frame.camera_id,
                camera_name=frame.camera_name,
                camera_latitude=frame.latitude,
                camera_longitude=frame.longitude,
                timestamp_utc=datetime.now(timezone.utc).isoformat(),
                vehicles=validated_vehicles,
                scene_summary=data.get("scene_summary", "Live traffic analysis complete."),
                congestion_level=data.get("congestion_level", "Low"),
            )
            
            logger.info(f"[{frame.camera_id}] ✓ {len(validated_vehicles)} groups detected.")
            return analysis

    except Exception as e:
        logger.error(f"Network or Logic failure during analysis of {frame.camera_id}: {str(e)}")
        return None

async def analyse_all_frames(frames: list[CameraFrame]) -> list[GeminiCameraAnalysis]:
    """Concurrent processing of all active camera streams."""
    results = await asyncio.gather(*[analyse_frame(f) for f in frames])
    return [r for r in results if r is not None]