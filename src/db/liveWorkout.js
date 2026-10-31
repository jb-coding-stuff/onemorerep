import { db } from './db'
import { supabase } from './supabase'
import { updateProgressionState, getAllProgressionStates } from './progression'
import { updateProgressionAfterWorkout } from '../utils/progressionEngine'
import { pushWorkout, pushProgressionStates } from './sync'

/**
 * Logging an in-progress workout as it happens, so it lands in History and
 * Supabase without the user pressing Finish. Each workout is one workoutLog
 * row (keyed by its local id, which Supabase upserts on) that grows set by set.
 */

// Writes run one at a time so two quick sets can't create two rows.
let chain = Promise.resolve()
// startTime -> workoutLog id, for writes queued before the reducer has the id.
const idsByStart = new Map()

const completedTimes = state =>
  state.exercises.flatMap(ex => ex.sets.map(s => (s.completed ? s.completedAt || 0 : 0)))

/** Last time anything happened in this workout (start, reopen, or a set). */
export function lastActivityAt(state) {
  return Math.max(state.startTime || 0, state.resumedAt || 0, ...completedTimes(state))
}

/**
 * Workout duration. It runs to the last logged set, so reopening the app
 * later doesn't stretch it. A workout continued from History keeps its
 * earlier duration and adds only the time since it was reopened.
 */
function durationOf(state, now) {
  const lastSetAt = Math.max(0, ...completedTimes(state))
  if (state.resumedAt) {
    const extra = lastSetAt > state.resumedAt ? lastSetAt - state.resumedAt : 0
    return (state.priorDurationSeconds || 0) + Math.round(extra / 1000)
  }
  return Math.round(((lastSetAt || now) - state.startTime) / 1000)
}

export function buildLogEntry(state, now = Date.now()) {
  return {
    date: new Date(state.startTime).toISOString(),
    sessionLabel: state.selectedSession,
    durationSeconds: durationOf(state, now),
    exercises: state.exercises
      .filter(ex => !ex.isBonus && (ex.sets.some(s => s.completed) || ex.note))
      .map(ex => ({
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
        note: ex.note || null,
        wasSwapped: ex.wasSwapped || false,
        swappedFrom: ex.swappedFrom || null
      }))
  }
}

/** Carry each logged exercise's last completed weight forward for next time. */
export async function updateProgressionFromWorkout(exercises) {
  const program = await db.program.toArray().then(p => p[0])
  if (!program) return
  const planned = new Map(
    (program.sessions || []).flatMap(s => s.exercises || []).map(e => [e.exerciseId, e])
  )
  for (const exercise of exercises) {
    const programExercise = planned.get(exercise.exerciseId)
    const done = exercise.sets.filter(s => s.completed)
    if (!programExercise || done.length === 0) continue
    const updated = updateProgressionAfterWorkout(
      { exerciseId: exercise.exerciseId, currentWeight: done[done.length - 1].weight ?? 0 },
      programExercise,
      done
    )
    await updateProgressionState(exercise.exerciseId, updated)
  }
}

/**
 * Save the workout's completed sets locally and push them to Supabase.
 * @returns {Promise<number|null>} the workoutLog id (null if nothing logged yet)
 */
export function syncLiveWorkout(state) {
  const run = chain.then(async () => {
    const entry = buildLogEntry(state)
    if (entry.exercises.length === 0) return state.logId ?? idsByStart.get(state.startTime) ?? null

    let id = state.logId ?? idsByStart.get(state.startTime)
    if (id != null) await db.workoutLog.put({ ...entry, id })
    else id = await db.workoutLog.add(entry)
    idsByStart.set(state.startTime, id)

    // A workout continued from History only moves progression on if it's
    // still the latest one; otherwise it would overwrite newer weights.
    const newer = await db.workoutLog.where('date').above(entry.date).count()
    if (newer === 0) await updateProgressionFromWorkout(state.exercises.filter(ex => !ex.isBonus))
    pushWorkout({ ...entry, id }).catch(err => console.error('Sync: live workout push failed', err))
    getAllProgressionStates()
      .then(states => states.length && pushProgressionStates(states))
      .catch(err => console.error('Sync: progression push failed', err))
    return id
  })
  chain = run.catch(() => {})
  return run
}

/** Remove an in-progress workout's logged sets from History and Supabase. */
export async function deleteLoggedWorkout(state) {
  await chain
  const id = state.logId ?? idsByStart.get(state.startTime)
  if (id == null) return
  await deleteWorkoutEntry(id)
}

/** Delete a History entry locally and in Supabase. */
export async function deleteWorkoutEntry(id) {
  await chain
  const entry = await db.workoutLog.get(id)
  if (entry) idsByStart.delete(Date.parse(entry.date))
  for (const [start, logId] of idsByStart) if (logId === id) idsByStart.delete(start)
  await db.workoutLog.delete(id)
  const { error } = await supabase.from('workout_log').delete().eq('local_id', id)
  if (error) console.error('Sync: failed to delete workout', error)
}
