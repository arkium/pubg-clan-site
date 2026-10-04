'use client'

/* eslint-disable @next/next/no-img-element -- fond de carte local, calque positionné en pourcentage */

import { Crosshair, MapPinPlus } from 'lucide-react'
import type { ReactNode, Ref } from 'react'

import DropZoneMapViewport, { type DropZoneMapViewportHandle } from '@/components/drop-zones/DropZoneMapViewport'
import { FAMILY_ICONS, KIND_ICONS } from '@/components/resources/resource-icons'
import type { ObservedSpotView, ResourceDropZoneCenter, ResourcePointView } from '@/lib/resources/resource-api'
import { resourceMapImage, type ResourceMapDefinition, type ResourcePointKind } from '@/lib/resources/resource-map'
import { familyTopShares, mapPercent, metersFromPercent, observedMarkerStyle, pointMarkerName, spotKey, spotMarkerName } from '@/lib/resources/resource-view'

/**
 * Carte de la Carte des ressources : image de la map, zoom et déplacement de `DropZoneMapViewport` (MapZoomControl,
 * docs/ui/index.html#zoom-carte), marqueurs en HTML (taille fixe quel que soit le zoom, ≥ 11 px de texte).
 *
 * Marqueurs (maquette) : **observés** = ronds clairs à l'icône de la famille, taille et opacité selon la fréquence ;
 * **saisis validés** = carrés sombres bordés à l'icône du type ; **à confirmer** = bordure orange en pointillés ;
 * **en attente** = pointillés ; sélection = anneau d'accent. Pendant un parcours « placer », un clic hors d'un marqueur
 * pose le point (les marqueurs laissent passer le clic) ; ailleurs, les marqueurs sont des boutons.
 *
 * Photo toujours sombre : blanc et voile ardoise en classes Tailwind non remappées (`bg-white/95`, `border-white/90`,
 * `bg-slate-950/…`), comme les autres cartes du site.
 */

export type ResourceSelection = { type: 'point'; id: string } | { type: 'spot'; key: string }

type Props = {
  viewportRef: Ref<DropZoneMapViewportHandle>
  /** Carte affichée : celle de la réponse reçue (l'ancienne reste, estompée, pendant le chargement d'une autre). */
  map: ResourceMapDefinition
  spots: ObservedSpotView[]
  points: ResourcePointView[]
  selection: ResourceSelection | null
  /** Point en cours de placement (proposition ou nouvelle position d'un signalement). */
  draft: { x: number; y: number; kind: ResourcePointKind | null } | null
  placing: boolean
  /** Marqueurs cliquables (faux pendant un parcours). */
  interactive: boolean
  near: { centers: ResourceDropZoneCenter[]; radius: number } | null
  faded: boolean
  onSelect: (selection: ResourceSelection) => void
  onPlace: (position: { x: number; y: number }) => void
  /** Encart posé sur la carte (aucun point saisi). */
  overlay?: ReactNode
}

/** Zoom jusqu'à ×8 : placer un point au plus près (une carte de 8 km, soit environ 1,6 m par pixel sur un écran de bureau). */
export const RESOURCE_MAP_MAX_ZOOM = 8

const SQUARE = 'absolute grid h-[26px] w-[26px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-[6px] border-2'

function pointTone(point: ResourcePointView) {
  if (point.state === 'to_confirm') return 'border-dashed border-[var(--game-warn)] bg-slate-950/90 text-white'
  if (point.state === 'pending') return 'border-dashed border-white/90 bg-slate-950/60 text-white'
  return 'border-white/90 bg-slate-950/90 text-white'
}

