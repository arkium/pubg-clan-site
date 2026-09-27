/**
 * Carrière PUBG d'un joueur (`/members/[id]/stats`, docs/features/carriere-joueur.md) et calendrier de son tableau de
 * bord. Module pur, testé par `player-career.test.ts` : la route `stats` calcule les médailles du clan, la route
 * `calendar` les jours de jeu, la page et les cartes ne font qu'afficher.
 */

// ── Carrière ─────────────────────────────────────────────────────────────────────────────────────

/** Stats de carrière PUBG (`MemberLifetimeStats`, tous modes ou un mode). */
export type LifetimeStats = {
  combat: {
    kills: number
    /** `losses` de l'API : parties sans top 1. Le K/D PUBG est kills ÷ défaites. */
    deaths: number
    kdRatio: number
    /** Kills en headshot. */
    headshots: number
    assists: number
    knockouts: number
    highestKillstreak: number
    longestKill: number
    teamkills: number
    suicides: number
  }
  victory: { wins: number; losses: number; winLossRatio: number; longestTimeAlive: number }
  /** `boostsUsed` et `healed` : nombres d'objets utilisés (API `boosts`, `heals`), pas des points de vie. */
  support: { teammatesRevived: number; boostsUsed: number; healed: number }
  vehicle: { vehiclesDestroyed: number; roadkills: number }
  /** Distances en mètres. */
  movement: { drivenDistance: number; walkedDistance: number; swamDistance: number }
  other: { weaponsPicked: number; damageGiven: number; timeSurvived?: number; roundsPlayed?: number; daysPlayed?: number }
}

export type CareerMode = 'all' | 'squad' | 'duo' | 'solo'
export const CAREER_MODES: ReadonlyArray<{ value: CareerMode; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'squad', label: 'Squad' },
  { value: 'duo', label: 'Duo' },
  { value: 'solo', label: 'Solo' },
]
export const CAREER_MODE_LABELS: Record<CareerMode, string> = { all: 'tous modes', squad: 'squad', duo: 'duo', solo: 'solo' }

const count = new Intl.NumberFormat('fr-FR')
const decimal = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const oneDecimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })
export const formatCount = (value: number) => count.format(Math.round(value))
export const formatRatio = (value: number) => decimal.format(value)
export const formatKm = (meters: number) => `${count.format(Math.round(meters / 1000))} km`
export const formatMinutes = (seconds: number) => `${Math.round(seconds / 60)} min`
export const formatMeters = (meters: number) => `${count.format(Math.round(meters))} m`
/** 612 400 → « 612 k » ; sous 10 000, le nombre entier. */
export const formatThousands = (value: number) => (value >= 10_000 ? `${count.format(Math.round(value / 1000))} k` : formatCount(value))

export const gamesOf = (stats: LifetimeStats) => stats.other.roundsPlayed || stats.victory.wins + stats.victory.losses
export const winRateOf = (stats: LifetimeStats) => {
  const games = gamesOf(stats)
  return games > 0 ? (stats.victory.wins / games) * 100 : 0
}

// ── Médailles du clan ────────────────────────────────────────────────────────────────────────────

export type MedalRank = 1 | 2 | 3
export type MedalRanks = Record<string, MedalRank | null>

/**
 * Stats médaillées : seulement celles où « plus = mieux » (décision du 2026-09-27). Moins de morts, de défaites, de
 * suicides (récompensaient ceux qui jouent peu) et le plus de teamkills ne médaillent plus.
 */
