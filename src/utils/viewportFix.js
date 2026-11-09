/**
 * iOS can leave the page scrolled a few dozen pixels after the keyboard or
 * returning from the background (the page can't scroll for the user, but
 * focusing a field scrolls it). Fixed elements then stop short of the screen
 * bottom and a black bar shows. Put the page back to the top whenever that
 * could have happened.
 */
export function installViewportFix() {
  const reset = () => {
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0)
    const el = document.scrollingElement
    if (el && (el.scrollTop || el.scrollLeft)) {
      el.scrollTop = 0
      el.scrollLeft = 0
    }
  }
  // After a keyboard closes the viewport settles a moment later.
  const resetSoon = () => {
    reset()
    setTimeout(reset, 100)
    setTimeout(reset, 400)
  }

  document.addEventListener('focusout', resetSoon)
  window.addEventListener('pageshow', resetSoon)
  window.addEventListener('orientationchange', resetSoon)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') resetSoon()
  })
  window.visualViewport?.addEventListener('resize', resetSoon)
  window.visualViewport?.addEventListener('scroll', reset)
}
