'use client'

import { AlertTriangle, Target } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { type DropZoneMapViewportHandle } from '@/components/drop-zones/DropZoneMapViewport'
import { MapPager, mapLabel, PickerChip, PlaystyleLegend } from '@/components/maps/MapToolbarControls'
import { PhasePicker } from '@/components/positions/PositionsExplorer'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import PeriodFilter from '@/components/ui/PeriodFilter'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import {
  ArrivalSectors,
  PhaseBreakdown,
  WhoPlaysTheCircle,
  ZoneClosureMap,
  ZoneTarget,
  ZoneTitles,
} from '@/components/zone-closures/ZoneClosureSections'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { usePlaystyleColors } from '@/hooks/usePlaystyleColors'
import { PERIOD_WHEN_LABELS, STANDARD_PERIODS } from '@/lib/period'
import { type TacticalPhase } from '@/lib/tactical-phase'
import {
  rankZoneMembers,
  zoneTitles,
  zoneVerdict,
  type ZoneBandCounts,
  type ZoneMemberStat,
} from '@/lib/zone-closure-view'

type ZoneClosureResponse = {
  selectedMap: string | null
  selectedMapLabel: string | null
  mapOptions: Array<{ mapName: string; label: string; positions: number; matches: number }>
  members: ZoneMemberStat[]
  counts: { positions: number; matches: number; closures: number; members: number; averageSurvivors: number }
  bands: ZoneBandCounts
  averageRatio: number
  byPhase: Array<{ phase: number; positions: number; averageRatio: number; bands: ZoneBandCounts }>
  cells: Array<{ xIndex: number; yIndex: number; count: number }>
  topCities: Array<{ locationId: string; name: string; positions: number; share: number }>
  dataStart: string | null
  error?: string
}

/** Échantillon jugé trop mince pour être commenté : on affiche la valeur, avec une réserve explicite. */
const LOW_SAMPLE_THRESHOLD = 20

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Fin de zone — docs/features/fin-de-zone.md. Page à carte selon la charte (docs/ui/index.html, « Pages à carte »,
 * 04/10/2026) : carte ‹ ›, période et joueur sur une ligne, comme les zones de drop ; la cible et son verdict, trois
 * titres, phase par phase, top 5 des secteurs et « Qui joue le cercle ».
 */
