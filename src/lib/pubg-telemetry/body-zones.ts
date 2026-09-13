/**
 * Zones anatomiques d'impact, dérivées de `LogPlayerTakeDamage.damageReason`.
 *
 * Remplace l'ancienne heuristique `inferHitZones`, qui répartissait les dégâts
 * au jugé (75 % torse / 25 % bassin par défaut) faute de donnée persistée.
 */

export const BODY_ZONES = ['head', 'torso', 'pelvis', 'arms', 'legs', 'other'] as const

export type BodyZone = (typeof BODY_ZONES)[number]

/** Zones réellement projetables sur la silhouette (`other` ne l'est pas). */
export const LOCALIZED_BODY_ZONES = BODY_ZONES.filter((zone) => zone !== 'other')

export type BodyZoneBreakdown = {
  zone: BodyZone
  damage: number
  hits: number
}

export type BodyZoneAccumulator = Partial<Record<BodyZone, { damage: number; hits: number }>>

const DAMAGE_REASON_TO_ZONE: Record<string, BodyZone> = {
  headshot: 'head',
  torsoshot: 'torso',
  pelvisshot: 'pelvis',
  armshot: 'arms',
  legshot: 'legs',
}

/**
 * `NonSpecific`, `None` et les variantes de mort simulée d'IA couvrent les
 * dégâts non localisés (zone bleue, chute, explosion, véhicule) : ils sont
 * comptés en `other` plutôt qu'attribués arbitrairement à une partie du corps.
 */
export function resolveBodyZone(damageReason: string | null | undefined): BodyZone {
  if (!damageReason) return 'other'
  return DAMAGE_REASON_TO_ZONE[damageReason.trim().toLowerCase()] ?? 'other'
}

export function addBodyZoneHit(
  accumulator: BodyZoneAccumulator,
  zone: BodyZone,
  damage: number
) {
  const entry = accumulator[zone] ?? { damage: 0, hits: 0 }
  entry.damage += Number.isFinite(damage) ? damage : 0
  entry.hits += 1
  accumulator[zone] = entry
}

/** Ne sérialise que les zones touchées, pour ne pas gonfler `memberStats`. */
export function serializeBodyZones(accumulator: BodyZoneAccumulator): BodyZoneBreakdown[] {
  const rows: BodyZoneBreakdown[] = []

  for (const zone of BODY_ZONES) {
    const entry = accumulator[zone]
    if (!entry || (entry.damage <= 0 && entry.hits <= 0)) continue
    rows.push({ zone, damage: Number(entry.damage.toFixed(2)), hits: entry.hits })
  }

  return rows
}

/** Agrège plusieurs ventilations (ex. tous les membres d'une escouade). */
export function mergeBodyZoneBreakdowns(
  breakdowns: Array<BodyZoneBreakdown[] | null | undefined>
): BodyZoneBreakdown[] {
  const accumulator: BodyZoneAccumulator = {}

  for (const breakdown of breakdowns) {
    if (!Array.isArray(breakdown)) continue
    for (const row of breakdown) {
      if (!row || typeof row.zone !== 'string') continue
      const zone = BODY_ZONES.includes(row.zone as BodyZone) ? (row.zone as BodyZone) : 'other'
      const entry = accumulator[zone] ?? { damage: 0, hits: 0 }
      entry.damage += Number.isFinite(row.damage) ? row.damage : 0
      entry.hits += Number.isFinite(row.hits) ? row.hits : 0
      accumulator[zone] = entry
    }
  }

  return serializeBodyZones(accumulator)
}

export function totalLocalizedHits(breakdown: BodyZoneBreakdown[] | null | undefined) {
  if (!Array.isArray(breakdown)) return 0
  return breakdown
    .filter((row) => row.zone !== 'other')
    .reduce((sum, row) => sum + (Number.isFinite(row.hits) ? row.hits : 0), 0)
}

export type BodyZoneSummary = {
  localizedDamage: number
  localizedHits: number
  /** Dégâts sans localisation (`other`) : exclus de la silhouette, affichés à part. */
  unlocalizedDamage: number
  /** Part des touches localisées reçues à la tête, `null` sans aucune touche localisée. */
  headHitRate: number | null
}

/** Chiffres de synthèse affichés à côté d'une silhouette (infligés ou subis). */
export function summarizeBodyZones(breakdown: BodyZoneBreakdown[] | null | undefined): BodyZoneSummary {
  const rows = Array.isArray(breakdown) ? breakdown : []
  const localized = rows.filter((row) => row.zone !== 'other')
  const localizedHits = totalLocalizedHits(rows)
  const headHits = localized.find((row) => row.zone === 'head')?.hits ?? 0

  return {
    localizedDamage: localized.reduce(
      (sum, row) => sum + (Number.isFinite(row.damage) ? row.damage : 0),
      0
    ),
    localizedHits,
    unlocalizedDamage: rows.find((row) => row.zone === 'other')?.damage ?? 0,
    headHitRate: localizedHits > 0 ? Math.round((headHits / localizedHits) * 100) : null,
  }
}
