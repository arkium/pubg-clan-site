import type { Prisma } from '@prisma/client'

// Pure — pas de dépendance server-only, importable côté client (page
// /clans/[clanId]/telemetry/opponents) comme côté serveur (routes API).
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

// Where-clause équivalent à deriveEncounteredPlayerStatus, pour compter les
// lignes par statut côté DB (panneau SuperUser) sans devoir charger chaque
// ligne en mémoire pour la reclasser.
export function buildStatusWhereClause(
  status: EncounteredPlayerResolutionStatus,
  thresholds: EncounteredPlayerResolutionThresholds
): Prisma.EncounteredPlayerWhereInput {
  switch (status) {
    case 'resolved_with_clan':
      return { clanResolvedAt: { not: null }, pubgClanTag: { not: null } }
    case 'resolved_without_clan':
      return { clanResolvedAt: { not: null }, pubgClanTag: null }
    case 'below_threshold':
      return { clanResolvedAt: null, encounterCount: { lt: thresholds.minEncounters } }
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
