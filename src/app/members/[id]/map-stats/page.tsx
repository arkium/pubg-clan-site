'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Map } from 'lucide-react'

import { PickerChip, PlaystyleLegend, type PickerItem } from '@/components/maps/MapToolbarControls'
import MemberPageHeader from '@/components/member/MemberPageHeader'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import RankCell from '@/components/ui/RankCell'
import MobileDropdownNav, { type MobileDropdownNavItem } from '@/components/ui/MobileDropdownNav'
import PeriodFilter from '@/components/ui/PeriodFilter'
import { SortReminder } from '@/components/ui/SortableTh'
import { usePageData } from '@/hooks/usePageData'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { usePlaystyleColors } from '@/hooks/usePlaystyleColors'
import { STANDARD_PERIODS, type StandardPeriod } from '@/lib/period'

type Scope = 'self' | 'member' | 'clan' | 'best'
type BestMode = 'duo' | 'trio' | 'squad'
type Period = StandardPeriod

type MapStat = {
  mapName: string
  mapLabel: string
  matches: number
  wins: number
  winRate: number
  top10Rate: number
  avgPlacement: number
  totalKills: number
  totalKnockouts: number
  totalAssists: number
  totalDamage: number
  totalHeadshots: number
  totalRevives: number
  avgDurationSeconds: number
}

type SortKey =
  | 'mapLabel'
  | 'matches'
  | 'wins'
  | 'winRate'
  | 'top10Rate'
  | 'avgPlacement'
  | 'totalKills'
  | 'totalKnockouts'
  | 'totalAssists'
  | 'totalDamage'
  | 'totalHeadshots'
  | 'totalRevives'
  | 'avgDurationSeconds'

// Vocabulaire de la charte (§6 bis) : Victoires, Dégâts, Knocks, Assistances, Réanimations ; abrégés dans les tuiles.
const SORT_LABELS: Record<SortKey, string> = {
  mapLabel: 'Carte',
  matches: 'Matchs',
  wins: 'Victoires',
  winRate: 'Win rate',
  top10Rate: 'Top 10',
  avgPlacement: 'Place moyenne',
  totalKills: 'Kills',
  totalKnockouts: 'Knocks',
  totalAssists: 'Assistances',
  totalDamage: 'Dégâts',
  totalHeadshots: 'Headshots',
  totalRevives: 'Réanimations',
  avgDurationSeconds: 'Durée moyenne',
}

// Couleurs sémantiques de la charte (.game-ui) : positif, négatif, ciel de jeu, neutre.
type StatTone = 'pos' | 'neg' | 'sky' | 'neutral'

const STAT_TONE_CLASS: Record<StatTone, string> = {
  pos: 't-pos',
  neg: 't-neg',
  sky: 't-sky',
  neutral: 'text-gray-900',
}

function CompactStat({
  label,
  value,
  tone,
  active = false,
}: {
  label: string
  value: string | number
  tone: StatTone
  active?: boolean
}) {
  return (
    <div className={`app-stat-tile ${active ? 'app-stat-tile--active' : ''}`}>
      <span className={`app-stat-tile__value ${STAT_TONE_CLASS[tone]}`}>{value}</span>
      <span className="app-stat-tile__label">{label}</span>
    </div>
  )
}

type MapStatsPayload = {
  scope: Scope
  scopeLabel: string
  options: {
    members: Array<{
      id: number
      displayName: string
    }>
    bestModes: BestMode[]
  }
  selected: {
    memberId: number
    targetMemberId: number | null
    bestMode: BestMode
    period: Period
  }
  totals: {
    rows: number
    maps: number
  }
  mapStats: MapStat[]
  bestCompositions: Array<{
    mode: BestMode
    label: string
    teamMembers: string[]
    matches: number
    wins: number
    winRate: number
    avgPlacement: number
  }>
  error?: string
}

