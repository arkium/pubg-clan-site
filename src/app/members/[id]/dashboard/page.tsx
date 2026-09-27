'use client'

import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'

import {
  ArsenalCard,
  BestMatchCard,
  DropCard,
  MatesCard,
  NemesisCard,
  PlayerHero,
  PlayerKpis,
  PlayerProfileCard,
  RecentMatches,
  type ArsenalWeapon,
  type HeroNavItem,
  type NemesisSummary,
} from '@/components/player-dashboard/PlayerDashboardSections'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import PeriodFilter from '@/components/ui/PeriodFilter'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { usePageData } from '@/hooks/usePageData'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { useSectionNavItems } from '@/hooks/useSectionNavItems'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { computeDistinctions, distinctionsByMember } from '@/lib/distinctions'
import { STANDARD_PERIODS } from '@/lib/period'
import { profileRole } from '@/lib/player-dashboard'
import type { CityInsights } from '@/types/city-insights'
import type { MatchesResponse, PlayerDashboardResponse } from '@/types/dashboard'
import type { DropPressureDashboardStats } from '@/types/drop-pressure'
import type { LeaderboardResponse } from '@/types/leaderboard'

const pickDashboard = (payload: unknown) => (payload as PlayerDashboardResponse | null) ?? null
const pickWeapons = (payload: unknown) =>
  ((payload as { data?: { rows?: ArsenalWeapon[] } } | null)?.data?.rows ?? []).filter((row) => row.kills > 0).slice(0, 3)
const pickNemesis = (payload: unknown) => (payload as { data?: NemesisSummary } | null)?.data ?? null
const pickCity = (payload: unknown) => (payload as { insights?: CityInsights } | null)?.insights ?? null
const pickDrop = (payload: unknown) => (payload as { stats?: DropPressureDashboardStats } | null)?.stats ?? null
const pickMatches = (payload: unknown) => (payload as MatchesResponse | null) ?? null
const pickLeaderboard = (payload: unknown) => (payload as LeaderboardResponse | null)?.leaderboard ?? []

function parseMemberId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Tableau de bord d'un joueur — le joueur d'abord (maquette « Membres et joueur », 17a–17c ; docs/features/membres.md).
 * Carte joueur et puces vers ses pages, puis une seule période pour tout : chiffres clés, meilleure partie, profil de
 * jeu, arsenal, frères d'armes, némésis, drop, dernières parties. Chaque carte ouvre sa page.
 */
export default function DashboardPage() {
  const params = useParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])
  const { clanId: selectedClanId } = useSelectedClan()
  const sectionItems = useSectionNavItems('member-section', selectedClanId, memberId)
  // Période de toute la page : URL, puis mémoire de la visite, puis semaine (docs/TODO/sticky.md §4.E).
  const { period, setPeriod, ready } = usePagePeriod(STANDARD_PERIODS, 'week')
  const [now] = useState(() => new Date())

  const base = ready && memberId ? `/api/members/${memberId}` : null
  const dashboard = usePageData(base && `${base}/dashboard?period=${period}`, pickDashboard)
  const weapons = usePageData(base && `${base}/telemetry/weapons?period=${period}`, pickWeapons)
  // La Némésis n'a pas de « Tous » : sans période, la route lit tout l'historique suivi.
  const nemesis = usePageData(base && `${base}/nemesis${period === 'all' ? '' : `?period=${period}`}`, pickNemesis)
  const city = usePageData(base && `${base}/city-insights?period=${period}`, pickCity)
  const drop = usePageData(base && `${base}/drop-pressure?period=${period}`, pickDrop)
  const matches = usePageData(
    base && `${base}/matches?period=${period}&limit=5&offset=0&sortBy=pubgCreatedAt&sortDirection=desc`,
    pickMatches
  )
  const clanId = dashboard.data?.member.clan?.id ?? selectedClanId
  const ranking = usePageData(
    dashboard.data?.member.clan ? `/api/clans/${dashboard.data.member.clan.id}/leaderboard?period=${period}&sortBy=kills&matchType=official&mode=all` : null,
    pickLeaderboard
  )

  const distinction = useMemo(() => {
    if (!memberId || !ranking.data) return null
    return distinctionsByMember(computeDistinctions(ranking.data)).get(memberId)?.[0] ?? null
  }, [memberId, ranking.data])

  const navItems: HeroNavItem[] = sectionItems
    .filter((item) => item.navKey !== 'member.dashboard')
    .map((item) => ({
      navKey: item.navKey,
      label: item.label,
      href: item.href,
      badge: item.navKey === 'member.matches' && matches.data && matches.data.totalCount > 0 ? String(matches.data.totalCount) : undefined,
    }))

  if (!memberId) {
    return (
      <div className="app-container app-main flex-1">
        <p className="text-sm text-red-600">Identifiant de joueur invalide.</p>
      </div>
    )
  }

  const data = dashboard.data
  const refreshing = dashboard.loading && data !== null

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    <div className="app-main-flush flex-1">
      <div className="app-container app-gutter flex flex-col gap-4">
        <NavigationTrail
          currentLabel={data?.member.displayName ?? 'Tableau de bord'}
          currentHref={`/members/${memberId}/dashboard`}
          fallbackParent={clanId ? { href: `/clans/${clanId}/members`, label: 'Membres', altHref: '/clans' } : { href: '/members', label: 'Membres' }}
        />
        {data ? (
          <PlayerHero
            member={data.member}
            role={profileRole(data.playstyle.current)}
            distinction={distinction}
            period={period}
            navItems={navItems}
            now={now}
          />
        ) : dashboard.error ? (
          <p className="app-panel p-4 text-sm text-red-600">Tableau de bord indisponible : {dashboard.error}</p>
        ) : (
          <CardSkeleton />
        )}
      </div>

      <DockingToolbar ariaLabel="Période du tableau de bord">
        {({ isSticky }) => (
          <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-2">
            <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} />
            {!isSticky ? (
              <span className="text-xs text-gray-500">
                {period === 'all' ? 'Comparé à la moyenne du clan' : 'Comparé à la moyenne du clan et à la période précédente'}
              </span>
            ) : null}
          </div>
        )}
      </DockingToolbar>

      {data ? (
        <div className={`app-container app-gutter flex flex-col gap-4 pb-8 transition-opacity sm:gap-[18px] ${refreshing ? 'opacity-60' : ''}`} aria-busy={refreshing}>
          <PlayerKpis data={data} now={now} />

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <BestMatchCard match={data.bestMatch} />
            <PlayerProfileCard playstyle={data.playstyle} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ArsenalCard weapons={weapons.data ?? []} memberId={memberId} />
            <MatesCard mates={data.mates} />
            <NemesisCard nemesis={nemesis.data} memberId={memberId} />
            <DropCard city={city.data} drop={drop.data} memberId={memberId} />
          </div>

          <RecentMatches matches={matches.data?.matches ?? []} mapLabels={matches.data?.mapLabels ?? {}} memberId={memberId} period={period} />
        </div>
      ) : null}
    </div>
  )
}
