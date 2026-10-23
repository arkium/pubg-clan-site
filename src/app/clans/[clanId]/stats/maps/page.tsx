'use client'

import { ArrowDownWideNarrow, ArrowUpNarrowWide, Map as MapIcon } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useState } from 'react'

import { ClanMapsEmpty, ClanMapsSkeleton, ClanMapsVerdict, ClanMapTile } from '@/components/clan-maps/ClanMapsSections'
import MemberPageHeader from '@/components/member/MemberPageHeader'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import MobileDropdownNav, { type MobileDropdownNavItem } from '@/components/ui/MobileDropdownNav'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import PeriodFilter from '@/components/ui/PeriodFilter'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { SortReminder } from '@/components/ui/SortableTh'
import ToolbarGroup from '@/components/ui/ToolbarGroup'
import { useIsSmallScreen } from '@/hooks/useIsSmallScreen'
import { usePageData } from '@/hooks/usePageData'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { LEAGUE_MATCH_TYPE_OPTIONS, type LeagueMatchType } from '@/lib/clan-league'
import { CLAN_MAP_SORT_KEYS, CLAN_MAP_SORT_LABELS, sortClanMapRows, type ClanMapSortKey, type ClanMapStatsPayload } from '@/lib/clan-maps'
import { PERIOD_WHEN_LABELS, STANDARD_PERIODS } from '@/lib/period'

/**
 * Cartes du clan (`/clans/[clanId]/stats/maps`) — refonte de l'ancienne « Heatmap kills », maquette Claude Design
 * « Cartes clan - Fait » (2026-10-23), docs/TODO/cartes-clan.md. Où le clan gagne, où il perd des places et qui porte
 * l'escouade sur chaque carte : parties d'escouade du clan, comparées à la moyenne des clans suivis et à la période
 * précédente. Page publique (visiteurs compris), sur le modèle de la page Cartes du joueur.
 */

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const MATCH_TYPE_OPTIONS = LEAGUE_MATCH_TYPE_OPTIONS.map((option) => ({ value: option.value, label: option.short }))

/** « parties normales », « parties Ranked »… (sous-titre) et « partie normale »… (état vide). */
const MATCH_TYPE_PLURAL: Record<LeagueMatchType, string> = {
  official: 'parties normales',
  competitive: 'parties Ranked',
  casual: 'parties casual',
  custom: 'parties de tournoi ou custom',
}
const MATCH_TYPE_SINGULAR: Record<LeagueMatchType, string> = {
  official: 'partie normale',
  competitive: 'partie Ranked',
  casual: 'partie casual',
  custom: 'partie de tournoi ou custom',
}

const count = new Intl.NumberFormat('fr-FR')
const pickPayload = (payload: unknown) => (payload && typeof payload === 'object' && 'maps' in payload ? (payload as ClanMapStatsPayload) : null)

