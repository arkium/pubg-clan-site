/**
 * Page « Carte des ressources » (docs/features/carte-ressources.md) : règles d'affichage pures — taille et opacité
 * des marqueurs observés, filtres de couches et de drop zones, textes de la fiche et des parcours, corps des envois,
 * mise à jour locale de la réponse après une action.
 *
 * Fichier pur, sans import `@/` : partagé par la page et les tests (Vitest et e2e).
 */
import {
  DROP_ZONE_RADIUS_METERS,
  OBSERVED_FAMILIES,
  RESOURCE_COMMENT_MAX,
  RESOURCE_POINT_KINDS,
  RESOURCE_POINT_KIND_LABELS,
  SPOT_RELATIVE_SHARE,
  isNear,
  type ObservedFamily,
  type ResourcePointKind,
  type ResourceReportKind,
} from './resource-map'
import type { ObservedSpotView, ResourceMapResponse, ResourceMapState, ResourcePointView } from './resource-api'

// --- Libellés ----------------------------------------------------------------------------------------------------------

/** Nom d'un emplacement observé dans sa fiche (« Voiture ») — les couches gardent le pluriel de `OBSERVED_FAMILY_LABELS`. */
export const OBSERVED_FAMILY_SINGULAR: Record<ObservedFamily, string> = {
  car: 'Voiture',
  moto: 'Moto',
  boat: 'Bateau',
  glider: 'Planeur',
  land: 'Voiture ou moto',
}

export function pointKindLabel(kind: ResourcePointKind) {
  return RESOURCE_POINT_KIND_LABELS[kind].singular
}

/** Clé stable d'un emplacement observé (la réponse n'a pas d'identifiant) : famille et centre. */
export function spotKey(spot: Pick<ObservedSpotView, 'family' | 'x' | 'y'>) {
  return `${spot.family}:${spot.x}:${spot.y}`
}

/** Nom accessible d'un marqueur saisi : type et repère, puis l'état quand il n'est pas « validé ». */
export function pointMarkerName(point: Pick<ResourcePointView, 'kind' | 'grid' | 'state' | 'mine'>) {
  const base = `${pointKindLabel(point.kind)}, grille ${point.grid}`
  if (point.state === 'to_confirm') return `${base}, à confirmer`
  if (point.state === 'pending') return point.mine ? `${base}, ta proposition en attente` : `${base}, en attente`
  return base
}

/** Nom accessible d'un marqueur observé : famille et repère, puis la fréquence. */
export function spotMarkerName(spot: Pick<ObservedSpotView, 'family' | 'grid' | 'share'>) {
  return `${OBSERVED_FAMILY_SINGULAR[spot.family]}, grille ${spot.grid}, observé dans ${sharePercent(spot.share)} % des parties`
}

// --- Marqueurs observés --------------------------------------------------------------------------------------------------

/**
 * Taille (px) et opacité d'un marqueur observé : « plus c'est gros, plus c'est fréquent », **au sein de sa famille sur
 * la carte** — un emplacement de bateau à 3,5 % est le plus fréquent de sa famille et doit se voir autant qu'une
 * voiture à 24 %. Progression linéaire entre le seuil relatif d'affichage (le quart du plus fréquent,
 * `SPOT_RELATIVE_SHARE`) et le plus fréquent lui-même (`familyTopShare`).
 */
export const OBSERVED_MARKER = { minSize: 18, maxSize: 34, minOpacity: 0.55, maxOpacity: 1 } as const

export function observedMarkerStyle(share: number, familyTopShare: number) {
  const value = Number.isFinite(share) ? share : 0
  const top = Number.isFinite(familyTopShare) && familyTopShare > 0 ? familyTopShare : value
  const relative = top > 0 ? value / top : 0
  const ratio = Math.min(1, Math.max(0, (relative - SPOT_RELATIVE_SHARE) / (1 - SPOT_RELATIVE_SHARE)))
  return {
    size: Math.round(OBSERVED_MARKER.minSize + ratio * (OBSERVED_MARKER.maxSize - OBSERVED_MARKER.minSize)),
    opacity: Math.round((OBSERVED_MARKER.minOpacity + ratio * (OBSERVED_MARKER.maxOpacity - OBSERVED_MARKER.minOpacity)) * 100) / 100,
  }
}

