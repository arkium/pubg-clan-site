'use client'

import Image from 'next/image'
import { ChevronLeft, ChevronRight, Crown, Footprints, HeartPulse, type LucideIcon } from 'lucide-react'
import { forwardRef, useState, useSyncExternalStore } from 'react'

import DropZoneMapViewport, { type DropZoneMapViewportHandle } from '@/components/drop-zones/DropZoneMapViewport'
import { PlayerDot } from '@/components/maps/MapToolbarControls'
import RankCell from '@/components/ui/RankCell'
import { paginate } from '@/lib/pagination'
import {
  bandShares,
  memberZoneProfile,
  ratioPercent,
  ZONE_BAND_META,
  ZONE_BANDS,
  type ZoneBandCounts,
  type ZoneMemberStat,
  type ZoneProfile,
  type ZoneTitle,
  type ZoneVerdict,
} from '@/lib/zone-closure-view'

/**
 * Page « Fin de zone » selon la charte (docs/ui/index.html, 04/10/2026) : la cible centre / bord / dehors et son
 * verdict, trois titres, la carte des arrivées, phase par phase, le top 5 des secteurs et « Qui joue le cercle ».
 * Couleurs : jetons de jeu (conteneur `.game-ui`), accent pour la carte ; aucun hex hors des photos.
 */

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const GRID_SIZE = 40

const share = (value: number) => `${integer.format(value)} %`

// ── La cible ────────────────────────────────────────────────────────────────────────────────────

/** Rayons de la cible (viewBox 160) : centre = moitié du cercle, bord = cercle, dehors = anneau extérieur. */
const TARGET = { size: 200, center: 34, edge: 68, outside: 95 }

export function ZoneTarget({ bands, averageRatio, verdict }: { bands: ZoneBandCounts; averageRatio: number; verdict: ZoneVerdict | null }) {
  const shares = bandShares(bands)
  const mid = TARGET.size / 2
  // Distance moyenne du clan, en pointillés d'accent : bornée à l'anneau extérieur.
  const averageRadius = Math.min(TARGET.outside - 2, averageRatio * TARGET.edge)
  return (
    <section className="app-panel flex flex-col gap-3 p-4" aria-labelledby="zone-target-title">
      <div className="flex flex-col gap-0.5">
        <h2 id="zone-target-title" className="t-card-title">La cible</h2>
        <span className="t-meta">Où les membres en vie se trouvent quand le cercle se referme</span>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <svg
          viewBox={`0 0 ${TARGET.size} ${TARGET.size}`}
          className="h-[176px] w-[176px] shrink-0"
          role="img"
          aria-label={`Centre ${share(shares.center)}, bord intérieur ${share(shares.edge)}, dehors ${share(shares.outside)}`}
          data-testid="zone-target"
        >
          <circle cx={mid} cy={mid} r={TARGET.outside} fill={ZONE_BAND_META.outside.soft} stroke={ZONE_BAND_META.outside.color} strokeWidth="1.5" strokeDasharray="4 4" />
          <circle cx={mid} cy={mid} r={TARGET.edge} fill={ZONE_BAND_META.edge.soft} stroke={ZONE_BAND_META.edge.color} strokeWidth="2" />
          <circle cx={mid} cy={mid} r={TARGET.center} fill={ZONE_BAND_META.center.soft} stroke={ZONE_BAND_META.center.color} strokeWidth="2" />
          {averageRatio > 0 ? (
            <circle cx={mid} cy={mid} r={averageRadius} fill="none" stroke="var(--theme-ui-accent)" strokeWidth="2" strokeDasharray="3 3" />
          ) : null}
          {/* Chaque part au milieu de son anneau, sur l'axe vertical. */}
          <text x={mid} y={mid + 8} textAnchor="middle" className="t-hero" fontSize="26" fill={ZONE_BAND_META.center.color}>{share(shares.center)}</text>
          <text x={mid} y={mid - (TARGET.center + TARGET.edge) / 2 + 7} textAnchor="middle" className="t-hero" fontSize="20" fill={ZONE_BAND_META.edge.color}>{share(shares.edge)}</text>
          <text x={mid} y={mid - (TARGET.edge + TARGET.outside) / 2 + 6} textAnchor="middle" className="t-hero" fontSize="18" fill={ZONE_BAND_META.outside.color}>{share(shares.outside)}</text>
        </svg>
        <ul className="flex min-w-[150px] flex-1 flex-col gap-1.5 text-[13px]">
          {ZONE_BANDS.map((band) => (
            <li key={band} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: ZONE_BAND_META[band].color }} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <b className="text-gray-900">{ZONE_BAND_META[band].label}</b>{' '}
                <span className="text-[11px] text-gray-500">{ZONE_BAND_META[band].description}</span>
              </span>
              <span className="t-num font-bold text-gray-900">{integer.format(bands[band])}</span>
            </li>
          ))}
          <li className="flex items-center gap-2 border-t border-gray-200 pt-1.5">
            <span className="h-0 w-2.5 shrink-0 border-t-2 border-dashed border-[var(--theme-ui-accent)]" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-gray-700">Distance moyenne au centre</span>
            <span className="t-num font-bold text-gray-900">{ratioPercent(averageRatio)} % du rayon</span>
          </li>
        </ul>
      </div>
      {verdict ? (
        <p className="rounded-[10px] bg-[var(--theme-ui-accent-tint)] px-3 py-2.5" data-testid="zone-verdict">
          <b className="t-hero t-hero--sm block text-gray-900">{verdict.title}</b>
          <span className="text-[13px] text-gray-700">{verdict.sentence}</span>
        </p>
      ) : null}
    </section>
  )
}

