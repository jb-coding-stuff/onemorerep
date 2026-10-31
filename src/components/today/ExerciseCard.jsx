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
import { NoteIcon } from '../icons'

const fmtDate = d => new Date(d).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })

export default function ExerciseCard({
  exercise,
  exerciseIndex,
  progressionRules,
  onSetComplete,
  onSuggestWeight,
  onSwap,
  onNote,
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
  const [editingNote, setEditingNote] = useState(false)
  const [draft, setDraft] = useState('')
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

  // Load recent sessions up front: the last session's comment shows under the title.
  useEffect(() => {
    let cancelled = false
    getRecentSessionsForExercise(exercise.exerciseId, exercise.name, { excludeDate: workoutDate, limit: 5 })
      .then(sessions => { if (!cancelled) setHistory(sessions) })
      .catch(() => { if (!cancelled) setHistory([]) })
    return () => { cancelled = true }
  }, [exercise.exerciseId, exercise.name, workoutDate])

  function toggleLast() {
    setShowLast(v => !v)
  }

  function startNote() {
    setDraft(exercise.note || '')
    setEditingNote(true)
  }

  function saveNote() {
    const text = draft.trim()
    if (text !== (exercise.note || '')) onNote?.(text)
    setEditingNote(false)
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

  const last = history?.find(s => s.sets.length)
  const prevNote = history?.[0]?.note ? history[0] : null
  const withSets = history?.filter(s => s.sets.length) || []
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

        {prevNote && (
          <p className="mt-1.5 flex gap-1.5 text-sm text-secondary">
            <span className="mt-0.5 shrink-0"><NoteIcon size={14} /></span>
            <span className="min-w-0 whitespace-pre-wrap">
              <span className="italic">{prevNote.note}</span> · {fmtDate(prevNote.date)}
            </span>
          </p>
        )}

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

        {editingNote ? (
          <div className="mt-4">
            <textarea
              autoFocus
              rows={2}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder="Comment for next time, e.g. seat 4, felt easy"
              aria-label="Exercise comment"
              className="w-full px-3 py-2.5 bg-white/[.06] border border-white/10 rounded-xl text-sm resize-none"
            />
            <div className="flex gap-2 mt-2">
              <button onClick={saveNote} className="btn-primary flex-1 py-2 text-sm font-medium">Save</button>
              <button onClick={() => setEditingNote(false)} className="btn-glass flex-1 py-2 text-sm">Cancel</button>
            </div>
          </div>
        ) : exercise.note ? (
          <button onClick={startNote} className="mt-4 w-full flex gap-1.5 text-left text-sm" aria-label="Edit comment">
            <span className="mt-0.5 shrink-0 text-secondary"><NoteIcon size={14} /></span>
            <span className="min-w-0 whitespace-pre-wrap">{exercise.note}</span>
          </button>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            onClick={() => setShowSwap(true)}
            className="flex-1 py-2 text-sm font-medium text-secondary hover:bg-white/[.06] rounded-full transition-colors"
          >
            ⇄ Swap
          </button>
          {!editingNote && (
            <button
              onClick={startNote}
              className="flex-1 py-2 flex items-center justify-center gap-1.5 text-sm font-medium text-secondary hover:bg-white/[.06] rounded-full transition-colors"
            >
              <NoteIcon size={16} /> {exercise.note ? 'Edit comment' : 'Comment'}
            </button>
          )}
        </div>

        {isAllDone && (
          <BonusRound
            onSelect={onBonusRound}
            sessionLabel={exercise.sessionLabel}
          />
        )}
      </div>

      {showSheet && withSets.length > 0 && (
        <BodyPortal>
          <ExerciseHistorySheet name={exercise.name} sessions={withSets} onClose={() => setShowSheet(false)} />
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
