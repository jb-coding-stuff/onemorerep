import { useState } from 'react'
import { useSettings } from '../../contexts/SettingsContext'
import { logWorkout } from '../../db/workoutLog'
import { syncLiveWorkout, buildLogEntry } from '../../db/liveWorkout'
import { syncProgression } from '../../db/progressionSync'
import { uploadWorkout } from '../../db/workoutSync'

export default function PostWorkoutSummary({ workout, onDone, onCancel }) {
  const { exercises } = workout
  const [saving, setSaving] = useState(false)
  const { displayWeight } = useSettings()

  const durationSeconds = buildLogEntry(workout).durationSeconds
  const minutes = Math.floor(durationSeconds / 60)
  const logged = exercises.filter(ex => !ex.isBonus && ex.sets.some(s => s.completed))

  async function handleSave() {
    setSaving(true)
    try {
      // Sets were already logged live; settle any pending write and keep its id.
      const liveId = await syncLiveWorkout(workout)
      const id = liveId ?? await logWorkout(buildLogEntry(workout))

      // Progression was updated with each logged set; History decides the
      // next suggested session.

      // Sync to Supabase in background (fire and forget)
      uploadWorkout(id).catch(err => console.error('Sync: workout upload failed', err))
      syncProgression()

      // Done
      onDone()
    } catch (err) {
      console.error('Failed to save workout:', err)
      alert('Error saving workout')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sheet-backdrop fixed inset-0 z-50 flex items-end">
      <div className="glass-float glass-sheet w-full rounded-t-3xl p-6 pb-10 max-h-[80vh] overflow-y-auto animate-slide-up">
        <h2 className="text-2xl font-bold mb-6">Workout Complete!</h2>

        {/* Duration */}
        <div className="mb-6 p-4 glass-inset">
          <div className="text-sm text-secondary">Duration</div>
          <div className="text-2xl font-bold">{minutes} min</div>
        </div>

        {/* Exercise Summary */}
        <div className="mb-6 space-y-3">
          <h3 className="font-semibold">Exercises</h3>
          {logged.map(ex => {
            const done = ex.sets.filter(s => s.completed)
            return (
              <div key={ex.exerciseId} className="p-3 glass-inset">
                <div className="font-medium">{ex.name}</div>
                <div className="text-sm text-secondary mt-1">
                  {done.map(s => `${s.actualReps}×${displayWeight(s.weight)}`).join(' · ')}
                  {done.length < ex.sets.length && ` (${done.length}/${ex.sets.length} sets)`}
                </div>
                <div className="text-xs text-secondary mt-1">
                  Avg RPE: {(done.reduce((sum, s) => sum + (s.rpe || 0), 0) / done.length).toFixed(1)}
                </div>
              </div>
            )
          })}
        </div>

        {/* Bonus rounds */}
        {exercises.filter(ex => ex.isBonus).length > 0 && (
          <div className="mb-6 space-y-3">
            <h3 className="font-semibold">Bonus Rounds</h3>
            {exercises
              .filter(ex => ex.isBonus)
              .map((ex, idx) => (
                <div key={idx} className="p-3 glass-inset opacity-75">
                  <div className="font-medium text-sm">{ex.name}</div>
                </div>
              ))}
          </div>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-accent w-full py-4 font-semibold transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Workout'}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={saving}
            className="w-full py-3 mt-2 text-sm font-medium text-secondary rounded-full hover:bg-white/[.06] transition-colors"
          >
            Back to workout
          </button>
        )}
      </div>
    </div>
  )
}