// ── Titres ──────────────────────────────────────────────────────────────────────────────────────

const TITLE_STYLE: Record<ZoneTitle['key'], { Icon: LucideIcon; color: string; soft: string }> = {
  king: { Icon: Crown, color: 'var(--game-gold)', soft: 'var(--game-gold-soft)' },
  survivor: { Icon: HeartPulse, color: 'var(--game-pos)', soft: 'var(--game-pos-soft)' },
  latecomer: { Icon: Footprints, color: 'var(--game-neg)', soft: 'var(--game-neg-soft)' },
}

export function ZoneTitles({ titles, colorOf, styleOf }: { titles: ZoneTitle[]; colorOf: (memberId: number) => string | null; styleOf: (memberId: number) => string | null }) {
  if (titles.length === 0) return null
  return (
    <section aria-label="Titres de la zone" className="grid gap-2.5 sm:grid-cols-3">
      {titles.map((title) => {
        const { Icon, color, soft } = TITLE_STYLE[title.key]
        return (
          <article key={title.key} className="app-panel flex items-center gap-3 p-3.5" aria-label={title.title}>
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px]" style={{ backgroundColor: soft }}>
              <Icon className="h-5 w-5" style={{ color }} aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="t-label" style={{ color }}>{title.title}</span>
              <span className="flex min-w-0 items-center gap-1.5">
                <PlayerDot label={title.displayName} color={colorOf(title.memberId)} avatar size={22} style={styleOf(title.memberId)} />
                <b className="truncate text-[15px] text-gray-900">{title.displayName}</b>
              </span>
              <span className="t-meta">
                <span className="t-num font-bold text-gray-700">{title.value}</span> · {title.description}
              </span>
            </span>
          </article>
        )
      })}
    </section>
  )
}

// ── Barre centre / bord / dehors ────────────────────────────────────────────────────────────────

function BandBar({ bands, thin = false }: { bands: ZoneBandCounts; thin?: boolean }) {
  const shares = bandShares(bands)
  return (
    <span className={`flex overflow-hidden bg-[var(--theme-ui-surface-strong)] ${thin ? 'h-[6px] rounded-[3px]' : 'h-3 rounded-[6px]'}`} aria-hidden="true">
      {ZONE_BANDS.map((band) =>
        shares[band] > 0 ? <span key={band} style={{ width: `${shares[band]}%`, backgroundColor: ZONE_BAND_META[band].color }} /> : null
      )}
    </span>
  )
}

