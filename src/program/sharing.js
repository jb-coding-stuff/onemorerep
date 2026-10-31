import { db } from '../db/db'
import { supabase } from '../db/supabase'
import { currentUserId, displayName } from '../db/auth'
import { pushPack } from '../db/sync'
import { getPack, savePack } from '../db/programPack'
import { getCatalogMap } from '../db/exerciseCatalog'
import { importPack } from './localProvider'

/** Catalog entries a pack refers to, so a friend gets the exercise names too. */
async function catalogFor(pack) {
  const catalog = await getCatalogMap()
  const ids = new Set()
  for (const session of pack.sessions || []) {
    for (const ex of session.exercises || []) {
      if (ex.canonicalId) ids.add(ex.canonicalId)
      for (const alt of ex.alternatives || []) ids.add(alt)
    }
  }
  return [...ids].map(id => catalog[id]).filter(Boolean).map(e => ({
    canonicalId: e.canonicalId,
    displayName: e.displayName,
    aliases: e.aliases || [],
    muscleGroup: e.muscleGroup,
    movementType: e.movementType,
    equipment: e.equipment ?? null
  }))
}

/**
 * Share or unshare one of your plans with everyone who has an account.
 * Friends get a copy; your plan and your data stay yours.
 */
export async function setPackShared(packId, shared) {
  const pack = await getPack(packId)
  if (!pack) throw new Error('Plan not found')
  const activeId = (await db.settings.get('activePackId'))?.value
  // Make sure the plan exists in your account before flagging it.
  await pushPack(pack, { active: packId === activeId })
  const { error } = await supabase
    .from('program_pack')
    .update({
      shared,
      owner_name: shared ? displayName() : null,
      catalog: shared ? await catalogFor(pack) : null
    })
    .eq('user_id', currentUserId())
    .eq('pack_id', packId)
  if (error) throw error
  await savePack({ ...pack, shared })
}

/** Plans other people shared. */
export async function listSharedPacks() {
  const { data, error } = await supabase
    .from('program_pack')
    .select('user_id, pack_id, version, name, source, progression_rules, sessions, owner_name, catalog, updated_at')
    .eq('shared', true)
    .neq('user_id', currentUserId())
    .order('name')
  if (error) throw error
  return data || []
}

/** Copy a friend's shared plan into your account and switch to it. */
export async function adoptSharedPack(row) {
  return importPack({
    packId: row.pack_id,
    version: row.version ?? 1,
    name: row.name,
    source: { ...(row.source || {}), sharedBy: row.owner_name || null },
    progressionRules: row.progression_rules ?? undefined,
    sessions: row.sessions,
    catalog: row.catalog || []
  })
}
