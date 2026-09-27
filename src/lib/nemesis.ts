/**
 * Némésis d'un joueur (`/members/[id]/nemesis`, docs/features/nemesis.md) : qui l'élimine, qui il élimine, et les
 * comptes à régler. Calcul pur depuis ses `KillEvent` (en tant que tueur et en tant que victime), testé par
 * `nemesis.test.ts` ; la route lit **tous** les événements de la période (plus de plafond à 500 depuis le 2026-09-27 :
 * les plus gros joueurs dépassent 1 700 kills et les totaux étaient tronqués).
 */

export type NemesisEvent = {
  killerAccountId: string | null
  killerRawKey: string | null
  victimAccountId: string | null
  victimRawKey: string | null
  weaponName: string | null
  matchDate: Date
}

export type OpponentInfo = { key: string; name: string; clanTag: string | null; isBot: boolean; resolved: boolean }

export type OpponentRow = {
  key: string
  name: string
  clanTag: string | null
  isBot: boolean
  /** `false` : compte vu dans le kill feed mais jamais nommé (match rattrapé) — affiché « Joueur inconnu ». */
  resolved: boolean
  count: number
  /** Duel dans l'autre sens, même période, toutes armes : kills du joueur sur ce chasseur, ou morts face à cette proie. */
  reverseCount: number
  lastAt: string
  topWeapon: string | null
}

export const isBotAccountId = (accountId: string | null) => !!accountId && accountId.startsWith('ai.')

/**
 * Seules les vraies armes comptent pour l'« arme principale » : les causes de dégâts couvrent aussi la zone bleue, les
 * chutes, la noyade ou l'explosion d'un véhicule.
 */
export function isRealWeaponName(weaponName: string | null) {
  if (!weaponName) return false
  const normalized = weaponName.toLowerCase()
  return normalized.startsWith('item_weapon_') || normalized.startsWith('weap')
}

/** Pas de personnage de l'autre côté (mort par la zone, chute, noyade) : pas un adversaire. */
const sideKey = (event: NemesisEvent, side: 'killer' | 'victim') =>
  side === 'killer' ? { accountId: event.killerAccountId, rawKey: event.killerRawKey } : { accountId: event.victimAccountId, rawKey: event.victimRawKey }

export function aggregateOpponents(
  events: readonly NemesisEvent[],
  side: 'killer' | 'victim',
  resolveOpponent: (accountId: string | null, rawKey: string | null) => OpponentInfo
) {
  const groups = new Map<string, OpponentInfo & { count: number; lastAt: Date; weapons: Map<string, number> }>()
  for (const event of events) {
    const { accountId, rawKey } = sideKey(event, side)
    if (!accountId && !rawKey) continue
    const opponent = resolveOpponent(accountId, rawKey)
    const group = groups.get(opponent.key) ?? { ...opponent, count: 0, lastAt: event.matchDate, weapons: new Map<string, number>() }
    group.count += 1
    if (event.matchDate > group.lastAt) group.lastAt = event.matchDate
    if (isRealWeaponName(event.weaponName)) group.weapons.set(event.weaponName!, (group.weapons.get(event.weaponName!) ?? 0) + 1)
    groups.set(opponent.key, group)
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
      topWeapon: Array.from(group.weapons.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null,
    }))
    .sort((a, b) => b.count - a.count || b.lastAt.localeCompare(a.lastAt) || a.name.localeCompare(b.name))
}

export function aggregateWeapons(events: readonly NemesisEvent[]) {
  const counts = new Map<string, number>()
  for (const event of events) if (isRealWeaponName(event.weaponName)) counts.set(event.weaponName!, (counts.get(event.weaponName!) ?? 0) + 1)
  return Array.from(counts.entries())
    .map(([weaponName, count]) => ({ weaponName, count }))
    .sort((a, b) => b.count - a.count || a.weaponName.localeCompare(b.weaponName))
}

export type NemesisSummary = ReturnType<typeof buildNemesis>

/**
 * Chasseurs et proies (joueurs seulement, 10 premiers), duel inverse pour chaque ligne, bilan (joueurs, bots, zone) et
 * « death cam » (armes de toutes les morts de la période, sans le filtre d'arme).
 */
export function buildNemesis(input: {
  deaths: readonly NemesisEvent[]
  kills: readonly NemesisEvent[]
  weapon: string | null
  resolveOpponent: (accountId: string | null, rawKey: string | null) => OpponentInfo
  limit?: number
}) {
  const limit = input.limit ?? 10
  const deaths = input.weapon ? input.deaths.filter((event) => event.weaponName === input.weapon) : input.deaths
  const kills = input.weapon ? input.kills.filter((event) => event.weaponName === input.weapon) : input.kills

  // Duel inverse : toutes armes confondues, pour que « 2–7 » reste le vrai score entre les deux joueurs.
  const killsByOpponent = new Map(aggregateOpponents(input.kills, 'victim', input.resolveOpponent).map((row) => [row.key, row.count]))
  const deathsByOpponent = new Map(aggregateOpponents(input.deaths, 'killer', input.resolveOpponent).map((row) => [row.key, row.count]))

  const topKillers: OpponentRow[] = aggregateOpponents(deaths, 'killer', input.resolveOpponent)
    .filter((row) => !row.isBot)
    .slice(0, limit)
    .map((row) => ({ ...row, reverseCount: killsByOpponent.get(row.key) ?? 0 }))
  const topVictims: OpponentRow[] = aggregateOpponents(kills, 'victim', input.resolveOpponent)
    .filter((row) => !row.isBot)
    .slice(0, limit)
    .map((row) => ({ ...row, reverseCount: deathsByOpponent.get(row.key) ?? 0 }))

  const botKillCount = kills.filter((event) => isBotAccountId(event.victimAccountId)).length
  const botDeathCount = deaths.filter((event) => isBotAccountId(event.killerAccountId)).length
  const environmentalDeathCount = deaths.filter((event) => !event.killerAccountId && !event.killerRawKey).length
  const playerKills = kills.length - botKillCount
  const playerDeaths = deaths.length - botDeathCount - environmentalDeathCount

  return {
    totalDeathsTracked: deaths.length,
    totalKillsTracked: kills.length,
    playerKills,
    playerDeaths,
    playerKd: playerDeaths > 0 ? playerKills / playerDeaths : playerKills,
    botKillCount,
    botDeathCount,
    environmentalDeathCount,
    topDeathWeapons: aggregateWeapons(input.deaths).slice(0, 5),
    topKillers,
    topVictims,
  }
}

/** « 5 kills à rendre », « Vengé » : l'écart de la revanche contre le némésis. */
export function revengeLabel(row: Pick<OpponentRow, 'count' | 'reverseCount'> | null) {
  if (!row) return null
  const debt = row.count - row.reverseCount
  if (debt <= 0) return { settled: true, text: 'Vengé' }
  return { settled: false, text: `${debt} kill${debt > 1 ? 's' : ''} à rendre` }
}
