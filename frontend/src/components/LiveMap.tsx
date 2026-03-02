import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef, useState } from 'react'
import { GeoJSONFeatureCollection } from '../types'

// @ts-ignore
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY ?? ''

const STYLES = {
  tactical:  `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`,
  satellite: `https://api.maptiler.com/maps/satellite/style.json?key=${MAPTILER_KEY}`,
}

// ── Fly-to city list — matches all active camera cities ──────────────────
const CITY_ANCHORS = [
  { id: 'global',    name: '🌍 Global View',           lng: -20,      lat: 25,       zoom: 2.5  },
  { id: 'nyc',       name: '🗽 NYC Times Square',       lng: -73.9855, lat: 40.7580,  zoom: 15   },
  { id: 'chicago',   name: '🌆 Chicago Downtown',       lng: -87.6233, lat: 41.8826,  zoom: 14   },
  { id: 'london',    name: '🎡 London Oxford St',       lng: -0.1416,  lat: 51.5154,  zoom: 14   },
  { id: 'paris',     name: '🗼 Paris',                  lng:  2.3522,  lat: 48.8566,  zoom: 14   },
  { id: 'amsterdam', name: '🌷 Amsterdam Canal',        lng:  4.8952,  lat: 52.3702,  zoom: 14   },
  { id: 'singapore', name: '🦁 Singapore Marina Bay',  lng: 103.8607, lat:  1.2834,  zoom: 14   },
  { id: 'dubai',     name: '🏙️ Dubai Downtown',        lng:  55.2744, lat: 25.1972,  zoom: 14   },
  { id: 'sydney',    name: '🦘 Sydney Harbour',         lng: 151.2108, lat: -33.8523, zoom: 13   },
  { id: 'europe',    name: '🌍 Europe Overview',        lng:  10,      lat: 51,       zoom: 4    },
  { id: 'asia',      name: '🌏 Asia Overview',          lng: 100,      lat: 25,       zoom: 3.5  },
]

const PLANE_COLOR   = '#00ff9d'
const MAX_TRAIL_LEN = 18

const VEHICLE_COLOR_EXPR = [
  'match', ['get', 'vehicle_type'],
  'Car',        '#00d4ff',
  'Bus',        '#0099ff',
  'Pedestrian', '#ff9f1c',
  '#4d7f99',
] as any

// ── Trail memory lives outside React so it survives re-renders ───────────
const trailMemory: Record<string, [number, number][]> = {}

interface Props {
  geojson:      GeoJSONFeatureCollection | null
  onCitySelect: (cityId: string) => void
}

// ── Sync data — defined OUTSIDE component so it's never stale ────────────
// Takes the map and current geojson explicitly (no closure over state)
function syncData(map: maplibregl.Map, collection: GeoJSONFeatureCollection) {
  const planes   = collection.features.filter(f => f.properties.source === 'opensky')
  const vehicles = collection.features.filter(f => f.properties.source !== 'opensky')

  const aircraftSrc = map.getSource('aircraft-source') as maplibregl.GeoJSONSource | undefined
  const vehicleSrc  = map.getSource('vehicle-source')  as maplibregl.GeoJSONSource | undefined
  const trailSrc    = map.getSource('trail-source')    as maplibregl.GeoJSONSource | undefined

  if (!aircraftSrc || !vehicleSrc || !trailSrc) return  // sources not ready yet

  aircraftSrc.setData({ type: 'FeatureCollection', features: planes } as GeoJSON.FeatureCollection)
  vehicleSrc.setData({ type: 'FeatureCollection', features: vehicles } as GeoJSON.FeatureCollection)

  // Build trail features — each dot carries 'age' (0=newest, N=oldest)
  const trailFeatures: GeoJSON.Feature[] = []
  planes.forEach(p => {
    const props = p.properties as unknown as Record<string, unknown>
    const id    = props['icao24'] as string
    const coord = p.geometry.coordinates as [number, number]
    if (!trailMemory[id]) trailMemory[id] = []
    trailMemory[id].unshift(coord)
    if (trailMemory[id].length > MAX_TRAIL_LEN + 1) trailMemory[id].pop()
    trailMemory[id].slice(1).forEach((c, age) => {
      trailFeatures.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: c },
        properties: { age },
      })
    })
  })
  trailSrc.setData({ type: 'FeatureCollection', features: trailFeatures })
}