/** Part du plus fréquent de chaque famille parmi les emplacements reçus (dénominateur de `observedMarkerStyle`). */
export function familyTopShares(spots: ReadonlyArray<Pick<ObservedSpotView, 'family' | 'share'>>) {
  const top = new Map<string, number>()
  for (const spot of spots) top.set(spot.family, Math.max(top.get(spot.family) ?? 0, spot.share))
  return top
}

export function sharePercent(share: number) {
  return Math.round(Math.min(1, Math.max(0, Number.isFinite(share) ? share : 0)) * 100)
}

// --- Repère ------------------------------------------------------------------------------------------------------------

/** Position d'un point (mètres) en pourcentage de la carte, bornée à la carte. */
export function mapPercent(sizeMeters: number, point: { x: number; y: number }) {
  const clamp = (value: number) => Math.min(100, Math.max(0, (value / sizeMeters) * 100))
  return { left: clamp(point.x), top: clamp(point.y) }
}

/** Clic sur la carte (pourcentages du calque) → position en mètres, arrondie et bornée à la carte. */
export function metersFromPercent(sizeMeters: number, xPct: number, yPct: number) {
  const clamp = (value: number) => Math.round((Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0)) / 100) * sizeMeters)
  return { x: clamp(xPct), y: clamp(yPct) }
}

// --- Couches et drop zones -------------------------------------------------------------------------------------------

export type NearFilter = { centers: Array<{ x: number; y: number }>; radius: number } | null

export type LayerFilter = {
  hiddenFamilies: readonly ObservedFamily[]
  hiddenKinds: readonly ResourcePointKind[]
  near: NearFilter
}

function keepNear<T extends { x: number; y: number }>(items: readonly T[], near: NearFilter) {
  if (!near || near.centers.length === 0) return [...items]
  return items.filter((item) => isNear(item, near.centers, near.radius))
}

export function visibleSpots(spots: readonly ObservedSpotView[], filter: LayerFilter) {
  return keepNear(spots, filter.near).filter((spot) => !filter.hiddenFamilies.includes(spot.family))
}

export function visiblePoints(points: readonly ResourcePointView[], filter: LayerFilter) {
  return keepNear(points, filter.near).filter((point) => !filter.hiddenKinds.includes(point.kind))
}

/** Nombre de marqueurs par famille, filtre des drop zones appliqué (une couche décochée garde son nombre). */
export function familyCounts(spots: readonly ObservedSpotView[], near: NearFilter) {
  const counts = Object.fromEntries(OBSERVED_FAMILIES.map((family) => [family, 0])) as Record<ObservedFamily, number>
  for (const spot of keepNear(spots, near)) counts[spot.family] += 1
  return counts
}

export function kindCounts(points: readonly ResourcePointView[], near: NearFilter) {
  const counts = Object.fromEntries(RESOURCE_POINT_KINDS.map((kind) => [kind, 0])) as Record<ResourcePointKind, number>
  for (const point of keepNear(points, near)) counts[point.kind] += 1
  return counts
}

/** Familles proposées en couche : toutes, sauf « Voitures ou motos » quand elle n'a aucun emplacement. */
export function shownFamilies(spots: readonly ObservedSpotView[]) {
  return OBSERVED_FAMILIES.filter((family) => family !== 'land' || spots.some((spot) => spot.family === 'land'))
}

/** Sous-ligne de l'interrupteur : « Pochinki, School, Georgopol · 800 m ». */
export function dropZoneSummary(centers: ReadonlyArray<{ name: string }>, radius: number = DROP_ZONE_RADIUS_METERS) {
  return `${centers.map((center) => center.name).join(', ')} · ${Math.round(radius)} m`
}

// --- Dates (heure de Paris) ------------------------------------------------------------------------------------------

