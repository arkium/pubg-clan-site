import { useEffect, useState } from 'react'
import type { ClanComparatorPayload } from '@/lib/clan-comparator-service'
import type { HeadToHeadStats } from '@/lib/head-to-head-service'
import type { SquadPeriod } from '@/types/squad-matches'

export type ClanComparatorEntry = { clanId: number; clanName: string; clanTag: string; computedAt: string | null } & Partial<ClanComparatorPayload>

export function useClanComparator(clanIds: number[], period: SquadPeriod) {
  const [clans, setClans] = useState<ClanComparatorEntry[]>([])
  const [headToHead, setHeadToHead] = useState<HeadToHeadStats[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (clanIds.length === 0) {
      return
    }

    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setError('')
        const res = await fetch(`/api/clans/comparator?clanIds=${clanIds.join(',')}&period=${period}`, {
          cache: 'no-store',
        })
        const json = await res.json()

        if (!res.ok) {
          throw new Error(json.error || 'Erreur lors du chargement du comparateur')
        }

        if (!cancelled) {
          setClans(json.clans ?? [])
          setHeadToHead(json.headToHead ?? [])
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clanIds.join(','), period])

  return {
    clans: clanIds.length === 0 ? [] : clans,
    headToHead: clanIds.length === 0 ? [] : headToHead,
    loading,
    error,
  }
}
