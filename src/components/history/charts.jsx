import { useState, useRef } from 'react'

// Fixed colour per region (identity follows the entity, never its rank).
// Validated as a set: dataviz reference palette slots 1-6, dark-surface steps.
export const REGION_COLORS = {
  chest: '#3987e5',
  back: '#d95926',
  shoulders: '#199e70',
  arms: '#c98500',
  legs: '#d55181',
  core: '#008300',
  other: '#5c5c61'
}

const INK = '#f5f5f7'
const ACCENT = 'var(--accent)'
const MUTED = '#8e8e93'
const GRID = 'rgba(255,255,255,0.08)'

/** Donut with a 2px surface gap between segments and the total in the hole. */
export function Donut({ data, size = 168, thickness = 26, centerLabel }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const gap = data.length > 1 ? 2 : 0
  let offset = 0
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={data.map(d => `${d.label} ${d.value}`).join(', ')}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {data.map(d => {
          const len = (d.value / total) * c
          const seg = (
            <circle key={d.key} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={d.color} strokeWidth={thickness}
              strokeDasharray={`${Math.max(0, len - gap)} ${c}`} strokeDashoffset={-offset} />
          )
          offset += len
          return seg
        })}
      </g>
      <text x="50%" y="48%" textAnchor="middle" fontSize="26" fontWeight="700" fill={INK}>{total}</text>
      <text x="50%" y="62%" textAnchor="middle" fontSize="11" fill={MUTED}>{centerLabel}</text>
    </svg>
  )
}

/** Horizontal bars with value labels; single hue. */
export function BarList({ data, valueSuffix = '' }) {
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div className="space-y-2">
      {data.map(d => (
        <div key={d.key}>
          <div className="flex justify-between text-sm mb-1">
            <span className="truncate pr-2">{d.label}</span>
            <span className="tabular-nums text-secondary">{d.value}{valueSuffix}</span>
          </div>
          <div className="h-2 rounded-full bg-white/[.1] overflow-hidden">
            <div className="h-full rounded-full bg-accent" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1 }
  const raw = (max - min) / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw)
  const lo = Math.floor(min / step) * step
  const hi = Math.ceil(max / step) * step
  const ticks = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Number(v.toFixed(6)))
  return ticks
}

const fmtDate = t => new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })

/**
 * Single-series line chart with a tap/hover crosshair.
 * @param {{ t: number, y: number }[]} points
 * @param {(p) => string} format - tooltip text for a point
 */
export function LineChart({ points, format, zeroBased = false, height = 180 }) {
  const [hover, setHover] = useState(null)
  const svgRef = useRef(null)
  const W = 340
  const pad = { l: 40, r: 10, t: 12, b: 24 }
  if (points.length === 0) return null

  const ys = points.map(p => p.y)
  const ticks = niceTicks(zeroBased ? 0 : Math.min(...ys), Math.max(...ys))
  const y0 = ticks[0], y1 = ticks[ticks.length - 1]
  const t0 = points[0].t, t1 = points[points.length - 1].t
  const x = t => pad.l + (t1 === t0 ? (W - pad.l - pad.r) / 2 : ((t - t0) / (t1 - t0)) * (W - pad.l - pad.r))
  const y = v => pad.t + (1 - (v - y0) / (y1 - y0)) * (height - pad.t - pad.b)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ')

  function onPointer(e) {
    const box = svgRef.current.getBoundingClientRect()
    const px = ((e.clientX - box.left) / box.width) * W
    let best = 0
    points.forEach((p, i) => { if (Math.abs(x(p.t) - px) < Math.abs(x(points[best].t) - px)) best = i })
    setHover(best)
  }

  const h = hover != null ? points[hover] : points[points.length - 1]
  return (
    <div>
      <div className="text-sm h-5 mb-1">
        <span className="font-semibold">{format(h)}</span>
        <span className="text-secondary"> · {fmtDate(h.t)}</span>
      </div>
      <svg ref={svgRef} viewBox={`0 0 ${W} ${height}`} className="w-full touch-none select-none"
        onPointerMove={onPointer} onPointerDown={onPointer} onPointerLeave={() => setHover(null)}>
        {ticks.map(v => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke={GRID} strokeWidth="1" />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill={MUTED}>
              {v >= 1000 ? `${Number((v / 1000).toFixed(1))}k` : v}
            </text>
          </g>
        ))}
        <text x={pad.l} y={height - 6} fontSize="10" fill={MUTED}>{fmtDate(t0)}</text>
        <text x={W - pad.r} y={height - 6} textAnchor="end" fontSize="10" fill={MUTED}>{fmtDate(t1)}</text>
        <path d={path} fill="none" stroke={ACCENT} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.length <= 24 && points.map((p, i) => (
          <circle key={i} cx={x(p.t)} cy={y(p.y)} r="3" fill={ACCENT} stroke="#121214" strokeWidth="2" />
        ))}
        <line x1={x(h.t)} x2={x(h.t)} y1={pad.t} y2={height - pad.b} stroke={MUTED} strokeWidth="1" strokeDasharray="3 3" />
        <circle cx={x(h.t)} cy={y(h.y)} r="5" fill={ACCENT} stroke="#121214" strokeWidth="2" />
      </svg>
    </div>
  )
}
