'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import SegmentedControl from '@/components/ui/SegmentedControl'
import TeamModeBadge from '@/components/ui/TeamModeBadge'
import ClanComparatorRadar from '@/components/comparator/ClanComparatorRadar'
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
          setClans(Array.isArray(json) ? json.map((c: ClanSummary) => ({ id: c.id, name: c.name, tag: c.tag })) : [])
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
    <main className="app-container app-main">
      <header className="app-panel mb-6 px-6 py-4">
        <h1 className="text-xl font-bold text-[var(--theme-ui-text)]">Comparateur de clans</h1>
        <p className="mt-1 text-sm text-[var(--theme-ui-text-secondary)]">
          Compare l&apos;activité, le style de jeu et les performances de jusqu&apos;à {MAX_CLANS} clans suivis sur le site.
        </p>
      </header>

      <section className="app-panel mb-6 p-4 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--theme-ui-text-muted)]">
              Clans ({selectedClanIds.length}/{MAX_CLANS})
            </p>
            {clansLoading ? (
              <p className="text-sm text-[var(--theme-ui-text-muted)]">Chargement des clans...</p>
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
        <section className="app-panel p-6 text-sm text-[var(--theme-ui-text-muted)]">Chargement...</section>
      ) : error ? (
        <section className="app-panel p-6 text-sm text-red-600">{error}</section>
      ) : (
        <div className="flex flex-col gap-6">
          <ClanComparatorRadar clans={comparatorClans} />

          <section className="app-panel p-4 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-[var(--theme-ui-text)]">Performances globales</h2>
            <div className="w-full overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[var(--theme-ui-text-muted)]">
                    <th className="pb-2 font-medium">Clan</th>
                    <th className="pb-2 text-right font-medium">Matchs</th>
                    <th className="pb-2 text-right font-medium">Winrate</th>
                    <th className="pb-2 text-right font-medium">Top 10</th>
                    <th className="pb-2 text-right font-medium">Dégâts/match</th>
                    <th className="pb-2 text-right font-medium">Kills/match</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--theme-ui-border)]">
                  {selectedClanIds.map((id) => {
                    const clan = clanByIndex(id)
                    if (!clan) return null
                    return (
                      <tr key={id}>
                        <td className="py-2 font-semibold text-[var(--theme-ui-text)]">
                          {clan.clanName} [{clan.clanTag}]
                        </td>
                        <td className="py-2 text-right text-[var(--theme-ui-text-secondary)]">
                          {formatNumber(clan.performance?.matchCount)}
                        </td>
                        <td className="py-2 text-right text-[var(--theme-ui-text-secondary)]">
                          {formatPercent(clan.performance?.winRate)}
                        </td>
                        <td className="py-2 text-right text-[var(--theme-ui-text-secondary)]">
                          {formatPercent(clan.performance?.top10Rate)}
                        </td>
                        <td className="py-2 text-right text-[var(--theme-ui-text-secondary)]">
                          {formatNumber(clan.performance?.avgDamagePerMatch)}
                        </td>
                        <td className="py-2 text-right text-[var(--theme-ui-text-secondary)]">
                          {clan.performance?.avgKillsPerMatch?.toFixed(1) ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {selectedClanIds.length >= 2 ? (
            <section className="app-panel p-4 sm:p-6">
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
                    <article key={`${h2h.clanIdA}-${h2h.clanIdB}`} className="app-panel-muted rounded-xl p-3">
                      <p className="mb-2 text-sm font-semibold text-[var(--theme-ui-text)]">
                        {clanA.clanTag} vs {clanB.clanTag}
                      </p>
                      {h2h.commonMatchCount === 0 ? (
                        <p className="text-xs text-[var(--theme-ui-text-muted)]">
                          Aucun match commun trouvé entre ces deux clans pour l&apos;instant.
                        </p>
                      ) : (
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--theme-ui-text-secondary)] sm:grid-cols-4">
                          <dt>Matchs communs</dt>
                          <dd className="text-right font-medium text-[var(--theme-ui-text)] sm:text-left">
                            {h2h.commonMatchCount}
                          </dd>
                          <dt>Meilleur placement</dt>
                          <dd className="text-right font-medium text-[var(--theme-ui-text)] sm:text-left">
                            {clanA.clanTag} {h2h.matchesWonByA} — {h2h.matchesWonByB} {clanB.clanTag}
                            {h2h.ties > 0 ? ` (${h2h.ties} égalité${h2h.ties > 1 ? 's' : ''})` : ''}
                          </dd>
                          <dt>Kills {clanA.clanTag} → {clanB.clanTag}</dt>
                          <dd className="text-right font-medium text-[var(--theme-ui-text)] sm:text-left">
                            {h2h.killsAOnB}
                          </dd>
                          <dt>Kills {clanB.clanTag} → {clanA.clanTag}</dt>
                          <dd className="text-right font-medium text-[var(--theme-ui-text)] sm:text-left">
                            {h2h.killsBOnA}
                          </dd>
                        </dl>
                      )}
                    </article>
                  )
                })}
              </div>
            </section>
          ) : null}

          <section className="app-panel p-4 sm:p-6">
            <h2 className="mb-4 text-lg font-semibold text-[var(--theme-ui-text)]">Performances par mode</h2>
            <p className="mb-4 text-xs text-[var(--theme-ui-text-muted)]">
              Répartition duo/trio/squad et winrate par mode — une part élevée de squad complète et un winrate homogène
              entre modes indique un clan qui joue surtout ensemble plutôt qu&apos;en solo/petits groupes ad hoc.
            </p>
            <div className="space-y-4">
              {selectedClanIds.map((id) => {
                const clan = clanByIndex(id)
                const modePerformance = clan?.pulse?.modePerformance
                if (!clan || !modePerformance) return null
                return (
                  <div key={id}>
                    <p className="mb-2 text-sm font-semibold text-[var(--theme-ui-text)]">
                      {clan.clanName} [{clan.clanTag}]
                    </p>
                    <div className="grid gap-3 md:grid-cols-3">
                      {modePerformance.map((mp) => (
                        <article
                          key={mp.mode}
                          className="app-panel-muted flex items-center justify-between rounded-xl p-3"
                        >
                          <div className="flex items-center gap-3">
                            <TeamModeBadge mode={mp.mode} />
                            <div>
                              <p className="text-sm font-bold text-[var(--theme-ui-text)]">
                                {formatPercent(mp.winRate)} WR
                              </p>
                              <p className="text-xs text-[var(--theme-ui-text-muted)]">{mp.matches} matchs</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold text-[var(--theme-ui-text)]">{formatNumber(mp.totalKills)}</p>
                            <p className="text-xs text-[var(--theme-ui-text-muted)]">kills</p>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="app-panel p-4 sm:p-6">
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

            <section className="app-panel p-4 sm:p-6">
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
        </div>
      )}
    </main>
  )
}

export default function ClanComparatorPage() {
  return (
    <Suspense fallback={<main className="app-container app-main">Chargement...</main>}>
      <ComparatorContent />
    </Suspense>
  )
}
