import { getProgressionStates, initializeProgressionState } from '../db/progression'
import { getLastWorkoutForExercise } from '../db/workoutLog'
import { computeSessionWeight } from '../utils/progressionEngine'

/**
 * The exercises of a plan session, ready to log: every set open, weights
 * taken from progression and the last time each exercise was done.
 */
export async function buildSessionExercises(session, progressionRules) {
  for (const exercise of session.exercises) {
    await initializeProgressionState(exercise.exerciseId, exercise)
  }
  const progressionMap = await getProgressionStates(session.exercises.map(e => e.exerciseId))

  return Promise.all(
    session.exercises.map(async exercise => {
      const progression = progressionMap[exercise.exerciseId]
      const lastWorkoutData = await getLastWorkoutForExercise(exercise.exerciseId)

      let sessionWeight = progression?.currentWeight || exercise.startingWeight || 0
      let weightReason = null

      if (lastWorkoutData?.exercise?.sets) {
        const { weight, reason } = computeSessionWeight(progression, {
          exercise,
          sets: lastWorkoutData.exercise.sets
        }, progressionRules)
        sessionWeight = weight
        weightReason = reason
      }

      return {
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        movementType: exercise.movementType,
        targetReps: exercise.targetReps,
        startingWeight: sessionWeight,
        sets: Array.from({ length: exercise.sets }, (_, i) => ({
          setNumber: i + 1,
          targetReps: exercise.targetReps,
          actualReps: null,
          weight: sessionWeight,
          rpe: null,
          completed: false
        })),
        setsCompleted: 0,
        weightReason,
        alternatives: exercise.alternatives || []
      }
    })
  )
}