// ── Phase par phase ─────────────────────────────────────────────────────────────────────────────

export function PhaseBreakdown({ phases }: { phases: Array<{ phase: number; positions: number; averageRatio: number; bands: ZoneBandCounts }> }) {
  return (
    <section className="app-panel flex flex-col gap-2.5 p-4" aria-labelledby="zone-phases-title">
      <div className="flex flex-col gap-0.5">
        <h2 id="zone-phases-title" className="t-card-title">Phase par phase</h2>
        <span className="t-meta">Numéro de la phase qui commence. Moins d’observations au fil des phases : seuls les survivants comptent.</span>
      </div>
      <ol className="flex flex-col">
        {phases.map((entry) => {
          const shares = bandShares(entry.bands)
          return (
            <li
              key={entry.phase}
              className="grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 border-t border-gray-200 py-2 first:border-t-0"
              aria-label={`Phase ${entry.phase} : ${entry.positions} observations, centre ${share(shares.center)}, bord ${share(shares.edge)}, dehors ${share(shares.outside)}`}
            >
              <span className="flex flex-col">
                <b className="text-[13px] text-gray-900">Phase {entry.phase}</b>
                <span className="t-num text-[11px] text-gray-500">{integer.format(entry.positions)} obs.</span>
              </span>
              <BandBar bands={entry.bands} />
              <span className="t-num whitespace-nowrap text-right text-[13px] font-bold" style={{ color: shares.outside > 0 ? ZONE_BAND_META.outside.color : undefined }}>
                {share(shares.outside)} dehors
              </span>
            </li>
          )
        })}
      </ol>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
        {ZONE_BANDS.map((band) => (
          <li key={band} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ZONE_BAND_META[band].color }} aria-hidden="true" />
            {ZONE_BAND_META[band].label}
          </li>
        ))}
      </ul>
    </section>
  )
}

// ── Top 5 des secteurs d'arrivée ────────────────────────────────────────────────────────────────

