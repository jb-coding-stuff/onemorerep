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

function Stepper({ label, unit, value, touched, onChange, onStep, inputMode }) {
  const stepButton = 'w-12 h-12 shrink-0 flex items-center justify-center rounded-full text-2xl font-light text-secondary hover:text-[color:var(--ink)] hover:bg-white/[.06] transition-colors'
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={() => onStep(1)} className={stepButton} aria-label={`${label} plus`}>
        +
      </button>
      <label className="min-w-0 flex-1 flex items-baseline justify-center gap-1.5">
        <input
          type="text"
          inputMode={inputMode}
          value={value}
          aria-label={label}
          onChange={e => onChange(e.target.value)}
          onFocus={e => e.target.select()}
          size={Math.max(1, String(value).length)}
          className={`bg-transparent outline-none text-3xl font-semibold text-right tabular-nums ${
            touched ? 'text-[color:var(--ink)]' : 'text-secondary'
          }`}
        />
        <span className="text-sm text-secondary">{unit}</span>
      </label>
      <button type="button" onClick={() => onStep(-1)} className={stepButton} aria-label={`${label} minus`}>
        −
      </button>
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
        className="w-full py-3 border-b border-white/[.06] last:border-b-0 transition-colors"
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
      <div className="py-2">
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
    <div className="py-3 space-y-3 border-b border-white/[.06] last:border-b-0">
      <span className="text-sm font-medium">Set {set.setNumber}</span>

      <Stepper
        label="Weight"
        unit="kg"
        value={weight}
        touched={weightTouched}
        inputMode="decimal"
        onChange={v => { setWeight(v); setWeightTouched(true) }}
        onStep={stepWeight}
      />
      <Stepper
        label="Reps"
        unit="×"
        value={reps}
        touched={repsTouched}
        inputMode="numeric"
        onChange={v => { setReps(v.replace(/\D/g, '')); setRepsTouched(true) }}
        onStep={stepReps}
      />

      {/* RPE slider */}
      <div>
        <div className="text-xs text-secondary mb-2">RPE {rpe.toFixed(1)}</div>
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
          aria-label="Cancel"
          className="w-11 shrink-0 flex items-center justify-center rounded-full text-secondary hover:bg-white/[.06] transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