function MapCardBanner({
  mapName,
  mapLabel,
  podiumRank,
}: {
  mapName: string
  mapLabel: string
  podiumRank: number | null
}) {
  const [imgFailed, setImgFailed] = useState(false)

  if (imgFailed) {
    return (
      <div className="flex items-start justify-between gap-3 px-3 pt-3">
        <div>
          <p className="t-label">Carte</p>
          <h3 className="t-card-title mt-1">{mapLabel}</h3>
        </div>
        {podiumRank ? (
          <RankCell rank={podiumRank} size="md" />
        ) : null}
      </div>
    )
  }

  return (
    <div className="bg-photo-fallback relative h-28 overflow-hidden">
      <img
        src={`/maps/pubg/${mapName}.webp`}
        alt={mapLabel}
        className="h-full w-full object-cover"
        onError={() => setImgFailed(true)}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-2 px-3 pb-2.5">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/70">Carte</p>
          <h3 className="text-lg font-bold leading-tight text-white drop-shadow">{mapLabel}</h3>
        </div>
        {podiumRank ? (
          <RankCell rank={podiumRank} size="md" />
        ) : null}
      </div>
    </div>
  )
}

const BEST_MODE_LABELS: Record<BestMode, string> = { duo: 'Son meilleur duo', trio: 'Son meilleur trio', squad: 'Son meilleur squad' }
const pickClanId = (payload: unknown) => (payload as { clanId?: number | null } | null)?.clanId ?? null

