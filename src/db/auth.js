import { db } from './db'

/**
 * The signed-in account. Every row in Supabase belongs to one account (Row
 * Level Security), and this device's local database holds one account's data.
 */

let user = null

export const currentUserId = () => user?.id ?? null
export const currentUser = () => user

/** Display name chosen at sign-up, falling back to the email's first part. */
export function displayName(u = user) {
  return u?.user_metadata?.name?.trim() || u?.email?.split('@')[0] || ''
}

export function setCurrentUser(u) {
  user = u || null
}

const LOCAL_TABLES = [
  'program', 'workoutLog', 'progressionState', 'settings', 'exerciseLibrary',
  'activeWorkout', 'bodyWeight', 'exerciseCatalog', 'programPack'
]

/** Remove everything this device stores for an account. */
export async function wipeLocalData() {
  await Promise.all(LOCAL_TABLES.map(t => db[t]?.clear()))
  try {
    for (const k of Object.keys(localStorage)) if (!k.startsWith('sb-')) localStorage.removeItem(k)
  } catch { /* storage unavailable */ }
}

/**
 * Make sure the local database belongs to `userId`. The first sign-in on a
 * device keeps what's there (it was this person's data before accounts
 * existed); signing in as someone else clears it first.
 * @returns {Promise<boolean>} true if local data was cleared
 */
export async function claimLocalData(userId) {
  const owner = (await db.settings.get('authUserId'))?.value
  let wiped = false
  if (owner && owner !== userId) {
    await wipeLocalData()
    wiped = true
  }
  await db.settings.put({ key: 'authUserId', value: userId })
  return wiped
}
