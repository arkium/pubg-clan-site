/**
 * Mesure, en LECTURE SEULE, le style de jeu des clans suivis (`MemberTelemetryStats`) pour l'annuaire `/clans` : par
 * clan et par période (`all-time`, mois et semaine en cours), membres avec des stats, moyenne des trois scores (comme la
 * page « Style de jeu du clan »), répartition des styles dominants des membres, et fraîcheur (`updatedAt`).
 *
 *   npx tsx scripts/measure-clan-playstyle.ts
 */
import 'dotenv/config'

import { Prisma } from '@prisma/client'

import { getClanDirectory } from '@/lib/clan-directory-service'
import { prisma } from '@/lib/prisma'

function isoWeek(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = target.getUTCDay() || 7
  target.setUTCDate(target.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1))
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
}

async function main() {
  const now = new Date()
  const keys = [
    'all-time',
    `month-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
    `week-${now.getFullYear()}-${String(isoWeek(now)).padStart(2, '0')}`,
  ]
  const rows = await prisma.$queryRaw<Array<{
    clanId: number
    tag: string
    period: string
    members: bigint
    matches: bigint | number
    aggression: number
    support: number
    zone: number
    fragger: bigint | number
    medic: bigint | number
    ghost: bigint | number
    updatedAt: Date
  }>>(Prisma.sql`
    SELECT c.id AS clanId, c.tag AS tag, mts.period AS period,
           COUNT(*) AS members, SUM(mts.matchesPlayed) AS matches,
           AVG(mts.aggressionScore) AS aggression, AVG(mts.supportScore) AS support, AVG(mts.zoneDisciplineScore) AS zone,
           SUM(mts.aggressionScore > 0 AND mts.aggressionScore >= mts.supportScore AND mts.aggressionScore >= mts.zoneDisciplineScore) AS fragger,
           SUM(mts.supportScore > 0 AND mts.supportScore > mts.aggressionScore AND mts.supportScore >= mts.zoneDisciplineScore) AS medic,
           SUM(mts.zoneDisciplineScore > 0 AND mts.zoneDisciplineScore > mts.aggressionScore AND mts.zoneDisciplineScore > mts.supportScore) AS ghost,
           MAX(mts.updatedAt) AS updatedAt
    FROM MemberTelemetryStats mts
    INNER JOIN ClanMember cm ON cm.id = mts.memberId
    INNER JOIN Clan c ON c.id = cm.clanId
    WHERE c.isActive = 1 AND c.pubgClanId IS NOT NULL AND cm.isActive = 1 AND mts.period IN (${Prisma.join(keys)}) AND mts.matchesPlayed > 0
    GROUP BY c.id, c.tag, mts.period
    ORDER BY c.tag, mts.period
  `)
  const fmt = (value: number) => value.toFixed(1).padStart(5)
  console.log(`Périodes : ${keys.join(', ')}\n`)
  console.log(`${'clan'.padEnd(16)} ${'période'.padEnd(16)} memb. parties   agress. support  zone   F/M/G membres   mis à jour`)
  for (const row of rows) {
    console.log(
      `${row.tag.slice(0, 16).padEnd(16)} ${row.period.padEnd(16)} ${String(row.members).padStart(5)} ${String(row.matches).padStart(7)}   ${fmt(Number(row.aggression))}  ${fmt(Number(row.support))}  ${fmt(Number(row.zone))}  ${`${row.fragger}/${row.medic}/${row.ghost}`.padStart(9)}   ${new Date(row.updatedAt).toISOString().slice(0, 16)}`
    )
  }

  // Ce que l'annuaire affiche (même service que /api/clans/directory, lecture seule).
  const directory = await getClanDirectory()
  const tags = new Map((await prisma.clan.findMany({ select: { id: true, tag: true } })).map((clan) => [clan.id, clan.tag]))
  console.log('\nBadge de l’annuaire (all-time) :')
  for (const entry of directory.activity) {
    const style = entry.style
    console.log(`  ${(tags.get(entry.clanId) ?? String(entry.clanId)).padEnd(16)} ${style ? `${style.id.padEnd(8)} ${Math.round(style.score)} (${style.matches} parties, ${style.members} membres)` : '—'}`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
