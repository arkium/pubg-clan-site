'use client'

import { MapPin } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'

import {
  DropZonesMap,
  FavoriteSpotCard,
  JumpProfileCard,
  TopSpotsList,
  useDropZonesExplorer,
  WhoJumpsWhere,
} from '@/components/drop-zones/DropZonesExplorer'
import { MapPager, mapLabel, PickerChip, type PickerItem } from '@/components/maps/MapToolbarControls'
import MemberDropInsights from '@/components/drop-zones/MemberDropInsights'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import PeriodFilter from '@/components/ui/PeriodFilter'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { usePageData } from '@/hooks/usePageData'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { memberColor, type LandingPoint } from '@/lib/drop-zones-view'
import type { MapLocations } from '@/lib/map-location-service'
import { PERIOD_WHEN_LABELS, STANDARD_PERIODS } from '@/lib/period'

type Scope = 'self' | 'member' | 'clan' | 'best'
type BestMode = 'duo' | 'trio' | 'squad'

type MemberDropZonesPayload = {
  member: { id: number; displayName: string; clanId: number | null }
  members: Array<{ id: number; displayName: string }>
  bestModes: BestMode[]
  points: LandingPoint[]
  mapLocations: MapLocations
}

const pickDropZones = (payload: unknown): MemberDropZonesPayload | null => {
  const data = (payload as {
    data?: {
      member: MemberDropZonesPayload['member']
      points?: LandingPoint[]
      options?: { members?: MemberDropZonesPayload['members']; bestModes?: BestMode[]; mapLocations?: MapLocations }
    }
  } | null)?.data
  if (!data) return null
  return {
    member: data.member,
    members: data.options?.members ?? [],
    bestModes: data.options?.bestModes ?? ['duo', 'trio', 'squad'],
    points: data.points ?? [],
    mapLocations: data.options?.mapLocations ?? {},
  }
}

const BEST_MODE_LABELS: Record<BestMode, string> = { duo: 'Son meilleur duo', trio: 'Son meilleur trio', squad: 'Son meilleur squad' }
const NO_POINTS: LandingPoint[] = []
const integer = new Intl.NumberFormat('fr-FR')

function parseMemberId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Zones de drop d'un joueur — même lecture que la page du clan (maquette « Zones de drop », 2026-09-27 ;
 * docs/features/drop-zones.md). Le menu du bandeau choisit le périmètre : le joueur, son meilleur duo / trio / squad,
 * le clan ou un autre joueur. Pression au drop et villes du joueur restent sous la carte.
 */
