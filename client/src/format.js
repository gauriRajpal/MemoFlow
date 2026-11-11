export function dayKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function monthKey(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

export function parseDay(key) {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function formatWhen(iso) {
  const date = new Date(iso)
  const today = new Date()
  const start = (value) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const diff = Math.round((start(today) - start(date)) / 86400000)
  const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: false })
  if (diff === 0) return `Today, ${time}`
  if (diff === 1) return `Yesterday, ${time}`
  const dateLabel = date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  return `${dateLabel}, ${time}`
}

export function formatDayLabel(key) {
  return parseDay(key).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

export function formatMonth(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleDateString([], { month: 'long', year: 'numeric' })
}

export function snippet(body, length = 72) {
  const clean = body.replace(/#[A-Za-z][\w-]*/g, '').replace(/\s+/g, ' ').trim()
  if (clean.length <= length) return clean
  return `${clean.slice(0, length - 1)}…`
}

export function buildMonth(year, monthIndex) {
  const firstWeekday = new Date(year, monthIndex, 1).getDay()
  const start = new Date(year, monthIndex, 1 - firstWeekday)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    return {
      key: dayKey(date),
      day: date.getDate(),
      outside: date.getMonth() !== monthIndex,
    }
  })
}
