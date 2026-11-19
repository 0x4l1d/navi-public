/** Inside this many seconds of the end, an episode counts as finished. */
const END_MARGIN = 30

export function isFinished (position: number, duration: number) {
  if (!(duration > 0)) return false
  return position >= duration - Math.min(END_MARGIN, duration * 0.05 + 1)
}

/** Where to start: the exact saved second, or the beginning when the episode was finished. */
export function resumePosition (position: number, duration: number) {
  if (!Number.isFinite(position) || position <= 0) return 0
  if (duration > 0 && (position >= duration || isFinished(position, duration))) return 0
  return position
}

/** Steps through subtitle tracks with "off" (null) between the last and the first track. */
export function cycleTrack (ids: string[], current: string | null, direction: 1 | -1) {
  if (!ids.length) return null
  const order: Array<string | null> = [null, ...ids]
  const index = Math.max(0, order.indexOf(current))
  return order[(index + direction + order.length) % order.length] ?? null
}

export function formatTime (seconds: number) {
  const total = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor(total / 60) % 60
  const s = String(total % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** True when a key press belongs to a text box rather than to the app's shortcuts. */
export function isTextEntry (target: { tagName?: string, type?: string, isContentEditable?: boolean } | null) {
  if (!target) return false
  if (target.isContentEditable) return true
  const tag = target.tagName?.toUpperCase()
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true
  return tag === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(target.type ?? 'text')
}

export type ByteRange = { start: number, end: number } | 'invalid' | null

/** Reads a single-range HTTP Range header. null means "send the whole file". */
export function parseRange (header: string | null, size: number): ByteRange {
  if (!header) return null
  const match = header.trim().match(/^bytes=(\d*)-(\d*)$/i)
  if (!match || (!match[1] && !match[2])) return 'invalid'
  if (!match[1]) {
    const suffix = Number(match[2])
    if (suffix === 0 || size === 0) return 'invalid'
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(match[1])
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
  if (start >= size || end < start) return 'invalid'
  return { start, end }
}
