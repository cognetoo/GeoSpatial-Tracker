import { useCallback, useEffect, useRef, useState } from 'react'
import {
  BroadcastPayload,
  GeoJSONFeatureCollection,
  LiveStats,
  VehicleProperties,
} from '../types'

const WS_URL = "ws://localhost:8001/ws";
const RECONNECT_DELAY = 3000

export type WsStatus = 'connecting' | 'open' | 'closed' | 'error'

function deriveStats(collection: GeoJSONFeatureCollection): LiveStats {
  const stats: LiveStats = {
    aircraft:    0,
    cars:        0,
    buses:       0,
    pedestrians: 0,
    congestionBreakdown: { Low: 0, Moderate: 0, High: 0, Severe: 0 },
    lastUpdate: collection.metadata?.timestamp_utc ?? new Date().toISOString(),
  }

  if (!collection.features) return stats;

  for (const f of collection.features) {
    const p = f.properties;
    if (p.source === 'opensky') {
      stats.aircraft++;
    } else {
      const vp = p as VehicleProperties;
      if      (vp.vehicle_type === 'Car')         stats.cars        += vp.count;
      else if (vp.vehicle_type === 'Bus')          stats.buses       += vp.count;
      else if (vp.vehicle_type === 'Pedestrian')   stats.pedestrians += vp.count;
      
      if (vp.congestion_level) {
        stats.congestionBreakdown[vp.congestion_level] =
          (stats.congestionBreakdown[vp.congestion_level] ?? 0) + 1;
      }
    }
  }
  return stats;
}

export function useTracker() {
  const [geojson,  setGeojson]  = useState<GeoJSONFeatureCollection | null>(null);
  const [stats,    setStats]    = useState<LiveStats | null>(null);
  const [wsStatus, setWsStatus] = useState<WsStatus>('connecting');

  const wsRef    = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    setWsStatus('connecting');

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => setWsStatus('open');

    ws.onmessage = (evt: MessageEvent) => {
      try {
        const msg = JSON.parse(evt.data) as BroadcastPayload;
        // Since main.py sends BroadcastPayload(payload=collection)
        const data = msg.payload; 
        
        if (data && data.features) {
          setGeojson(data);
          setStats(deriveStats(data));
        }
      } catch (err) {
        console.error('WS parse error', err);
      }
    };

    ws.onerror = () => setWsStatus('error');
    ws.onclose = () => {
      setWsStatus('closed');
      retryRef.current = setTimeout(connect, RECONNECT_DELAY);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
      if (retryRef.current) clearTimeout(retryRef.current);
    };
  }, [connect]);

  return { geojson, stats, wsStatus };
}