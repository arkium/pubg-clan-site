import { useEffect, useState } from 'react'
import type { CachedClanMatchesPayload } from '@/lib/matches-cache-service'
import type { SquadPeriod } from '@/types/squad-matches'

export function useClanMatchesCache(clanId: number | null, period: SquadPeriod) {
  const [data, setData] = useState<{
    period: SquadPeriod
    periodKey: string
    payload: CachedClanMatchesPayload
    computedAt: string
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!clanId) return

    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setError('')
        const res = await fetch(`/api/clans/${clanId}/overview/matches-stats?period=${period}`)
        const json = await res.json()

        if (!res.ok) {
          throw new Error(json.error || 'Erreur lors du chargement des statistiques')
        }

        if (!cancelled) {
          setData(json)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erreur réseau')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [clanId, period])

  return { data, loading, error }
}