export default function ResourceMapCanvas({
  viewportRef,
  map,
  spots,
  points,
  selection,
  draft,
  placing,
  interactive,
  near,
  faded,
  onSelect,
  onPlace,
  overlay,
}: Props) {
  const markerEvents = interactive ? '' : 'pointer-events-none'
  // Taille d'un marqueur observé relative au plus fréquent de sa famille parmi les emplacements affichés.
  const familyTop = familyTopShares(spots)

  return (
    <div
      className="isolate overflow-hidden rounded-[14px] border border-gray-200"
      role="group"
      aria-label={`Carte ${map.label}`}
      aria-busy={faded}
      data-testid="resource-map"
      data-map={map.key}
      data-placing={placing ? 'true' : undefined}
    >
      <DropZoneMapViewport
        ref={viewportRef}
        showBoundaryControl={false}
        maxZoom={RESOURCE_MAP_MAX_ZOOM}
        onMapClick={placing ? (xPct, yPct) => onPlace(metersFromPercent(map.sizeMeters, xPct, yPct)) : undefined}
        overlay={
          <>
            {placing ? (
              <div
                role="status"
                className="pointer-events-none absolute left-3 top-3 z-40 flex min-h-10 max-w-[calc(100%-12rem)] items-center gap-2 rounded border border-white/25 bg-slate-950/80 px-3 py-1.5 text-xs font-semibold text-white shadow-lg backdrop-blur"
                data-testid="resource-place-hint"
              >
                <Crosshair className="h-4 w-4 shrink-0 text-[var(--theme-ui-accent)]" aria-hidden="true" />
                Clique sur la carte pour placer le point
              </div>
            ) : null}
            {overlay}
          </>
        }
      >
        <div className={`absolute inset-0 transition-opacity duration-200 ${faded ? 'opacity-60' : ''}`}>
          <img src={resourceMapImage(map.key)} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
          {/* Voile de la charte sur une carte PUBG : rgba(2, 6, 23, .35). */}
          <div className="absolute inset-0 bg-slate-950/35" />

          {near
            ? near.centers.map((center) => {
                const { left, top } = mapPercent(map.sizeMeters, center)
                return (
                  <span
                    key={`near:${center.name}`}
                    className="pointer-events-none absolute aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-dashed border-white/40 bg-[var(--theme-ui-accent-tint)]"
                    style={{ left: `${left}%`, top: `${top}%`, width: `${((near.radius * 2) / map.sizeMeters) * 100}%` }}
                    data-testid="resource-near-circle"
                  >
                    <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-950/80 px-1.5 py-0.5 text-[11px] font-bold leading-4 text-white">
                      {center.name}
                    </span>
                  </span>
                )
              })
            : null}

          {spots.map((spot) => {
            const key = spotKey(spot)
            const selected = selection?.type === 'spot' && selection.key === key
            const { size, opacity } = observedMarkerStyle(spot.share, familyTop.get(spot.family) ?? spot.share)
            const { left, top } = mapPercent(map.sizeMeters, spot)
            const Icon = FAMILY_ICONS[spot.family]
            const iconSize = Math.max(10, Math.round(size * 0.55))
            return (
              <button
                key={key}
                type="button"
                onClick={() => onSelect({ type: 'spot', key })}
                tabIndex={interactive ? undefined : -1}
                aria-label={spotMarkerName(spot)}
                aria-pressed={selected}
                className={`absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-slate-950 ${
                  selected ? 'z-30 shadow-[0_0_0_3px_var(--theme-ui-accent)]' : 'z-10 shadow-md shadow-slate-950/60'
                } ${markerEvents}`}
                style={{ left: `${left}%`, top: `${top}%`, width: size, height: size, opacity: selected ? 1 : opacity }}
                data-testid="resource-spot"
                data-family={spot.family}
                data-size={size}
              >
                <Icon style={{ width: iconSize, height: iconSize }} strokeWidth={2.25} aria-hidden="true" />
              </button>
            )
          })}

          {points.map((point) => {
            const selected = selection?.type === 'point' && selection.id === point.id
            const { left, top } = mapPercent(map.sizeMeters, point)
            const Icon = KIND_ICONS[point.kind]
            return (
              <button
                key={point.id}
                type="button"
                onClick={() => onSelect({ type: 'point', id: point.id })}
                tabIndex={interactive ? undefined : -1}
                aria-label={pointMarkerName(point)}
                aria-pressed={selected}
                className={`${SQUARE} ${pointTone(point)} ${
                  selected ? 'z-30 shadow-[0_0_0_3px_var(--theme-ui-accent)]' : 'z-20 shadow-md shadow-slate-950/50'
                } ${markerEvents}`}
                style={{ left: `${left}%`, top: `${top}%` }}
                data-testid="resource-point"
                data-point-id={point.id}
                data-state={point.state}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
              </button>
            )
          })}

          {draft
            ? (() => {
                const { left, top } = mapPercent(map.sizeMeters, draft)
                const Icon = draft.kind ? KIND_ICONS[draft.kind] : MapPinPlus
                return (
                  <span
                    className={`${SQUARE} pointer-events-none z-40 border-dashed border-[var(--theme-ui-accent)] bg-slate-950/80 text-[var(--theme-ui-accent)] shadow-[0_0_0_4px_var(--theme-ui-accent-soft)]`}
                    style={{ left: `${left}%`, top: `${top}%` }}
                    data-testid="resource-draft"
                  >
                    <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
                  </span>
                )
              })()
            : null}
        </div>
      </DropZoneMapViewport>
    </div>
  )
}
