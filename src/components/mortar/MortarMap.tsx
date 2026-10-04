import Image from 'next/image'
import { Crosshair } from 'lucide-react'
import type { CSSProperties } from 'react'

import { MORTAR_MAP, type MortarPoint } from '@/lib/mortar/mortar-game'
import { FULL_MORTAR_VIEW, viewPercent, type MortarLabelPlacement, type MortarMapView } from '@/lib/mortar/mortar-view'

/**
 * Carte de l'entraînement au mortier (`/mortier`) : l'extrait de Sanhok (`MORTAR_MAP`), sa grille de 100 m, les
 * repères et leurs étiquettes. Grille et lignes en SVG dans le repère de la carte (mètres, `viewBox`) ; repères et
 * étiquettes en HTML, pour garder une taille de texte fixe (≥ 11 px) quelle que soit la largeur de la carte.
 *
 * Photo toujours sombre : `.app-on-photo` donne aux jetons de jeu leur variante sombre dans les deux thèmes, le texte
 * blanc sur voile sombre est celui des autres photos du site.
 */

export type MortarMarkerKind = 'shooter' | 'target' | 'impact-hit' | 'impact-miss' | 'observer'

export type MortarMapMarker = {
  key: string
  kind: MortarMarkerKind
  point: MortarPoint
  label: string
  placement: MortarLabelPlacement
}

export type MortarMapLine = {
  key: string
  from: MortarPoint
  to: MortarPoint
  /** `shot` : trajectoire (tirets blancs sur liseré sombre) ; `measure` : cote de la grille ; `sight` : regard. */
  variant: 'shot' | 'measure' | 'sight'
}

/** Pastille de texte centrée sur un point (distance sur la ligne, cote « 3 carrés »). */
export type MortarMapTag = { key: string; point: MortarPoint; text: string }

const LABEL_TONE: Record<MortarMarkerKind, string> = {
  shooter: 'text-[var(--theme-ui-accent)]',
  target: 'text-[var(--game-neg)]',
  'impact-hit': 'text-white',
  'impact-miss': 'text-white',
  observer: 'text-[var(--game-sky)]',
}

/** Distance (px) entre le centre du repère et son étiquette : la cible est plus grosse que les autres repères. */
const LABEL_GAP: Record<MortarMarkerKind, number> = { shooter: 12, target: 17, 'impact-hit': 11, 'impact-miss': 11, observer: 12 }

function labelTransform({ side, align }: MortarLabelPlacement, gap: number) {
  const x = align === 'start' ? '-8px' : align === 'end' ? 'calc(-100% + 8px)' : '-50%'
  switch (side) {
    case 'above':
      return `translate(${x}, calc(-100% - ${gap}px))`
    case 'below':
      return `translate(${x}, ${gap}px)`
    case 'left':
      return `translate(calc(-100% - ${gap}px), -50%)`
    default:
      return `translate(${gap}px, -50%)`
  }
}

function at(point: MortarPoint, view: MortarMapView): CSSProperties {
  const { left, top } = viewPercent(point, view)
  return { left: `${left}%`, top: `${top}%` }
}

function Marker({ kind }: { kind: MortarMarkerKind }) {
  if (kind === 'target') {
    return (
      <span className="grid h-[26px] w-[26px] place-items-center rounded-full border-2 border-[var(--game-neg)] bg-[var(--game-neg-soft)] text-[var(--game-neg)] shadow-md">
        <Crosshair className="h-4 w-4" aria-hidden="true" />
      </span>
    )
  }
  if (kind === 'shooter') {
    return <span className="block h-3.5 w-3.5 rounded-full bg-[var(--theme-ui-accent)] shadow-[0_0_0_6px_var(--theme-ui-accent-soft)] ring-2 ring-slate-950/75" />
  }
  if (kind === 'observer') {
    return <span className="block h-3.5 w-3.5 rounded-full bg-[var(--game-sky)] ring-2 ring-slate-950/75" />
  }
  return (
    <span
      className={`block h-3 w-3 rounded-full ring-2 ring-white shadow-md ${kind === 'impact-hit' ? 'bg-[var(--game-pos)]' : 'bg-[var(--game-warn)]'}`}
    />
  )
}

/** Grille de 100 m : lignes intérieures au cadre (les bords n'en ont pas). */
function gridLines(view: MortarMapView) {
  const step = MORTAR_MAP.grid
  const xs: number[] = []
  const ys: number[] = []
  for (let x = Math.floor(view.x / step + 1) * step; x < view.x + view.width; x += step) xs.push(x)
  for (let y = Math.floor(view.y / step + 1) * step; y < view.y + view.height; y += step) ys.push(y)
  return { xs, ys }
}

