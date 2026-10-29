import { createPortal } from 'react-dom'

/**
 * Renders overlays at the document body. Inside the exercise wheel, cards
 * are transformed, which would anchor position:fixed to the card instead
 * of the screen. Pointer events stop here so dragging inside a sheet
 * doesn't also turn the wheel (React bubbles portal events up the tree).
 */
export default function BodyPortal({ children }) {
  return createPortal(
    <div onPointerDown={e => e.stopPropagation()}>{children}</div>,
    document.body
  )
}
