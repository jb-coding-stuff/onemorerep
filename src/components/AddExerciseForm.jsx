import { useState } from 'react'
import { createCustomExercise, MUSCLE_GROUPS } from '../db/exerciseCatalog'

const TYPES = [
  { id: 'compound_upper', label: 'Compound upper' },
  { id: 'compound_lower', label: 'Compound lower' },
  { id: 'isolation', label: 'Isolation' }
]

const field = 'w-full px-3 py-2.5 bg-white/[.06] border border-white/10 rounded-xl text-sm'
const cap = s => s.charAt(0).toUpperCase() + s.slice(1)

/** Adds an exercise to the library; calls onCreated with the stored entry. */
export default function AddExerciseForm({ defaults = {}, submitLabel = 'Add exercise', onCreated, onCancel }) {
  const [name, setName] = useState('')
  const [muscleGroup, setMuscleGroup] = useState(
    MUSCLE_GROUPS.includes(defaults.muscleGroup) ? defaults.muscleGroup : 'chest'
  )
  const [movementType, setMovementType] = useState(defaults.movementType || 'isolation')
  const [equipment, setEquipment] = useState('')
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const entry = await createCustomExercise({ name, muscleGroup, movementType, equipment })
      onCreated(entry)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        autoFocus
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Exercise name, e.g. Incline DB Press"
        aria-label="Exercise name"
        className={field}
      />
      <div className="grid grid-cols-2 gap-2">
        <select value={muscleGroup} onChange={e => setMuscleGroup(e.target.value)} aria-label="Muscle group" className={field}>
          {MUSCLE_GROUPS.map(m => <option key={m} value={m}>{cap(m)}</option>)}
        </select>
        <select value={movementType} onChange={e => setMovementType(e.target.value)} aria-label="Type" className={field}>
          {TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <input
        value={equipment}
        onChange={e => setEquipment(e.target.value)}
        placeholder="Equipment (optional), e.g. Cable"
        aria-label="Equipment"
        className={field}
      />
      {error && <p className="notice text-xs text-red-400">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={!name.trim() || saving} className="btn-primary flex-1 py-2.5 text-sm font-medium disabled:opacity-50">
          {saving ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-glass flex-1 py-2.5 text-sm">
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
