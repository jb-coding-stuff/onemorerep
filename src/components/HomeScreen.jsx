export default function HomeScreen({ onNavigate }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-4">
      <div className="space-y-4 w-full max-w-xs">
        <button
          onClick={() => onNavigate('today')}
          className="w-full py-5 text-2xl font-semibold text-left border-b border-white/[.06] last:border-b-0 active:opacity-60 transition-opacity"
        >
          Start Workout
        </button>

        <button
          onClick={() => onNavigate('history')}
          className="w-full py-5 text-2xl font-semibold text-left border-b border-white/[.06] last:border-b-0 active:opacity-60 transition-opacity"
        >
          History
        </button>

        <button
          onClick={() => onNavigate('me')}
          className="w-full py-5 text-2xl font-semibold text-left border-b border-white/[.06] last:border-b-0 active:opacity-60 transition-opacity"
        >
          Me
        </button>
      </div>
    </div>
  )
}
