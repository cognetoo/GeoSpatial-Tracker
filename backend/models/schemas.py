"""
models/schemas.py
Pydantic v2 schemas — validates all data before it reaches the frontend.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Literal, Optional, Union

from pydantic import BaseModel, Field, field_validator


class VehicleType(str, Enum):
    CAR           = "Car"
    BUS           = "Bus"
    PEDESTRIAN    = "Pedestrian"
    UNKNOWN       = "Unknown"
    AUTO_RICKSHAW = "Auto-rickshaw"
    MOTORCYCLE    = "Motorcycle"


class DetectedVehicle(BaseModel):
    vehicle_type: VehicleType = VehicleType.UNKNOWN
    count:        int         = Field(default=1,   ge=0,    le=999)
    confidence:   float       = Field(default=0.0, ge=0.0,  le=1.0)
    latitude:     float       = Field(ge=-90.0,  le=90.0)
    longitude:    float       = Field(ge=-180.0, le=180.0)
    description:  str         = Field(default="", max_length=300)


class GeminiCameraAnalysis(BaseModel):
    camera_id:        str
    camera_name:      str
    camera_latitude:  float
    camera_longitude: float
    timestamp_utc:    str
    vehicles:         list[DetectedVehicle] = Field(default_factory=list)
    scene_summary:    str = Field(default="", max_length=500)
    congestion_level: Literal["Low", "Moderate", "High", "Severe"] = "Low"

    @field_validator("vehicles", mode="before")
    @classmethod
    def cap_vehicles(cls, v: Any) -> Any:
        return v[:100] if isinstance(v, list) else v


class AircraftProperties(BaseModel):
    source:       Literal["opensky"] = "opensky"
    icao24:       str
    callsign:     str
    region:       str   = "Global"    # NEW — region tag for popup display
    altitude_m:   Optional[float] = None
    velocity_ms:  Optional[float] = None
    heading:      Optional[float] = None
    on_ground:    bool = False


class VehicleProperties(BaseModel):
    source:           Literal["gemini_vision"] = "gemini_vision"
    camera_id:        str
    camera_name:      str
    vehicle_type:     str
    count:            int
    confidence:       float
    congestion_level: str
    scene_summary:    str


class GeoJSONPoint(BaseModel):
    type:        Literal["Point"] = "Point"
    coordinates: list[float]

    @field_validator("coordinates")
    @classmethod
    def validate_coords(cls, v: list[float]) -> list[float]:
        if len(v) < 2:
            raise ValueError("coordinates need at least [lon, lat]")
        return v


class GeoJSONFeature(BaseModel):
    type:       Literal["Feature"] = "Feature"
    geometry:   GeoJSONPoint
    properties: Union[AircraftProperties, VehicleProperties]


class GeoJSONFeatureCollection(BaseModel):
    type:     Literal["FeatureCollection"] = "FeatureCollection"
    features: list[GeoJSONFeature]         = Field(default_factory=list)
    metadata: dict[str, Any]               = Field(default_factory=dict)


class BroadcastPayload(BaseModel):
    event:   Literal["geo_update"] = "geo_update"
    payload: GeoJSONFeatureCollection