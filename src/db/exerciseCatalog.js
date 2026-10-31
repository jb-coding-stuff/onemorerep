import { db } from './db'
import { supabase } from './supabase'
import { pushCatalog } from './sync'
import { normalizeName } from '../program/schema'

/**
 * The canonical exercise catalog — one row per real-world movement, independent
 * of any training plan. This is the identity layer that lets logged history and
 * weights carry across plan swaps.
 *
 * Row shape:
 *   { canonicalId, displayName, aliases[], muscleGroup, movementType,
 *     equipment?, defaultIncrementKg?, createdAt, updatedAt }
 */

/**
 * Insert or merge a catalog entry. Aliases are unioned, not replaced, so the
 * catalog accumulates known name variants over time.
 * @param {Object} entry
 * @returns {Promise<void>}
 */
export async function upsertCatalogExercise(entry) {
  if (!entry?.canonicalId) return
  const now = new Date().toISOString()
  const existing = await db.exerciseCatalog.get(entry.canonicalId)

  const merged = {
    canonicalId: entry.canonicalId,
    displayName: entry.displayName || existing?.displayName || entry.canonicalId,
    aliases: unionAliases(existing?.aliases, entry.aliases, entry.displayName),
    muscleGroup: entry.muscleGroup || existing?.muscleGroup || 'general',
    movementType: entry.movementType || existing?.movementType || 'isolation',
    equipment: entry.equipment ?? existing?.equipment ?? null,
    defaultIncrementKg: entry.defaultIncrementKg ?? existing?.defaultIncrementKg ?? null,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  }

  await db.exerciseCatalog.put(merged)
}

/**
 * Bulk upsert catalog entries (used during backfill/import).
 * @param {Object[]} entries
 */
export async function upsertCatalogExercises(entries) {
  for (const entry of entries || []) {
    await upsertCatalogExercise(entry)
  }
}

/**
 * @param {string} canonicalId
 * @returns {Promise<Object|undefined>}
 */
export async function getCatalogExercise(canonicalId) {
  return db.exerciseCatalog.get(canonicalId)
}

/**
 * @returns {Promise<Object[]>}
 */
export async function getAllCatalogExercises() {
  return db.exerciseCatalog.toArray()
}

/**
 * @returns {Promise<Object>} - { canonicalId: entry }
 */
export async function getCatalogMap() {
  const all = await db.exerciseCatalog.toArray()
  const map = {}
  for (const e of all) map[e.canonicalId] = e
  return map
}

/**
 * Add a name variant to an existing catalog entry.
 * @param {string} canonicalId
 * @param {string} alias
 */
export async function addAlias(canonicalId, alias) {
  const existing = await db.exerciseCatalog.get(canonicalId)
  if (!existing) return
  existing.aliases = unionAliases(existing.aliases, [alias])
  existing.updatedAt = new Date().toISOString()
  await db.exerciseCatalog.put(existing)
}

/**
 * Case-insensitive union of alias lists, keeping first-seen order. Mirrors
 * mcp-server/src/resolver.js so both writers produce identical alias lists.
 * @param {string[]} [existing]
 * @param {string[]} [incoming]
 * @param {string} [displayName]
 * @returns {string[]}
 */
function unionAliases(existing, incoming, displayName) {
  const out = []
  const seen = new Set()
  const push = (v) => {
    if (typeof v !== 'string') return
    const t = v.trim()
    if (!t) return
    const key = t.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(t)
  }
  for (const a of existing || []) push(a)
  for (const a of incoming || []) push(a)
  push(displayName)
  return out
}

/**
 * Resolve a raw id-or-name to a canonical id: exact id, then exact alias,
 * then normalised-name match. Returns null if nothing matches.
 * @param {string} idOrName
 * @param {Object[]} [catalogList] - optional pre-fetched list to avoid a query
 * @returns {Promise<string|null>}
 */
