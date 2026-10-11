/**
 * Statistiques d'un tournoi au-delà du classement (demande du 2026-10-11, après le tournoi [FR] du 10/10) : moyenne par
 * player de chaque clan, top killers et top scorers, awards et fun facts, armes. docs/features/tournois.md, « Statistiques
 * du tournoi ».
 *
 * Module pur : la route charge les lignes (`tournament-stats-service.ts`) et fournit les libellés ; tout le calcul est
 * ici, testé par `tournament-stats.test.ts`. Aucun import de valeur depuis un module Prisma.
 */
import type { TournamentModeStanding, TournamentParticipant } from '@/lib/tournament-service'
import { findWeaponEntry, getWeaponCategory, type WeaponCategory } from '@/lib/weapons/weapon-categories'

type PlayerStanding = Pick<TournamentModeStanding, 'key' | 'participant' | 'totalPoints' | 'totalKills' | 'totalDamage'> & {
  rank: number
  label: string
}

const byLabel = (left: { label: string }, right: { label: string }) => left.label.localeCompare(right.label, 'fr')

// ── Moyenne par clan ────────────────────────────────────────────────────────────────────────────────

export type TournamentClanAverage = {
  key: string
  participant: Extract<TournamentParticipant, { kind: 'clan' }>
  label: string
  rank: number
  /** Players du clan classés au détail par player (au moins une manche jouée). */
  players: number
  /** Somme de leurs points au détail par player. */
  points: number
  kills: number
  /** `points / players` : le classement de l'onglet. */
  average: number
}

/**
 * Moyenne par player de chaque clan (inter-clans, demande du 2026-10-11) : la somme des points de ses players au détail
 * par player, divisée par leur nombre — la formule du tableur des organisateurs. Le cumul par clan avantage les clans
 * venus à plusieurs squads ; la moyenne les remet à égalité. Tous les clans sont classés, même à un seul player
 * (décision du 2026-10-11) : le nombre de players est affiché à côté.
 */
export function buildClanAverages(
  players: ReadonlyArray<Pick<TournamentModeStanding, 'participant' | 'totalPoints' | 'totalKills'>>,
  clanLabel: (clanId: number) => string
): TournamentClanAverage[] {
  const totals = new Map<number, { players: number; points: number; kills: number }>()
  for (const player of players) {
    if (player.participant.kind !== 'player' || player.participant.clanId === null) continue
    const current = totals.get(player.participant.clanId) ?? { players: 0, points: 0, kills: 0 }
    current.players += 1
    current.points += player.totalPoints
    current.kills += player.totalKills
    totals.set(player.participant.clanId, current)
  }

  return [...totals.entries()]
    .map(([clanId, total]) => ({
      key: `clan:${clanId}`,
      participant: { kind: 'clan' as const, clanId },
      label: clanLabel(clanId),
      players: total.players,
      points: total.points,
      kills: total.kills,
      average: total.points / total.players,
    }))
    .sort((left, right) => right.average - left.average || right.points - left.points || byLabel(left, right))
    .map((entry, index) => ({ ...entry, rank: index + 1 }))
}

// ── Top killers et top scorers ──────────────────────────────────────────────────────────────────────

export type TournamentLeader = {
  key: string
  memberId: number
  label: string
  rank: number
  kills: number
  damage: number
  points: number | null
}

export type TournamentLeaders = { killers: TournamentLeader[]; scorers: TournamentLeader[] }

type KillRow = { memberId: number; kills: number; damage?: number | null }

/**
 * Deux classements individuels sous le podium (demande du 2026-10-11) : les kills et les points de chaque player.
 *
 * - **Top killers** : toutes les manches, le plus de kills départagé par les dégâts — la règle du MVP, qui en est donc
 *   le premier (`pickMvp`).
 * - **Top scorers** : le détail par player (place de sa squad, ses kills, bonus d'un Top 1), dans son ordre.
 *
 * Seuls comptent les players du détail par player (`players`) : en scrims internes, les membres du clan organisateur.
 */
