import { redirect } from 'next/navigation'

import { matchTournamentDebriefPath } from '@/lib/match-links'

/**
 * Ancienne page de télémétrie d'une manche de tournoi, remplacée le 2026-09-16 par le débriefing en vue
 * tournoi. Gardée en redirection : les résultats de tournoi déjà diffusés sur Discord pointent encore ici
 * (avec un `?clanId=` désormais inutile).
 */
export default async function LegacyTournamentMatchTelemetryPage({
  params,
}: {
  params: Promise<{ tournamentId: string; matchId: string }>
}) {
  const { tournamentId, matchId } = await params
  redirect(matchTournamentDebriefPath(tournamentId, matchId))
}
