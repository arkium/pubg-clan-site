'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { CalendarDays } from 'lucide-react'

import { MapPager, mapLabel, PickerChip, PlaystyleLegend, type PickerItem } from '@/components/maps/MapToolbarControls'
import MemberPageHeader from '@/components/member/MemberPageHeader'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import PeriodFilter from '@/components/ui/PeriodFilter'
import { usePageData } from '@/hooks/usePageData'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { usePlaystyleColors } from '@/hooks/usePlaystyleColors'
import {
  ACTIVITY_DAY_LABELS,
  activityByDay,
  activityHourLabel,
  activityLevel,
  busiestSlot,
  plural,
} from '@/lib/activity-heatmap'
import { formatPlayTime } from '@/lib/match-sessions'
import { PERIOD_WHEN_LABELS, STANDARD_PERIODS, type StandardPeriod } from '@/lib/period'

type HeatmapScope = 'self' | 'member' | 'clan' | 'best'
type BestMode = 'duo' | 'trio' | 'squad'
// Semaine et mois calendaires, comme partout ailleurs (docs/TODO/sticky.md §2).
type HeatmapPeriod = StandardPeriod

type HeatmapCell = {
  day: string
  dayIndex: number
  hour: number
  count: number
}

type HeatmapPayload = {
  scope: HeatmapScope
  scopeLabel: string
  options: {
    members: Array<{
      id: number
      displayName: string
    }>
    bestModes: BestMode[]
    mapNames: string[]
    mapLabels: Record<string, string>
  }
  selected: {
    memberId: number
    targetMemberId: number | null
    bestMode: BestMode
    period: HeatmapPeriod
    mapName: string
  }
  matchCount: number
  heatmap: HeatmapCell[]
  maxCellCount: number
  playtimeSeconds: number
  activeDays: number
  error?: string
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

/**
 * Calendrier d'activité d'un joueur — migré vers la charte le 2026-10-03 (docs/ui/index.html) : échelle séquentielle
 * `app-seq-*` (rampe jaune) au lieu du cyan, KPI de la charte, résumé sous le titre au lieu d'un encart dans le bandeau.
 */
export default function MemberHeatmapPage() {
  const params = useParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])

  const [scope, setScope] = useState<HeatmapScope>('self')
  const [targetMemberId, setTargetMemberId] = useState<number | null>(null)
  const [bestMode, setBestMode] = useState<BestMode>('duo')
  // Période de la page : URL, puis mémoire de la visite, puis « Tous » (docs/TODO/sticky.md §4.E).
  const { period, setPeriod, ready: periodReady } = usePagePeriod(STANDARD_PERIODS, 'all')
  const [mapName, setMapName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState<HeatmapPayload | null>(null)
  // Clan du joueur (fiche membre) : le style de jeu de la période colore les pastilles du périmètre.
  const clanId = usePageData(memberId ? `/api/members/${memberId}` : null, pickClanId).data
  const { colorOf, styleOf } = usePlaystyleColors(clanId, period)

  useEffect(() => {
    if (!memberId || !periodReady) {
      return
    }

    let cancelled = false

    async function loadHeatmap() {
      setLoading(true)
      setError('')

      try {
        const params = new URLSearchParams({
          scope,
          bestMode,
          period,
        })

        if (scope === 'member' && targetMemberId) {
          params.set('targetMemberId', String(targetMemberId))
        }

        if (mapName) {
          params.set('mapName', mapName)
        }

        const response = await fetch(`/api/members/${memberId}/activity-heatmap?${params.toString()}`)
        const data = (await response.json()) as HeatmapPayload

        if (!response.ok) {
          throw new Error(data.error ?? 'Impossible de charger la heatmap')
        }

        if (!cancelled) {
          setPayload(data)
          if (scope === 'member' && data.selected.targetMemberId) {
            setTargetMemberId(data.selected.targetMemberId)
          }
          setMapName(data.selected.mapName)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Impossible de charger la heatmap')
          setPayload(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadHeatmap()

    return () => {
      cancelled = true
    }
  }, [bestMode, mapName, memberId, period, periodReady, scope, targetMemberId])

  if (!memberId) {
    return (
      <div className="app-container app-main flex-1 space-y-4">
        <NavigationTrail
          currentLabel="Calendrier"
          currentHref={`/members`}
          fallbackParent={{ href: `/members`, label: 'Membres' }}
        />
        <p className="text-sm text-[var(--theme-ui-negative)]">Identifiant de joueur invalide.</p>
      </div>
    )
  }

  const cells = payload?.heatmap ?? []
  const dayTotals = activityByDay(cells)
  const countsByDayHour = new Map<string, number>()
  for (const cell of cells) countsByDayHour.set(`${cell.dayIndex}-${cell.hour}`, cell.count)
  const getCellCount = (dayIndex: number, hour: number) => countsByDayHour.get(`${dayIndex}-${hour}`) ?? 0
  const max = payload?.maxCellCount ?? 0
  const slot = busiestSlot(cells)
  const cellTitle = (dayIndex: number, hour: number, count: number) => `${ACTIVITY_DAY_LABELS[dayIndex]} ${activityHourLabel(hour)} : ${plural(count, 'partie')}`

  // Périmètre : la même pastille que les zones de drop du joueur — le joueur, ses meilleures formations, le clan, un autre
  // joueur ; chaque joueur à la couleur de son style de jeu sur la période.
  const members = payload?.options.members ?? []
  const playerName = members.find((entry) => entry.id === memberId)?.displayName ?? 'Le joueur'
  const target = members.find((entry) => entry.id === targetMemberId) ?? null
  const scopeLabel =
    scope === 'self' ? playerName : scope === 'clan' ? 'Tout le clan' : scope === 'best' ? BEST_MODE_LABELS[bestMode] : target?.displayName ?? 'Un joueur'
  const scopeMemberId = scope === 'self' ? memberId : scope === 'member' ? targetMemberId : null

  function chooseScope(next: HeatmapScope, options: { mode?: BestMode; target?: number } = {}) {
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

  // Carte : le sélecteur ‹ › des pages à carte, avec une première entrée « Toutes » (toutes les cartes).
  const mapChoices = ['', ...(payload?.options.mapNames ?? [])]
  const mapChoiceLabel = (entry: string) => (entry === '' ? 'Toutes' : (payload?.options.mapLabels?.[entry] ?? mapLabel(entry)))
  function stepMap(direction: 'prev' | 'next') {
    const index = Math.max(0, mapChoices.indexOf(mapName))
    const next = (index + (direction === 'next' ? 1 : -1) + mapChoices.length) % mapChoices.length
    setMapName(mapChoices[next])
  }

  const summary = payload
    ? `${scopeLabel} · ${plural(payload.matchCount, 'partie')} ${PERIOD_WHEN_LABELS[period]}${mapName ? ` · ${mapChoiceLabel(mapName)}` : ''}`
    : 'Chargement…'

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    // `.charte` : page migrée vers la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-main-flush game-ui charte flex-1">
      <div className="app-container app-gutter space-y-4">
        <NavigationTrail
          currentLabel="Calendrier"
          currentHref={`/members/${memberId}/heatmap`}
          fallbackParent={{ href: `/members/${memberId}/dashboard`, label: 'Tableau de bord', altHref: '/members' }}
        />
        <section>
          <MemberPageHeader
            title="Calendrier d’activité"
            subtitle="Quand il joue : ses parties par jour de la semaine et par heure."
            showBackButton={false}
            backgroundImage="/heatmap.jpg"
            icon={<CalendarDays className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />}
          />
        </section>
      </div>

      {/* Même bandeau que les zones de drop : carte ‹ ›, période et périmètre sur une ligne ; docké sur mobile, la période seule. */}
      <DockingToolbar
        ariaLabel="Filtres du calendrier d'activité"
        dockedAside={<span className="whitespace-nowrap text-xs font-semibold text-gray-700">{scopeLabel}{mapName ? ` · ${mapChoiceLabel(mapName)}` : ''}</span>}
      >
        {({ compact }) => (
          <div className="flex w-full flex-nowrap items-center gap-1.5 sm:gap-2">
            {!compact ? <MapPager maps={mapChoices} activeMap={mapName} onStep={stepMap} onSelect={setMapName} labelOf={mapChoiceLabel} /> : null}
            <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} size="xs" className="map-toolbar-period" />
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

      <div className="app-container app-gutter flex flex-col gap-4 pb-8">
        {error ? <p className="app-panel p-3 text-sm text-[var(--theme-ui-negative)]">{error}</p> : null}

        <div className="flex flex-col gap-0.5">
          <h2 className="t-section-title">Activité</h2>
          <p className="t-meta t-num" data-testid="heatmap-summary">{summary}</p>
        </div>

        {/* Rechargement : les résultats précédents restent affichés, estompés (la page ne se replie pas). */}
        {loading && !payload ? (
          <p className="app-panel t-body p-6 text-center text-gray-500">Chargement du calendrier…</p>
        ) : !payload || cells.length === 0 ? (
          <p className="app-panel t-body p-6 text-center text-gray-500">Aucune partie pour ce filtre {PERIOD_WHEN_LABELS[period]}.</p>
        ) : (
          <div aria-busy={loading} className={`flex flex-col gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
            <dl className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              <div className="app-panel app-kpi">
                <dt className="t-label">Temps de jeu</dt>
                <dd className="t-hero t-hero--md text-gray-900">{formatPlayTime(payload.playtimeSeconds)}</dd>
                <dd className="t-meta">cumulé sur la période</dd>
              </div>
              <div className="app-panel app-kpi">
                <dt className="t-label">Jours actifs</dt>
                <dd className="t-hero t-hero--md text-gray-900">{payload.activeDays}</dd>
                <dd className="t-meta">avec au moins une partie</dd>
              </div>
              <div className="app-panel app-kpi">
                <dt className="t-label">Parties</dt>
                <dd className="t-hero t-hero--md text-gray-900">{payload.matchCount}</dd>
                <dd className="t-meta">prises en compte</dd>
              </div>
              <div className="app-panel app-kpi" data-testid="busiest-slot">
                <dt className="t-label">Créneau favori</dt>
                <dd className="t-hero t-hero--md t-accent">{slot ? `${ACTIVITY_DAY_LABELS[slot.dayIndex]} ${activityHourLabel(slot.hour)}` : '—'}</dd>
                <dd className="t-meta">{slot ? `${plural(slot.count, 'partie')} sur ce créneau` : 'aucune partie'}</dd>
              </div>
            </dl>

            <section aria-labelledby="heatmap-grid-title" className="app-panel flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                <h3 id="heatmap-grid-title" className="t-card-title">Par jour et par heure</h3>
                <span className="t-meta">heure de Paris · total par jour à côté du jour</span>
              </div>

              {/* Mobile : les jours en colonnes, les heures en lignes (24 lignes plutôt que 24 colonnes illisibles). */}
              <div className="md:hidden">
                <div className="mb-1.5 grid grid-cols-[40px_repeat(7,minmax(0,1fr))] gap-1">
                  <div />
                  {ACTIVITY_DAY_LABELS.map((dayLabel, dayIndex) => (
                    <div key={`mobile-day-head-${dayLabel}`} className="t-num text-center text-[11px] leading-tight text-gray-500">
                      <div className="font-semibold text-gray-700">{dayLabel}</div>
                      <div>{dayTotals[dayIndex]}</div>
                    </div>
                  ))}
                </div>
                {Array.from({ length: 24 }, (_, hour) => (
                  <div key={`mobile-hour-${hour}`} className="mb-1 grid grid-cols-[40px_repeat(7,minmax(0,1fr))] gap-1">
                    <div className="t-num flex items-center justify-end pr-1 text-[11px] text-gray-500">{activityHourLabel(hour)}</div>
                    {ACTIVITY_DAY_LABELS.map((dayLabel, dayIndex) => {
                      const count = getCellCount(dayIndex, hour)
                      return <div key={`mobile-${dayLabel}-${hour}`} className={`h-5 rounded-[4px] app-seq-${activityLevel(count, max)}`} title={cellTitle(dayIndex, hour, count)} />
                    })}
                  </div>
                ))}
              </div>

              <div className="hidden md:block">
                <div className="mb-1.5 grid grid-cols-[72px_repeat(24,minmax(0,1fr))] gap-1 lg:grid-cols-[90px_repeat(24,minmax(0,1fr))]">
                  <div />
                  {Array.from({ length: 24 }, (_, hour) => (
                    <div key={`hour-head-${hour}`} className="t-num text-center text-[11px] text-gray-500">
                      {hour % 3 === 0 ? activityHourLabel(hour) : ''}
                    </div>
                  ))}
                </div>
                {ACTIVITY_DAY_LABELS.map((dayLabel, dayIndex) => (
                  <div key={`day-${dayLabel}`} className="mb-1 grid grid-cols-[72px_repeat(24,minmax(0,1fr))] gap-1 lg:grid-cols-[90px_repeat(24,minmax(0,1fr))]">
                    <div className="flex items-center justify-between pr-1 text-xs text-gray-700 lg:pr-2">
                      <span className="font-semibold">{dayLabel}</span>
                      <span className="t-num text-[11px] text-gray-500">{dayTotals[dayIndex]}</span>
                    </div>
                    {Array.from({ length: 24 }, (_, hour) => {
                      const count = getCellCount(dayIndex, hour)
                      return <div key={`${dayLabel}-${hour}`} className={`h-5 rounded-[4px] lg:h-6 app-seq-${activityLevel(count, max)}`} title={cellTitle(dayIndex, hour, count)} />
                    })}
                  </div>
                ))}
              </div>

              {/* Échelle séquentielle de la charte : la rampe jaune (app-seq-0 à 4), comme le calendrier du tableau de bord. */}
              <div className="flex items-center gap-1.5 text-[11px] text-gray-500" data-testid="heatmap-legend">
                <span>Aucune</span>
                {([0, 1, 2, 3, 4] as const).map((level) => (
                  <span key={level} className={`h-3 w-5 rounded-[3px] app-seq-${level}`} aria-hidden="true" />
                ))}
                <span>Le plus joué</span>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}
