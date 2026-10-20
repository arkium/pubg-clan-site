import { buildNemesis, isBotAccountId, trackedClanDuels, isRealWeaponName, type OpponentInfo, type OpponentRow, type TrackedClanInfo } from '@/lib/nemesis'
import { getPeriodStart } from '@/lib/period'
import { prisma } from '@/lib/prisma'
import { resolveWeaponName } from '@/lib/pubg-assets'
import { getWeaponLabels, weaponDisplayName } from '@/lib/weapon-label-service'
import { requireSameClanAsMember } from '@/middleware/auth-permission'

/**
 * Némésis d'un joueur (docs/features/nemesis.md) : chasseurs et proies avec le duel inverse, bilan, armes qui l'ont eu.
 * `?period=week|month` facultatif (sans : tout l'historique suivi), `?weapon=` filtre chasseurs, proies et bilan.
 * Tous les événements de la période sont lus (≈ 170 ms pour 1 700 kills, mesuré le 2026-09-27) : plus de plafond.
 */

function parseMemberId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const EVENT_SELECT = {
  killerAccountId: true,
  killerRawKey: true,
  victimAccountId: true,
  victimRawKey: true,
  weaponName: true,
  matchDate: true,
} as const

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const memberId = parseMemberId(id)
    if (!memberId) {
      return Response.json({ error: 'Invalid member id' }, { status: 400 })
    }

    const authError = await requireSameClanAsMember(memberId, request, { readOnly: true })
    if (authError) return authError

    const url = new URL(request.url)
    const weaponParam = url.searchParams.get('weapon')
    const weapon = weaponParam && weaponParam !== 'all' ? weaponParam : null
    const periodParam = url.searchParams.get('period')
    const since = periodParam === 'week' || periodParam === 'month' ? getPeriodStart(periodParam, new Date()) : null
    const dateFilter = since ? { matchDate: { gte: since } } : {}

    const member = await prisma.clanMember.findUnique({ where: { id: memberId }, select: { clanId: true } })
    if (!member?.clanId) {
      return Response.json({ error: 'Member not found or not in a clan' }, { status: 404 })
    }

    const [deaths, kills] = await Promise.all([
      prisma.killEvent.findMany({ where: { victimMemberId: memberId, ...dateFilter }, orderBy: { matchDate: 'desc' }, select: EVENT_SELECT }),
      prisma.killEvent.findMany({ where: { killerMemberId: memberId, ...dateFilter }, orderBy: { matchDate: 'desc' }, select: EVENT_SELECT }),
    ])

    // Toutes les armes de la période (le menu les propose toutes, quel que soit le filtre appliqué).
    const availableWeapons = Array.from(
      new Set([...deaths, ...kills].map((event) => event.weaponName).filter((name): name is string => isRealWeaponName(name)))
    ).sort((left, right) => resolveWeaponName(left).localeCompare(resolveWeaponName(right), 'fr-FR'))

    // Nom et clan des adversaires : identité globale `Player`, une requête bornée aux comptes des kills et des morts.
    // Elle contient tous les joueurs croisés, nommés par n'importe quel clan suivi ou par le cron qui résout en priorité
    // les comptes du kill feed, avec leur clan le plus récent. Avant le 2026-10-20, la page chargeait toutes les lignes
    // EncounteredPlayer du clan (jusqu'à 300 000) à chaque appel (fin d'EncounteredPlayer, inventaire-2026-10-20.md).
    const opponentAccountIds = Array.from(
      new Set(
        [...deaths.map((event) => event.killerAccountId), ...kills.map((event) => event.victimAccountId)].filter(
          (accountId): accountId is string => !!accountId && !isBotAccountId(accountId)
        )
      )
    )
    const globalPlayers = opponentAccountIds.length
      ? await prisma.player.findMany({
          where: { pubgAccountId: { in: opponentAccountIds } },
          select: { pubgAccountId: true, pubgPlayerName: true, opponentClan: { select: { tag: true } } },
        })
      : []
    const knownPlayers = new Map<string, { pubgPlayerName: string; pubgClanTag: string | null }>()
    for (const player of globalPlayers) {
      // Un `Player` créé sans nom garde son identifiant de compte : ce n'est pas un nom.
      if (player.pubgPlayerName && player.pubgPlayerName !== player.pubgAccountId) {
        knownPlayers.set(player.pubgAccountId, { pubgPlayerName: player.pubgPlayerName, pubgClanTag: player.opponentClan?.tag ?? null })
      }
    }

    function resolveOpponent(accountId: string | null, rawKey: string | null): OpponentInfo {
      if (isBotAccountId(accountId)) return { key: accountId as string, name: 'Bot', clanTag: null, isBot: true, resolved: true }
      if (accountId) {
        const info = knownPlayers.get(accountId)
        if (info) return { key: accountId, name: info.pubgPlayerName, clanTag: info.pubgClanTag, isBot: false, resolved: true }
        // Vu dans le kill feed mais jamais relevé dans un lobby (match rattrapé) : seul l'identifiant est connu.
        return { key: accountId, name: accountId, clanTag: null, isBot: false, resolved: false }
      }
      return { key: rawKey ?? 'unknown', name: rawKey ?? 'Inconnu', clanTag: null, isBot: false, resolved: true }
    }

    const built = buildNemesis({ deaths, kills, weapon, resolveOpponent })

    // Joueurs des clans suivis (2026-10-03) : l'effectif actif des clans actifs, ni système ni archivés — quelques
    // centaines de lignes, une requête. Sert au repère « clan suivi » des lignes et à la carte « Clans suivis ».
    const trackedMembers = await prisma.clanMember.findMany({
      where: {
        pubgAccountId: { not: null },
        isActive: true,
        joinStatus: 'active',
        clan: { isActive: true, isSystem: false, archivedAt: null },
      },
      select: { id: true, displayName: true, pubgAccountId: true, clan: { select: { id: true, tag: true, name: true } } },
    })
    const trackedByAccount = new Map<string, TrackedClanInfo>()
    for (const tracked of trackedMembers) {
      if (!tracked.pubgAccountId || !tracked.clan) continue
      trackedByAccount.set(tracked.pubgAccountId, {
        clanId: tracked.clan.id,
        clanTag: tracked.clan.tag,
        clanName: tracked.clan.name,
        memberId: tracked.id,
        memberName: tracked.displayName,
        sameClan: tracked.clan.id === member.clanId,
      })
    }
    const trackedOf = (accountId: string) => trackedByAccount.get(accountId) ?? null
    const withTracked = (rows: OpponentRow[]) => rows.map((row) => ({ ...row, tracked: trackedOf(row.key) }))
    const trackedDuels = trackedClanDuels({ deaths, kills, trackedOf, resolveOpponent })
    const summary = { ...built, topKillers: withTracked(built.topKillers), topVictims: withTracked(built.topVictims), trackedDuels }
    // Libellés des armes renvoyées (réglage `/settings/weapon-labels`, sinon nom lisible déduit de l'identifiant) :
    // le dictionnaire statique du client ne connaît pas toutes les armes (« WeapRPD_C »).
    const weaponLabels = await getWeaponLabels()
    const shown = new Set<string>([
      ...availableWeapons,
      ...summary.topDeathWeapons.map((row) => row.weaponName),
      ...[...summary.topKillers, ...summary.topVictims].flatMap((row) => (row.topWeapon ? [row.topWeapon] : [])),
      ...[...trackedDuels.recentKills, ...trackedDuels.recentDeaths].flatMap((duel) => (duel.weapon ? [duel.weapon] : [])),
    ])
    return Response.json({
      data: {
        ...summary,
        period: since ? periodParam : 'all',
        availableWeapons,
        selectedWeapon: weapon,
        weaponLabels: Object.fromEntries(Array.from(shown, (name) => [name, weaponDisplayName(name, weaponLabels)])),
      },
    })
  } catch (error) {
    console.error('Error fetching nemesis data:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
