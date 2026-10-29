import { useState, useEffect } from 'react'
import { useSettings } from '../../contexts/SettingsContext'
import { getProgressionStates } from '../../db/progression'
import { initializeProgressionState } from '../../db/progression'
import { saveCustomExercise } from '../../db/exerciseLibrary'

export default function SwapDrawer({ exercise, onSelect, onClose, onSaveCustom }) {
  const { displayWeight } = useSettings()
  const [progressionMap, setProgressionMap] = useState({})
  const [showCustomForm, setShowCustomForm] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customMovementType, setCustomMovementType] = useState('isolation')
  const [customWeight, setCustomWeight] = useState(exercise.startingWeight || 0)

  // Load progression states for alternatives
  useEffect(() => {
    async function loadProgressions() {
      if (!exercise.alternatives?.length) return
      const altIds = exercise.alternatives.map(alt => alt.exerciseId)
      const states = await getProgressionStates(altIds)
      setProgressionMap(states)
    }
    loadProgressions()
  }, [exercise])

  async function handleSaveCustom() {
    if (!customName.trim()) return

    const customId = `custom_${Date.now()}`
    const newAlt = {
      exerciseId: customId,
      name: customName,
      parentExerciseId: exercise.exerciseId,
      movementType: customMovementType,
      muscleGroup: exercise.muscleGroup,
      startingWeight: customWeight,
      isCustom: true
    }

    // Save to library
    await saveCustomExercise(newAlt)

    // Initialize progression state
    await initializeProgressionState(customId, {
      startingWeight: customWeight,
      targetReps: exercise.targetReps,
      muscleGroup: exercise.muscleGroup,
      movementType: customMovementType
    })

    // Notify parent and trigger swap
    onSaveCustom(newAlt)

    // Reset form
    setShowCustomForm(false)
    setCustomName('')
    setCustomMovementType('isolation')
    setCustomWeight(exercise.startingWeight || 0)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="glass-float fixed bottom-0 left-0 right-0 rounded-t-3xl z-50 p-5 animate-slide-up max-h-[80vh] overflow-y-auto">
        <h3 className="font-semibold mb-4">Swap Exercise</h3>

        {/* Built-in alternatives */}
        <div className="space-y-2 mb-4">
          {exercise.alternatives?.map((alt) => {
            const altProgression = progressionMap[alt.exerciseId]
            const displayWt = altProgression?.currentWeight ?? exercise.startingWeight
            return (
              <button
                key={alt.exerciseId}
                onClick={() => {
                  onSelect({
                    ...exercise,
                    exerciseId: alt.exerciseId,
                    name: alt.name,
                    movementType: exercise.movementType
                  })
                }}
                className="glass-inset w-full p-3 text-left hover:bg-white/[.08] transition-colors"
              >
                <div className="font-medium">{alt.name}</div>
                <div className="text-sm text-secondary">
                  {exercise.targetReps} reps @ {displayWeight(displayWt)}
                </div>
              </button>
            )
          })}
        </div>

        {/* Custom exercise creation */}
        {!showCustomForm ? (
          <button
            onClick={() => setShowCustomForm(true)}
            className="btn-glass w-full p-3 text-left transition-colors font-medium mb-4"
          >
            + Create Alternative
          </button>
        ) : (
          <div className="glass-inset p-3 mb-4 space-y-3">
            <div>
              <label className="text-sm font-medium block mb-1">Exercise Name</label>
              <input
                type="text"
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                placeholder="e.g., Dumbbell Bench Press"
                className="w-full px-3 py-2 bg-white/[.06] border border-white/10 rounded-xl text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">Type</label>
              <select
                value={customMovementType}
                onChange={e => setCustomMovementType(e.target.value)}
                className="w-full px-3 py-2 bg-white/[.06] border border-white/10 rounded-xl text-sm"
              >
                <option value="compound_upper">Compound Upper</option>
                <option value="compound_lower">Compound Lower</option>
                <option value="isolation">Isolation</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium block mb-1">Starting Weight (kg)</label>
              <input
                type="number"
                value={customWeight}
                onChange={e => setCustomWeight(parseFloat(e.target.value) || 0)}
                step="0.5"
                className="w-full px-3 py-2 bg-white/[.06] border border-white/10 rounded-xl text-sm"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleSaveCustom}
                disabled={!customName.trim()}
                className="btn-primary flex-1 py-2 font-medium text-sm disabled:opacity-50 transition-colors"
              >
                Save & Swap
              </button>
              <button
                onClick={() => setShowCustomForm(false)}
                className="btn-glass flex-1 py-2 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          className="btn-glass w-full py-2 text-secondary font-medium transition-colors"
        >
          Close
        </button>
      </div>
    </>
  )
}
