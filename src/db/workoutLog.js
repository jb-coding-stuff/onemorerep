import { db } from './db'
import { saveWorkoutLocal } from './workoutSync'

/**
 * Log a completed workout
 * @param {Object} entry - { date, sessionLabel, durationSeconds, exercises: [...] }
 * @returns {Promise<number>} - returns the id
 */
export async function logWorkout(entry) {
  return saveWorkoutLocal({ ...entry, date: entry.date || new Date().toISOString() })
}

/**
 * Get workouts (paginated, reverse chronological)
 * @param {Object} options - { limit = 50, offset = 0 }
 * @returns {Promise<Array>}
 */
export async function getWorkouts({ limit = 50, offset = 0 } = {}) {
  return db.workoutLog
    .orderBy('date')
    .reverse()
    .offset(offset)
    .limit(limit)
    .toArray()
}

/**
 * Get all workouts (for full history)
 * @returns {Promise<Array>}
 */
export async function getAllWorkouts() {
  return db.workoutLog.orderBy('date').reverse().toArray()
}

/**
 * Get a specific workout by id
 * @param {number} id
 * @returns {Promise<Object|undefined>}
 */
export async function getWorkoutById(id) {
  return db.workoutLog.get(id)
}

/**
 * Get last workout for a specific exercise
 * @param {string} exerciseId
 * @returns {Promise<Object|undefined>}
 */
export async function getLastWorkoutForExercise(exerciseId) {
  const workouts = await db.workoutLog.orderBy('date').reverse().toArray()

  for (const workout of workouts) {
    const exercise = workout.exercises?.find(ex => ex.exerciseId === exerciseId)
    if (exercise) {
      return { workout, exercise }
    }
  }

  return null
}

/**
 * Get all workouts containing a specific exercise
 * @param {string} exerciseId
 * @returns {Promise<Array>}
 */
export async function getWorkoutsForExercise(exerciseId) {
  const workouts = await getAllWorkouts()
  return workouts.filter(w =>
    w.exercises?.some(ex => ex.exerciseId === exerciseId)
  )
}

/**
 * Past sessions of an exercise, newest first, with their completed sets.
 * Matches by exercise id or name (plans may name the same movement
 * differently). `excludeDate` skips the in-progress workout, which is
 * already in the log because sets are saved as they're done.
 * @returns {Promise<{ date: string, sets: { weight, reps, rpe }[] }[]>}
 */
export async function getRecentSessionsForExercise(exerciseId, name, { excludeDate = null, limit = 5 } = {}) {
  const workouts = await db.workoutLog.orderBy('date').reverse().toArray()
  const norm = v => String(v || '').trim().toLowerCase()
  const out = []
  for (const w of workouts) {
    if (excludeDate && w.date === excludeDate) continue
    const exercises = w.exercises || []
    // The exercise itself, by id or (trimmed, case-insensitive) name. If it
    // wasn't done, what was done in its place: a substitute swapped in for it.
    let ex = exercises.find(e => e.exerciseId === exerciseId || (name && norm(e.name) === norm(name)))
    let substitute = null
    if (!ex) {
      ex = exercises.find(e => slotOf(e, exercises) === exerciseId)
      substitute = ex?.name || null
    }
    const sets = (ex?.sets || [])
      .filter(s => s.completed && (s.actualReps ?? 0) > 0)
      .map(s => ({ weight: Number(s.weight) || 0, reps: s.actualReps, rpe: s.rpe ?? null }))
    const note = ex?.note || null
    if (sets.length || note) out.push({ date: w.date, sets, note, substitute })
    if (out.length >= limit) break
  }
  return out
}

/**
 * The plan exercise a logged exercise stood in for. Older entries point at
 * the previous swap rather than the original, so follow the chain within the
 * same workout.
 */
function slotOf(entry, exercises) {
  let from = entry.swappedFrom
  for (let hops = 0; from && hops < 5; hops++) {
    const prev = exercises.find(e => e.exerciseId === from && e !== entry)
    if (!prev?.swappedFrom) break
    from = prev.swappedFrom
  }
  return from || null
}
