import { useReducer, useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { getProgressionState, getProgressionStates, initializeProgressionState } from '../../db/progression'
import { getLastWorkoutForExercise } from '../../db/workoutLog'
import { computeSessionWeight, updateProgressionAfterWorkout } from '../../utils/progressionEngine'
import { saveActiveWorkout, loadActiveWorkout, clearActiveWorkout } from '../../db/activeWorkout'
import { syncLiveWorkout, deleteLoggedWorkout } from '../../db/liveWorkout'
import ExerciseCard from './ExerciseCard'
import PostWorkoutSummary from './PostWorkoutSummary'
import ExerciseWheel from './ExerciseWheel'
import { BackIcon, ListIcon, FocusIcon, IconButton } from '../icons'

/** "today", "yesterday", "3 days ago", or a short date after two weeks. */
function formatLastDone(iso) {
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(iso))) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days <= 14) return `${days} days ago`
  return new Date(iso).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })
}

const AUTO_END_AFTER_MS = 12 * 60 * 60 * 1000

const initialState = {
  mode: 'picking', // 'picking' | 'logging' | 'summary'
  selectedSession: null,
  currentSessionIndex: 0,
  exercises: [],
  startTime: null,
  isOverviewMode: false
}

function workoutReducer(state, action) {
  switch (action.type) {
    case 'CYCLE_SESSION':
      return {
        ...state,
        currentSessionIndex: action.payload.nextIndex
      }

    case 'SELECT_SESSION':
      return {
        ...state,
        selectedSession: action.payload.sessionLabel,
        exercises: action.payload.exercises,
        mode: 'logging',
        startTime: Date.now()
      }

    case 'UPDATE_EXERCISE_SET': {
      const { exerciseIndex, setIndex, reps, rpe, weight } = action.payload
      const updated = [...state.exercises]
      if (updated[exerciseIndex]) {
        updated[exerciseIndex].sets[setIndex] = {
          ...updated[exerciseIndex].sets[setIndex],
          actualReps: reps,
          rpe,
          weight,
          completed: true,
          completedAt: Date.now()
        }
        // Update weight for remaining incomplete sets of this exercise
        for (let i = setIndex + 1; i < updated[exerciseIndex].sets.length; i++) {
          if (!updated[exerciseIndex].sets[i].completed) {
            updated[exerciseIndex].sets[i].weight = weight
          }
        }
        updated[exerciseIndex].setsCompleted = updated[exerciseIndex].sets.filter(s => s.completed).length
      }
      return { ...state, exercises: updated }
    }

    case 'SUGGEST_WEIGHT': {
      const { exerciseIndex, setIndex, newWeight } = action.payload
      const updated = [...state.exercises]
      if (updated[exerciseIndex] && updated[exerciseIndex].sets[setIndex + 1]) {
        updated[exerciseIndex].sets[setIndex + 1].weight = newWeight
      }
      return { ...state, exercises: updated }
    }

    case 'SWAP_EXERCISE': {
      const { exerciseIndex, newExercise } = action.payload
      const updated = [...state.exercises]
      updated[exerciseIndex] = {
        ...newExercise,
        sets: updated[exerciseIndex].sets.map((s, i) => ({
          setNumber: i + 1,
          targetReps: newExercise.targetReps,
          actualReps: null,
          weight: newExercise.startingWeight || 0,
          rpe: null,
          completed: false
        })),
        wasSwapped: true,
        swappedFrom: updated[exerciseIndex].exerciseId,
        setsCompleted: 0
      }
      return { ...state, exercises: updated }
    }

    case 'ADD_BONUS_ROUND': {
      const { bonusExercise } = action.payload
      const newExercise = {
        ...bonusExercise,
        sets: [
          { setNumber: 1, targetReps: bonusExercise.targetReps, actualReps: null, weight: bonusExercise.startingWeight || 0, rpe: null, completed: false },
          { setNumber: 2, targetReps: bonusExercise.targetReps, actualReps: null, weight: bonusExercise.startingWeight || 0, rpe: null, completed: false }
        ],
        setsCompleted: 0,
        isBonus: true
      }
      return {
        ...state,
        exercises: [...state.exercises, newExercise]
      }
    }

    case 'FINISH_WORKOUT':
      return {
        ...state,
        mode: 'summary'
      }

    case 'SET_LOG_ID':
      return state.startTime === action.payload.startTime
        ? { ...state, logId: action.payload.logId }
        : state

    case 'RESUME_LOGGING':
      return {
        ...state,
        mode: 'logging'
      }

    case 'TOGGLE_OVERVIEW':
      return {
        ...state,
        isOverviewMode: !state.isOverviewMode
      }

    case 'REORDER_EXERCISES': {
      const { fromIndex, toIndex } = action.payload
      const updated = [...state.exercises]
      const [removed] = updated.splice(fromIndex, 1)
      updated.splice(toIndex, 0, removed)
      return { ...state, exercises: updated }
    }

    case 'SET_SESSION_INDEX':
      return {
        ...state,
        currentSessionIndex: action.payload.index
      }

    case 'SKIP_WORKOUT':
      return initialState

    case 'RESTORE_WORKOUT':
      return action.payload

    case 'RESET':
      return initialState

    default:
      return state
  }
}

