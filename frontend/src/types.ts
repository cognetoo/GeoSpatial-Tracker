export type VehicleType = 'Car' | 'Bus' | 'Pedestrian' | 'Unknown' | 'Auto-rickshaw' | 'Motorcycle';
export type CongestionLevel = 'Low' | 'Moderate' | 'High' | 'Severe';

export interface CityIntelligence {
  weather: { temp: string; condition: string; visibility: string; wind: string; };
  news: string[];
}

export interface AircraftProperties {
  source:      'opensky';
  icao24:      string;
  callsign:    string;
  region:      string; 
  altitude_m:  number | null;
  velocity_ms: number | null;
  // ADDED heading property
  heading:     number | null; 
  on_ground:   boolean;
}

export interface VehicleProperties {
  source:           'gemini_vision';
  camera_id:        string;
  camera_name:      string;
  vehicle_type:     VehicleType;
  count:            number;
  confidence:       number;
  congestion_level: CongestionLevel;
  scene_summary:    string;
}

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number]; };
  properties: AircraftProperties | VehicleProperties;
}

export interface GeoJSONMetadata {
  timestamp_utc:   string;
  aircraft_count:  number;
  camera_analyses: number;
  total_features:  number;
  city_intelligence?: Record<string, CityIntelligence>; 
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
  metadata: GeoJSONMetadata;
}

export interface BroadcastPayload {
  payload: GeoJSONFeatureCollection;
}

export interface LiveStats {
  aircraft:    number;
  cars:        number;
  buses:       number;
  pedestrians: number;
  congestionBreakdown: Record<CongestionLevel, number>;
  lastUpdate:  string;
}