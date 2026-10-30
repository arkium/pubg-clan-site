/**
 * Clés et bornes des périodes des agrégats de télémétrie (`week-YYYY-WW`, `month-YYYY-MM`, `all-time`) — module pur,
 * sans Prisma : `period-aggregates.ts` les écrit, les routes et le Coach les relisent avec la même fonction.
 *
 * Semaine ISO (lundi 00:00 → dimanche 23:59) et mois civil, à l'heure locale du serveur — pas la « soirée » de
 * `sessionDateOf`, réservée aux soirées. L'année d'une semaine est son année ISO (celle de son jeudi) : le
 * 1er janvier 2027 est dans `week-2026-53`, pas `week-2027-53` (corrigé le 2026-10-30 avec les zones d'impact).
 */

export type StatsPeriod = 'week' | 'month' | 'all'

/** Semaine ISO d'une date et son année ISO, à l'heure locale. */
export function getISOWeek(date: Date): { year: number; week: number } {
  const thursday = new Date(date.getTime())
  thursday.setHours(0, 0, 0, 0)
  thursday.setDate(thursday.getDate() + 3 - ((thursday.getDay() + 6) % 7))
  const week1 = new Date(thursday.getFullYear(), 0, 4)
  const week = 1 + Math.round(((thursday.getTime() - week1.getTime()) / 86_400_000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  return { year: thursday.getFullYear(), week }
}

/** Clé de période des agrégats : la lire, c'est la même clé. */
export function getPeriodKey(period: StatsPeriod, referenceDate: Date): string {
  if (period === 'all') return 'all-time'
  if (period === 'week') {
    const { year, week } = getISOWeek(referenceDate)
    return `week-${year}-${String(week).padStart(2, '0')}`
  }
  return `month-${referenceDate.getFullYear()}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`
}

export function getPeriodBounds(period: StatsPeriod, referenceDate: Date): { startDate: Date; endDate: Date } {
  if (period === 'all') {
    return { startDate: new Date(0), endDate: new Date('9999-12-31') }
  }

  if (period === 'week') {
    const day = referenceDate.getDay()
    const monday = new Date(referenceDate)
    monday.setDate(referenceDate.getDate() - day + (day === 0 ? -6 : 1))
    monday.setHours(0, 0, 0, 0)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)
    return { startDate: monday, endDate: sunday }
  }

  return {
    startDate: new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1, 0, 0, 0, 0),
    endDate: new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0, 23, 59, 59, 999),
  }
}

/** Date de référence de la période précédente (la semaine d'avant, le mois d'avant) ; `null` pour « tous ». */
export function previousPeriodReference(period: StatsPeriod, referenceDate: Date): Date | null {
  if (period === 'all') return null
  const previous = new Date(referenceDate)
  if (period === 'week') previous.setDate(previous.getDate() - 7)
  else previous.setDate(0) // dernier jour du mois précédent
  return previous
}

/** Les `count` dernières semaines ISO jusqu'à celle de `now` comprise, de la plus ancienne à la plus récente. */
export function lastWeekKeys(now: Date, count: number): string[] {
  const total = Math.max(1, Math.min(Math.floor(count), 52))
  return Array.from({ length: total }, (_, index) => {
    const date = new Date(now)
    date.setDate(date.getDate() - (total - 1 - index) * 7)
    return getPeriodKey('week', date)
  })
}

/**
 * Périodes à recalculer à une date : la semaine, le mois et « tous » courants, plus la semaine précédente le lundi et
 * le mardi, et le mois précédent les 1er et 2 — une partie du dimanche soir importée le lundi (ou un tournoi synchronisé
 * tard) entre ainsi dans la semaine écoulée au lieu de la manquer pour toujours.
 */
export function periodsToRecalculate(referenceDate: Date): Array<{ period: StatsPeriod; referenceDate: Date }> {
  const periods: Array<{ period: StatsPeriod; referenceDate: Date }> = [{ period: 'week', referenceDate }]
  const weekday = referenceDate.getDay() // 1 = lundi, 2 = mardi
  if (weekday === 1 || weekday === 2) periods.push({ period: 'week', referenceDate: previousPeriodReference('week', referenceDate)! })
  periods.push({ period: 'month', referenceDate })
  if (referenceDate.getDate() <= 2) periods.push({ period: 'month', referenceDate: previousPeriodReference('month', referenceDate)! })
  periods.push({ period: 'all', referenceDate })
  return periods
}
