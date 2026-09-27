/**
 * Nombre d'exécutions par jour d'une expression cron simple (« 0 4 * * * » → 1, « 15 * * * * » → 24). Sert aux pages
 * qui annoncent la fraîcheur de leurs données. `null` quand l'expression dépend du jour (mois, jour de semaine).
 */

function countCronFieldRuns(value: string, max: number) {
  if (value === '*') return max + 1

  if (value.startsWith('*/')) {
    const step = Number(value.slice(2))
    return Number.isInteger(step) && step > 0 ? Math.ceil((max + 1) / step) : null
  }

  const values = value.split(',').map(Number)
  return values.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= max) ? new Set(values).size : null
}

export function getCronRunsPerDay(expression: string) {
  const [minute, hour, dayOfMonth, month, dayOfWeek] = expression.trim().split(/\s+/)
  if (!minute || !hour || dayOfMonth !== '*' || month !== '*' || dayOfWeek !== '*') return null

  const minuteRuns = countCronFieldRuns(minute, 59)
  const hourRuns = countCronFieldRuns(hour, 23)
  return minuteRuns !== null && hourRuns !== null ? minuteRuns * hourRuns : null
}
