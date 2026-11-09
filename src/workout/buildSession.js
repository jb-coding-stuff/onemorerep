import { getProgressionStates, initializeProgressionState } from '../db/progression'
import { getRecentSessionsForExercise } from '../db/workoutLog'

/**
 * The sets of the last time this exact exercise was done: [{ weight, reps }].
 * Sessions where only a substitute was done don't count. Empty if never done.
 */
export async function getLastSets(exerciseId, name) {
  const sessions = await getRecentSessionsForExercise(exerciseId, name, { limit: 10 })
  const last = sessions.find(s => s.sets.length && !s.substitute)
  return last ? last.sets.map(s => ({ weight: s.weight, reps: s.reps })) : []
}

/**
 * Open sets for an exercise, each prefilled with what was done last time at
 * the same set number (the last set's values for any extra sets). Without
 * history the plan's weight and reps are used. Nothing is adjusted upward.
 */
export function buildSets(count, targetReps, fallbackWeight, lastSets = []) {
  return Array.from({ length: count }, (_, i) => {
    const prev = lastSets[i] ?? lastSets[lastSets.length - 1]
    return {
      setNumber: i + 1,
      targetReps,
      lastReps: prev ? prev.reps : null,
      actualReps: null,
      weight: prev ? prev.weight : fallbackWeight,
      rpe: null,
      completed: false
    }
  })
}

/**
 * The exercises of a plan session, ready to log: every set open, weight and
 * reps taken from the last time each exercise was done.
 */
export async function buildSessionExercises(session) {
  for (const exercise of session.exercises) {
    await initializeProgressionState(exercise.exerciseId, exercise)
  }
  const progressionMap = await getProgressionStates(session.exercises.map(e => e.exerciseId))

  return Promise.all(
    session.exercises.map(async exercise => {
      const progression = progressionMap[exercise.exerciseId]
      const lastSets = await getLastSets(exercise.exerciseId, exercise.name)
      const fallbackWeight = progression?.currentWeight || exercise.startingWeight || 0

      return {
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        movementType: exercise.movementType,
        targetReps: exercise.targetReps,
        startingWeight: lastSets[0]?.weight ?? fallbackWeight,
        sets: buildSets(exercise.sets, exercise.targetReps, fallbackWeight, lastSets),
        setsCompleted: 0,
        alternatives: exercise.alternatives || []
      }
    })
  )
}
