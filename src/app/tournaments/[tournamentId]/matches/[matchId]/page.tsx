'use client'

import { useParams } from 'next/navigation'

import { MatchDebriefView } from '@/components/telemetry/MatchDebriefView'

/** Débriefing d'une manche de tournoi — accessible à tout utilisateur connecté (décision du 2026-09-16). */
export default function TournamentRoundDebriefPage() {
  const params = useParams()

  const tournamentId = params.tournamentId ? String(params.tournamentId) : ''
  const matchId = params.matchId ? String(params.matchId) : ''
  if (!tournamentId || !matchId) return null

  return <MatchDebriefView context={{ kind: 'tournament', tournamentId }} matchId={matchId} />
}
