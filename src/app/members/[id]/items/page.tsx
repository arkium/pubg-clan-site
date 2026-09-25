'use client'

import { Pill } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import ItemUsePanel from '@/components/telemetry/ItemUsePanel'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import PeriodFilter from '@/components/ui/PeriodFilter'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import type { ItemUseStats } from '@/lib/item-use-stats'
import { STANDARD_PERIODS } from '@/lib/period'

function parseMemberId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export default function MemberItemUsePage() {
  const params = useParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])
  const { clanId } = useSelectedClan()

  // Période de la page : URL, puis mémoire de la visite, puis « Tous » (docs/TODO/sticky.md §4.E).
  const { period, setPeriod, ready: periodReady } = usePagePeriod(STANDARD_PERIODS, 'all')
  const [stats, setStats] = useState<ItemUseStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!memberId || !periodReady) return
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
  }, [memberId, period, periodReady])

  if (!memberId) {
    return (
      <div className="app-container app-main flex-1">
        <p className="text-sm text-red-600">Membre invalide.</p>
      </div>
    )
  }

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    <div className="app-main-flush flex-1">
      <div className="app-container app-gutter">
        <NavigationTrail
          currentLabel="Objets consommés"
          currentHref={`/members/${memberId}/items`}
          fallbackParent={
            clanId
              ? { href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }
              : { href: '/members', label: 'Membres' }
          }
        />

        <header className="app-panel flex flex-wrap items-start gap-3 p-4">
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
      </div>

      <DockingToolbar ariaLabel="Période des objets consommés du joueur">
        <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} />
      </DockingToolbar>

      <div className="app-container app-gutter">
        <ItemUsePanel stats={stats} loading={loading} error={error} scope="member" />
      </div>
    </div>
  )
}
