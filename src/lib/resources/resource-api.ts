/**
 * Contrat des routes de la Carte des ressources (docs/features/carte-ressources.md) — partagé par les routes, la page
 * et les tests e2e. Fichier pur, sans import `@/`. Coordonnées en mètres sur la carte.
 *
 * Joueur
 *   GET  /api/resources?map=Baltic_Main                         → ResourceMapResponse (public ; le lecteur connecté voit en plus ses points en attente)
 *   GET  /api/resources/drop-zones?clanId=&map=                 → ResourceDropZonesResponse (filtre « Autour de nos drop zones »)
 *   POST /api/resources/points        { map, kind, x, y, comment? }                    → ResourceProposalResponse (connecté)
 *   POST /api/resources/points/:id/cancel                                              → { ok: true } (auteur, point en attente)
 *   POST /api/resources/points/:id/confirm                                             → { point } (« Toujours là », connecté)
 *   POST /api/resources/points/:id/reports { kind, x?, y?, proposedKind?, comment? }   → ResourceReportResponse (connecté)
 *
 * SuperUser
 *   GET  /api/resources/admin/queue                                                    → ResourceQueueResponse
 *   POST /api/resources/admin/decisions { decisions: ResourceDecisionInput[] }         → ResourceDecisionsResponse
 *   POST /api/resources/admin/maps/:map { action: 'recheck' | 'verify' }               → { map: ResourceMapSummary }
 *   GET  /api/resources/admin/history?page=                                            → ResourceHistoryResponse
 *   POST /api/resources/admin/history/:id/undo                                         → { ok: true }
 */
import type { ObservedFamily, ResourcePointKind, ResourcePointState, ResourceReportKind } from './resource-map'

export type ResourceContributor = {
  name: string
  /** Points et signalements de ce joueur validés par un SuperUser (« 12 points validés »). */
  validatedCount: number
}

export type ResourcePointView = {
  id: string
  kind: ResourcePointKind
  x: number
  y: number
  /** Repère de grille « D-M ». */
  grid: string
  state: ResourcePointState
  /** Point proposé par le lecteur. */
  mine: boolean
  createdBy: ResourceContributor | null
  validatedBy: string | null
  validatedAt: string | null
  lastConfirmedAt: string | null
  /** Clics « Toujours là » (tous temps). */
  confirmations: number
  createdAt: string
  /** Commentaire de la proposition : seulement pour son auteur et les SuperUsers. */
  comment: string | null
  /** Le lecteur a déjà un signalement en attente sur ce point. */
  reportedByMe: boolean
  /** Le lecteur a déjà confirmé ce point depuis la dernière demande de revérification. */
  confirmedByMe: boolean
}

export type ObservedSpotView = {
  family: ObservedFamily
  x: number
  y: number
  grid: string
  /** Part des parties analysées de la carte où un véhicule de cette famille a été trouvé ici (0–1). */
  share: number
  observations: number
  matches: number
}

export type ResourceMapState = {
  /** Dernière vérification complète de la carte par un SuperUser (« Vérifiée le 28/09/2026 »). */
  verifiedAt: string | null
  /** Carte marquée « à revérifier » après une mise à jour PUBG (« À revérifier depuis le 1/10 »). */
  recheckSince: string | null
  /** Points validés encore à confirmer depuis cette date. */
  toConfirm: number
}

export type ResourceMapResponse = {
  map: { key: string; label: string; sizeMeters: number }
  state: ResourceMapState
  /** Validés pour tous ; en attente : ceux du lecteur, ou tous pour un SuperUser. */
  points: ResourcePointView[]
  observed: {
    /** Parties analysées sur cette carte dans la fenêtre d'agrégation. */
    analysedMatches: number
    windowDays: number
    computedAt: string | null
    /** Emplacements au-dessus des seuils d'affichage. */
    spots: ObservedSpotView[]
  }
  counts: {
    observed: Record<ObservedFamily, number>
    points: Record<ResourcePointKind, number>
  }
  viewer: {
    signedIn: boolean
    isSuperUser: boolean
    /** Points et signalements validés du lecteur. */
    validatedCount: number
    /** SuperUser : éléments en attente dans la file (pastille de l'onglet Validation). */
    queueCount: number | null
  }
}

export type ResourceDropZoneCenter = { name: string; x: number; y: number; landings: number }

export type ResourceDropZonesResponse = {
  clanId: number
  map: string
  /** Les trois zones de drop les plus fréquentes du clan sur cette carte. */
  centers: ResourceDropZoneCenter[]
  radiusMeters: number
}

export type ResourceProposalResponse = { point: ResourcePointView; validatedCount: number }
export type ResourceReportResponse = { ok: true; validatedCount: number }

// --- SuperUser -------------------------------------------------------------------------------------------------------

export type ResourceQueueItem = {
  /** Clé stable de la ligne : `point:<pointId>` (proposition) ou `report:<pointId>:<kind>` (signalements regroupés). */
  id: string
  type: 'proposal' | 'report'
  map: string
  mapLabel: string
  pointId: string
  /** Type du point concerné (pour un signalement « mauvais type » : le type actuel). */
  kind: ResourcePointKind
  reportKind: ResourceReportKind | null
  /** Situation actuelle (absente pour une nouvelle proposition) et situation demandée (absente pour « n'existe plus »). */
  before: { x: number; y: number; kind: ResourcePointKind; grid: string } | null
  after: { x: number; y: number; kind: ResourcePointKind; grid: string } | null
  /** Joueurs à l'origine (« Nyx, Vexa et Lemon »), le premier avec son nombre de points validés. */
  authors: ResourceContributor[]
  comments: string[]
  createdAt: string
  /** Identifiants regroupés (propositions : un seul point ; signalements : tous ceux de la ligne). */
  reportIds: string[]
}

export type ResourceMapSummary = {
  key: string
  label: string
  validatedPoints: number
  verifiedAt: string | null
  recheckSince: string | null
}

export type ResourceQueueResponse = { items: ResourceQueueItem[]; maps: ResourceMapSummary[]; pendingCount: number }

export type ResourceDecision = 'validate' | 'refuse' | 'edit'

export type ResourceDecisionInput = {
  itemId: string
  decision: ResourceDecision
  /** `edit` : type et/ou position corrigés, puis validation (« Enregistrer et valider »). */
  kind?: string
  x?: number
  y?: number
}

export type ResourceDecisionsResponse = {
  results: Array<{ itemId: string; ok: boolean; actionId: string | null; error: string | null }>
  pendingCount: number
}

export type ResourceHistoryEntry = {
  id: string
  at: string
  actor: string
  /** Verbe et objet (« a validé », « Station-service · F-L »). */
  verb: string
  object: string
  /** Seconde ligne (« Proposée par Vexa », « 2 signalements regroupés »). */
  detail: string | null
  mapLabel: string
  undoable: boolean
  undoneAt: string | null
}

export type ResourceHistoryResponse = { entries: ResourceHistoryEntry[]; page: number; pageCount: number; total: number; windowDays: number }

export const RESOURCE_HISTORY_PAGE_SIZE = 7
export const RESOURCE_HISTORY_WINDOW_DAYS = 30