export default function ClanMapsPage() {
  const params = useParams()
  const clanId = parseClanId(params.clanId)
  const small = useIsSmallScreen()

  // Période : URL, puis mémoire de la visite, puis « Mois » (docs/TODO/sticky.md §4.E).
  const { period, setPeriod, ready } = usePagePeriod(STANDARD_PERIODS, 'month')
  const [matchType, setMatchType] = useState<LeagueMatchType>('official')
  const [sortKey, setSortKey] = useState<ClanMapSortKey>('matches')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const url = clanId && ready ? `/api/clans/${clanId}/map-stats?period=${period}&matchType=${matchType}` : null
  // Changer un filtre ne replie pas la page : la réponse précédente reste affichée, estompée.
  const { data, loading, error } = usePageData(url, pickPayload)

  if (!clanId) {
    return (
      <div className="app-container app-main flex-1">
        <p className="app-panel p-4 text-sm text-[var(--theme-ui-negative)]">Clan invalide.</p>
      </div>
    )
  }

  const clanLabel = data ? `[${data.clan.tag}]` : 'le clan'
  const rows = data ? sortClanMapRows(data.maps, sortKey, sortDir) : []
  const podiumKeys = rows.filter((row) => !row.lowSample).slice(0, 3).map((row) => row.mapName)
  const sortLabel = CLAN_MAP_SORT_LABELS[sortKey]
  const sortItems: MobileDropdownNavItem[] = CLAN_MAP_SORT_KEYS.map((key) => ({
    key,
    label: CLAN_MAP_SORT_LABELS[key],
    active: key === sortKey,
    onSelect: () => setSortKey(key),
  }))

  const periodControl = <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} />
  const typeControl = <SegmentedControl options={MATCH_TYPE_OPTIONS} value={matchType} onChange={setMatchType} size="sm" className="shrink-0" />
  // Docké sur mobile, le bouton retour prend la gauche : segments resserrés sur toute la largeur restante.
  const compactTypeControl = <SegmentedControl options={MATCH_TYPE_OPTIONS} value={matchType} onChange={setMatchType} size="xs" fullWidthOnMobile />

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) ; `.charte` : page migrée vers la charte UI (docs/ui/index.html).
    <div className="app-main-flush game-ui charte flex-1">
      <div className="app-container app-gutter space-y-4">
        <NavigationTrail
          currentLabel="Cartes"
          currentHref={`/clans/${clanId}/stats/maps`}
          fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
        />
        <MemberPageHeader
          title="Les cartes du clan"
          subtitle={`Où ${clanLabel} gagne, où il perd des places, et qui porte l’escouade sur chaque carte.`}
          showBackButton={false}
          backgroundImage="/cartographie-tactique.jpg"
          icon={<MapIcon className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />}
        />
      </div>

      {/*
        Docké sur ordinateur : les contrôles seuls et le rappel du tri. Docké sur mobile (maquette, 2d) : deux rangées sans
        intitulés — période et rappel court du tri, puis type de partie.
      */}
      <DockingToolbar ariaLabel="Filtres des cartes du clan" dockedAside={<SortReminder label={sortLabel} sortDir={sortDir} />}>
        {({ isSticky, compact }) =>
          compact ? (
            <div className="flex w-full flex-col gap-2">
              <div className="flex items-center gap-2">
                {periodControl}
                <span className="ml-auto whitespace-nowrap text-xs font-bold text-[var(--theme-ui-accent-text)]">
                  {sortLabel} {sortDir === 'asc' ? '↑' : '↓'}
                </span>
              </div>
              {compactTypeControl}
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <ToolbarGroup label="Période" showLabel={!isSticky}>
                {periodControl}
              </ToolbarGroup>
              <ToolbarGroup label="Type de partie" showLabel={!isSticky}>
                {typeControl}
              </ToolbarGroup>
            </div>
          )
        }
      </DockingToolbar>

      <div className="app-container app-gutter flex flex-col gap-4 pb-8 sm:gap-5">
        {error ? <p className="app-panel p-3 text-sm text-[var(--theme-ui-negative)]">{error}</p> : null}

        {!data ? (
          loading || !error ? <ClanMapsSkeleton small={small} /> : null
        ) : data.maps.length === 0 ? (
          <ClanMapsEmpty
            title={`Aucune ${MATCH_TYPE_SINGULAR[data.matchType]} pour ${clanLabel} ${PERIOD_WHEN_LABELS[data.period]}`}
            onShowAll={data.period === 'all' ? null : () => setPeriod('all')}
          />
        ) : (
          <div aria-busy={loading} className={`flex flex-col gap-4 transition-opacity sm:gap-5 ${loading ? 'opacity-60' : ''}`}>
            <ClanMapsVerdict verdict={data.verdict} small={small} />

            <section aria-labelledby="clan-maps-title" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                  <h2 id="clan-maps-title" className="t-section-title m-0 flex items-center gap-2">
                    Performance par carte
                    {loading ? <span className="t-meta font-semibold">Mise à jour…</span> : null}
                  </h2>
                  <p className="t-meta t-num m-0">
                    [{data.clan.tag}] {data.clan.name} · {count.format(data.totals.matches)} partie{data.totals.matches > 1 ? 's' : ''} ·{' '}
                    {data.totals.maps} carte{data.totals.maps > 1 ? 's' : ''} · {PERIOD_WHEN_LABELS[data.period]}, {MATCH_TYPE_PLURAL[data.matchType]}
                  </p>
                  <p className="t-meta m-0">
                    <b className="t-pos">+7 pts clans</b> écart à la moyenne des clans
                    {data.period !== 'all' ? <> · <b className="text-gray-700">▲▼</b> évolution depuis la période précédente</> : null}
                  </p>
                </div>
                {/* Tri des cartes : menu de la charte + sens, à la hauteur du menu (comme la page Cartes du joueur). */}
                <div className="flex items-stretch gap-2">
                  <MobileDropdownNav
                    id={`clan-maps-sort-${clanId}`}
                    label="Trier par"
                    currentLabel={sortLabel}
                    items={sortItems}
                    variant="compact"
                    visibilityClass="block"
                    className="min-w-0 max-w-full"
                  />
                  <button
                    type="button"
                    onClick={() => setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))}
                    className="app-toolbar-btn shrink-0 px-2"
                    aria-label={sortDir === 'asc' ? 'Tri croissant actif' : 'Tri décroissant actif'}
                    title={sortDir === 'asc' ? 'Tri croissant' : 'Tri décroissant'}
                  >
                    {sortDir === 'asc' ? <ArrowUpNarrowWide className="h-4 w-4" aria-hidden="true" /> : <ArrowDownWideNarrow className="h-4 w-4" aria-hidden="true" />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {rows.map((row) => {
                  const podiumIndex = podiumKeys.indexOf(row.mapName)
                  return (
                    <ClanMapTile
                      key={row.mapName}
                      row={row}
                      sortKey={sortKey}
                      podiumRank={podiumIndex >= 0 ? podiumIndex + 1 : null}
                      showTrend={data.period !== 'all'}
                    />
                  )
                })}
              </div>

              <p className="t-meta m-0 border-t border-gray-200 pt-3">
                Une partie = une partie d’escouade du clan ; moyenne des clans : les {data.comparedClans} clans suivis, sur la même
                période et le même type de partie.
              </p>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
