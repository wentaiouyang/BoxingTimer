/** Seconds → m:ss (rounded up, so the clock reads 3:00 the instant it starts). */
export function formatClock(seconds) {
  const total = Math.max(0, Math.ceil(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Seconds → a compact human label like "3 min" or "1:30". */
export function formatDuration(seconds) {
  if (seconds === 0) return 'Off'
  if (seconds % 60 === 0) return `${seconds / 60} min`
  return formatClock(seconds)
}
