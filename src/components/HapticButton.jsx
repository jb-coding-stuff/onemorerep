import { vibrate } from '../utils/haptics'

const SWITCH = { switch: '' } // the `switch` attribute (iOS haptic switch)

/**
 * A button whose tap toggles a hidden iOS switch, so iOS plays its system
 * haptic for the user's own tap (more reliable than triggering it from code).
 * Elsewhere it vibrates via the Vibration API. `onPress` runs once per tap.
 */
export default function HapticButton({ onPress, label, className = '', children }) {
  return (
    <label role="button" aria-label={label} className={`relative cursor-pointer select-none ${className}`}>
      <input
        type="checkbox"
        {...SWITCH}
        tabIndex={-1}
        aria-hidden="true"
        className="absolute w-px h-px opacity-0 pointer-events-none"
        onChange={() => { vibrate(); onPress() }}
      />
      {children}
    </label>
  )
}
