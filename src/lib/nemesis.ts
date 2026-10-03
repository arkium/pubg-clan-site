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

/**
 * Adversaire membre d'un clan suivi par le site (actif, ni système ni archivé) : repère sur la page. `sameClan` : le clan
 * du joueur consulté — seul cas où son nom mène à sa page (les pages joueur ne s'ouvrent qu'au même clan).
 */
export type TrackedClanInfo = { clanId: number; clanTag: string; clanName: string; memberId: number; memberName: string; sameClan: boolean }

export type OpponentRow = {
  /** Renseigné par la route pour les lignes affichées ; absent ou `null` : joueur extérieur au site. */
  tracked?: TrackedClanInfo | null
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

/**
 * Suicide (sa propre grenade, un véhicule…) : le kill feed porte le même joueur comme tueur et victime. Ce n'est ni un
 * duel, ni un kill, ni une mort face à un joueur — ignoré partout (décision du 2026-10-03 : la page affichait le joueur
 * comme son propre némésis, « revanche 3–3 »).
 */
export function isSelfKill(event: NemesisEvent) {
  if (event.killerAccountId || event.victimAccountId) return !!event.killerAccountId && event.killerAccountId === event.victimAccountId
  return !!event.killerRawKey && event.killerRawKey === event.victimRawKey
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
  // Les suicides sortent de tout le calcul : classements, revanche, bilan, death cam.
  const allDeaths = input.deaths.filter((event) => !isSelfKill(event))
  const allKills = input.kills.filter((event) => !isSelfKill(event))
  const deaths = input.weapon ? allDeaths.filter((event) => event.weaponName === input.weapon) : allDeaths
  // Compté une fois, côté morts : la même ligne du kill feed est à la fois sa mort et son « kill ». Suit le filtre d'arme.
  const suicideCount = input.deaths.filter((event) => isSelfKill(event) && (!input.weapon || event.weaponName === input.weapon)).length
  const kills = input.weapon ? allKills.filter((event) => event.weaponName === input.weapon) : allKills

  // Duel inverse : toutes armes confondues, pour que « 2–7 » reste le vrai score entre les deux joueurs.
  const killsByOpponent = new Map(aggregateOpponents(allKills, 'victim', input.resolveOpponent).map((row) => [row.key, row.count]))
  const deathsByOpponent = new Map(aggregateOpponents(allDeaths, 'killer', input.resolveOpponent).map((row) => [row.key, row.count]))

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
    suicideCount,
    topDeathWeapons: aggregateWeapons(allDeaths).slice(0, 5),
    topKillers,
    topVictims,
  }
}

/** Un duel contre un joueur d'un autre clan suivi : qui, de quel clan, à quelle arme, quand. */
/** Un joueur d'un autre clan suivi croisé en duel : son dernier duel (arme, date) et le nombre de duels de la période. */
export type TrackedClanDuel = { key: string; name: string; tracked: TrackedClanInfo; weapon: string | null; at: string; count: number }

/** Joueurs montrés de chaque côté de la carte « Clans suivis ». */
export const TRACKED_DUELS_SHOWN = 3

/**
 * Carte « Clans suivis » (2026-10-03) : les 3 derniers joueurs (distincts) d'un **autre** clan suivi éliminés, les 3
 * derniers à t'avoir éliminé, et les totaux de la période. Toutes armes (comme la death cam), suicides exclus ; les
 * duels internes au clan (parties personnalisées) n'y figurent pas.
 */
export function trackedClanDuels(input: {
  deaths: readonly NemesisEvent[]
  kills: readonly NemesisEvent[]
  trackedOf: (accountId: string) => TrackedClanInfo | null
  resolveOpponent: (accountId: string | null, rawKey: string | null) => OpponentInfo
  limit?: number
}) {
  const limit = input.limit ?? TRACKED_DUELS_SHOWN
  const recent = (events: readonly NemesisEvent[], side: 'killer' | 'victim') => {
    let total = 0
    const byPlayer = new Map<string, TrackedClanDuel>()
    for (const event of events) {
      if (isSelfKill(event)) continue
      const accountId = side === 'killer' ? event.killerAccountId : event.victimAccountId
      const tracked = accountId ? input.trackedOf(accountId) : null
      if (!accountId || !tracked || tracked.sameClan) continue
      total += 1
      const at = event.matchDate.toISOString()
      const known = byPlayer.get(accountId)
      if (known) {
        known.count += 1
        if (at <= known.at) continue
      }
      const rawKey = side === 'killer' ? event.killerRawKey : event.victimRawKey
      const opponent = input.resolveOpponent(accountId, rawKey)
      byPlayer.set(accountId, {
        key: accountId,
        name: opponent.resolved ? opponent.name : tracked.memberName,
        tracked,
        weapon: isRealWeaponName(event.weaponName) ? event.weaponName : null,
        at,
        count: known?.count ?? 1,
      })
    }
    const players = Array.from(byPlayer.values()).sort((a, b) => b.at.localeCompare(a.at) || a.name.localeCompare(b.name))
    return { total, players: players.slice(0, limit) }
  }
  const kills = recent(input.kills, 'victim')
  const deaths = recent(input.deaths, 'killer')
  return { killCount: kills.total, deathCount: deaths.total, recentKills: kills.players, recentDeaths: deaths.players }
}

/** « 5 kills à rendre », « Vengé » : l'écart de la revanche contre le némésis. */
export function revengeLabel(row: Pick<OpponentRow, 'count' | 'reverseCount'> | null) {
  if (!row) return null
  const debt = row.count - row.reverseCount
  if (debt <= 0) return { settled: true, text: 'Vengé' }
  return { settled: false, text: `${debt} kill${debt > 1 ? 's' : ''} à rendre` }
}
