/**
 * A short haptic tick.
 *
 * - Android and others: the Vibration API.
 * - iPhone (iOS 18+): Safari has no Vibration API, but toggling an
 *   `<input type="checkbox" switch>` plays the system haptic. We click a
 *   hidden one. This is an unofficial behaviour; if a future iOS drops it,
 *   this silently does nothing.
 */

const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
let last = 0

export function haptic() {
  if (!isTouch) return
  const now = performance.now()
  if (now - last < 35) return // ticks closer than this blur into one
  last = now
  try {
    if (typeof navigator.vibrate === 'function') {
      navigator.vibrate(8)
      return
    }
    const label = document.createElement('label')
    label.ariaHidden = 'true'
    label.style.display = 'none'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.setAttribute('switch', '')
    label.appendChild(input)
    document.head.appendChild(label)
    label.click()
    label.remove()
  } catch {
    // no haptics available
  }
}
