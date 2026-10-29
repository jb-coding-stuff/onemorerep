function Icon({ children }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export function BackIcon() {
  return <Icon><path d="M15 18l-6-6 6-6" /></Icon>
}

export function ListIcon() {
  return <Icon><path d="M8 6h12M8 12h12M8 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" /></Icon>
}

export function FocusIcon() {
  return <Icon><rect x="5" y="8" width="14" height="8" rx="2" /><path d="M8 4h8M8 20h8" /></Icon>
}

export function IconButton({ label, onClick, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="w-10 h-10 shrink-0 flex items-center justify-center rounded-full text-[color:var(--ink)] hover:bg-white/[.06] transition-colors"
    >
      {children}
    </button>
  )
}
