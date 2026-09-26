/**
 * Vitrine publique de l'accueil (`/`, visiteurs non connectés) — docs/features/accueil.md.
 *
 * Module pur : choix du clan d'une équipe, MVP de la partie, armes de chaque joueur et kill feed, à partir de
 * lignes déjà lues en base par `home-showcase-service.ts`. Importable côté client (types, formatage).
 */

export type ShowcaseTeamMode = 'solo' | 'duo' | 'trio' | 'squad'

export interface ShowcaseSquadMember {
  memberId: number
  name: string
  kills: number
  damage: number
  revives: number
  /** Deux armes au plus, les plus meurtrières de la partie. */
  weapons: string[]
  mvp: boolean
}

export interface ShowcaseDinner {
  squadMatchId: string
  clanId: number
  clanName: string
  clanTag: string
  mapName: string
  mapLabel: string
  /** Fond de carte `/maps/pubg/<carte>.webp`, `null` pour une carte sans image. */
  mapImage: string | null
  playedAt: string
  durationSeconds: number | null
  /** Équipes au départ de la partie (« #1 / 29 ») ; `null` sans télémétrie. */
  teamCount: number | null
  teamMode: ShowcaseTeamMode
  matchType: string
  kills: number
  damage: number
  longestKillMeters: number
  debriefPath: string
  squad: ShowcaseSquadMember[]
}

export type ShowcaseFeedEntry =
  | {
      id: string
      kind: 'kill'
      killer: string
      killerClanTag: string | null
      weapon: string
      headshot: boolean
      distanceMeters: number | null
      /** Tag du clan de la victime s'il est connu ; jamais son pseudo (page publique). */
      victimClanTag: string | null
    }
  | { id: string; kind: 'win'; clanTag: string; mapLabel: string }

export interface HomeShowcaseStats {
  clans: number
  players: number
  weekKills: number
  weekWins: number
  isoWeek: number
}

export interface HomeShowcasePayload {
  generatedAt: string
  stats: HomeShowcaseStats
  dinners: ShowcaseDinner[]
  killFeed: ShowcaseFeedEntry[]
}

/** Cartes dont le fond existe dans `public/maps/pubg/`. */
const MAP_IMAGES = new Set([
  'Baltic_Main',
  'Chimera_Main',
  'Desert_Main',
  'DihorOtok_Main',
  'Heaven_Main',
  'Kiki_Main',
  'Neon_Main',
  'Range_Main',
  'Savage_Main',
  'Summerland_Main',
  'Tiger_Main',
])

export function mapImagePath(mapName: string): string | null {
  return MAP_IMAGES.has(mapName) ? `/maps/pubg/${mapName}.webp` : null
}

/** Les distances de la télémétrie PUBG sont en centimètres. */
export function centimetersToMeters(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return null
  return Math.round(value / 100)
}

/** « 27 min 34 », « 9 min 05 ». */
export function formatMatchDuration(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null
  const minutes = Math.floor(seconds / 60)
  const rest = Math.floor(seconds % 60)
  return `${minutes} min ${String(rest).padStart(2, '0')}`
}

/**
 * Équipes au départ, d'après les instantanés de phase de la télémétrie (`numAliveTeams` de LogGameStatePeriodic) :
 * le maximum une fois la partie lancée (`isGame > 0`), sinon sur tous les instantanés. Vérifié le 2026-09-26 contre
 * le nombre de `rosters` de l'API PUBG (29 = 29). `null` si la télémétrie n'en donne pas.
 */
export function teamCountFromPhaseSnapshots(snapshots: unknown): number | null {
  if (!Array.isArray(snapshots)) return null
  const read = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0)
  let inGame = 0
  let any = 0
  for (const snapshot of snapshots) {
    if (!snapshot || typeof snapshot !== 'object') continue
    const { isGame, numAliveTeams } = snapshot as { isGame?: unknown; numAliveTeams?: unknown }
    const teams = read(numAliveTeams)
    any = Math.max(any, teams)
    if (read(isGame) > 0) inGame = Math.max(inGame, teams)
  }
  const count = inGame || any
  return count > 0 ? Math.round(count) : null
}

export function teamModeFromGameMode(gameMode: string, memberCount: number): ShowcaseTeamMode {
  const mode = gameMode.toLowerCase()
  if (mode.startsWith('solo')) return 'solo'
  if (mode.startsWith('duo')) return 'duo'
  if (mode.startsWith('squad')) return 'squad'
  if (memberCount <= 1) return 'solo'
  if (memberCount === 2) return 'duo'
  if (memberCount === 3) return 'trio'
  return 'squad'
}

export interface ClanRef {
  clanId: number
  clanName: string
  clanTag: string
}

/** Clan le plus représenté dans l'équipe ; à égalité, le premier rencontré. */
export function pickSquadClan(members: readonly ClanRef[]): ClanRef | null {
  const counts = new Map<number, { ref: ClanRef; count: number }>()
  for (const ref of members) {
    const entry = counts.get(ref.clanId)
    if (entry) entry.count += 1
    else counts.set(ref.clanId, { ref, count: 1 })
  }
  let best: { ref: ClanRef; count: number } | null = null
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) best = entry
  }
  return best?.ref ?? null
}

/** MVP de la partie : le plus de kills, puis le plus de dégâts. Aucun sans kill ni dégât. */
export function pickMvpMemberId(members: ReadonlyArray<{ memberId: number; kills: number; damage: number }>): number | null {
  let best: { memberId: number; kills: number; damage: number } | null = null
  for (const member of members) {
    if (!best || member.kills > best.kills || (member.kills === best.kills && member.damage > best.damage)) {
      best = member
    }
  }
  if (!best || (best.kills === 0 && best.damage <= 0)) return null
  return best.memberId
}

