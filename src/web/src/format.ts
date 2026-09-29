const DAY = 86_400_000

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

/** Parses a DateOnly string ("2026-10-02") as a local date, not UTC midnight. */
export function parseDateOnly(s: string) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function relativeDay(date: Date) {
  const diff = Math.round((startOfDay(date) - startOfDay(new Date())) / DAY)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff < 7) return date.toLocaleDateString(undefined, { weekday: 'long' })
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export function formatDue(iso: string, allDay = false) {
  const d = new Date(iso)
  const day = relativeDay(d)
  return allDay ? day : `${day}, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

export function formatDateOnly(s: string | null) {
  return s ? relativeDay(parseDateOnly(s)) : ''
}

export function isPast(iso: string) {
  return new Date(iso).getTime() < Date.now()
}

export function isPastDateOnly(s: string) {
  return parseDateOnly(s).getTime() < startOfDay(new Date())
}

export function minutes(n: number) {
  if (n < 60) return `${n} min`
  const h = Math.floor(n / 60)
  const m = n % 60
  return m ? `${h}h ${m}m` : `${h}h`
}