// ── Layer setup — called on every style.load ─────────────────────────────
function setupLayers(
  map: maplibregl.Map,
  geojsonRef: React.MutableRefObject<GeoJSONFeatureCollection | null>
) {
  // Sources
  map.addSource('aircraft-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addSource('trail-source',    { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
  map.addSource('vehicle-source',  { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

  // Trail — fading dots behind each aircraft
  map.addLayer({
    id: 'trail-dots', type: 'circle', source: 'trail-source',
    paint: {
      'circle-radius':  ['interpolate', ['linear'], ['get', 'age'], 0, 4,   MAX_TRAIL_LEN - 1, 1.5],
      'circle-color':   PLANE_COLOR,
      'circle-opacity': ['interpolate', ['linear'], ['get', 'age'], 0, 0.55, MAX_TRAIL_LEN - 1, 0.05],
      'circle-blur':    0.4,
    },
  })

  // Aircraft halo + dot + label
  map.addLayer({
    id: 'aircraft-halo', type: 'circle', source: 'aircraft-source',
    paint: {
      'circle-radius':  ['interpolate', ['linear'], ['zoom'], 2, 7, 10, 12],
      'circle-color':   PLANE_COLOR,
      'circle-opacity': 0.10,
      'circle-blur':    1,
    },
  })
  map.addLayer({
    id: 'aircraft-dot', type: 'circle', source: 'aircraft-source',
    paint: {
      'circle-radius':       ['interpolate', ['linear'], ['zoom'], 2, 3.5, 10, 6],
      'circle-color':        PLANE_COLOR,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1,
      'circle-opacity':      1,
    },
  })
  map.addLayer({
    id: 'aircraft-label', type: 'symbol', source: 'aircraft-source',
    minzoom: 6,
    layout: {
      'text-field':   ['get', 'callsign'],
      'text-font':    ['Noto Sans Regular'],
      'text-size':     9, 'text-offset': [0, 1.3], 'text-anchor': 'top',
    },
    paint: { 'text-color': PLANE_COLOR, 'text-halo-color': '#000', 'text-halo-width': 1 },
  })

  // Vehicle halo + dot + label
  map.addLayer({
    id: 'vehicle-halo', type: 'circle', source: 'vehicle-source',
    paint: {
      'circle-radius':  ['interpolate', ['linear'], ['get', 'count'], 1, 16, 200, 40],
      'circle-color':   VEHICLE_COLOR_EXPR,
      'circle-opacity': 0.10,
      'circle-blur':    1.2,
    },
  })
  map.addLayer({
    id: 'vehicle-dot', type: 'circle', source: 'vehicle-source',
    paint: {
      'circle-radius':       ['interpolate', ['linear'], ['get', 'count'], 1, 7, 200, 18],
      'circle-color':        VEHICLE_COLOR_EXPR,
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 0.8,
      'circle-opacity':      0.9,
    },
  })
  map.addLayer({
    id: 'vehicle-label', type: 'symbol', source: 'vehicle-source',
    minzoom: 8,
    layout: {
      'text-field':  ['concat', ['get', 'vehicle_type'], ' ×', ['to-string', ['get', 'count']]],
      'text-font':   ['Noto Sans Regular'],
      'text-size':    9, 'text-offset': [0, 1.5], 'text-anchor': 'top',
    },
    paint: { 'text-color': '#00d4ff', 'text-halo-color': '#000', 'text-halo-width': 1 },
  })

  // Popups
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 14, maxWidth: '280px' })

  map.on('mouseenter', 'aircraft-dot', (e) => {
    const feats = map.queryRenderedFeatures(e.point, { layers: ['aircraft-dot'] })
    if (!feats.length) return
    map.getCanvas().style.cursor = 'pointer'
    const [lng, lat] = (feats[0].geometry as GeoJSON.Point).coordinates as [number, number]
    const p = feats[0].properties as Record<string, unknown>
    popup.setLngLat([lng, lat]).setHTML(`
      <div class="popup-inner">
        <div class="popup-title">✈ ${p['callsign']}</div>
        <div class="popup-row"><span>ICAO24</span><span>${p['icao24']}</span></div>
        <div class="popup-row"><span>Region</span><span>${p['region'] ?? '—'}</span></div>
        <div class="popup-row"><span>Altitude</span><span>${p['altitude_m'] != null ? Math.round(p['altitude_m'] as number) + ' m' : '—'}</span></div>
        <div class="popup-row"><span>Speed</span><span>${p['velocity_ms'] != null ? Math.round((p['velocity_ms'] as number) * 1.944) + ' kt' : '—'}</span></div>
        <div class="popup-row"><span>Heading</span><span>${p['heading'] != null ? Math.round(p['heading'] as number) + '°' : '—'}</span></div>
      </div>`).addTo(map)
  })
  map.on('mouseleave', 'aircraft-dot', () => { map.getCanvas().style.cursor = ''; popup.remove() })

  map.on('mouseenter', 'vehicle-dot', (e) => {
    const feats = map.queryRenderedFeatures(e.point, { layers: ['vehicle-dot'] })
    if (!feats.length) return
    map.getCanvas().style.cursor = 'pointer'
    const [lng, lat] = (feats[0].geometry as GeoJSON.Point).coordinates as [number, number]
    const p = feats[0].properties as Record<string, unknown>
    const emoji = p['vehicle_type'] === 'Pedestrian' ? '🚶' : p['vehicle_type'] === 'Bus' ? '🚌' : '🚗'
    popup.setLngLat([lng, lat]).setHTML(`
      <div class="popup-inner">
        <div class="popup-title">${emoji} ${p['vehicle_type']}</div>
        <div class="popup-row"><span>Camera</span><span>${p['camera_name']}</span></div>
        <div class="popup-row"><span>Count</span><span>${p['count']}</span></div>
        <div class="popup-row"><span>Confidence</span><span>${((p['confidence'] as number) * 100).toFixed(0)}%</span></div>
        <div class="popup-row"><span>Congestion</span><span class="tag-${(p['congestion_level'] as string).toLowerCase()}">${p['congestion_level']}</span></div>
        <div class="popup-summary">${p['scene_summary']}</div>
      </div>`).addTo(map)
  })
  map.on('mouseleave', 'vehicle-dot', () => { map.getCanvas().style.cursor = ''; popup.remove() })

  // After style swap, immediately re-populate from the ref (no stale closure)
  if (geojsonRef.current) {
    syncData(map, geojsonRef.current)
  }
}

// ── Component ─────────────────────────────────────────────────────────────
export function LiveMap({ geojson, onCitySelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<maplibregl.Map | null>(null)
  // geojsonRef always holds the latest value — readable from setupLayers without closure issues
  const geojsonRef   = useRef<GeoJSONFeatureCollection | null>(null)
  const [viewMode, setViewMode] = useState<'tactical' | 'satellite'>('tactical')

  // ── Init map once ────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    const map = new maplibregl.Map({
      container:        containerRef.current,
      style:            STYLES.tactical,
      center:           [-30, 30],
      zoom:             2.5,
      minZoom:          1.5,
      maxZoom:          18,
      attributionControl: false,
    })
    map.addControl(new maplibregl.NavigationControl(), 'bottom-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    map.on('style.load', () => {
      map.jumpTo({ center: [-30, 30], zoom: 2.5 })
      setupLayers(map, geojsonRef)   // passes ref so it's always fresh
    })

    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // ── Sync new data whenever geojson updates ───────────────────────────
  useEffect(() => {
    geojsonRef.current = geojson   // always keep ref current
    const map = mapRef.current
    if (!map || !geojson) return
    if (!map.isStyleLoaded()) {
      map.once('style.load', () => syncData(map, geojson))
    } else {
      syncData(map, geojson)
    }
  }, [geojson])

  // ── Style toggle ─────────────────────────────────────────────────────
  const toggleStyle = () => {
    const next = viewMode === 'tactical' ? 'satellite' : 'tactical'
    setViewMode(next)
    mapRef.current?.setStyle(STYLES[next])
    // setStyle fires 'style.load' → setupLayers reads geojsonRef → dots restored
  }

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>

      {/* Control panel */}
      <div style={{
        position: 'absolute', top: 20, right: 20, zIndex: 1000,
        background: 'rgba(5,15,35,0.95)', padding: '14px 12px',
        borderRadius: 8, border: '1px solid #1a3a5c', width: 180,
      }}>
        {/* Style toggle */}
        <button onClick={toggleStyle} style={{
          width: '100%', padding: '9px',
          background: viewMode === 'tactical' ? '#f1c40f' : '#00ff9d',
          color: '#000', border: 'none', fontWeight: 'bold',
          cursor: 'pointer', marginBottom: 14, borderRadius: 4, fontSize: 11,
          fontFamily: 'Space Mono, monospace',
        }}>
          {viewMode === 'tactical' ? '🛰️ ENABLE SATELLITE' : '📡 ENABLE TACTICAL'}
        </button>

        <div style={{
          fontSize: 9, color: '#4d7f99', marginBottom: 8,
          fontFamily: 'monospace', letterSpacing: '0.1em',
        }}>
          TACTICAL NAV
        </div>

        {/* Scrollable city list */}
        <div style={{ maxHeight: 320, overflowY: 'auto' }}>
          {CITY_ANCHORS.map(city => (
            <button key={city.id} onClick={() => {
              onCitySelect(city.id)
              mapRef.current?.flyTo({ center: [city.lng, city.lat], zoom: city.zoom, duration: 2200 })
            }} style={{
              width: '100%', padding: '7px 10px',
              background: '#0a192f', color: '#e8f4fd',
              border: '1px solid #1a3a5c', fontSize: 10,
              cursor: 'pointer', marginBottom: 4, textAlign: 'left',
              borderRadius: 3, fontFamily: 'Space Mono, monospace',
            }}>
              {city.name}
            </button>
          ))}
        </div>
      </div>

      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      <style>{`
        .maplibregl-popup-content {
          background: rgba(5,15,35,0.97) !important;
          border: 1px solid #1a3a5c; border-radius: 6px;
          padding: 0; box-shadow: 0 0 24px rgba(0,212,255,0.15);
        }
        .maplibregl-popup-tip { display: none; }
        .popup-inner   { padding: 10px 14px; font-family: 'Space Mono', monospace; min-width: 210px; }
        .popup-title   { color: #00ff9d; font-size: 12px; font-weight: 700; margin-bottom: 8px; letter-spacing: .06em; }
        .popup-row     { display: flex; justify-content: space-between; gap: 14px; font-size: 10px; color: #7db8d8; padding: 2px 0; }
        .popup-row span:last-child { color: #e8f4fd; }
        .popup-summary { font-size: 9px; color: #4d7f99; margin-top: 6px; line-height: 1.4; }
        .tag-low       { color: #00ff9d !important; }
        .tag-moderate  { color: #ffb830 !important; }
        .tag-high      { color: #ff8040 !important; }
        .tag-severe    { color: #ff4060 !important; }
      `}</style>
    </div>
  )
}