import { useState, useEffect } from 'react'
import { useSettings } from '../../contexts/SettingsContext'
import { useRestTimer } from '../../contexts/RestTimerContext'
import { shouldSuggestWeightIncrease, computeNextSetWeight } from '../../utils/progressionEngine'
import { getRecentSessionsForExercise } from '../../db/workoutLog'
import SetRow from './SetRow'
import SwapDrawer from './SwapDrawer'
import BonusRound from './BonusRound'
import ExerciseHistorySheet, { avgRpe, formatSets } from './ExerciseHistorySheet'
import BodyPortal from '../BodyPortal'

const fmtDate = d => new Date(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })

export default function ExerciseCard({
  exercise,
  exerciseIndex,
  progressionRules,
  onSetComplete,
  onSuggestWeight,
  onSwap,
  onBonusRound,
  isAllDone,
  isActive = true,
  plain = false,
  workoutDate = null
}) {
  const [showSwap, setShowSwap] = useState(false)
  const [openIndex, setOpenIndex] = useState(null)
  const [history, setHistory] = useState(null) // null = not loaded, [] = none
  const [showLast, setShowLast] = useState(false)
  const [showSheet, setShowSheet] = useState(false)
  const { compoundRest, isolationRest } = useSettings()
  const restTimer = useRestTimer()

  // A rest started from one of this exercise's sets.
  const restKeyPrefix = `${exercise.exerciseId}:`
  const restHere = restTimer.active && !!restTimer.timerKey?.startsWith(restKeyPrefix)
  const countdownVisible = restHere && openIndex != null && isActive
  const { setInlineKey } = restTimer
  const restKey = restTimer.timerKey

  // While the open set shows the countdown in focus, the app-wide bar hides.
  useEffect(() => {
    if (!countdownVisible) return
    setInlineKey(restKey)
    return () => setInlineKey(k => (k === restKey ? null : k))
  }, [countdownVisible, restKey, setInlineKey])

  async function toggleLast() {
    if (history == null) {
      const sessions = await getRecentSessionsForExercise(exercise.exerciseId, exercise.name, {
        excludeDate: workoutDate,
        limit: 5
      })
      setHistory(sessions)
    }
    setShowLast(v => !v)
  }

  function handleDone(setIdx, reps, rpe, weight) {
    const set = exercise.sets[setIdx]
    onSetComplete(exerciseIndex, setIdx, reps, rpe, weight)
    if (shouldSuggestWeightIncrease(set, exercise.sets.length, setIdx + 1, progressionRules)) {
      onSuggestWeight(setIdx, computeNextSetWeight(set.weight, exercise.movementType, progressionRules))
    }

    const duration = exercise.movementType === 'isolation' ? isolationRest : compoundRest
    restTimer.startTimer(duration, `${restKeyPrefix}${set.setNumber}`, exercise.name)

    // Move straight on to the next open set so its inputs stay on screen;
    // its Done button shows the rest countdown until the rest ends.
    const next = exercise.sets.findIndex((s, i) => i > setIdx && !s.completed)
    setOpenIndex(next >= 0 ? next : null)
  }

  const last = history?.[0]
  const lastRpe = last ? avgRpe(last.sets) : null

  return (
    <>
      <div className={plain ? 'py-5' : 'glass-card p-5'}>
        <button
          onClick={toggleLast}
          aria-expanded={showLast}
          className="w-full text-left"
        >
          <h3 className="font-semibold text-lg">{exercise.name}</h3>
          {exercise.weightReason && (
            <p className="text-xs text-secondary mt-1">{exercise.weightReason}</p>
          )}
        </button>

        {showLast && (
          <div className="mt-2 flex items-baseline gap-3 text-sm">
            {last ? (
              <>
                <p className="flex-1 min-w-0 text-secondary">
                  <span className="text-[color:var(--ink)]">Last</span> · {fmtDate(last.date)} ·{' '}
                  <span className="tabular-nums">{formatSets(last.sets)}</span>
                  {lastRpe != null && <> · RPE {lastRpe.toFixed(1)}</>}
                </p>
                <button onClick={() => setShowSheet(true)} className="shrink-0 text-secondary hover:text-[color:var(--ink)]">
                  More
                </button>
              </>
            ) : (
              <p className="text-secondary">No previous sessions yet.</p>
            )}
          </div>
        )}

        <div className="mt-2">
          {exercise.sets.map((set, setIdx) => (
            <SetRow
              key={setIdx}
              set={set}
              exercise={exercise}
              isOpen={openIndex === setIdx}
              rest={openIndex === setIdx && restHere ? {
                secondsRemaining: restTimer.secondsRemaining,
                totalSeconds: restTimer.totalSeconds,
                skip: restTimer.skipTimer
              } : null}
              onOpen={() => setOpenIndex(setIdx)}
              onCancel={() => setOpenIndex(null)}
              onDone={(reps, rpe, weight) => handleDone(setIdx, reps, rpe, weight)}
            />
          ))}
        </div>

        <button
          onClick={() => setShowSwap(true)}
          className="mt-4 w-full py-2 text-sm font-medium text-secondary hover:bg-white/[.06] rounded-full transition-colors"
        >
          ⇄ Swap
        </button>

        {isAllDone && (
          <BonusRound
            onSelect={onBonusRound}
            sessionLabel={exercise.sessionLabel}
          />
        )}
      </div>

      {showSheet && history?.length > 0 && (
        <BodyPortal>
          <ExerciseHistorySheet name={exercise.name} sessions={history} onClose={() => setShowSheet(false)} />
        </BodyPortal>
      )}

      {showSwap && (
        <BodyPortal>
        <SwapDrawer
          exercise={exercise}
          onSelect={(newExercise) => {
            onSwap(newExercise)
            setShowSwap(false)
          }}
          onClose={() => setShowSwap(false)}
        />
        </BodyPortal>
      )}
    </>
  )
}
