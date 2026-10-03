'use client'

import { useParams } from 'next/navigation'

import { MatchDebriefView } from '@/components/telemetry/MatchDebriefView'

export default function MatchTacticalDebriefPage() {
  const params = useParams()

  const clanId = params.clanId ? String(params.clanId) : ''
  const matchId = params.matchId ? String(params.matchId) : ''
  if (!clanId || !matchId) return null

  return <MatchDebriefView context={{ kind: 'clan', clanId }} matchId={matchId} />
}