export function buildTournamentLeaders(
  matches: ReadonlyArray<{ members: ReadonlyArray<KillRow> }>,
  players: ReadonlyArray<PlayerStanding>,
  memberLabel: (memberId: number) => string
): TournamentLeaders {
  const pointsByMember = new Map<number, number>()
  for (const player of players) {
    if (player.participant.kind === 'player') pointsByMember.set(player.participant.memberId, player.totalPoints)
  }

  const totals = new Map<number, { kills: number; damage: number }>()
  for (const match of matches) {
    for (const row of match.members) {
      if (!pointsByMember.has(row.memberId)) continue
      const current = totals.get(row.memberId) ?? { kills: 0, damage: 0 }
      current.kills += row.kills
      current.damage += row.damage ?? 0
      totals.set(row.memberId, current)
    }
  }

  const killers = [...totals.entries()]
    .map(([memberId, total]) => ({
      key: `player:${memberId}`,
      memberId,
      label: memberLabel(memberId),
      kills: total.kills,
      damage: Math.round(total.damage),
      points: pointsByMember.get(memberId) ?? null,
    }))
    .sort((left, right) => right.kills - left.kills || right.damage - left.damage || byLabel(left, right))
    .map((entry, index) => ({ ...entry, rank: index + 1 }))

  const scorers = players
    .filter((player): player is PlayerStanding & { participant: { kind: 'player'; memberId: number } } => player.participant.kind === 'player')
    .map((player) => ({
      key: player.key,
      memberId: player.participant.memberId,
      label: player.label,
      rank: player.rank,
      kills: player.totalKills,
      damage: Math.round(player.totalDamage),
      points: player.totalPoints,
    }))

  return { killers, scorers }
}

// ── Awards et fun facts ─────────────────────────────────────────────────────────────────────────────

/** Une ligne `SquadMember` d'une manche : les compteurs du résumé PUBG (sans télémétrie). */
export type TournamentRoundStatRow = {
  round: number
  memberId: number
  kills: number
  damage: number
  assists: number
  revives: number
  knockouts: number
  headshotKills: number
  timeSurvived: number
  rideDistance: number
  walkDistance: number
  swimDistance: number
  boosts: number
  heals: number
  vehicleDestroys: number
  roadKills: number
  longestKill: number
  weaponsAcquired: number
}

export type TournamentTelemetryWeapon = { weaponName: string; kills: number; headshots: number; damageDealt: number }

export type TournamentTelemetryMember = {
  memberId: number
  damageTaken: number
  /** Secondes passées hors de la zone sûre. */
  circleDelaySeconds: number
  weapons: TournamentTelemetryWeapon[]
}

/** Télémétrie d'une manche, réduite aux players du classement (comptes PUBG déjà résolus en membres). */
export type TournamentTelemetryRound = {
  round: number
  members: TournamentTelemetryMember[]
  /** Premier kill de la manche, tout le lobby confondu : un tueur ou une victime hors classement vaut `null`. */
  firstKill: { killerId: number | null; victimId: number | null } | null
}

export type TournamentStatFormat = 'count' | 'damage' | 'distance' | 'duration'

export type TournamentAwardKey =
  | 'best_round'
  | 'first_blood'
  | 'top_damage'
  | 'knockouts'
  | 'headshots'
  | 'sniper'
  | 'revives'
  | 'assists'
  | 'damage_taken'
  | 'survivor'
  | 'jacky_tuning'
  | 'rodeur'
  | 'swimmer'
  | 'boosts'
  | 'heals'
  | 'blue_zone'
  | 'destructeur'
  | 'road_kills'
  | 'collector'
  | 'first_out'

export type TournamentAwardWinner = {
  memberId: number
  label: string
  value: number
  /**
   * Manche du record : celle d'un award « meilleure manche » (kill le plus long, plus gros carton), ou du seul premier
   * sang (premier éliminé) d'un joueur.
   */
  round: number | null
}

export type TournamentAward = {
  key: TournamentAwardKey
  label: string
  description: string
  /** Unité affichée après un nombre (`count`) : « kills », « fois »… */
  unit: string
  format: TournamentStatFormat
  winners: TournamentAwardWinner[]
}

export type TournamentFact = {
  key: 'kills' | 'bloodiest_round' | 'damage' | 'vehicle_distance'
  label: string
  value: number
  format: TournamentStatFormat
  unit: string
  detail: string | null
}

export type TournamentAwardsView = {
  facts: TournamentFact[]
  awards: TournamentAward[]
  /** Manches dont la télémétrie a été lue : sans elle, les awards de télémétrie manquent (« 4 / 5 manches »). */
  telemetryRounds: number
  rounds: number
}

