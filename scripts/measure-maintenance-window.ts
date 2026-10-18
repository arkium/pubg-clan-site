/**
 * Lecture seule : aide à choisir l'heure de la mise à jour automatique du serveur. Affiche les horaires des crons
 * stockés en base, leurs fenêtres d'exécution mesurées (CronExecution) et l'activité des joueurs par heure de Paris
 * (parties jouées, connexions au site). Aucune écriture.
 *
 *   npx tsx scripts/measure-maintenance-window.ts
 */
import { prisma } from '../src/lib/prisma'

const CRON_DAYS = 30
const ACTIVITY_DAYS = 60

const parisFormat = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const utcFormat = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

const parisHour = (date: Date) => Number(parisFormat.format(date).slice(0, 2))
const minutesOfDay = (date: Date, format: Intl.DateTimeFormat) => {
  const [h, m] = format.format(date).split(':').map(Number)
  return h * 60 + m
}
const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.round(minutes % 60)).padStart(2, '0')}`
const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}
const sinceDays = (days: number) => new Date(Date.now() - days * 24 * 3600 * 1000)
const fromUtcHour = (value: string) => new Date(`${value.replace(' ', 'T')}Z`)

async function main() {
  console.log('=== Schedules cron en base ===')
  for (const row of await prisma.cronSchedule.findMany({ orderBy: { key: 'asc' } })) {
    console.log(`${row.key.padEnd(40)} ${row.expression.padEnd(16)} ${row.timezone}`)
  }

  console.log(`\n=== Fenêtres d'exécution mesurées (${CRON_DAYS} derniers jours, hors déclenchements manuels) ===`)
  const windows = await prisma.$queryRaw<
    { action: string; source: string; day: Date; firstStart: Date; lastEnd: Date; runs: bigint }[]
  >`
    SELECT action, source, DATE(startedAt) AS day, MIN(startedAt) AS firstStart,
           MAX(COALESCE(finishedAt, startedAt)) AS lastEnd, COUNT(*) AS runs
    FROM CronExecution
    WHERE startedAt >= ${sinceDays(CRON_DAYS)} AND source <> 'manual'
    GROUP BY action, source, DATE(startedAt)
  `
  const byAction = new Map<string, typeof windows>()
  for (const row of windows) {
    const key = `${row.action} [${row.source}]`
    byAction.set(key, [...(byAction.get(key) ?? []), row])
  }
  console.log('action [source]'.padEnd(52), 'jours', 'début UTC', 'début Paris', 'durée méd.', 'durée max', 'exéc./jour')
  for (const [key, rows] of [...byAction].sort((a, b) =>
    median(a[1].map((r) => minutesOfDay(r.firstStart, utcFormat))) - median(b[1].map((r) => minutesOfDay(r.firstStart, utcFormat))))) {
    const durations = rows.map((r) => (r.lastEnd.getTime() - r.firstStart.getTime()) / 60000)
    console.log(
      key.padEnd(52),
      String(rows.length).padStart(5),
      hhmm(median(rows.map((r) => minutesOfDay(r.firstStart, utcFormat)))).padStart(9),
      hhmm(median(rows.map((r) => minutesOfDay(r.firstStart, parisFormat)))).padStart(11),
      `${median(durations).toFixed(0)} min`.padStart(10),
      `${Math.max(...durations).toFixed(0)} min`.padStart(9),
      String(median(rows.map((r) => Number(r.runs)))).padStart(10),
    )
  }

  console.log(`\n=== Lots horaires : minutes occupées dans l'heure (${CRON_DAYS} derniers jours) ===`)
  const batches = await prisma.$queryRaw<{ action: string; firstStart: Date; lastEnd: Date }[]>`
    SELECT action, MIN(startedAt) AS firstStart, MAX(COALESCE(finishedAt, startedAt)) AS lastEnd
    FROM CronExecution
    WHERE startedAt >= ${sinceDays(CRON_DAYS)} AND source = 'scheduler'
      AND action IN ('daily_sync', 'daily_stats_recalc')
    GROUP BY action, DATE_FORMAT(startedAt, '%Y-%m-%d %H')
  `
  for (const action of ['daily_sync', 'daily_stats_recalc']) {
    const rows = batches.filter((row) => row.action === action)
    const durations = rows.map((r) => (r.lastEnd.getTime() - r.firstStart.getTime()) / 60000).sort((a, b) => a - b)
    const p = (q: number) => durations[Math.min(durations.length - 1, Math.floor(durations.length * q))] ?? 0
    const startMinute = median(rows.map((r) => r.firstStart.getUTCMinutes()))
    console.log(
      `${action.padEnd(20)} lots=${rows.length} début=:${String(startMinute).padStart(2, '0')}`,
      `durée méd=${p(0.5).toFixed(1)} min p90=${p(0.9).toFixed(1)} min p99=${p(0.99).toFixed(1)} min max=${p(1).toFixed(0)} min`,
    )
  }

  console.log(`\n=== Activité par heure de Paris (${ACTIVITY_DAYS} derniers jours) ===`)
  const matchHours = await prisma.$queryRaw<{ h: string; matches: bigint }[]>`
    SELECT DATE_FORMAT(pubgCreatedAt, '%Y-%m-%d %H:00:00') AS h, COUNT(DISTINCT pubgMatchId) AS matches
    FROM \`Match\`
    WHERE pubgCreatedAt >= ${sinceDays(ACTIVITY_DAYS)}
    GROUP BY h
  `
  const loginHours = await prisma.$queryRaw<{ h: string; logins: bigint }[]>`
    SELECT DATE_FORMAT(createdAt, '%Y-%m-%d %H:00:00') AS h, COUNT(*) AS logins
    FROM UserSession
    WHERE createdAt >= ${sinceDays(ACTIVITY_DAYS)}
    GROUP BY h
  `
  const matches = new Array<number>(24).fill(0)
  const logins = new Array<number>(24).fill(0)
  for (const row of matchHours) matches[parisHour(fromUtcHour(row.h))] += Number(row.matches)
  for (const row of loginHours) logins[parisHour(fromUtcHour(row.h))] += Number(row.logins)
  const totalMatches = matches.reduce((a, b) => a + b, 0) || 1
  const totalLogins = logins.reduce((a, b) => a + b, 0) || 1
  console.log('heure Paris   parties  %parties  connexions  %connexions')
  for (let hour = 0; hour < 24; hour += 1) {
    console.log(
      `${String(hour).padStart(2, '0')}h`.padEnd(12),
      String(matches[hour]).padStart(8),
      `${((matches[hour] / totalMatches) * 100).toFixed(1)}%`.padStart(9),
      String(logins[hour]).padStart(11),
      `${((logins[hour] / totalLogins) * 100).toFixed(1)}%`.padStart(12),
    )
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
