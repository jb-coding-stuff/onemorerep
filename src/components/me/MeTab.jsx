import { useState, useEffect } from 'react'
import { db } from '../../db/db'
import {
  activateDefaultPack,
  importPack,
  getAvailablePacks,
  switchPack
} from '../../program/localProvider'
import { BackIcon, IconButton } from '../icons'
import { useSettings } from '../../contexts/SettingsContext'

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return s === 0 ? `${m}:00` : `${m}:${String(s).padStart(2, '0')}`
}

export default function MeTab({ onBack }) {
  const [loading, setLoading] = useState(false)
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

  useEffect(() => {
    getAvailablePacks()
      .then(({ packs, activePackId }) => {
        setPacks([...packs].sort((a, b) => a.name.localeCompare(b.name)))
        setActivePackId(activePackId)
      })
      .catch(err => console.error('Failed to load plans:', err))
  }, [])

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
    if (confirm('This will delete all data. Are you sure?')) {
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

  return (
    <div className="px-4 space-y-6 max-w-md mx-auto" style={{ paddingTop: '1.5rem' }}>
      <div className="flex items-center gap-2">
        <IconButton label="Back" onClick={() => onBack?.()}><BackIcon /></IconButton>
        <h1 className="text-2xl font-bold">Settings</h1>
      </div>

      {/* Rest Timers */}
      <div className="glass-card p-5 space-y-4">
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
                className="btn-glass w-9 h-9 flex items-center justify-center transition-colors text-lg"
              >
                −
              </button>
              <span className="text-sm font-medium w-10 text-center">{formatDuration(val)}</span>
              <button
                onClick={() => adjust(type, 15)}
                className="btn-glass w-9 h-9 flex items-center justify-center transition-colors text-lg"
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
        <div className="glass-card p-5 space-y-3">
          <h2 className="text-sm font-semibold">Training Plan</h2>
          <div className="space-y-2">
            {packs.map(pack => {
              const isActive = pack.packId === activePackId
              const isSwitching = pack.packId === switchingTo
              return (
                <button
                  key={pack.packId}
                  onClick={() => handleSwitchPack(pack)}
                  disabled={isActive || !!switchingTo}
                  className={`glass-inset w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors disabled:cursor-default ${
                    isActive ? 'ring-1 ring-white/30 bg-white/[.06]' : 'hover:bg-white/[.08]'
                  } ${switchingTo && !isSwitching ? 'opacity-50' : ''}`}
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
              )
            })}
          </div>
          {switchError && (
            <p className="text-xs glass-inset p-3 break-words">{switchError}</p>
          )}
          {offlineSwitch && (
            <div className="text-xs glass-inset p-3 space-y-2">
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

      {/* Load Program */}
      <div>
        <button
          onClick={handleLoadProgram}
          disabled={loading}
          className="btn-glass w-full py-3 font-medium transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading Program...' : 'Load Default Program'}
        </button>
      </div>

      {/* Import Plan (JSON) */}
      <div className="space-y-3">
        {!showImport ? (
          <button
            onClick={() => setShowImport(true)}
            className="btn-glass w-full py-3 font-medium transition-colors"
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
              <p className="text-xs glass-inset p-3 break-words">{importError}</p>
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

      {/* Reset */}
      <div className="pb-10">
        <button
          onClick={handleReset}
          className="btn-glass w-full py-3 font-medium text-red-400 transition-colors"
        >
          Reset All Data
        </button>
      </div>
    </div>
  )
}