type MatchAward = {
  key: TournamentAwardKey
  label: string
  description: string
  unit: string
  format: TournamentStatFormat
  /** `sum` : total du tournoi ; `max` : meilleure manche, dont le numéro est gardé. */
  aggregate: 'sum' | 'max'
} & (
  | { source: 'match'; read: (row: TournamentRoundStatRow) => number }
  | { source: 'telemetry'; read: (row: TournamentTelemetryMember) => number }
  | { source: 'first_kill'; read: (firstKill: NonNullable<TournamentTelemetryRound['firstKill']>) => number | null }
)

/**
 * Awards du tournoi, dans l'ordre d'affichage. Les kills ont leur propre colonne (top killers) : pas d'award « plus de
 * kills ». Pas d'award des tirs alliés : en inter-clans, il désignerait publiquement un joueur d'un autre clan. Pas de
 * pointe de vitesse : `maxVehicleSpeedKph` compte l'avion (médiane de 1 067 km/h au tournoi du 2026-10-10).
 */
export const TOURNAMENT_AWARDS: readonly MatchAward[] = [
  { key: 'best_round', label: 'Le carton', description: 'Plus de kills en une seule manche', unit: 'kills', format: 'count', aggregate: 'max', source: 'match', read: (row) => row.kills },
  { key: 'first_blood', label: 'Premier sang', description: 'Premier kill d’une manche', unit: 'fois', format: 'count', aggregate: 'sum', source: 'first_kill', read: (kill) => kill.killerId },
  { key: 'top_damage', label: 'La brute', description: 'Plus de dégâts infligés', unit: 'dégâts', format: 'damage', aggregate: 'sum', source: 'match', read: (row) => row.damage },
  { key: 'knockouts', label: 'Le bûcheron', description: 'Plus d’ennemis mis au sol', unit: 'knocks', format: 'count', aggregate: 'sum', source: 'match', read: (row) => row.knockouts },
  { key: 'headshots', label: 'Tête chercheuse', description: 'Plus de kills à la tête', unit: 'headshots', format: 'count', aggregate: 'sum', source: 'match', read: (row) => row.headshotKills },
  { key: 'sniper', label: 'Le sniper', description: 'Kill le plus long du tournoi', unit: 'm', format: 'distance', aggregate: 'max', source: 'match', read: (row) => row.longestKill },
  { key: 'revives', label: 'L’ange gardien', description: 'Plus de coéquipiers relevés', unit: 'réanimations', format: 'count', aggregate: 'sum', source: 'match', read: (row) => row.revives },
  { key: 'assists', label: 'Le passeur', description: 'Plus d’assistances', unit: 'assistances', format: 'count', aggregate: 'sum', source: 'match', read: (row) => row.assists },
  { key: 'damage_taken', label: 'Le sac de frappe', description: 'Plus de dégâts encaissés', unit: 'dégâts', format: 'damage', aggregate: 'sum', source: 'telemetry', read: (row) => row.damageTaken },
  { key: 'survivor', label: 'Le brouteur d’herbe', description: 'Plus long temps de survie cumulé', unit: '', format: 'duration', aggregate: 'sum', source: 'match', read: (row) => row.timeSurvived },
  { key: 'jacky_tuning', label: 'JACKY TUNING', description: 'Plus de distance en véhicule', unit: 'm', format: 'distance', aggregate: 'sum', source: 'match', read: (row) => row.rideDistance },
  { key: 'rodeur', label: 'Le rôdeur', description: 'Plus de distance à pied', unit: 'm', format: 'distance', aggregate: 'sum', source: 'match', read: (row) => row.walkDistance },
  { key: 'swimmer', label: 'Le maître nageur', description: 'Plus de distance à la nage', unit: 'm', format: 'distance', aggregate: 'sum', source: 'match', read: (row) => row.swimDistance },
  { key: 'boosts', label: 'L’alcoolique du dimanche', description: 'Plus de boosts consommés', unit: 'boosts', format: 'count', aggregate: 'sum', source: 'match', read: (row) => row.boosts },
  { key: 'heals', label: 'Le fou de l’hôpital', description: 'Plus de soins utilisés', unit: 'soins', format: 'count', aggregate: 'sum', source: 'match', read: (row) => row.heals },
  { key: 'blue_zone', label: 'Le touriste de la zone bleue', description: 'Plus de temps passé hors de la zone', unit: '', format: 'duration', aggregate: 'sum', source: 'telemetry', read: (row) => row.circleDelaySeconds },
  { key: 'destructeur', label: 'Le destructeur', description: 'Plus de véhicules détruits', unit: 'véhicules', format: 'count', aggregate: 'sum', source: 'match', read: (row) => row.vehicleDestroys },
  { key: 'road_kills', label: 'La brute de métal', description: 'Plus de kills depuis un véhicule', unit: 'kills', format: 'count', aggregate: 'sum', source: 'match', read: (row) => row.roadKills },
  { key: 'collector', label: 'Le collectionneur', description: 'Plus d’armes ramassées', unit: 'armes', format: 'count', aggregate: 'sum', source: 'match', read: (row) => row.weaponsAcquired },
  { key: 'first_out', label: 'Pas de chance', description: 'Premier éliminé d’une manche', unit: 'fois', format: 'count', aggregate: 'sum', source: 'first_kill', read: (kill) => kill.victimId },
]

