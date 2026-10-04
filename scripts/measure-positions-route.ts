/**
 * Mesure, en LECTURE SEULE, le temps de chaque étape de `GET /api/clans/[clanId]/telemetry/positions`
 * (cartographie tactique) pour un clan et chaque période. Sert à choisir où mettre un cache.
 *
 *   npx tsx scripts/measure-positions-route.ts 13
 *
 * N'écrit rien en base : seules les fonctions `load*` de la route sont appelées (jamais `persist*` ni `backfill*`).
 */
import 'dotenv/config'

import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import {
  loadMemberPositionMetricCells,
  loadPositionMetricMapSummary,
  loadPositionMetricMemberPhaseBreakdown,
  loadRawPositionTelemetryRows,
} from '@/lib/position-metric-aggregation'
import { loadUnpersistedSafeZoneRows } from '@/lib/safe-zone-phase-stats'

type Period = 'week' | 'month' | 'all'

function bounds(period: Period, now = new Date()) {
  if (period === 'all') return null
  if (period === 'month') {
    return { startDate: new Date(now.getFullYear(), now.getMonth(), 1), endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999) }
  }
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - day + (day === 0 ? -6 : 1))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { startDate: monday, endDate: sunday }
}

async function timed<T>(label: string, run: () => Promise<T>, describe: (value: T) => string) {
  const start = performance.now()
  const value = await run()
  console.log(`  ${label.padEnd(34)} ${String(Math.round(performance.now() - start)).padStart(6)} ms  ${describe(value)}`)
  return value
}

async function main() {
  const clanId = Number(process.argv[2] ?? 13)
  for (const period of ['week', 'month', 'all'] as const) {
    const range = bounds(period)
    console.log(`\nClan ${clanId} · ${period}${range ? ` (${range.startDate.toISOString().slice(0, 10)} → ${range.endDate.toISOString().slice(0, 10)})` : ''}`)
    const total = performance.now()
    const dateFilter = range ? Prisma.sql`AND sm.createdAt >= ${range.startDate} AND sm.createdAt <= ${range.endDate}` : Prisma.empty

    const summary = await timed('résumé par carte (cellules)', () => loadPositionMetricMapSummary({ clanId, bounds: range }), (value) => `${value.maps.length} cartes`)
    const raw = await timed(
      'matchs sans cellules (comptage)',
      () =>
        // Même requête que la route (depuis le 2026-10-04 : part des membres du clan, chemin indexé).
        prisma.$queryRaw<Array<{ mapName: string; matches: bigint }>>(Prisma.sql`
          SELECT sm.mapName, COUNT(DISTINCT sm.id) AS matches
          FROM ClanMember cm
          INNER JOIN SquadMember sdm ON sdm.memberId = cm.id
          INNER JOIN SquadMatch sm ON sm.id = sdm.squadMatchId
          INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id AND t.status = 'success'
          WHERE cm.clanId = ${clanId} ${dateFilter}
            AND NOT EXISTS (SELECT 1 FROM PositionMetricCell pmc WHERE pmc.squadMatchId = sm.id)
          GROUP BY sm.mapName`),
      (value) => `${value.reduce((sum, row) => sum + Number(row.matches), 0)} matchs sans cellules`
    )
    const map = summary.maps[0]?.mapName ?? raw[0]?.mapName
    if (!map) {
      console.log('  (aucune carte)')
      continue
    }
    console.log(`  carte mesurée : ${map}`)
    await timed('catalogue membres / phases', () => loadPositionMetricMemberPhaseBreakdown({ clanId, bounds: range, selectedMap: map }), (value) => `${value.members.length} membres`)
    await timed('cellules par membre (toutes phases)', () => loadMemberPositionMetricCells({ clanId, mapName: map, bounds: range }), (value) => `${value.length} cellules`)
    const hasRaw = raw.some((row) => row.mapName === map && Number(row.matches) > 0)
    if (hasRaw) {
      await timed('télémétrie brute (JSON décodé)', () => loadRawPositionTelemetryRows({ clanId, mapName: map, bounds: range, coverage: 'without_cells' }), (value) => `${value.length} matchs relus`)
    }
    await timed('cercles non persistés', () => loadUnpersistedSafeZoneRows({ clanId, mapName: map, bounds: range }), (value) => `${value.length} lignes`)
    console.log(`  ${'TOTAL (séquentiel)'.padEnd(34)} ${String(Math.round(performance.now() - total)).padStart(6)} ms`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
