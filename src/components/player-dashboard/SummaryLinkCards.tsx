'use client'

import { Map as MapIcon, Pill } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import ItemIcon from '@/components/ui/ItemIcon'
import { itemFamilyLabel, itemLabel } from '@/lib/clan-playstyle'
import type { ItemUseStats } from '@/lib/item-use-stats'
import { mapAssetUrl, resolveItemName } from '@/lib/pubg-assets'

/**
 * Cartes résumé du tableau de bord, alignées sur « Carrière PUBG » (2026-10-03) : même matière sombre
 * (`career-hero-card`), surtitre à l'accent, « Voir → ». Elles suivent la période de la page.
 */

const integer = new Intl.NumberFormat('fr-FR')
const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

/** Une ligne de `mapStats` (`/api/members/[id]/map-stats`) : ce que la carte en lit. */
export type MapSummaryRow = { mapName: string; mapLabel: string; matches: number; wins: number; winRate: number }

function SummaryCard({
  href,
  label,
  eyebrow,
  visual,
  children,
  testId,
}: {
  href: string
  label: string
  eyebrow: string
  visual: ReactNode
  children: ReactNode
  testId: string
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className="career-hero-card relative flex items-center gap-3.5 overflow-hidden border border-gray-200 p-3.5 hover:border-[var(--theme-ui-accent-ring)]"
      data-testid={testId}
    >
      {visual}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {/* « Voir → » sur la ligne du surtitre : toute la largeur reste aux chiffres (rangée de trois cartes). */}
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[11px] font-black tracking-[0.14em] text-[var(--theme-ui-accent)]">{eyebrow}</span>
          <span className="shrink-0 text-xs font-bold text-[var(--theme-ui-accent)]">Voir →</span>
        </span>
        {children}
      </span>
    </Link>
  )
}

/** Vignette 74 × 48 comme la plaque de la carte Carrière, sur fond sombre. */
const tileClass = 'grid h-12 w-[74px] shrink-0 place-items-center overflow-hidden rounded-xl border border-white/10 bg-white/5'

export function ItemsSummaryCard({ memberId, stats, when }: { memberId: number; stats: ItemUseStats | null; when: string }) {
  const top = stats?.items[0] ?? null
  const dominant = stats?.families[0] ?? null
  const perMatch = stats && stats.matchCount > 0 ? stats.totalCount / stats.matchCount : 0
  return (
    <SummaryCard
      href={`/members/${memberId}/items`}
      label="Objets consommés : voir la page"
      eyebrow="OBJETS CONSOMMÉS"
      testId="items-card"
      visual={<span className={tileClass} aria-hidden="true">{top ? <ItemIcon id={top.itemId} size="lg" /> : <Pill className="h-5 w-5 text-slate-400" />}</span>}
    >
      {stats && stats.totalCount > 0 ? (
        <>
          <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums text-slate-300">
            <span>
              <b className="text-sm text-white">{decimal.format(perMatch)}</b> par match
            </span>
            <span>
              <b className="text-sm text-white">{integer.format(stats.totalCount)}</b> objets
            </span>
          </span>
          <span className="truncate text-xs text-slate-300">
            {dominant ? `Surtout ${itemFamilyLabel(dominant.subCategory).toLowerCase()} (${decimal.format(dominant.share)} %)` : ''}
            {top ? ` · ${itemLabel(top.itemId, resolveItemName)}` : ''}
          </span>
        </>
      ) : (
        <span className="text-xs text-slate-300">Aucun objet consommé {when}.</span>
      )}
    </SummaryCard>
  )
}

export function MapsSummaryCard({ memberId, maps, when }: { memberId: number; maps: MapSummaryRow[] | null; when: string }) {
  const played = (maps ?? []).filter((map) => map.matches > 0)
  const favourite = played.reduce<MapSummaryRow | null>((best, map) => (!best || map.matches > best.matches ? map : best), null)
  const image = favourite ? mapAssetUrl(favourite.mapName) : null
  return (
    <SummaryCard
      href={`/members/${memberId}/map-stats`}
      label="Statistiques par carte : voir la page"
      eyebrow="CARTES"
      testId="maps-card"
      visual={
        <span
          className={`${tileClass} bg-cover bg-center`}
          style={image ? { backgroundImage: `url('${image}')` } : undefined}
          aria-hidden="true"
        >
          {image ? null : <MapIcon className="h-5 w-5 text-slate-400" />}
        </span>
      }
    >
      {favourite ? (
        <>
          <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums text-slate-300">
            <span>
              <b className="text-sm text-white">{favourite.mapLabel}</b> · {integer.format(favourite.matches)} partie{favourite.matches > 1 ? 's' : ''}
            </span>
            <span>
              <b className="text-sm text-white">{decimal.format(favourite.winRate * 100)} %</b> win rate
            </span>
          </span>
          <span className="text-xs text-slate-300">
            {played.length} carte{played.length > 1 ? 's' : ''} jouée{played.length > 1 ? 's' : ''} {when}
          </span>
        </>
      ) : (
        <span className="text-xs text-slate-300">Aucune partie {when}.</span>
      )}
    </SummaryCard>
  )
}
