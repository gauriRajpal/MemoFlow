function Svg({ children, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export function IconList() {
  return (
    <Svg>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
    </Svg>
  )
}

export function IconCalendar() {
  return (
    <Svg>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </Svg>
  )
}

export function IconBook() {
  return (
    <Svg>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </Svg>
  )
}

export function IconSearch({ size = 18 }) {
  return (
    <Svg size={size}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  )
}

export function IconPlus() {
  return (
    <Svg size={16}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  )
}

export function IconGlobe() {
  return (
    <Svg size={16}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </Svg>
  )
}

export function IconLock() {
  return (
    <Svg size={16}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Svg>
  )
}

export function IconChevron({ direction = 'down' }) {
  const paths = {
    down: 'm6 9 6 6 6-6',
    left: 'm15 18-6-6 6-6',
    right: 'm9 18 6-6-6-6',
  }
  return (
    <Svg size={14}>
      <path d={paths[direction]} />
    </Svg>
  )
}

export function IconDots() {
  return (
    <Svg size={16}>
      <path d="M5 12h.01M12 12h.01M19 12h.01" />
    </Svg>
  )
}

export function IconCheck() {
  return (
    <Svg size={12}>
      <path d="m5 12 4 4 10-10" />
    </Svg>
  )
}

export function IconLink() {
  return (
    <Svg size={15}>
      <path d="M10 13a5 5 0 0 0 7.07 0l1.41-1.41a5 5 0 0 0-7.07-7.07L10 5" />
      <path d="M14 11a5 5 0 0 0-7.07 0L5.5 12.43a5 5 0 0 0 7.07 7.07L14 18" />
    </Svg>
  )
}

export function IconTasks() {
  return (
    <Svg size={16}>
      <path d="m4 7 2 2 3-3" />
      <path d="M11 8h8M11 16h8M4 16l2 2 3-3" />
    </Svg>
  )
}

export function IconLogout() {
  return (
    <Svg size={16}>
      <path d="M9 6V4H4v16h5v-2" />
      <path d="M16 12H9M13 9l3 3-3 3" />
    </Svg>
  )
}

export function IconMenu() {
  return (
    <Svg>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Svg>
  )
}

export function IconPanel({ direction = 'left' }) {
  return (
    <Svg size={17}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      {direction === 'right' ? <path d="m13 9 3 3-3 3" /> : <path d="m17 9-3 3 3 3" />}
    </Svg>
  )
}