export function ArrivalSectors({ cities, dataStart }: { cities: Array<{ locationId: string; name: string; positions: number; share: number }>; dataStart: string | null }) {
  const top = cities[0]?.positions ?? 0
  return (
    <section className="app-panel flex flex-col overflow-hidden" aria-labelledby="zone-sectors-title">
      <div className="flex flex-col gap-0.5 px-4 pb-2 pt-3">
        <h2 id="zone-sectors-title" className="t-card-title">Top 5 · secteurs d’arrivée</h2>
        <span className="t-meta">Villes configurées pour cette carte ; les arrivées hors de tout périmètre ne sont pas classées</span>
      </div>
      {cities.length > 0 ? (
        <ol aria-label="Top 5 des secteurs d’arrivée">
          {cities.map((city, index) => (
            <li key={city.locationId} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-gray-200 px-4 py-2">
              <RankCell rank={index + 1} size="xs" />
              <span className="flex min-w-0 flex-col gap-1">
                <b className="truncate text-sm text-gray-900">{city.name}</b>
                <span className="block h-[5px] max-w-[180px] overflow-hidden rounded-[3px] bg-[var(--theme-ui-surface-strong)]" aria-hidden="true">
                  <span className="block h-full bg-[var(--theme-ui-accent)]" style={{ width: `${top > 0 ? (city.positions / top) * 100 : 0}%` }} />
                </span>
              </span>
              <span className="t-num flex flex-col items-end">
                <b className="text-base text-gray-900">{integer.format(city.positions)}</b>
                <span className="text-[11px] text-gray-500">{integer.format(city.share)} %</span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="t-body border-t border-gray-200 px-4 py-3 text-gray-500">Aucune arrivée dans un périmètre configuré.</p>
      )}
      {dataStart ? (
        <span className="border-t border-gray-200 px-4 pb-3 pt-2 text-[11px] text-gray-500">
          Données depuis le {new Date(dataStart).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}
        </span>
      ) : null}
    </section>
  )
}

// ── Qui joue le cercle ──────────────────────────────────────────────────────────────────────────

const PROFILE_TONE: Record<ZoneProfile['tone'], { color: string; soft: string }> = {
  pos: { color: 'var(--game-pos)', soft: 'var(--game-pos-soft)' },
  warn: { color: 'var(--game-warn)', soft: 'var(--game-warn-soft)' },
  neg: { color: 'var(--game-neg)', soft: 'var(--game-neg-soft)' },
  neutral: { color: 'var(--theme-ui-text-secondary)', soft: 'var(--theme-ui-surface-strong)' },
}

const SM_QUERY = '(min-width: 640px)'
function subscribeSmallScreen(onChange: () => void) {
  const query = window.matchMedia(SM_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function WhoPlaysTheCircle({
  members,
  selectedMemberId,
  onSelect,
  colorOf,
  styleOf,
}: {
  members: ZoneMemberStat[]
  selectedMemberId: number | null
  onSelect: (memberId: number | null) => void
  colorOf: (memberId: number) => string | null
  styleOf: (memberId: number) => string | null
}) {
  // Même pagination que « Qui saute où » (zones de drop) : chevrons dans l'en-tête, jamais une liste sans fin.
  // 5 joueurs par page sur mobile (lignes sur deux niveaux), 8 à partir de `sm`.
  const perPage = useSyncExternalStore(subscribeSmallScreen, () => (window.matchMedia(SM_QUERY).matches ? 8 : 5), () => 8)
  // Page choisie aux chevrons, rattachée au joueur sélectionné : un joueur choisi ailleurs (pastille du bandeau) amène
  // sa page, sans effet ni second rendu.
  const [pager, setPager] = useState<{ page: number; anchor: number | null }>({ page: 1, anchor: selectedMemberId })
  const selectedIndex = members.findIndex((member) => member.memberId === selectedMemberId)
  const requested = pager.anchor !== selectedMemberId && selectedIndex >= 0 ? Math.floor(selectedIndex / perPage) + 1 : pager.page
  const { current, pageCount, start, visible } = paginate(members, requested, perPage)
  const goTo = (page: number) => setPager({ page, anchor: selectedMemberId })

  if (members.length === 0) return null
  return (
    <section className="app-panel flex flex-col overflow-hidden" aria-labelledby="zone-players-title">
      <div className="flex items-start gap-2 px-4 pb-2 pt-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 id="zone-players-title" className="t-section-title">Qui joue le cercle</h2>
          <span className="t-meta">Du plus central au plus excentré — distance moyenne au centre, en % du rayon. Touchez un joueur pour filtrer la carte.</span>
        </div>
        {pageCount > 1 ? (
          <nav className="flex shrink-0 items-center gap-1.5" aria-label="Pages des joueurs">
            <button type="button" className="app-pager-button" onClick={() => goTo(current - 1)} disabled={current === 1} aria-label="Joueurs précédents">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="t-num min-w-[30px] text-center text-xs font-bold text-gray-500">{current}/{pageCount}</span>
            <button type="button" className="app-pager-button" onClick={() => goTo(current + 1)} disabled={current === pageCount} aria-label="Joueurs suivants">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </nav>
        ) : null}
      </div>
      <ol aria-label="Joueurs, du plus central au plus excentré" start={start + 1}>
        {visible.map((member, pageIndex) => {
          const index = start + pageIndex
          const profile = memberZoneProfile(member)
          const selected = member.memberId === selectedMemberId
          const tone = profile ? PROFILE_TONE[profile.tone] : null
          return (
            <li key={member.memberId}>
              <button
                type="button"
                onClick={() => onSelect(selected ? null : member.memberId)}
                aria-pressed={selected}
                className={`grid w-full grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 border-t border-gray-200 px-4 py-2.5 text-left hover:bg-gray-50 sm:grid-cols-[24px_minmax(0,1fr)_minmax(0,220px)_auto] ${selected ? 'bg-[var(--theme-ui-accent-tint)] shadow-[inset_3px_0_0_var(--theme-ui-accent)]' : ''}`}
              >
                <span className="col-start-1 row-start-1 flex justify-center">{profile ? <RankCell rank={index + 1} size="xs" /> : <span className="text-[11px] text-gray-500">—</span>}</span>
                <span className="col-start-2 row-start-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <PlayerDot label={member.displayName} color={colorOf(member.memberId)} avatar size={22} style={styleOf(member.memberId)} />
                  <b className="truncate text-sm text-gray-900">{member.displayName}</b>
                  {profile && tone ? (
                    <span className="rounded-md px-1.5 py-px text-[11px] font-bold" style={{ color: tone.color, backgroundColor: tone.soft }}>
                      {profile.label}
                    </span>
                  ) : (
                    <span className="text-[11px] text-gray-500">trop peu de fermetures</span>
                  )}
                </span>
                <span className="col-span-3 col-start-1 row-start-2 sm:col-span-1 sm:col-start-3 sm:row-start-1">
                  <BandBar bands={member.bands} thin />
                </span>
                <span className="t-num col-start-3 row-start-1 flex flex-col items-end sm:col-start-4">
                  <b className="text-base text-gray-900">{ratioPercent(member.averageRatio)} %</b>
                  <span className="text-[11px] text-gray-500">{integer.format(member.positions)} ferm.</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

// ── Carte des arrivées ──────────────────────────────────────────────────────────────────────────

export const ZoneClosureMap = forwardRef<
  DropZoneMapViewportHandle,
  { mapName: string | null; mapLabel: string; cells: Array<{ xIndex: number; yIndex: number; count: number }> }
>(function ZoneClosureMap({ mapName, mapLabel, cells }, ref) {
  const max = cells.reduce((highest, cell) => Math.max(highest, cell.count), 0)
  return (
    <section className="app-panel flex flex-col overflow-hidden" aria-labelledby="zone-map-title">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-4 pb-2 pt-3">
        <h2 id="zone-map-title" className="t-card-title">Arrivées sur {mapLabel}</h2>
        <span className="t-meta">la taille du point suit le nombre d’arrivées dans la case</span>
      </div>
      <div className="px-3 pb-3 sm:px-4 sm:pb-4">
        <DropZoneMapViewport ref={ref} showBoundaryControl={false}>
          {mapName ? (
            <>
              <Image
                src={`/maps/pubg/${mapName}.webp`}
                alt={mapLabel}
                fill
                className="object-cover opacity-80 brightness-[0.72] saturate-[0.8] contrast-[1.08]"
                sizes="(max-width: 1280px) 100vw, 70vw"
                unoptimized
              />
              <div className="absolute inset-0 bg-slate-950/20" />
            </>
          ) : null}
          <div className="absolute inset-0 overflow-hidden">
            {cells.map((cell) => {
              const ratio = max > 0 ? cell.count / max : 0
              const size = 8 + Math.sqrt(ratio) * 22
              return (
                <div
                  key={`${cell.xIndex}-${cell.yIndex}`}
                  className="absolute z-20 rounded-full border border-white/80"
                  data-testid="zone-dot"
                  style={{
                    left: `${((cell.xIndex + 0.5) / GRID_SIZE) * 100}%`,
                    top: `${((cell.yIndex + 0.5) / GRID_SIZE) * 100}%`,
                    width: `${size}px`,
                    height: `${size}px`,
                    transform: 'translate(-50%, -50%)',
                    // Accent de la page (charte « Pages à carte ») : plus de cyan.
                    backgroundColor: `color-mix(in srgb, var(--theme-ui-accent) ${Math.round(25 + ratio * 60)}%, transparent)`,
                    boxShadow: `0 0 ${Math.round(6 + ratio * 12)}px color-mix(in srgb, var(--theme-ui-accent) 70%, transparent)`,
                  }}
                  title={`${integer.format(cell.count)} arrivée${cell.count > 1 ? 's' : ''}`}
                />
              )
            })}
          </div>
        </DropZoneMapViewport>
      </div>
    </section>
  )
})
