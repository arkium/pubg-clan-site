/**
 * Style de jeu du clan (`/clans/[clanId]/stats`, docs/features/statistiques.md) : tout ce qui se mesure dans la
 * télémétrie des matchs de la **période** — profil de jeu, objets consommés, synergies, coopération. Module pur, testé
 * par `clan-playstyle.test.ts` ; la page ne fait que l'afficher.
 */

/** Une ligne de `/api/clans/[clanId]/telemetry/playstyle` : moyennes d'un membre sur la période. */
export type ClanPlaystyleRow = {
  memberId: number
  displayName: string
  aggressionScore: number
  supportScore: number
  zoneDisciplineScore: number
  avgBlueZoneHits: number
  avgFirstContactPhase: number
  avgCircleDelaySeconds: number
  avgCircleDelayPercent: number
  avgSafeZonePresencePercent: number
  avgOnFootDistanceMeters: number
  avgVehicleDistanceMeters: number
  avgDamageTaken: number
  avgHealsUsed: number
  avgHealAmount: number
  avgBoostsUsed: number
  maxVehicleSpeedKph: number
  avgPositionEvents: number
  matchesPlayed: number
}

const oneDecimal = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })

export const formatDecimal = (value: number) => oneDecimal.format(value)
export const formatInteger = (value: number) => integer.format(Math.round(value))
export const formatPercent = (value: number) => `${integer.format(Math.round(value))} %`
/** Les distances et vitesses de télémétrie sont stockées ×10 (unités du moteur) : ramenées en km et km/h. */
export const telemetryKilometers = (value: number) => Math.max(0, value) / 10 / 1000
export const telemetryKph = (value: number) => Math.max(0, value) / 10

const average = (rows: ClanPlaystyleRow[], pick: (row: ClanPlaystyleRow) => number) =>
  rows.length > 0 ? rows.reduce((sum, row) => sum + pick(row), 0) / rows.length : 0

// ── Profil de jeu : trois rôles ─────────────────────────────────────────────────────────────────────

export type PlaystyleRoleId = 'fragger' | 'medic' | 'ghost'

export const PLAYSTYLE_ROLES: Array<{
  id: PlaystyleRoleId
  role: string
  metric: string
  hint: string
  score: (row: ClanPlaystyleRow) => number
}> = [
  { id: 'fragger', role: 'Fragger', metric: 'Agressivité', hint: 'kills, KO et dégâts', score: (row) => row.aggressionScore },
  { id: 'medic', role: 'Medic', metric: 'Support', hint: 'réanimations ; 0 % = aucune', score: (row) => row.supportScore },
  { id: 'ghost', role: 'Ghost', metric: 'Discipline zone', hint: '100 % = jamais touché par la zone bleue', score: (row) => row.zoneDisciplineScore },
]

/** Moyenne du clan pour chaque rôle, et les trois joueurs qui l'incarnent le mieux (score strictement positif). */
export function playstyleRoles(rows: ClanPlaystyleRow[]) {
  return PLAYSTYLE_ROLES.map((role) => ({
    ...role,
    average: average(rows, role.score),
    top: [...rows]
      .filter((row) => role.score(row) > 0)
      .sort((a, b) => role.score(b) - role.score(a) || a.displayName.localeCompare(b.displayName, 'fr'))
      .slice(0, 3)
      .map((row) => ({ memberId: row.memberId, displayName: row.displayName, score: role.score(row) })),
  }))
}

// ── Profil de jeu : trois thèmes ────────────────────────────────────────────────────────────────────

