import { useState, useEffect } from 'react'
import { useSettings } from '../../contexts/SettingsContext'

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

/**
 * One set: a summary row, or (when open) the input panel. The card decides
 * which set is open and whether a rest is running; during a rest the Done
 * button turns into the countdown so the inputs stay visible.
 */
export default function SetRow({ set, exercise, isOpen, rest, onOpen, onCancel, onDone }) {
  const [reps, setReps] = useState(String(set.targetReps))
  const [weight, setWeight] = useState(formatNumber(set.weight || 0))
  const [repsTouched, setRepsTouched] = useState(false)
  const [weightTouched, setWeightTouched] = useState(false)
  const [rpe, setRpe] = useState(8.5)
  const { displayWeight } = useSettings()

  // Prefill from the plan (or the weight carried from the previous set)
  // each time this set opens.
  useEffect(() => {
    if (!isOpen) return
    setReps(String(set.targetReps))
    setWeight(formatNumber(set.weight || 0))
    setRepsTouched(false)
    setWeightTouched(false)
    setRpe(set.rpe ?? 8.5)
  }, [isOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // A weight carried over from the previous set (or a suggested increase)
  // updates the prefill as long as the user hasn't typed their own.
  useEffect(() => {
    if (isOpen && !weightTouched) setWeight(formatNumber(set.weight || 0))
  }, [set.weight]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) {
    return (
      <button
        onClick={onOpen}
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
    onDone(finalReps, rpe, finalWeight)
  }

  const restProgress = rest ? (rest.totalSeconds - rest.secondsRemaining) / rest.totalSeconds : 0

  return (
    <div className="-mx-3 my-1 px-3 py-3 space-y-3 rounded-2xl bg-white/[.045]">
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

      <div className="flex gap-2 pt-2">
        {rest ? (
          <button
            onClick={rest.skip}
            aria-label="Skip rest"
            className="btn-glass relative flex-1 py-2 overflow-hidden font-medium tabular-nums"
          >
            <span
              className="absolute inset-y-0 left-0 bg-white/[.08] transition-[width] duration-300 ease-linear"
              style={{ width: `${restProgress * 100}%` }}
              aria-hidden="true"
            />
            <span className="relative">
              Rest {Math.floor(rest.secondsRemaining / 60)}:{String(rest.secondsRemaining % 60).padStart(2, '0')}
            </span>
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            className="btn-accent flex-1 py-2 font-medium transition-colors"
          >
            Done
          </button>
        )}
        <button
          onClick={onCancel}
          aria-label="Close"
          className="w-11 shrink-0 flex items-center justify-center rounded-full text-secondary hover:bg-white/[.06] transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
