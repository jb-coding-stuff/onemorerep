/**
 * Haptic ticks.
 *
 * - Android and others: the Vibration API.
 * - iPhone (iOS 18+): Safari has no Vibration API, but toggling an
 *   `<input type="checkbox" switch>` plays the system haptic. That works
 *   reliably when the user's own tap toggles the switch (see HapticButton);
 *   `haptic()` below toggles one from code, which iOS may or may not honour
 *   depending on the version. Either way it fails silently.
 */

const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
let last = 0
let label = null

/** A rendered (not display:none) but invisible switch, kept in the page. */
function hiddenSwitch() {
  if (label?.isConnected) return label
  label = document.createElement('label')
  label.setAttribute('aria-hidden', 'true')
  label.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden'
  const input = document.createElement('input')
  input.type = 'checkbox'
  input.setAttribute('switch', '')
  input.tabIndex = -1
  label.appendChild(input)
  document.body.appendChild(label)
  return label
}

/** Vibrate on platforms that support it. @returns {boolean} handled */
export function vibrate() {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(8)
    return true
  }
  return false
}

/** A tick triggered from code (e.g. while the wheel moves). */
export function haptic() {
  if (!isTouch) return
  const now = performance.now()
  if (now - last < 35) return // ticks closer than this blur into one
  last = now
  try {
    if (!vibrate()) hiddenSwitch().click()
  } catch {
    // no haptics available
  }
}
