import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { unlockAudio, playRestOverBeep } from '../utils/beep'

const RestTimerContext = createContext(null)
const STORAGE_KEY = 'restTimer'
// Beep only if the app was open when the rest ended, not when returning later.
const BEEP_GRACE_MS = 2000

function loadTimer() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
    return saved?.endAt > Date.now() ? saved : null
  } catch {
    return null
  }
}

function saveTimer(timer) {
  try {
    if (timer) localStorage.setItem(STORAGE_KEY, JSON.stringify(timer))
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage unavailable: timer still works for this page session.
  }
}

/**
 * One rest timer for the whole app, stored as an end timestamp so it keeps
 * counting while the app is backgrounded, the set is off screen, or the app
 * is reopened. `timerKey` identifies the set that started it.
 */
export function RestTimerProvider({ children }) {
  const [timer, setTimer] = useState(loadTimer) // { endAt, totalSeconds, timerKey, exerciseName }
  const [now, setNow] = useState(Date.now())
  const [inlineKey, setInlineKey] = useState(null)

  useEffect(() => {
    document.addEventListener('pointerdown', unlockAudio, { once: true })
    return () => document.removeEventListener('pointerdown', unlockAudio)
  }, [])

  useEffect(() => {
    if (!timer) return
    function tick() {
      const t = Date.now()
      setNow(t)
      if (t >= timer.endAt) {
        if (t - timer.endAt < BEEP_GRACE_MS && document.visibilityState === 'visible') {
          playRestOverBeep()
        }
        setTimer(null)
        saveTimer(null)
      }
    }
    tick()
    const interval = setInterval(tick, 250)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [timer])

  const startTimer = useCallback((seconds, timerKey, exerciseName) => {
    unlockAudio()
    const next = { endAt: Date.now() + seconds * 1000, totalSeconds: seconds, timerKey, exerciseName }
    setTimer(next)
    setNow(Date.now())
    saveTimer(next)
  }, [])

  const skipTimer = useCallback(() => {
    setTimer(null)
    saveTimer(null)
  }, [])

  const secondsRemaining = timer ? Math.max(0, Math.ceil((timer.endAt - now) / 1000)) : 0

  return (
    <RestTimerContext.Provider value={{
      active: !!timer && secondsRemaining > 0,
      secondsRemaining,
      totalSeconds: timer?.totalSeconds ?? 0,
      timerKey: timer?.timerKey ?? null,
      exerciseName: timer?.exerciseName ?? '',
      inlineKey,
      setInlineKey,
      startTimer,
      skipTimer
    }}>
      {children}
    </RestTimerContext.Provider>
  )
}

export function useRestTimer() {
  const context = useContext(RestTimerContext)
  if (!context) {
    throw new Error('useRestTimer must be used within RestTimerProvider')
  }
  return context
}