export function weaponLabel(key: string | null | undefined, labels: Readonly<Record<string, string>>): string {
  if (!key) return 'Inconnu'
  const label = labels[key]
  if (label) return label
  const withoutPrefix = key.startsWith('Weap') ? key.slice(4) : key
  const withoutSuffix = withoutPrefix.endsWith('_C') ? withoutPrefix.slice(0, -2) : withoutPrefix
  return withoutSuffix.replaceAll('_', ' ').trim() || key
}

/** Deux armes au plus par tueur, par nombre de kills décroissant. */
export function topWeaponsByKiller(
  kills: ReadonlyArray<{ killerMemberId: number | null; weaponName: string | null }>,
  labels: Readonly<Record<string, string>>,
  limit = 2
): Map<number, string[]> {
  const counts = new Map<number, Map<string, number>>()
  for (const kill of kills) {
    if (kill.killerMemberId === null) continue
    const label = weaponLabel(kill.weaponName, labels)
    const perKiller = counts.get(kill.killerMemberId) ?? new Map<string, number>()
    perKiller.set(label, (perKiller.get(label) ?? 0) + 1)
    counts.set(kill.killerMemberId, perKiller)
  }
  const result = new Map<number, string[]>()
  for (const [memberId, perKiller] of counts) {
    result.set(
      memberId,
      [...perKiller.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
        .slice(0, limit)
        .map(([label]) => label)
    )
  }
  return result
}

export interface FeedKill {
  id: string
  squadMatchId: string
  killerAccountId: string | null
  victimAccountId: string | null
  timestampSeconds: number | null
  matchDate: Date
  killer: string
  killerClanTag: string | null
  weaponName: string | null
  distance: number | null
  headshot: boolean
  victimClanTag: string | null
}

const PAN_WEAPONS = /^WeapPan(?:Projectile)?_C$/
/** Au-delà de cette distance, un kill est « longue distance ». */
export const LONG_RANGE_METERS = 200

/** Intérêt d'un kill pour le feed : poêle, longue distance, tir à la tête. 0 = kill ordinaire. */
export function killScore(kill: Pick<FeedKill, 'weaponName' | 'distance' | 'headshot'>): number {
  let score = 0
  if (kill.weaponName && PAN_WEAPONS.test(kill.weaponName)) score += 3
  const meters = centimetersToMeters(kill.distance)
  if (meters !== null && meters >= LONG_RANGE_METERS) score += 2
  if (kill.headshot) score += 1
  return score
}

/** Un même frag est enregistré une fois par clan suivi présent dans l'équipe : on n'en garde qu'un. */
export function dedupeKills<T extends Pick<FeedKill, 'squadMatchId' | 'killerAccountId' | 'victimAccountId' | 'timestampSeconds'>>(
  kills: readonly T[]
): T[] {
  const seen = new Set<string>()
  return kills.filter((kill) => {
    const key = `${kill.squadMatchId}|${kill.killerAccountId}|${kill.victimAccountId}|${kill.timestampSeconds}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Kill feed : les kills les plus remarquables des dernières victoires (poêle, longue distance, tête ; les kills
 * ordinaires complètent si besoin), `perKiller` au plus par joueur tant que d'autres kills restent, et une ligne
 * « Top 1 » toutes les `winEvery` entrées.
 */
export function buildKillFeed(input: {
  kills: readonly FeedKill[]
  wins: ReadonlyArray<{ squadMatchId: string; clanTag: string; mapLabel: string }>
  labels: Readonly<Record<string, string>>
  limit?: number
  perKiller?: number
  winEvery?: number
}): ShowcaseFeedEntry[] {
  const { labels, limit = 12, perKiller = 2, winEvery = 4 } = input
  const ranked = dedupeKills(input.kills)
    .map((kill) => ({ kill, score: killScore(kill) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.kill.matchDate.getTime() - a.kill.matchDate.getTime() ||
        (b.kill.timestampSeconds ?? 0) - (a.kill.timestampSeconds ?? 0)
    )

  // Un joueur en feu ne monopolise pas le feed : plafond par tueur, puis complément dans l'ordre.
  const picked = new Set<(typeof ranked)[number]>()
  const perKillerCount = new Map<string, number>()
  for (const entry of ranked) {
    if (picked.size >= limit) break
    const count = perKillerCount.get(entry.kill.killer) ?? 0
    if (count >= perKiller) continue
    perKillerCount.set(entry.kill.killer, count + 1)
    picked.add(entry)
  }
  for (const entry of ranked) {
    if (picked.size >= limit) break
    picked.add(entry)
  }

  const kills = ranked
    .filter((entry) => picked.has(entry))
    .map(
      ({ kill }): ShowcaseFeedEntry => ({
        id: kill.id,
        kind: 'kill',
        killer: kill.killer,
        killerClanTag: kill.killerClanTag,
        weapon: weaponLabel(kill.weaponName, labels),
        headshot: kill.headshot,
        distanceMeters: centimetersToMeters(kill.distance),
        victimClanTag: kill.victimClanTag,
      })
    )

  const wins = input.wins.map(
    (win): ShowcaseFeedEntry => ({ id: `win-${win.squadMatchId}`, kind: 'win', clanTag: win.clanTag, mapLabel: win.mapLabel })
  )

  const feed: ShowcaseFeedEntry[] = []
  let winIndex = 0
  kills.forEach((entry, index) => {
    feed.push(entry)
    if ((index + 1) % winEvery === 0 && winIndex < wins.length) feed.push(wins[winIndex++])
  })
  // Sans kill remarquable, le feed garde au moins les victoires.
  if (kills.length < winEvery && winIndex < wins.length) feed.push(...wins.slice(winIndex, winIndex + 3))
  return feed
}
