/**
 * Adresses des vues d'un match (SquadMatch) côté clan.
 *
 * Le débriefing est la vue de lecture pour tous les membres (Replay 2D, Combat Log, duels).
 * La vue d'audit technique reste l'outil de diagnostic du pipeline : état, resync, import, JSON brut.
 * Les anciennes pages `/clans/[clanId]/matches/[matchId]/telemetry` et
 * `/tournaments/[tournamentId]/matches/[matchId]/telemetry` ne doivent plus recevoir de nouveaux liens
 * (voir docs/TODO/todo.md, VOLET 4 — « Bascule vers le débriefing »).
 */

export interface MatchViewContext {
  /** Période de la liste d'origine, reprise par le lien retour de la page. */
  period?: string
  /** Jour du match (AAAA-MM-JJ), repris par le lien retour de la page. */
  fromDate?: string
}

function withContext(path: string, context?: MatchViewContext): string {
  const params = new URLSearchParams()
  if (context?.period) params.set('period', context.period)
  if (context?.fromDate) params.set('fromDate', context.fromDate)
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

function basePath(clanId: number | string, squadMatchId: string): string {
  return `/clans/${clanId}/telemetry/matches/${encodeURIComponent(squadMatchId)}`
}

export function matchDebriefPath(
  clanId: number | string,
  squadMatchId: string,
  context?: MatchViewContext
): string {
  return withContext(`${basePath(clanId, squadMatchId)}/debrief`, context)
}

export function matchTelemetryAuditPath(
  clanId: number | string,
  squadMatchId: string,
  context?: MatchViewContext
): string {
  return withContext(`${basePath(clanId, squadMatchId)}/telemetry`, context)
}
