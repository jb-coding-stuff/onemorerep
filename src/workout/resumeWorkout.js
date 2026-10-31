import { db } from '../db/db'
import { buildSessionExercises } from './buildSession'

/** Sets of a logged exercise, with the logged ones marked done. */
function mergeSets(planSets, loggedSets) {
  const out = planSets.map(s => ({ ...s }))
  for (const ls of loggedSets || []) {
    const i = (ls.setNumber ?? out.length + 1) - 1
    const set = { ...ls, completed: !!ls.completed, completedAt: null }
    if (i < out.length) out[i] = { ...out[i], ...set }
    else out.push({ ...set, setNumber: out.length + 1 })
  }
  // Open sets carry the last logged weight.
  const lastDone = [...out].reverse().find(s => s.completed)
  if (lastDone) for (const s of out) if (!s.completed) s.weight = lastDone.weight
  return out
}

/**
 * Turn a History entry back into an in-progress workout. Exercises from the
 * plan session are filled in with what was logged; logged exercises that
 * aren't in the plan (swapped, or from an older plan) keep their slot or are
 * appended. New sets are written to the same History entry.
 */
export async function buildResumedWorkout(entry) {
  const program = await db.program.toArray().then(p => p[0])
  const session = program?.sessions?.find(s => s.label === entry.sessionLabel)
  const exercises = session ? await buildSessionExercises(session, program.progressionRules) : []

  for (const logged of entry.exercises || []) {
    const idx = exercises.findIndex(e =>
      e.exerciseId === logged.exerciseId || (logged.swappedFrom && e.exerciseId === logged.swappedFrom))
    const base = idx >= 0 ? exercises[idx] : {
      exerciseId: logged.exerciseId,
      name: logged.name,
      movementType: 'isolation',
      targetReps: logged.sets?.[0]?.targetReps ?? null,
      startingWeight: logged.sets?.[0]?.weight ?? 0,
      sets: [],
      alternatives: []
    }
    const sets = mergeSets(base.sets, logged.sets)
    const merged = {
      ...base,
      exerciseId: logged.exerciseId,
      name: logged.name,
      sets,
      setsCompleted: sets.filter(s => s.completed).length,
      note: logged.note || '',
      wasSwapped: logged.wasSwapped || false,
      swappedFrom: logged.swappedFrom || null,
      weightReason: null
    }
    if (idx >= 0) exercises[idx] = merged
    else exercises.push(merged)
  }

  return {
    mode: 'logging',
    selectedSession: entry.sessionLabel,
    currentSessionIndex: 0,
    exercises,
    startTime: Date.parse(entry.date),
    isOverviewMode: false,
    logId: entry.id,
    resumedAt: Date.now(),
    priorDurationSeconds: entry.durationSeconds || 0
  }
}
