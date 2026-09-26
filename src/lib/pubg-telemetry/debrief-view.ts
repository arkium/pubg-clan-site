/**
 * Logique de présentation du débriefing tactique (refonte du 2026-09-26, docs/features/debriefing.md) :
 * onglet porté par l'URL, filtres et regroupement de la chronologie, repères de phase, pagination des équipes,
 * statistiques des cartes de joueur. Module pur, importable côté client.
 */

import { resolveBodyZone, type BodyZone, type BodyZoneBreakdown } from '@/lib/pubg-telemetry/body-zones'

export const DEBRIEF_TABS = ['combat', 'replay', 'squad', 'duels'] as const
export type DebriefTab = (typeof DEBRIEF_TABS)[number]

/** Paramètre d'URL de l'onglet : un lien partagé et le retour arrière rouvrent le bon onglet. */
export const DEBRIEF_TAB_PARAM = 'tab'

export function parseDebriefTab(value: string | null | undefined): DebriefTab {
  return (DEBRIEF_TABS as readonly string[]).includes(value ?? '') ? (value as DebriefTab) : 'combat'
}

/** « 18:30 » — minutes et secondes depuis le début du match. */
export function formatClock(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '—'
  const total = Math.floor(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

// ── Phases ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Début de chaque phase de zone (1, 2, …), en secondes depuis le début du match, d'après les instantanés de
 * phase de la télémétrie (`isGame` = numéro de phase, demi-valeurs pendant le rétrécissement).
 */
export function phaseStartTimes(snapshots: unknown): Array<{ phase: number; t: number }> {
  if (!Array.isArray(snapshots)) return []
  const starts = new Map<number, number>()
  for (const snapshot of snapshots) {
    if (!snapshot || typeof snapshot !== 'object') continue
    const { isGame, timestampSeconds } = snapshot as { isGame?: unknown; timestampSeconds?: unknown }
    if (typeof isGame !== 'number' || typeof timestampSeconds !== 'number') continue
    if (!Number.isFinite(isGame) || !Number.isFinite(timestampSeconds) || isGame < 1) continue
    const phase = Math.floor(isGame)
    if (!starts.has(phase) || timestampSeconds < (starts.get(phase) as number)) starts.set(phase, timestampSeconds)
  }
  return Array.from(starts.entries())
    .map(([phase, t]) => ({ phase, t }))
    .sort((a, b) => a.phase - b.phase)
}

// ── Chronologie ──────────────────────────────────────────────────────────────────────────────────

export type TimelineScope = 'squad' | 'tracked' | 'all'
export type TimelineType = 'all' | 'kill' | 'knock' | 'revive' | 'recall'

export type TimelineEventLike = {
  id: string
  type: 'kill' | 'knock' | 'revive' | 'recall'
  timestamp: number
  phaseNumber: number
  actorAffiliation?: 'current_clan' | 'tracked_clan' | 'external'
  targetAffiliation?: 'current_clan' | 'tracked_clan' | 'external'
  isClanActor?: boolean
  isClanTarget?: boolean
  isTrackedClanActor?: boolean
  isTrackedClanTarget?: boolean
  isSquadActor?: boolean
  isSquadTarget?: boolean
}

const isClanActor = (ev: TimelineEventLike) => Boolean(ev.isClanActor || ev.actorAffiliation === 'current_clan')
const isClanTarget = (ev: TimelineEventLike) => Boolean(ev.isClanTarget || ev.targetAffiliation === 'current_clan')
/** Escouade = clan consulté + coéquipiers de la même équipe. Les anciens payloads retombent sur le clan. */
export const isSquadActor = (ev: TimelineEventLike) => Boolean(ev.isSquadActor ?? isClanActor(ev))
export const isSquadTarget = (ev: TimelineEventLike) => Boolean(ev.isSquadTarget ?? isClanTarget(ev))
const involvesTracked = (ev: TimelineEventLike) =>
  isSquadActor(ev) ||
  isSquadTarget(ev) ||
  Boolean(ev.isTrackedClanActor || ev.isTrackedClanTarget) ||
  ev.actorAffiliation === 'tracked_clan' ||
  ev.targetAffiliation === 'tracked_clan'

export function matchesScope(ev: TimelineEventLike, scope: TimelineScope): boolean {
  if (scope === 'squad') return isSquadActor(ev) || isSquadTarget(ev)
  if (scope === 'tracked') return involvesTracked(ev)
  return true
}

export function filterTimeline<T extends TimelineEventLike>(events: readonly T[], scope: TimelineScope, type: TimelineType): T[] {
  return events.filter((ev) => matchesScope(ev, scope) && (type === 'all' || ev.type === type))
}

/** Compteurs des puces de type, pour la portée choisie. */
export function countTimelineTypes(events: readonly TimelineEventLike[], scope: TimelineScope): Record<TimelineType, number> {
  const counts: Record<TimelineType, number> = { all: 0, kill: 0, knock: 0, revive: 0, recall: 0 }
  for (const ev of events) {
    if (!matchesScope(ev, scope)) continue
    counts.all += 1
    counts[ev.type] += 1
  }
  return counts
}

/** Bilan de l'escouade sur tout le match : kills, mises à terre, morts, rappels. */
export function squadTotals(events: readonly TimelineEventLike[]) {
  let kills = 0
  let knocks = 0
  let deaths = 0
  let recalls = 0
  for (const ev of events) {
    if (ev.type === 'kill' && isSquadActor(ev)) kills += 1
    if (ev.type === 'knock' && isSquadActor(ev)) knocks += 1
    if (ev.type === 'kill' && isSquadTarget(ev)) deaths += 1
    if (ev.type === 'recall' && isSquadActor(ev)) recalls += 1
  }
  return { kills, knocks, deaths, recalls }
}

export type TimelinePhaseGroup<T> = { phase: number; start: number; summary: string; events: T[] }

/** Événements groupés par phase, avec le bilan de l'escouade dans la phase (« +2 kills · −1 mort »). */
export function groupTimelineByPhase<T extends TimelineEventLike>(events: readonly T[]): Array<TimelinePhaseGroup<T>> {
  const groups = new Map<number, T[]>()
  for (const ev of events) {
    const phase = ev.phaseNumber || 1
    const list = groups.get(phase) ?? []
    list.push(ev)
    groups.set(phase, list)
  }
  return Array.from(groups.entries())
    .sort(([a], [b]) => a - b)
    .map(([phase, list]) => {
      const sorted = [...list].sort((a, b) => a.timestamp - b.timestamp)
      const { kills, deaths } = squadTotals(sorted)
      const summary = [
        kills ? `+${kills} kill${kills > 1 ? 's' : ''}` : '',
        deaths ? `−${deaths} mort${deaths > 1 ? 's' : ''}` : '',
      ]
        .filter(Boolean)
        .join(' · ')
      return { phase, start: sorted[0]?.timestamp ?? 0, summary, events: sorted }
    })
}

export const BODY_ZONE_LABELS: Record<BodyZone, string> = {
  head: 'Tête',
  torso: 'Torse',
  pelvis: 'Bassin',
  arms: 'Bras',
  legs: 'Jambes',
  other: 'Non localisée',
}

/** Zone de l'impact fatal : seule la télémétrie la connaît ; « Non localisée » sinon, jamais inventée. */
export function hitZoneLabel(damageReason: string | null | undefined): string {
  return BODY_ZONE_LABELS[resolveBodyZone(damageReason)]
}

export function isHeadshot(damageReason: string | null | undefined): boolean {
  return resolveBodyZone(damageReason) === 'head'
}

/** Libellé d'arme : dictionnaire de l'API, sinon clé de télémétrie nettoyée (`WeapHK416_C` → `HK416`). */
export function weaponDisplayName(raw: string | null | undefined, labels: Readonly<Record<string, string>> = {}): string {
  if (!raw) return 'Inconnue'
  if (labels[raw]) return labels[raw]
  return raw.replace(/^Weap/, '').replace(/^Proj/, '').replace(/_Item_C$/, '').replace(/_C$/, '').replaceAll('_', ' ').trim() || raw
}

// ── Équipes ──────────────────────────────────────────────────────────────────────────────────────

/** Page (base 0) d'une liste paginée par `perPage`, bornée. */
export function clampPage(page: number, itemCount: number, perPage: number): number {
  const pages = Math.max(1, Math.ceil(itemCount / perPage))
  return Math.min(Math.max(0, page), pages - 1)
}

export function pageOfIndex(index: number, perPage: number): number {
  return index < 0 ? 0 : Math.floor(index / perPage)
}

/** Part de la partie survécue par une équipe (0–100) ; 100 pour une équipe en vie à la fin. */
export function survivalPercent(eliminatedAt: number | null | undefined, durationSeconds: number | null | undefined): number {
  if (eliminatedAt === null || eliminatedAt === undefined) return 100
  if (!durationSeconds || durationSeconds <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((eliminatedAt / durationSeconds) * 100)))
}

// ── Cartes de joueur ─────────────────────────────────────────────────────────────────────────────

export type MemberStatsRow = {
  memberKey?: string
  damageTaken?: number
  onFootDistanceMeters?: number
  vehicleDistanceMeters?: number
  weapons?: Array<{ shotsFired?: number; hitsLanded?: number }>
}

export function accuracyOf(stats: MemberStatsRow | null | undefined): { shots: number; hits: number; percent: number | null } {
  let shots = 0
  let hits = 0
  for (const weapon of stats?.weapons ?? []) {
    shots += Number(weapon.shotsFired) || 0
    hits += Number(weapon.hitsLanded) || 0
  }
  return { shots, hits, percent: shots > 0 ? Math.round((hits / shots) * 100) : null }
}

/** « 2,4 km » ou « 850 m ». */
export function formatDistance(meters: number | null | undefined): string {
  const value = Math.max(0, Math.round(Number(meters) || 0))
  if (value < 1000) return `${value} m`
  return `${(value / 1000).toFixed(1).replace('.', ',')} km`
}

// ── Duels ────────────────────────────────────────────────────────────────────────────────────────

export type ZoneBar = { zone: BodyZone; label: string; hits: number; damage: number; widthPercent: number }

/** Barres par zone du corps (localisées seulement), largeur relative aux dégâts de la zone la plus touchée. */
export function zoneBars(breakdown: readonly BodyZoneBreakdown[] | null | undefined): {
  bars: ZoneBar[]
  hits: number
  headPercent: number | null
  unlocalizedDamage: number
} {
  const rows = (breakdown ?? []).filter((row) => row.zone !== 'other')
  const unlocalizedDamage = (breakdown ?? []).filter((row) => row.zone === 'other').reduce((sum, row) => sum + row.damage, 0)
  const order: BodyZone[] = ['head', 'torso', 'pelvis', 'arms', 'legs']
  const maxDamage = Math.max(0, ...rows.map((row) => row.damage))
  const hits = rows.reduce((sum, row) => sum + row.hits, 0)
  const headHits = rows.find((row) => row.zone === 'head')?.hits ?? 0
  return {
    bars: order.map((zone) => {
      const row = rows.find((entry) => entry.zone === zone)
      const damage = row?.damage ?? 0
      return {
        zone,
        label: BODY_ZONE_LABELS[zone],
        hits: row?.hits ?? 0,
        damage: Math.round(damage),
        widthPercent: maxDamage > 0 ? Math.round((damage / maxDamage) * 100) : 0,
      }
    }),
    hits,
    headPercent: hits > 0 ? Math.round((headHits / hits) * 100) : null,
    unlocalizedDamage: Math.round(unlocalizedDamage),
  }
}

// ── Lancers ──────────────────────────────────────────────────────────────────────────────────────

/** Objets de combat lancés, dans l'ordre d'affichage ; les objets de fantaisie (Juju, pomme…) sont ignorés. */
const THROWABLE_LABELS: Array<[itemId: string, singular: string, plural: string]> = [
  ['Item_Weapon_Grenade_C', 'grenade', 'grenades'],
  ['Item_Weapon_SmokeBomb_C', 'fumigène', 'fumigènes'],
  ['Item_Weapon_FlashBang_C', 'flash', 'flashs'],
  ['Item_Weapon_Molotov_C', 'cocktail Molotov', 'cocktails Molotov'],
  ['Item_Weapon_StickyGrenade_C', 'bombe collante', 'bombes collantes'],
  ['Item_Weapon_BluezoneGrenade_C', 'grenade de zone bleue', 'grenades de zone bleue'],
  ['Item_Weapon_C4_C', 'C4', 'C4'],
]

/** « 2 fumigènes · 1 grenade » à partir des lignes `MemberThrowableStat` (une par objet) ; `''` sans lancer. */
export function throwableSummary(rows: ReadonlyArray<{ itemId: string; count: number }>): string {
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.itemId, (counts.get(row.itemId) ?? 0) + (Number(row.count) || 0))
  return THROWABLE_LABELS.flatMap(([itemId, singular, plural]) => {
    const count = counts.get(itemId) ?? 0
    return count > 0 ? [`${count} ${count > 1 ? plural : singular}`] : []
  }).join(' · ')
}