export async function resolveToCanonical(idOrName, catalogList) {
  if (!idOrName) return null
  const list = catalogList || (await db.exerciseCatalog.toArray())

  // 1. exact canonical id
  const byId = list.find(e => e.canonicalId === idOrName)
  if (byId) return byId.canonicalId

  // 2. exact alias / display name
  const byAlias = list.find(
    e => e.displayName === idOrName || (e.aliases || []).includes(idOrName)
  )
  if (byAlias) return byAlias.canonicalId

  // 3. normalised name
  const norm = normalizeName(idOrName)
  const byNorm = list.find(
    e =>
      normalizeName(e.displayName) === norm ||
      (e.aliases || []).some(a => normalizeName(a) === norm)
  )
  if (byNorm) return byNorm.canonicalId

  return null
}

// --- User exercise library (custom entries live in the same catalog) ---

export const MUSCLE_GROUPS = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'quads', 'hamstrings', 'glutes', 'calves', 'core'
]

const CUSTOM_PREFIX = 'custom_'

/** Exercises the user added (as opposed to ones that came with a plan). */
export function isCustomExercise(entry) {
  return entry?.canonicalId?.startsWith(CUSTOM_PREFIX)
}

function slug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'exercise'
}

async function pushEntries(ids) {
  const entries = (await db.exerciseCatalog.bulkGet(ids)).filter(Boolean)
  pushCatalog(entries).catch(err => console.error('Sync: failed to push exercise', err))
}

/**
 * Add an exercise to the library and sync it.
 * @param {{ name: string, muscleGroup: string, movementType: string, equipment?: string }} input
 * @returns {Promise<Object>} the stored catalog entry
 */
export async function createCustomExercise({ name, muscleGroup, movementType, equipment }) {
  const displayName = name.trim()
  const existing = await resolveToCanonical(displayName)
  if (existing) throw new Error(`"${displayName}" is already in your exercises.`)
  let canonicalId = CUSTOM_PREFIX + slug(displayName)
  for (let n = 2; await db.exerciseCatalog.get(canonicalId); n++) {
    canonicalId = `${CUSTOM_PREFIX}${slug(displayName)}_${n}`
  }
  await upsertCatalogExercise({
    canonicalId,
    displayName,
    aliases: [displayName],
    muscleGroup,
    movementType,
    equipment: equipment?.trim() || null
  })
  await pushEntries([canonicalId])
  return db.exerciseCatalog.get(canonicalId)
}

/** Rename a custom exercise; the old name stays as an alias so history still matches. */
export async function renameCustomExercise(canonicalId, newName) {
  const entry = await db.exerciseCatalog.get(canonicalId)
  if (!isCustomExercise(entry) || !newName.trim()) return
  await upsertCatalogExercise({ ...entry, displayName: newName.trim(), aliases: [entry.displayName, newName.trim()] })
  await pushEntries([canonicalId])
}

/** Delete a custom exercise locally and in Supabase. Logged workouts keep their sets. */
export async function deleteCustomExercise(canonicalId) {
  if (!canonicalId?.startsWith(CUSTOM_PREFIX)) return
  await db.exerciseCatalog.delete(canonicalId)
  const { error } = await supabase.from('exercise_catalog').delete().eq('canonical_id', canonicalId)
  if (error) console.error('Sync: failed to delete exercise', error)
}

/**
 * One-time copy of exercises created with the old "Create Alternative" form
 * (stored in exerciseLibrary, which nothing read back) into the catalog.
 */
export async function migrateLegacyCustomExercises() {
  if ((await db.settings.get('legacyExercisesMigrated'))?.value) return
  const legacy = await db.exerciseLibrary.toArray()
  const ids = []
  for (const ex of legacy) {
    if (!ex?.exerciseId || !ex.name || (await db.exerciseCatalog.get(ex.exerciseId))) continue
    const id = ex.exerciseId.startsWith(CUSTOM_PREFIX) ? ex.exerciseId : CUSTOM_PREFIX + ex.exerciseId
    await upsertCatalogExercise({
      canonicalId: id,
      displayName: ex.name,
      aliases: [ex.name],
      muscleGroup: ex.muscleGroup || 'general',
      movementType: ex.movementType || 'isolation'
    })
    ids.push(id)
  }
  if (ids.length) await pushEntries(ids)
  await db.settings.put({ key: 'legacyExercisesMigrated', value: true })
}
