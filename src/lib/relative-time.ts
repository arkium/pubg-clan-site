/** Temps relatif en français, sans bibliothèque : comptes à rebours et « il y a… ». */

/** « dans 5 h », « dans 2 j », « dans moins d'une heure » ; `null` une fois passé. */
export function countdownLabel(target: string | Date, now: Date) {
  const diffMs = new Date(target).getTime() - now.getTime()
  if (diffMs <= 0) return null
  const hours = Math.round(diffMs / 3_600_000)
  if (hours < 1) return 'dans moins d’une heure'
  if (hours < 24) return `dans ${hours} h`
  return `dans ${Math.round(hours / 24)} j`
}

/** « il y a 22 min », « il y a 3 h », « il y a 2 j ». */
export function elapsedLabel(since: string | Date, now: Date) {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(since).getTime()) / 60_000))
  if (minutes < 1) return 'à l’instant'
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  return `il y a ${Math.round(hours / 24)} j`
}
