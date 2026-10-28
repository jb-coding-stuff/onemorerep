import { useRestTimer } from '../contexts/RestTimerContext'

export default function RestTimerBar() {
  const { active, secondsRemaining, totalSeconds, exerciseName, timerKey, inlineKey, skipTimer } = useRestTimer()

  if (!active || inlineKey === timerKey) return null

  const progress = totalSeconds > 0 ? (1 - secondsRemaining / totalSeconds) * 100 : 0
  const minutes = Math.floor(secondsRemaining / 60)
  const seconds = secondsRemaining % 60

  return (
    <div
      className="fixed bottom-0 left-0 right-0 border-t border-divider bg-white z-40 px-4 pt-3"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-xs text-secondary truncate">Rest · {exerciseName}</div>
          <div className="h-1 mt-2 bg-divider rounded-full overflow-hidden">
            <div className="h-full bg-black transition-all duration-300" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="text-lg font-bold tabular-nums">
          {minutes}:{seconds.toString().padStart(2, '0')}
        </div>
        <button
          onClick={skipTimer}
          className="px-3 py-2 text-sm font-medium border border-divider rounded hover:bg-divider transition-colors"
        >
          Skip
        </button>
      </div>
    </div>
  )
}
