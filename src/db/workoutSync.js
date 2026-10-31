import { db } from './db'
import { supabase } from './supabase'
import { currentUserId } from './auth'
import { syncProgression } from './progressionSync'

/**
 * Reliable workout sync between this device and Supabase.
 *
 * - Every workout has a `clientId` that is unique across devices (Safari and
 *   the home-screen app keep separate local databases that both number
 *   workouts from 1, so the local id can't identify a workout in Supabase).
 * - Every local write marks the workout `pendingSync` (a revision number).
 *   It's cleared only once that exact revision reached Supabase, so a failed
 *   upload (no signal) is retried on the next sync.
 * - Deletions are remembered until Supabase has them (`deleted_at`), so other
 *   devices remove the workout too.
 * - A sync also pulls workouts this device doesn't have yet.
 */

const PENDING_DELETES = 'pendingWorkoutDeletes'

let lastRev = 0
function nextRev() {
  lastRev = Math.max(Date.now(), lastRev + 1)
  return lastRev
}

export function newClientId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

const completedCount = exercises =>
  (exercises || []).reduce((n, ex) => n + (ex.sets || []).filter(s => s.completed).length, 0)

function toRow(w) {
  return {
    user_id: currentUserId(),
    client_id: w.clientId,
    local_id: w.id,
    date: w.date,
    session_label: w.sessionLabel,
    duration_seconds: w.durationSeconds,
    exercises: w.exercises,
    deleted_at: null
  }
}

function fromRow(r) {
  return {
    clientId: r.client_id,
    date: new Date(r.date).toISOString(),
    sessionLabel: r.session_label,
    durationSeconds: r.duration_seconds,
    exercises: r.exercises || [],
    pendingSync: 0
  }
}

/**
 * Save a workout on this device and mark it for upload.
 * @param {Object} entry - { date, sessionLabel, durationSeconds, exercises }
 * @param {number} [id] - existing local id to overwrite
 * @returns {Promise<number>} local id
 */
export async function saveWorkoutLocal(entry, id) {
  const existing = id != null ? await db.workoutLog.get(id) : null
  const record = {
    ...entry,
    clientId: existing?.clientId || entry.clientId || newClientId(),
    pendingSync: nextRev()
  }
  if (id != null) {
    await db.workoutLog.put({ ...record, id })
    return id
  }
  return db.workoutLog.add(record)
}

/** Upload one workout if it has unsent changes. @returns {Promise<boolean>} reached Supabase */
export async function uploadWorkout(id) {
  const w = await db.workoutLog.get(id)
  if (!w || !w.pendingSync) return true
  if (!w.clientId) return false // assigned by the next sync
  const { error } = await supabase.from('workout_log').upsert(toRow(w), { onConflict: 'client_id' })
  if (error) {
    console.error('Sync: workout upload failed', error)
    return false
  }
  // Only clear the flag if nothing changed while uploading.
  await db.transaction('rw', db.workoutLog, async () => {
    const cur = await db.workoutLog.get(id)
    if (cur && cur.pendingSync === w.pendingSync) await db.workoutLog.update(id, { pendingSync: 0 })
  })
  return true
}

async function pendingDeletes() {
  return (await db.settings.get(PENDING_DELETES))?.value || []
}

async function setPendingDeletes(list) {
  await db.settings.put({ key: PENDING_DELETES, value: list })
}

/** Delete a workout here and (now or on a later sync) everywhere else. */
export async function deleteWorkoutEverywhere(id) {
  const w = await db.workoutLog.get(id)
  await db.workoutLog.delete(id)
  if (!w?.clientId) return
  await setPendingDeletes([...new Set([...(await pendingDeletes()), w.clientId])])
  await sendDeletes()
}

async function sendDeletes() {
  const ids = await pendingDeletes()
  if (!ids.length) return true
  const { error } = await supabase
    .from('workout_log')
    .update({ deleted_at: new Date().toISOString() })
    .in('client_id', ids)
  if (error) {
    console.error('Sync: workout delete failed', error)
    return false
  }
  const left = (await pendingDeletes()).filter(c => !ids.includes(c))
  await setPendingDeletes(left)
  return true
}

/**
 * Workouts saved before client ids existed get one. If Supabase already has
 * this device's copy (`legacy-<local id>`, same start time) they keep that id
 * and only upload if this device logged more sets; otherwise they get a fresh
 * id and are uploaded.
 */
async function assignMissingClientIds() {
  const missing = (await db.workoutLog.toArray()).filter(w => !w.clientId)
  if (!missing.length) return true
  const { data, error } = await supabase
    .from('workout_log')
    .select('client_id, date, exercises, deleted_at')
    .in('client_id', missing.map(w => `legacy-${w.id}`))
  if (error) {
    console.error('Sync: legacy lookup failed', error)
    return false
  }
  const remote = new Map((data || []).map(r => [r.client_id, r]))
  for (const w of missing) {
    const r = remote.get(`legacy-${w.id}`)
    const same = r && Date.parse(r.date) === Date.parse(w.date)
    const clientId = same ? r.client_id : newClientId()
    const pending = same
      ? (!r.deleted_at && completedCount(w.exercises) > completedCount(r.exercises) ? nextRev() : 0)
      : nextRev()
    await db.workoutLog.update(w.id, { clientId, pendingSync: pending })
  }
  return true
}

/** Bring in workouts from other devices, and apply their edits and deletions. */
async function pullWorkouts() {
  const { data, error } = await supabase.from('workout_log').select('*')
  if (error) {
    console.error('Sync: workout pull failed', error)
    return
  }
  const deleting = new Set(await pendingDeletes())
  const local = await db.workoutLog.toArray()
  const byClient = new Map(local.filter(w => w.clientId).map(w => [w.clientId, w]))

  for (const r of data || []) {
    const mine = byClient.get(r.client_id)
    if (r.deleted_at) {
      if (mine) await db.workoutLog.delete(mine.id)
      continue
    }
    if (deleting.has(r.client_id)) continue
    const entry = fromRow(r)
    if (!mine) {
      await db.workoutLog.add(entry)
    } else if (!mine.pendingSync && (
      JSON.stringify(mine.exercises) !== JSON.stringify(entry.exercises) ||
      mine.durationSeconds !== entry.durationSeconds ||
      Date.parse(mine.date) !== Date.parse(entry.date)
    )) {
      await db.workoutLog.put({ ...entry, id: mine.id })
    }
  }
}

let running = null

/** Upload everything pending, send deletions, then pull. Safe to call often. */
export function syncWorkouts() {
  if (running) return running
  running = (async () => {
    const assigned = await assignMissingClientIds()
    const pending = (await db.workoutLog.toArray()).filter(w => w.pendingSync && w.clientId)
    for (const w of pending) {
      if (!(await uploadWorkout(w.id))) break
    }
    await sendDeletes()
    if (assigned) await pullWorkouts()
    await syncProgression()
  })()
    .catch(err => console.error('Sync: workout sync failed', err))
    .finally(() => { running = null })
  return running
}
