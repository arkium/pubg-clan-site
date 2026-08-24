'use client'

import { Swords } from 'lucide-react'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

import SegmentedControl from '@/components/ui/SegmentedControl'
import TeamModeBadge from '@/components/ui/TeamModeBadge'
import ClanComparatorRadar from '@/components/comparator/ClanComparatorRadar'
import HeadToHeadCard from '@/components/comparator/HeadToHeadCard'
import ModePerformancesCard from '@/components/comparator/ModePerformancesCard'
import ClanActivityHeatmap from '@/components/comparator/ClanActivityHeatmap'
import { Skeleton } from '@/components/ui/Skeleton'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { useClanComparator, type ClanComparatorEntry } from '@/hooks/useClanComparator'
import type { SquadPeriod } from '@/types/squad-matches'

const MAX_CLANS = 3

type ComparablePeriod = 'week' | 'month' | 'all'

type ClanSummary = {
  id: number
  name: string
  tag: string
}

function parsePeriod(value: string | null): ComparablePeriod {
  if (value === 'month' || value === 'all') return value
  return 'week'
}

function parseClanIds(value: string | null): number[] {
  if (!value) return []
  return Array.from(
    new Set(
      value
        .split(',')
        .map((v) => Number(v.trim()))
        .filter((v) => Number.isInteger(v) && v > 0)
    )
  ).slice(0, MAX_CLANS)
}

function formatPercent(value: number | undefined): string {
  if (value === undefined) return '—'
  return `${(value * 100).toFixed(1)} %`
}

function formatNumber(value: number | undefined): string {
  if (value === undefined) return '—'
  return value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })
}

function formatMinutes(value: number | undefined): string {
  if (value === undefined) return '—'
  return `${Math.round(value / 60)} min`
}

function ComparatorContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [clans, setClans] = useState<ClanSummary[]>([])
  const [clansLoading, setClansLoading] = useState(true)
  const [clansError, setClansError] = useState('')

  const selectedClanIds = useMemo(() => parseClanIds(searchParams.get('clanIds')), [searchParams])
  const period = parsePeriod(searchParams.get('period'))

  const { clans: comparatorClans, headToHead, loading, error } = useClanComparator(selectedClanIds, period as SquadPeriod)

  useEffect(() => {
    let cancelled = false

    async function loadClans() {
      try {
        setClansLoading(true)
        setClansError('')
        const res = await fetch('/api/clans', { cache: 'no-store' })
        const json = await res.json()

        if (!res.ok) {
          throw new Error(json.error || 'Erreur lors du chargement des clans')
        }

        if (!cancelled) {
          const list = Array.isArray(json) ? json : []
          setClans(
            list
              .filter((c: ClanSummary) => c.name !== 'Ungrouped')
              .map((c: ClanSummary) => ({ id: c.id, name: c.name, tag: c.tag }))
          )
        }
      } catch (err) {
        if (!cancelled) {
          setClansError(err instanceof Error ? err.message : 'Erreur réseau')
        }
      } finally {
        if (!cancelled) {
          setClansLoading(false)
        }
      }
    }

    void loadClans()

    return () => {
      cancelled = true
    }
  }, [])

  const updateParams = useCallback(
    (nextClanIds: number[], nextPeriod: ComparablePeriod) => {
      const params = new URLSearchParams()
      if (nextClanIds.length > 0) {
        params.set('clanIds', nextClanIds.join(','))
      }
      params.set('period', nextPeriod)
      router.replace(`/clans/comparator?${params.toString()}`)
    },
    [router]
  )

  function toggleClan(clanId: number) {
    const isSelected = selectedClanIds.includes(clanId)
    let nextClanIds: number[]
    if (isSelected) {
      nextClanIds = selectedClanIds.filter((id) => id !== clanId)
    } else {
      if (selectedClanIds.length >= MAX_CLANS) return
      nextClanIds = [...selectedClanIds, clanId]
    }
    updateParams(nextClanIds, period)
  }

  function changePeriod(nextPeriod: ComparablePeriod) {
    updateParams(selectedClanIds, nextPeriod)
  }

  const clanByIndex = (id: number): ClanComparatorEntry | undefined =>
    comparatorClans.find((c) => c.clanId === id)

  return (
    <main className="app-container app-main flex-1 space-y-4">
      <header
        className="relative mb-6 min-h-[10rem] overflow-hidden rounded-2xl bg-cover bg-no-repeat sm:min-h-[13rem]"
        style={{ backgroundImage: `url('/comparateurclans.jpg')`, backgroundPosition: 'center 20%' }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 z-10 px-3 py-2.5 sm:px-5 sm:py-4">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Swords className="h-4 w-4 text-red-400 sm:h-6 sm:w-6" aria-hidden="true" />
            <h1 className="text-sm font-bold tracking-tight text-white drop-shadow-md sm:text-xl md:text-2xl">Comparateur de clans</h1>
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-gray-200 drop-shadow-md sm:mt-1 sm:text-sm">
            Compare l&apos;activité, le style de jeu et les performances de jusqu&apos;à {MAX_CLANS} clans suivis.
          </p>
        </div>
      </header>

      <section className="app-panel overflow-hidden mb-6 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--theme-ui-text-muted)]">
              Clans ({selectedClanIds.length}/{MAX_CLANS})
            </p>
            {clansLoading ? (
              <Skeleton className="h-6 w-48" />
            ) : clansError ? (
              <p className="text-sm text-red-600">{clansError}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {clans.map((clan) => {
                  const isSelected = selectedClanIds.includes(clan.id)
                  const disabled = !isSelected && selectedClanIds.length >= MAX_CLANS
                  return (
                    <button
                      key={clan.id}
                      type="button"
                      onClick={() => toggleClan(clan.id)}
                      disabled={disabled}
                      className={[
                        'rounded-full border px-3 py-1.5 text-sm font-medium transition',
                        isSelected
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : disabled
                            ? 'cursor-not-allowed border-gray-200 text-gray-400 opacity-50'
                            : 'border-gray-200 text-gray-700 hover:bg-gray-50',
                      ].join(' ')}
                    >
                      {clan.name} [{clan.tag}]
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <SegmentedControl
            options={[
              { value: 'week', label: 'Semaine' },
              { value: 'month', label: 'Mois' },
              { value: 'all', label: 'Tous' },
            ]}
            value={period}
            onChange={(value) => changePeriod(value as ComparablePeriod)}
          />
        </div>
      </section>

      {selectedClanIds.length === 0 ? (
        <section className="app-panel p-6 text-sm text-[var(--theme-ui-text-muted)]">
          Sélectionne au moins un clan ci-dessus pour démarrer la comparaison.
        </section>
      ) : loading ? (
        <CardSkeleton />
      ) : error ? (
        <section className="app-panel p-6 text-sm text-red-600">{error}</section>
      ) : (
        <div className="flex flex-col gap-6">
          <ClanComparatorRadar clans={comparatorClans} />

          <section className="app-panel overflow-hidden p-4 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-[var(--theme-ui-text)]">Performances globales</h2>
            
            {/* Mobile layout (Cards) */}
            <div className="flex flex-col gap-4 sm:hidden">
              {selectedClanIds.map((id) => {
                const clan = clanByIndex(id)
                if (!clan) return null
                return (
                  <div key={id} className="rounded-xl border border-[var(--theme-ui-border)] p-4 flex flex-col gap-3">
                    <div className="font-semibold text-[var(--theme-ui-text)] text-base border-b border-[var(--theme-ui-border)] pb-2">
                      <Link href={`/clans/${clan.clanId}/overview`} className="hover:text-emerald-500 transition-colors">
                        {clan.clanName} [{clan.clanTag}]
                      </Link>
                    </div>
                    <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm">
                      <div>
                        <div className="text-[var(--theme-ui-text-muted)] text-xs mb-0.5">Matchs</div>
                        <div className="font-medium text-[var(--theme-ui-text-secondary)]">{formatNumber(clan.performance?.matchCount)}</div>
                      </div>
                      <div>
                        <div className="text-[var(--theme-ui-text-muted)] text-xs mb-0.5">Winrate</div>
                        <div className="font-medium text-[var(--theme-ui-text-secondary)]">{formatPercent(clan.performance?.winRate)}</div>
                      </div>
                      <div>
                        <div className="text-[var(--theme-ui-text-muted)] text-xs mb-0.5">Top 10</div>
                        <div className="font-medium text-[var(--theme-ui-text-secondary)]">{formatPercent(clan.performance?.top10Rate)}</div>
                      </div>
                      <div>
                        <div className="text-[var(--theme-ui-text-muted)] text-xs mb-0.5">Dégâts/match</div>
                        <div className="font-medium text-[var(--theme-ui-text-secondary)]">{formatNumber(clan.performance?.avgDamagePerMatch)}</div>
                      </div>
                      <div>
                        <div className="text-[var(--theme-ui-text-muted)] text-xs mb-0.5">Kills/match</div>
                        <div className="font-medium text-[var(--theme-ui-text-secondary)]">{clan.performance?.avgKillsPerMatch?.toFixed(1) ?? '-'}</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop/Tablet layout (Table) */}
            <div className="hidden sm:block w-full overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--theme-ui-text-muted)]">
                    <th className="pb-2 font-medium whitespace-nowrap">Clan</th>
                    <th className="pb-2 text-right font-medium whitespace-nowrap">Matchs</th>
                    <th className="pb-2 text-right font-medium whitespace-nowrap">Winrate</th>
                    <th className="pb-2 text-right font-medium whitespace-nowrap">Top 10</th>
                    <th className="pb-2 text-right font-medium whitespace-nowrap">Dégâts/match</th>
                    <th className="pb-2 text-right font-medium whitespace-nowrap">Kills/match</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--theme-ui-border)]">
                  {selectedClanIds.map((id) => {
                    const clan = clanByIndex(id)
                    if (!clan) return null
                    return (
                      <tr key={id}>
                        <td className="py-2 font-semibold text-[var(--theme-ui-text)]">
                          <Link href={`/clans/${clan.clanId}/overview`} className="hover:text-emerald-500 transition-colors">
                            {clan.clanName} [{clan.clanTag}]
                          </Link>
                        </td>
                        <td className="py-2 text-right text-[var(--theme-ui-text-secondary)] whitespace-nowrap">
                          {formatNumber(clan.performance?.matchCount)}
                        </td>
                        <td className="py-2 text-right text-[var(--theme-ui-text-secondary)] whitespace-nowrap">
                          {formatPercent(clan.performance?.winRate)}
                        </td>
                        <td className="py-2 text-right text-[var(--theme-ui-text-secondary)] whitespace-nowrap">
                          {formatPercent(clan.performance?.top10Rate)}
                        </td>
                        <td className="py-2 text-right text-[var(--theme-ui-text-secondary)] whitespace-nowrap">
                          {formatNumber(clan.performance?.avgDamagePerMatch)}
                        </td>
                        <td className="py-2 text-right text-[var(--theme-ui-text-secondary)] whitespace-nowrap">
                          {clan.performance?.avgKillsPerMatch?.toFixed(1) ?? '-'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {selectedClanIds.length >= 2 ? (
            <section className="app-panel overflow-hidden p-4 sm:p-6">
              <h2 className="mb-1 text-lg font-semibold text-[var(--theme-ui-text)]">Le &laquo; Derby &raquo; — Head-to-Head</h2>
              <p className="mb-4 text-xs text-[var(--theme-ui-text-muted)]">
                Confrontations directes entre clans suivis ayant partagé le même lobby PUBG, toutes périodes confondues —
                le filtre de période ci-dessus ne s&apos;applique pas à cette section.
              </p>
              <div className="space-y-4">
                {headToHead.map((h2h) => {
                  const clanA = clanByIndex(h2h.clanIdA)
                  const clanB = clanByIndex(h2h.clanIdB)
                  if (!clanA || !clanB) return null
                  return (
                    <HeadToHeadCard
                      key={`${h2h.clanIdA}-${h2h.clanIdB}`}
                      h2h={h2h}
                      clanA={clanA}
                      clanB={clanB}
                    />
                  )
                })}
              </div>
            </section>
          ) : null}

          <section className="app-panel overflow-hidden p-4 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-[var(--theme-ui-text)]">Performances par mode</h2>
            <p className="mb-4 text-xs text-[var(--theme-ui-text-muted)]">
              Comparez les performances des clans selon la taille de l&apos;escouade. Repérez d&apos;un coup d&apos;œil les spécialistes de chaque mode, comparez leur efficacité (Winrate, Kills) et identifiez les clans qui privilégient le jeu en équipe complète (Squad) grâce à l&apos;indicateur de spécialisation.
            </p>
              <ModePerformancesCard clans={selectedClanIds.map((id) => clanByIndex(id)!).filter(Boolean)} />
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="app-panel overflow-hidden p-4 sm:p-6">
              <h2 className="mb-4 text-lg font-semibold text-[var(--theme-ui-text)]">
                Le &laquo; Pouls &raquo; — Activité et rythme
              </h2>
              <div className="space-y-3">
                {selectedClanIds.map((id) => {
                  const clan = clanByIndex(id)
                  if (!clan) return null
                  const dist = clan.pulse?.squadSizeDistribution
                  const total = dist ? dist.solo + dist.duo + dist.trio + dist.squad : 0
                  return (
                    <article key={id} className="app-panel-muted rounded-xl p-3">
                      <p className="mb-2 text-sm font-semibold text-[var(--theme-ui-text)]">
                        {clan.clanName} [{clan.clanTag}]
                      </p>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--theme-ui-text-secondary)]">
                        <dt>Roster actif</dt>
                        <dd className="text-right font-medium text-[var(--theme-ui-text)]">
                          {clan.pulse?.rosterHealth.activeMembers ?? '—'} / {clan.pulse?.rosterHealth.totalMembers ?? '—'} (
                          {formatPercent(clan.pulse?.rosterHealth.participationRate)})
                        </dd>
                        <dt>Répartition duo/trio/squad</dt>
                        <dd className="text-right font-medium text-[var(--theme-ui-text)]">
                          {total > 0 && dist
                            ? `${Math.round((dist.duo / total) * 100)} / ${Math.round((dist.trio / total) * 100)} / ${Math.round((dist.squad / total) * 100)} %`
                            : '—'}
                        </dd>
                        <dt>Jours avec matchs</dt>
                        <dd className="text-right font-medium text-[var(--theme-ui-text)]">
                          {clan.pulse?.dailyMatchCounts.length ?? '—'}
                        </dd>
                      </dl>
                    </article>
                  )
                })}
              </div>
            </section>

            <section className="app-panel overflow-hidden p-4 sm:p-6">
              <h2 className="mb-4 text-lg font-semibold text-[var(--theme-ui-text)]">
                Le &laquo; ADN &raquo; — Style de jeu
              </h2>
              <div className="space-y-3">
                {selectedClanIds.map((id) => {
                  const clan = clanByIndex(id)
                  if (!clan) return null
                  return (
                    <article key={id} className="app-panel-muted rounded-xl p-3">
                      <p className="mb-2 text-sm font-semibold text-[var(--theme-ui-text)]">
                        {clan.clanName} [{clan.clanTag}]
                      </p>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--theme-ui-text-secondary)]">
                        <dt>Hot drop</dt>
                        <dd className="text-right font-medium text-[var(--theme-ui-text)]">
                          {clan.dna?.hotDropSharePercent !== undefined
                            ? `${clan.dna.hotDropSharePercent.toFixed(1)} %`
                            : '—'}
                        </dd>
                        <dt>Survie moyenne</dt>
                        <dd className="text-right font-medium text-[var(--theme-ui-text)]">
                          {formatMinutes(clan.dna?.avgTimeSurvivedSeconds)}
                        </dd>
                        <dt>Revives / KO subis</dt>
                        <dd className="text-right font-medium text-[var(--theme-ui-text)]">
                          {clan.dna?.teamplayRatio !== null && clan.dna?.teamplayRatio !== undefined
                            ? clan.dna.teamplayRatio.toFixed(2)
                            : '—'}
                        </dd>
                      </dl>
                    </article>
                  )
                })}
              </div>
            </section>
          </div>

          <section className="app-panel overflow-hidden p-4 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-[var(--theme-ui-text)]">Heatmap d'activité (Punchcard)</h2>
            <ClanActivityHeatmap clans={selectedClanIds.map((id) => clanByIndex(id)!).filter(Boolean)} />
          </section>
        </div>
      )}
    </main>
  )
}

export default function ClanComparatorPage() {
  return (
    <Suspense fallback={<main className="app-container app-main"><CardSkeleton /></main>}>
      <ComparatorContent />
    </Suspense>
  )
}
