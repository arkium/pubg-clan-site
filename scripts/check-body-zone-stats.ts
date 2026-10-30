/**
 * Zones d'impact — contrôle en LECTURE SEULE (docs/TODO/zones-d-impact.md, §7).
 *
 * Pour un clan et une semaine, recalcule les touches par membre, côté et zone directement depuis la télémétrie
 * (`memberStats`, compressée ou non, lue par lots de 30 comme le recalcul) et les compare aux lignes de
 * `MemberBodyZoneStats`. Aucun écart attendu : un écart = le recalcul et sa lecture ne disent pas la même chose.
 *
 * Usage, depuis la racine du projet :
 *   npx tsx --conditions=react-server --tsconfig ./tsconfig.json scripts/check-body-zone-stats.ts --clan 25 --week 2026-43
 */
import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { decodeJsonColumn } from '@/lib/pubg-telemetry/json-codec'
import { BODY_ZONES } from '@/lib/pubg-telemetry/body-zones'
import { getPeriodBounds, getPeriodKey } from '@/lib/pubg-telemetry/period-keys'

const argv = process.argv.slice(2)
const option = (name: string) => {
  const index = argv.indexOf(name)
  return index >= 0 ? argv[index + 1] : undefined
}
const norm = (value: string | null | undefined) => (value ? value.trim().toLowerCase() || null : null)

async function main() {
  const clanId = Number(option('--clan'))
  const week = /^(\d{4})-(\d{1,2})$/.exec(option('--week') ?? '')
  if (!Number.isInteger(clanId) || clanId <= 0 || !week) throw new Error('--clan <id> --week YYYY-WW')
  const january4 = new Date(Number(week[1]), 0, 4, 12)
  const reference = new Date(january4)
  reference.setDate(january4.getDate() - ((january4.getDay() + 6) % 7) + (Number(week[2]) - 1) * 7 + 3)
  const periodKey = getPeriodKey('week', reference)
  const { startDate, endDate } = getPeriodBounds('week', reference)

  const matches = await prisma.squadMatch.findMany({
    where: { createdAt: { gte: startDate, lte: endDate }, members: { some: { member: { clanId } } } },
    select: { id: true, members: { select: { member: { select: { id: true, clanId: true, pubgPlayerName: true, pubgAccountId: true } } } } },
  })

  const expected = new Map<string, { hits: number; damage: number }>()
  const ids = matches.map((match) => match.id)
  for (let index = 0; index < ids.length; index += 30) {
    const rows = await prisma.$queryRaw<Array<{ squadMatchId: string; memberStats: string | null; memberStatsGz: Buffer | null }>>(Prisma.sql`
      SELECT squadMatchId, CAST(memberStats AS CHAR) AS memberStats, memberStatsGz FROM SquadMatchTelemetry
       WHERE status = 'success' AND squadMatchId IN (${Prisma.join(ids.slice(index, index + 30))})`)
    for (const row of rows) {
      const match = matches.find((entry) => entry.id === row.squadMatchId)!
      const keyToMember = new Map<string, number>()
      for (const { member } of match.members) {
        if (member.clanId !== clanId) continue
        for (const key of [norm(member.pubgPlayerName), norm(member.pubgAccountId)]) if (key) keyToMember.set(key, member.id)
      }
      const stats = decodeJsonColumn(row.memberStatsGz, row.memberStats ? JSON.parse(row.memberStats) : null, 'memberStats')
      for (const entry of Array.isArray(stats) ? (stats as Array<Record<string, unknown>>) : []) {
        const memberId = keyToMember.get(norm(entry.memberKey as string) ?? '')
        if (!memberId) continue
        for (const side of ['dealt', 'taken'] as const) {
          const list = entry[side === 'dealt' ? 'bodyZonesDealt' : 'bodyZonesTaken']
          for (const hit of Array.isArray(list) ? (list as Array<{ zone: string; hits: number; damage: number }>) : []) {
            const zone = (BODY_ZONES as readonly string[]).includes(hit.zone) ? hit.zone : 'other'
            const key = `${memberId}:${side}:${zone}`
            const current = expected.get(key) ?? { hits: 0, damage: 0 }
            current.hits += Number(hit.hits) || 0
            current.damage += Number(hit.damage) || 0
            expected.set(key, current)
          }
        }
      }
    }
  }

  const stored = await prisma.memberBodyZoneStats.findMany({
    where: { period: periodKey, member: { clanId } },
    select: { memberId: true, side: true, zone: true, hits: true, damage: true },
  })
  const storedByKey = new Map(stored.map((row) => [`${row.memberId}:${row.side}:${row.zone}`, row]))

  const differences: string[] = []
  for (const key of new Set([...expected.keys(), ...storedByKey.keys()])) {
    const want = expected.get(key) ?? { hits: 0, damage: 0 }
    const have = storedByKey.get(key) ?? { hits: 0, damage: 0 }
    if (want.hits === 0 && want.damage === 0 && !storedByKey.has(key)) continue
    if (want.hits !== have.hits || Math.abs(want.damage - have.damage) > 0.05) {
      differences.push(`  ${key} : télémétrie ${want.hits} touches / ${want.damage.toFixed(1)} dégâts, table ${have.hits} / ${have.damage.toFixed(1)}`)
    }
  }

  console.log(`Zones d'impact — clan ${clanId}, ${periodKey} (lecture seule) : ${matches.length} parties, ${expected.size} couples attendus, ${stored.length} lignes en base`)
  console.log(differences.length === 0 ? 'Aucun écart.' : `${differences.length} écart(s) :\n${differences.slice(0, 40).join('\n')}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
