/**
 * Supabase client signed in as one app account.
 *
 * Required environment variables:
 *   SUPABASE_URL       - the project URL
 *   SUPABASE_ANON_KEY  - the project's public anon key (the same one the app uses)
 *   APP_EMAIL          - your login for the fitness app
 *   APP_PASSWORD       - your password for the fitness app
 *
 * The server signs in as that account, so Row Level Security limits it to the
 * account's own plans, exercises and history, exactly like the app.
 *
 * The client is created and signed in once and memoised. Missing configuration
 * or a failed sign-in throws a clear, actionable error.
 */

import { createClient } from '@supabase/supabase-js'

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'APP_EMAIL', 'APP_PASSWORD']

let pending = null

/**
 * @returns {Promise<{ client: import('@supabase/supabase-js').SupabaseClient, userId: string }>}
 * @throws {Error} when configuration is missing or sign-in fails
 */
export function getSupabase() {
  if (!pending) {
    pending = signIn().catch(err => {
      pending = null // allow a retry on the next call
      throw err
    })
  }
  return pending
}

async function signIn() {
  const env = checkEnv()
  if (!env.ok) throw new Error(env.error)

  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: true }
  })
  const { data, error } = await client.auth.signInWithPassword({
    email: process.env.APP_EMAIL.trim(),
    password: process.env.APP_PASSWORD
  })
  if (error) throw new Error(`Sign-in to the fitness app failed: ${error.message}. Check APP_EMAIL and APP_PASSWORD.`)
  return { client, userId: data.user.id }
}

/**
 * Validate that the required env vars are present, without signing in. Used at
 * startup to fail fast with a clear message.
 * @returns {{ ok: boolean, error?: string }}
 */
export function checkEnv() {
  const missing = REQUIRED.filter(k => !process.env[k] || !process.env[k].trim())
  if (missing.length) {
    return { ok: false, error: `Missing environment variables: ${missing.join(', ')}.` }
  }
  return { ok: true }
}

// --- Row mappers: Supabase snake_case <-> app camelCase ---------------------

/** Map an exercise_catalog row to the camelCase shape used internally. */
export function mapCatalogRow(c) {
  return {
    canonicalId: c.canonical_id,
    displayName: c.display_name,
    aliases: c.aliases ?? [],
    muscleGroup: c.muscle_group,
    movementType: c.movement_type,
    equipment: c.equipment ?? null,
    defaultIncrementKg: c.default_increment_kg ?? null,
    createdAt: c.created_at,
    updatedAt: c.updated_at
  }
}

/** Map a program_pack row to the camelCase shape used internally. */
export function mapPackRow(p) {
  return {
    packId: p.pack_id,
    version: p.version,
    name: p.name,
    source: p.source,
    progressionRules: p.progression_rules,
    sessions: p.sessions,
    isActive: p.is_active,
    updatedAt: p.updated_at
  }
}

/** Map a camelCase catalog entry to an exercise_catalog row for upsert. */
export function toCatalogRow(e, now) {
  return {
    canonical_id: e.canonicalId,
    display_name: e.displayName,
    aliases: e.aliases ?? [],
    muscle_group: e.muscleGroup ?? null,
    movement_type: e.movementType ?? null,
    equipment: e.equipment ?? null,
    default_increment_kg: e.defaultIncrementKg ?? null,
    updated_at: now || new Date().toISOString()
  }
}
