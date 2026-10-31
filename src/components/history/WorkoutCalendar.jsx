import { useState } from 'react'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

/** Local calendar day key, e.g. "2026-10-31". */
export function dayKey(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function Chevron({ dir }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === 'left' ? 'M15 18l-6-6 6-6' : 'M9 6l6 6-6 6'} />
    </svg>
  )
}

/**
 * Month grid (Mon–Sun) marking training days. Tapping a training day selects
 * it; tapping it again clears the selection.
 */
export default function WorkoutCalendar({ workouts, selectedDay, onSelect }) {
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const trained = new Map()
  for (const w of workouts) {
    const k = dayKey(w.date)
    trained.set(k, (trained.get(k) || 0) + 1)
  }

  const year = month.getFullYear()
  const m = month.getMonth()
  const leading = (new Date(year, m, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, m + 1, 0).getDate()
  const cells = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, m, i + 1))
  ]
  const todayKey = dayKey(new Date())
  const monthCount = cells.filter(d => d && trained.has(dayKey(d))).length
  const isCurrentMonth = year === new Date().getFullYear() && m === new Date().getMonth()

  return (
    <div className="pb-4 mb-2 border-b border-white/[.06]">
      <div className="flex items-center mb-3">
        <button
          onClick={() => setMonth(new Date(year, m - 1, 1))}
          aria-label="Previous month"
          className="w-9 h-9 flex items-center justify-center rounded-full text-secondary hover:bg-white/[.06]"
        >
          <Chevron dir="left" />
        </button>
        <div className="flex-1 text-center">
          <div className="text-sm font-semibold">
            {month.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}
          </div>
          <div className="text-xs text-secondary">
            {monthCount} {monthCount === 1 ? 'workout day' : 'workout days'}
          </div>
        </div>
        <button
          onClick={() => setMonth(new Date(year, m + 1, 1))}
          disabled={isCurrentMonth}
          aria-label="Next month"
          className="w-9 h-9 flex items-center justify-center rounded-full text-secondary hover:bg-white/[.06] disabled:opacity-30"
        >
          <Chevron dir="right" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-xs text-secondary mb-1">
        {WEEKDAYS.map((d, i) => <div key={i} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />
          const k = dayKey(d)
          const hasWorkout = trained.has(k)
          const isSelected = k === selectedDay
          const isToday = k === todayKey
          return (
            <button
              key={i}
              disabled={!hasWorkout}
              onClick={() => onSelect(isSelected ? null : k)}
              aria-pressed={isSelected}
              aria-label={`${d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' })}${hasWorkout ? ', workout' : ''}`}
              className={`mx-auto w-10 h-10 flex flex-col items-center justify-center rounded-full text-sm tabular-nums transition-colors ${
                isSelected
                  ? 'bg-white text-[#0a0a0c] font-semibold'
                  : hasWorkout
                    ? 'font-semibold hover:bg-white/[.08]'
                    : 'text-secondary/60'
              } ${isToday && !isSelected ? 'ring-1 ring-white/30' : ''}`}
            >
              <span>{d.getDate()}</span>
              <span
                className={`w-1 h-1 rounded-full ${hasWorkout ? (isSelected ? 'bg-[#0a0a0c]' : 'bg-white') : 'bg-transparent'}`}
                aria-hidden="true"
              />
            </button>
          )
        })}
      </div>
    </div>
  )
}
