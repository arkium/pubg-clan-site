import type { Prisma } from '@prisma/client'

// Pure — pas de dépendance server-only, importable côté client (page
// /clans/[clanId]/stats/opponents) comme côté serveur (routes API).
// Une seule source pour dériver le statut de résolution, afin que le panneau
// SuperUser global (comptages) et l'API par clan (par ligne) ne divergent
// jamais sur ce qui compte comme "en attente" / "échec" / etc.

export type EncounteredPlayerResolutionStatus =
  | 'below_threshold'
  | 'never_attempted'
  | 'retry_pending'
  | 'failed'
  | 'resolved_with_clan'
  | 'resolved_without_clan'

export type EncounteredPlayerResolutionThresholds = {
  minEncounters: number
  maxAttempts: number
}

export type EncounteredPlayerStatusRow = {
  encounterCount: number
  clanResolvedAt: Date | string | null
  resolveAttempts: number
  pubgClanTag: string | null
}

export function deriveEncounteredPlayerStatus(
  row: EncounteredPlayerStatusRow,
  thresholds: EncounteredPlayerResolutionThresholds
): EncounteredPlayerResolutionStatus {
  if (row.clanResolvedAt !== null) {
    return row.pubgClanTag ? 'resolved_with_clan' : 'resolved_without_clan'
  }

  if (row.encounterCount < thresholds.minEncounters) {
    return 'below_threshold'
  }

  if (row.resolveAttempts === 0) {
    return 'never_attempted'
  }

  if (row.resolveAttempts < thresholds.maxAttempts) {
    return 'retry_pending'
  }

  return 'failed'
}

// Statut d'une identité globale `Player` (fin d'EncounteredPlayer, étape 3) : `encounterCount` y est le total tous
// clans, et « avec clan » se lit sur `opponentClanId` — aucun `OpponentClan` n'est sans tag (mesuré le 2026-10-21),
// c'est donc la même règle que le tag affiché par la page Adversaires.
export type PlayerStatusRow = {
  encounterCount: number
  clanResolvedAt: Date | string | null
  resolveAttempts: number
  opponentClanId: string | null
}

export function derivePlayerResolutionStatus(
  row: PlayerStatusRow,
  thresholds: EncounteredPlayerResolutionThresholds
): EncounteredPlayerResolutionStatus {
  return deriveEncounteredPlayerStatus(
    {
      encounterCount: row.encounterCount,
      clanResolvedAt: row.clanResolvedAt,
      resolveAttempts: row.resolveAttempts,
      pubgClanTag: row.opponentClanId,
    },
    thresholds
  )
}

// Where-clause équivalent à derivePlayerResolutionStatus, pour compter et filtrer les joueurs par statut côté DB
// (panneau SuperUser, Triage) sans charger chaque ligne en mémoire pour la reclasser. Chaque statut exige au moins
// une rencontre : les lignes `Player` des seuls membres suivis, jamais croisés, ne sont pas des joueurs à trier.
export function buildPlayerStatusWhereClause(
  status: EncounteredPlayerResolutionStatus,
  thresholds: EncounteredPlayerResolutionThresholds
): Prisma.PlayerWhereInput {
  switch (status) {
    case 'resolved_with_clan':
      return { clanResolvedAt: { not: null }, opponentClanId: { not: null }, encounterCount: { gt: 0 } }
    case 'resolved_without_clan':
      return { clanResolvedAt: { not: null }, opponentClanId: null, encounterCount: { gt: 0 } }
    case 'below_threshold':
      return { clanResolvedAt: null, encounterCount: { gt: 0, lt: thresholds.minEncounters } }
    case 'never_attempted':
      return {
        clanResolvedAt: null,
        encounterCount: { gte: thresholds.minEncounters },
        resolveAttempts: 0,
      }
    case 'retry_pending':
      return {
        clanResolvedAt: null,
        encounterCount: { gte: thresholds.minEncounters },
        resolveAttempts: { gt: 0, lt: thresholds.maxAttempts },
      }
    case 'failed':
      return {
        clanResolvedAt: null,
        encounterCount: { gte: thresholds.minEncounters },
        resolveAttempts: { gte: thresholds.maxAttempts },
      }
  }
}

const UNRESOLVED_STATUSES: EncounteredPlayerResolutionStatus[] = ['below_threshold', 'never_attempted', 'retry_pending', 'failed']
const QUEUE_STATUSES: EncounteredPlayerResolutionStatus[] = ['never_attempted', 'retry_pending', 'failed']

// Plusieurs statuts en une clause compacte. Un `OR` de branches détaillées fait renoncer MariaDB aux index de `Player`
// (comptage de la file en 3 s au lieu de 0,8 s, liste de tous les statuts en 13 s — mesuré le 2026-10-21) : les
// ensembles usuels se réduisent à une ou deux conditions indexables — la file à traiter à « non résolu, au moins
// `minEncounters` rencontres », tous les statuts à « au moins une rencontre ».
export function buildPlayerStatusesWhere(
  statuses: EncounteredPlayerResolutionStatus[],
  thresholds: EncounteredPlayerResolutionThresholds
): Prisma.PlayerWhereInput {
  const selected = new Set(statuses)
  const branches: Prisma.PlayerWhereInput[] = []

  if (QUEUE_STATUSES.every((status) => selected.has(status))) {
    branches.push(
      selected.has('below_threshold')
        ? { clanResolvedAt: null, encounterCount: { gt: 0 } }
        : { clanResolvedAt: null, encounterCount: { gte: thresholds.minEncounters } }
    )
  } else {
    for (const status of UNRESOLVED_STATUSES) {
      if (selected.has(status)) branches.push(buildPlayerStatusWhereClause(status, thresholds))
    }
  }

  if (selected.has('resolved_with_clan') && selected.has('resolved_without_clan')) {
    branches.push({ clanResolvedAt: { not: null }, encounterCount: { gt: 0 } })
  } else if (selected.has('resolved_with_clan')) {
    branches.push(buildPlayerStatusWhereClause('resolved_with_clan', thresholds))
  } else if (selected.has('resolved_without_clan')) {
    branches.push(buildPlayerStatusWhereClause('resolved_without_clan', thresholds))
  }

  const everything = UNRESOLVED_STATUSES.every((status) => selected.has(status)) && selected.has('resolved_with_clan') && selected.has('resolved_without_clan')
  if (everything || branches.length === 0) return { encounterCount: { gt: 0 } }
  return branches.length === 1 ? branches[0] : { OR: branches }
}
