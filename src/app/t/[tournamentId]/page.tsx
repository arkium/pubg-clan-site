import { notFound, redirect } from 'next/navigation'

import { tournamentShortLinkExists } from '@/lib/short-link-resolution'

/** Lien court d'un tournoi, `/t/<tournoi>` (docs/TODO/url-masking.md §4.A) : redirection (307) vers sa page. */
export default async function ShortTournamentLinkPage({ params }: { params: Promise<{ tournamentId: string }> }) {
  const { tournamentId } = await params
  if (!(await tournamentShortLinkExists(tournamentId))) notFound()
  redirect(`/tournaments/${tournamentId}`)
}
