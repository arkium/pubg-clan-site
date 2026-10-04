'use client'

import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import RankCell from '@/components/ui/RankCell'
import type { ClanComparatorEntry } from '@/hooks/useClanComparator'

/**
 * Briques communes du comparateur de clans — docs/ui/index.html#comparateur (maquettes #slots-esport et
 * #dataviz-esport, en-têtes #en-tetes-modules).
 *
 * Convention « comparé » (charte §0b) : chaque clan garde la couleur de son slot sur toute la page — P1 bleu, P2 orange,
 * P3 émeraude. Ce sont les trois seules couleurs de série de la page, documentées dans index.html, et elles ne servent
 * à rien d'autre. Fonds et bordures en transparence ; texte mêlé au texte du thème (bleu foncé en clair, bleu clair en
 * sombre), donc lisible dans les deux thèmes sans variante `dark:`.
 */
export type ComparatorSlot = { name: 'P1' | 'P2' | 'P3'; colorName: string; hex: string }

export const COMPARATOR_SLOTS: readonly ComparatorSlot[] = [
  { name: 'P1', colorName: 'Bleu', hex: '#3b82f6' },
  { name: 'P2', colorName: 'Orange', hex: '#f97316' },
  { name: 'P3', colorName: 'Vert', hex: '#10b981' },
]

/** Slot d'un clan selon sa place dans la sélection (P1 quand il n'y figure pas). */
export function comparatorSlot(index: number): ComparatorSlot {
  return COMPARATOR_SLOTS[index >= 0 ? index % COMPARATOR_SLOTS.length : 0]
}

/** Couleur du slot en transparence : fond, bordure, halo. */
export function slotTint(slot: ComparatorSlot, percent: number): string {
  return `color-mix(in srgb, ${slot.hex} ${percent}%, transparent)`
}

/** Encre du slot : sa couleur mêlée au texte du thème, lisible sur fond clair comme sur fond sombre. */
export function slotInk(slot: ComparatorSlot): string {
  return `color-mix(in srgb, ${slot.hex} 72%, var(--theme-ui-text))`
}

/** Habillage d'un badge de slot (maquette `p-slot-badge` : bordure 50 %, fond 18 %, halo 8 px à 30 %). */
export function slotBadgeStyle(slot: ComparatorSlot): CSSProperties {
  return {
    borderColor: slotTint(slot, 50),
    backgroundColor: slotTint(slot, 18),
    color: slotInk(slot),
    boxShadow: `0 0 8px ${slotTint(slot, 30)}`,
  }
}

const SLOT_BADGE_SIZE = {
  /** En-têtes de tableau, légendes, infobulles. */
  xs: 'h-[18px] rounded-md px-1 text-[11px]',
  /** En ligne, à côté d'un nom. */
  sm: 'h-5 rounded-md px-1.5 text-[11px]',
  /** Carré en tête d'une ligne de classement. */
  tile: 'h-8 w-8 rounded-lg text-xs sm:h-9 sm:w-9 sm:text-sm',
  /** Carré d'un slot de l'arène de sélection. */
  arena: 'h-9 w-9 rounded-[10px] text-xs sm:h-10 sm:w-10 sm:text-sm',
} as const

