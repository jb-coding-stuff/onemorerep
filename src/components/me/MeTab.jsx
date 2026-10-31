import { useState, useEffect } from 'react'
import { db } from '../../db/db'
import {
  activateDefaultPack,
  importPack,
  getAvailablePacks,
  switchPack
} from '../../program/localProvider'
import { BackIcon, IconButton } from '../icons'
import ExerciseLibrary from './ExerciseLibrary'
import InviteFriends from './InviteFriends'
import { useSettings } from '../../contexts/SettingsContext'
import { supabase } from '../../db/supabase'
import { currentUser, displayName, wipeLocalData } from '../../db/auth'
import { syncWorkouts } from '../../db/workoutSync'
import { setPackShared, listSharedPacks, adoptSharedPack } from '../../program/sharing'

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s === 0 ? `${m}:00` : `${m}:${String(s).padStart(2, '0')}`
}

export default function MeTab({ onBack }) {
  const [loading, setLoading] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const { compoundRest, isolationRest, saveRestTimers } = useSettings()
  const [compound, setCompound] = useState(null)
  const [isolation, setIsolation] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState(null)
  const [importing, setImporting] = useState(false)
  const [packs, setPacks] = useState([])
  const [activePackId, setActivePackId] = useState(null)
  const [switchingTo, setSwitchingTo] = useState(null)
  const [switchError, setSwitchError] = useState(null)
  const [offlineSwitch, setOfflineSwitch] = useState(false)
  const [friendPacks, setFriendPacks] = useState([])
  const [sharingId, setSharingId] = useState(null)
  const [adoptingId, setAdoptingId] = useState(null)
  const user = currentUser()

  useEffect(() => {
    getAvailablePacks()
      .then(({ packs, activePackId }) => {
        setPacks([...packs].sort((a, b) => a.name.localeCompare(b.name)))
        setActivePackId(activePackId)
      })
      .catch(err => console.error('Failed to load plans:', err))
    listSharedPacks()
      .then(setFriendPacks)
      .catch(err => console.error('Failed to load shared plans:', err))
  }, [])

  async function toggleShare(pack) {
    const next = !pack.shared
    if (next && !confirm(`Share "${pack.name}"? Everyone with an account can copy it. Your workouts and weights stay private.`)) return
    setSharingId(pack.packId)
    setSwitchError(null)
    try {
      await setPackShared(pack.packId, next)
      setPacks(ps => ps.map(p => (p.packId === pack.packId ? { ...p, shared: next } : p)))
    } catch (err) {
      console.error('Failed to share plan:', err)
      setSwitchError(err.message || 'Sharing failed (are you online?)')
    } finally {
      setSharingId(null)
    }
  }

  async function handleAdopt(row) {
    const by = row.owner_name ? ` by ${row.owner_name}` : ''
    if (!confirm(`Add "${row.name}"${by} to your plans and switch to it?\n\nYour workout history and weights are kept.`)) return
    setAdoptingId(`${row.user_id}:${row.pack_id}`)
    setSwitchError(null)
    try {
      await adoptSharedPack(row)
      window.location.reload()
    } catch (err) {
      console.error('Failed to add shared plan:', err)
      setSwitchError(err.message || 'Could not add the plan')
      setAdoptingId(null)
    }
  }

  async function handleDeleteAccount() {
    if (!confirm('Delete your account? All your workouts, weights, plans and exercises are deleted for good, on every device.')) return
    if (prompt('Type DELETE to confirm.')?.trim() !== 'DELETE') return
    const { error } = await supabase.rpc('delete_my_account')
    if (error) {
      alert(`Could not delete the account: ${error.message}`)
      return
    }
    await supabase.auth.signOut({ scope: 'local' })
    await wipeLocalData()
    window.location.reload()
  }

  async function handleSignOut() {
    await syncWorkouts()
    const pending = (await db.workoutLog.toArray()).some(w => w.pendingSync)
    const msg = pending
      ? 'Some workouts haven\'t uploaded yet (no connection). Signing out now deletes them from this phone. Sign out anyway?'
      : 'Sign out? Your data stays in your account and comes back when you sign in.'
    if (!confirm(msg)) return
    await supabase.auth.signOut({ scope: 'local' })
    await wipeLocalData()
    window.location.reload()
  }

  async function handleSwitchPack(pack) {
    if (pack.packId === activePackId || switchingTo) return
    if (!confirm(`Switch to "${pack.name}"?\n\nYour workout history and weights are kept.`)) return
    setSwitchingTo(pack.packId)
    setSwitchError(null)
    try {
      const { remoteSynced } = await switchPack(pack.packId)
      if (remoteSynced) {
        window.location.reload()
      } else {
        setActivePackId(pack.packId)
        setOfflineSwitch(true)
        setSwitchingTo(null)
      }
    } catch (err) {
      console.error('Failed to switch plan:', err)
      setSwitchError(err.message || 'Switch failed')
      setSwitchingTo(null)
    }
  }

  // Use local state if edited, otherwise fall back to context values
  const compoundVal = compound ?? compoundRest
  const isolationVal = isolation ?? isolationRest

  function adjust(type, delta) {
    if (type === 'compound') {
      setCompound(Math.max(30, compoundVal + delta))
    } else {
      setIsolation(Math.max(30, isolationVal + delta))
    }
  }

  async function handleSaveTimers() {
    await saveRestTimers(compoundVal, isolationVal)
    setCompound(null)
    setIsolation(null)
  }

  async function handleLoadProgram() {
    setLoading(true)
    try {
      await activateDefaultPack()
      window.location.reload()
    } catch (err) {
      console.error('Failed to load program:', err)
      setLoading(false)
    }
  }

  async function handleImport() {
    setImporting(true)
    setImportError(null)
    try {
      await importPack(importText)
      window.location.reload()
    } catch (err) {
      console.error('Failed to import plan:', err)
      setImportError(err.message || 'Import failed')
      setImporting(false)
    }
  }

  async function handleReset() {
    if (confirm('Clear all data on this device? Anything already uploaded comes back from your account; workouts that haven\'t uploaded yet are lost.')) {
      try {
        await Promise.all([
          db.program.clear(),
          db.workoutLog.clear(),
          db.progressionState.clear(),
          db.programPack.clear(),
          db.exerciseCatalog.clear(),
          db.settings.clear()
        ])
        window.location.reload()
      } catch (err) {
        console.error('Failed to reset data:', err)
      }
    }
  }

  if (showLibrary) {
    return (
      <div className="px-4 max-w-md mx-auto" style={{ paddingTop: '1.5rem' }}>
        <ExerciseLibrary onBack={() => setShowLibrary(false)} />
      </div>
    )
  }

  return (
    <div className="px-4 space-y-6 max-w-md mx-auto" style={{ paddingTop: '1.5rem' }}>
      <div className="flex items-center gap-2">
        <IconButton label="Back" onClick={() => onBack?.()}><BackIcon /></IconButton>
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      {/* Rest Timers */}
      <div className="pt-2 space-y-4">
        <h2 className="text-sm font-semibold">Rest Timers</h2>

        {[
          { label: 'Compound', type: 'compound', val: compoundVal },
          { label: 'Isolation', type: 'isolation', val: isolationVal }
        ].map(({ label, type, val }) => (
          <div key={type} className="flex items-center justify-between">
            <span className="text-sm">{label}</span>
            <div className="flex items-center gap-3">
              <button
                onClick={() => adjust(type, -15)}
                className="w-9 h-9 flex items-center justify-center rounded-full text-lg text-secondary hover:bg-white/[.06] transition-colors"
              >
                −
              </button>
              <span className="text-sm font-medium w-10 text-center">{formatDuration(val)}</span>
              <button
                onClick={() => adjust(type, 15)}
                className="w-9 h-9 flex items-center justify-center rounded-full text-lg text-secondary hover:bg-white/[.06] transition-colors"
              >
                +
              </button>
            </div>
          </div>
        ))}

        {(compound !== null || isolation !== null) && (
          <button
            onClick={handleSaveTimers}
            className="btn-primary w-full py-2 font-medium transition-colors text-sm"
          >
            Save
          </button>
        )}
      </div>

      {/* Training Plan */}
      {packs.length > 0 && (
        <div className="pt-6 border-t border-white/[.06] space-y-1">
          <h2 className="text-sm font-semibold">Training Plan</h2>
          <div className="space-y-2">
            {packs.map(pack => {
              const isActive = pack.packId === activePackId
              const isSwitching = pack.packId === switchingTo
              return (
                <div
                  key={pack.packId}
                  className={`flex items-center gap-3 border-b border-white/[.06] last:border-b-0 ${switchingTo && !isSwitching ? 'opacity-50' : ''}`}
                >
                  <button
                    onClick={() => handleSwitchPack(pack)}
                    disabled={isActive || !!switchingTo}
                    className={`flex-1 min-w-0 flex items-center justify-between gap-3 py-3 text-left transition-opacity disabled:cursor-default ${
                      isActive ? '' : 'opacity-60 hover:opacity-100'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{pack.name}</div>
                      <div className="text-xs text-secondary truncate">
                        {pack.sessions.length} days · {pack.sessions.map(s => s.label).join(', ')}
                      </div>
                    </div>
                    <span className="text-sm shrink-0 font-semibold">
                      {isSwitching ? 'Switching…' : isActive ? '✓' : ''}
                    </span>
                  </button>
                  <button
                    onClick={() => toggleShare(pack)}
                    disabled={sharingId === pack.packId}
                    aria-pressed={!!pack.shared}
                    className={`shrink-0 text-xs px-2 py-1 rounded-full transition-colors disabled:opacity-50 ${
                      pack.shared ? 'text-[color:var(--accent-text)]' : 'text-secondary hover:text-[color:var(--ink)]'
                    }`}
                  >
                    {sharingId === pack.packId ? '…' : pack.shared ? 'Shared' : 'Share'}
                  </button>
                </div>
              )
            })}
          </div>
          {friendPacks.length > 0 && (
            <div className="pt-4">
              <h3 className="text-xs text-secondary uppercase tracking-wide mb-1">From friends</h3>
              {friendPacks.map(row => {
                const key = `${row.user_id}:${row.pack_id}`
                return (
                  <button
                    key={key}
                    onClick={() => handleAdopt(row)}
                    disabled={!!adoptingId}
                    className="w-full flex items-center justify-between gap-3 py-3 border-b border-white/[.06] last:border-b-0 text-left opacity-60 hover:opacity-100 transition-opacity disabled:opacity-40"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{row.name}</div>
                      <div className="text-xs text-secondary truncate">
                        {row.owner_name ? `by ${row.owner_name} · ` : ''}{(row.sessions || []).length} days
                      </div>
                    </div>
                    <span className="text-sm shrink-0 text-secondary">{adoptingId === key ? 'Adding…' : '+'}</span>
                  </button>
                )
              })}
            </div>
          )}
          {switchError && (
            <p className="notice text-xs text-red-400 break-words">{switchError}</p>
          )}
          {offlineSwitch && (
            <div className="notice text-xs text-secondary space-y-2">
              <p>
                Switched on this device only — the cloud couldn't be reached. The app may
                switch back the next time it opens online; if so, just switch again.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="btn-primary w-full py-2 font-medium"
              >
                OK
              </button>
            </div>
          )}
        </div>
      )}

      {/* Exercise library */}
      <div>
        <button
          onClick={() => setShowLibrary(true)}
          className="w-full py-4 flex items-center justify-between text-left font-medium border-t border-white/[.06] transition-opacity active:opacity-60"
        >
          Exercises
          <span className="text-secondary" aria-hidden="true">›</span>
        </button>
      </div>

      <InviteFriends />

      {/* Load Program */}
      <div>
        <button
          onClick={handleLoadProgram}
          disabled={loading}
          className="w-full py-4 text-left font-medium border-t border-white/[.06] transition-opacity active:opacity-60 disabled:opacity-50"
        >
          {loading ? 'Loading Program...' : 'Load Default Program'}
        </button>
      </div>

      {/* Import Plan (JSON) */}
      <div className="space-y-3">
        {!showImport ? (
          <button
            onClick={() => setShowImport(true)}
            className="w-full py-4 text-left font-medium border-t border-white/[.06] transition-opacity active:opacity-60"
          >
            Import Plan (JSON)
          </button>
        ) : (
          <div className="space-y-3">
            <label className="text-sm font-semibold block">Paste a Program Pack</label>
            <p className="text-xs text-secondary">
              Swaps in a new plan. Your workout history and weights are kept — matching
              exercises carry their weight forward.
            </p>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder='{"packId":"my_plan","name":"My Plan","sessions":[...]}'
              rows={6}
              className="w-full px-3 py-2 bg-white/[.08] border border-white/10 rounded-xl text-xs font-mono"
            />
            {importError && (
              <p className="notice text-xs text-red-400 break-words">{importError}</p>
            )}
            <div className="flex gap-2">
              <button
                onClick={handleImport}
                disabled={importing || !importText.trim()}
                className="btn-primary flex-1 py-2 font-medium text-sm transition-colors disabled:opacity-50"
              >
                {importing ? 'Importing...' : 'Import & Activate'}
              </button>
              <button
                onClick={() => { setShowImport(false); setImportError(null) }}
                className="btn-glass flex-1 py-2 text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Account */}
      <div className="pb-10">
        <div className="py-4 border-t border-white/[.06]">
          <div className="text-xs text-secondary uppercase tracking-wide mb-1">Account</div>
          <div className="text-sm font-medium">{displayName(user)}</div>
          <div className="text-xs text-secondary">{user?.email}</div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full py-4 text-left font-medium border-t border-white/[.06] transition-opacity active:opacity-60"
        >
          Sign Out
        </button>
        <button
          onClick={handleReset}
          className="w-full py-4 text-left font-medium text-red-400 border-t border-white/[.06] transition-opacity active:opacity-60"
        >
          Clear Data on This Device
        </button>
        <button
          onClick={handleDeleteAccount}
          className="w-full py-4 text-left text-sm text-secondary border-t border-white/[.06] transition-opacity active:opacity-60"
        >
          Delete Account
        </button>
      </div>
    </div>
  )
}