export default function MemberDropZonesPage() {
  const params = useParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])
  // Période de la page : URL, puis mémoire de la visite, puis semaine (docs/TODO/sticky.md §4.E).
  const { period, setPeriod, ready } = usePagePeriod(STANDARD_PERIODS, 'week')
  const [scope, setScope] = useState<Scope>('self')
  const [bestMode, setBestMode] = useState<BestMode>('duo')
  const [targetMemberId, setTargetMemberId] = useState<number | null>(null)
  // Filtre local « Qui saute où » quand le périmètre compte plusieurs joueurs.
  const [filterMemberId, setFilterMemberId] = useState<number | null>(null)

  const query = new URLSearchParams({ period, scope, bestMode })
  if (scope === 'member' && targetMemberId) query.set('targetMemberId', String(targetMemberId))
  const { data, loading, error } = usePageData(
    memberId && ready ? `/api/members/${memberId}/telemetry/drop-zones?${query.toString()}` : null,
    pickDropZones
  )
  const points = data?.points ?? NO_POINTS
  const explorer = useDropZonesExplorer(points, data?.mapLocations, filterMemberId)
  const severalPlayers = useMemo(() => new Set(points.map((point) => point.memberId)).size > 1, [points])

  if (!memberId) {
    return (
      <div className="app-container app-main flex-1">
        <p className="text-sm text-red-600">Identifiant de joueur invalide.</p>
      </div>
    )
  }

  const playerName = data?.member.displayName ?? 'Le joueur'
  const target = data?.members.find((member) => member.id === targetMemberId) ?? null
  const scopeLabel =
    scope === 'self' ? playerName : scope === 'clan' ? 'Tout le clan' : scope === 'best' ? BEST_MODE_LABELS[bestMode] : target?.displayName ?? 'Un joueur'
  const scopeColor = scope === 'self' ? memberColor(memberId) : scope === 'member' && targetMemberId ? memberColor(targetMemberId) : null

  function chooseScope(next: Scope, options: { mode?: BestMode; target?: number } = {}) {
    setScope(next)
    if (options.mode) setBestMode(options.mode)
    if (options.target) setTargetMemberId(options.target)
    setFilterMemberId(null)
    explorer.clearFocus()
  }

  const items: PickerItem[] = [
    { key: 'self', label: playerName, color: memberColor(memberId), active: scope === 'self', onSelect: () => chooseScope('self') },
    ...(data?.bestModes ?? []).map((mode) => ({
      key: `best-${mode}`,
      label: BEST_MODE_LABELS[mode],
      color: null,
      active: scope === 'best' && bestMode === mode,
      onSelect: () => chooseScope('best', { mode }),
    })),
    { key: 'clan', label: 'Tout le clan', color: null, active: scope === 'clan', onSelect: () => chooseScope('clan') },
    ...(data?.members ?? [])
      .filter((member) => member.id !== memberId)
      .map((member) => ({
        key: `member-${member.id}`,
        label: member.displayName,
        color: memberColor(member.id),
        active: scope === 'member' && targetMemberId === member.id,
        onSelect: () => chooseScope('member', { target: member.id }),
      })),
  ]

  const filterName = filterMemberId !== null ? points.find((point) => point.memberId === filterMemberId)?.memberName ?? null : null
  const who = filterName ?? scopeLabel
  const summary = `${integer.format(explorer.profile.jumps)} sauts · ${integer.format(explorer.profile.matches)} matchs`

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    <div className="app-main-flush flex-1">
      <div className="app-container app-gutter">
        <NavigationTrail
          currentLabel="Zones de drop"
          currentHref={`/members/${memberId}/drop-zones`}
          fallbackParent={{ href: `/members/${memberId}/dashboard`, label: 'Tableau de bord', altHref: '/members' }}
        />
        <header
          className="relative min-h-[10rem] overflow-hidden rounded-2xl bg-[#1a1208] bg-cover bg-center bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/drop-zones.jpg')` }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent sm:bg-gradient-to-r sm:from-slate-950/90 sm:via-slate-950/35 sm:to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1.5 px-3.5 py-3 sm:px-6 sm:py-5">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-amber-400 sm:h-6 sm:w-6" aria-hidden="true" />
              <h1 className="text-[22px] font-black tracking-tight text-white drop-shadow-md sm:text-3xl">Zones de drop</h1>
            </div>
            <p className="text-[13px] text-white/80 drop-shadow-md sm:text-sm">
              {data ? `Où ${playerName} saute, et à quel point ça chauffe à l’atterrissage.` : 'Où le joueur saute, et à quel point ça chauffe à l’atterrissage.'}
            </p>
          </div>
        </header>
      </div>

      {/* Même exception à sticky.md §2 que la page du clan : carte, période et périmètre sur une ligne, aussi sur mobile. */}
      <DockingToolbar ariaLabel="Filtres des zones de drop du joueur">
        <div className="flex w-full flex-nowrap items-center gap-1.5 sm:gap-2">
          <MapPager maps={explorer.maps} activeMap={explorer.activeMap} onStep={explorer.stepMap} onSelect={explorer.selectMap} />
          <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} size="xs" className="map-toolbar-period" />
          <PickerChip ariaLabel="Périmètre" label={scopeLabel} color={scopeColor} items={items} />
          <span className="ml-auto hidden whitespace-nowrap text-[13px] tabular-nums text-gray-500 lg:inline" data-testid="drop-summary">{summary}</span>
        </div>
      </DockingToolbar>

      <div className="app-container app-gutter flex flex-col gap-[18px] pb-8">
        {error ? <p className="app-panel p-4 text-sm text-red-600">{error}</p> : null}
        {!data && loading ? <CardSkeleton /> : null}

        {data ? (
          explorer.maps.length > 0 ? (
            <div className={`flex flex-col gap-[18px] transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
              <div className="grid items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_340px]">
                <DropZonesMap
                  explorer={explorer}
                  emptyMessage={`${who} n’a pas sauté sur ${mapLabel(explorer.activeMap)} ${PERIOD_WHEN_LABELS[period]}`}
                />
                <div className="flex min-w-0 flex-col gap-[18px]">
                  <FavoriteSpotCard explorer={explorer} title={`Spot favori · ${who}`} />
                  <JumpProfileCard explorer={explorer} />
                  <TopSpotsList explorer={explorer} showKing={severalPlayers && filterMemberId === null} />
                </div>
              </div>
              {severalPlayers ? (
                <WhoJumpsWhere
                  explorer={explorer}
                  periodLabel={PERIOD_WHEN_LABELS[period]}
                  selectedMemberId={filterMemberId}
                  onSelectMember={(next) => {
                    setFilterMemberId(next)
                    explorer.clearFocus()
                  }}
                />
              ) : null}
            </div>
          ) : (
            <p className="app-panel-muted p-4 text-sm text-gray-500">
              {scopeLabel} : aucun saut {PERIOD_WHEN_LABELS[period]}.
            </p>
          )
        ) : null}

        {/* Pression au drop et villes du joueur, venues du tableau de bord (2026-09-27, docs/features/membres.md). */}
        {ready ? (
          <section id="drop-insights" aria-label="Pression au drop et villes" className="pt-2">
            <MemberDropInsights memberId={memberId} clanId={data?.member.clanId ?? null} period={period} />
          </section>
        ) : null}
      </div>
    </div>
  )
}
