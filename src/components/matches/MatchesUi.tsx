import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'

import { placeTone, type PlaceTone } from '@/lib/match-sessions'

/**
 * Éléments communs aux pages Matchs et Soirée (docs/features/matches.md, maquette Claude Design « Matchs et
 * soirées ») : bandeau d'image, indicateurs, pastille de place. Couleurs par jetons (`.game-ui`, `--theme-ui-*`).
 */

const PLACE_TONE_STYLE: Record<PlaceTone, CSSProperties> = {
  gold: { background: 'var(--game-gold-soft)', borderColor: 'var(--game-gold-ring)', color: 'var(--game-gold)' },
  pos: { background: 'var(--game-pos-soft)', borderColor: 'var(--game-pos-ring)', color: 'var(--game-pos)' },
  sky: { background: 'var(--game-sky-soft)', borderColor: 'var(--game-sky-ring)', color: 'var(--game-sky)' },
  neutral: { background: 'var(--theme-ui-surface-soft)', borderColor: 'var(--theme-ui-border)', color: 'var(--theme-ui-text-muted)' },
}

export function placeToneStyle(place: number): CSSProperties {
  return PLACE_TONE_STYLE[placeTone(place)]
}

/** Case d'une partie dans le carnet de soirée : place finale, couleur selon la place. */
export function PlaceCell({ place, title }: { place: number; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex h-[22px] min-w-7 items-center justify-center rounded-[5px] border px-1 text-[11px] font-bold tabular-nums"
      style={placeToneStyle(place)}
    >
      {place}
    </span>
  )
}

/** Pastille du bandeau : neutre, or (top 1) ou verte avec un point (activité de la soirée). */
export type BannerChip = { icon?: LucideIcon; text: string; gold?: boolean; live?: boolean }

/**
 * Bandeau d'image partagé par la liste des matchs et la page d'une soirée. Hauteurs reprises de l'ancien bandeau de
 * la page Matchs (règle : ne jamais changer la hauteur d'un bandeau d'image).
 */
export function MatchesBanner({
  image,
  eyebrow,
  icon: Icon,
  iconColor,
  title,
  chips,
}: {
  image: string | null
  eyebrow?: string
  icon: LucideIcon
  iconColor: string
  title: string
  chips: BannerChip[]
}) {
  return (
    <header
      className="relative min-h-[10rem] overflow-hidden rounded-2xl bg-cover bg-no-repeat sm:min-h-[13rem]"
      style={{ backgroundColor: '#0b1120', backgroundImage: image ? `url('${image}')` : undefined, backgroundPosition: 'center 40%' }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 to-slate-950/20 sm:bg-gradient-to-r sm:from-slate-950/90 sm:via-slate-950/55 sm:to-slate-950/10" />
      <div className="absolute inset-0 flex flex-col justify-end gap-2.5 px-3.5 py-3 text-white sm:px-6 sm:py-5">
        {eyebrow && <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-200">{eyebrow}</span>}
        <div className="flex items-center gap-2.5">
          <Icon className="h-5 w-5 shrink-0 sm:h-[22px] sm:w-[22px]" style={{ color: iconColor }} aria-hidden="true" />
          <h1 className="m-0 text-[19px] font-extrabold leading-tight tracking-[-0.02em] sm:text-[26px]">{title}</h1>
        </div>
        <ul className="flex flex-wrap items-center gap-1.5 text-xs">
          {chips.map((chip) => {
            const ChipIcon = chip.icon
            return (
              <li
                key={chip.text}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-semibold ${
                  chip.gold
                    ? 'border-amber-400 bg-amber-400/90 text-amber-950'
                    : chip.live
                      ? 'border-emerald-400/60 bg-emerald-500/25 text-white'
                      : 'border-white/25 bg-white/15 text-white'
                }`}
              >
                {chip.live ? (
                  <span className="h-[7px] w-[7px] rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgb(52_211_153/0.3)]" aria-hidden="true" />
                ) : ChipIcon ? (
                  <ChipIcon className="h-3 w-3" aria-hidden="true" />
                ) : null}
                {chip.text}
              </li>
            )
          })}
        </ul>
      </div>
    </header>
  )
}

export type Kpi = {
  label: string
  value: string
  detail: string
  icon: LucideIcon
  color: string
  /** Lien « aller plus loin » vers la page où la donnée est détaillée (vue d'ensemble du clan). */
  link?: { href: string; label: string }
}

/** Indicateurs de page : même carte sur les deux pages (libellé, icône teintée, valeur, détail). */
export function KpiGrid({ items, className = '' }: { items: Kpi[]; className?: string }) {
  return (
    <dl className={`grid gap-2.5 ${className}`}>
      {items.map((item) => {
        const Icon = item.icon
        return (
          <div key={item.label} className="app-panel flex flex-col gap-1 px-3.5 py-3">
            <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-500">
              <Icon className="h-[13px] w-[13px] shrink-0" style={{ color: item.color }} aria-hidden="true" />
              {item.label}
            </dt>
            <dd className="text-[26px] font-extrabold tracking-[-0.02em] tabular-nums">{item.value}</dd>
            <dd className="text-xs text-gray-500">{item.detail}</dd>
            {item.link ? (
              <dd className="mt-1">
                <Link href={item.link.href} className="text-xs font-semibold hover:underline" style={{ color: 'var(--game-link)' }}>
                  {item.link.label} →
                </Link>
              </dd>
            ) : null}
          </div>
        )
      })}
    </dl>
  )
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="m-0 text-lg font-bold">{children}</h2>
      {aside ? <span className="text-xs text-gray-500">{aside}</span> : null}
    </div>
  )
}