export const MEDAL_METRICS: ReadonlyArray<{ key: string; label: string; value: (stats: LifetimeStats) => number; format: (stats: LifetimeStats) => string }> = [
  { key: 'combat.kills', label: 'Kills', value: (s) => s.combat.kills, format: (s) => formatCount(s.combat.kills) },
  { key: 'combat.kdRatio', label: 'Ratio K/D', value: (s) => s.combat.kdRatio, format: (s) => formatRatio(s.combat.kdRatio) },
  { key: 'combat.headshots', label: 'Headshots', value: (s) => s.combat.headshots, format: (s) => formatCount(s.combat.headshots) },
  { key: 'combat.knockouts', label: 'Knocks', value: (s) => s.combat.knockouts, format: (s) => formatCount(s.combat.knockouts) },
  { key: 'combat.assists', label: 'Assists', value: (s) => s.combat.assists, format: (s) => formatCount(s.combat.assists) },
  { key: 'combat.highestKillstreak', label: 'Série max', value: (s) => s.combat.highestKillstreak, format: (s) => `${formatCount(s.combat.highestKillstreak)} kills` },
  { key: 'combat.longestKill', label: 'Kill le plus long', value: (s) => s.combat.longestKill, format: (s) => formatMeters(s.combat.longestKill) },
  { key: 'victory.wins', label: 'Victoires', value: (s) => s.victory.wins, format: (s) => formatCount(s.victory.wins) },
  { key: 'victory.winRate', label: 'Win rate', value: winRateOf, format: (s) => `${oneDecimal.format(winRateOf(s))} %` },
  { key: 'victory.longestTimeAlive', label: 'Survie max', value: (s) => s.victory.longestTimeAlive, format: (s) => formatMinutes(s.victory.longestTimeAlive) },
  { key: 'support.teammatesRevived', label: 'Réanimations', value: (s) => s.support.teammatesRevived, format: (s) => formatCount(s.support.teammatesRevived) },
  { key: 'support.healed', label: 'Soins utilisés', value: (s) => s.support.healed, format: (s) => formatCount(s.support.healed) },
  { key: 'support.boostsUsed', label: 'Boosts utilisés', value: (s) => s.support.boostsUsed, format: (s) => formatCount(s.support.boostsUsed) },
  { key: 'other.damageGiven', label: 'Dégâts', value: (s) => s.other.damageGiven, format: (s) => formatThousands(s.other.damageGiven) },
  { key: 'other.weaponsPicked', label: 'Armes ramassées', value: (s) => s.other.weaponsPicked, format: (s) => formatCount(s.other.weaponsPicked) },
  { key: 'vehicle.roadkills', label: 'Roadkills', value: (s) => s.vehicle.roadkills, format: (s) => formatCount(s.vehicle.roadkills) },
  { key: 'vehicle.vehiclesDestroyed', label: 'Véhicules détruits', value: (s) => s.vehicle.vehiclesDestroyed, format: (s) => formatCount(s.vehicle.vehiclesDestroyed) },
  { key: 'movement.walkedDistance', label: 'À pied', value: (s) => s.movement.walkedDistance, format: (s) => formatKm(s.movement.walkedDistance) },
  { key: 'movement.drivenDistance', label: 'En véhicule', value: (s) => s.movement.drivenDistance, format: (s) => formatKm(s.movement.drivenDistance) },
  { key: 'movement.swamDistance', label: 'À la nage', value: (s) => s.movement.swamDistance, format: (s) => formatKm(s.movement.swamDistance) },
]

/**
 * Place du joueur sur le podium du clan, stat par stat (membres actifs, tous modes). Classement « compétition » : les ex
 * æquo partagent la médaille (23, 22, 22, 22 → or, argent, argent, argent) ; une valeur nulle ne médaille pas.
 */
export function clanMedalRanks(entries: ReadonlyArray<{ memberId: number; stats: LifetimeStats }>, memberId: number): MedalRanks {
  const own = entries.find((entry) => entry.memberId === memberId)
  return Object.fromEntries(
    MEDAL_METRICS.map((metric) => {
      if (!own) return [metric.key, null]
      const value = metric.value(own.stats)
      if (!(value > 0)) return [metric.key, null]
      const rank = 1 + entries.filter((entry) => metric.value(entry.stats) > value).length
      return [metric.key, rank <= 3 ? (rank as MedalRank) : null]
    })
  )
}

export type CareerMedal = { key: string; label: string; rank: MedalRank; value: string }

/** Vitrine : les stats médaillées, de l'or au bronze, avec la valeur tous modes. */
export function careerMedals(ranks: MedalRanks, stats: LifetimeStats): CareerMedal[] {
  return MEDAL_METRICS.flatMap((metric) => {
    const rank = ranks[metric.key]
    return rank ? [{ key: metric.key, label: metric.label, rank, value: metric.format(stats) }] : []
  }).sort((a, b) => a.rank - b.rank)
}