function parisParts(iso: string) {
  const parts = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Europe/Paris' }).formatToParts(
    new Date(iso)
  )
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value ?? 0)
  return { day: part('day'), month: part('month'), year: part('year') }
}

/** « 1/10 » : jour et mois, sans zéro. */
export function formatDayMonth(iso: string) {
  const { day, month } = parisParts(iso)
  return `${day}/${month}`
}

/** « 28/09/2026 ». */
export function formatFullDate(iso: string) {
  const { day, month, year } = parisParts(iso)
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`
}

/** « 29 sept. ». */
export function formatShortDate(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' }).format(new Date(iso))
}

// --- État de la carte --------------------------------------------------------------------------------------------------

export type MapStateChip = { tone: 'pos' | 'warn'; text: string }

/** Puce d'état sous le bandeau : « À revérifier depuis le 1/10 » l'emporte sur « Vérifiée le 28/09/2026 ». */
export function mapStateChip(state: ResourceMapState): MapStateChip | null {
  if (state.recheckSince) return { tone: 'warn', text: `À revérifier depuis le ${formatDayMonth(state.recheckSince)}` }
  if (state.verifiedAt) return { tone: 'pos', text: `Vérifiée le ${formatFullDate(state.verifiedAt)}` }
  return null
}

/** Bandeau d'information d'une carte à revérifier après une mise à jour PUBG. */
export function recheckNotice(state: ResourceMapState) {
  if (!state.recheckSince) return null
  const date = formatDayMonth(state.recheckSince)
  if (state.toConfirm <= 0) return `Mise à jour PUBG du ${date} : tous les points saisis sont confirmés.`
  const plural = state.toConfirm > 1 ? 's' : ''
  return `Mise à jour PUBG du ${date} : ${state.toConfirm} point${plural} saisi${plural} à confirmer. Si tu passes devant, ouvre le point et clique « Toujours là ».`
}

// --- Fiche ------------------------------------------------------------------------------------------------------------

/** « 21 points validés » (contributeur). */
export function contributorCountLabel(count: number) {
  if (count <= 0) return 'aucun point validé'
  return count === 1 ? '1 point validé' : `${count} points validés`
}

/** « Tu as 12 points validés » (fin d'un parcours). */
export function validatedCountLabel(count: number) {
  if (count <= 0) return 'Pas encore de point validé'
  return `Tu as ${contributorCountLabel(count)}`
}

/** Ligne de confirmation d'un point saisi : « Confirmé 29 sept. · 4 confirmations », en orange quand il est à confirmer. */
export function confirmationLine(point: Pick<ResourcePointView, 'state' | 'lastConfirmedAt' | 'confirmations'>) {
  if (point.state === 'to_confirm') return { tone: 'warn' as const, text: 'Confirmé : pas encore depuis la mise à jour' }
  const count = point.confirmations > 0 ? `${point.confirmations} confirmation${point.confirmations > 1 ? 's' : ''}` : null
  if (point.lastConfirmedAt) return { tone: 'default' as const, text: `Confirmé ${formatShortDate(point.lastConfirmedAt)}${count ? ` · ${count}` : ''}` }
  return { tone: 'default' as const, text: count ?? 'Pas encore confirmé' }
}

/**
 * Point en attente : « Ta proposition du 3 oct. Visible seulement par toi… » pour son auteur, l'auteur et la date pour
 * un SuperUser. Le mois abrégé porte déjà son point (« oct. ») : pas de second point en fin de phrase.
 */
export function pendingLine(point: Pick<ResourcePointView, 'mine' | 'createdAt' | 'createdBy'>) {
  const date = formatShortDate(point.createdAt)
  if (point.mine) return `Ta proposition du ${date}${date.endsWith('.') ? '' : '.'} Visible seulement par toi et les superusers jusqu’à sa validation.`
  return `Proposé${point.createdBy ? ` par ${point.createdBy.name}` : ''} le ${date}, en attente de validation.`
}

/** « 48 observations sur 78 parties analysées. Mis à jour chaque nuit. » */
export function observationLine(spot: Pick<ObservedSpotView, 'observations'>, analysedMatches: number) {
  const observations = `${spot.observations} observation${spot.observations > 1 ? 's' : ''}`
  const matches = `${analysedMatches} partie${analysedMatches > 1 ? 's' : ''} analysée${analysedMatches > 1 ? 's' : ''}`
  return `${observations} sur ${matches}. Mis à jour chaque nuit.`
}

// --- Parcours « Signaler » et « Proposer » ------------------------------------------------------------------------------

export type FlowStep = 1 | 2 | 3

/** « N'existe plus » n'a pas d'étape 2 : du motif, on passe directement à l'envoi. */
export function reportNextStep(step: FlowStep, reason: ResourceReportKind): FlowStep {
  if (step === 1) return reason === 'missing' ? 3 : 2
  return 3
}

export function reportPreviousStep(step: FlowStep, reason: ResourceReportKind): FlowStep {
  if (step === 3) return reason === 'missing' ? 1 : 2
  return 1
}

/** Commentaire envoyé : espaces retirés, borné à `RESOURCE_COMMENT_MAX`, absent s'il est vide. */
export function cleanComment(text: string) {
  const trimmed = text.trim().slice(0, RESOURCE_COMMENT_MAX)
  return trimmed.length > 0 ? trimmed : undefined
}

export type ReportBody = { kind: ResourceReportKind; x?: number; y?: number; proposedKind?: ResourcePointKind; comment?: string }

export function buildReportBody(input: {
  reason: ResourceReportKind
  position: { x: number; y: number } | null
  proposedKind: ResourcePointKind | null
  comment: string
}): ReportBody {
  const body: ReportBody = { kind: input.reason }
  if (input.reason === 'misplaced' && input.position) {
    body.x = input.position.x
    body.y = input.position.y
  }
  if (input.reason === 'wrong_kind' && input.proposedKind) body.proposedKind = input.proposedKind
  const comment = cleanComment(input.comment)
  if (comment) body.comment = comment
  return body
}

export type ProposalBody = { map: string; kind: ResourcePointKind; x: number; y: number; comment?: string }

export function buildProposalBody(input: { map: string; kind: ResourcePointKind; position: { x: number; y: number }; comment: string }): ProposalBody {
  const body: ProposalBody = { map: input.map, kind: input.kind, x: input.position.x, y: input.position.y }
  const comment = cleanComment(input.comment)
  if (comment) body.comment = comment
  return body
}

// --- Mise à jour locale de la réponse ---------------------------------------------------------------------------------

/** « Toujours là » : le point renvoyé remplace l'ancien ; un point qui sort de « à confirmer » décompte la carte. */
export function applyConfirmation(data: ResourceMapResponse, point: ResourcePointView): ResourceMapResponse {
  const previous = data.points.find((entry) => entry.id === point.id)
  const leftToConfirm = previous?.state === 'to_confirm' && point.state !== 'to_confirm'
  return {
    ...data,
    points: data.points.map((entry) => (entry.id === point.id ? point : entry)),
    state: leftToConfirm ? { ...data.state, toConfirm: Math.max(0, data.state.toConfirm - 1) } : data.state,
  }
}

/** Proposition envoyée : le point en attente apparaît (pointillés) et le compteur du lecteur suit la réponse. */
export function applyProposal(data: ResourceMapResponse, point: ResourcePointView, validatedCount: number): ResourceMapResponse {
  return {
    ...data,
    points: [...data.points.filter((entry) => entry.id !== point.id), point],
    viewer: { ...data.viewer, validatedCount },
  }
}

export function applyCancellation(data: ResourceMapResponse, pointId: string): ResourceMapResponse {
  return { ...data, points: data.points.filter((entry) => entry.id !== pointId) }
}

export function applyReport(data: ResourceMapResponse, pointId: string, validatedCount: number): ResourceMapResponse {
  return {
    ...data,
    points: data.points.map((entry) => (entry.id === pointId ? { ...entry, reportedByMe: true } : entry)),
    viewer: { ...data.viewer, validatedCount },
  }
}
