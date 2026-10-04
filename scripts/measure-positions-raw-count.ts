/**
 * Compare, en LECTURE SEULE, deux formulations du comptage « matchs sans PositionMetricCell » de la cartographie
 * tactique (route `telemetry/positions`) : la requête actuelle (part de toute la télémétrie, `SquadMatch.createdAt`
 * sans index) et une requête qui part des membres du clan (chemin indexé). Mêmes résultats attendus.
 *
 *   npx tsx scripts/measure-positions-raw-count.ts 13
 */
import 'dotenv/config'

import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'

type Row = { mapName: string; matches: bigint | number }

function weekBounds(now = new Date()) {
  const day = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - day + (day === 0 ? -6 : 1))
  monday.setHours(0, 0, 0, 0)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  sunday.setHours(23, 59, 59, 999)
  return { startDate: monday, endDate: sunday }
}

function currentQuery(clanId: number, dateFilter: Prisma.Sql, coverage = Prisma.raw("NOT")) {
  return Prisma.sql`
    SELECT sm.mapName, COUNT(*) AS matches
    FROM SquadMatchTelemetry t
    INNER JOIN SquadMatch sm ON sm.id = t.squadMatchId
    WHERE t.status = 'success' ${dateFilter}
      AND EXISTS (SELECT 1 FROM SquadMember sdm INNER JOIN ClanMember cm ON cm.id = sdm.memberId WHERE sdm.squadMatchId = sm.id AND cm.clanId = ${clanId})
      AND ${coverage} EXISTS (SELECT 1 FROM PositionMetricCell pmc WHERE pmc.squadMatchId = sm.id)
    GROUP BY sm.mapName`
}

/** Part des membres du clan : ClanMember (clanId) → SquadMember (memberId) → SquadMatch (clé) → télémétrie (clé unique). */
function clanFirstQuery(clanId: number, dateFilter: Prisma.Sql, coverage = Prisma.raw("NOT")) {
  return Prisma.sql`
    SELECT sm.mapName, COUNT(DISTINCT sm.id) AS matches
    FROM ClanMember cm
    INNER JOIN SquadMember sdm ON sdm.memberId = cm.id
    INNER JOIN SquadMatch sm ON sm.id = sdm.squadMatchId
    INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id AND t.status = 'success'
    WHERE cm.clanId = ${clanId} ${dateFilter}
      AND ${coverage} EXISTS (SELECT 1 FROM PositionMetricCell pmc WHERE pmc.squadMatchId = sm.id)
    GROUP BY sm.mapName`
}

async function timed(label: string, sql: Prisma.Sql) {
  const start = performance.now()
  const rows = await prisma.$queryRaw<Row[]>(sql)
  const total = rows.reduce((sum, row) => sum + Number(row.matches), 0)
  console.log(`  ${label.padEnd(26)} ${String(Math.round(performance.now() - start)).padStart(6)} ms  ${total} matchs · ${rows.length} cartes`)
  return rows.map((row) => `${row.mapName}:${Number(row.matches)}`).sort().join(',')
}

async function main() {
  const clanId = Number(process.argv[2] ?? 13)
  const week = weekBounds()
  for (const [label, dateFilter] of [
    ['semaine', Prisma.sql`AND sm.createdAt >= ${week.startDate} AND sm.createdAt <= ${week.endDate}`],
    ['tous', Prisma.empty],
  ] as const) {
    console.log(`\nClan ${clanId} · ${label}`)
    const current = await timed('requête actuelle', currentQuery(clanId, dateFilter))
    const clanFirst = await timed('depuis les membres du clan', clanFirstQuery(clanId, dateFilter))
    console.log(`  résultats identiques : ${current === clanFirst ? 'oui' : `NON (${current} ≠ ${clanFirst})`}`)
    // Condition inverse (matchs AVEC cellules) : mêmes jointures, résultats non vides — preuve d'équivalence chiffrée.
    const withCurrent = await timed('actuelle · avec cellules', currentQuery(clanId, dateFilter, Prisma.empty))
    const withClanFirst = await timed('membres · avec cellules', clanFirstQuery(clanId, dateFilter, Prisma.empty))
    console.log(`  résultats identiques (avec cellules) : ${withCurrent === withClanFirst ? 'oui' : `NON (${withCurrent} ≠ ${withClanFirst})`}`)
    const plan = await prisma.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`EXPLAIN ${clanFirstQuery(clanId, dateFilter)}`)
    for (const step of plan) console.log(`    plan · ${String(step.table).padEnd(6)} ${String(step.type).padEnd(7)} clé=${String(step.key)} lignes=${String(step.rows)}`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
