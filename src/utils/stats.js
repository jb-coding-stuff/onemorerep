/**
 * Pure aggregations over the workout log for the History stats view.
 * Only completed sets with reps count; weights are kg.
 */

import { epley1RM } from '../program/transform'

export const REGIONS = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core']

export const REGION_LABELS = {
  chest: 'Chest',
  back: 'Back',
  shoulders: 'Shoulders',
  arms: 'Arms',
  legs: 'Legs',
  core: 'Core',
  other: 'Other'
}

const REGION_OF = {
  chest: 'chest',
  back: 'back',
  shoulders: 'shoulders',
  biceps: 'arms',
  triceps: 'arms',
  forearms: 'arms',
  quads: 'legs',
  hamstrings: 'legs',
  glutes: 'legs',
  calves: 'legs',
  core: 'core',
  abs: 'core'
}

export function regionOf(muscleGroup) {
  return REGION_OF[muscleGroup] || 'other'
}

export const RANGES = [
  { id: '4w', label: '4W', days: 28 },
  { id: '3m', label: '3M', days: 91 },
  { id: '1y', label: '1Y', days: 365 },
  { id: 'all', label: 'All', days: null }
]

export function filterByRange(workouts, rangeId, now = Date.now()) {
  const range = RANGES.find(r => r.id === rangeId)
  if (!range?.days) return workouts
  const since = now - range.days * 86400000
  return workouts.filter(w => new Date(w.date).getTime() >= since)
}

export function completedSets(exercise) {
  return (exercise.sets || []).filter(s => s.completed && (s.actualReps ?? 0) > 0)
}

/**
 * Flatten workouts into one row per completed set, tagged with a resolved
 * exercise identity and muscle group.
 * @param {Object[]} workouts
 * @param {(exercise) => { id: string, name: string, muscleGroup: string }} identify
 */
export function setRows(workouts, identify) {
  const rows = []
  for (const w of workouts) {
    const t = new Date(w.date).getTime()
    for (const ex of w.exercises || []) {
      const who = identify(ex)
      for (const s of completedSets(ex)) {
        rows.push({
          t,
          workoutDate: w.date,
          exerciseId: who.id,
          name: who.name,
          muscleGroup: who.muscleGroup,
          region: regionOf(who.muscleGroup),
          weight: Number(s.weight) || 0,
          reps: Number(s.actualReps) || 0,
          rpe: s.rpe ?? null
        })
      }
    }
  }
  return rows
}

function countBy(rows, key) {
  const m = new Map()
  for (const r of rows) m.set(r[key], (m.get(r[key]) || 0) + 1)
  return m
}

/** Sets per region in fixed REGIONS order (plus Other if present). */
export function setsPerRegion(rows) {
  const counts = countBy(rows, 'region')
  const keys = [...REGIONS, 'other'].filter(k => counts.get(k))
  return keys.map(k => ({ key: k, label: REGION_LABELS[k], sets: counts.get(k) }))
}

/** Sets per fine-grained muscle group, largest first. */
export function setsPerMuscle(rows) {
  return [...countBy(rows, 'muscleGroup')]
    .map(([key, sets]) => ({ key, sets }))
    .sort((a, b) => b.sets - a.sets)
}

/** Exercises with the most completed sets. */
export function topExercises(rows, limit = 8) {
  const m = new Map()
  for (const r of rows) {
    const cur = m.get(r.exerciseId) || { id: r.exerciseId, name: r.name, sets: 0 }
    cur.sets++
    m.set(r.exerciseId, cur)
  }
  return [...m.values()].sort((a, b) => b.sets - a.sets).slice(0, limit)
}

/** Heaviest set per workout for one exercise, oldest first. */
export function exerciseProgression(rows, exerciseId) {
  const byWorkout = new Map()
  for (const r of rows) {
    if (r.exerciseId !== exerciseId) continue
    const cur = byWorkout.get(r.workoutDate)
    if (!cur || r.weight > cur.weight || (r.weight === cur.weight && r.reps > cur.reps)) {
      byWorkout.set(r.workoutDate, { t: r.t, weight: r.weight, reps: r.reps, e1rm: epley1RM(r.weight, r.reps) })
    }
  }
  return [...byWorkout.values()].sort((a, b) => a.t - b.t)
}

function weekStart(t) {
  const d = new Date(t)
  const day = (d.getDay() + 6) % 7
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - day)
  return d.getTime()
}

/**
 * Training volume (kg × reps) per calendar week, oldest first. Weeks without
 * training inside the span are included as 0 so the line shows breaks.
 * @param {Object[]} rows
 * @param {string|null} region - limit to one region, or null for all
 */
export function weeklyVolume(rows, region = null) {
  const filtered = region ? rows.filter(r => r.region === region) : rows
  if (filtered.length === 0) return []
  const m = new Map()
  for (const r of filtered) {
    const k = weekStart(r.t)
    m.set(k, (m.get(k) || 0) + r.weight * r.reps)
  }
  const keys = [...m.keys()].sort((a, b) => a - b)
  const out = []
  for (let k = keys[0]; k <= keys[keys.length - 1]; k = weekStart(k + 8 * 86400000)) {
    out.push({ t: k, volume: Math.round(m.get(k) || 0) })
  }
  return out
}

/** Completed sets per calendar week, oldest first (gaps filled with 0). */
export function weeklySets(rows) {
  if (rows.length === 0) return []
  const m = new Map()
  for (const r of rows) {
    const k = weekStart(r.t)
    m.set(k, (m.get(k) || 0) + 1)
  }
  const keys = [...m.keys()].sort((a, b) => a - b)
  const out = []
  for (let k = keys[0]; k <= keys[keys.length - 1]; k = weekStart(k + 8 * 86400000)) {
    out.push({ t: k, sets: m.get(k) || 0 })
  }
  return out
}

/** Most recent sessions of one exercise, newest first, with their sets. */
export function recentSessions(rows, exerciseId, limit = 5) {
  const byWorkout = new Map()
  for (const r of rows) {
    if (r.exerciseId !== exerciseId) continue
    if (!byWorkout.has(r.workoutDate)) byWorkout.set(r.workoutDate, { t: r.t, sets: [] })
    byWorkout.get(r.workoutDate).sets.push({ weight: r.weight, reps: r.reps, rpe: r.rpe })
  }
  return [...byWorkout.values()].sort((a, b) => b.t - a.t).slice(0, limit)
}
