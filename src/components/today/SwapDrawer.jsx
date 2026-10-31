import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useSettings } from '../../contexts/SettingsContext'
import { db } from '../../db/db'
import { getProgressionStates, initializeProgressionState } from '../../db/progression'
import { normalizeName } from '../../program/schema'
import AddExerciseForm from '../AddExerciseForm'

const LIBRARY_LIMIT = 12

export default function SwapDrawer({ exercise, onSelect, onClose }) {
  const { displayWeight } = useSettings()
  const [progressionMap, setProgressionMap] = useState({})
  const [showForm, setShowForm] = useState(false)
  const [query, setQuery] = useState('')
  const catalog = useLiveQuery(() => db.exerciseCatalog.toArray(), [], [])

  const current = catalog.find(e => e.canonicalId === exercise.exerciseId)
  const muscleGroup = exercise.muscleGroup || current?.muscleGroup
  const altIds = new Set((exercise.alternatives || []).map(a => a.exerciseId))

  // Whole library minus this exercise and its plan alternatives; same muscle
  // group first, then alphabetical.
  const q = normalizeName(query)
  const library = catalog
    .filter(e => e.canonicalId !== exercise.exerciseId && !altIds.has(e.canonicalId))
    .filter(e => !q || normalizeName(e.displayName).includes(q) || (e.aliases || []).some(a => normalizeName(a).includes(q)))
    .sort((a, b) =>
      (b.muscleGroup === muscleGroup) - (a.muscleGroup === muscleGroup) ||
      a.displayName.localeCompare(b.displayName))
  const shown = q ? library : library.slice(0, LIBRARY_LIMIT)

  useEffect(() => {
    const ids = [...altIds, ...shown.map(e => e.canonicalId)]
    if (ids.length) getProgressionStates(ids).then(setProgressionMap)
  }, [exercise, catalog.length, query]) // eslint-disable-line react-hooks/exhaustive-deps

  function pick(id, name, movementType) {
    onSelect({ ...exercise, exerciseId: id, name, movementType: movementType || exercise.movementType })
  }

  async function handleCreated(entry) {
    await initializeProgressionState(entry.canonicalId, {
      startingWeight: exercise.startingWeight || 0,
      targetReps: exercise.targetReps,
      muscleGroup: entry.muscleGroup,
      movementType: entry.movementType
    })
    pick(entry.canonicalId, entry.displayName, entry.movementType)
  }

  const weightFor = id => progressionMap[id]?.currentWeight ?? exercise.startingWeight
  const row = 'glass-inset w-full p-3 text-left hover:bg-white/[.08] transition-colors'

  return (
    <>
      <div className="sheet-backdrop fixed inset-0 z-40" onClick={onClose} />

      <div
        className="glass-float glass-sheet fixed bottom-0 left-0 right-0 rounded-t-3xl z-50 p-5 animate-slide-up max-h-[85vh] overflow-y-auto overscroll-contain"
        style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
        role="dialog"
        aria-label="Swap exercise"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Swap {exercise.name}</h3>
          <button onClick={onClose} aria-label="Close" className="w-9 h-9 flex items-center justify-center rounded-full text-secondary hover:bg-white/[.06]">
            ✕
          </button>
        </div>

        {exercise.alternatives?.length > 0 && (
          <div className="space-y-2 mb-5">
            <div className="text-xs text-secondary uppercase tracking-wide">Plan alternatives</div>
            {exercise.alternatives.map(alt => (
              <button key={alt.exerciseId} onClick={() => pick(alt.exerciseId, alt.name)} className={row}>
                <div className="font-medium">{alt.name}</div>
                <div className="text-sm text-secondary">
                  {exercise.targetReps} reps @ {displayWeight(weightFor(alt.exerciseId))}
                </div>
              </button>
            ))}
          </div>
        )}

        {showForm ? (
          <div className="notice mb-5">
            <AddExerciseForm
              defaults={{ muscleGroup, movementType: exercise.movementType }}
              submitLabel="Add & swap"
              onCreated={handleCreated}
              onCancel={() => setShowForm(false)}
            />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-secondary uppercase tracking-wide">Your exercises</div>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={`Search ${library.length} exercises`}
              aria-label="Search exercises"
              className="w-full px-4 py-2.5 bg-white/[.06] border border-white/10 rounded-full text-sm"
            />
            {shown.map(e => (
              <button key={e.canonicalId} onClick={() => pick(e.canonicalId, e.displayName, e.movementType)} className={row}>
                <div className="font-medium">{e.displayName}</div>
                <div className="text-sm text-secondary">
                  {e.muscleGroup && e.muscleGroup !== 'general' ? `${e.muscleGroup} · ` : ''}
                  {progressionMap[e.canonicalId] ? displayWeight(progressionMap[e.canonicalId].currentWeight) : 'new'}
                </div>
              </button>
            ))}
            {!q && library.length > LIBRARY_LIMIT && (
              <p className="text-xs text-secondary text-center py-1">Search to see all {library.length}</p>
            )}
            {q && shown.length === 0 && (
              <p className="text-sm text-secondary py-2">No match for “{query}”.</p>
            )}
            <button onClick={() => setShowForm(true)} className="btn-glass w-full py-3 text-sm font-medium mt-2">
              + New exercise
            </button>
          </div>
        )}
      </div>
    </>
  )
}
