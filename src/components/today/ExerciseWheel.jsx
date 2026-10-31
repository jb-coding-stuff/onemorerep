import { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react'
import { haptic } from '../../utils/haptics'

// Distance between haptic detents while the wheel moves.
const TICK_SPACING_PX = 34

const AUTO_ADVANCE_DELAY_MS = 450
// Within this distance of a card's centre position, dragging is damped so
// the focused card feels magnetic.
const DETENT_PX = 90
const DETENT_MIN_FACTOR = 0.35
const DRAG_THRESHOLD_PX = 6
// How far a flick carries: projected distance = velocity (px/ms) × this.
const FLICK_PROJECTION_MS = 220

const easeOutQuint = t => 1 - (1 - t) ** 5

/**
 * Vertical "wheel" of exercise cards: one card sits in the middle in focus
 * while neighbours tilt away, shrink and blur with distance. Scrolling uses
 * its own physics instead of native scroll-snap: drags are damped near a
 * card's centre, and a release glides to the target card with an ease-out
 * that slows as the card reaches the middle.
 * Tapping a blurred card rotates it into focus instead of interacting with it.
 */
export default function ExerciseWheel({ items, focusIndex, renderItem }) {
  const scrollerRef = useRef(null)
  const itemRefs = useRef([])
  const frameRef = useRef(0)
  const animRef = useRef(0)
  const dragRef = useRef(null)
  const suppressClickRef = useRef(false)
  const [activeIndex, setActiveIndex] = useState(focusIndex)
  const activeRef = useRef(focusIndex)
  // Haptic ticks only for movement the user causes (drag + its glide, mouse
  // wheel, tapping a card into focus), not for re-centring or auto-advance.
  const tickUntilRef = useRef(0)
  const tickFor = ms => { tickUntilRef.current = performance.now() + ms }
  // Scroll position of the last detent tick.
  const tickTopRef = useRef(null)
  const [spacer, setSpacer] = useState(0)

  const updateStyles = useCallback(() => {
    frameRef.current = 0
    const scroller = scrollerRef.current
    if (!scroller) return
    // Measure untransformed layout positions; bounding rects would include
    // each card's own tilt/scale and never settle exactly at the centre.
    const box = { height: scroller.clientHeight }

    // Detent ticks: one per TICK_SPACING_PX of travel, so a slow turn clicks
    // now and then and a fast flick rattles, thinning out as it glides to a stop.
    const top = scroller.scrollTop
    if (tickTopRef.current == null || performance.now() > tickUntilRef.current) tickTopRef.current = top
    else if (Math.abs(top - tickTopRef.current) >= TICK_SPACING_PX) {
      tickTopRef.current = top
      haptic()
    }
    const center = scroller.scrollTop + box.height / 2
    let best = 0
    let bestOffset = Infinity
    itemRefs.current.forEach((el, i) => {
      if (!el) return
      const raw = el.offsetTop + el.offsetHeight / 2 - center
      if (Math.abs(raw) < bestOffset) {
        bestOffset = Math.abs(raw)
        best = i
      }
      // Tall cards (an open set) stay sharp while the viewport centre is
      // well inside them; distance counts from their inner band.
      const band = Math.max(0, el.offsetHeight / 2 - 80)
      const offset = Math.sign(raw) * Math.max(0, Math.abs(raw) - band)
      // d: signed distance from the centre in units of ~60% of the viewport.
      // Quadratic falloff keeps cards near the centre almost sharp and
      // sharpens continuously as they approach it.
      const d = Math.max(-1.2, Math.min(1.2, offset / (box.height * 0.6)))
      const a = Math.abs(d)
      el.style.transform = `perspective(1000px) rotateX(${(-d * 22).toFixed(2)}deg) scale(${(1 - a * 0.1).toFixed(4)})`
      el.style.filter = `blur(${(9 * a * a).toFixed(2)}px)`
      el.style.opacity = (1 - 0.6 * Math.min(1, a ** 1.5)).toFixed(3)
    })
    if (best !== activeRef.current) {
      activeRef.current = best
      setActiveIndex(best)
    }
  }, [])

  const scheduleUpdate = useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(updateStyles)
  }, [updateStyles])

  /** scrollTop at which item i is centred. */
  const snapTop = useCallback(i => {
    const scroller = scrollerRef.current
    const el = itemRefs.current[i]
    if (!scroller || !el) return 0
    return el.offsetTop + el.offsetHeight / 2 - scroller.clientHeight / 2
  }, [])

  const nearestIndex = useCallback(top => {
    let best = 0
    itemRefs.current.forEach((el, i) => {
      if (el && Math.abs(snapTop(i) - top) < Math.abs(snapTop(best) - top)) best = i
    })
    return best
  }, [snapTop])

  const stopAnimation = () => {
    cancelAnimationFrame(animRef.current)
    animRef.current = 0
  }

  const scrollTo = useCallback((index, behavior = 'smooth') => {
    const scroller = scrollerRef.current
    if (!scroller || !itemRefs.current[index]) return
    stopAnimation()
    const from = scroller.scrollTop
    const to = snapTop(index)
    if (behavior === 'auto' || Math.abs(to - from) < 1) {
      scroller.scrollTop = to
      scheduleUpdate()
      return
    }
    // Longer glides for longer distances; the quintic ease-out spends most of
    // its time decelerating into the centre.
    const duration = Math.min(900, 380 + Math.abs(to - from) * 0.6)
    const start = performance.now()
    const step = now => {
      const t = Math.min(1, (now - start) / duration)
      scroller.scrollTop = from + (to - from) * easeOutQuint(t)
      if (t < 1) animRef.current = requestAnimationFrame(step)
      else animRef.current = 0
    }
    animRef.current = requestAnimationFrame(step)
  }, [snapTop, scheduleUpdate])

  // Re-centre the focused card when its height changes (a set opens, the
  // last-session line appears), unless the user is dragging.
  const heightsRef = useRef(new Map())
  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const el = entry.target
        const prev = heightsRef.current.get(el)
        const h = el.offsetHeight
        heightsRef.current.set(el, h)
        if (prev == null || prev === h) continue
        const i = itemRefs.current.indexOf(el)
        if (i === activeRef.current && !dragRef.current && !animRef.current) scrollTo(i)
        else scheduleUpdate()
      }
    })
    itemRefs.current.forEach(el => el && observer.observe(el))
    return () => observer.disconnect()
  }, [items.length, scrollTo, scheduleUpdate])

  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    const observer = new ResizeObserver(() => {
      setSpacer(Math.max(0, scroller.clientHeight / 2))
      scheduleUpdate()
    })
    observer.observe(scroller)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frameRef.current)
      stopAnimation()
    }
  }, [scheduleUpdate])

  // Land on the current exercise once the spacers exist.
  const placedRef = useRef(false)
  useLayoutEffect(() => {
    if (placedRef.current || spacer === 0) return
    placedRef.current = true
    scrollTo(focusIndex, 'auto')
    updateStyles()
  }, [spacer, focusIndex, scrollTo, updateStyles])

  // Turn to the next open exercise after one is finished.
  const lastFocusRef = useRef(focusIndex)
  useEffect(() => {
    if (lastFocusRef.current === focusIndex) return
    lastFocusRef.current = focusIndex
    const t = setTimeout(() => scrollTo(focusIndex), AUTO_ADVANCE_DELAY_MS)
    return () => clearTimeout(t)
  }, [focusIndex, scrollTo])

  useEffect(scheduleUpdate, [items, scheduleUpdate])

  // --- touch / pointer dragging with a magnetic centre ---

  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    suppressClickRef.current = false
    if (e.target.closest('input, textarea, select')) return
    stopAnimation()
    dragRef.current = {
      id: e.pointerId,
      startY: e.clientY,
      lastY: e.clientY,
      dragging: false,
      samples: [{ y: e.clientY, t: e.timeStamp }]
    }
  }

  function onPointerMove(e) {
    const drag = dragRef.current
    if (!drag || drag.id !== e.pointerId) return
    if (!drag.dragging) {
      if (Math.abs(e.clientY - drag.startY) < DRAG_THRESHOLD_PX) return
      drag.dragging = true
      tickUntilRef.current = Infinity
      drag.lastY = e.clientY
      scrollerRef.current.setPointerCapture?.(e.pointerId)
    }
    const scroller = scrollerRef.current
    const delta = drag.lastY - e.clientY
    drag.lastY = e.clientY
    drag.samples.push({ y: e.clientY, t: e.timeStamp })
    if (drag.samples.length > 6) drag.samples.shift()

    // Damp movement close to a card's centre position (the "detent").
    const top = scroller.scrollTop
    const dist = Math.abs(top - snapTop(nearestIndex(top)))
    const factor = dist >= DETENT_PX
      ? 1
      : DETENT_MIN_FACTOR + (1 - DETENT_MIN_FACTOR) * (dist / DETENT_PX)
    scroller.scrollTop = top + delta * factor
  }

  function onPointerUp(e) {
    const drag = dragRef.current
    if (!drag || drag.id !== e.pointerId) return
    dragRef.current = null
    if (!drag.dragging) return
    tickFor(1000) // the glide that follows
    // The click that follows a drag must not toggle or open anything; the
    // flag is cleared on the next pointerdown.
    suppressClickRef.current = true

    // Only the last ~100ms count, so pausing before lifting the finger
    // releases without a flick.
    const recent = drag.samples.filter(p => e.timeStamp - p.t < 100)
    let velocity = 0 // px/ms, positive = content moves up
    if (recent.length >= 2) {
      const first = recent[0]
      const last = recent[recent.length - 1]
      velocity = (first.y - last.y) / Math.max(1, last.t - first.t)
    }
    const projected = scrollerRef.current.scrollTop + velocity * FLICK_PROJECTION_MS
    scrollTo(nearestIndex(projected))
  }

  // Trackpad / mouse wheel: one card per gesture.
  const wheelLockRef = useRef(0)
  function onWheel(e) {
    tickFor(1000)
    e.preventDefault()
    const now = performance.now()
    if (now - wheelLockRef.current < 350 || Math.abs(e.deltaY) < 4) return
    wheelLockRef.current = now
    const dir = Math.sign(e.deltaY)
    const next = Math.max(0, Math.min(items.length - 1, activeRef.current + dir))
    scrollTo(next)
  }
  useEffect(() => {
    const scroller = scrollerRef.current
    scroller.addEventListener('wheel', onWheel, { passive: false })
    return () => scroller.removeEventListener('wheel', onWheel)
  })

  itemRefs.current.length = items.length

  return (
    <div
      ref={scrollerRef}
      onScroll={scheduleUpdate}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={e => {
        if (suppressClickRef.current) {
          e.preventDefault()
          e.stopPropagation()
        }
      }}
      className="relative flex-1 min-h-0 overflow-hidden px-4"
      style={{
        touchAction: 'none',
        WebkitMaskImage: 'linear-gradient(transparent, #000 40px, #000 calc(100% - 40px), transparent)',
        maskImage: 'linear-gradient(transparent, #000 40px, #000 calc(100% - 40px), transparent)'
      }}
    >
      <div style={{ height: spacer }} />
      {items.map((item, i) => (
        <div
          key={item.exerciseId + ':' + i}
          ref={el => { itemRefs.current[i] = el }}
          data-wheel-item
          className="py-8"
          style={{ transformOrigin: 'center center', willChange: 'transform, filter, opacity' }}
          onClickCapture={e => {
            if (i === activeIndex) return
            e.preventDefault()
            e.stopPropagation()
            tickFor(1000)
            scrollTo(i)
          }}
        >
          {renderItem(item, i, i === activeIndex)}
        </div>
      ))}
      <div style={{ height: spacer }} />
    </div>
  )
}
