'use client'

import { ArrowRight, Binoculars, CloudSun, Crosshair, LandPlot, Ruler, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import {
  MORTAR_ELEVATION_FACTOR,
  MORTAR_RANGE,
  formatMeters,
  gridDistance,
  mortarGridTable,
  type MortarDifficulty,
} from '@/lib/mortar/mortar-game'

import MortarMap from './MortarMap'

/**
 * Onglet « Guide » de `/mortier` : quatre fiches numérotées (illustration à gauche, au-dessus sur mobile), chacune avec
 * « S'entraîner → » qui ouvre l'entraînement à la difficulté adaptée.
 */

const GUIDE_MAP_SIZES = '(min-width: 640px) 560px, 200vw'

/** Exemple de la fiche 02 : 3 carrés en largeur, 2 en hauteur. */
const GRID_EXAMPLE = { across: 3, down: 2 } as const
const GRID_EXAMPLE_DISTANCE = gridDistance(GRID_EXAMPLE.across, GRID_EXAMPLE.down)

function GuideCard({
  number,
  title,
  illustration,
  level,
  onTrain,
  children,
}: {
  number: string
  title: string
  illustration: ReactNode
  level: MortarDifficulty
  onTrain: (level: MortarDifficulty) => void
  children: ReactNode
}) {
  const titleId = `mortar-guide-${number}`
  return (
    <article aria-labelledby={titleId} className="app-panel grid gap-4 p-4 sm:grid-cols-[minmax(0,280px)_minmax(0,1fr)] sm:gap-5 sm:p-5" data-testid="mortar-guide-card">
      <div className="min-w-0">{illustration}</div>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex items-baseline gap-2.5">
          <span className="t-hero t-hero--sm t-accent" aria-hidden="true">
            {number}
          </span>
          <h2 id={titleId} className="t-section-title">
            {title}
          </h2>
        </div>
        {children}
        <button
          type="button"
          onClick={() => onTrain(level)}
          aria-describedby={titleId}
          className="app-link t-body inline-flex items-center gap-1 self-start font-semibold"
        >
          S’entraîner
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </article>
  )
}

// ── 01 · Les bases ─────────────────────────────────────────────────────────────────────────────────

const BASICS: Array<{ icon: LucideIcon; label: string }> = [
  { icon: LandPlot, label: 'Sol à plat' },
  { icon: CloudSun, label: 'Ciel dégagé' },
  { icon: Ruler, label: `${MORTAR_RANGE.min} à ${MORTAR_RANGE.max} m` },
]

function RangeBar() {
  const blocked = (MORTAR_RANGE.min / MORTAR_RANGE.max) * 100
  return (
    <figure className="flex flex-col gap-1.5">
      <div className="relative h-3 overflow-hidden rounded-full bg-[var(--game-track)]" aria-hidden="true">
        <span
          className="absolute inset-y-0 left-0 bg-[repeating-linear-gradient(135deg,var(--theme-ui-text-muted)_0_2px,transparent_2px_6px)] opacity-70"
          style={{ width: `${blocked}%` }}
        />
        <span className="absolute inset-y-0 right-0 bg-[var(--theme-ui-accent)]" style={{ left: `${blocked}%` }} />
      </div>
      <div className="t-num relative h-4 text-[11px] font-semibold text-gray-500" aria-hidden="true">
        <span className="absolute left-0">0</span>
        <span className="absolute -translate-x-1/2" style={{ left: `${blocked}%` }}>
          {MORTAR_RANGE.min}
        </span>
        <span className="absolute right-0">{MORTAR_RANGE.max} m</span>
      </div>
      <figcaption className="t-meta">Hachuré : trop près, le mortier refuse de tirer.</figcaption>
    </figure>
  )
}

function BasicsIllustration() {
  return (
    <div className="flex flex-col gap-3">
      <ul className="grid grid-cols-3 gap-2">
        {BASICS.map(({ icon: Icon, label }) => (
          <li key={label} className="app-panel-muted flex min-w-0 flex-col items-center gap-1.5 px-1.5 py-3 text-center">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-[var(--theme-ui-accent-soft)] text-[var(--theme-ui-accent-text)]">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-[12px] font-semibold leading-tight text-gray-900">{label}</span>
          </li>
        ))}
      </ul>
      <RangeBar />
    </div>
  )
}

// ── 02 · Mesurer à la grille ───────────────────────────────────────────────────────────────────────

/** Recadrage de 5 × 3 carrés autour de Bootcamp ; toi et la cible au centre de leur carré. */
const GRID_VIEW = { x: 400, y: 100, width: 500, height: 300 }
const GRID_SHOOTER = { x: 450, y: 150 }
const GRID_TARGET = { x: GRID_SHOOTER.x + GRID_EXAMPLE.across * 100, y: GRID_SHOOTER.y + GRID_EXAMPLE.down * 100 }

function GridIllustration() {
  const corner = { x: GRID_TARGET.x, y: GRID_SHOOTER.y }
  return (
    <MortarMap
      view={GRID_VIEW}
      label={`Mesure à la grille : ${GRID_EXAMPLE.across} carrés en largeur, ${GRID_EXAMPLE.down} en hauteur, soit ${formatMeters(GRID_EXAMPLE_DISTANCE)}`}
      sizes={GUIDE_MAP_SIZES}
      markers={[
        { key: 'shooter', kind: 'shooter', point: GRID_SHOOTER, label: 'Toi', placement: { side: 'below', align: 'start' } },
        { key: 'target', kind: 'target', point: GRID_TARGET, label: 'Cible', placement: { side: 'right', align: 'center' } },
      ]}
      lines={[
        { key: 'across', from: GRID_SHOOTER, to: corner, variant: 'measure' },
        { key: 'down', from: corner, to: GRID_TARGET, variant: 'measure' },
        { key: 'shot', from: GRID_SHOOTER, to: GRID_TARGET, variant: 'shot' },
      ]}
      tags={[
        { key: 'across', point: { x: (GRID_SHOOTER.x + corner.x) / 2, y: corner.y }, text: `${GRID_EXAMPLE.across} carrés` },
        { key: 'down', point: { x: corner.x, y: (corner.y + GRID_TARGET.y) / 2 }, text: `${GRID_EXAMPLE.down} carrés` },
        {
          key: 'distance',
          point: { x: (GRID_SHOOTER.x + GRID_TARGET.x) / 2, y: (GRID_SHOOTER.y + GRID_TARGET.y) / 2 },
          text: formatMeters(GRID_EXAMPLE_DISTANCE),
        },
      ]}
      testId="mortar-guide-grid-map"
    />
  )
}

function GridTable() {
  const rows = mortarGridTable(5)
  return (
    <figure className="flex max-w-[360px] flex-col gap-1.5">
      <div className="app-table-shell overflow-hidden">
        <table className="w-full table-fixed text-center text-[12px]" data-testid="mortar-grid-table">
          <caption className="sr-only">Distance à plat selon les carrés comptés en largeur (L) et en hauteur (H)</caption>
          <thead className="app-table-head">
            <tr>
              <th scope="col" className="t-label py-1.5">
                H\L
              </th>
              {rows[0].cells.map((cell) => (
                <th key={cell.across} scope="col" className="t-label t-num py-1.5">
                  {cell.across}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.down} className="app-table-row last:border-b-0">
                <th scope="row" className="t-label t-num py-1">
                  {row.down}
                </th>
                {row.cells.map((cell) => {
                  const example = row.down === GRID_EXAMPLE.down && cell.across === GRID_EXAMPLE.across
                  if (cell.distance === 0) {
                    return (
                      <td key={cell.across} className="py-1 text-gray-500">
                        —
                      </td>
                    )
                  }
                  return (
                    <td
                      key={cell.across}
                      data-in-range={cell.inRange}
                      data-example={example || undefined}
                      className={`t-num py-1 ${
                        example
                          ? 'bg-[var(--theme-ui-accent-soft)] font-bold text-[var(--theme-ui-accent-text)] shadow-[inset_0_0_0_1px_var(--theme-ui-accent-ring)]'
                          : cell.inRange
                            ? 'font-semibold text-gray-900'
                            : 'text-gray-500 line-through'
                      }`}
                    >
                      {cell.distance}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="t-meta">Carrés en largeur (L) × en hauteur (H). Gris : hors portée.</figcaption>
    </figure>
  )
}

// ── 03 · Corriger le tir ───────────────────────────────────────────────────────────────────────────

/** Trajectoire en cloche de toi (en bas à gauche) vers une cible sur une hauteur, avec la cote du dénivelé. */
function CorrectionIllustration() {
  // Couleurs par classes (jetons du thème) : un `var()` dans un attribut de présentation SVG n'est pas fiable partout.
  return (
    <svg viewBox="0 0 300 160" className="block h-auto w-full max-w-[320px]" role="img" aria-label="Trajectoire en cloche vers une cible plus haute que toi">
      {/* Terrain : plat sous toi, colline sous la cible. */}
      <path
        d="M0 132 L150 132 C190 132 200 92 240 90 L300 90 L300 160 L0 160 Z"
        className="fill-[var(--game-track)] stroke-[var(--theme-ui-border)]"
        strokeWidth="1.5"
      />
      {/* Niveau du tireur, prolongé sous la cible. */}
      <line x1="30" y1="132" x2="290" y2="132" className="stroke-[var(--theme-ui-text-muted)]" strokeWidth="1" strokeDasharray="3 4" />
      {/* Cote du dénivelé. */}
      <g className="fill-none stroke-[var(--theme-ui-text-secondary)]" strokeWidth="1.5">
        <line x1="282" y1="92" x2="282" y2="130" />
        <path d="M278 97 L282 91 L286 97 M278 125 L282 131 L286 125" />
      </g>
      <text x="276" y="116" textAnchor="end" fontSize="13" fontWeight="700" className="fill-[var(--theme-ui-text-secondary)]">
        Dénivelé
      </text>
      {/* Trajectoire. */}
      <path
        d="M30 128 C80 -20 210 -20 252 86"
        className="fill-none stroke-[var(--theme-ui-accent)]"
        strokeWidth="2.5"
        strokeDasharray="7 5"
        strokeLinecap="round"
      />
      {/* Toi. */}
      <circle cx="30" cy="128" r="6" className="fill-[var(--theme-ui-accent)] stroke-[var(--app-surface)]" strokeWidth="2" />
      <text x="30" y="151" textAnchor="middle" fontSize="13" fontWeight="700" className="fill-[var(--theme-ui-text)]">
        Toi
      </text>
      {/* Cible. */}
      <circle cx="252" cy="86" r="8" className="fill-[var(--game-neg-soft)] stroke-[var(--game-neg)]" strokeWidth="2" />
      <circle cx="252" cy="86" r="2" className="fill-[var(--game-neg)]" />
      <text x="240" y="90" textAnchor="end" fontSize="13" fontWeight="700" className="fill-[var(--game-neg)]">
        Cible
      </text>
    </svg>
  )
}

const CORRECTION_SHOTS = [
  { label: 'Trop court de 45 m', hit: false, fix: '+25' },
  { label: 'Trop court de 20 m', hit: false, fix: '+25' },
  { label: 'Trop long de 5 m', hit: true, fix: 'au but' },
] as const

function CorrectionShots() {
  return (
    <ol className="flex flex-col gap-1.5" aria-label="Exemple de correction">
      {CORRECTION_SHOTS.map((shot, index) => (
        <li key={shot.label} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
          <span className="t-label w-10">Tir {index + 1}</span>
          <span
            className={`rounded-md px-1.5 py-0.5 text-[12px] font-bold ${
              shot.hit ? 'bg-[var(--game-pos-soft)] text-[var(--game-pos)]' : 'bg-[var(--game-neg-soft)] text-[var(--game-neg)]'
            }`}
          >
            {shot.label}
          </span>
          <span aria-hidden="true" className="text-gray-500">
            →
          </span>
          <span className={`t-num font-bold ${shot.hit ? 't-pos' : 'text-gray-900'}`}>{shot.fix}</span>
        </li>
      ))}
    </ol>
  )
}

// ── 04 · Jouer en équipe ───────────────────────────────────────────────────────────────────────────

const TEAM_VIEW = { x: 0, y: 240, width: 600, height: 360 }
const TEAM_SHOOTER = { x: 80, y: 500 }
const TEAM_OBSERVER = { x: 330, y: 420 }
const TEAM_TARGET = { x: 500, y: 330 }

function TeamIllustration() {
  return (
    <MortarMap
      view={TEAM_VIEW}
      label="Le tireur reste au mortier, l'observateur se place plus près de la cible"
      sizes={GUIDE_MAP_SIZES}
      markers={[
        { key: 'shooter', kind: 'shooter', point: TEAM_SHOOTER, label: 'Tireur', placement: { side: 'below', align: 'start' } },
        { key: 'observer', kind: 'observer', point: TEAM_OBSERVER, label: 'Observateur', placement: { side: 'below', align: 'center' } },
        { key: 'target', kind: 'target', point: TEAM_TARGET, label: 'Cible', placement: { side: 'above', align: 'center' } },
      ]}
      lines={[
        { key: 'shot', from: TEAM_SHOOTER, to: TEAM_TARGET, variant: 'shot' },
        { key: 'sight', from: TEAM_OBSERVER, to: TEAM_TARGET, variant: 'sight' },
      ]}
    />
  )
}

const TEAM_ROLES: Array<{ icon: LucideIcon; role: string; text: string; tone: string }> = [
  { icon: Crosshair, role: 'Tireur', text: 'Reste au mortier, règle la distance et tire.', tone: 'text-[var(--theme-ui-accent-text)]' },
  {
    icon: Binoculars,
    role: 'Observateur',
    text: 'Se place plus près, mesure la distance, regarde l’impact et corrige.',
    tone: 'text-[var(--game-sky)]',
  },
]

const CALLOUTS = ['340', '+25', 'Au but'] as const

// ── Guide ──────────────────────────────────────────────────────────────────────────────────────────

export default function MortarGuide({ onTrain }: { onTrain: (level: MortarDifficulty) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <GuideCard number="01" title="Les bases" level="easy" onTrain={onTrain} illustration={<BasicsIllustration />}>
        <p className="t-body text-gray-700">
          Pose le mortier sur un sol à plat, sans toit ni branches au-dessus de toi : l’obus monte en cloche et le moindre
          obstacle le bloque. La portée se règle de {MORTAR_RANGE.min} à {MORTAR_RANGE.max} m.
        </p>
      </GuideCard>

      <GuideCard number="02" title="Mesurer à la grille" level="medium" onTrain={onTrain} illustration={<GridIllustration />}>
        <p className="t-body text-gray-700">
          Sur la carte zoomée, un carré = 100 m. Compte les carrés en largeur et en hauteur entre toi et la cible, puis lis
          la distance dans le tableau.
        </p>
        <GridTable />
      </GuideCard>

      <GuideCard
        number="03"
        title="Corriger le tir"
        level="hard"
        onTrain={onTrain}
        illustration={
          <div className="flex flex-col gap-3">
            <CorrectionIllustration />
            <CorrectionShots />
          </div>
        }
      >
        <p className="t-body text-gray-700">
          La grille donne une distance à plat. Cible plus haute que toi : vise plus loin. Plus basse : vise plus court.
          Ensuite, corrige par pas de 25 m d’après l’impact. Trop court : +25. Trop long : −25.
        </p>
        <p className="t-meta">
          À l’entraînement (Difficile) : {formatMeters(10 * MORTAR_ELEVATION_FACTOR)} de plus par 10 m de dénivelé.
        </p>
      </GuideCard>

      <GuideCard number="04" title="Jouer en équipe" level="medium" onTrain={onTrain} illustration={<TeamIllustration />}>
        <div className="grid gap-2 sm:grid-cols-2">
          {TEAM_ROLES.map(({ icon: Icon, role, text, tone }) => (
            <div key={role} className="app-panel-muted flex flex-col gap-1 p-3">
              <p className="t-card-title flex items-center gap-1.5">
                <Icon className={`h-4 w-4 shrink-0 ${tone}`} aria-hidden="true" />
                {role}
              </p>
              <p className="t-body text-gray-700">{text}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="t-body text-gray-700">Annonces courtes :</span>
          {CALLOUTS.map((callout) => (
            <span key={callout} className="t-num rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-[12px] font-bold text-gray-900">
              « {callout} »
            </span>
          ))}
        </div>
      </GuideCard>
    </div>
  )
}
