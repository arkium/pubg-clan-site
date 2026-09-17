/**
 * Contrôle en lecture seule des fins de zone : détaille un match (fermetures détectées, position retenue par membre,
 * distance au nouveau cercle) puis affiche la répartition persistée du clan. Sert à vérifier l'association
 * temporelle entre fermeture, position du joueur et cercle de référence.
 *
 * Usage : npx tsx scripts/inspect-zone-closures.ts <clanId> [squadMatchId]
 */
import 'dotenv/config'

import { Prisma } from '@prisma/client'

import { prisma } from '../src/lib/prisma'
import { getMapBounds } from '../src/lib/pubg-telemetry/position-heatmap'
import { detectZoneClosures, buildZoneClosurePositionRows } from '../src/lib/zone-closure-positions'
import { loadZoneClosureSummary } from '../src/lib/zone-closure-stats'
import { getMapLocations } from '../src/lib/map-location-service'

const asArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[]
  if (typeof value !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

async function main() {
  const clanId = Number(process.argv[2])
  if (!Number.isInteger(clanId)) throw new Error('Usage : voir l’en-tête du script')
  const requestedMatchId = process.argv[3]

  const [target] = await prisma.$queryRaw<Array<{ id: string; mapName: string; createdAt: Date }>>(Prisma.sql`
    SELECT sm.id, sm.mapName, sm.createdAt
    FROM SquadMatch sm
    INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id
    WHERE t.status = 'success' AND JSON_LENGTH(t.positionSamples) > 0
      ${requestedMatchId ? Prisma.sql`AND sm.id = ${requestedMatchId}` : Prisma.empty}
      AND EXISTS (SELECT 1 FROM SquadMember sdm INNER JOIN ClanMember cm ON cm.id = sdm.memberId
                  WHERE sdm.squadMatchId = sm.id AND cm.clanId = ${clanId})
    ORDER BY sm.createdAt DESC
    LIMIT 1
  `)
  if (!target) throw new Error('Aucun match exploitable pour ce clan')

  const [telemetry] = await prisma.$queryRaw<Array<{
    positionSamples: unknown
    deathSamples: unknown
    phaseSnapshots: unknown
  }>>(Prisma.sql`
    SELECT t.positionSamples, t.deathSamples, t.phaseSnapshots
    FROM SquadMatchTelemetry t WHERE t.squadMatchId = ${target.id}
  `)

  const match = await prisma.squadMatch.findUnique({
    where: { id: target.id },
    select: {
      id: true,
      mapName: true,
      createdAt: true,
      members: {
        select: { memberId: true, member: { select: { clanId: true, pubgAccountId: true, pubgPlayerName: true } } },
      },
    },
  })
  if (!match) throw new Error('Match introuvable')

  const snapshot = {
    positionSamples: asArray(telemetry.positionSamples),
    deathSamples: asArray(telemetry.deathSamples),
    phaseSnapshots: asArray(telemetry.phaseSnapshots),
  }
  const bounds = getMapBounds(match.mapName)
  const closures = detectZoneClosures(snapshot.phaseSnapshots)
  const rows = buildZoneClosurePositionRows(match, snapshot as never)
  const memberName = new Map(match.members.map((entry) => [entry.memberId, entry.member.pubgPlayerName]))

  console.log(`Match ${match.id} · ${match.mapName} · ${match.createdAt.toISOString()}`)
  console.log(`Membres suivis : ${match.members.length} · fermetures détectées : ${closures.length}\n`)

  for (const closure of closures) {
    const radiusMeters = Math.round((closure.radius / bounds.width) * 8000)
    console.log(
      `Fermeture phase ${closure.phase} à t=${Math.round(closure.timestampSeconds)}s · ` +
      `cercle ~${radiusMeters} m · ${closure.survivorCount} joueurs en vie`
    )
    const closureRows = rows.filter((row) => row.phase === closure.phase)
    if (closureRows.length === 0) console.log('   aucun membre suivi en vie avec une position récente')
    for (const row of closureRows) {
      console.log(
        `   ${(memberName.get(row.memberId) ?? row.memberId).toString().padEnd(18)}` +
        ` ratio ${row.distanceRatio.toFixed(2).padStart(5)} · ${row.zoneBand.padEnd(7)}` +
        ` · case ${row.xIndex},${row.yIndex} (${row.xPercent.toFixed(1)} %, ${row.yPercent.toFixed(1)} %)`
      )
    }
  }

  // Contrat de la page : mêmes agrégats que la route `/telemetry/zone-closures`.
  const startedAt = Date.now()
  const summary = await loadZoneClosureSummary({
    clanId,
    period: 'all',
    bounds: null,
    mapName: null,
    memberId: null,
    phases: [],
    locations: await getMapLocations(),
  })
  console.log(
    `
Résumé clan (toutes périodes, ${Date.now() - startedAt} ms) : ` +
    `${summary.counts.positions} positions · ${summary.counts.closures} fermetures · ` +
    `${summary.counts.matches} matchs · ratio moyen ${summary.averageRatio.toFixed(2)}`
  )
  console.log('Cartes :', summary.maps.map((m) => `${m.mapName} ${m.positions}`).join(' · '))
  console.log('Bandes :', summary.bands)
  console.log('Top secteurs :', summary.topCities.map((c) => `${c.name} ${c.positions} (${c.share.toFixed(1)} %)`).join(' · ') || 'aucun')

  const persisted = await prisma.$queryRaw<Array<{ phase: number; zoneBand: string; n: bigint; avgRatio: number }>>(Prisma.sql`
    SELECT z.phase, z.zoneBand, COUNT(*) AS n, AVG(z.distanceRatio) AS avgRatio
    FROM ZoneClosurePosition z WHERE z.clanId = ${clanId}
    GROUP BY z.phase, z.zoneBand ORDER BY z.phase, z.zoneBand
  `)
  console.log('\nRépartition persistée du clan :')
  for (const row of persisted) {
    console.log(`  phase ${row.phase} · ${row.zoneBand.padEnd(7)} ${String(Number(row.n)).padStart(5)} · ratio moyen ${Number(row.avgRatio).toFixed(2)}`)
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
