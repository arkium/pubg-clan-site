'use client'

import { useParams, useSearchParams } from 'next/navigation'

import { MatchDebriefView } from '@/components/telemetry/MatchDebriefView'

export default function MatchTacticalDebriefPage() {
  const params = useParams()
  const searchParams = useSearchParams()

  const clanId = params.clanId ? String(params.clanId) : ''
  const matchId = params.matchId ? String(params.matchId) : ''
  if (!clanId || !matchId) return null

  return (
    <MatchDebriefView
      context={{ kind: 'clan', clanId }}
      matchId={matchId}
      period={searchParams.get('period') === 'month' ? 'month' : 'week'}
      fromDate={searchParams.get('fromDate')}
    />
  )
}
