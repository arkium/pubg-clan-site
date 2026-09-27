/**
 * Lecture seule — données réelles de la page Armes d'un joueur (docs/features/armes-joueur.md) : paliers et niveaux de
 * la maîtrise PUBG, fraîcheur des synchros, variantes d'armes de la télémétrie, lancers par période.
 *
 *   npx tsx scripts/check-member-weapons.ts [memberId]
 */
import { prisma } from '../src/lib/prisma'

async function main() {
  const tiers = await prisma.memberWeaponMastery.groupBy({
    by: ['tier'],
    _count: { _all: true },
    _min: { level: true },
    _max: { level: true },
  })
  console.log('Paliers (tier) :', tiers.map((t) => `${t.tier}: ${t._count._all} armes, niveaux ${t._min.level}-${t._max.level}`).join(' | '))

  const levels = await prisma.$queryRawUnsafe<Array<{ bucket: number; n: bigint }>>(
    'SELECT FLOOR(level / 10) * 10 AS bucket, COUNT(*) AS n FROM MemberWeaponMastery GROUP BY bucket ORDER BY bucket'
  )
  console.log('Niveaux par dizaine :', levels.map((l) => `${l.bucket}: ${l.n}`).join(' | '))

  const freshness = await prisma.$queryRawUnsafe<Array<{ oldest: Date; newest: Date; members: bigint; zeroKills: bigint; total: bigint }>>(
    'SELECT MIN(lastRefreshedAt) AS oldest, MAX(lastRefreshedAt) AS newest, COUNT(DISTINCT memberId) AS members, SUM(kills = 0) AS zeroKills, COUNT(*) AS total FROM MemberWeaponMastery'
  )
  console.log('Fraîcheur / volume :', freshness[0])

  const ids = await prisma.$queryRawUnsafe<Array<{ weaponId: string; weaponName: string; n: bigint }>>(
    'SELECT weaponId, weaponName, COUNT(*) AS n FROM MemberWeaponMastery GROUP BY weaponId, weaponName ORDER BY n DESC LIMIT 60'
  )
  console.log('Identifiants maîtrise :', ids.map((i) => `${i.weaponId}=${i.weaponName}`).join(', '))

  const memberArg = Number(process.argv[2])
  const top = memberArg
    ? { memberId: memberArg }
    : (await prisma.$queryRawUnsafe<Array<{ memberId: number }>>(
        "SELECT memberId FROM MemberWeaponStats WHERE period = 'all-time' GROUP BY memberId ORDER BY SUM(kills) DESC LIMIT 1"
      ))[0]
  console.log('Joueur :', top.memberId)

  const periods = await prisma.$queryRawUnsafe<Array<{ period: string; n: bigint; kills: number }>>(
    'SELECT period, COUNT(*) AS n, SUM(kills) AS kills FROM MemberWeaponStats WHERE memberId = ? GROUP BY period ORDER BY period DESC LIMIT 6',
    top.memberId
  )
  console.log('Périodes MemberWeaponStats :', periods)

  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    "SELECT weaponName, kills, headshots, shotsFired, hitsLanded, avgDistance, maxDistance, matchCount FROM MemberWeaponStats WHERE memberId = ? AND period = 'all-time' ORDER BY kills DESC",
    top.memberId
  )
  console.log('Lignes all-time :', rows.length)
  console.table(rows.slice(0, 40))

  const mastery = await prisma.memberWeaponMastery.findMany({
    where: { memberId: top.memberId },
    orderBy: { level: 'desc' },
    select: { weaponId: true, weaponName: true, kills: true, knockouts: true, headshots: true, damage: true, longestKillDistance: true, level: true, tier: true, xpTotal: true, lastRefreshedAt: true },
  })
  console.log('Maîtrise :', mastery.length)
  console.table(mastery.slice(0, 20))

  const throwsAll = await prisma.memberThrowableStat.groupBy({ by: ['itemId'], where: { memberId: top.memberId }, _sum: { count: true } })
  console.log('Lancers (tout) :', throwsAll.map((t) => `${t.itemId}×${t._sum.count}`).join(', '))
  const oldestThrow = await prisma.memberThrowableStat.aggregate({ where: { memberId: top.memberId }, _min: { matchDate: true }, _max: { matchDate: true } })
  console.log('Lancers, dates :', oldestThrow._min.matchDate, oldestThrow._max.matchDate)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
