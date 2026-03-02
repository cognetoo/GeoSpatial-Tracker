
import { LiveStats } from '../types'
import { WsStatus } from '../hooks/useTracker'

interface Props {
  stats:    LiveStats | null
  wsStatus: WsStatus
}

// ── Reusable small card ────────────────────────────────────────────────────
function StatCard({
  label, value, color,
}: {
  label: string; value: number | string; color: string
}) {
  return (
    <div style={{
      background: 'rgba(9,22,40,0.88)',
      border: `1px solid ${color}22`,
      borderLeft: `3px solid ${color}`,
      borderRadius: 4,
      padding: '10px 14px',
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <span style={{
        fontSize: 9, color: '#7db8d8',
        letterSpacing: '0.12em', textTransform: 'uppercase',
        fontFamily: 'Space Mono, monospace',
      }}>{label}</span>
      <span style={{
        fontSize: 22, fontWeight: 700, color,
        fontFamily: 'Rajdhani, sans-serif', lineHeight: 1,
      }}>{typeof value === 'number' ? value.toLocaleString() : value}</span>
    </div>
  )
}

// ── Congestion bar ─────────────────────────────────────────────────────────
const CONGESTION_COLORS: Record<string, string> = {
  Low: '#00ff9d', Moderate: '#ffb830', High: '#ff8040', Severe: '#ff4060',
}

function CongestionBar({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, fontFamily: 'Space Mono, monospace' }}>
      <span style={{ width: 72, color: CONGESTION_COLORS[label] }}>{label}</span>
      <div style={{ flex: 1, height: 4, background: '#0d1f38', borderRadius: 2 }}>
        <div style={{
          width: `${Math.min(count * 34, 100)}%`, height: '100%',
          background: CONGESTION_COLORS[label], borderRadius: 2,
          transition: 'width 0.6s ease',
        }} />
      </div>
      <span style={{ color: '#7db8d8', width: 16, textAlign: 'right' }}>{count}</span>
    </div>
  )
}

// ── Main panel ─────────────────────────────────────────────────────────────
export function StatsPanel({ stats, wsStatus }: Props) {
  const statusColor =
    wsStatus === 'open'       ? '#00ff9d' :
    wsStatus === 'connecting' ? '#ffb830' : '#ff4060'

  const statusLabel =
    wsStatus === 'open'       ? 'LIVE' :
    wsStatus === 'connecting' ? 'CONNECTING' : 'DISCONNECTED'

  const timeStr = stats?.lastUpdate
    ? new Date(stats.lastUpdate).toLocaleTimeString([], { hour12: false })
    : '—'

  const roadVehicles = [
    { label: '🚗 Cars',        value: stats?.cars        ?? 0, color: '#00d4ff' },
    { label: '🚌 Buses',       value: stats?.buses       ?? 0, color: '#0099ff' },
    { label: '🚶 Pedestrians', value: stats?.pedestrians ?? 0, color: '#ff9f1c' },
  ]

  return (
    <div style={{
      position: 'absolute', top: 16, left: 16,
      width: 248, display: 'flex', flexDirection: 'column', gap: 8, zIndex: 10,
    }}>

      {/* ── Header ─────────────────────────────────────────────────── */}
      <div style={{
        background: 'rgba(5,12,24,0.95)',
        border: '1px solid #1a3a5c', borderRadius: 6,
        padding: '12px 14px', backdropFilter: 'blur(8px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{
            fontSize: 15, fontWeight: 700, color: '#e8f4fd',
            fontFamily: 'Rajdhani, sans-serif', letterSpacing: '0.06em',
          }}>
            🛰 GLOBAL TRACKER
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: statusColor, boxShadow: `0 0 7px ${statusColor}`,
              animation: wsStatus === 'open' ? 'pulse 2s infinite' : 'none',
            }} />
            <span style={{
              fontSize: 9, color: statusColor,
              fontFamily: 'Space Mono, monospace', letterSpacing: '0.1em',
            }}>{statusLabel}</span>
          </div>
        </div>
        <div style={{ fontSize: 9, color: '#3d6a8a', fontFamily: 'Space Mono, monospace' }}>
          Updated: {timeStr}
        </div>
      </div>

      {/* ── Cameras being watched ──────────────────────────────────── */}
      <div style={{
        background: 'rgba(9,22,40,0.88)',
        border: '1px solid #1a3a5c', borderRadius: 4, padding: '10px 14px',
      }}>
        <div style={{ fontSize: 9, color: '#7db8d8', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'Space Mono, monospace', marginBottom: 6 }}>
          📷 Live Cameras
        </div>
        {[
          { name: 'NYC Times Square',  color: '#ff9f1c' },
          { name: 'London Abbey Road', color: '#ff9f1c' },
          { name: 'Venice Beach, LA',  color: '#ff9f1c' },
        ].map(c => (
          <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: c.color, boxShadow: `0 0 5px ${c.color}` }} />
            <span style={{ fontSize: 10, color: '#e8f4fd', fontFamily: 'Space Mono, monospace' }}>{c.name}</span>
          </div>
        ))}
      </div>

      {/* ── Aircraft count ────────────────────────────────────────── */}
      <StatCard label="✈ Aircraft (OpenSky)" value={stats?.aircraft ?? 0} color="#00ff9d" />

      {/* ── Road objects ──────────────────────────────────────────── */}
      <div style={{
        background: 'rgba(9,22,40,0.88)',
        border: '1px solid #00d4ff22', borderRadius: 4, padding: '10px 14px',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <span style={{ fontSize: 9, color: '#7db8d8', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'Space Mono, monospace', marginBottom: 2 }}>
          🔍 Road Objects (Gemini)
        </span>
        {roadVehicles.map(r => (
          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontFamily: 'Rajdhani, sans-serif' }}>
            <span style={{ color: '#7db8d8' }}>{r.label}</span>
            <span style={{ color: r.color, fontWeight: 600 }}>{r.value.toLocaleString()}</span>
          </div>
        ))}
      </div>

      {/* ── Congestion ────────────────────────────────────────────── */}
      <div style={{
        background: 'rgba(9,22,40,0.88)',
        border: '1px solid #1a3a5c', borderRadius: 4, padding: '10px 14px',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <span style={{ fontSize: 9, color: '#7db8d8', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'Space Mono, monospace', marginBottom: 2 }}>
          Congestion
        </span>
        {(['Low', 'Moderate', 'High', 'Severe'] as const).map(lvl => (
          <CongestionBar key={lvl} label={lvl} count={stats?.congestionBreakdown[lvl] ?? 0} />
        ))}
      </div>

      {/* ── Legend ────────────────────────────────────────────────── */}
      <div style={{
        background: 'rgba(9,22,40,0.88)',
        border: '1px solid #1a3a5c', borderRadius: 4, padding: '10px 14px',
        display: 'flex', flexDirection: 'column', gap: 5,
      }}>
        <span style={{ fontSize: 9, color: '#7db8d8', letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'Space Mono, monospace', marginBottom: 2 }}>
          Legend
        </span>
        {[
          { color: '#00ff9d', label: 'Aircraft (OpenSky)' },
          { color: '#00d4ff', label: 'Cars (Gemini)' },
          { color: '#0099ff', label: 'Buses (Gemini)' },
          { color: '#ff9f1c', label: 'Pedestrians (Gemini)' },
        ].map(l => (
          <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, fontFamily: 'Space Mono, monospace', color: '#7db8d8' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: l.color, boxShadow: `0 0 5px ${l.color}`, flexShrink: 0 }} />
            {l.label}
          </div>
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.35; }
        }
      `}</style>
    </div>
  )
}