export function medalCounts(ranks: MedalRanks): Record<MedalRank, number> {
  const counts: Record<MedalRank, number> = { 1: 0, 2: 0, 3: 0 }
  for (const rank of Object.values(ranks)) if (rank) counts[rank] += 1
  return counts
}

// ── Records et fiches ────────────────────────────────────────────────────────────────────────────

export type CareerRecord = { id: 'longest' | 'streak' | 'survival' | 'roadkills' | 'vehicles'; label: string; value: string }

export function careerRecords(stats: LifetimeStats): CareerRecord[] {
  return [
    { id: 'longest', label: 'kill le plus long', value: formatMeters(stats.combat.longestKill) },
    { id: 'streak', label: 'série max en une partie', value: `${formatCount(stats.combat.highestKillstreak)} kills` },
    { id: 'survival', label: 'survie la plus longue', value: formatMinutes(stats.victory.longestTimeAlive) },
    { id: 'roadkills', label: 'roadkills', value: formatCount(stats.vehicle.roadkills) },
    { id: 'vehicles', label: 'véhicules détruits', value: formatCount(stats.vehicle.vehiclesDestroyed) },
  ]
}

export type CareerThemeRow = { label: string; value: string; medalKey?: string }
export type CareerTheme = { id: 'combat' | 'victory' | 'support' | 'movement'; title: string; rows: CareerThemeRow[]; note: string | null }

/** Traversée d'Erangel : la carte fait 8 km de côté. */
const ERANGEL_KM = 8

export function careerThemes(stats: LifetimeStats): CareerTheme[] {
  const games = gamesOf(stats)
  const headshotRate = stats.combat.kills > 0 ? Math.round((stats.combat.headshots / stats.combat.kills) * 100) : 0
  const itemsPerGame = games > 0 ? (stats.support.healed + stats.support.boostsUsed) / games : 0
  const crossings = Math.floor(stats.movement.walkedDistance / (ERANGEL_KM * 1000))
  return [
    {
      id: 'combat',
      title: 'Combat',
      rows: [
        { label: 'Kills', value: formatCount(stats.combat.kills), medalKey: 'combat.kills' },
        { label: 'Défaites', value: formatCount(stats.combat.deaths) },
        { label: 'Ratio K/D', value: formatRatio(stats.combat.kdRatio), medalKey: 'combat.kdRatio' },
        { label: 'Knocks', value: formatCount(stats.combat.knockouts), medalKey: 'combat.knockouts' },
        { label: 'Headshots', value: `${formatCount(stats.combat.headshots)} · ${headshotRate} %`, medalKey: 'combat.headshots' },
        { label: 'Assists', value: formatCount(stats.combat.assists), medalKey: 'combat.assists' },
        { label: 'Teamkills · suicides', value: `${formatCount(stats.combat.teamkills)} · ${formatCount(stats.combat.suicides)}` },
      ],
      note: null,
    },
    {
      id: 'victory',
      title: 'Victoire et survie',
      rows: [
        { label: 'Victoires', value: formatCount(stats.victory.wins), medalKey: 'victory.wins' },
        { label: 'Parties', value: formatCount(games) },
        { label: 'Win rate', value: `${oneDecimal.format(winRateOf(stats))} %`, medalKey: 'victory.winRate' },
        { label: 'Survie max', value: formatMinutes(stats.victory.longestTimeAlive), medalKey: 'victory.longestTimeAlive' },
      ],
      note: stats.victory.wins > 0 ? `Un chicken dinner toutes les ${formatCount(games / stats.victory.wins)} parties en moyenne.` : null,
    },
    {
      id: 'support',
      title: 'Soutien',
      rows: [
        { label: 'Réanimations', value: formatCount(stats.support.teammatesRevived), medalKey: 'support.teammatesRevived' },
        { label: 'Soins utilisés', value: formatCount(stats.support.healed), medalKey: 'support.healed' },
        { label: 'Boosts utilisés', value: formatCount(stats.support.boostsUsed), medalKey: 'support.boostsUsed' },
        { label: 'Armes ramassées', value: formatCount(stats.other.weaponsPicked), medalKey: 'other.weaponsPicked' },
      ],
      note: games > 0 ? `${oneDecimal.format(itemsPerGame)} soins et boosts par partie en moyenne.` : null,
    },
    {
      id: 'movement',
      title: 'Déplacements',
      rows: [
        { label: 'À pied', value: formatKm(stats.movement.walkedDistance), medalKey: 'movement.walkedDistance' },
        { label: 'En véhicule', value: formatKm(stats.movement.drivenDistance), medalKey: 'movement.drivenDistance' },
        { label: 'À la nage', value: formatKm(stats.movement.swamDistance), medalKey: 'movement.swamDistance' },
        { label: 'Roadkills', value: formatCount(stats.vehicle.roadkills), medalKey: 'vehicle.roadkills' },
      ],
      note: crossings > 0 ? `À pied, ça fait ${formatCount(crossings)} traversée${crossings > 1 ? 's' : ''} d’Erangel (${ERANGEL_KM} km).` : null,
    },
  ]
}

