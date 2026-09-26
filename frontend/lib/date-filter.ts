const localDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export function datePresetRange(preset: string, now = new Date()): { from: string; to: string } {
  const year = now.getFullYear()
  const month = now.getMonth()
  if (preset === 'Today') return { from: localDate(now), to: localDate(now) }
  if (preset === 'This week') {
    const first = new Date(year, month, now.getDate() - ((now.getDay() + 6) % 7))
    return { from: localDate(first), to: localDate(new Date(first.getFullYear(), first.getMonth(), first.getDate() + 6)) }
  }
  if (preset === 'Last month') return { from: localDate(new Date(year, month - 1, 1)), to: localDate(new Date(year, month, 0)) }
  if (preset === 'Last 90 days') return { from: localDate(new Date(year, month, now.getDate() - 90)), to: localDate(now) }
  if (preset === 'This year') return { from: localDate(new Date(year, 0, 1)), to: localDate(new Date(year, 11, 31)) }
  return { from: localDate(new Date(year, month, 1)), to: localDate(new Date(year, month + 1, 0)) }
}

export function isInDateRange(value: string | null | undefined, from: string, to: string): boolean {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  const day = date.toISOString().slice(0, 10)
  return (!from || day >= from) && (!to || day <= to)
}
