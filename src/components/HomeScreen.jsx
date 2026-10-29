export default function HomeScreen({ onNavigate }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center px-4">
      <div className="space-y-4 w-full max-w-xs">
        <button
          onClick={() => onNavigate('today')}
          className="glass-card w-full py-5 text-lg font-semibold transition-transform active:scale-[0.98]"
        >
          Start Workout
        </button>

        <button
          onClick={() => onNavigate('history')}
          className="glass-card w-full py-5 text-lg font-semibold transition-transform active:scale-[0.98]"
        >
          History
        </button>

        <button
          onClick={() => onNavigate('me')}
          className="glass-card w-full py-5 text-lg font-semibold transition-transform active:scale-[0.98]"
        >
          Me
        </button>
      </div>
    </div>
  )
}
