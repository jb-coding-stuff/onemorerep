import { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react'

const AUTO_ADVANCE_DELAY_MS = 450

/**
 * Vertical "wheel" of exercise cards: scroll-snaps so one card sits in the
 * middle in focus while neighbours tilt away, shrink and blur with distance.
 * Tapping a blurred card rotates it into focus instead of interacting with it.
 */
export default function ExerciseWheel({ items, focusIndex, renderItem }) {
  const scrollerRef = useRef(null)
  const itemRefs = useRef([])
  const frameRef = useRef(0)
  const [activeIndex, setActiveIndex] = useState(focusIndex)
  const activeRef = useRef(focusIndex)
  const [spacer, setSpacer] = useState(0)

  const updateStyles = useCallback(() => {
    frameRef.current = 0
    const scroller = scrollerRef.current
    if (!scroller) return
    const box = scroller.getBoundingClientRect()
    const center = box.top + box.height / 2
    let best = 0
    let bestOffset = Infinity
    itemRefs.current.forEach((el, i) => {
      if (!el) return
      const r = el.getBoundingClientRect()
      const offset = r.top + r.height / 2 - center
      if (Math.abs(offset) < bestOffset) {
        bestOffset = Math.abs(offset)
        best = i
      }
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

  const scrollTo = useCallback((index, behavior) => {
    itemRefs.current[index]?.scrollIntoView({ block: 'center', behavior })
  }, [])

  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    const observer = new ResizeObserver(() => {
      setSpacer(Math.max(0, scroller.clientHeight / 2 - 60))
      scheduleUpdate()
    })
    observer.observe(scroller)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frameRef.current)
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
    const t = setTimeout(() => scrollTo(focusIndex, 'smooth'), AUTO_ADVANCE_DELAY_MS)
    return () => clearTimeout(t)
  }, [focusIndex, scrollTo])

  useEffect(scheduleUpdate, [items, scheduleUpdate])

  itemRefs.current.length = items.length

  return (
    <div
      ref={scrollerRef}
      onScroll={scheduleUpdate}
      className="flex-1 min-h-0 overflow-y-auto px-4 snap-y snap-mandatory"
      style={{
        scrollbarWidth: 'none',
        WebkitMaskImage: 'linear-gradient(transparent, #000 40px, #000 calc(100% - 40px), transparent)',
        maskImage: 'linear-gradient(transparent, #000 40px, #000 calc(100% - 40px), transparent)'
      }}
    >
      <div style={{ height: spacer }} />
      {items.map((item, i) => (
        <div
          key={item.exerciseId + ':' + i}
          ref={el => { itemRefs.current[i] = el }}
          className="snap-center py-8"
          style={{ transformOrigin: 'center center', willChange: 'transform, filter, opacity' }}
          onClickCapture={e => {
            if (i === activeIndex) return
            e.preventDefault()
            e.stopPropagation()
            scrollTo(i, 'smooth')
          }}
        >
          {renderItem(item, i, i === activeIndex)}
        </div>
      ))}
      <div style={{ height: spacer }} />
    </div>
  )
}