/** Badge P1 / P2 / P3 aux couleurs du slot. `children` remplace le nom du slot (icône + nom, par exemple). */
export function SlotBadge({
  slot,
  size = 'sm',
  children,
  className = '',
}: {
  slot: ComparatorSlot
  size?: keyof typeof SLOT_BADGE_SIZE
  children?: ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center gap-1 border font-black uppercase leading-none tracking-wider ${SLOT_BADGE_SIZE[size]} ${className}`.trim()}
      style={slotBadgeStyle(slot)}
    >
      {children ?? slot.name}
    </span>
  )
}

/**
 * En-tête d'un panneau du comparateur (#en-tetes-modules) : tuile lucide teintée à l'accent (comme les awards et les
 * défis), titre `t-section-title`, explication `t-meta`, filet bas. `children` : contrôle aligné à droite.
 */
export function ComparatorSectionHeader({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: LucideIcon
  title: ReactNode
  subtitle: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-gray-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--theme-ui-accent-soft)] shadow-[inset_0_0_0_1px_var(--theme-ui-accent-ring)]">
          <Icon className="h-[18px] w-[18px] text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="t-section-title">{title}</h2>
          <p className="t-meta">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  )
}

/**
 * Légende interactive d'un graphique (radar, profil multi-axes, heatmap) : survoler ou focaliser un clan le fait
 * ressortir partout et estompe les autres (#dataviz-esport, règle « estompage contextuel »).
 */
export function ClanLegend({
  clans,
  hoveredClanId,
  onHover,
  slotOf,
  className = '',
}: {
  clans: ClanComparatorEntry[]
  hoveredClanId: number | null
  onHover: (clanId: number | null) => void
  slotOf?: (clan: ClanComparatorEntry, index: number) => ComparatorSlot
  className?: string
}) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`.trim()}>
      {clans.map((clan, index) => {
        const slot = slotOf ? slotOf(clan, index) : comparatorSlot(index)
        const isHovered = hoveredClanId === clan.clanId
        const isDimmed = hoveredClanId !== null && !isHovered
        return (
          <button
            key={clan.clanId}
            type="button"
            onMouseEnter={() => onHover(clan.clanId)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(clan.clanId)}
            onBlur={() => onHover(null)}
            className={`inline-flex min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition ${
              isHovered ? '' : 'border-gray-200 bg-gray-50'
            } ${isDimmed ? 'opacity-40' : ''}`}
            style={isHovered ? { ...slotBadgeStyle(slot), boxShadow: `0 0 0 2px ${slotTint(slot, 55)}` } : undefined}
          >
            <SlotBadge slot={slot} size="xs" />
            <span className="font-mono font-bold text-gray-900">[{clan.clanTag}]</span>
            <span className="max-w-[140px] truncate font-medium text-gray-500">{clan.clanName}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Libellé « Trier par » au-dessus d'une liste de clans classés (carte : pas de tableau, donc un segmented). */
export function SortCaption({ children }: { children: ReactNode }) {
  return <p className="t-label">{children}</p>
}

/**
 * Ligne d'un classement de clans du comparateur (modes, pouls, ADN) : rang en médaille (`RankCell`, jamais de pastille
 * « 1er »), slot, tag et deux lignes de contexte, puis la valeur du critère en chiffre héros — à l'accent pour le
 * Top 1, dont la ligne est teintée. `compact` : cartes étroites (trois colonnes des modes).
 */
export function ComparatorRankRow({
  rank,
  slot,
  tag,
  name,
  href,
  line1,
  line2,
  value,
  unit,
  aside,
  compact = false,
}: {
  rank: number
  slot: ComparatorSlot
  tag: string
  name: string
  href?: string
  line1: ReactNode
  line2: ReactNode
  value: ReactNode
  unit?: string
  aside: ReactNode
  compact?: boolean
}) {
  const leader = rank === 1
  const tagClass = 'truncate text-base font-black tracking-tight'
  return (
    <div
      className={`flex items-center justify-between transition-colors ${compact ? 'gap-2 p-3' : 'gap-3 p-4'} ${
        leader ? 'bg-[var(--theme-ui-accent-tint)]' : 'hover:bg-gray-50'
      }`}
    >
      <div className={`flex min-w-0 items-center ${compact ? 'gap-2' : 'gap-3'}`}>
        <span className={`flex shrink-0 justify-center ${compact ? 'w-[18px]' : 'w-6'}`}>
          <RankCell rank={rank} size={compact ? 'xs' : 'sm'} />
        </span>
        <SlotBadge slot={slot} size="tile" />
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            {href ? (
              <Link href={href} className={`app-link ${tagClass}`}>
                {tag}
              </Link>
            ) : (
              <span className={`${tagClass} text-gray-900`}>{tag}</span>
            )}
            <span className="hidden max-w-[130px] truncate text-xs text-gray-500 sm:inline">{name}</span>
          </div>
          <span className="t-meta truncate">{line1}</span>
          <span className="t-label truncate">{line2}</span>
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1 pl-2 text-right">
        <span className="whitespace-nowrap">
          <b className={`t-hero t-hero--sm ${leader ? 't-accent' : 'text-gray-900'}`}>{value}</b>
          {unit ? <span className="t-body text-gray-700"> {unit}</span> : null}
        </span>
        <span className="t-meta">{aside}</span>
      </div>
    </div>
  )
}