const AWARD_PODIUM = 3

/**
 * Un candidat par joueur : son total (`sum`) ou sa meilleure manche (`max`, avec le numéro de manche). `keepSingleRound` :
 * un total fait d'une seule manche garde son numéro (« Premier sang · M3 »).
 */
function collect(
  aggregate: 'sum' | 'max',
  samples: Iterable<{ memberId: number; value: number; round: number }>,
  keepSingleRound = false
): Map<number, { value: number; round: number | null }> {
  const byMember = new Map<number, { value: number; round: number | null }>()
  for (const sample of samples) {
    if (!Number.isFinite(sample.value) || sample.value <= 0) continue
    const current = byMember.get(sample.memberId)
    if (aggregate === 'sum') {
      byMember.set(sample.memberId, {
        value: (current?.value ?? 0) + sample.value,
        round: keepSingleRound && !current ? sample.round : null,
      })
    } else if (!current || sample.value > current.value) {
      byMember.set(sample.memberId, { value: sample.value, round: sample.round })
    }
  }
  return byMember
}

function* samplesOf(award: MatchAward, rows: readonly TournamentRoundStatRow[], telemetry: readonly TournamentTelemetryRound[]) {
  if (award.source === 'match') {
    for (const row of rows) yield { memberId: row.memberId, value: award.read(row), round: row.round }
  } else if (award.source === 'telemetry') {
    for (const round of telemetry) for (const member of round.members) yield { memberId: member.memberId, value: award.read(member), round: round.round }
  } else {
    for (const round of telemetry) {
      const memberId = round.firstKill ? award.read(round.firstKill) : null
      if (memberId !== null) yield { memberId, value: 1, round: round.round }
    }
  }
}

/**
 * Awards et fun facts d'un tournoi (demande du 2026-10-11), sur le modèle des awards d'un clan (`awards-service.ts`)
 * mais limités aux manches du tournoi et à ses players. Un award sans valeur positive n'apparaît pas ; un award de
 * télémétrie ne compte que les manches analysées. À égalité, le premier dans l'ordre alphabétique.
 */
export function computeTournamentAwards({
  rows,
  telemetry,
  rounds,
  memberLabel,
}: {
  rows: readonly TournamentRoundStatRow[]
  telemetry: readonly TournamentTelemetryRound[]
  rounds: number
  memberLabel: (memberId: number) => string
}): TournamentAwardsView {
  const awards: TournamentAward[] = []
  for (const award of TOURNAMENT_AWARDS) {
    const winners = [...collect(award.aggregate, samplesOf(award, rows, telemetry), award.source === 'first_kill').entries()]
      .map(([memberId, entry]) => ({ memberId, label: memberLabel(memberId), value: entry.value, round: entry.round }))
      .sort((left, right) => right.value - left.value || (left.round ?? 0) - (right.round ?? 0) || byLabel(left, right))
      .slice(0, AWARD_PODIUM)
    if (winners.length === 0) continue
    awards.push({ key: award.key, label: award.label, description: award.description, unit: award.unit, format: award.format, winners })
  }

  return { facts: computeTournamentFacts(rows), awards, telemetryRounds: telemetry.length, rounds }
}

