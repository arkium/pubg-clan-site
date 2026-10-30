/**
 * Fraîcheur des parties — contrôle en LECTURE SEULE (docs/TODO/fraicheur-des-parties.md, §7).
 *
 * Recalcule depuis la base, sur les 24 dernières heures, ce que la synchronisation mesure elle-même à chaque tour
 * (`AppConfig.match_sync_health`), et compare :
 *   1. délai entre la fin de chaque partie et son import, par clan et par partie (médiane, 90 %) ;
 *   2. tours de synchronisation (`CronExecution`, `daily_sync`) : nombre et durée ;
 *   3. appels PUBG limités sur la dernière heure, 429 et échecs à traiter sur 24 h.
 *
 * Écart attendu : moins de 2 min sur la médiane et le 90 %, même nombre de tours, quota à ±5 %. La lecture de `Match`
 * parcourt la table (pas d'index sur `createdAt`, ~30 s) : à lancer hors des heures de jeu. Le journal PUBG est lu une
 * seule fois par l'index `startedAt` — jamais de `LIKE '%…'` corrélé (le 2026-10-29, une telle lecture a tourné 10 min).
 *
 * Usage, depuis la racine du projet :
 *   npx tsx --conditions=react-server --tsconfig ./tsconfig.json scripts/check-match-sync-health.ts
 */
import { CATCH_UP_MINUTES } from '@/lib/match-sync-health'
import { countPubgCalls, getMatchSyncHealthSummary } from '@/lib/match-sync-health-service'
import { prisma } from '@/lib/prisma'

const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : null
}
const fmt = (value: number | null) => (value === null ? '—' : `${Math.round(value)} min`)
const gap = (a: number | null, b: number | null) => (a === null || b === null ? '—' : `${Math.abs(Math.round(a - b))} min`)

async function main() {
  const now = new Date()
  const since = new Date(now.getTime() - 24 * 3_600_000)
  const summary = await getMatchSyncHealthSummary(now)
  console.log(`Fraîcheur des parties — contrôle en lecture seule, 24 h jusqu'à ${now.toISOString()}\n`)
  if (!summary) {
    console.log('AppConfig.match_sync_health est illisible : le prochain tour le réécrira.')
    return
  }
  if (!summary.measured) console.log('Aucun tour mesuré : la comparaison ne porte que sur la base.\n')

  // 1. Délai : première ligne `Match` de chaque clan pour chaque partie, importée dans les 24 h.
  const rows = await prisma.$queryRaw<Array<{ clanId: number; pubgMatchId: string; importedAt: Date; startedAt: Date; duration: number }>>`
    SELECT cm.clanId, m.pubgMatchId, m.createdAt AS importedAt, m.pubgCreatedAt AS startedAt, m.duration
      FROM \`Match\` m JOIN ClanMember cm ON cm.id = m.memberId
     WHERE m.createdAt >= ${since}`
  const firstImport = new Map<string, number>()
  for (const row of rows) {
    const minutes = (new Date(row.importedAt).getTime() - new Date(row.startedAt).getTime() - row.duration * 1000) / 60_000
    const key = `${row.clanId}:${row.pubgMatchId}`
    const current = firstImport.get(key)
    if (current === undefined || minutes < current) firstImport.set(key, Math.max(0, minutes))
  }
  const delays = [...firstImport.values()].filter((minutes) => minutes < CATCH_UP_MINUTES)
  const median = quantile(delays, 0.5)
  const p90 = quantile(delays, 0.9)
  console.log('1. Délai fin de partie → site (par clan et par partie, hors rattrapages)')
  console.log(`   base         : ${delays.length} parties, médiane ${fmt(median)}, 90 % ${fmt(p90)}`)
  console.log(`   mesure       : ${summary.delay.count} parties, médiane ${fmt(summary.delay.median)}, 90 % ${fmt(summary.delay.p90)}`)
  console.log(`   écart        : médiane ${gap(median, summary.delay.median)}, 90 % ${gap(p90, summary.delay.p90)}`)

  // 2. Tours : un tour = une suite d'exécutions par clan, sans pause de plus de 5 min ni clan répété.
  const runs = await prisma.cronExecution.findMany({
    where: { action: 'daily_sync', source: 'scheduler', startedAt: { gte: since } },
    select: { clanId: true, startedAt: true, finishedAt: true },
    orderBy: { startedAt: 'asc' },
  })
  const passes: Array<{ start: Date; end: Date | null; clans: Set<number> }> = []
  for (const run of runs) {
    const last = passes.at(-1)
    if (!last || run.startedAt.getTime() - (last.end ?? last.start).getTime() > 5 * 60_000 || last.clans.has(run.clanId)) {
      passes.push({ start: run.startedAt, end: run.finishedAt, clans: new Set([run.clanId]) })
      continue
    }
    last.clans.add(run.clanId)
    if (run.finishedAt && (!last.end || run.finishedAt > last.end)) last.end = run.finishedAt
  }
  const durations = passes.filter((pass) => pass.end).map((pass) => (pass.end!.getTime() - pass.start.getTime()) / 60_000)
  console.log('\n2. Tours de synchronisation')
  console.log(`   base         : ${passes.length} tours, durée médiane ${fmt(quantile(durations, 0.5))}`)
  console.log(`   mesure       : ${summary.passes.count} tours, durée médiane ${fmt(summary.passes.medianDurationMinutes)}, ${summary.skipped.last24h} sauté(s)`)

  // 3. Appels PUBG : même calcul que la synchronisation, maintenant.
  const calls = await countPubgCalls(now)
  console.log('\n3. Appels PUBG')
  console.log(`   base         : ${calls.limitedLastHour} / ${calls.ceilingPerHour} limités sur 1 h, 429 : ${calls.http429Last24h}, à traiter : ${calls.actionLast24h}, passagers sur 1 h : ${calls.transientLastHour}`)
  if (summary.calls) {
    console.log(`   mesure (${summary.calls.at.slice(11, 16)} UTC) : ${summary.calls.limitedLastHour} / ${summary.calls.ceilingPerHour}, 429 : ${summary.calls.http429Last24h}, à traiter : ${summary.calls.actionLast24h}`)
  }

  console.log(`\nÉtat : ${summary.status}${summary.reasons.length ? ` — ${summary.reasons.map((reason) => reason.text).join(' ; ')}` : ''}`)
  console.log(`Parties en attente : ${summary.pending.waiting}, perdues (7 jours) : ${summary.pending.lost}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
