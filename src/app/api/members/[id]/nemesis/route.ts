import { prisma } from '@/lib/prisma'
import { resolveWeaponName } from '@/lib/pubg-assets'
import { requireSameClanAsMember } from '@/middleware/auth-permission'

function parseMemberId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function isBotAccountId(accountId: string | null) {
  return !!accountId && accountId.startsWith('ai.')
}

// Only real weapons should be crowned "arme principale" — damage causer names
// also cover bluezone ticks, falls, drowning, vehicle explosions, etc., which
// would otherwise show up as a nonsensical "weapon".
function isRealWeaponName(weaponName: string | null) {
  if (!weaponName) return false
  const normalized = weaponName.toLowerCase()
  return normalized.startsWith('item_weapon_') || normalized.startsWith('weap')
}

type KillEventRow = {
  killerAccountId: string | null
  killerRawKey: string | null
  victimAccountId: string | null
  victimRawKey: string | null
  weaponName: string | null
  matchDate: Date
}

type OpponentInfo = { key: string; name: string; clanTag: string | null; isBot: boolean; resolved: boolean }

function aggregateOpponents(
  events: KillEventRow[],
  side: 'killer' | 'victim',
  resolveOpponent: (accountId: string | null, rawKey: string | null) => OpponentInfo
) {
  const groups = new Map<
    string,
    OpponentInfo & { count: number; lastAt: Date; weapons: Map<string, number> }
  >()

  for (const event of events) {
    const accountId = side === 'killer' ? event.killerAccountId : event.victimAccountId
    const rawKey = side === 'killer' ? event.killerRawKey : event.victimRawKey

    // No accountId AND no raw name means there was no actual attacker/victim
    // character on this side (e.g. a bluezone tick death has no "killer") —
    // not a real opponent, exclude instead of lumping it under "Joueur inconnu".
    if (!accountId && !rawKey) {
      continue
    }

    const opponent = resolveOpponent(accountId, rawKey)

    const existing = groups.get(opponent.key)
    if (existing) {
      existing.count += 1
      if (event.matchDate > existing.lastAt) {
        existing.lastAt = event.matchDate
      }
      if (isRealWeaponName(event.weaponName)) {
        existing.weapons.set(event.weaponName!, (existing.weapons.get(event.weaponName!) ?? 0) + 1)
      }
    } else {
      const weapons = new Map<string, number>()
      if (isRealWeaponName(event.weaponName)) {
        weapons.set(event.weaponName!, 1)
      }
      groups.set(opponent.key, { ...opponent, count: 1, lastAt: event.matchDate, weapons })
    }
  }

  return Array.from(groups.values())
    .map((group) => ({
      key: group.key,
      name: group.name,
      clanTag: group.clanTag,
      isBot: group.isBot,
      resolved: group.resolved,
      count: group.count,
      lastAt: group.lastAt.toISOString(),
      topWeapon: Array.from(group.weapons.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? null,
    }))
    .sort((left, right) => right.count - left.count)
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

    const authError = await requireSameClanAsMember(memberId, request)
    if (authError) return authError

    const url = new URL(request.url)
    const weaponFilterParam = url.searchParams.get('weapon')
    const weaponFilter = weaponFilterParam && weaponFilterParam !== 'all' ? weaponFilterParam : null

    const member = await prisma.clanMember.findUnique({
      where: { id: memberId },
      select: { clanId: true },
    })

    if (!member?.clanId) {
      return Response.json({ error: 'Member not found or not in a clan' }, { status: 404 })
    }

    const [deaths, kills, encountered] = await Promise.all([
      prisma.killEvent.findMany({
        where: { victimMemberId: memberId },
        orderBy: { matchDate: 'desc' },
        take: 500,
        select: {
          killerAccountId: true,
          killerRawKey: true,
          victimAccountId: true,
          victimRawKey: true,
          weaponName: true,
          matchDate: true,
        },
      }),
      prisma.killEvent.findMany({
        where: { killerMemberId: memberId },
        orderBy: { matchDate: 'desc' },
        take: 500,
        select: {
          killerAccountId: true,
          killerRawKey: true,
          victimAccountId: true,
          victimRawKey: true,
          weaponName: true,
          matchDate: true,
        },
      }),
      prisma.encounteredPlayer.findMany({
        where: { clanId: member.clanId },
        select: { pubgAccountId: true, pubgPlayerName: true, pubgClanTag: true },
      }),
    ])

    // Full list of real weapons this member has ever been killed by or killed
    // with, computed on the unfiltered data so the dropdown always offers every
    // option regardless of the currently applied filter.
    const availableWeapons = Array.from(
      new Set(
        [...deaths, ...kills]
          .map((event) => event.weaponName)
          .filter((name): name is string => isRealWeaponName(name))
      )
    ).sort((left, right) => resolveWeaponName(left).localeCompare(resolveWeaponName(right), 'fr-FR'))

    const filteredDeaths = weaponFilter ? deaths.filter((event) => event.weaponName === weaponFilter) : deaths
    const filteredKills = weaponFilter ? kills.filter((event) => event.weaponName === weaponFilter) : kills

    const encounteredByAccount = new Map(encountered.map((entry) => [entry.pubgAccountId, entry]))

    function resolveOpponent(accountId: string | null, rawKey: string | null): OpponentInfo {
      if (isBotAccountId(accountId)) {
        return { key: accountId as string, name: 'Bot', clanTag: null, isBot: true, resolved: true }
      }

      if (accountId) {
        const info = encounteredByAccount.get(accountId)
        if (info) {
          return { key: accountId, name: info.pubgPlayerName, clanTag: info.pubgClanTag, isBot: false, resolved: true }
        }
        // Opponent seen in the kill-feed but never captured via a roster sync
        // (e.g. backfilled match, or match synced before EncounteredPlayer
        // existed) — no display name available yet, only the raw account id.
        return { key: accountId, name: accountId, clanTag: null, isBot: false, resolved: false }
      }

      return { key: rawKey ?? 'unknown', name: rawKey ?? 'Inconnu', clanTag: null, isBot: false, resolved: true }
    }

    const topKillers = aggregateOpponents(filteredDeaths, 'killer', resolveOpponent).filter((entry) => !entry.isBot)
    const topVictims = aggregateOpponents(filteredKills, 'victim', resolveOpponent).filter((entry) => !entry.isBot)
    const botKillCount = filteredKills.filter((event) => isBotAccountId(event.victimAccountId)).length
    const botDeathCount = filteredDeaths.filter((event) => isBotAccountId(event.killerAccountId)).length
    // Deaths with no attacker character at all (bluezone tick, drowning, fall) —
    // excluded from topKillers since there's no real opponent to attribute them to.
    const environmentalDeathCount = filteredDeaths.filter(
      (event) => !event.killerAccountId && !event.killerRawKey
    ).length

    return Response.json({
      data: {
        totalDeathsTracked: filteredDeaths.length,
        totalKillsTracked: filteredKills.length,
        botKillCount,
        botDeathCount,
        environmentalDeathCount,
        availableWeapons,
        selectedWeapon: weaponFilter,
        topKillers: topKillers.slice(0, 10),
        topVictims: topVictims.slice(0, 10),
      },
    })
  } catch (error) {
    console.error('Error fetching nemesis data:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
