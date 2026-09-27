import { calculateLifetimeMedalCounts } from '@/lib/lifetime-medals'
import { dominantRole, ROSTER_WINDOW_DAYS, type RosterMember } from '@/lib/member-roster'
import { prisma } from '@/lib/prisma'
import { getWeaponLabels, weaponDisplayName } from '@/lib/weapon-label-service'
import { requireNavPermission, requirePermission } from '@/middleware/auth-permission'

/**
 * Fiches de l'annuaire des membres (`/clans/[clanId]/members`, docs/features/membres.md). Une ligne par membre actif :
 * dernière partie, rôle dominant (télémétrie depuis le début du suivi), parties officielles des 30 derniers jours,
 * arme fétiche (kills depuis le début du suivi), médailles de carrière. Le nombre de demandes en attente n'est donné
 * qu'à qui peut les traiter (`manage_members`).
 */

const ALL_TIME = 'all-time'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(request: Request, { params }: { params: Promise<{ clanId: string }> }) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)
    if (!parsedClanId) {
      return Response.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const roleError = await requireNavPermission('clan.members')(request, { clanId: parsedClanId })
    if (roleError) return roleError

    const clan = await prisma.clan.findUnique({ where: { id: parsedClanId }, select: { id: true, name: true, tag: true } })
    if (!clan) {
      return Response.json({ error: 'Clan not found' }, { status: 404 })
    }

    const members = await prisma.clanMember.findMany({
      where: { clanId: parsedClanId, isActive: true },
      select: {
        id: true,
        displayName: true,
        pubgPlayerName: true,
        lastMatchAt: true,
        identities: { select: { user: { select: { avatarUrl: true } } }, take: 1 },
      },
    })
    const memberIds = members.map((member) => member.id)
    const since = new Date(Date.now() - ROSTER_WINDOW_DAYS * 86_400_000)

    const [recentMatches, recentWins, telemetry, weapons, lifetime, canManage] = await Promise.all([
      prisma.match.groupBy({
        by: ['memberId'],
        where: { memberId: { in: memberIds }, matchType: 'official', pubgCreatedAt: { gte: since } },
        _count: { _all: true },
        _sum: { kills: true },
      }),
      prisma.match.groupBy({
        by: ['memberId'],
        where: { memberId: { in: memberIds }, matchType: 'official', pubgCreatedAt: { gte: since }, placement: 1 },
        _count: { _all: true },
      }),
      prisma.memberTelemetryStats.findMany({
        where: { memberId: { in: memberIds }, period: ALL_TIME },
        select: { memberId: true, aggressionScore: true, supportScore: true, zoneDisciplineScore: true },
      }),
      prisma.memberWeaponStats.findMany({
        where: { memberId: { in: memberIds }, period: ALL_TIME, kills: { gt: 0 } },
        select: { memberId: true, weaponName: true, kills: true },
      }),
      prisma.memberLifetimeStats.findMany({
        where: { memberId: { in: memberIds } },
        select: { memberId: true, combat: true, victory: true, support: true, vehicle: true, movement: true, other: true },
      }),
      requirePermission('manage_members')(request, { clanId: parsedClanId }).then((error) => error === null),
    ])

    const pendingCount = canManage
      ? await prisma.clanMember.count({ where: { clanId: parsedClanId, isActive: false, joinStatus: 'pending' } })
      : null

    const matchesByMember = new Map(recentMatches.map((row) => [row.memberId, row]))
    const winsByMember = new Map(recentWins.map((row) => [row.memberId, row._count._all]))
    const telemetryByMember = new Map(telemetry.map((row) => [row.memberId, row]))
    const favoriteByMember = new Map<number, { weaponName: string; kills: number }>()
    for (const row of weapons) {
      const current = favoriteByMember.get(row.memberId)
      if (!current || row.kills > current.kills) favoriteByMember.set(row.memberId, row)
    }
    const weaponLabels = favoriteByMember.size > 0 ? await getWeaponLabels() : null
    const medals = calculateLifetimeMedalCounts(
      lifetime.map((row) => ({
        memberId: row.memberId,
        clanId: parsedClanId,
        combat: row.combat as Record<string, number>,
        victory: row.victory as Record<string, number>,
        support: row.support as Record<string, number>,
        vehicle: row.vehicle as Record<string, number>,
        movement: row.movement as Record<string, number>,
        other: row.other as Record<string, number>,
      }))
    )

    const cards: RosterMember[] = members.map((member) => {
      const recent = matchesByMember.get(member.id)
      const scores = telemetryByMember.get(member.id)
      const favorite = favoriteByMember.get(member.id)
      return {
        memberId: member.id,
        displayName: member.displayName,
        pubgPlayerName: member.pubgPlayerName,
        avatarUrl: member.identities[0]?.user.avatarUrl ?? null,
        lastMatchAt: member.lastMatchAt?.toISOString() ?? null,
        role: scores
          ? dominantRole({ aggression: scores.aggressionScore, support: scores.supportScore, zoneDiscipline: scores.zoneDisciplineScore })
          : null,
        recent: {
          matches: recent?._count._all ?? 0,
          kills: recent?._sum.kills ?? 0,
          wins: winsByMember.get(member.id) ?? 0,
        },
        favoriteWeapon: favorite && weaponLabels ? { id: favorite.weaponName, label: weaponDisplayName(favorite.weaponName, weaponLabels) } : null,
        medals: medals.get(member.id) ?? { gold: 0, silver: 0, bronze: 0 },
      }
    })

    return Response.json({ clan, members: cards, pendingCount })
  } catch (error) {
    console.error('Error fetching member cards:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
