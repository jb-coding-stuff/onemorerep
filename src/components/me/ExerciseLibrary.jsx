import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { isCustomExercise, renameCustomExercise, deleteCustomExercise, MUSCLE_GROUPS } from '../../db/exerciseCatalog'
import { normalizeName } from '../../program/schema'
import AddExerciseForm from '../AddExerciseForm'
import { BackIcon, IconButton } from '../icons'

const cap = s => s.charAt(0).toUpperCase() + s.slice(1)
const TYPE_LABELS = { compound_upper: 'Compound upper', compound_lower: 'Compound lower', isolation: 'Isolation' }

function ExerciseRow({ entry }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(entry.displayName)
  const custom = isCustomExercise(entry)

  if (editing) {
    return (
      <li className="py-3 border-b border-white/[.06] flex gap-2">
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          aria-label="New name"
          className="flex-1 min-w-0 px-3 py-2 bg-white/[.06] border border-white/10 rounded-xl text-sm"
        />
        <button
          onClick={async () => { await renameCustomExercise(entry.canonicalId, name); setEditing(false) }}
          className="text-sm px-2"
        >
          Save
        </button>
        <button
          onClick={async () => {
            if (confirm(`Delete "${entry.displayName}"? Logged workouts keep their sets.`)) {
              await deleteCustomExercise(entry.canonicalId)
            }
          }}
          className="text-sm px-2 text-red-400"
        >
          Delete
        </button>
      </li>
    )
  }

  return (
    <li className="py-3 border-b border-white/[.06] last:border-b-0 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{entry.displayName}</div>
        <div className="text-xs text-secondary truncate">
          {TYPE_LABELS[entry.movementType] || entry.movementType}
          {entry.equipment && ` · ${entry.equipment}`}
          {custom && ' · yours'}
        </div>
      </div>
      {custom && (
        <button onClick={() => setEditing(true)} className="text-xs text-secondary hover:text-[color:var(--ink)] px-2 py-1">
          Edit
        </button>
      )}
    </li>
  )
}

/** All exercises the app knows, grouped by muscle group, plus adding new ones. */
export default function ExerciseLibrary({ onBack }) {
  const catalog = useLiveQuery(() => db.exerciseCatalog.toArray(), [], [])
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)

  const q = normalizeName(query)
  const matches = catalog
    .filter(e => !q || normalizeName(e.displayName).includes(q) || (e.aliases || []).some(a => normalizeName(a).includes(q)))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
  const groups = MUSCLE_GROUPS
    .map(g => ({ g, items: matches.filter(e => e.muscleGroup === g) }))
    .concat([{ g: 'other', items: matches.filter(e => !MUSCLE_GROUPS.includes(e.muscleGroup)) }])
    .filter(x => x.items.length)

  return (
    <div className="pb-10 space-y-4">
      <div className="flex items-center gap-2">
        <IconButton label="Back" onClick={onBack}><BackIcon /></IconButton>
        <h1 className="text-2xl font-bold flex-1">Exercises</h1>
        {!adding && (
          <button onClick={() => setAdding(true)} className="text-sm font-medium px-3 py-2 rounded-full hover:bg-white/[.06]">
            + Add
          </button>
        )}
      </div>

      {adding && (
        <div className="notice">
          <AddExerciseForm onCreated={() => setAdding(false)} onCancel={() => setAdding(false)} />
        </div>
      )}

      <input
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={`Search ${catalog.length} exercises`}
        aria-label="Search exercises"
        className="w-full px-4 py-2.5 bg-white/[.06] border border-white/10 rounded-full text-sm"
      />

      {groups.length === 0 ? (
        <p className="text-sm text-secondary">No exercises match “{query}”.</p>
      ) : groups.map(({ g, items }) => (
        <section key={g}>
          <h2 className="text-xs text-secondary uppercase tracking-wide mt-4 mb-1">{g === 'other' ? 'Other' : cap(g)}</h2>
          <ul>{items.map(e => <ExerciseRow key={e.canonicalId} entry={e} />)}</ul>
        </section>
      ))}
    </div>
  )
}
