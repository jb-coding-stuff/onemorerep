import { useState } from 'react'
import { useSettings } from '../../contexts/SettingsContext'
import { logWorkout } from '../../db/workoutLog'
import { getAllProgressionStates } from '../../db/progression'
import { syncLiveWorkout, updateProgressionFromWorkout } from '../../db/liveWorkout'
import { db } from '../../db/db'
import { pushWorkout, pushProgressionStates } from '../../db/sync'

export default function PostWorkoutSummary({ exercises, sessionLabel, startTime, logId, onDone, onCancel }) {
  const [saving, setSaving] = useState(false)
  const { displayWeight } = useSettings()

  const durationSeconds = Math.round((Date.now() - startTime) / 1000)
  const minutes = Math.floor(durationSeconds / 60)
  const logged = exercises.filter(ex => !ex.isBonus && ex.sets.some(s => s.completed))

  async function handleSave() {
    setSaving(true)
    try {
      // Prepare workout log entry
      const workoutEntry = {
        date: new Date(startTime).toISOString(),
        sessionLabel,
        durationSeconds,
        exercises: logged.map(ex => ({
          exerciseId: ex.exerciseId,
          name: ex.name,
          sets: ex.sets.map(s => ({
            setNumber: s.setNumber,
            targetReps: s.targetReps,
            actualReps: s.actualReps,
            weight: s.weight,
            rpe: s.rpe,
            completed: s.completed
          })),
          wasSwapped: ex.wasSwapped || false,
          swappedFrom: ex.swappedFrom || null
        }))
      }

      // Sets were already logged live; settle any pending write and keep its id.
      const liveId = await syncLiveWorkout({ startTime, selectedSession: sessionLabel, exercises, logId })
      const id = liveId ?? await logWorkout(workoutEntry)
      if (liveId != null) await db.workoutLog.put({ ...workoutEntry, id })

      await updateProgressionFromWorkout(logged)

      // Save last session label
      await db.settings.put({ key: 'lastSessionLabel', value: sessionLabel })

      // Sync to Supabase in background (fire and forget)
      const savedWorkout = await db.workoutLog.get(id)
      const allProgressions = await getAllProgressionStates()
      if (savedWorkout) pushWorkout(savedWorkout)
      if (allProgressions.length) pushProgressionStates(allProgressions)

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
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
      <div className="w-full bg-white rounded-t-2xl p-6 pb-10 max-h-[80vh] overflow-y-auto animate-slide-up">
        <h2 className="text-2xl font-bold mb-6">Workout Complete!</h2>

        {/* Duration */}
        <div className="mb-6 p-4 bg-divider rounded">
          <div className="text-sm text-secondary">Duration</div>
          <div className="text-2xl font-bold">{minutes} min</div>
        </div>

        {/* Exercise Summary */}
        <div className="mb-6 space-y-3">
          <h3 className="font-semibold">Exercises</h3>
          {logged.map(ex => {
            const done = ex.sets.filter(s => s.completed)
            return (
              <div key={ex.exerciseId} className="p-3 border border-divider rounded">
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
                <div key={idx} className="p-3 border border-divider rounded opacity-75">
                  <div className="font-medium text-sm">{ex.name}</div>
                </div>
              ))}
          </div>
        )}

        {/* Save button */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-4 bg-black text-white font-semibold rounded transition-colors hover:bg-[#333333] disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Workout'}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            disabled={saving}
            className="w-full py-3 mt-2 text-sm font-medium text-secondary hover:bg-divider rounded transition-colors"
          >
            Back to workout
          </button>
        )}
      </div>
    </div>
  )
}
