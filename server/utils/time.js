export function parseDbTimestamp(value) {
  if (!value) return null

  if (value instanceof Date) {
    return value
  }

  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return null

    const normalized = trimmed.replace(' ', 'T')
    const hasTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized)
    const isoCandidate = hasTimezone ? normalized : `${normalized}Z`
    const date = new Date(isoCandidate)

    if (!Number.isNaN(date.getTime())) {
      return date
    }
  }

  return null
}