export default function ZoneClosuresPage() {
  const params = useParams()
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const mapViewportRef = useRef<DropZoneMapViewportHandle>(null)

  // Période de la page : URL, puis mémoire de la visite, puis mois (docs/TODO/sticky.md §4.E).
  const { period, setPeriod, ready: periodReady } = usePagePeriod(STANDARD_PERIODS, 'month')
  const [mapName, setMapName] = useState('')
  const [memberId, setMemberId] = useState<number | null>(null)
  const [phase, setPhase] = useState<TacticalPhase>('all')
  const [payload, setPayload] = useState<ZoneClosureResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Pastilles des joueurs : style de jeu dominant sur la période, comme les zones de drop.
  const { colorOf, styleOf } = usePlaystyleColors(clanId, period)

  useEffect(() => {
    if (!clanId || !periodReady) return
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setError('')
        const search = new URLSearchParams({ period, phase })
        if (mapName) search.set('map', mapName)
        if (memberId) search.set('memberId', String(memberId))
        const response = await fetch(`/api/clans/${clanId}/telemetry/zone-closures?${search.toString()}`, {
          cache: 'no-store',
        })
        const data = (await response.json()) as ZoneClosureResponse
        if (cancelled) return
        if (!response.ok) {
          setPayload(null)
          setError(data.error ?? 'Chargement impossible.')
          return
        }
        setPayload(data)
      } catch {
        if (!cancelled) {
          setPayload(null)
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
  }, [clanId, period, periodReady, mapName, memberId, phase])

  const maps = useMemo(() => (payload?.mapOptions ?? []).map((option) => option.mapName), [payload?.mapOptions])
  const activeMap = payload?.selectedMap ?? ''
  const members = useMemo(() => payload?.members ?? [], [payload?.members])
  const ranked = useMemo(() => rankZoneMembers(members), [members])
  const titles = useMemo(() => zoneTitles(members), [members])

  function selectMap(next: string) {
    setMapName(next)
    mapViewportRef.current?.reset()
  }

  function stepMap(direction: 'prev' | 'next') {
    if (maps.length < 2) return
    const index = Math.max(0, maps.indexOf(activeMap))
    selectMap(maps[(index + (direction === 'next' ? 1 : -1) + maps.length) % maps.length])
  }

  if (!clanId) {
    return (
      <div className="app-container app-main flex-1">
        <p className="text-sm text-[var(--theme-ui-negative)]">Clan invalide.</p>
      </div>
    )
  }

  const memberName = memberId !== null ? members.find((member) => member.memberId === memberId)?.displayName ?? null : null
  const totalBands = payload ? payload.bands.center + payload.bands.edge + payload.bands.outside : 0
  const lowSample = totalBands > 0 && totalBands < LOW_SAMPLE_THRESHOLD
  const activeMapLabel = payload?.selectedMapLabel ?? (activeMap ? mapLabel(activeMap) : 'la carte')
  const summary = payload
    ? `${integer.format(payload.counts.closures)} fermetures · ${integer.format(payload.counts.matches)} matchs · ${decimal.format(payload.counts.averageSurvivors)} survivants en moyenne`
    : ''

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    // `.charte` : page migrée vers la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-main-flush game-ui charte flex-1">
      <div className="app-container app-gutter">
        <NavigationTrail
          currentLabel="Fin de zone"
          currentHref={`/clans/${clanId}/stats/zone-closures`}
          fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
        />
        {/* Bandeau photo de la charte, même hauteur que les autres pages (le mur de la zone bleue). */}
        <header
          className="app-on-photo bg-hero-fallback relative min-h-[10rem] overflow-hidden rounded-[14px] bg-cover bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/banner-phases.jpg')`, backgroundPosition: 'center 35%' }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent sm:bg-gradient-to-r sm:from-slate-950/90 sm:via-slate-950/35 sm:to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1.5 px-3.5 py-3 sm:px-6 sm:py-5">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />
              <h1 className="t-banner-title text-white drop-shadow-md">Fin de zone</h1>
            </div>
            <p className="text-[13px] text-white/80 drop-shadow-md sm:text-sm">
              Où le clan finit ses rotations quand le cercle se referme — au centre, au bord, ou encore dehors.
            </p>
          </div>
        </header>
      </div>

      {/*
        Même bandeau que les zones de drop (exception à sticky.md §2, décision du 2026-09-27) : docké sur mobile, il
        garde la carte, la période et le joueur sur une seule ligne — on change de carte en regardant la carte.
      */}
      <DockingToolbar ariaLabel="Filtres de la fin de zone">
        <div className="flex w-full flex-nowrap items-center gap-1.5 sm:gap-2">
          <MapPager maps={maps} activeMap={activeMap} onStep={stepMap} onSelect={selectMap} />
          <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} size="xs" className="map-toolbar-period" />
          <PickerChip
            ariaLabel="Joueur"
            label={memberName ?? 'Tout le clan'}
            color={memberId !== null ? colorOf(memberId) : null}
            avatar={memberId !== null}
            legend={<PlaystyleLegend />}
            items={[
              { key: 'all', label: 'Tout le clan', color: null, count: payload?.counts.positions, active: memberId === null, onSelect: () => setMemberId(null) },
              ...members.map((member) => ({
                key: String(member.memberId),
                label: member.displayName,
                color: colorOf(member.memberId),
                avatar: true,
                style: styleOf(member.memberId),
                count: member.positions,
                active: memberId === member.memberId,
                onSelect: () => setMemberId(member.memberId),
              })),
            ]}
          />
          <span className="ml-auto hidden whitespace-nowrap text-[13px] tabular-nums text-gray-500 lg:inline" data-testid="zone-summary">
            {summary}
          </span>
        </div>
      </DockingToolbar>

      <div className="app-container app-gutter flex flex-col gap-[18px] pb-8">
        {error ? <p className="app-panel p-4 text-sm text-[var(--theme-ui-negative)]">{error}</p> : null}
        {loading && !payload ? <CardSkeleton /> : null}

        {payload && payload.counts.positions === 0 && !loading ? (
          <p className="app-panel-muted p-4 text-sm text-gray-600">
            {memberName ?? 'Le clan'} n’a vécu aucune fin de zone sur {activeMapLabel} {PERIOD_WHEN_LABELS[period]}. Les fermetures sont
            écrites à l’analyse des matchs ; celles dont les positions brutes ont été purgées ne peuvent plus être rattrapées.
          </p>
        ) : null}

        {/* Pendant un rechargement, la page précédente reste affichée, estompée : elle ne se replie pas. */}
        {payload && payload.counts.positions > 0 ? (
          <div className={`flex flex-col gap-[18px] transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            <div className="grid items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_340px]">
              <ZoneClosureMap ref={mapViewportRef} mapName={payload.selectedMap} mapLabel={activeMapLabel} cells={payload.cells} />
              <div className="flex min-w-0 flex-col gap-[18px]">
                <ZoneTarget bands={payload.bands} averageRatio={payload.averageRatio} verdict={zoneVerdict(payload.bands)} />
                <PhasePicker value={phase} onChange={setPhase} meta="filtre les fermetures selon l’avancée de la partie" />
                {lowSample ? (
                  <p className="app-panel-muted flex items-start gap-2 px-3 py-2 text-[13px] text-gray-700">
                    <AlertTriangle className="t-warn mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    Échantillon réduit ({integer.format(totalBands)} observations) : une tendance, pas une statistique.
                  </p>
                ) : null}
              </div>
            </div>

            <ZoneTitles titles={titles} colorOf={colorOf} styleOf={styleOf} />

            <div className="grid items-start gap-[18px] xl:grid-cols-2">
              <PhaseBreakdown phases={payload.byPhase} />
              <ArrivalSectors cities={payload.topCities} dataStart={payload.dataStart} />
            </div>

            <WhoPlaysTheCircle members={ranked} selectedMemberId={memberId} onSelect={setMemberId} colorOf={colorOf} styleOf={styleOf} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