export function playstyleThemes(rows: ClanPlaystyleRow[]) {
  const foot = telemetryKilometers(average(rows, (row) => row.avgOnFootDistanceMeters))
  const vehicle = telemetryKilometers(average(rows, (row) => row.avgVehicleDistanceMeters))
  const distance = foot + vehicle
  const footShare = distance > 0 ? (foot / distance) * 100 : 0
  const safe = Math.min(100, average(rows, (row) => row.avgSafeZonePresencePercent))
  const outside = Math.min(100 - safe, Math.max(0, average(rows, (row) => row.avgCircleDelayPercent)))
  // Le retard sur le cercle n'est mesuré que sur les matchs récents : sans aucune mesure, « – » plutôt que 0 s.
  const delayMeasured = rows.some((row) => row.avgCircleDelaySeconds > 0 || row.avgCircleDelayPercent > 0)
  const healed = average(rows, (row) => row.avgHealAmount)
  const damageTaken = average(rows, (row) => row.avgDamageTaken)
  return {
    mobility: {
      distance,
      foot,
      vehicle,
      footShare,
      vehicleShare: distance > 0 ? 100 - footShare : 0,
      maxSpeed: telemetryKph(average(rows, (row) => row.maxVehicleSpeedKph)),
    },
    circle: {
      safe,
      outside: delayMeasured ? outside : null,
      blueZoneHits: average(rows, (row) => row.avgBlueZoneHits),
      firstContactPhase: average(rows, (row) => row.avgFirstContactPhase),
      delaySeconds: delayMeasured ? average(rows, (row) => row.avgCircleDelaySeconds) : null,
    },
    survival: {
      healed,
      damageTaken,
      coverage: damageTaken > 0 ? Math.min(100, (healed / damageTaken) * 100) : 0,
      heals: average(rows, (row) => row.avgHealsUsed),
      boosts: average(rows, (row) => row.avgBoostsUsed),
    },
    positionsPerMatch: average(rows, (row) => row.avgPositionEvents),
  }
}

/** Ligne de contexte du bandeau : « 8 joueurs · 3,4 bots / match · 212 positions / match ». */
export function playstyleContext(rows: ClanPlaystyleRow[], botsPerMatch: number | null) {
  const parts = [`${rows.length} joueur${rows.length > 1 ? 's' : ''}`]
  if (botsPerMatch !== null) parts.push(`${formatDecimal(botsPerMatch)} bots / match`)
  if (rows.length > 0) parts.push(`${formatInteger(average(rows, (row) => row.avgPositionEvents))} positions / match`)
  return parts.join(' · ')
}

// ── Objets consommés ────────────────────────────────────────────────────────────────────────────────

export const ITEM_FAMILY_LABELS: Record<string, string> = {
  Heal: 'Soins',
  Boost: 'Boosts',
  Fuel: 'Carburant',
  Gadget: 'Gadgets',
  Unknown: 'Non classés',
}

/** Couleurs de la charte (jetons `--game-*`, dans `.game-ui`) : soins positif, boosts orange, carburant ciel, gadgets violet. */
export const ITEM_FAMILY_COLORS: Record<string, string> = {
  Heal: 'var(--game-pos)',
  Boost: 'var(--game-warn)',
  Fuel: 'var(--game-sky)',
  Gadget: 'var(--game-violet)',
  Unknown: 'var(--theme-ui-text-muted)',
}

export const itemFamilyLabel = (subCategory: string) => ITEM_FAMILY_LABELS[subCategory] ?? subCategory
export const itemFamilyColor = (subCategory: string) => ITEM_FAMILY_COLORS[subCategory] ?? 'var(--theme-ui-text-muted)'

/** Noms français des objets du jeu ; le dictionnaire PUBG (anglais) sert de repli. */
const ITEM_LABELS: Record<string, string> = {
  Item_Heal_Bandage_C: 'Bandage',
  Item_Heal_FirstAid_C: 'Trousse de soins',
  Item_Heal_MedKit_C: 'Kit médical',
  Item_Boost_EnergyDrink_C: 'Boisson énergisante',
  Item_Boost_PainKiller_C: 'Analgésique',
  Item_Boost_AdrenalineSyringe_C: 'Seringue d’adrénaline',
  Item_JerryCan_C: 'Jerrican',
  // La télémétrie écrit « Mountainbike » (b minuscule), l'asset « MountainBike » : les deux graphies.
  Item_Mountainbike_C: 'VTT',
  Item_MountainBike_C: 'VTT',
  Item_BulletproofShield_C: 'Bouclier pliable',
  Item_Bluechip_C: 'Puce bleue',
}

