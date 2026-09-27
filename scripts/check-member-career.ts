/**
 * Lecture seule — données réelles de la page Carrière PUBG d'un joueur et du calendrier du tableau de bord
 * (docs/features/carriere-joueur.md) : champs stockés de la carrière, saisons et rangs, fraîcheur, égalités des
 * médailles du clan, parties par soirée.
 *
 *   npx tsx scripts/check-member-career.ts [memberId]
 */
import { prisma } from '../src/lib/prisma'

async function main() {
  const memberId = Number(process.argv[2]) || 75
  const member = await prisma.clanMember.findUnique({ where: { id: memberId }, select: { id: true, displayName: true, clanId: true, pubgPlayerName: true } })
  console.log('Joueur :', member)

  const lifetime = await prisma.memberLifetimeStats.findUnique({ where: { memberId } })
  console.log('Carrière — tous modes :', JSON.stringify({ combat: lifetime?.combat, victory: lifetime?.victory, support: lifetime?.support, vehicle: lifetime?.vehicle, movement: lifetime?.movement, other: lifetime?.other }))
  console.log('Squad :', JSON.stringify(lifetime?.statsSquad)?.slice(0, 400))
  console.log('Duo présent :', lifetime?.statsDuo !== null, '· Solo présent :', lifetime?.statsSolo !== null, '· synchro :', lifetime?.lastRefreshedAt)

  const fresh = await prisma.$queryRawUnsafe<Array<{ oldest: Date; newest: Date; total: bigint }>>(
    'SELECT MIN(lastRefreshedAt) AS oldest, MAX(lastRefreshedAt) AS newest, COUNT(*) AS total FROM MemberLifetimeStats'
  )
  console.log('Fraîcheur carrière :', fresh[0])

  const seasons = await prisma.memberSeasonStats.findMany({ where: { memberId }, orderBy: { seasonId: 'desc' } })
  console.table(
    seasons.map((s) => ({
      seasonId: s.seasonId,
      mode: s.rankedGameMode,
      tier: `${s.rankedTier ?? '-'} ${s.rankedSubTier ?? ''}`,
      pts: s.rankedPoints,
      best: `${s.rankedBestTier ?? '-'} ${s.rankedBestSubTier ?? ''} ${s.rankedBestPoints}`,
      rMatches: s.rankedMatches,
      rWins: s.rankedWins,
      nMatches: s.normalMatches,
      nWins: s.normalWins,
      nKills: s.normalKills,
      refreshed: s.lastRefreshedAt.toISOString(),
    }))
  )
  const seasonIds = await prisma.$queryRawUnsafe<Array<{ seasonId: string; n: bigint; ranked: bigint; normal: bigint }>>(
    'SELECT seasonId, COUNT(*) AS n, SUM(rankedMatches > 0) AS ranked, SUM(normalMatches > 0) AS normal FROM MemberSeasonStats GROUP BY seasonId ORDER BY seasonId DESC'
  )
  console.log('Saisons en base :', seasonIds)
  const tiers = await prisma.$queryRawUnsafe<Array<{ rankedTier: string | null; rankedSubTier: string | null; n: bigint; minPts: number; maxPts: number }>>(
    'SELECT rankedTier, rankedSubTier, COUNT(*) AS n, MIN(rankedPoints) AS minPts, MAX(rankedPoints) AS maxPts FROM MemberSeasonStats WHERE rankedTier IS NOT NULL GROUP BY rankedTier, rankedSubTier ORDER BY minPts'
  )
  console.table(tiers)

  // Médailles : égalités sur les métriques du clan (membres actifs).
  if (member?.clanId) {
    const rows = await prisma.memberLifetimeStats.findMany({ where: { member: { clanId: member.clanId, isActive: true } }, select: { memberId: true, combat: true, victory: true } })
    const values = (pick: (r: (typeof rows)[number]) => number) => rows.map(pick).sort((a, b) => b - a).slice(0, 5)
    console.log('Membres actifs avec carrière :', rows.length)
    console.log('Top suicides (asc) :', rows.map((r) => (r.combat as { suicides: number }).suicides).sort((a, b) => a - b).slice(0, 6))
    console.log('Top teamkills :', values((r) => (r.combat as { teamkills: number }).teamkills))
    console.log('Top série max :', values((r) => (r.combat as { highestKillstreak: number }).highestKillstreak))
    console.log('Top victoires :', values((r) => (r.victory as { wins: number }).wins))
  }

  // Calendrier : parties et top 1 par jour sur 35 jours (UTC ici ; la page utilisera la soirée de jeu).
  const since = new Date(Date.now() - 35 * 86_400_000)
  const days = await prisma.$queryRawUnsafe<Array<{ day: string; games: bigint; wins: bigint; official: bigint }>>(
    "SELECT DATE(pubgCreatedAt) AS day, COUNT(*) AS games, SUM(placement = 1) AS wins, SUM(matchType = 'official') AS official FROM `Match` WHERE memberId = ? AND pubgCreatedAt >= ? GROUP BY day ORDER BY day",
    memberId,
    since
  )
  console.log('Parties par jour (35 j) :', days.map((d) => `${String(d.day).slice(0, 10)}:${d.games}/${d.wins}/${d.official}`).join(' '))
  const types = await prisma.$queryRawUnsafe<Array<{ matchType: string; n: bigint }>>('SELECT matchType, COUNT(*) AS n FROM `Match` WHERE memberId = ? GROUP BY matchType', memberId)
  console.log('Types de partie :', types)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
