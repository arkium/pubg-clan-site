/**
 * Carrière PUBG du clan (`/clans/[clanId]/stats/career`, docs/features/statistiques.md) : les statistiques cumulées
 * depuis la création des comptes, lues dans l'API PUBG (`/seasons/lifetime`, table `MemberLifetimeStats`). Aucune
 * période : ces chiffres ne dépendent pas des matchs suivis par le site. Module pur, testé par `clan-career.test.ts`.
 */

export type CareerLifetimeStats = {
  combat: {
    kills: number
    deaths: number
    kdRatio: number
    headshots: number
    assists: number
    knockouts: number
    highestKillstreak: number
    longestKill: number
    teamkills: number
    suicides: number
  }
  victory: { wins: number; losses: number; winLossRatio: number; longestTimeAlive: number }
  support: { teammatesRevived: number; boostsUsed: number; healed: number }
  vehicle: { vehiclesDestroyed: number; roadkills: number }
  movement: { drivenDistance: number; walkedDistance: number; swamDistance: number }
  /** `timeSurvived`, `roundsPlayed`, `daysPlayed` : synchronisés depuis le 2026-09-27, absents des lignes plus anciennes. */
  other: { weaponsPicked: number; damageGiven: number; timeSurvived?: number; roundsPlayed?: number; daysPlayed?: number }
}

export type CareerMember = {
  memberId: number
  displayName: string
  lastRefreshedAt: string
  stats: CareerLifetimeStats
}

/** Ce que dit la valeur du clan : un total, une moyenne des joueurs ou un record. */
export type CareerAggregate = 'sum' | 'avg' | 'max'
/** `lower` : moins = mieux ; `shame` : classement du « Mur de la honte » (les plus nombreux d'abord). */
export type CareerOrder = 'higher' | 'lower' | 'shame'

export type CareerMetric = {
  key: string
  label: string
  aggregate: CareerAggregate
  order: CareerOrder
  /** `null` : donnée absente pour ce joueur (synchronisé avant l'ajout du champ). */
  value: (stats: CareerLifetimeStats) => number | null
  format: (value: number) => string
  /** Précision affichée sous la valeur (« au moins »). */
  note?: string
}

export type CareerGroupId = 'engagement' | 'combat' | 'victory' | 'support' | 'vehicle' | 'movement' | 'other'

