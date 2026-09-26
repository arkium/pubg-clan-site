'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Clock3, Crosshair, Flame, Medal, Swords, Trophy } from 'lucide-react'

import {
  ClanBriefing,
  ClanShowcaseHero,
  DuoOfPeriod,
  ExploreClan,
  ModePerformanceCards,
  SynergyBarsPanel,
  type ExploreLink,
} from '@/components/clan-overview/ClanOverviewSections'
import { KpiGrid, type Kpi } from '@/components/matches/MatchesUi'
import SquadSynergies from '@/components/SquadSynergies'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import PeriodFilter from '@/components/ui/PeriodFilter'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { Skeleton } from '@/components/ui/Skeleton'
import { useClanMatchesCache } from '@/hooks/useClanMatchesCache'
import { useClanOverview } from '@/hooks/useClanOverview'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { useSectionNavItems } from '@/hooks/useSectionNavItems'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { groupByIntent, pickDuo, synergyBars, type ClanShowcase, type ExploreIntent, type SynergyLike } from '@/lib/clan-showcase'
import { frDecimal } from '@/lib/match-sessions'
import { PERIOD_OF_LABELS, PERIOD_WHEN_LABELS, STANDARD_PERIODS } from '@/lib/period'
import type { ClanMatchTypeFilter, ClanTeamModeFilter } from '@/types/squad-matches'

/**
 * Vue d'ensemble d'un clan — refonte « vitrine » du 2026-09-26 (docs/features/clans.md, maquette Claude Design
 * « Vue ensemble clan », écrans 11a à 11f). Vitrine et briefing de la semaine (non filtrés), puis bandeau de filtres
 * qui s'applique aux chiffres clés, aux modes, au duo et aux synergies, puis navigation par intention.
 * Déplacés le même jour : Villes et Pression au drop → Drop zones ; Top performers → Awards ; Roster → Classement.
 */

const MATCH_TYPE_OPTIONS: Array<{ value: ClanMatchTypeFilter; label: string }> = [
  { value: 'official', label: 'Officiel' },
  { value: 'casual', label: 'Casual' },
  { value: 'custom', label: 'Custom' },
  { value: 'all', label: 'Tous' },
]

const TEAM_MODE_OPTIONS: Array<{ value: ClanTeamModeFilter; label: string }> = [
  { value: 'all', label: 'Tous' },
  { value: 'duo', label: 'Duo' },
  { value: 'trio', label: 'Trio' },
  { value: 'squad', label: 'Squad' },
]


