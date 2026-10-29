import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import WorkoutEntry from './WorkoutEntry'
import StatsView from './StatsView'
import { BackIcon, IconButton } from '../icons'

const VIEWS = [
  { id: 'workouts', label: 'Workouts' },
  { id: 'stats', label: 'Stats' }
]

export default function HistoryTab({ onBack }) {
  const workouts = useLiveQuery(() => db.workoutLog.orderBy('date').reverse().toArray())
  const [view, setView] = useState('workouts')

  return (
    <div className="px-4" style={{ paddingTop: '1.5rem' }}>
      <div className="flex items-center gap-2 mb-4">
        <IconButton label="Back" onClick={() => onBack?.()}><BackIcon /></IconButton>
        <h1 className="text-2xl font-bold">History</h1>
      </div>

      <div className="glass-segmented mb-4">
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            aria-pressed={view === v.id}
            className={`flex-1 py-2 text-sm transition-colors ${
              view === v.id ? 'font-semibold' : 'text-secondary'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {!workouts ? (
        <p className="text-secondary">Loading…</p>
      ) : workouts.length === 0 ? (
        <p className="text-secondary">No workouts yet. Finish a workout to see it here.</p>
      ) : view === 'workouts' ? (
        <div className="pb-10 space-y-3">
          {workouts.map(workout => (
            <WorkoutEntry key={workout.id} entry={workout} />
          ))}
        </div>
      ) : (
        <StatsView workouts={workouts} />
      )}
    </div>
  )
}