// ── Saisons et Ranked ────────────────────────────────────────────────────────────────────────────

export type SeasonRow = {
  seasonId: string
  rankedTier: string | null
  rankedSubTier: string | null
  rankedPoints: number
  rankedBestTier: string | null
  rankedBestSubTier: string | null
  rankedBestPoints: number
  rankedKills: number
  rankedWins: number
  rankedMatches: number
  normalKills: number
  normalDamage: number
  normalWins: number
  normalLosses: number
  normalMatches: number
  lastRefreshedAt: string
}

/** Paliers Ranked relevés en base (2026-09-27) : Cristal existe entre Platine et Diamant. */
export const RANKED_TIERS: ReadonlyArray<{ id: string; label: string; color: string }> = [
  { id: 'Bronze', label: 'Bronze', color: '#b45309' },
  { id: 'Silver', label: 'Argent', color: '#94a3b8' },
  { id: 'Gold', label: 'Or', color: '#eab308' },
  { id: 'Platinum', label: 'Platine', color: '#06b6d4' },
  { id: 'Crystal', label: 'Cristal', color: '#a78bfa' },
  { id: 'Diamond', label: 'Diamant', color: '#3b82f6' },
  { id: 'Master', label: 'Maître', color: '#d946ef' },
]

const tierIndex = (tier: string | null) => RANKED_TIERS.findIndex((entry) => entry.id === tier)

export function rankedTierLabel(tier: string | null, subTier: string | null) {
  if (!tier) return 'Non classé'
  const label = RANKED_TIERS[tierIndex(tier)]?.label ?? tier
  return subTier ? `${label} ${subTier}` : label
}

export const rankedTierColor = (tier: string | null) => RANKED_TIERS[tierIndex(tier)]?.color ?? '#64748b'

/**
 * Palier suivant : 100 points par division (4 → 1), 400 par palier, Bronze 4 à 1 000 points — relevé sur toutes les
 * lignes en base le 2026-09-27 (Or 4 dès 1 800, Cristal 4 dès 2 600). Au-delà de Diamant, rien n'est observé : pas de
 * cible affichée pour Diamant 1 ni Maître.
 */
export function nextRankStep(points: number, tier: string | null, subTier: string | null) {
  const index = tierIndex(tier)
  const division = Number(subTier)
  const diamond = tierIndex('Diamond')
  if (index < 0 || index > diamond || !Number.isInteger(division) || division < 1 || division > 4) return null
  if (index === diamond && division === 1) return null
  const start = 1000 + index * 400 + (4 - division) * 100
  const next = division > 1 ? { tier: RANKED_TIERS[index].id, subTier: String(division - 1) } : { tier: RANKED_TIERS[index + 1].id, subTier: '4' }
  return {
    label: rankedTierLabel(next.tier, next.subTier),
    missing: Math.max(0, Math.ceil(start + 100 - points)),
    progress: Math.min(100, Math.max(0, points - start)),
  }
}

