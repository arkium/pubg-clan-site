'use client'

import { Swords, Users, HeartPulse, Dna, Calendar } from 'lucide-react'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

import { DockingToolbar } from '@/components/ui/DockingToolbar'
import PeriodFilter from '@/components/ui/PeriodFilter'
import TeamModeBadge from '@/components/ui/TeamModeBadge'
import ClanRosterSelector, { type ClanSummary } from '@/components/comparator/ClanRosterSelector'
import ClanComparatorRadar from '@/components/comparator/ClanComparatorRadar'
import GlobalPerformancesDominance from '@/components/comparator/GlobalPerformancesDominance'
import HeadToHeadCard from '@/components/comparator/HeadToHeadCard'
import ModePerformancesCard from '@/components/comparator/ModePerformancesCard'
import ClanPulseCards from '@/components/comparator/ClanPulseCards'
import ClanDnaCards from '@/components/comparator/ClanDnaCards'
import ClanActivityHeatmap from '@/components/comparator/ClanActivityHeatmap'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { useClanComparator, type ClanComparatorEntry } from '@/hooks/useClanComparator'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { STANDARD_PERIODS, type StandardPeriod } from '@/lib/period'
import type { SquadPeriod } from '@/types/squad-matches'

const MAX_CLANS = 3
const NO_CLANS: number[] = []

