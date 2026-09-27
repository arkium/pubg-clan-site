'use client'

import { Flame } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useMemo, useState } from 'react'

import {
  DropZonesMap,
  FavoriteSpotCard,
  mapLabel,
  JumpProfileCard,
  MapPager,
  PickerChip,
  TopSpotsList,
  useDropZonesExplorer,
  WhoJumpsWhere,
} from '@/components/drop-zones/DropZonesExplorer'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import PeriodFilter from '@/components/ui/PeriodFilter'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { usePageData } from '@/hooks/usePageData'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { memberColor, type LandingPoint } from '@/lib/drop-zones-view'
import type { MapLocations } from '@/lib/map-location-service'
import { PERIOD_WHEN_LABELS, STANDARD_PERIODS } from '@/lib/period'

type DropZonesPayload = { points: LandingPoint[]; mapLocations: MapLocations }

const pickDropZones = (payload: unknown): DropZonesPayload | null => {
  const data = (payload as { data?: { points?: LandingPoint[]; options?: { mapLocations?: MapLocations } } } | null)?.data
  return data ? { points: data.points ?? [], mapLocations: data.options?.mapLocations ?? {} } : null
}

const NO_POINTS: LandingPoint[] = []
const integer = new Intl.NumberFormat('fr-FR')

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Zones de drop du clan — une question à la fois (maquette « Zones de drop », 2026-09-27 ; docs/features/drop-zones.md).
 * Bandeau sur une ligne (carte ‹ ›, période, joueur), carte à deux lectures avec épingles du top 5, spot favori,
 * profil de saut, top 5, « Qui saute où ». Tout se calcule depuis `points` et `mapLocations`.
 */
export default function ClanDropZonesPage() {
  const params = useParams()
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  // Période de la page : URL, puis mémoire de la visite, puis semaine (docs/TODO/sticky.md §4.E).
  const { period, setPeriod, ready } = usePagePeriod(STANDARD_PERIODS, 'week')
  const [memberId, setMemberId] = useState<number | null>(null)

  const { data, loading, error } = usePageData(
    clanId && ready ? `/api/clans/${clanId}/telemetry/drop-zones?period=${period}` : null,
    pickDropZones
  )
  const points = data?.points ?? NO_POINTS
  const explorer = useDropZonesExplorer(points, data?.mapLocations, memberId)

  // Joueurs de la carte affichée, du plus sauteur au moins sauteur (menu du bandeau).
  const members = useMemo(() => {
    const counts = new Map<number, { name: string; count: number }>()
    for (const point of explorer.mapPoints) {
      const entry = counts.get(point.memberId) ?? { name: point.memberName, count: 0 }
      entry.count += 1
      counts.set(point.memberId, entry)
    }
    for (const point of points) if (!counts.has(point.memberId)) counts.set(point.memberId, { name: point.memberName, count: 0 })
    return Array.from(counts.entries()).sort((a, b) => b[1].count - a[1].count || a[1].name.localeCompare(b[1].name, 'fr'))
  }, [explorer.mapPoints, points])
  const memberName = members.find(([id]) => id === memberId)?.[1].name ?? null

  function selectMember(next: number | null) {
    setMemberId(next)
    explorer.clearFocus()
  }

  if (!clanId) {
    return (
      <div className="app-container app-main flex-1">
        <p className="text-sm text-red-600">Clan invalide.</p>
      </div>
    )
  }

  const mapName = mapLabel(explorer.activeMap)
  const summary = `${integer.format(explorer.profile.jumps)} sauts · ${integer.format(explorer.profile.matches)} matchs`

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    <div className="app-main-flush flex-1">
      <div className="app-container app-gutter">
        <NavigationTrail
          currentLabel="Zones de drop"
          currentHref={`/clans/${clanId}/drop-zones`}
          fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
        />
        <header
          className="relative min-h-[10rem] overflow-hidden rounded-2xl bg-[#1a1208] bg-cover bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/drop2.jpg')`, backgroundPosition: 'center 40%' }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent sm:bg-gradient-to-r sm:from-slate-950/90 sm:via-slate-950/35 sm:to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1.5 px-3.5 py-3 sm:px-6 sm:py-5">
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-orange-400 sm:h-6 sm:w-6" aria-hidden="true" />
              <h1 className="text-[22px] font-black tracking-tight text-white drop-shadow-md sm:text-3xl">Zones de drop</h1>
            </div>
            <p className="text-[13px] text-white/80 drop-shadow-md sm:text-sm">Où le clan saute, et à quel point ça chauffe à l’atterrissage.</p>
          </div>
        </header>
      </div>

      {/*
        Exception à sticky.md §2 (décision du 2026-09-27) : docké sur mobile, le bandeau garde la carte, la période et le
        joueur sur une seule ligne — on change de carte en regardant la carte.
      */}
      <DockingToolbar ariaLabel="Filtres des zones de drop">
        <div className="flex w-full flex-nowrap items-center gap-1.5 sm:gap-2">
          <MapPager explorer={explorer} />
          <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} size="xs" />
          <PickerChip
            ariaLabel="Joueur"
            label={memberName ?? 'Tout le clan'}
            color={memberId !== null ? memberColor(memberId) : null}
            items={[
              { key: 'all', label: 'Tout le clan', color: null, count: explorer.mapPoints.length, active: memberId === null, onSelect: () => selectMember(null) },
              ...members.map(([id, entry]) => ({
                key: String(id),
                label: entry.name,
                color: memberColor(id),
                count: entry.count,
                active: memberId === id,
                onSelect: () => selectMember(id),
              })),
            ]}
          />
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
                  emptyMessage={`${memberName ?? 'Le clan'} n’a pas sauté sur ${mapName} ${PERIOD_WHEN_LABELS[period]}`}
                />
                <div className="flex min-w-0 flex-col gap-[18px]">
                  <FavoriteSpotCard explorer={explorer} title={memberName ? `Spot favori de ${memberName}` : 'Spot favori du clan'} />
                  <JumpProfileCard explorer={explorer} />
                  <TopSpotsList explorer={explorer} showKing={memberId === null} />
                </div>
              </div>
              <WhoJumpsWhere explorer={explorer} periodLabel={PERIOD_WHEN_LABELS[period]} selectedMemberId={memberId} onSelectMember={selectMember} />
            </div>
          ) : (
            <p className="app-panel-muted p-4 text-sm text-gray-500">Aucun saut du clan {PERIOD_WHEN_LABELS[period]}.</p>
          )
        ) : null}
      </div>
    </div>
  )
}
