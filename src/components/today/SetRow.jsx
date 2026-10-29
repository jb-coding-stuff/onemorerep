import { useState, useEffect } from 'react'
import { useSettings } from '../../contexts/SettingsContext'
import { useRestTimer } from '../../contexts/RestTimerContext'

const WEIGHT_STEP = 2.5
const REPS_STEP = 1

function formatNumber(n) {
  return String(Number(n.toFixed(2)))
}

// Accepts "62,5" (German keypad) as well as "62.5".
function parseNumber(text) {
  const n = parseFloat(String(text).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function Stepper({ label, value, touched, onChange, onStep, inputMode }) {
  const stepButton = 'btn-glass w-12 h-12 shrink-0 flex items-center justify-center text-xl font-medium transition-colors'
  return (
    <div className="glass-inset p-2">
      <div className="text-xs font-medium mb-2 text-center">{label}</div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onStep(1)} className={stepButton} aria-label={`${label} plus`}>
          +
        </button>
        <input
          type="text"
          inputMode={inputMode}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={e => e.target.select()}
          className={`min-w-0 flex-1 h-12 px-1 bg-white/[.06] border border-white/10 rounded-xl text-xl font-semibold text-center ${
            touched ? 'text-[color:var(--ink)]' : 'text-secondary'
          }`}
        />
        <button type="button" onClick={() => onStep(-1)} className={stepButton} aria-label={`${label} minus`}>
          −
        </button>
      </div>
    </div>
  )
}

export default function SetRow({ set, setIndex, exerciseIndex, exercise, onComplete, isActiveCard = true }) {
  const [logging, setLogging] = useState(false)
  const [reps, setReps] = useState(String(set.targetReps))
  const [weight, setWeight] = useState(formatNumber(set.weight || 0))
  const [repsTouched, setRepsTouched] = useState(false)
  const [weightTouched, setWeightTouched] = useState(false)
  const [rpe, setRpe] = useState(8.5)
  const { displayWeight, compoundRest, isolationRest } = useSettings()
  const restTimer = useRestTimer()
  const timerKey = `${exercise.exerciseId}:${set.setNumber}`
  const resting = restTimer.active && restTimer.timerKey === timerKey
  const { setInlineKey } = restTimer

  // Tell the app-wide timer bar this set is showing the countdown in focus.
  useEffect(() => {
    if (!resting || !isActiveCard) return
    setInlineKey(timerKey)
    return () => setInlineKey(k => (k === timerKey ? null : k))
  }, [resting, isActiveCard, timerKey, setInlineKey])

  // Prevent scrolling when logging set
  useEffect(() => {
    if (logging) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'auto'
    }
    return () => {
      document.body.style.overflow = 'auto'
    }
  }, [logging])

  function resetInputs() {
    setReps(String(set.targetReps))
    setWeight(formatNumber(set.weight || 0))
    setRepsTouched(false)
    setWeightTouched(false)
    setRpe(8.5)
  }

  if (!logging && !resting) {
    return (
      <button
        onClick={() => {
          resetInputs()
          setLogging(true)
        }}
        className={`w-full p-3 rounded-2xl border transition-all ${
          set.completed
            ? 'border-white/10 bg-white/[.08]'
            : 'border-white/[.06] bg-white/[.03] hover:bg-white/[.08]'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">Set {set.setNumber}</span>
          <div className="flex items-center gap-3">
            {set.completed ? (
              <>
                <span className="text-sm text-[color:var(--ink)]">{set.actualReps}×{set.weight} kg</span>
                <span className="text-lg">✓</span>
              </>
            ) : (
              <span className="text-sm text-secondary">{displayWeight(set.weight)} × {set.targetReps}</span>
            )}
          </div>
        </div>
      </button>
    )
  }

  function stepWeight(direction) {
    const current = parseNumber(weight) ?? set.weight ?? 0
    setWeight(formatNumber(Math.max(0, current + direction * WEIGHT_STEP)))
    setWeightTouched(true)
  }

  function stepReps(direction) {
    const current = parseInt(reps, 10)
    const base = Number.isFinite(current) ? current : set.targetReps
    setReps(String(Math.max(0, base + direction * REPS_STEP)))
    setRepsTouched(true)
  }

  function handleSubmit() {
    const parsedReps = parseInt(reps, 10)
    const finalReps = Number.isFinite(parsedReps) ? parsedReps : set.targetReps
    const finalWeight = parseNumber(weight) ?? set.weight ?? 0

    // Mark set complete immediately
    onComplete(finalReps, rpe, finalWeight)
    setLogging(false)

    const duration = exercise.movementType === 'isolation' ? isolationRest : compoundRest
    restTimer.startTimer(duration, timerKey, exercise.name)
  }

  if (resting) {
    const { secondsRemaining, totalSeconds } = restTimer
    const progress = (totalSeconds - secondsRemaining) / totalSeconds
    const minutes = Math.floor(secondsRemaining / 60)
    const seconds = secondsRemaining % 60

    return (
      <div className="p-1.5 glass-inset">
        <button
          onClick={restTimer.skipTimer}
          className="w-full py-4 font-semibold rounded-xl transition-all"
          style={{
            background: `linear-gradient(to right, rgba(255,255,255,.06) 0%, rgba(255,255,255,.06) ${progress * 100}%, rgba(255,255,255,.85) ${progress * 100}%, rgba(255,255,255,.85) 100%)`
          }}
        >
          <span style={{ color: progress > 0.5 ? 'var(--ink)' : '#0a0a0c', fontWeight: 'bold' }}>
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </span>
        </button>
      </div>
    )
  }

  return (
    <div className="p-3 glass-inset ring-1 ring-white/15 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Set {set.setNumber}</span>
        <span className="text-xs text-secondary">Target {displayWeight(set.weight)} × {set.targetReps}</span>
      </div>

      <Stepper
        label="Weight (kg)"
        value={weight}
        touched={weightTouched}
        inputMode="decimal"
        onChange={v => { setWeight(v); setWeightTouched(true) }}
        onStep={stepWeight}
      />
      <Stepper
        label="Reps"
        value={reps}
        touched={repsTouched}
        inputMode="numeric"
        onChange={v => { setReps(v.replace(/\D/g, '')); setRepsTouched(true) }}
        onStep={stepReps}
      />

      {/* RPE slider */}
      <div>
        <label className="block text-xs font-medium mb-2">RPE: {rpe.toFixed(1)}</label>
        <input
          type="range"
          min="6"
          max="10"
          step="0.5"
          value={rpe}
          onChange={e => setRpe(parseFloat(e.target.value))}
          className="w-full h-2 rounded appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, rgba(255,255,255,.85) 0%, rgba(255,255,255,.85) ${((rpe - 6) / 4) * 100}%, rgba(255,255,255,.12) ${((rpe - 6) / 4) * 100}%, rgba(255,255,255,.12) 100%)`,
            WebkitAppearance: 'none',
          }}
        />
        <style>{`
          input[type="range"]::-webkit-slider-thumb {
            appearance: none;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            background: #fff;
            box-shadow: 0 1px 4px rgba(0,0,0,.25);
            cursor: pointer;
            border: none;
          }
          input[type="range"]::-moz-range-thumb {
            width: 22px;
            height: 22px;
            border-radius: 50%;
            background: #fff;
            box-shadow: 0 1px 4px rgba(0,0,0,.25);
            cursor: pointer;
            border: none;
          }
        `}</style>
        <div className="text-xs text-secondary mt-1 flex justify-between">
          <span>Easy</span>
          <span>Hard</span>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSubmit}
          className="btn-accent flex-1 py-2 font-medium transition-colors"
        >
          Done
        </button>
        <button
          onClick={() => {
            setLogging(false)
            resetInputs()
          }}
          className="btn-glass px-4 py-2 text-secondary transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
