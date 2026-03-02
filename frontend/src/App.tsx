import { useState } from 'react'
import { LiveMap } from './components/LiveMap'
import { StatsPanel } from './components/StatsPanel'
import { InfoCorner } from './components/InfoCorner'
import { useTracker } from './hooks/useTracker'

export default function App() {
  const { geojson, stats, wsStatus } = useTracker()
  const [selectedCity, setSelectedCity] = useState('nyc')
  const cityIntelligence = geojson?.metadata?.city_intelligence?.[selectedCity] || null

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative', overflow: 'hidden', background: '#050c18' }}>
      <LiveMap geojson={geojson} onCitySelect={setSelectedCity} />

      <div style={{
        position: 'absolute', top: '20px', left: '20px', 
        zIndex: 2000, width: '300px', 
        display: 'flex', flexDirection: 'column',
        pointerEvents: 'none' 
      }}>
        <div style={{ pointerEvents: 'auto' }}>
          <StatsPanel stats={stats} wsStatus={wsStatus} />
        </div>
      </div>

      <InfoCorner cityId={selectedCity} data={cityIntelligence} />
      
      <div style={{
        position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(5,12,24,0.9)', border: '1px solid #1a3a5c', borderRadius: 4,
        padding: '6px 20px', fontFamily: 'monospace', fontSize: 10,
        color: '#00ff9d', zIndex: 10, backdropFilter: 'blur(6px)'
      }}>
        GEMINI 2.0 FLASH · OPENSKY NETWORK · NYC · LONDON · TOKYO · INDIA
      </div>
    </div>
  )
}