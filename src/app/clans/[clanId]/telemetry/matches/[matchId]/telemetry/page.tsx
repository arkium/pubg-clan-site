import { redirect } from 'next/navigation'

import { matchDebriefPath } from '@/lib/match-links'

/**
 * Ancienne vue d'audit technique d'un match (sorties du parser, JSON brut, resync et import d'un fichier), supprimée le
 * 2026-10-23 : le débriefing et son Replay 2D la remplacent pour la lecture, la page Soirées des données du clan
 * (SuperUser) pour l'état de la télémétrie et la resynchronisation. Gardée en redirection pour les liens déjà ouverts,
 * période et date de la liste d'origine comprises.
 */
export default async function LegacyMatchTelemetryAuditPage({
  params,
  searchParams,
}: {
  params: Promise<{ clanId: string; matchId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ clanId, matchId }, query] = await Promise.all([params, searchParams])
  redirect(
    matchDebriefPath(clanId, matchId, {
      period: typeof query.period === 'string' ? query.period : undefined,
      fromDate: typeof query.fromDate === 'string' ? query.fromDate : undefined,
    })
  )
}
