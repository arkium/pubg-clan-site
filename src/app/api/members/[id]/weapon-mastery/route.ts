import { prisma } from '@/lib/prisma'
import { fetchWeaponMastery, searchPlayerByName } from '@/lib/pubg'
import { getWeaponLabels, weaponDisplayName } from '@/lib/weapon-label-service'
import { masteryTelemetryId } from '@/lib/weapons/member-arsenal'
import { requireSameClanAsMember } from '@/middleware/auth-permission'

function parseMemberId(id: string) {
  const memberId = Number(id)
  return Number.isInteger(memberId) && memberId > 0 ? memberId : null
}

async function resolvePlayerId(memberId: number) {
  const member = await prisma.clanMember.findUnique({
    where: { id: memberId },
    select: { id: true, pubgPlayerName: true, pubgAccountId: true, platformShard: true },
  })

  if (!member) {
    return null
  }

  const shard = member.platformShard
  let playerId = member.pubgAccountId

  if (!playerId) {
    const player = await searchPlayerByName(member.pubgPlayerName, shard, { memberId })
    if (!player?.accountId) {
      return null
    }
    playerId = player.accountId
    await prisma.clanMember.update({ where: { id: memberId }, data: { pubgAccountId: playerId } })
  }

  return { shard, playerId }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const memberId = parseMemberId(id)

    if (!memberId) {
      return Response.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const authError = await requireSameClanAsMember(memberId, request, { readOnly: true })
    if (authError) return authError

    const [rows, labels] = await Promise.all([
      prisma.memberWeaponMastery.findMany({ where: { memberId }, orderBy: { kills: 'desc' } }),
      getWeaponLabels(),
    ])
    // Libellé du site (`/settings/weapon-labels`) par l'identifiant télémétrie : « HK416 » devient « M416 ».
    const weapons = rows.map((row) => ({ ...row, weaponLabel: weaponDisplayName(masteryTelemetryId(row.weaponId), labels) }))

    return Response.json({ memberId, weapons })
  } catch (error) {
    console.error('[weapon-mastery] GET error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const memberId = parseMemberId(id)

    if (!memberId) {
      return Response.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const authError = await requireSameClanAsMember(memberId, request)
    if (authError) return authError

    const resolved = await resolvePlayerId(memberId)
    if (!resolved) {
      return Response.json({ error: 'Member not found or no PUBG account linked' }, { status: 404 })
    }

    const entries = await fetchWeaponMastery(resolved.playerId, resolved.shard, { memberId })

    if (entries.length === 0) {
      return Response.json({ memberId, count: 0, weapons: [] })
    }

    const now = new Date()

    await prisma.$transaction(
      entries.map((entry) =>
        prisma.memberWeaponMastery.upsert({
          where: { memberId_weaponId: { memberId, weaponId: entry.weaponId } },
          update: {
            weaponName: entry.weaponName,
            kills: entry.kills,
            headshots: entry.headshots,
            knockouts: entry.knockouts,
            shots: entry.shots,
            hits: entry.hits,
            damage: entry.damage,
            longestKillDistance: entry.longestKillDistance,
            level: entry.level,
            xpTotal: entry.xpTotal,
            tier: entry.tier,
            lastRefreshedAt: now,
          },
          create: {
            memberId,
            weaponId: entry.weaponId,
            weaponName: entry.weaponName,
            kills: entry.kills,
            headshots: entry.headshots,
            knockouts: entry.knockouts,
            shots: entry.shots,
            hits: entry.hits,
            damage: entry.damage,
            longestKillDistance: entry.longestKillDistance,
            level: entry.level,
            xpTotal: entry.xpTotal,
            tier: entry.tier,
            lastRefreshedAt: now,
          },
        })
      )
    )

    return Response.json({ memberId, count: entries.length })
  } catch (error) {
    console.error('[weapon-mastery] POST error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