export type CareerGroup = { id: CareerGroupId; title: string; metrics: CareerMetric[] }

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const twoDecimals = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const formatCount = (value: number) => integer.format(Math.round(value))
export const formatRatio = (value: number) => twoDecimals.format(value)
/** « 1 842 h » : un cumul de carrière se lit en heures, pas en « 1842h 12m 5s ». */
export const formatHours = (seconds: number) => `${integer.format(Math.round(seconds / 3600))} h`
/** « 31 min 40 » : une durée de partie. */
export const formatMinutes = (seconds: number) => {
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)} min ${String(total % 60).padStart(2, '0')}`
}
export const formatMeters = (meters: number) => `${integer.format(Math.round(meters))} m`
export const formatKilometers = (meters: number) => `${integer.format(Math.round(meters / 1000))} km`

const optional = (value: number | undefined) => (typeof value === 'number' && Number.isFinite(value) ? value : null)

export const CAREER_GROUPS: CareerGroup[] = [
  {
    id: 'engagement',
    title: 'Engagement',
    metrics: [
      { key: 'timeSurvived', label: 'Temps de jeu', aggregate: 'sum', order: 'higher', value: (s) => optional(s.other.timeSurvived), format: formatHours },
      { key: 'roundsPlayed', label: 'Parties jouées', aggregate: 'sum', order: 'higher', value: (s) => optional(s.other.roundsPlayed), format: formatCount },
      {
        key: 'daysPlayed',
        label: 'Jours de jeu',
        aggregate: 'sum',
        order: 'higher',
        value: (s) => optional(s.other.daysPlayed),
        format: (v) => `${formatCount(v)} j`,
        // PUBG compte les jours mode par mode : le plus grand des modes est un plancher (src/lib/pubg.ts).
        note: 'au moins',
      },
    ],
  },
  {
    id: 'combat',
    title: 'Combat',
    metrics: [
      { key: 'kills', label: 'Kills', aggregate: 'sum', order: 'higher', value: (s) => s.combat.kills, format: formatCount },
      { key: 'deaths', label: 'Morts', aggregate: 'sum', order: 'lower', value: (s) => s.combat.deaths, format: formatCount },
      { key: 'kdRatio', label: 'Ratio K/D', aggregate: 'avg', order: 'higher', value: (s) => s.combat.kdRatio, format: formatRatio },
      { key: 'headshots', label: 'Headshots', aggregate: 'sum', order: 'higher', value: (s) => s.combat.headshots, format: formatCount },
      { key: 'assists', label: 'Assistances', aggregate: 'sum', order: 'higher', value: (s) => s.combat.assists, format: formatCount },
      { key: 'knockouts', label: 'KO', aggregate: 'sum', order: 'higher', value: (s) => s.combat.knockouts, format: formatCount },
      { key: 'highestKillstreak', label: 'Série max', aggregate: 'max', order: 'higher', value: (s) => s.combat.highestKillstreak, format: (v) => `${formatCount(v)} kills` },
      { key: 'longestKill', label: 'Kill le plus lointain', aggregate: 'max', order: 'higher', value: (s) => s.combat.longestKill, format: formatMeters },
      { key: 'teamkills', label: 'Teamkills', aggregate: 'sum', order: 'shame', value: (s) => s.combat.teamkills, format: formatCount },
      { key: 'suicides', label: 'Suicides', aggregate: 'sum', order: 'lower', value: (s) => s.combat.suicides, format: formatCount },
    ],
  },
  {
    id: 'victory',
    title: 'Victoires',
    metrics: [
      { key: 'wins', label: 'Victoires', aggregate: 'sum', order: 'higher', value: (s) => s.victory.wins, format: formatCount },
      { key: 'losses', label: 'Défaites', aggregate: 'sum', order: 'lower', value: (s) => s.victory.losses, format: formatCount },
      { key: 'winLossRatio', label: 'Ratio V/D', aggregate: 'avg', order: 'higher', value: (s) => s.victory.winLossRatio, format: formatRatio },
      { key: 'longestTimeAlive', label: 'Plus longue survie', aggregate: 'max', order: 'higher', value: (s) => s.victory.longestTimeAlive, format: formatMinutes },
    ],
  },
  {
    id: 'support',
    title: 'Support',
    metrics: [
      { key: 'teammatesRevived', label: 'Coéquipiers relevés', aggregate: 'sum', order: 'higher', value: (s) => s.support.teammatesRevived, format: formatCount },
      { key: 'boostsUsed', label: 'Boosts utilisés', aggregate: 'sum', order: 'higher', value: (s) => s.support.boostsUsed, format: formatCount },
      // `heals` de l'API compte des objets de soin utilisés, pas des points de vie.
      { key: 'healed', label: 'Soins utilisés', aggregate: 'sum', order: 'higher', value: (s) => s.support.healed, format: formatCount },
    ],
  },
  {
    id: 'vehicle',
    title: 'Véhicules',
    metrics: [
      { key: 'vehiclesDestroyed', label: 'Véhicules détruits', aggregate: 'sum', order: 'higher', value: (s) => s.vehicle.vehiclesDestroyed, format: formatCount },
      { key: 'roadkills', label: 'Roadkills', aggregate: 'sum', order: 'higher', value: (s) => s.vehicle.roadkills, format: formatCount },
    ],
  },
  {
    id: 'movement',
    title: 'Déplacements',
    metrics: [
      { key: 'drivenDistance', label: 'En véhicule', aggregate: 'sum', order: 'higher', value: (s) => s.movement.drivenDistance, format: formatKilometers },
      { key: 'walkedDistance', label: 'À pied', aggregate: 'sum', order: 'higher', value: (s) => s.movement.walkedDistance, format: formatKilometers },
      { key: 'swamDistance', label: 'À la nage', aggregate: 'sum', order: 'higher', value: (s) => s.movement.swamDistance, format: formatKilometers },
    ],
  },
  {
    id: 'other',
    title: 'Autres',
    metrics: [
      { key: 'weaponsPicked', label: 'Armes ramassées', aggregate: 'sum', order: 'higher', value: (s) => s.other.weaponsPicked, format: formatCount },
      { key: 'damageGiven', label: 'Dégâts infligés', aggregate: 'sum', order: 'higher', value: (s) => s.other.damageGiven, format: formatCount },
    ],
  },
]

/** Étiquette d'une carte : ce que compte la valeur, ou comment lire le classement. */
export function careerMetricTag(metric: CareerMetric) {
  if (metric.order === 'shame') return 'Mur de la honte'
  if (metric.order === 'lower') return 'Moins = mieux'
  return metric.aggregate === 'sum' ? 'Total' : metric.aggregate === 'avg' ? 'Moyenne' : 'Record'
}

export type CareerMetricResult = {
  metric: CareerMetric
  tag: string
  /** `null` : aucun joueur n'a encore la donnée (champ synchronisé récemment). */
  value: number | null
  top: Array<{ memberId: number; displayName: string; value: number }>
  /** Joueurs sans la donnée : synchronisés avant l'ajout du champ. */
  missing: number
}

export function computeCareerMetric(metric: CareerMetric, members: CareerMember[]): CareerMetricResult {
  const known = members
    .map((member) => ({ memberId: member.memberId, displayName: member.displayName, value: metric.value(member.stats) }))
    .filter((entry): entry is { memberId: number; displayName: string; value: number } => entry.value !== null)
  const values = known.map((entry) => entry.value)
  const value =
    values.length === 0
      ? null
      : metric.aggregate === 'sum'
        ? values.reduce((sum, v) => sum + v, 0)
        : metric.aggregate === 'avg'
          ? values.reduce((sum, v) => sum + v, 0) / values.length
          : Math.max(...values)
  const ascending = metric.order === 'lower'
  const top = [...known]
    .sort((a, b) => (ascending ? a.value - b.value : b.value - a.value) || a.displayName.localeCompare(b.displayName, 'fr'))
    .slice(0, 3)
  return { metric, tag: careerMetricTag(metric), value, top, missing: members.length - known.length }
}

export function computeCareerGroups(members: CareerMember[]) {
  return CAREER_GROUPS.map((group) => ({
    ...group,
    results: group.metrics.map((metric) => computeCareerMetric(metric, members)),
  }))
}

const sum = (members: CareerMember[], pick: (stats: CareerLifetimeStats) => number | null) =>
  members.reduce((total, member) => total + (pick(member.stats) ?? 0), 0)

/** Les quatre totaux du haut de page. */
export function careerHeadline(members: CareerMember[]) {
  const withTime = members.filter((member) => optional(member.stats.other.timeSurvived) !== null)
  const timeSurvived = sum(withTime, (s) => optional(s.other.timeSurvived))
  const kdValues = members.map((member) => member.stats.combat.kdRatio)
  const kdAverage = kdValues.length > 0 ? kdValues.reduce((a, b) => a + b, 0) / kdValues.length : 0
  const distance = sum(members, (s) => s.movement.drivenDistance + s.movement.walkedDistance + s.movement.swamDistance)
  return [
    {
      id: 'time',
      label: 'Temps de jeu',
      value: withTime.length > 0 ? formatHours(timeSurvived) : '–',
      detail:
        withTime.length === 0
          ? 'Disponible après la prochaine synchro PUBG'
          : withTime.length < members.length
            ? `${withTime.length} joueur${withTime.length > 1 ? 's' : ''} sur ${members.length} synchronisé${withTime.length > 1 ? 's' : ''}`
            : `soit ${formatCount(timeSurvived / 86400)} jours en partie`,
    },
    { id: 'kills', label: 'Kills', value: formatCount(sum(members, (s) => s.combat.kills)), detail: `K/D moyen ${formatRatio(kdAverage)}` },
    { id: 'wins', label: 'Victoires', value: formatCount(sum(members, (s) => s.victory.wins)), detail: 'chicken dinners' },
    { id: 'distance', label: 'Distance parcourue', value: formatKilometers(distance), detail: 'à pied, en véhicule et à la nage' },
  ]
}

/** Bandeau : dernière mise à jour (la plus récente des joueurs) et la plus ancienne, pour signaler un retard. */
export function careerRefresh(members: CareerMember[]) {
  const times = members.map((member) => new Date(member.lastRefreshedAt).getTime()).filter(Number.isFinite)
  if (times.length === 0) return null
  return { latest: new Date(Math.max(...times)).toISOString(), oldest: new Date(Math.min(...times)).toISOString() }
}