const numberFormat = new Intl.NumberFormat('fr-FR')

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function fmtRelative(value: string | Date | null) {
  if (!value) return null
  const diffMs = Date.now() - new Date(value).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 2) return "à l'instant"
  if (mins < 60) return `il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.floor(hours / 24)
  return `il y a ${days} jour${days > 1 ? 's' : ''}`
}

type TelemetrySynergyRow = { memberAId: number; memberBId: number; reviveCount: number }

export default function ClanOverviewPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

  const { data, loading, error } = useClanOverview(clanId)
  // Période de la page : URL, puis mémoire de la visite, puis semaine (docs/TODO/sticky.md §4.E).
  const { period: selectedPeriod, setPeriod: setSelectedPeriod, ready: periodReady } = usePagePeriod(STANDARD_PERIODS, 'week')
  const [selectedMatchType, setSelectedMatchType] = useState<ClanMatchTypeFilter>('official')
  const [selectedMode, setSelectedMode] = useState<ClanTeamModeFilter>('all')

  const { data: cacheData, loading: cacheLoading, error: cacheError } = useClanMatchesCache(
    periodReady ? clanId : null,
    selectedPeriod,
    selectedMatchType
  )
  const clanNavItems = useSectionNavItems('clan-section', clanId, null)
  // Réglage de l'image du clan (« Accueil login ») : proposé dans la vitrine à qui y a accès, quand l'image manque.
  const imageSettingsHref = useSectionNavItems('admin-menu', clanId, null).find((item) => item.navKey === 'admin.login-welcome')?.href ?? null

  // Vitrine (palmarès, briefing) : indépendante des filtres, lue une fois.
  const [showcase, setShowcase] = useState<ClanShowcase | null>(null)
  useEffect(() => {
    if (!clanId) return
    const controller = new AbortController()
    fetch(`/api/clans/${clanId}/overview/showcase`, { cache: 'no-store', signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<ClanShowcase>) : null))
      .then((payload) => setShowcase(payload))
      .catch(() => {
        if (!controller.signal.aborted) setShowcase(null)
      })
    return () => controller.abort()
  }, [clanId])

  // Réanimations croisées du duo : synergies de la télémétrie (même source que le panneau détaillé).
  const [telemetrySynergies, setTelemetrySynergies] = useState<TelemetrySynergyRow[] | null>(null)
  useEffect(() => {
    if (!clanId || !periodReady) return
    const controller = new AbortController()
    fetch(`/api/clans/${clanId}/telemetry/synergies?period=${selectedPeriod}&matchType=${selectedMatchType}&mode=${selectedMode}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) => (response.ok ? (response.json() as Promise<{ rows?: TelemetrySynergyRow[] }>) : null))
      .then((payload) => setTelemetrySynergies(payload?.rows ?? null))
      .catch(() => {
        if (!controller.signal.aborted) setTelemetrySynergies(null)
      })
    return () => controller.abort()
  }, [clanId, periodReady, selectedPeriod, selectedMatchType, selectedMode])

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }
    setClanId(clanId)
  }, [clanId, router, setClanId])

  if (!clanId) return null

  const clan = data?.clan
  const rawStats = data?.clanStats as Record<string, unknown> | null
  const pubg = rawStats?.pubg as { name: string; tag: string } | null
  const tracked = rawStats?.tracked as { membersCount: number } | null

  const payload = cacheData?.payload
  const modeEntry = payload && selectedMode !== 'all' ? payload.modePerformance.find((mp) => mp.mode === selectedMode) ?? null : null
  const stats = modeEntry
    ? {
        totalKills: modeEntry.kills,
        totalDamage: modeEntry.damage,
        wins: modeEntry.wins,
        matchCount: modeEntry.matches,
        winRate: modeEntry.matches > 0 ? modeEntry.wins / modeEntry.matches : 0,
      }
    : payload?.globalStats ?? null

  const byMode = payload?.byMode[selectedMode]
  const synergyGroups = [...((byMode?.synergies.topPairs ?? []) as SynergyLike[]), ...((byMode?.synergies.topSquads ?? []) as SynergyLike[])]
  const duo = pickDuo((byMode?.synergies.topPairs ?? []) as SynergyLike[])
  const duoKills = (memberId: number) =>
    (byMode?.rosterStats ?? []).find((row) => row.memberId === memberId)?.totalKills ?? 0
  const crossRevives =
    duo && telemetrySynergies
      ? telemetrySynergies
          .filter(
            (row) =>
              (row.memberAId === duo.memberIds[0] && row.memberBId === duo.memberIds[1]) ||
              (row.memberAId === duo.memberIds[1] && row.memberBId === duo.memberIds[0])
          )
          .reduce((sum, row) => sum + row.reviveCount, 0)
      : null
  const topKiller = (payload?.byMode.all.topPerformers.kills[0] as { displayName?: string } | undefined)?.displayName

  const kpis: Kpi[] = stats
    ? [
        {
          label: 'Kills',
          value: numberFormat.format(stats.totalKills),
          detail: `${stats.matchCount ? frDecimal(stats.totalKills / stats.matchCount) : '0'} par partie`,
          icon: Crosshair,
          color: 'var(--game-neg)',
          link: { href: `/clans/${clanId}/leaderboard`, label: 'Top fraggers' },
        },
        {
          label: 'Top 1',
          value: numberFormat.format(stats.wins),
          detail: `${frDecimal(stats.winRate * 100)} % des parties`,
          icon: Trophy,
          color: 'var(--game-gold)',
          link: { href: `/clans/${clanId}/matches`, label: 'Revoir les top 1' },
        },
        {
          label: 'Dégâts moyens',
          value: numberFormat.format(stats.matchCount ? Math.round(stats.totalDamage / stats.matchCount) : 0),
          detail: 'par partie',
          icon: Flame,
          color: 'var(--game-warn)',
          link: { href: `/clans/${clanId}/stats/weapons`, label: 'Stats armes' },
        },
        {
          label: 'Parties',
          value: numberFormat.format(stats.matchCount),
          detail: `ensemble, ${PERIOD_WHEN_LABELS[selectedPeriod]}`,
          icon: Swords,
          color: 'var(--theme-ui-accent)',
          link: { href: `/clans/${clanId}/matches`, label: 'Soirées' },
        },
      ]
    : []

  // Navigation par intention : pages du clan autorisées (registre), plus les pages globales utiles au clan.
  const intentGroups = groupByIntent(clanNavItems)
  const hintFor: Record<string, string | undefined> = {
    'clan.matches': showcase ? `${showcase.hints.weekGames} cette semaine` : undefined,
    'clan.members': tracked ? `${tracked.membersCount} suivis` : undefined,
    'clan.challenges': showcase?.hints.activeChallenges ? `${showcase.hints.activeChallenges} en cours` : undefined,
    'clan.leaderboard': topKiller ? `${topKiller} en tête` : undefined,
    'clan.awards': 'et top performers',
    'clan.drop-zones': 'et villes',
  }
  const toLinks = (intent: ExploreIntent): ExploreLink[] =>
    intentGroups[intent].map((item) => ({ key: item.navKey, navKey: item.navKey, label: item.label, href: item.href, hint: hintFor[item.navKey] }))
  const exploreGroups: Record<ExploreIntent, ExploreLink[]> = {
    play: [
      ...toLinks('play'),
      {
        key: 'global.tournaments',
        label: 'Tournois',
        href: '/tournaments',
        icon: Swords,
        hint: showcase?.hints.openTournaments ? `${showcase.hints.openTournaments} en cours ou à venir` : undefined,
      },
    ],
    improve: toLinks('improve'),
    compete: [
      ...toLinks('compete'),
      {
        key: 'global.league',
        label: 'Ligue des clans',
        href: '/clans-leaderboard',
        icon: Medal,
        hint: showcase?.palmares.league ? `#${showcase.palmares.league.rank} sur ${showcase.palmares.league.of}` : undefined,
      },
      { key: 'global.comparator', label: 'Comparateur de clans', href: '/clans/comparator', icon: Clock3 },
    ],
  }

  const ready = !loading && !error && data

  return (
    <div className="game-ui">
      <div className="app-container app-gutter flex flex-col gap-4 pt-8">
        <NavigationTrail currentLabel="Vue d'ensemble" currentHref={`/clans/${clanId}/overview`} fallbackParent={{ href: '/clans', label: 'Liste des clans' }} />

        {loading && <CardSkeleton />}
        {error && (
          <div className="app-panel p-6 text-sm" style={{ color: 'var(--game-neg)' }}>
            {error === 'Unauthorized' ? 'Vous n’avez pas la permission de voir cette page.' : error}
          </div>
        )}

        {ready && (
          <>
            <ClanShowcaseHero
              image={clan?.imageUrl || null}
              imageSettingsHref={imageSettingsHref}
              tag={pubg?.tag ?? clan?.tag ?? null}
              name={pubg?.name ?? clan?.name ?? `Clan #${clanId}`}
              syncedLabel={fmtRelative((rawStats?.syncedAt as string | undefined) ?? null)}
              trackedMembers={tracked?.membersCount ?? 0}
              showcase={showcase}
            />
            {!pubg && (
              <p className="text-sm text-gray-500">Aucune donnée PUBG pour ce clan : lancez une synchronisation depuis les paramètres.</p>
            )}
            <ClanBriefing clanId={clanId} showcase={showcase} />
          </>
        )}
      </div>

      {/* Bandeau de filtres : ne s'applique qu'à ce qui suit (docs/TODO/sticky.md §4.A). */}
      {ready && (
        <DockingToolbar ariaLabel="Filtres de la vue d'ensemble">
          {({ compact }) => (
            <div className="flex w-full flex-wrap items-center gap-3">
              <PeriodFilter periods={STANDARD_PERIODS} value={selectedPeriod} onChange={setSelectedPeriod} />
              {!compact && <SegmentedControl options={MATCH_TYPE_OPTIONS} value={selectedMatchType} onChange={setSelectedMatchType} size="sm" className="shrink-0" />}
              {!compact && <SegmentedControl options={TEAM_MODE_OPTIONS} value={selectedMode} onChange={setSelectedMode} size="sm" className="shrink-0" />}
              {!compact && <span className="ml-auto hidden text-xs text-gray-500 lg:inline">Filtre la suite de la page</span>}
            </div>
          )}
        </DockingToolbar>
      )}

      <div className="app-container app-gutter pb-8">
        {ready && (
          <div className="flex flex-col gap-6">
            {cacheError && <p className="app-panel p-3 text-sm" style={{ color: 'var(--game-neg)' }}>{cacheError}</p>}
            {cacheLoading && !cacheData && (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            )}

            {/* Pendant un rechargement, les chiffres précédents restent affichés, estompés. */}
            {payload && stats && (
              <div aria-busy={cacheLoading} className={`flex flex-col gap-6 ${cacheLoading ? 'opacity-60' : ''}`}>
                <KpiGrid items={kpis} className="grid-cols-2 lg:grid-cols-4" />

                <ModePerformanceCards
                  modes={payload.modePerformance.filter((mp) => selectedMode === 'all' || mp.mode === selectedMode)}
                  matchesHref={`/clans/${clanId}/matches`}
                />

                <section className="grid items-stretch gap-3 lg:[grid-template-columns:minmax(0,1fr)_minmax(0,1.2fr)]" aria-label="Duo et synergies">
                  <DuoOfPeriod
                    periodLabel={PERIOD_OF_LABELS[selectedPeriod]}
                    duo={
                      duo
                        ? {
                            memberIds: duo.memberIds,
                            memberNames: duo.memberNames,
                            matchesPlayed: duo.matchesPlayed,
                            winRate: duo.winRate,
                            kills: [duoKills(duo.memberIds[0]), duoKills(duo.memberIds[1])],
                          }
                        : null
                    }
                    crossRevives={crossRevives}
                    clanWinRate={stats.winRate}
                  />
                  <SynergyBarsPanel bars={synergyBars(synergyGroups)}>
                    {/* Détail complet (paires, escouades, réanimations et kills croisés de la télémétrie). */}
                    <details className="group">
                      <summary className="cursor-pointer list-none text-xs font-semibold hover:underline" style={{ color: 'var(--game-link)' }}>
                        <span className="group-open:hidden">Toutes les synergies →</span>
                        <span className="hidden group-open:inline">Replier le détail</span>
                      </summary>
                      <div className="mt-3">
                        <SquadSynergies
                          clanId={clanId}
                          period={selectedPeriod}
                          matchType={selectedMatchType}
                          mode={selectedMode}
                          synergies={byMode?.synergies as never}
                        />
                      </div>
                    </details>
                  </SynergyBarsPanel>
                </section>
              </div>
            )}

            <ExploreClan groups={exploreGroups} />
          </div>
        )}
      </div>
    </div>
  )
}