/** `division.bro.official.pc-2018-43` → « Saison 43 ». */
export function seasonLabel(seasonId: string) {
  const number = seasonId.split('-').at(-1)
  return number && /^\d+$/.test(number) ? `Saison ${Number(number)}` : seasonId
}

/** Onglet par défaut de la carte Saisons : Ranked seulement si la saison en cours en a des parties. */
export function defaultSeasonTab(seasons: readonly Pick<SeasonRow, 'rankedMatches'>[]): 'ranked' | 'normal' {
  return (seasons[0]?.rankedMatches ?? 0) > 0 ? 'ranked' : 'normal'
}

export const normalKd = (season: Pick<SeasonRow, 'normalKills' | 'normalLosses'>) => season.normalKills / Math.max(1, season.normalLosses)

// ── Calendrier du tableau de bord ────────────────────────────────────────────────────────────────

export type CalendarDay = { date: string; games: number; wins: number }
export type CalendarCell = CalendarDay & { dayOfMonth: number; future: boolean; today: boolean; inPeriod: boolean; level: 0 | 1 | 2 | 3 | 4 }

const WEEKDAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']
const toUtc = (date: string) => new Date(`${date}T00:00:00Z`)
const addDays = (date: string, days: number) => {
  const value = toUtc(date)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}
/** Lundi = 0. */
const weekdayOf = (date: string) => (toUtc(date).getUTCDay() + 6) % 7

/** Les 35 journées de jeu affichées : 5 semaines du lundi au dimanche, la dernière est celle d'aujourd'hui. */
export function calendarWindow(today: string) {
  const monday = addDays(today, -weekdayOf(today))
  const start = addDays(monday, -28)
  return Array.from({ length: 35 }, (_, index) => addDays(start, index))
}

const levelOf = (games: number): CalendarCell['level'] => (games === 0 ? 0 : games <= 1 ? 1 : games <= 3 ? 2 : games <= 5 ? 3 : 4)

/** Créneau de deux heures le plus joué (heure de Paris), en passant minuit : « 21 h – 23 h ». */
export function favouriteSlot(hours: readonly number[]) {
  let best = -1
  let bestCount = 0
  for (let hour = 0; hour < 24; hour++) {
    const total = (hours[hour] ?? 0) + (hours[(hour + 1) % 24] ?? 0)
    if (total > bestCount) {
      best = hour
      bestCount = total
    }
  }
  return best < 0 ? null : `${best} h – ${(best + 2) % 24} h`
}

/**
 * Calendrier : une case par journée de jeu (`sessionDateOf`, 06:00 à 06:00 heure de Paris). Les jours hors de la période
 * du tableau de bord sont estompés (semaine et mois calendaires, comme `getPeriodRange`).
 */
export function buildCalendar(input: { today: string; days: readonly CalendarDay[]; hours: readonly number[]; period: 'week' | 'month' | 'all' }) {
  const byDate = new Map(input.days.map((day) => [day.date, day]))
  const monday = addDays(input.today, -weekdayOf(input.today))
  const periodStart = input.period === 'week' ? monday : input.period === 'month' ? `${input.today.slice(0, 8)}01` : ''
  const cells: CalendarCell[] = calendarWindow(input.today).map((date) => {
    const day = byDate.get(date)
    const games = day?.games ?? 0
    return {
      date,
      games,
      wins: day?.wins ?? 0,
      dayOfMonth: Number(date.slice(8, 10)),
      future: date > input.today,
      today: date === input.today,
      inPeriod: date >= periodStart && date <= input.today,
      level: levelOf(games),
    }
  })
  const past = cells.filter((cell) => !cell.future)
  const perWeekday = Array.from({ length: 7 }, (_, weekday) => past.filter((cell) => weekdayOf(cell.date) === weekday).reduce((sum, cell) => sum + cell.games, 0))
  const topWeekday = perWeekday.reduce((best, games, weekday) => (games > perWeekday[best] ? weekday : best), 0)
  return {
    cells,
    playedDays: past.filter((cell) => cell.games > 0).length,
    elapsedDays: past.length,
    favouriteDay: perWeekday[topWeekday] > 0 ? WEEKDAYS[topWeekday] : null,
    favouriteSlot: favouriteSlot(input.hours),
  }
}
