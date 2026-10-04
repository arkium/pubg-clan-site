/**
 * Mesure, en LECTURE SEULE, l'écart entre les cellules « vehicle » d'avant le 2026-10-04 (`PositionMetricCell`, une
 * montée ou descente par passager, tout engin) et un recompte des mêmes échantillons depuis `vehicleSamples` avec les
 * membres actuels : membre absent, clan différent, compte différent. A montré qu'il faut garder le membre et le clan
 * des cellules d'origine (docs/features/positions.md §4.3). Sans objet une fois les cellules converties.
 *
 *   npx tsx scripts/measure-vehicle-cell-drift.ts 13
 */
import 'dotenv/config'

import { Prisma } from '@prisma/client'

import { parseStoredPositionSnapshot } from '@/lib/position-metric-cells'
import { prisma } from '@/lib/prisma'

async function main() {
  const clanId = Number(process.argv[2] ?? 13)
  const ids = (await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT DISTINCT sm.id
    FROM ClanMember cm
    INNER JOIN SquadMember sdm ON sdm.memberId = cm.id
    INNER JOIN SquadMatch sm ON sm.id = sdm.squadMatchId
    INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id AND t.status = 'success'
    WHERE cm.clanId = ${clanId} AND (t.vehicleSamples IS NOT NULL OR t.vehicleSamplesGz IS NOT NULL)
  `)).map((row) => row.id)

  const tally = { matches: 0, driftMatches: 0, memberMissing: 0, memberExtra: 0, clanDiffers: 0, countDiffers: 0, eventsDelta: 0 }
  const examples: string[] = []
  for (let start = 0; start < ids.length; start += 200) {
    const page = ids.slice(start, start + 200)
    const [snapshots, matches, stored] = await Promise.all([
      prisma.squadMatchTelemetry.findMany({ where: { squadMatchId: { in: page } }, select: { squadMatchId: true, vehicleSamples: true, vehicleSamplesGz: true } }),
      prisma.squadMatch.findMany({
        where: { id: { in: page } },
        select: { id: true, mapName: true, createdAt: true, members: { select: { memberId: true, member: { select: { clanId: true, pubgAccountId: true, pubgPlayerName: true } } } } },
      }),
      prisma.positionMetricCell.groupBy({
        by: ['squadMatchId', 'memberId', 'clanId'],
        where: { squadMatchId: { in: page }, metric: 'vehicle' },
        _sum: { eventCount: true },
      }),
    ])
    const matchById = new Map(matches.map((match) => [match.id, match]))
    for (const row of snapshots) {
      const match = matchById.get(row.squadMatchId)
      if (!match) continue
      tally.matches += 1
      const snapshot = parseStoredPositionSnapshot({
        positionSamples: null, trajectorySegments: null, deathSamples: null, killSamples: null, shotSamples: null,
        damageSamples: null, knockoutSamples: null, reviveSamples: null,
        vehicleSamples: row.vehicleSamples, vehicleSamplesGz: row.vehicleSamplesGz,
      })
      // Recompte à l'ancienne règle : chaque échantillon d'un membre de l'escouade, tout engin.
      const memberByKey = new Map<string, { memberId: number; clanId: number }>()
      for (const squadMember of match.members) {
        if (!squadMember.member.clanId) continue
        const member = { memberId: squadMember.memberId, clanId: squadMember.member.clanId }
        for (const key of [squadMember.member.pubgAccountId, squadMember.member.pubgPlayerName]) {
          if (key?.trim()) memberByKey.set(key.trim().toLowerCase(), member)
        }
      }
      const fresh = new Map<number, { clanId: number; events: number }>()
      for (const sample of snapshot.vehicleSamples) {
        const member = memberByKey.get(sample.memberKey?.trim().toLowerCase() ?? '')
        if (!member || !Number.isFinite(sample.x) || !Number.isFinite(sample.y)) continue
        const entry = fresh.get(member.memberId) ?? { clanId: member.clanId, events: 0 }
        entry.events += 1
        fresh.set(member.memberId, entry)
      }
      const old = new Map(stored.filter((cell) => cell.squadMatchId === row.squadMatchId).map((cell) => [cell.memberId, { clanId: cell.clanId, events: cell._sum.eventCount ?? 0 }]))
      let drift = false
      for (const [memberId, entry] of fresh) {
        const before = old.get(memberId)
        if (!before) { tally.memberMissing += 1; drift = true; tally.eventsDelta += entry.events; continue }
        if (before.clanId !== entry.clanId) { tally.clanDiffers += 1; drift = true }
        if (before.events !== entry.events) { tally.countDiffers += 1; drift = true; tally.eventsDelta += entry.events - before.events }
      }
      for (const [memberId, before] of old) {
        if (!fresh.has(memberId)) { tally.memberExtra += 1; drift = true; tally.eventsDelta -= before.events }
      }
      if (drift) {
        tally.driftMatches += 1
        if (examples.length < 8) examples.push(`${row.squadMatchId} ${match.createdAt.toISOString().slice(0, 10)} stocké=${JSON.stringify([...old])} recalcul=${JSON.stringify([...fresh])}`)
      }
    }
  }
  console.log(tally)
  for (const example of examples) console.log(example)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