export default function MortarMap({
  view = FULL_MORTAR_VIEW,
  markers,
  lines = [],
  tags = [],
  scaleBar = false,
  label,
  sizes,
  priority = false,
  testId,
}: {
  view?: MortarMapView
  markers: MortarMapMarker[]
  lines?: MortarMapLine[]
  tags?: MortarMapTag[]
  scaleBar?: boolean
  /** Description de la carte pour un lecteur d'écran. */
  label: string
  /** `sizes` de l'image (largeur affichée de l'extrait complet). */
  sizes: string
  priority?: boolean
  testId?: string
}) {
  const { xs, ys } = gridLines(view)
  // Image de l'extrait complet, décalée et agrandie pour n'en montrer que le cadre demandé.
  const imageFrame: CSSProperties = {
    left: `${(-view.x / view.width) * 100}%`,
    top: `${(-view.y / view.height) * 100}%`,
    width: `${(MORTAR_MAP.width / view.width) * 100}%`,
    height: `${(MORTAR_MAP.height / view.height) * 100}%`,
  }

  return (
    <div
      role="img"
      aria-label={label}
      data-testid={testId}
      className="app-on-photo bg-map-fallback relative w-full select-none overflow-hidden rounded-[10px]"
      style={{ aspectRatio: `${view.width} / ${view.height}` }}
    >
      <div className="absolute" style={imageFrame}>
        <Image src={MORTAR_MAP.image} alt="" fill sizes={sizes} priority={priority} draggable={false} className="object-cover" />
      </div>

      <svg
        viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
      >
        <g className="stroke-white/35" strokeWidth={1} vectorEffect="non-scaling-stroke">
          {xs.map((x) => (
            <line key={`x${x}`} x1={x} y1={view.y} x2={x} y2={view.y + view.height} vectorEffect="non-scaling-stroke" />
          ))}
          {ys.map((y) => (
            <line key={`y${y}`} x1={view.x} y1={y} x2={view.x + view.width} y2={y} vectorEffect="non-scaling-stroke" />
          ))}
        </g>
        {lines.map((line) => (
          <g key={line.key} data-line={line.variant}>
            {line.variant === 'shot' ? (
              <line
                x1={line.from.x}
                y1={line.from.y}
                x2={line.to.x}
                y2={line.to.y}
                className="stroke-slate-950/55"
                strokeWidth={4}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            <line
              x1={line.from.x}
              y1={line.from.y}
              x2={line.to.x}
              y2={line.to.y}
              className={line.variant === 'measure' ? 'stroke-[var(--theme-ui-accent)]' : 'stroke-white'}
              strokeWidth={line.variant === 'sight' ? 1.5 : 2}
              strokeDasharray={line.variant === 'sight' ? '2 6' : '10 7'}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}
      </svg>

      {tags.map((tag) => (
        <span
          key={tag.key}
          className="t-num absolute z-10 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-950/80 px-1.5 py-0.5 text-[11px] font-bold leading-4 text-white"
          style={at(tag.point, view)}
        >
          {tag.text}
        </span>
      ))}

      {markers.map((marker) => (
        <span
          key={`label-${marker.key}`}
          data-marker-label={marker.kind}
          className={`absolute z-20 whitespace-nowrap rounded-md bg-slate-950/80 px-1.5 py-0.5 text-[11px] font-bold leading-4 shadow-sm ${LABEL_TONE[marker.kind]}`}
          style={{ ...at(marker.point, view), transform: labelTransform(marker.placement, LABEL_GAP[marker.kind]) }}
        >
          {marker.label}
        </span>
      ))}

      {markers.map((marker) => (
        <span
          key={`marker-${marker.key}`}
          data-marker={marker.kind}
          className="absolute z-30 -translate-x-1/2 -translate-y-1/2"
          style={at(marker.point, view)}
        >
          <Marker kind={marker.kind} />
        </span>
      ))}

      {scaleBar ? (
        // Barre d'échelle : un carré de la grille.
        <div className="absolute bottom-[4%] left-[3%] z-10 flex flex-col items-start gap-1" style={{ width: `${(MORTAR_MAP.grid / view.width) * 100}%` }}>
          <span className="t-num whitespace-nowrap rounded-md bg-slate-950/80 px-1.5 py-0.5 text-[11px] font-bold leading-4 text-white">
            {MORTAR_MAP.grid} m
          </span>
          <span className="block h-1.5 w-full border-x-2 border-b-2 border-white/90" aria-hidden="true" />
        </div>
      ) : null}
    </div>
  )
}
