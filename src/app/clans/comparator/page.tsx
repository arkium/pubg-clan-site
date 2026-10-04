'use client'

import { Swords, Users, HeartPulse, Dna, Calendar } from 'lucide-react'
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { DockingToolbar } from '@/components/ui/DockingToolbar'
import PeriodFilter from '@/components/ui/PeriodFilter'
import ToolbarGroup from '@/components/ui/ToolbarGroup'
import ClanRosterSelector, { type ClanSummary } from '@/components/comparator/ClanRosterSelector'
import ClanComparatorRadar from '@/components/comparator/ClanComparatorRadar'
import GlobalPerformancesDominance from '@/components/comparator/GlobalPerformancesDominance'
import HeadToHeadCard from '@/components/comparator/HeadToHeadCard'
import ModePerformancesCard from '@/components/comparator/ModePerformancesCard'
import ClanPulseCards from '@/components/comparator/ClanPulseCards'
import ClanDnaCards from '@/components/comparator/ClanDnaCards'
import ClanActivityHeatmap from '@/components/comparator/ClanActivityHeatmap'
import { ComparatorSectionHeader } from '@/components/comparator/ComparatorUi'
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
  // Ordre de l'arène (P1, P2, P3) : l'API renvoie les clans par identifiant ; le radar colore par position.
  const orderedClans = selectedClanIds.map(clanByIndex).filter((clan): clan is ClanComparatorEntry => Boolean(clan))

  const query = searchParams.toString()

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    // `.charte` : page migrée vers la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    // `.game-ui` : jetons --game-* (piste des barres comparées).
    <div className="app-main-flush game-ui charte flex-1">
      <div className="app-container app-gutter flex flex-col gap-4">
        {/* Invisible ici : enregistre la sélection courante pour que le retour depuis un match la restaure. */}
        <NavigationTrail
          currentLabel="Comparateur"
          currentHref={query ? `/clans/comparator?${query}` : '/clans/comparator'}
          fallbackParent={null}
          hidden
        />
        {/* Hauteur du bandeau inchangée : seul son contenu suit la charte (titre Teko, icône à l'accent). */}
        <header
          className="app-on-photo bg-hero-fallback relative min-h-[10rem] overflow-hidden rounded-[14px] bg-cover bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/comparateurclans.jpg')`, backgroundPosition: 'center 20%' }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 px-3 py-2.5 sm:px-5 sm:py-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Swords className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />
              <h1 className="t-banner-title text-white drop-shadow-md">Comparateur de clans</h1>
            </div>
            <p className="mt-1 text-[11px] font-medium text-slate-200 drop-shadow-md sm:mt-2 sm:text-[13px]">
              Compare l&apos;activité, le style de jeu et les performances de jusqu&apos;à {MAX_CLANS} clans suivis.
            </p>
          </div>
        </header>

        {/* Arène de sélection (slots P1 / P2 / P3) et catalogue des clans. */}
        <section aria-label="Sélection des clans">
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

      {/* Bandeau standard des pages à période : intitulé au repos seulement ; docké sur mobile, la période seule. */}
      <DockingToolbar ariaLabel="Période du comparateur">
        {({ isSticky }) => (
          <ToolbarGroup label="Période" showLabel={!isSticky}>
            <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} />
          </ToolbarGroup>
        )}
      </DockingToolbar>

      <div className="app-container app-gutter flex flex-col gap-4 pb-8">
        {selectedClanIds.length === 0 ? (
          // État vide (charte §2) : bordure pointillée, rayon 14.
          <section className="t-body rounded-[14px] border border-dashed border-gray-200 p-8 text-center text-gray-500">
            Sélectionne au moins un clan ci-dessus pour lancer la confrontation et afficher les statistiques.
          </section>
        ) : loading && comparatorClans.length === 0 ? (
          <CardSkeleton />
        ) : error ? (
          <section className="app-panel p-6 text-sm text-[var(--theme-ui-negative)]">{error}</section>
        ) : (
          // Rechargement : la comparaison précédente reste affichée, estompée (la page ne se replie pas).
          <div aria-busy={loading} className={`flex flex-col gap-6 transition-opacity${loading ? ' opacity-60' : ''}`}>
            <ClanComparatorRadar clans={orderedClans} />

            <GlobalPerformancesDominance clans={comparatorClans} selectedClanIds={selectedClanIds} />

            {selectedClanIds.length >= 2 ? (
              <section className="app-panel flex flex-col gap-4 overflow-hidden p-4 sm:p-6">
                <ComparatorSectionHeader
                  icon={Swords}
                  title={<>Le &laquo; Derby &raquo; — Head-to-Head</>}
                  subtitle="Confrontations directes entre clans suivis ayant partagé le même lobby PUBG (toutes périodes confondues)."
                />
                <div className="flex flex-col gap-4">
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

            <section className="app-panel flex flex-col gap-4 overflow-hidden p-4 sm:p-6">
              <ComparatorSectionHeader
                icon={Users}
                title="Performances par mode de jeu"
                subtitle="Efficacité comparée selon la taille d'escouade (Duo, Trio, Squad) et spécialisation d'équipe."
              />
              <ModePerformancesCard clans={selectedClanIds.map((id) => clanByIndex(id)!).filter(Boolean)} />
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="app-panel flex flex-col gap-4 overflow-hidden p-4 sm:p-6">
                <ComparatorSectionHeader
                  icon={HeartPulse}
                  title={<>Le &laquo; Pouls &raquo; — Activité et rythme</>}
                  subtitle="Santé du roster actif, répartition des modes d'escouade et régularité des sessions de jeu."
                />
                <ClanPulseCards clans={comparatorClans} selectedClanIds={selectedClanIds} />
              </section>

              <section className="app-panel flex flex-col gap-4 overflow-hidden p-4 sm:p-6">
                <ComparatorSectionHeader
                  icon={Dna}
                  title={<>Le &laquo; ADN &raquo; — Style de jeu tactique</>}
                  subtitle="Propension aux hot drops, durée de survie moyenne et entraide d'équipe (revives / KO subis)."
                />
                <ClanDnaCards clans={comparatorClans} selectedClanIds={selectedClanIds} />
              </section>
            </div>

            <section className="app-panel flex flex-col gap-4 overflow-hidden p-4 sm:p-6">
              <ComparatorSectionHeader
                icon={Calendar}
                title="Heatmap d'activité (Punchcard)"
                subtitle="Créneaux horaires et jours de pointe où les clans disputent leurs parties PUBG."
              />
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
