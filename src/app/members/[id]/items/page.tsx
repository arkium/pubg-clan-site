'use client'

import { Pill } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import ItemUsePanel from '@/components/telemetry/ItemUsePanel'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import type { ItemUsePeriod, ItemUseStats } from '@/lib/item-use-stats'

function parseMemberId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export default function MemberItemUsePage() {
  const params = useParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])
  const { clanId } = useSelectedClan()

  const [period, setPeriod] = useState<ItemUsePeriod>('all')
  const [stats, setStats] = useState<ItemUseStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!memberId) return
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setError('')
        const response = await fetch(`/api/members/${memberId}/item-use?period=${period}`, { cache: 'no-store' })
        const payload = (await response.json()) as { data?: ItemUseStats; error?: string }
        if (cancelled) return
        if (!response.ok || !payload.data) {
          setStats(null)
          setError(payload.error ?? 'Chargement impossible.')
          return
        }
        setStats(payload.data)
      } catch {
        if (!cancelled) {
          setStats(null)
          setError('Chargement impossible.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [memberId, period])

  if (!memberId) {
    return (
      <main className="app-container app-main">
        <p className="text-sm text-red-600">Membre invalide.</p>
      </main>
    )
  }

  return (
    <main className="app-container app-main">
      <NavigationTrail
        currentLabel="Objets consommés"
        currentHref={`/members/${memberId}/items`}
        fallbackParent={
          clanId
            ? { href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }
            : { href: '/members', label: 'Membres' }
        }
      />

      <header className="app-panel mb-5 flex flex-wrap items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
          <Pill className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-gray-900">Objets consommés</h1>
          <p className="mt-1 text-sm text-gray-600">
            Soins, boosts, carburant et gadgets utilisés en match, détaillés objet par objet.
          </p>
        </div>
      </header>

      <ItemUsePanel
        stats={stats}
        loading={loading}
        error={error}
        period={period}
        onPeriodChange={setPeriod}
        scope="member"
      />
    </main>
  )
}
