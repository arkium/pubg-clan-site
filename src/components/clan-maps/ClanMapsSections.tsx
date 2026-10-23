'use client'

import { ArrowDown, ArrowRight, ChevronRight, MapPinOff, Repeat, Target, Trophy, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import ChevronPager from '@/components/ui/ChevronPager'
import { Tag } from '@/components/ui/CharteKit'
import RankCell from '@/components/ui/RankCell'
import { CLAN_MAPS_MIN_SAMPLE, type ClanMapRow, type ClanMapSortKey, type ClanMapsVerdict } from '@/lib/clan-maps'
import { mapAssetUrl } from '@/lib/pubg-assets'

/**
 * Sections de la page « Cartes » d'un clan (`/clans/[clanId]/stats/maps`) — maquette Claude Design « Cartes clan -
 * Fait » (2026-10-23), docs/TODO/cartes-clan.md. Verdict en 3 cartes (chevrons sur mobile), une tuile par carte (4
 * chiffres principaux, 3 secondaires, écart aux clans et tendance du Top 10 en texte et en couleur, joueur phare), tuiles
 * de faible échantillon estompées.
 */

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const oneDecimal = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const twoDecimals = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const MINUS = '−'

export const formatRatePercent = (rate: number) => `${integer.format(Math.round(rate * 100))} %`
export const formatWinRate = (rate: number) => `${oneDecimal.format(rate * 100)} %`
export const formatDecimal = (value: number) => oneDecimal.format(value)
export const formatCount = (value: number) => integer.format(Math.round(value))

/** « 7 pts », « 1 pt » : grandeur d'un écart, après une flèche ▲ / ▼ qui porte déjà le sens. */
export function formatPointsMagnitude(points: number) {
  const abs = Math.abs(Math.round(points))
  return `${abs} pt${abs > 1 ? 's' : ''}`
}

/** « +7 pts », « −1 pt », « 0 pt » : écart de Top 10 en points entiers. */
export function formatPoints(points: number) {
  const rounded = Math.round(points)
  const sign = rounded > 0 ? '+' : rounded < 0 ? MINUS : ''
  return `${sign}${formatPointsMagnitude(rounded)}`
}

/** « +0,5 », « −2,1 » : écart d'une moyenne, à une décimale. */
export function formatSignedDecimal(value: number) {
  const rounded = Math.round(value * 10) / 10
  const sign = rounded > 0 ? '+' : rounded < 0 ? MINUS : ''
  return `${sign}${oneDecimal.format(Math.abs(rounded))}`
}

type Tone = 'pos' | 'neg' | 'muted'
const TONE_CLASS: Record<Tone, string> = { pos: 't-pos', neg: 't-neg', muted: 'text-gray-500' }

/** Couleur d'un écart : au-dessus de zéro est « mieux », sauf quand moins est mieux (place moyenne). */
function deltaTone(value: number, lowerIsBetter = false, precision = 1): Tone {
  const rounded = Math.round(value * precision) / precision
  if (rounded === 0) return 'muted'
  return (rounded > 0) !== lowerIsBetter ? 'pos' : 'neg'
}

function Stat({
  label,
  value,
  active,
  delta,
  trend,
}: {
  label: string
  value: string
  active: boolean
  delta?: { text: string; tone: Tone } | null
  trend?: { text: string; tone: Tone } | null
}) {
  return (
    <div className={`app-stat-tile ${active ? 'app-stat-tile--active' : ''}`}>
      {/* Chiffre en Teko (charte §3, `t-hero`), pas `app-stat-tile__value` : déclarée après, elle reprendrait la main. */}
      <span className="t-hero t-hero--sm whitespace-nowrap text-gray-900">{value}</span>
      <span className="app-stat-tile__label">{label}</span>
      {delta ? <span className={`whitespace-nowrap text-[11px] font-bold leading-tight ${TONE_CLASS[delta.tone]}`}>{delta.text}</span> : null}
      {trend ? <span className={`whitespace-nowrap text-[11px] font-bold leading-tight ${TONE_CLASS[trend.tone]}`}>{trend.text}</span> : null}
    </div>
  )
}

function MapBanner({ mapName, mapLabel, podiumRank, lowSample }: { mapName: string; mapLabel: string; podiumRank: number | null; lowSample: boolean }) {
  const image = mapAssetUrl(mapName)
  return (
    <div className="bg-photo-fallback relative h-24 overflow-hidden">
      {/* Image de fond, comme les cartes de partie : sans image, le fond de repli reste. */}
      {image ? (
        <div aria-hidden="true" className={`absolute inset-0 bg-cover bg-center ${lowSample ? 'grayscale' : ''}`} style={{ backgroundImage: `url('${image}')` }} />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
      {lowSample ? (
        <span className="absolute right-2 top-2">
          <Tag tone="neutral">Échantillon faible</Tag>
        </span>
      ) : null}
      <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-2 px-3 pb-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/70">Carte</p>
          <h3 className="truncate text-lg font-bold leading-tight text-white drop-shadow">{mapLabel}</h3>
        </div>
        {podiumRank ? <RankCell rank={podiumRank} size="md" /> : null}
      </div>
    </div>
  )
}

export function ClanMapTile({
  row,
  sortKey,
  podiumRank,
  showTrend,
}: {
  row: ClanMapRow
  sortKey: ClanMapSortKey
  podiumRank: number | null
  showTrend: boolean
}) {
  const vs = row.vsClans
  const top10Delta = vs.top10Pts !== null ? { text: `${formatPoints(vs.top10Pts)} clans`, tone: deltaTone(vs.top10Pts, false, 1) } : null
  const top10Trend =
    showTrend && row.top10TrendPts !== null
      ? {
          text: Math.round(row.top10TrendPts) === 0 ? '= période préc.' : `${row.top10TrendPts > 0 ? '▲' : '▼'} ${formatPointsMagnitude(row.top10TrendPts)}`,
          tone: deltaTone(row.top10TrendPts, false, 1),
        }
      : null
  const placementDelta =
    vs.avgPlacement !== null ? { text: `${formatSignedDecimal(vs.avgPlacement)} clans`, tone: deltaTone(vs.avgPlacement, true, 10) } : null
  const killsDelta =
    vs.killsPerMatch !== null ? { text: `${formatSignedDecimal(vs.killsPerMatch)} clans`, tone: deltaTone(vs.killsPerMatch, false, 10) } : null

  return (
    <article aria-label={row.mapLabel} className={`app-panel flex flex-col overflow-hidden p-0 ${row.lowSample ? 'opacity-60' : ''}`}>
      <MapBanner mapName={row.mapName} mapLabel={row.mapLabel} podiumRank={podiumRank} lowSample={row.lowSample} />
      <div className="grid grid-cols-4 gap-1.5 px-3 pt-3">
        <Stat label="Parties" value={formatCount(row.matches)} active={sortKey === 'matches'} />
        <Stat label="Top 1" value={formatCount(row.wins)} active={sortKey === 'wins'} />
        <Stat label="Win rate" value={formatWinRate(row.winRate)} active={sortKey === 'winRate'} />
        <Stat label="Top 10" value={formatRatePercent(row.top10Rate)} active={sortKey === 'top10Rate'} delta={top10Delta} trend={top10Trend} />
      </div>
      <div className="grid grid-cols-3 gap-1.5 px-3 pb-3 pt-1.5">
        <Stat label="Place moyenne" value={formatDecimal(row.avgPlacement)} active={sortKey === 'avgPlacement'} delta={placementDelta} />
        <Stat label="Kills / partie" value={formatDecimal(row.killsPerMatch)} active={sortKey === 'killsPerMatch'} delta={killsDelta} />
        <Stat label="Dégâts / partie" value={formatCount(row.damagePerMatch)} active={sortKey === 'damagePerMatch'} />
      </div>
      <div className="mt-auto px-3 pb-3">
        {row.starPlayer ? (
          <Link
            href={`/members/${row.starPlayer.memberId}/map-stats`}
            className="app-panel-muted flex items-center gap-2.5 px-2.5 py-2 transition-colors hover:bg-gray-100"
            aria-label={`Joueur phare sur ${row.mapLabel} : ${row.starPlayer.displayName}, ${twoDecimals.format(row.starPlayer.killsPerMatch)} kills par partie sur ${row.starPlayer.matches} parties`}
          >
            <span
              aria-hidden="true"
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-extrabold"
              style={{ borderColor: 'var(--theme-ui-accent-ring)', background: 'var(--theme-ui-accent-soft)', color: 'var(--theme-ui-accent-text)' }}
            >
              {row.starPlayer.displayName.trim().charAt(0).toUpperCase() || '?'}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="t-label">Joueur phare</span>
              <span className="truncate text-sm font-bold text-gray-900">{row.starPlayer.displayName}</span>
              <span className="t-meta t-num">
                {twoDecimals.format(row.starPlayer.killsPerMatch)} kills / partie · {formatCount(row.starPlayer.matches)} parties
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
          </Link>
        ) : row.lowSample ? (
          <p className="t-meta m-0">Moins de {CLAN_MAPS_MIN_SAMPLE} parties : pas d’écart, pas de tendance ni de joueur phare.</p>
        ) : (
          <p className="t-meta m-0">Pas encore de joueur phare : aucun membre n’y compte {CLAN_MAPS_MIN_SAMPLE} parties.</p>
        )}
      </div>
    </article>
  )
}

// ── Verdict ─────────────────────────────────────────────────────────────────────────────────────

function VerdictCard({
  eyebrow,
  icon: Icon,
  color,
  mapName,
  mapLabel,
  children,
}: {
  eyebrow: string
  icon: LucideIcon
  color: string
  mapName: string | null
  mapLabel: string | null
  children: ReactNode
}) {
  const image = mapName ? mapAssetUrl(mapName) : null
  return (
    <article aria-label={mapLabel ? `${eyebrow} : ${mapLabel}` : eyebrow} className="app-panel flex h-full flex-col overflow-hidden p-0">
      {/* `app-on-photo` : couleurs de jeu de la variante sombre, la photo restant sombre dans les deux thèmes. */}
      <div className="app-on-photo bg-photo-fallback relative h-20 overflow-hidden">
        {image ? <div aria-hidden="true" className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url('${image}')` }} /> : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />
        <div className="absolute bottom-0 left-0 right-0 px-3 pb-1.5">
          <p className="m-0 flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-[0.12em]" style={{ color }}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {eyebrow}
          </p>
          {mapLabel ? <p className="t-banner-title m-0 text-white drop-shadow">{mapLabel}</p> : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">{children}</div>
    </article>
  )
}

function BigFigure({ value, unit }: { value: string; unit: string }) {
  return (
    <p className="m-0 flex items-baseline gap-1.5">
      <span className="t-hero t-hero--lg text-gray-900">{value}</span>
      <span className="t-meta">{unit}</span>
    </p>
  )
}

function Line({ tone, children }: { tone: 'pos' | 'neg' | 'warn' | 'sky' | 'muted'; children: ReactNode }) {
  const className = { pos: 't-pos', neg: 't-neg', warn: 't-warn', sky: 't-sky', muted: 'text-gray-500' }[tone]
  return <p className={`m-0 text-xs font-semibold ${className}`}>{children}</p>
}

export function ClanMapsVerdict({ verdict, small }: { verdict: ClanMapsVerdict; small: boolean }) {
  const { strongest, weakest, mostPlayed } = verdict
  const cards = [
    {
      key: 'strongest',
      node: (
        <VerdictCard eyebrow="Carte forte" icon={Trophy} color="var(--game-pos)" mapName={strongest?.mapName ?? null} mapLabel={strongest?.mapLabel ?? null}>
          {strongest ? (
            <>
              <BigFigure value={formatRatePercent(strongest.top10Rate)} unit="de Top 10" />
              <Line tone="pos">▲ {formatPointsMagnitude(strongest.vsClansPts)} au-dessus de la moyenne des clans</Line>
            </>
          ) : (
            <Line tone="muted">Aucune carte au-dessus de la moyenne des clans sur cette période.</Line>
          )}
        </VerdictCard>
      ),
    },
    {
      key: 'weakest',
      node: (
        <VerdictCard eyebrow="Carte à travailler" icon={Target} color="var(--game-warn)" mapName={weakest?.mapName ?? null} mapLabel={weakest?.mapLabel ?? null}>
          {weakest ? (
            <>
              <BigFigure value={formatRatePercent(weakest.top10Rate)} unit="de Top 10" />
              <Line tone="neg">▼ {formatPointsMagnitude(weakest.vsClansPts)} sous la moyenne des clans</Line>
              {weakest.trendPts !== null && Math.round(weakest.trendPts) !== 0 ? (
                <Line tone={weakest.trendPts < 0 ? 'warn' : 'pos'}>
                  {weakest.trendPts < 0 ? '▼ En baisse' : '▲ En hausse'} de {formatPointsMagnitude(weakest.trendPts)} sur la période précédente
                </Line>
              ) : null}
            </>
          ) : (
            <Line tone="pos">Aucune carte sous la moyenne des clans sur cette période.</Line>
          )}
        </VerdictCard>
      ),
    },
    {
      key: 'most-played',
      node: (
        <VerdictCard eyebrow="Carte la plus jouée" icon={Repeat} color="var(--game-sky)" mapName={mostPlayed?.mapName ?? null} mapLabel={mostPlayed?.mapLabel ?? null}>
          {mostPlayed ? (
            <>
              <BigFigure value={formatCount(mostPlayed.matches)} unit={mostPlayed.matches > 1 ? 'parties' : 'partie'} />
              <Line tone="sky">
                <ArrowDown className="mr-0.5 inline h-3 w-3 align-[-1px]" aria-hidden="true" />
                {formatRatePercent(mostPlayed.share)} du total des parties
              </Line>
            </>
          ) : null}
        </VerdictCard>
      ),
    },
  ]

  if (small) {
    return (
      <section aria-labelledby="clan-maps-verdict-title" className="flex flex-col gap-2">
        <h2 id="clan-maps-verdict-title" className="t-section-title m-0">Le verdict</h2>
        <ChevronPager items={cards} pageSize={1} ariaLabel="Verdict des cartes" />
      </section>
    )
  }
  return (
    <section aria-label="Le verdict" className="grid grid-cols-3 gap-3">
      {cards.map((card) => (
        <div key={card.key}>{card.node}</div>
      ))}
    </section>
  )
}

// ── Chargement et état vide ─────────────────────────────────────────────────────────────────────

function SkeletonBlock({ className }: { className: string }) {
  return <span aria-hidden="true" className={`block animate-pulse rounded-md bg-gray-100 ${className}`} />
}

export function ClanMapsSkeleton({ small }: { small: boolean }) {
  return (
    <div aria-busy="true" aria-label="Chargement des cartes" className="flex flex-col gap-4">
      <div className={`grid gap-3 ${small ? 'grid-cols-1' : 'grid-cols-3'}`}>
        {Array.from({ length: small ? 1 : 3 }, (_, index) => (
          <div key={index} className="app-panel flex flex-col gap-2 p-3">
            <SkeletonBlock className="h-10 w-full" />
            <SkeletonBlock className="h-6 w-24" />
            <SkeletonBlock className="h-3 w-40" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="app-panel flex flex-col gap-2 p-3">
            <SkeletonBlock className="h-20 w-full" />
            <SkeletonBlock className="h-12 w-full" />
            <SkeletonBlock className="h-10 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function ClanMapsEmpty({ title, onShowAll }: { title: string; onShowAll: (() => void) | null }) {
  return (
    <div className="app-panel flex flex-col items-center gap-3 px-4 py-8 text-center">
      <span className="app-panel-muted grid h-10 w-10 place-items-center" aria-hidden="true">
        <MapPinOff className="h-5 w-5 text-gray-500" />
      </span>
      <p className="t-card-title m-0">{title}</p>
      <p className="t-meta m-0 max-w-md">
        Les cartes s’afficheront ici dès que l’escouade aura joué une partie de ce type. Change de période ou de type de
        partie pour voir les autres résultats.
      </p>
      {onShowAll ? (
        <button type="button" onClick={onShowAll} className="app-btn app-btn--sm app-btn--secondary gap-1.5">
          Voir tout l’historique
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}