function parseMemberId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const count = new Intl.NumberFormat('fr-FR')

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1).replace('.', ',')} %`
}

/** Durée en minutes:secondes (« 24:05 ») : tient dans une tuile. */
function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(total / 60)
  const remaining = total % 60
  return `${minutes}:${String(remaining).padStart(2, '0')}`
}

function readInitialSortPreference(): { key: SortKey; dir: 'asc' | 'desc' } {
  if (typeof window === 'undefined') {
    return { key: 'matches' as SortKey, dir: 'desc' as 'asc' | 'desc' }
  }

  const raw = window.localStorage.getItem('member-map-stats-sort')
  if (!raw) {
    return { key: 'matches' as SortKey, dir: 'desc' as 'asc' | 'desc' }
  }

  try {
    const parsed = JSON.parse(raw) as {
      key?: SortKey
      dir?: 'asc' | 'desc'
    }

    const dir: 'asc' | 'desc' = parsed.dir === 'asc' ? 'asc' : 'desc'

    return {
      key: parsed.key ?? 'matches',
      dir,
    }
  } catch {
    return { key: 'matches' as SortKey, dir: 'desc' as 'asc' | 'desc' }
  }
}

export default function MemberMapStatsPage() {
  const params = useParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])

  const [scope, setScope] = useState<Scope>('self')
  const [targetMemberId, setTargetMemberId] = useState<number | null>(null)
  const [bestMode, setBestMode] = useState<BestMode>('duo')
  // Période de la page : URL, puis mémoire de la visite, puis « Tous » (docs/TODO/sticky.md §4.E).
  const { period, setPeriod, ready: periodReady } = usePagePeriod(STANDARD_PERIODS, 'all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState<MapStatsPayload | null>(null)
  // Clan du joueur (fiche membre) : le style de jeu de la période colore les pastilles du périmètre.
  const clanId = usePageData(memberId ? `/api/members/${memberId}` : null, pickClanId).data
  const { colorOf, styleOf } = usePlaystyleColors(clanId, period)
  const [sortKey, setSortKey] = useState<SortKey>(() => readInitialSortPreference().key)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(() => readInitialSortPreference().dir)

  useEffect(() => {
    localStorage.setItem(
      'member-map-stats-sort',
      JSON.stringify({
        key: sortKey,
        dir: sortDir,
      })
    )
  }, [sortDir, sortKey])

  useEffect(() => {
    if (!memberId || !periodReady) {
      return
    }

    let cancelled = false

    async function loadData() {
      setLoading(true)
      setError('')

      try {
        const query = new URLSearchParams({
          scope,
          bestMode,
          period,
        })

        if (scope === 'member' && targetMemberId) {
          query.set('targetMemberId', String(targetMemberId))
        }

        const response = await fetch(`/api/members/${memberId}/map-stats?${query.toString()}`)
        const data = (await response.json()) as MapStatsPayload

        if (!response.ok) {
          throw new Error(data.error ?? 'Impossible de charger les stats par carte')
        }

        if (!cancelled) {
          setPayload(data)
          if (scope === 'member' && data.selected.targetMemberId) {
            setTargetMemberId(data.selected.targetMemberId)
          }
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Impossible de charger les stats par carte'
          )
          setPayload(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadData()

    return () => {
      cancelled = true
    }
  }, [bestMode, memberId, period, periodReady, scope, targetMemberId])

  if (!memberId) {
    return (
      <div className="app-container app-main flex-1 space-y-4">
        <NavigationTrail
          currentLabel="Cartes"
          currentHref={`/members`}
          fallbackParent={{ href: `/members`, label: 'Membres' }}
        />
        <p className="text-sm text-[var(--theme-ui-negative)]">Identifiant de joueur invalide.</p>
      </div>
    )
  }

  const sortedMapStats = [...(payload?.mapStats ?? [])].sort((left, right) => {
    const leftValue = left[sortKey]
    const rightValue = right[sortKey]

    if (leftValue === rightValue) {
      return 0
    }

    if (typeof leftValue === 'string' && typeof rightValue === 'string') {
      const result = leftValue.localeCompare(rightValue)
      return sortDir === 'asc' ? result : -result
    }

    const result = Number(leftValue) - Number(rightValue)
    return sortDir === 'asc' ? result : -result
  })

  // Périmètre : la même pastille que les zones de drop et le calendrier — le joueur, ses meilleures formations, le clan,
  // un autre joueur ; chaque joueur à la couleur de son style de jeu sur la période.
  const members = payload?.options.members ?? []
  const playerName = members.find((entry) => entry.id === memberId)?.displayName ?? 'Le joueur'
  const target = members.find((entry) => entry.id === targetMemberId) ?? null
  const scopeLabel =
    scope === 'self' ? playerName : scope === 'clan' ? 'Tout le clan' : scope === 'best' ? BEST_MODE_LABELS[bestMode] : target?.displayName ?? 'Un joueur'
  const scopeMemberId = scope === 'self' ? memberId : scope === 'member' ? targetMemberId : null

  function chooseScope(next: Scope, options: { mode?: BestMode; target?: number } = {}) {
    setScope(next)
    if (options.mode) setBestMode(options.mode)
    setTargetMemberId(options.target ?? null)
  }

  const scopeItems: PickerItem[] = [
    { key: 'self', label: playerName, color: colorOf(memberId), avatar: true, style: styleOf(memberId), active: scope === 'self', onSelect: () => chooseScope('self') },
    ...(payload?.options.bestModes ?? []).map((mode) => ({
      key: `best-${mode}`,
      label: BEST_MODE_LABELS[mode],
      color: null,
      active: scope === 'best' && bestMode === mode,
      onSelect: () => chooseScope('best', { mode }),
    })),
    { key: 'clan', label: 'Tout le clan', color: null, active: scope === 'clan', onSelect: () => chooseScope('clan') },
    ...members
      .filter((entry) => entry.id !== memberId)
      .map((entry) => ({
        key: `member-${entry.id}`,
        label: entry.displayName,
        color: colorOf(entry.id),
        avatar: true,
        style: styleOf(entry.id),
        active: scope === 'member' && targetMemberId === entry.id,
        onSelect: () => chooseScope('member', { target: entry.id }),
      })),
  ]

  const sortItems: MobileDropdownNavItem[] = (Object.keys(SORT_LABELS) as SortKey[]).map((key) => ({
    key,
    label: SORT_LABELS[key],
    active: sortKey === key,
    onSelect: () => setSortKey(key),
  }))

  const scopeSummary = payload
    ? `${scopeLabel} · ${count.format(payload.totals.rows)} partie${payload.totals.rows > 1 ? 's' : ''} · ${payload.totals.maps} carte${payload.totals.maps > 1 ? 's' : ''}`
    : 'Chargement…'
  const dropdownClass = 'min-w-0 max-w-full'

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    // `.charte` : page migrée vers la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-main-flush game-ui charte flex-1">
      <div className="app-container app-gutter space-y-4">
        <NavigationTrail
          currentLabel="Statistiques Cartes"
          currentHref={`/members/${memberId}/map-stats`}
          fallbackParent={{ href: `/members/${memberId}/dashboard`, label: 'Tableau de bord', altHref: '/members' }}
        />
        <section>
          <MemberPageHeader
            title="Statistique des cartes"
            subtitle="Pilote les performances d’équipe carte par carte avec les filtres actifs."
            showBackButton={false}
            backgroundImage="/map-stats.jpg"
            icon={<Map className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />}
          />
        </section>
      </div>

      <DockingToolbar
        ariaLabel="Filtres des statistiques par carte"
        dockedAside={
          <span className="flex items-center gap-3">
            <span className="whitespace-nowrap text-xs font-semibold text-gray-700">{scopeLabel}</span>
            <SortReminder label={SORT_LABELS[sortKey]} sortDir={sortDir} />
          </span>
        }
      >
        {({ compact }) => (
          <div className="flex w-full flex-wrap items-center gap-3">
            <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} />
            {!compact ? (
              <PickerChip
                ariaLabel="Périmètre"
                label={scopeLabel}
                color={scopeMemberId !== null ? colorOf(scopeMemberId) : null}
                avatar={scopeMemberId !== null}
                items={scopeItems}
                legend={<PlaystyleLegend />}
              />
            ) : null}
          </div>
        )}
      </DockingToolbar>

      <div className="app-container app-gutter flex flex-col gap-4 pb-8 sm:gap-6">
        {error ? <p className="app-panel p-3 text-sm text-[var(--theme-ui-negative)]">{error}</p> : null}

        <section aria-labelledby="map-stats-title" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 id="map-stats-title" className="t-section-title">Performance par carte</h2>
              <p className="t-meta t-num">{scopeSummary}</p>
            </div>
            {/* Tri des cartes : menu de la charte + sens, à la hauteur du menu (une seule hauteur par ligne). */}
            <div className="flex items-stretch gap-2">
              <MobileDropdownNav
                id={`map-stats-sort-${memberId}`}
                label="Trier par"
                currentLabel={SORT_LABELS[sortKey]}
                items={sortItems}
                variant="compact"
                visibilityClass="block"
                className={dropdownClass}
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

          {/* Rechargement : les résultats précédents restent affichés, estompés (la page ne se replie pas). */}
          {loading && !payload ? (
            <p className="app-panel t-body p-6 text-center text-gray-500">Chargement des statistiques par carte…</p>
          ) : !payload || payload.mapStats.length === 0 ? (
            <p className="app-panel t-body p-6 text-center text-gray-500">Aucune statistique disponible pour les filtres sélectionnés.</p>
          ) : (
            <div aria-busy={loading} className={`grid grid-cols-1 gap-3 transition-opacity md:grid-cols-2 xl:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>
              {sortedMapStats.map((entry, index) => {
                const podiumRank = sortKey !== 'mapLabel' && index < 3 ? index + 1 : null

                return (
                  <article key={entry.mapName} aria-label={entry.mapLabel} className="app-panel overflow-hidden p-0">
                    <MapCardBanner mapName={entry.mapName} mapLabel={entry.mapLabel} podiumRank={podiumRank} />

                    <div className="grid grid-cols-4 gap-1.5 p-3">
                      <CompactStat label="Matchs" value={count.format(entry.matches)} tone="neutral" active={sortKey === 'matches'} />
                      <CompactStat label="Victoires" value={count.format(entry.wins)} tone="pos" active={sortKey === 'wins'} />
                      <CompactStat label="Win rate" value={formatPercent(entry.winRate)} tone="pos" active={sortKey === 'winRate'} />
                      <CompactStat label="Top 10" value={formatPercent(entry.top10Rate)} tone="pos" active={sortKey === 'top10Rate'} />

                      <CompactStat label="Place" value={Math.round(entry.avgPlacement)} tone="neutral" active={sortKey === 'avgPlacement'} />
                      <CompactStat label="Kills" value={count.format(entry.totalKills)} tone="neg" active={sortKey === 'totalKills'} />
                      <CompactStat label="Knocks" value={count.format(entry.totalKnockouts)} tone="neg" active={sortKey === 'totalKnockouts'} />
                      <CompactStat label="Headshots" value={count.format(entry.totalHeadshots)} tone="neg" active={sortKey === 'totalHeadshots'} />

                      <CompactStat label="Dégâts" value={count.format(Math.round(entry.totalDamage))} tone="neutral" active={sortKey === 'totalDamage'} />
                      <CompactStat label="Assist." value={count.format(entry.totalAssists)} tone="sky" active={sortKey === 'totalAssists'} />
                      <CompactStat label="Réa." value={count.format(entry.totalRevives)} tone="sky" active={sortKey === 'totalRevives'} />
                      <CompactStat label="Durée" value={formatDuration(entry.avgDurationSeconds)} tone="neutral" active={sortKey === 'avgDurationSeconds'} />
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>
        {/* Les meilleures formations (duo / trio / squad) sont sur le style de jeu du joueur depuis le 2026-10-03. */}
      </div>
    </div>
  )
}
