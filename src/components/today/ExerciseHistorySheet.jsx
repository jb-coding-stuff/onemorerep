import { LineChart } from '../history/charts'

const fmtKg = w => `${Number((Number(w) || 0).toFixed(2))}`
const fmtDate = d => new Date(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })

export function avgRpe(sets) {
  const rpes = sets.map(s => s.rpe).filter(r => r != null)
  return rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null
}

export function formatSets(sets) {
  return sets.map(s => `${fmtKg(s.weight)}×${s.reps}`).join(' · ')
}

/** Bottom sheet with an exercise's recent sessions and its top-set trend. */
export default function ExerciseHistorySheet({ name, sessions, onClose }) {
  const trend = [...sessions]
    .reverse()
    .map(s => {
      const top = s.sets.reduce((b, x) => (x.weight > b.weight || (x.weight === b.weight && x.reps > b.reps) ? x : b))
      return { t: new Date(s.date).getTime(), y: top.weight, reps: top.reps }
    })

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div
        className="glass-float fixed bottom-0 left-0 right-0 rounded-t-3xl z-50 p-5 animate-slide-up max-h-[80vh] overflow-y-auto"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
        role="dialog"
        aria-label={`${name} history`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{name}</h2>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 flex items-center justify-center rounded-full text-secondary hover:bg-white/[.06]">
            ✕
          </button>
        </div>

        {trend.length >= 2 && (
          <div className="mb-5">
            <LineChart
              height={140}
              points={trend}
              format={p => `${fmtKg(p.y)} kg × ${p.reps}`}
            />
          </div>
        )}

        <ul className="text-sm">
          {sessions.map(s => {
            const rpe = avgRpe(s.sets)
            return (
              <li key={s.date} className="flex gap-4 py-3 border-b border-white/[.06] last:border-b-0">
                <span className="w-16 shrink-0 text-secondary">{fmtDate(s.date)}</span>
                <span className="flex-1 tabular-nums">{formatSets(s.sets)}</span>
                {rpe != null && <span className="text-secondary tabular-nums">RPE {rpe.toFixed(1)}</span>}
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}
