import { useState } from 'react'
import { completedSets } from '../../utils/stats'

function formatKg(w) {
  return `${Number((Number(w) || 0).toFixed(2))} kg`
}

export default function WorkoutEntry({ entry }) {
  const [expanded, setExpanded] = useState(false)

  const date = new Date(entry.date)
  const dateStr = date.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const minutes = Math.round((entry.durationSeconds || 0) / 60)
  const exercises = (entry.exercises || [])
    .map(ex => ({ ...ex, done: completedSets(ex) }))
    .filter(ex => ex.done.length > 0)
  const totalSets = exercises.reduce((s, ex) => s + ex.done.length, 0)

  return (
    <div className="border-b border-white/[.06]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left py-4 flex items-center gap-3"
        aria-expanded={expanded}
      >
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate">{entry.sessionLabel}</h3>
          <p className="text-sm text-secondary mt-0.5">
            {dateStr} · {exercises.length} {exercises.length === 1 ? 'exercise' : 'exercises'} · {totalSets} {totalSets === 1 ? 'set' : 'sets'}
          </p>
        </div>
        <span className="text-sm tabular-nums text-secondary">{minutes} min</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          className={`transition-transform ${expanded ? 'rotate-90' : ''}`} aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>

      {expanded && (
        <div className="mb-5 ml-1 pl-4 border-l border-white/10 space-y-4">
          {exercises.map((exercise, idx) => (
            <div key={idx}>
              <div className="font-medium text-sm mb-2">
                {exercise.name}
                {exercise.wasSwapped && <span className="text-secondary font-normal"> · swapped</span>}
              </div>
              <div className="space-y-1">
                {exercise.done.map((s, i) => (
                  <div key={i} className="flex text-sm tabular-nums">
                    <span className="w-14 text-secondary">Set {s.setNumber ?? i + 1}</span>
                    <span className="flex-1">{formatKg(s.weight)} × {s.actualReps}</span>
                    {s.rpe != null && <span className="text-secondary">RPE {s.rpe}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
