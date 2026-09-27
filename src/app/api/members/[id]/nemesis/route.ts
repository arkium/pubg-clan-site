import { buildNemesis, isBotAccountId, isRealWeaponName, type OpponentInfo } from '@/lib/nemesis'
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

    const [deaths, kills, encountered] = await Promise.all([
      prisma.killEvent.findMany({ where: { victimMemberId: memberId, ...dateFilter }, orderBy: { matchDate: 'desc' }, select: EVENT_SELECT }),
      prisma.killEvent.findMany({ where: { killerMemberId: memberId, ...dateFilter }, orderBy: { matchDate: 'desc' }, select: EVENT_SELECT }),
      prisma.encounteredPlayer.findMany({ where: { clanId: member.clanId }, select: { pubgAccountId: true, pubgPlayerName: true, pubgClanTag: true } }),
    ])

    // Toutes les armes de la période (le menu les propose toutes, quel que soit le filtre appliqué).
    const availableWeapons = Array.from(
      new Set([...deaths, ...kills].map((event) => event.weaponName).filter((name): name is string => isRealWeaponName(name)))
    ).sort((left, right) => resolveWeaponName(left).localeCompare(resolveWeaponName(right), 'fr-FR'))

    const encounteredByAccount = new Map(encountered.map((entry) => [entry.pubgAccountId, entry]))
    function resolveOpponent(accountId: string | null, rawKey: string | null): OpponentInfo {
      if (isBotAccountId(accountId)) return { key: accountId as string, name: 'Bot', clanTag: null, isBot: true, resolved: true }
      if (accountId) {
        const info = encounteredByAccount.get(accountId)
        if (info) return { key: accountId, name: info.pubgPlayerName, clanTag: info.pubgClanTag, isBot: false, resolved: true }
        // Vu dans le kill feed mais jamais relevé dans un lobby (match rattrapé) : seul l'identifiant est connu.
        return { key: accountId, name: accountId, clanTag: null, isBot: false, resolved: false }
      }
      return { key: rawKey ?? 'unknown', name: rawKey ?? 'Inconnu', clanTag: null, isBot: false, resolved: true }
    }

    const summary = buildNemesis({ deaths, kills, weapon, resolveOpponent })
    // Libellés des armes renvoyées (réglage `/settings/weapon-labels`, sinon nom lisible déduit de l'identifiant) :
    // le dictionnaire statique du client ne connaît pas toutes les armes (« WeapRPD_C »).
    const weaponLabels = await getWeaponLabels()
    const shown = new Set<string>([
      ...availableWeapons,
      ...summary.topDeathWeapons.map((row) => row.weaponName),
      ...[...summary.topKillers, ...summary.topVictims].flatMap((row) => (row.topWeapon ? [row.topWeapon] : [])),
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
