import { useState, useEffect, useRef } from 'react'
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

function Stepper({ label, value, touched, onChange, onStep, inputMode }) {
  const stepButton = 'w-12 h-12 shrink-0 flex items-center justify-center border border-divider rounded text-xl font-medium hover:bg-divider transition-colors'
  return (
    <div className="border border-divider rounded p-2">
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
          className={`min-w-0 flex-1 h-12 px-1 border border-divider rounded text-xl font-semibold text-center ${
            touched ? 'text-black' : 'text-secondary'
          }`}
        />
        <button type="button" onClick={() => onStep(-1)} className={stepButton} aria-label={`${label} minus`}>
          −
        </button>
      </div>
    </div>
  )
}

export default function SetRow({ set, setIndex, exerciseIndex, exercise, onComplete }) {
  const [logging, setLogging] = useState(false)
  const [reps, setReps] = useState(String(set.targetReps))
  const [weight, setWeight] = useState(formatNumber(set.weight || 0))
  const [repsTouched, setRepsTouched] = useState(false)
  const [weightTouched, setWeightTouched] = useState(false)
  const [rpe, setRpe] = useState(8.5)
  const [resting, setResting] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [totalTime, setTotalTime] = useState(0)
  const intervalRef = useRef(null)
  const { displayWeight, compoundRest, isolationRest } = useSettings()

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

  useEffect(() => {
    if (!resting || timeLeft <= 0) return

    intervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        const newTime = prev - 1
        if (newTime <= 0) {
          setResting(false)
          return 0
        }
        return newTime
      })
    }, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [resting, timeLeft])

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
        className={`w-full p-3 rounded border transition-all ${
          set.completed
            ? 'border-divider bg-divider/50'
            : 'border-divider hover:border-black hover:bg-divider/30'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-medium">Set {set.setNumber}</span>
          <div className="flex items-center gap-3">
            {set.completed ? (
              <>
                <span className="text-sm text-black">{set.actualReps}×{set.weight} kg</span>
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

    // Start rest timer
    const duration = exercise.movementType === 'isolation' ? isolationRest : compoundRest
    setTotalTime(duration)
    setTimeLeft(duration)
    setResting(true)
  }

  function skipTimer() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setResting(false)
  }

  if (resting) {
    const progress = (totalTime - timeLeft) / totalTime
    const minutes = Math.floor(timeLeft / 60)
    const seconds = timeLeft % 60

    return (
      <div className="p-3 border border-black rounded-lg bg-white">
        <button
          onClick={skipTimer}
          className="w-full py-4 text-white font-semibold rounded transition-all"
          style={{
            background: `linear-gradient(to right, white 0%, white ${progress * 100}%, black ${progress * 100}%, black 100%)`
          }}
        >
          <span style={{ color: progress > 0.5 ? 'black' : 'white', fontWeight: 'bold' }}>
            {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          </span>
        </button>
      </div>
    )
  }

  return (
    <div className="p-3 border border-black rounded-lg bg-white space-y-3">
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
            background: `linear-gradient(to right, black 0%, black ${((rpe - 6) / 4) * 100}%, #f0f0f0 ${((rpe - 6) / 4) * 100}%, #f0f0f0 100%)`,
            WebkitAppearance: 'none',
          }}
        />
        <style>{`
          input[type="range"]::-webkit-slider-thumb {
            appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: black;
            cursor: pointer;
            border: none;
          }
          input[type="range"]::-moz-range-thumb {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: black;
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
          className="flex-1 py-2 bg-black text-white font-medium rounded transition-colors hover:bg-[#333333]"
        >
          Done
        </button>
        <button
          onClick={() => {
            setLogging(false)
            resetInputs()
          }}
          className="px-3 py-2 border border-divider rounded text-secondary hover:bg-divider transition-colors"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
