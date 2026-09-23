/**
 * Pourquoi le rattrapage `ZoneClosurePosition` n'écrit-il aucune ligne ? — lecture seule.
 *
 * Rejoue exactement la sélection de `backfillZoneClosurePositions` puis, pour chaque match,
 * indique à quelle étape la construction des lignes s'arrête : pas de fermeture détectée,
 * aucun membre rattaché à un clan, clés de position qui ne correspondent à aucun membre,
 * ou joueurs morts avant la première fermeture.
 *
 * Usage : npx tsx scripts/check-zone-closure-backfill.ts [limit=50]
 */
import 'dotenv/config'

import { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/prisma'
import { buildZoneClosurePositionRows, detectZoneClosures } from '../src/lib/zone-closure-positions'

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (typeof value !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

const norm = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : null)

async function main() {
  const limit = Number(process.argv[2]) || 50

  console.log('Sélection des matchs en attente (même requête que le backfill)…')
  const t0 = Date.now()
  const pending = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT sm.id
    FROM SquadMatch sm
    INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id
    WHERE t.status = 'success'
      AND JSON_LENGTH(t.positionSamples) > 0
      AND JSON_LENGTH(t.phaseSnapshots) > 0
      AND NOT EXISTS (SELECT 1 FROM ZoneClosurePosition z WHERE z.squadMatchId = sm.id)
    ORDER BY sm.createdAt ASC
    LIMIT ${limit}
  `)
  console.log(`${pending.length} matchs en attente (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`)
  if (pending.length === 0) return

  const causes = {
    aucuneFermeture: 0,
    aucunMembreAvecClan: 0,
    clesSansCorrespondance: 0,
    autres: 0,
    avecLignes: 0,
  }
  let exemplesAffiches = 0

  for (const { id } of pending) {
    const [row] = await prisma.$queryRaw<
      Array<{ positionSamples: unknown; deathSamples: unknown; phaseSnapshots: unknown }>
    >(Prisma.sql`
      SELECT positionSamples, deathSamples, phaseSnapshots
      FROM SquadMatchTelemetry WHERE squadMatchId = ${id}
    `)
    const match = await prisma.squadMatch.findUnique({
      where: { id },
      select: {
        id: true,
        mapName: true,
        createdAt: true,
        members: {
          select: {
            memberId: true,
            member: { select: { clanId: true, pubgAccountId: true, pubgPlayerName: true } },
          },
        },
      },
    })
    if (!row || !match) continue

    const snapshot = {
      positionSamples: asArray(row.positionSamples),
      deathSamples: asArray(row.deathSamples),
      phaseSnapshots: asArray(row.phaseSnapshots),
    }
    const closures = detectZoneClosures(snapshot.phaseSnapshots)
    const membresAvecClan = match.members.filter((m) => m.member.clanId)
    const clesMembres = new Set<string>()
    for (const m of membresAvecClan) {
      const a = norm(m.member.pubgAccountId)
      const n = norm(m.member.pubgPlayerName)
      if (a) clesMembres.add(a)
      if (n) clesMembres.add(n)
    }
    const clesPositions = new Set<string>()
    for (const s of snapshot.positionSamples as Array<{ memberKey?: unknown }>) {
      const k = norm(s.memberKey)
      if (k) clesPositions.add(k)
    }
    const recouvrement = [...clesPositions].filter((k) => clesMembres.has(k))

    const rows = buildZoneClosurePositionRows(match as never, snapshot as never)

    if (rows.length > 0) causes.avecLignes += 1
    else if (closures.length === 0) causes.aucuneFermeture += 1
    else if (clesMembres.size === 0) causes.aucunMembreAvecClan += 1
    else if (recouvrement.length === 0) causes.clesSansCorrespondance += 1
    else causes.autres += 1

    if (exemplesAffiches < 3 && rows.length === 0) {
      exemplesAffiches += 1
      const phases = (snapshot.phaseSnapshots as Array<{ isGame?: unknown }>)
        .map((s) => s.isGame)
        .filter((v) => typeof v === 'number')
      console.log(`--- ${id} (${match.mapName}, ${match.createdAt.toISOString().slice(0, 10)})`)
      console.log(`    phaseSnapshots : ${snapshot.phaseSnapshots.length}, isGame vus : ${[...new Set(phases)].slice(0, 14).join(', ')}`)
      console.log(`    fermetures détectées : ${closures.length}`)
      console.log(`    membres : ${match.members.length} dont ${membresAvecClan.length} avec clanId ; clés membres : ${clesMembres.size}`)
      console.log(`    positionSamples : ${snapshot.positionSamples.length}, clés distinctes : ${clesPositions.size}, recouvrement : ${recouvrement.length}`)
      console.log(`    exemples clés positions : ${[...clesPositions].slice(0, 3).join(' | ')}`)
      console.log(`    exemples clés membres   : ${[...clesMembres].slice(0, 3).join(' | ')}`)
    }
  }

  console.log('\n=== Répartition des causes ===')
  console.log(`Matchs produisant des lignes            : ${causes.avecLignes}`)
  console.log(`Aucune fermeture de zone détectée       : ${causes.aucuneFermeture}`)
  console.log(`Aucun membre rattaché à un clan         : ${causes.aucunMembreAvecClan}`)
  console.log(`Clés de position sans membre suivi      : ${causes.clesSansCorrespondance}`)
  console.log(`Autres (morts avant fermeture, délai…)  : ${causes.autres}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