/** Fun facts : les chiffres du tournoi entier, players du classement confondus. */
export function computeTournamentFacts(rows: readonly TournamentRoundStatRow[]): TournamentFact[] {
  if (rows.length === 0) return []
  const killsByRound = new Map<number, number>()
  let kills = 0
  let headshots = 0
  let damage = 0
  let rideDistance = 0
  for (const row of rows) {
    kills += row.kills
    headshots += row.headshotKills
    damage += row.damage
    rideDistance += row.rideDistance
    killsByRound.set(row.round, (killsByRound.get(row.round) ?? 0) + row.kills)
  }
  // La plus sanglante ; à égalité, la première jouée.
  const [bloodiestRound, bloodiestKills] = [...killsByRound.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]

  return [
    { key: 'kills', label: 'Kills au total', value: kills, format: 'count', unit: 'kills', detail: headshots > 0 ? `dont ${headshots} à la tête` : null },
    { key: 'bloodiest_round', label: 'Manche la plus sanglante', value: bloodiestKills, format: 'count', unit: 'kills', detail: `Manche ${bloodiestRound}` },
    { key: 'damage', label: 'Dégâts infligés', value: Math.round(damage), format: 'damage', unit: 'dégâts', detail: null },
    { key: 'vehicle_distance', label: 'Parcourus en véhicule', value: Math.round(rideDistance), format: 'distance', unit: 'm', detail: null },
  ]
}

// ── Armes ───────────────────────────────────────────────────────────────────────────────────────────

export type TournamentWeaponShooter = { memberId: number; label: string; kills: number; damage: number }

export type TournamentWeapon = {
  /** Clé du catalogue (`weapon-categories.ts`), sinon l'identifiant télémétrie. */
  id: string
  name: string
  /** Identifiant télémétrie qui porte l'icône. */
  iconId: string
  category: WeaponCategory
  kills: number
  headshots: number
  damage: number
  shooters: TournamentWeaponShooter[]
}

export const TOURNAMENT_WEAPON_LIMIT = 8
const WEAPON_SHOOTERS = 3

/**
 * Les armes les plus meurtrières du tournoi et leurs trois meilleurs tireurs (demande du 2026-10-11) : kills des players
 * du classement, départagés par les dégâts. Variantes regroupées par le catalogue (`findWeaponEntry` : skins, projectile
 * lancé, champ de feu) ; ce qui n'est pas une arme (véhicule, zone, chute — catégorie « Autre ») n'est pas classé.
 */
export function computeTournamentWeapons(
  telemetry: readonly TournamentTelemetryRound[],
  memberLabel: (memberId: number) => string,
  weaponLabel: (telemetryId: string) => string,
  limit = TOURNAMENT_WEAPON_LIMIT
): TournamentWeapon[] {
  type Acc = Omit<TournamentWeapon, 'shooters'> & { byMember: Map<number, { kills: number; damage: number }> }
  const weapons = new Map<string, Acc>()

  for (const round of telemetry) {
    for (const member of round.members) {
      for (const weapon of member.weapons) {
        const entry = findWeaponEntry(weapon.weaponName)
        const category = entry?.category ?? getWeaponCategory(weapon.weaponName)
        if (category === 'OTHER') continue
        const id = entry?.key ?? weapon.weaponName
        let acc = weapons.get(id)
        if (!acc) {
          const iconId = entry?.telemetryIds[0] ?? weapon.weaponName
          acc = { id, name: entry?.label ?? weaponLabel(iconId), iconId, category, kills: 0, headshots: 0, damage: 0, byMember: new Map() }
          weapons.set(id, acc)
        }
        acc.kills += weapon.kills
        acc.headshots += weapon.headshots
        acc.damage += weapon.damageDealt
        const shooter = acc.byMember.get(member.memberId) ?? { kills: 0, damage: 0 }
        shooter.kills += weapon.kills
        shooter.damage += weapon.damageDealt
        acc.byMember.set(member.memberId, shooter)
      }
    }
  }

  return [...weapons.values()]
    .filter((weapon) => weapon.kills > 0)
    .sort((left, right) => right.kills - left.kills || right.damage - left.damage || left.name.localeCompare(right.name, 'fr'))
    .slice(0, limit)
    .map(({ byMember, ...weapon }) => ({
      ...weapon,
      damage: Math.round(weapon.damage),
      shooters: [...byMember.entries()]
        .filter(([, shooter]) => shooter.kills > 0)
        .map(([memberId, shooter]) => ({ memberId, label: memberLabel(memberId), kills: shooter.kills, damage: Math.round(shooter.damage) }))
        .sort((left, right) => right.kills - left.kills || right.damage - left.damage || byLabel(left, right))
        .slice(0, WEAPON_SHOOTERS),
    }))
}
