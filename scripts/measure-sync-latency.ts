/**
 * Délai des alertes Top 1 et charge de l'API PUBG — mesure en LECTURE SEULE (docs/TODO/synchro-parties-30-min.md).
 *
 *  1. Délai entre la fin d'une partie et son alerte Top 1 (hors rattrapages de plus de 24 h), et nombre de rattrapages.
 *  2. Intervalle réel entre deux synchronisations des parties d'un même clan (`CronExecution`, `daily_sync`).
 *  3. Appels PUBG par endpoint, limités ou non (`PubgApiCallLog`), 429 compris, et appels limités par heure.
 *
 * À lancer avant le déploiement, puis le lendemain, et comparer. Usage, depuis la racine du projet :
 *   npx tsx --conditions=react-server --tsconfig ./tsconfig.json scripts/measure-sync-latency.ts [--days 3]
 */
import { prisma } from '@/lib/prisma'

const daysArg = process.argv.indexOf('--days')
const DAYS = daysArg > 0 ? Math.max(1, Number(process.argv[daysArg + 1]) || 3) : 3
const num = (value: unknown) => Number(value ?? 0)

function quantile(values: number[], q: number) {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null
}

const minutes = (value: number | null) => (value === null ? '—' : value < 120 ? `${Math.round(value)} min` : `${(value / 60).toFixed(1)} h`)

const ENDPOINT_KIND = `CASE
  WHEN endpoint LIKE '%/seasons/lifetime%' THEN 'players/{id}/seasons/lifetime'
  WHEN endpoint LIKE '%/seasons/%' THEN 'players/{id}/seasons/{saison}'
  WHEN endpoint LIKE '%/matches/%' THEN 'matches/{id}'
  WHEN endpoint REGEXP '/players/[^/?]+$' THEN 'players/{id}'
  WHEN endpoint LIKE '%/players%' THEN 'players?filter'
  WHEN endpoint LIKE '%/clans/%' THEN 'clans/{id}'
  ELSE endpoint END`

async function main() {
  console.log(`Synchronisation des parties et alertes Top 1 — lecture seule, ${DAYS} derniers jours\n`)

  // 1. Délai des alertes : depuis la fin estimée de la partie (début + durée la plus longue des membres).
  const alerts = await prisma.$queryRawUnsafe<Array<{ minutes: number | bigint }>>(`
    SELECT TIMESTAMPDIFF(MINUTE,
             DATE_ADD(sm.createdAt, INTERVAL COALESCE((SELECT MAX(m.duration) FROM \`Match\` m WHERE m.pubgMatchId = sm.pubgMatchId), 1800) SECOND),
             l.sentAt) AS minutes
      FROM DiscordNotificationLog l JOIN SquadMatch sm ON sm.id = l.refId
     WHERE l.kind = 'top1' AND l.sentAt >= NOW() - INTERVAL ${DAYS} DAY`)
  const delays = alerts.map((row) => num(row.minutes))
  const recent = delays.filter((value) => value < 24 * 60)
  console.log('1. Alertes Top 1')
  console.log(`   ${delays.length} alertes, dont ${delays.length - recent.length} rattrapages (plus de 24 h après la partie)`)
  console.log(
    `   délai après la fin de la partie : médiane ${minutes(quantile(recent, 0.5))}, 75 % sous ${minutes(quantile(recent, 0.75))}, ` +
      `90 % sous ${minutes(quantile(recent, 0.9))} ; sous 45 min : ${recent.filter((value) => value <= 45).length} / ${recent.length}`
  )

  // 2. Intervalle entre deux synchronisations d'un même clan.
  const runs = await prisma.$queryRawUnsafe<Array<{ clanId: number; startedAt: Date }>>(`
    SELECT clanId, startedAt FROM CronExecution
     WHERE action = 'daily_sync' AND source = 'scheduler' AND startedAt >= NOW() - INTERVAL ${DAYS} DAY
     ORDER BY clanId, startedAt`)
  const gaps: number[] = []
  for (let index = 1; index < runs.length; index += 1) {
    if (runs[index].clanId === runs[index - 1].clanId) {
      gaps.push((new Date(runs[index].startedAt).getTime() - new Date(runs[index - 1].startedAt).getTime()) / 60_000)
    }
  }
  const schedule = await prisma.cronSchedule.findUnique({ where: { key: 'daily_sync' }, select: { expression: true } })
  console.log('\n2. Synchronisation des parties')
  console.log(`   réglage en base : ${schedule?.expression ?? '(aucun : défaut du code)'} ; ${new Set(runs.map((row) => row.clanId)).size} clans, ${runs.length} passages`)
  console.log(`   intervalle par clan : médiane ${minutes(quantile(gaps, 0.5))}, 90 % sous ${minutes(quantile(gaps, 0.9))}`)

  // 3. Appels PUBG.
  const byKind = await prisma.$queryRawUnsafe<Array<{ kind: string; calls: bigint; limited: unknown; http429: unknown }>>(`
    SELECT ${ENDPOINT_KIND} AS kind, COUNT(*) AS calls, SUM(rateLimitLimit IS NOT NULL) AS limited, SUM(statusCode = 429) AS http429
      FROM PubgApiCallLog WHERE startedAt >= NOW() - INTERVAL 1 DAY
     GROUP BY kind ORDER BY calls DESC`)
  console.log('\n3. Appels PUBG des dernières 24 h')
  for (const row of byKind) {
    console.log(`   ${row.kind.padEnd(32)} ${String(num(row.calls)).padStart(6)} appels, ${num(row.limited) > 0 ? 'limité' : 'non limité'}, 429 : ${num(row.http429)}`)
  }
  const perHour = await prisma.$queryRawUnsafe<Array<{ hourUtc: string; limited: unknown }>>(`
    SELECT DATE_FORMAT(startedAt, '%H') AS hourUtc, SUM(rateLimitLimit IS NOT NULL) AS limited
      FROM PubgApiCallLog WHERE startedAt >= NOW() - INTERVAL 1 DAY
     GROUP BY hourUtc ORDER BY hourUtc`)
  const hourly = perHour.map((row) => num(row.limited))
  console.log(`   appels limités par heure : médiane ${quantile(hourly, 0.5)}, max ${Math.max(0, ...hourly)} (plafond 600)`)
  const bySource = await prisma.$queryRawUnsafe<Array<{ source: string; calls: bigint }>>(`
    SELECT source, COUNT(*) AS calls FROM PubgApiCallLog
     WHERE startedAt >= NOW() - INTERVAL 1 DAY AND rateLimitLimit IS NOT NULL
     GROUP BY source ORDER BY calls DESC LIMIT 8`)
  console.log(`   appels limités par origine : ${bySource.map((row) => `${row.source} ${num(row.calls)}`).join(', ')}`)

  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
