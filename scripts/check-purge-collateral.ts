/**
 * Dommages collatéraux d'une purge de géolocalisation — lecture seule, UNE passe (~4 min).
 *
 * Parmi les matchs qui portent ENCORE leur géoloc et dépassent le seuil, combien n'ont pas
 * d'agrégat déjà calculé ? Ceux-là perdent définitivement la possibilité d'être recalculés :
 * le CDN PUBG ne garde la télémétrie que 14 jours (seul `.telemetry-captured` peut dépanner).
 *
 * Usage : npx tsx scripts/check-purge-collateral.ts [seuilJours=14]
 */
import { prisma } from '../src/lib/prisma'

const n = (v: unknown) => Number(v ?? 0)

async function main() {
  const jours = Number(process.argv[2]) || 14
  const cutoff = new Date(Date.now() - jours * 24 * 3600 * 1000)

  const t0 = Date.now()
  const [cov] = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT COUNT(*) AS cibles,
           SUM(EXISTS(SELECT 1 FROM PositionMetricCell c WHERE c.squadMatchId = m.id))  AS positionCells,
           SUM(EXISTS(SELECT 1 FROM SafeZonePhaseStat z WHERE z.squadMatchId = m.id))   AS safeZone,
           SUM(EXISTS(SELECT 1 FROM ZoneClosurePosition p WHERE p.squadMatchId = m.id)) AS zoneClosure,
           SUM(EXISTS(SELECT 1 FROM DropPressureStat d WHERE d.squadMatchId = m.id))    AS dropPressure,
           SUM(EXISTS(SELECT 1 FROM KillEvent k WHERE k.squadMatchId = m.id))           AS killEvents
    FROM SquadMatchTelemetry t
    JOIN SquadMatch m ON m.id = t.squadMatchId
    WHERE (t.positionSamples IS NOT NULL OR t.trajectorySegments IS NOT NULL)
      AND COALESCE(t.sourceGeneratedAt, t.parsedAt, t.createdAt) < ${cutoff}`
  console.log(`(scan complet : ${((Date.now() - t0) / 1000).toFixed(1)}s)\n`)

  const total = n(cov?.cibles)
  console.log(`Matchs ciblés par une purge « > ${jours} jours » : ${total.toLocaleString()}`)
  console.log('Agrégat déjà calculé (donc conservé après purge) :')
  for (const [label, key] of [
    ['PositionMetricCell (heatmap, positions)', 'positionCells'],
    ['SafeZonePhaseStat (cercle moyen)', 'safeZone'],
    ['ZoneClosurePosition (fermetures de zone)', 'zoneClosure'],
    ['DropPressureStat (pression de drop)', 'dropPressure'],
    ['KillEvent (kill feed)', 'killEvents'],
  ] as const) {
    const v = n(cov?.[key])
    const pct = total > 0 ? Math.round((v / total) * 100) : 0
    console.log(`  ${label.padEnd(42)} : ${String(v).padStart(6)} (${String(pct).padStart(3)} %) — perdus si purge : ${total - v}`)
  }
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