export function itemLabel(itemId: string, fallback: (id: string) => string) {
  return ITEM_LABELS[itemId] ?? fallback(itemId)
}

// ── Synergies d'équipe (duo, trio, squad) ───────────────────────────────────────────────────────────

export type SynergyEntry = {
  memberIds: number[]
  memberNames: string[]
  matchesPlayed: number
  totalKills: number
  winRate: number
}

/** Duos, trios et squads, chacun classé par matchs joués puis par taux de victoire (ordre de l'API conservé). */
export function synergyGroups(synergies: { topPairs: SynergyEntry[]; topSquads: SynergyEntry[] } | null | undefined) {
  const squads = synergies?.topSquads ?? []
  return [
    { id: 'duo' as const, label: 'Duo', entries: synergies?.topPairs ?? [] },
    { id: 'trio' as const, label: 'Trio', entries: squads.filter((entry) => entry.memberIds.length === 3) },
    { id: 'squad' as const, label: 'Squad', entries: squads.filter((entry) => entry.memberIds.length >= 4) },
  ]
}

// ── Coopération ─────────────────────────────────────────────────────────────────────────────────────

/** Une paire de `/api/clans/[clanId]/telemetry/synergies`. */
export type CooperationPair = {
  memberAId: number
  memberAName: string
  memberBId: number
  memberBName: string
  reviveCount: number
  recallCount: number
  coKillCount: number
  sharedDamageEvents: number
}

/**
 * Chiffres de la coopération. L'indice de synergie rapporte le score moyen des binômes (réanimations ×3, co-kills ×2,
 * dégâts partagés ×1) à celui du meilleur : proche de 100 quand tous coopèrent autant, proche de 0 quand tout repose sur
 * un seul binôme. Même formule que l'ancien panneau de la vue d'ensemble.
 */
export function cooperationSummary(pairs: CooperationPair[]) {
  const scores = pairs.map((pair) => pair.reviveCount * 3 + pair.coKillCount * 2 + pair.sharedDamageEvents)
  const best = scores.reduce((max, score) => Math.max(max, score), 0)
  const averageScore = scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0
  const total = (pick: (pair: CooperationPair) => number) => pairs.reduce((sum, pair) => sum + pick(pair), 0)
  return {
    pairs: pairs.length,
    revives: total((pair) => pair.reviveCount),
    coKills: total((pair) => pair.coKillCount),
    recalls: total((pair) => pair.recallCount ?? 0),
    sharedDamage: total((pair) => pair.sharedDamageEvents),
    averageScore,
    index: best > 0 ? Math.min(100, (averageScore / best) * 100) : 0,
  }
}

export type CooperationTopId = 'revives' | 'coKills' | 'recalls'

const COOPERATION_VALUE: Record<CooperationTopId, (pair: CooperationPair) => number> = {
  revives: (pair) => pair.reviveCount,
  coKills: (pair) => pair.coKillCount,
  recalls: (pair) => pair.recallCount ?? 0,
}

/** Les binômes en tête d'un classement de coopération ; un binôme à 0 n'y figure pas. */
export function cooperationTop(pairs: CooperationPair[], id: CooperationTopId, limit = 5) {
  const value = COOPERATION_VALUE[id]
  return [...pairs]
    .filter((pair) => value(pair) > 0)
    .sort((a, b) => value(b) - value(a))
    .slice(0, limit)
    .map((pair) => ({ key: `${pair.memberAId}:${pair.memberBId}`, names: [pair.memberAName, pair.memberBName], value: value(pair) }))
}
