import { redirect } from 'next/navigation'

import { matchDebriefPath } from '@/lib/match-links'

/**
 * Ancienne page de télémétrie d'un match, remplacée par le débriefing le 2026-09-16.
 * Gardée en redirection : des liens déjà publiés (messages Discord Top 1, favoris) pointent encore ici.
 */
export default async function LegacyClanMatchTelemetryPage({
  params,
}: {
  params: Promise<{ clanId: string; matchId: string }>
}) {
  const { clanId, matchId } = await params
  redirect(matchDebriefPath(clanId, matchId))
}
