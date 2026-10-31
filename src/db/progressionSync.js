import { db } from './db'
import { supabase } from './supabase'
import { currentUserId } from './auth'

/**
 * Two-way sync of working weights (progression_state) by `lastUpdated`:
 * whichever device changed an exercise's weight last wins, in both
 * directions. A device that wasn't used for a while picks up the newer
 * weights instead of pushing its stale ones over them.
 */

const time = iso => (iso ? Date.parse(iso) || 0 : 0)

function fromRow(r) {
  return {
    exerciseId: r.exercise_id,
    currentWeight: r.current_weight,
    repRange: r.rep_range,
    lastSessionAvgRpe: r.last_session_avg_rpe,
    lastSessionDate: r.last_session_date,
    lastUpdated: r.last_updated
  }
}

function toRow(s) {
  return {
    user_id: currentUserId(),
    exercise_id: s.exerciseId,
    current_weight: s.currentWeight,
    rep_range: s.repRange,
    last_session_avg_rpe: s.lastSessionAvgRpe,
    last_session_date: s.lastSessionDate,
    last_updated: s.lastUpdated
  }
}

let running = null

export function syncProgression() {
  if (running) return running
  running = (async () => {
    const { data, error } = await supabase.from('progression_state').select('*')
    if (error) throw error
    const local = new Map((await db.progressionState.toArray()).map(s => [s.exerciseId, s]))
    const remote = new Map((data || []).map(r => [r.exercise_id, r]))

    const newerRemote = [...remote.values()]
      .filter(r => !local.has(r.exercise_id) || time(r.last_updated) > time(local.get(r.exercise_id).lastUpdated))
      .map(fromRow)
    if (newerRemote.length) await db.progressionState.bulkPut(newerRemote)

    const newerLocal = [...local.values()]
      .filter(s => !remote.has(s.exerciseId) || time(s.lastUpdated) > time(remote.get(s.exerciseId).last_updated))
    if (newerLocal.length) {
      const { error: upErr } = await supabase
        .from('progression_state')
        .upsert(newerLocal.map(toRow), { onConflict: 'user_id,exercise_id' })
      if (upErr) throw upErr
    }
  })()
    .catch(err => console.error('Sync: weight sync failed', err))
    .finally(() => { running = null })
  return running
}
