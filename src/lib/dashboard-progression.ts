function getIsoWeekKey(value: Date) {
  const date = new Date(Date.UTC(
    value.getUTCFullYear(),
    value.getUTCMonth(),
    value.getUTCDate()
  ))
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `week-${date.getUTCFullYear()}-${String(week).padStart(2, '0')}`
}

export function getLastWeekKeys(now = new Date(), weekCount = 8) {
  const count = Math.max(1, Math.min(weekCount, 52))
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now)
    date.setUTCDate(date.getUTCDate() - (count - index - 1) * 7)
    return getIsoWeekKey(date)
  })
}