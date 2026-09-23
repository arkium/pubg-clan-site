/**
 * Impact des protections « Top 1 » et « matchs personnalisés (tournois) » sur la purge — lecture seule.
 * Une seule passe (~4 min) : ne pas boucler par seuil.
 *
 * Usage : npx tsx scripts/check-purge-protections.ts [seuilJours=14]
 */
import { prisma } from '../src/lib/prisma'

const n = (v: unknown) => Number(v ?? 0)

async function main() {
  const jours = Number(process.argv[2]) || 14
  const cutoff = new Date(Date.now() - jours * 24 * 3600 * 1000)

  const t0 = Date.now()
  const [r] = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT COUNT(*) AS cibles,
           SUM(m.placement = 1)                              AS top1,
           SUM(m.matchType = 'custom')                       AS customs,
           SUM(m.placement = 1 OR m.matchType = 'custom')    AS proteges,
           SUM(NOT (m.placement = 1 OR m.matchType = 'custom')) AS purgeables
    FROM SquadMatchTelemetry t
    JOIN SquadMatch m ON m.id = t.squadMatchId
    WHERE (t.positionSamples IS NOT NULL OR t.trajectorySegments IS NOT NULL)
      AND COALESCE(t.sourceGeneratedAt, t.parsedAt, t.createdAt) < ${cutoff}`
  console.log(`(scan complet : ${((Date.now() - t0) / 1000).toFixed(1)}s)\n`)

  const cibles = n(r.cibles)
  const proteges = n(r.proteges)
  const purgeables = n(r.purgeables)
  const mo = (matchs: number) => `${Math.round((matchs * 1.9 * 1024) / 1024)} Mo`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

  console.log(`Matchs porteurs de géoloc > ${jours} j : ${cibles.toLocaleString()}`)
  console.log(`  dont Top 1 (placement = 1)          : ${n(r.top1).toLocaleString()}`)
  console.log(`  dont personnalisés (matchType=custom): ${n(r.customs).toLocaleString()}`)
  console.log(`  protégés (l'un ou l'autre)          : ${proteges.toLocaleString()}  (~${mo(proteges)} conservés)`)
  console.log(`  réellement purgeables               : ${purgeables.toLocaleString()}  (~${mo(purgeables)} libérés)`)
  console.log(`\nLes protections retirent ${cibles > 0 ? Math.round((proteges / cibles) * 100) : 0} % de la cible.`)

  // Part des matchs personnalisés sur l'ensemble de la base, pour juger du coût à long terme
  const [all] = await prisma.$queryRaw<Array<{ total: bigint; customs: bigint; top1: bigint }>>`
    SELECT COUNT(*) AS total, SUM(matchType = 'custom') AS customs, SUM(placement = 1) AS top1 FROM SquadMatch`
  console.log(
    `\nSur l'ensemble de SquadMatch (${n(all?.total).toLocaleString()}) : ${n(all?.customs).toLocaleString()} personnalisés, ${n(all?.top1).toLocaleString()} Top 1.`
  )
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
