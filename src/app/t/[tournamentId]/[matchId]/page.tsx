import { notFound, redirect } from 'next/navigation'

import { matchTournamentDebriefPath, matchTournamentReplayPath } from '@/lib/match-links'
import { tournamentShortLinkExists } from '@/lib/short-link-resolution'

/**
 * Lien court d'une manche, `/t/<tournoi>/<match>` (docs/TODO/url-masking.md §4.A) : redirection (307) vers son
 * débriefing en vue tournoi ; `?tab=replay` ouvre le Replay 2D. La page cible vérifie que le match est bien une
 * manche du tournoi.
 */
export default async function ShortTournamentRoundLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ tournamentId: string; matchId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ tournamentId, matchId }, query] = await Promise.all([params, searchParams])
  if (!(await tournamentShortLinkExists(tournamentId, matchId))) notFound()
  redirect(
    query.tab === 'replay'
      ? matchTournamentReplayPath(tournamentId, matchId)
      : matchTournamentDebriefPath(tournamentId, matchId)
  )
}