type ComparablePeriod = StandardPeriod

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
  // Période de la page : URL, puis mémoire de la visite, puis semaine (docs/TODO/sticky.md §4.E).
  const { period, setPeriod, ready: periodReady } = usePagePeriod(STANDARD_PERIODS, 'week')

  // Rien n'est chargé avant que la période soit résolue : pas de premier appel avec le défaut.
  const comparedClanIds = periodReady ? selectedClanIds : NO_CLANS
  const { clans: comparatorClans, headToHead, loading: comparatorLoading, error } = useClanComparator(
    comparedClanIds,
    period as SquadPeriod
  )
  const loading = comparatorLoading || !periodReady

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
              .filter((c: ClanSummary) => !c.isSystem)
              .map((c: ClanSummary) => ({
                id: c.id,
                name: c.name,
                tag: c.tag,
                platformShard: c.platformShard,
                membersCount: c.membersCount,
                matchesCount: c.matchesCount,
                lastMatchAt: c.lastMatchAt,
                timePlayedSeconds: c.timePlayedSeconds,
                activeDays: c.activeDays,
                imageUrl: c.imageUrl,
              }))
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
      router.replace(`/clans/comparator?${params.toString()}`, { scroll: false })
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

  function clearSelection() {
    updateParams([], period)
  }

  function selectMultiple(clanIds: number[]) {
    updateParams(clanIds.slice(0, MAX_CLANS), period)
  }

  const clanByIndex = (id: number): ClanComparatorEntry | undefined =>
    comparatorClans.find((c) => c.clanId === id)

  const query = searchParams.toString()

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    <div className="app-main-flush flex-1">
      <div className="app-container app-gutter space-y-4">
        {/* Invisible ici : enregistre la sélection courante pour que le retour depuis un match la restaure. */}
        <NavigationTrail
          currentLabel="Comparateur"
          currentHref={query ? `/clans/comparator?${query}` : '/clans/comparator'}
          fallbackParent={null}
          hidden
        />
        <header
          className="relative min-h-[10rem] overflow-hidden rounded-2xl bg-cover bg-no-repeat sm:min-h-[13rem]"
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

        {/* Roster & Battle Arena Selector */}
        <section>
          <ClanRosterSelector
            clans={clans}
            selectedClanIds={selectedClanIds}
            onToggleClan={toggleClan}
            onClearSelection={clearSelection}
            onSelectMultiple={selectMultiple}
            maxClans={MAX_CLANS}
            loading={clansLoading}
            error={clansError}
          />
        </section>
      </div>

      <DockingToolbar ariaLabel="Période du comparateur">
        <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} />
      </DockingToolbar>

      <div className="app-container app-gutter space-y-4">
        {selectedClanIds.length === 0 ? (
          <section className="app-panel p-8 text-center text-sm text-[var(--theme-ui-text-muted)]">
            Sélectionne au moins un clan ci-dessus pour lancer la confrontation et afficher les statistiques.
          </section>
        ) : loading && comparatorClans.length === 0 ? (
          <CardSkeleton />
        ) : error ? (
          <section className="app-panel p-6 text-sm text-red-600">{error}</section>
        ) : (
          // Rechargement : la comparaison précédente reste affichée, estompée (la page ne se replie pas).
          <div aria-busy={loading} className={loading ? 'flex flex-col gap-6 opacity-60' : 'flex flex-col gap-6'}>
            <ClanComparatorRadar clans={comparatorClans} />

            <GlobalPerformancesDominance clans={comparatorClans} selectedClanIds={selectedClanIds} />

            {selectedClanIds.length >= 2 ? (
              <section className="app-panel overflow-hidden p-4 sm:p-6">
                <div className="flex items-start gap-2.5 mb-4 pb-3 border-b border-[var(--theme-ui-border)]">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
                    <Swords className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-[var(--theme-ui-text)]">
                      Le &laquo; Derby &raquo; — Head-to-Head
                    </h2>
                    <p className="text-xs text-[var(--theme-ui-text-muted)] mt-0.5">
                      Confrontations directes entre clans suivis ayant partagé le même lobby PUBG (toutes périodes confondues).
                    </p>
                  </div>
                </div>
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
                        selectedClanIds={selectedClanIds}
                      />
                    )
                  })}
                </div>
              </section>
            ) : null}

            <section className="app-panel overflow-hidden p-4 sm:p-6">
              <div className="flex items-start gap-2.5 mb-4 pb-3 border-b border-[var(--theme-ui-border)]">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                  <Users className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-[var(--theme-ui-text)]">
                    Performances par mode de jeu
                  </h2>
                  <p className="text-xs text-[var(--theme-ui-text-muted)] mt-0.5">
                    Efficacité comparée selon la taille d&apos;escouade (Duo, Trio, Squad) et spécialisation d&apos;équipe.
                  </p>
                </div>
              </div>
              <ModePerformancesCard clans={selectedClanIds.map((id) => clanByIndex(id)!).filter(Boolean)} />
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="app-panel overflow-hidden p-4 sm:p-6">
                <div className="flex items-start gap-2.5 mb-4 pb-3 border-b border-[var(--theme-ui-border)]">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
                    <HeartPulse className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-[var(--theme-ui-text)]">
                      Le &laquo; Pouls &raquo; — Activité et rythme
                    </h2>
                    <p className="text-xs text-[var(--theme-ui-text-muted)] mt-0.5">
                      Santé du roster actif, répartition des modes d&apos;escouade et régularité des sessions de jeu.
                    </p>
                  </div>
                </div>
                <ClanPulseCards clans={comparatorClans} selectedClanIds={selectedClanIds} />
              </section>

              <section className="app-panel overflow-hidden p-4 sm:p-6">
                <div className="flex items-start gap-2.5 mb-4 pb-3 border-b border-[var(--theme-ui-border)]">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
                    <Dna className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-[var(--theme-ui-text)]">
                      Le &laquo; ADN &raquo; — Style de jeu tactique
                    </h2>
                    <p className="text-xs text-[var(--theme-ui-text-muted)] mt-0.5">
                      Propension aux hot drops, durée de survie moyenne et entraide d&apos;équipe (revives / KO subis).
                    </p>
                  </div>
                </div>
                <ClanDnaCards clans={comparatorClans} selectedClanIds={selectedClanIds} />
              </section>
            </div>

            <section className="app-panel overflow-hidden p-4 sm:p-6">
              <div className="flex items-start gap-2.5 mb-4 pb-3 border-b border-[var(--theme-ui-border)]">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
                  <Calendar className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-[var(--theme-ui-text)]">
                    Heatmap d&apos;activité (Punchcard)
                  </h2>
                  <p className="text-xs text-[var(--theme-ui-text-muted)] mt-0.5">
                    Créneaux horaires et jours de pointe où les clans disputent leurs parties PUBG.
                  </p>
                </div>
              </div>
              <ClanActivityHeatmap clans={selectedClanIds.map((id) => clanByIndex(id)!).filter(Boolean)} />
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ClanComparatorPage() {
  return (
    <Suspense fallback={<div className="app-container app-main flex-1"><CardSkeleton /></div>}>
      <ComparatorContent />
    </Suspense>
  )
}