export default function TodayTab({ onBack }) {
  const program = useLiveQuery(() => db.program.toArray().then(p => p[0]))
  // Most recent date each session label was trained.
  const lastDone = useLiveQuery(async () => {
    const map = {}
    for (const w of await db.workoutLog.orderBy('date').toArray()) map[w.sessionLabel] = w.date
    return map
  }, [], {})
  const [state, dispatch] = useReducer(workoutReducer, initialState)
  const [suggestedSession, setSuggestedSession] = useState(null)
  // In-progress workout whose session isn't in the current plan (plan was switched).
  const [staleWorkout, setStaleWorkout] = useState(null)

  const sessions = program?.sessions || []
  const progressionRules = program?.progressionRules

  // Save active workout to database whenever state changes
  useEffect(() => {
    saveActiveWorkout(state)
  }, [state])

  // Log completed sets to History + Supabase as they happen.
  const loggedSignature = state.mode === 'picking' ? '' : state.exercises
    .map(ex => ex.sets.filter(s => s.completed).map(s => `${s.actualReps}x${s.weight}@${s.rpe}`).join(','))
    .join('|')
  useEffect(() => {
    if (!loggedSignature.replace(/\|/g, '')) return
    const { startTime } = state
    syncLiveWorkout(state)
      .then(logId => {
        if (logId != null && logId !== state.logId) dispatch({ type: 'SET_LOG_ID', payload: { startTime, logId } })
      })
      .catch(err => console.error('Failed to log workout progress:', err))
  }, [loggedSignature]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load active workout on mount, or determine suggested next session
  useEffect(() => {
    if (sessions.length === 0) return
    if (state.mode !== 'picking') return

    async function loadOrStartWorkout() {
      let activeWorkout = await loadActiveWorkout()
      // Sets are logged as they happen, so a workout left open (no Finish)
      // just ends once it's old enough; the next session gets suggested.
      if (activeWorkout && Date.now() - activeWorkout.startTime > AUTO_END_AFTER_MS) {
        if (activeWorkout.exercises?.some(ex => ex.setsCompleted > 0)) {
          await db.settings.put({ key: 'lastSessionLabel', value: activeWorkout.selectedSession })
        }
        await clearActiveWorkout()
        activeWorkout = null
      }
      if (activeWorkout) {
        if (sessions.some(s => s.label === activeWorkout.selectedSession)) {
          dispatch({ type: 'RESTORE_WORKOUT', payload: activeWorkout })
          return
        }
        setStaleWorkout(activeWorkout)
      }

      const lastSessionSetting = await db.settings.get('lastSessionLabel')
      const lastSessionLabel = lastSessionSetting?.value

      let nextSessionLabel = sessions[0].label
      if (lastSessionLabel) {
        const lastSessionIdx = sessions.findIndex(s => s.label === lastSessionLabel)
        if (lastSessionIdx >= 0) {
          nextSessionLabel = sessions[(lastSessionIdx + 1) % sessions.length].label
        }
      }

      setSuggestedSession(nextSessionLabel)
    }

    loadOrStartWorkout()
  }, [sessions.length, state.mode])

  async function startSession(sessionLabel) {
    const session = sessions.find(s => s.label === sessionLabel)
    if (!session) return

    for (const exercise of session.exercises) {
      await initializeProgressionState(exercise.exerciseId, exercise)
    }

    const progressionMap = await getProgressionStates(
      session.exercises.map(e => e.exerciseId)
    )

    const exercisesWithWeights = await Promise.all(
      session.exercises.map(async exercise => {
        const progression = progressionMap[exercise.exerciseId]
        const lastWorkoutData = await getLastWorkoutForExercise(exercise.exerciseId)

        let sessionWeight = progression?.currentWeight || exercise.startingWeight || 0
        let weightReason = null

        if (lastWorkoutData?.exercise?.sets) {
          const { weight, reason } = computeSessionWeight(progression, {
            exercise,
            sets: lastWorkoutData.exercise.sets
          }, progressionRules)
          sessionWeight = weight
          weightReason = reason
        }

        return {
          exerciseId: exercise.exerciseId,
          name: exercise.name,
          movementType: exercise.movementType,
          targetReps: exercise.targetReps,
          startingWeight: sessionWeight,
          sets: Array.from({ length: exercise.sets }, (_, i) => ({
            setNumber: i + 1,
            targetReps: exercise.targetReps,
            actualReps: null,
            weight: sessionWeight,
            rpe: null,
            completed: false
          })),
          setsCompleted: 0,
          weightReason,
          alternatives: exercise.alternatives || []
        }
      })
    )

    setStaleWorkout(null)
    dispatch({
      type: 'SELECT_SESSION',
      payload: { sessionLabel, exercises: exercisesWithWeights }
    })
  }

  function resumeStaleWorkout() {
    dispatch({ type: 'RESTORE_WORKOUT', payload: staleWorkout })
    setStaleWorkout(null)
  }

  async function closeStaleWorkout() {
    await clearActiveWorkout()
    setStaleWorkout(null)
  }


  function handleSetComplete(exerciseIndex, setIndex, reps, rpe, weight) {
    dispatch({
      type: 'UPDATE_EXERCISE_SET',
      payload: { exerciseIndex, setIndex, reps, rpe, weight }
    })
  }

  async function handleSwap(exerciseIndex, newExercise) {
    const parentExercise = state.exercises[exerciseIndex]

    // Initialize progression state if first time
    await initializeProgressionState(newExercise.exerciseId, {
      startingWeight: parentExercise.startingWeight,
      targetReps: parentExercise.targetReps,
      muscleGroup: parentExercise.muscleGroup || 'general',
      movementType: newExercise.movementType || parentExercise.movementType
    })

    // Get progression state for this alternative
    const progression = await getProgressionState(newExercise.exerciseId)
    const lastWorkout = await getLastWorkoutForExercise(newExercise.exerciseId)

    let sessionWeight = progression?.currentWeight || parentExercise.startingWeight || 0
    let weightReason = null

    if (lastWorkout && progression) {
      const result = computeSessionWeight(progression, {
        exercise: newExercise,
        sets: lastWorkout.exercise.sets
      }, progressionRules)
      sessionWeight = result.weight
      weightReason = result.reason
    }

    dispatch({
      type: 'SWAP_EXERCISE',
      payload: {
        exerciseIndex,
        newExercise: {
          ...parentExercise,
          exerciseId: newExercise.exerciseId,
          name: newExercise.name,
          movementType: newExercise.movementType || parentExercise.movementType,
          startingWeight: sessionWeight,
          weightReason
        }
      }
    })
  }

  const isAllDone = state.exercises.length > 0 &&
    state.exercises.every(ex => ex.setsCompleted === ex.sets.length)
  const anySetDone = state.exercises.some(ex => ex.setsCompleted > 0)

  // Sets are saved as they're logged, so Finish only appears once the
  // workout is complete.
  function finishButton() {
    if (!isAllDone) return null
    return (
      <button
        onClick={() => dispatch({ type: 'FINISH_WORKOUT' })}
        className="btn-primary w-full py-4 font-semibold transition-colors"
      >
        Finish Workout
      </button>
    )
  }

  if (!program) {
    return (
      <div className="pb-20 px-4 py-4 flex items-center justify-center min-h-full">
        <p className="text-secondary">No program loaded. Go to Me tab to add exercises.</p>
      </div>
    )
  }


  if (state.mode === 'picking' && suggestedSession) {
    return (
      <div className="px-4 flex flex-col min-h-full" style={{ paddingTop: '1.5rem', paddingBottom: '5rem' }}>
        <div className="flex items-center gap-2 mb-8">
          {onBack && (
            <IconButton label="Back" onClick={onBack}><BackIcon /></IconButton>
          )}
          <h2 className="text-lg font-bold">Today's Workout</h2>
        </div>
        {staleWorkout && (
          <div className="notice mb-6 space-y-3">
            <p className="text-sm">
              Unfinished <span className="font-semibold">{staleWorkout.selectedSession}</span> from
              your previous plan
              ({staleWorkout.exercises.filter(ex => ex.setsCompleted > 0).length}/{staleWorkout.exercises.length} exercises started).
              Its logged sets are already in History.
            </p>
            <div className="flex gap-2">
              <button
                onClick={resumeStaleWorkout}
                className="btn-primary flex-1 py-2 font-medium text-sm transition-colors"
              >
                Resume
              </button>
              <button
                onClick={closeStaleWorkout}
                className="btn-glass flex-1 py-2 text-sm transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
        <div>
          {sessions.map(session => (
            <button
              key={session.label}
              onClick={() => startSession(session.label)}
              className="w-full text-left py-4 border-b border-white/[.06] last:border-b-0 active:opacity-60 transition-opacity"
            >
              <div className="font-semibold">{session.label}</div>
              <div className={`text-sm mt-1 ${session.label === suggestedSession ? 'text-[color:var(--accent-text)] font-medium' : 'text-secondary'}`}>
                {session.exercises.length} exercises
                {lastDone[session.label] && ` · ${formatLastDone(lastDone[session.label])}`}
                {session.label === suggestedSession && ' · suggested'}
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (state.mode === 'summary') {
    return (
      <PostWorkoutSummary
        exercises={state.exercises}
        sessionLabel={state.selectedSession}
        startTime={state.startTime}
        logId={state.logId}
        onDone={async () => {
          await clearActiveWorkout()
          dispatch({ type: 'RESET' })
        }}
        onCancel={() => dispatch({ type: 'RESUME_LOGGING' })}
      />
    )
  }

  const firstIncompleteExIdx = state.exercises.findIndex(ex => ex.setsCompleted < ex.sets.length)
  const focusIndex = firstIncompleteExIdx >= 0 ? firstIncompleteExIdx : Math.max(0, state.exercises.length - 1)
  const doneCount = state.exercises.filter(ex => ex.setsCompleted === ex.sets.length).length

  function renderExerciseCard(exercise, idx, isActive = true, plain = false) {
    return (
      <ExerciseCard
        exercise={exercise}
        exerciseIndex={idx}
        isActive={isActive}
        plain={plain}
        workoutDate={state.startTime ? new Date(state.startTime).toISOString() : null}
        progressionRules={progressionRules}
        onSetComplete={handleSetComplete}
        onSuggestWeight={(setIdx, newWeight) =>
          dispatch({
            type: 'SUGGEST_WEIGHT',
            payload: { exerciseIndex: idx, setIndex: setIdx, newWeight }
          })
        }
        onSwap={(newExercise) => handleSwap(idx, newExercise)}
        onBonusRound={(bonusEx) =>
          dispatch({
            type: 'ADD_BONUS_ROUND',
            payload: { bonusExercise: bonusEx }
          })
        }
        isAllDone={isAllDone && !exercise.isBonus}
      />
    )
  }

  function workoutHeader(subtitle, toggleIcon, toggleLabel) {
    return (
      <div className="flex items-center gap-2">
        {onBack && (
          <IconButton label="Back" onClick={() => onBack()}><BackIcon /></IconButton>
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-bold truncate">{state.selectedSession}</h2>
          <p className="text-sm text-secondary">{subtitle}</p>
        </div>
        <IconButton label={toggleLabel} onClick={() => dispatch({ type: 'TOGGLE_OVERVIEW' })}>
          {toggleIcon}
        </IconButton>
      </div>
    )
  }

  if (state.isOverviewMode) {
    // Overview mode: show all exercises
    return (
      <div className="pb-20 px-4 py-4" style={{ paddingTop: '1.5rem' }}>
        <div className="mb-6">
          {workoutHeader(`${doneCount}/${state.exercises.length} exercises done`, <FocusIcon />, 'Focus view')}
        </div>

        <div className="space-y-3">
          {state.exercises.map((exercise, idx) => (
            <div key={exercise.exerciseId} className="flex gap-2 items-start">
              <div className="flex flex-col gap-2 pt-4">
                <button
                  onClick={() => idx > 0 && dispatch({ type: 'REORDER_EXERCISES', payload: { fromIndex: idx, toIndex: idx - 1 } })}
                  disabled={idx === 0}
                  className="w-9 h-9 flex items-center justify-center text-lg text-secondary rounded-full hover:bg-white/[.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ↑
                </button>
                <button
                  onClick={() => idx < state.exercises.length - 1 && dispatch({ type: 'REORDER_EXERCISES', payload: { fromIndex: idx, toIndex: idx + 1 } })}
                  disabled={idx === state.exercises.length - 1}
                  className="w-9 h-9 flex items-center justify-center text-lg text-secondary rounded-full hover:bg-white/[.06] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ↓
                </button>
              </div>
              <div className="flex-1">
                {renderExerciseCard(exercise, idx, true, true)}
              </div>
            </div>
          ))}

          {finishButton()}

          <button
            onClick={async () => {
              if (anySetDone) {
                if (!confirm('Delete this workout? Its logged sets will be removed from History.')) return
                await deleteLoggedWorkout(state)
              }
              // Save current session as "last completed" before skipping
              await db.settings.put({ key: 'lastSessionLabel', value: state.selectedSession })
              await clearActiveWorkout()
              dispatch({ type: 'SKIP_WORKOUT' })
            }}
            className="w-full py-3 text-sm font-medium text-secondary hover:text-[color:var(--ink)] transition-colors mt-3"
          >
            {anySetDone ? 'Delete Workout' : 'Skip Workout'}
          </button>
        </div>
      </div>
    )
  }

  // Focus view: exercises on a wheel, the centred one in focus
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 pb-2" style={{ paddingTop: '1.5rem' }}>
        {workoutHeader(`${doneCount}/${state.exercises.length} exercises`, <ListIcon />, 'Overview')}
      </div>

      <ExerciseWheel
        items={state.exercises}
        focusIndex={focusIndex}
        renderItem={renderExerciseCard}
      />

      {isAllDone && (
        <div className="px-4 pt-2" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
          {finishButton()}
        </div>
      )}
    </div>
  )
}
