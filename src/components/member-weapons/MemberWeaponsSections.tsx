'use client'

import { Backpack, ChevronDown, ChevronLeft, ChevronRight, Crosshair, ListFilter, Medal, Ruler, Skull } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'

import RankCell from '@/components/ui/RankCell'
import SegmentedControl from '@/components/ui/SegmentedControl'
import ArmoryWeaponImage from '@/components/weapons/ArmoryWeaponImage'
import { paginate } from '@/lib/pagination'
import { formatCount } from '@/lib/weapons/armory'
import {
  PUBG_SORTS,
  SITE_SORTS,
  careerTotals,
  expertColor,
  expertDistribution,
  throwableLabel,
  type MasteryWeapon,
  type MemberRecord,
  type MemberWeapon,
  type PubgSortKey,
  type SiteSortKey,
} from '@/lib/weapons/member-arsenal'
import type { LoadoutSlot } from '@/lib/weapons/armory'
import { WEAPON_CATEGORY_LABELS, type WeaponCategory } from '@/lib/weapons/weapon-categories'

/** Blocs de la page Armes d'un joueur (maquette « Armes joueur », 24a–24f ; docs/features/armes-joueur.md). */

const percent = (value: number | null) => (value === null ? '—' : `${Math.round(value)} %`)
const meters = (value: number | null) => (value === null ? '—' : `${Math.round(value)} m`)
const thousands = (value: number) => (value >= 10_000 ? `${formatCount(value / 1000)} k` : formatCount(value))

const SM_QUERY = '(min-width: 640px)'
function subscribeSmallScreen(onChange: () => void) {
  const query = window.matchMedia(SM_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
/** Moins de 640 px : libellés courts, 4 cartes par page au lieu de 6. */
export const useIsSmall = () => useSyncExternalStore(subscribeSmallScreen, () => !window.matchMedia(SM_QUERY).matches, () => false)

/** Silhouette d'arme dans un cadre de hauteur fixe (vitrines et cartes). */
function WeaponShowcase({ id, onDark = false, className }: { id: string; onDark?: boolean; className: string }) {
  return (
    <span className={`relative block shrink-0 ${className}`} aria-hidden="true">
      <ArmoryWeaponImage id={id} variant="card" onDark={onDark} />
    </span>
  )
}

function RowIcon({ id, className = 'h-6 w-16' }: { id: string; className?: string }) {
  return (
    <span className={`relative flex shrink-0 items-center justify-center ${className}`} aria-hidden="true">
      <ArmoryWeaponImage id={id} variant="row" />
    </span>
  )
}

// ── Bandeau : catégorie et synchro ───────────────────────────────────────────────────────────────

export function CategoryMenu({
  counts,
  value,
  onChange,
}: {
  counts: Array<{ category: WeaponCategory; count: number }>
  value: WeaponCategory | null
  onChange: (category: WeaponCategory | null) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const active = value !== null
  const total = counts.reduce((sum, entry) => sum + entry.count, 0)
  const choose = (category: WeaponCategory | null) => {
    onChange(category)
    setOpen(false)
  }
  const item = (category: WeaponCategory | null, label: string, count: number) => (
    <button
      key={category ?? 'all'}
      type="button"
      role="menuitemradio"
      aria-checked={value === category}
      onClick={() => choose(category)}
      className={`app-menu__item ${value === category ? 'app-menu__item--active' : ''}`}
    >
      <span>{label}</span>
      <span className="t-num text-xs opacity-75">{count}</span>
    </button>
  )
  return (
    // Étiré à la hauteur de la ligne du bandeau : même hauteur que le segmented voisin.
    <div ref={rootRef} className="relative ml-auto flex shrink-0 self-stretch">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Catégorie : ${active ? WEAPON_CATEGORY_LABELS[value] : 'toutes'}`}
        className={`app-menu-trigger shrink-0 px-2 sm:px-2.5 ${active ? 'app-menu-trigger--active' : ''}`}
        data-testid="category-chip"
      >
        <span className="truncate">
          {active ? (
            <>
              <span className="sm:hidden">{value}</span>
              <span className="hidden sm:inline">{WEAPON_CATEGORY_LABELS[value]}</span>
            </>
          ) : (
            <>
              {/* Mobile : l'icône seule, la ligne du bandeau porte déjà l'onglet et la période. */}
              <ListFilter className="h-4 w-4 sm:hidden" aria-hidden="true" />
              <span className="hidden sm:inline">Toutes catégories</span>
            </>
          )}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" aria-label="Catégorie" className="app-menu absolute right-0 top-full z-50 mt-1.5 w-[230px]">
          {item(null, 'Toutes catégories', total)}
          {counts.map(({ category, count }) => item(category, WEAPON_CATEGORY_LABELS[category], count))}
        </div>
      ) : null}
    </div>
  )
}

// ── Onglet Site ──────────────────────────────────────────────────────────────────────────────────

/** `narrow` : colonne étroite (à côté de l'anneau de niveau) — deux par ligne sur mobile. */
function HeroStats({ stats, narrow = false }: { stats: Array<[string, string]>; narrow?: boolean }) {
  return (
    <dl className={`grid gap-2 tabular-nums ${narrow ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-4'}`}>
      {stats.map(([value, label]) => (
        <div key={label} className="flex min-w-0 flex-col-reverse gap-0.5">
          <dt className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-slate-400">{label}</dt>
          <dd className="t-hero t-hero--sm">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function FavouriteCard({ weapon, when }: { weapon: MemberWeapon | null; when: string }) {
  return (
    <article
      aria-label="Arme de prédilection"
      className="weapon-hero-card weapon-hero-card--favourite relative flex min-w-0 flex-col gap-3 overflow-hidden p-[18px]"
    >
      <span className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-300">Arme de prédilection · {when}</span>
      {weapon ? (
        <>
          <div className="flex flex-1 flex-wrap items-center gap-4">
            <WeaponShowcase id={weapon.iconId} onDark className="h-16 w-[150px] sm:h-[96px] sm:w-[240px]" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <b className="text-2xl font-black tracking-tight sm:text-[30px]">{weapon.name}</b>
              <span className="text-xs font-bold text-slate-300">
                {WEAPON_CATEGORY_LABELS[weapon.category]} · {formatCount(weapon.matchCount)} partie{weapon.matchCount > 1 ? 's' : ''}
              </span>
            </span>
          </div>
          <HeroStats
            stats={[
              [formatCount(weapon.kills), 'kills'],
              [percent(weapon.accuracy), 'précision'],
              [percent(weapon.headshotRate), 'headshots'],
              [meters(weapon.maxDistance), 'kill max'],
            ]}
          />
        </>
      ) : (
        <p className="text-sm text-slate-300">Aucun kill suivi sur la période.</p>
      )}
    </article>
  )
}

export function LoadoutPanel({ slots, throws }: { slots: LoadoutSlot<MemberWeapon>[]; throws: Array<{ itemId: string; count: number }> }) {
  const shown = throws.slice(0, 4)
  const hidden = throws.length - shown.length
  return (
    <section aria-labelledby="member-loadout-title" className="app-panel flex min-w-0 flex-col gap-2 p-3.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <Backpack className="h-4 w-4 text-gray-500" aria-hidden="true" />
        <h2 id="member-loadout-title" className="text-[15px] font-extrabold text-gray-900">Ton loadout type</h2>
        <span className="text-xs text-gray-500">l’arme la plus meurtrière par emplacement</span>
      </div>
      <ol className="flex flex-col gap-1.5" aria-label="Emplacements du sac">
        {slots.map(({ slot, label, weapon }) => (
          <li key={slot} className="flex items-center gap-2.5 rounded-[10px] border border-gray-200 bg-gray-50 px-2.5 py-1.5">
            <span className="w-4 shrink-0 text-xs font-black text-gray-500">{slot}</span>
            {weapon ? <RowIcon id={weapon.iconId} /> : <span className="h-6 w-16 shrink-0" aria-hidden="true" />}
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="truncate text-[13px] text-gray-900">{weapon ? weapon.name : 'Emplacement vide'}</b>
              <span className="truncate text-[11px] text-gray-500">
                {label}
                {weapon ? ` · ${WEAPON_CATEGORY_LABELS[weapon.category]}` : ''}
              </span>
            </span>
            {weapon ? (
              <span className="shrink-0 text-[13px] font-extrabold tabular-nums text-gray-900">
                {formatCount(weapon.kills)} kill{weapon.kills > 1 ? 's' : ''}
              </span>
            ) : null}
          </li>
        ))}
        <li className="flex flex-wrap items-center gap-1.5 pt-0.5" aria-label="5 · Lancers">
          <span className="w-4 shrink-0 text-center text-xs font-black text-gray-500">5</span>
          {shown.length === 0 ? <span className="text-xs text-gray-500">Aucun lancer sur la période.</span> : null}
          {shown.map((item) => (
            <span key={item.itemId} className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 py-0.5 pl-1.5 pr-2.5 text-xs font-semibold text-gray-700" data-testid="throw-chip">
              <RowIcon id={item.itemId} className="h-4 w-4" />
              {throwableLabel(item.itemId)} <b className="text-gray-900">×{formatCount(item.count)}</b>
            </span>
          ))}
          {hidden > 0 ? <span className="text-xs text-gray-500">+{hidden} autre{hidden > 1 ? 's' : ''}</span> : null}
        </li>
      </ol>
    </section>
  )
}

const RECORD_STYLE: Record<MemberRecord['id'], { Icon: typeof Ruler; color: string; bg: string; format: (value: number) => string }> = {
  longest: { Icon: Ruler, color: 'text-amber-500', bg: 'bg-amber-400/15', format: (value) => `${Math.round(value)} m` },
  accuracy: { Icon: Crosshair, color: 'text-sky-500', bg: 'bg-sky-400/15', format: (value) => `${Math.round(value)} %` },
  headshots: { Icon: Skull, color: 'text-rose-500', bg: 'bg-rose-500/15', format: (value) => `${Math.round(value)} %` },
}

export function RecordsStrip({ records }: { records: MemberRecord[] }) {
  return (
    <section aria-label="Records" className="grid gap-2.5 sm:grid-cols-3">
      {records.map((record) => {
        const { Icon, color, bg, format } = RECORD_STYLE[record.id]
        return (
          <article key={record.id} aria-label={record.label} className="app-panel flex items-center gap-3 px-3.5 py-3">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-[10px] ${bg}`}>
              <Icon className={`h-5 w-5 ${color}`} aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-gray-500">{record.label}</span>
              {record.weapon && record.value !== null ? (
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <b className={`t-hero t-hero--sm ${color}`}>{format(record.value)}</b>
                  <span className="truncate text-[13px] font-semibold text-gray-700">au {record.weapon.name}</span>
                </span>
              ) : (
                <span className="text-[13px] text-gray-500">Pas assez de données</span>
              )}
            </span>
          </article>
        )
      })}
    </section>
  )
}

// ── Liste paginée (les deux onglets) ─────────────────────────────────────────────────────────────

function WeaponList<T>({
  title,
  subtitle,
  items,
  sortControl,
  empty,
  renderCard,
  itemKey,
}: {
  title: string
  subtitle: string
  items: T[]
  sortControl: ReactNode
  empty: string
  renderCard: (item: T, index: number) => ReactNode
  itemKey: (item: T) => string
}) {
  const small = useIsSmall()
  const [page, setPage] = useState(1)
  const { current, pageCount, visible, start } = paginate(items, page, small ? 4 : 6)
  return (
    <section aria-labelledby="weapon-list-title" className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h2 id="weapon-list-title" className="text-[17px] font-extrabold text-gray-900">{title}</h2>
        <span className="text-[13px] text-gray-500">{subtitle}</span>
        {pageCount > 1 ? (
          <nav className="ml-auto flex items-center gap-0.5" aria-label={`Pages · ${title}`}>
            <button type="button" className="app-pager-button" onClick={() => setPage(current - 1)} disabled={current === 1} aria-label="Page précédente">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="min-w-[44px] text-center text-[13px] font-bold tabular-nums text-gray-600">
              {current} / {pageCount}
            </span>
            <button type="button" className="app-pager-button" onClick={() => setPage(current + 1)} disabled={current === pageCount} aria-label="Page suivante">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </nav>
        ) : null}
      </div>
      {sortControl}
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-[13px] text-gray-500">{empty}</p>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3" aria-label={title}>
          {visible.map((item, index) => (
            <li key={itemKey(item)} className="min-w-0">
              {renderCard(item, start + index)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Bar({ label, value, width, color }: { label: string; value: string; width: number; color: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="flex justify-between gap-2 text-xs">
        <span className="text-gray-500">{label}</span>
        <b className="tabular-nums text-gray-900">{value}</b>
      </span>
      <span className="h-[5px] overflow-hidden rounded-full bg-gray-100">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, width))}%`, background: color }} />
      </span>
    </div>
  )
}

function CardHead({ lead, name, badge, sub, big }: { lead?: ReactNode; name: string; badge?: ReactNode; sub: string; big: number }) {
  return (
    <div className="flex items-center gap-2.5">
      {lead}
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="flex min-w-0 items-center gap-1.5">
          <b className="truncate text-[15px] text-gray-900">{name}</b>
          {badge}
        </span>
        <span className="truncate text-[11px] font-bold text-gray-500">{sub}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <b className="t-hero t-hero--sm text-gray-900">{formatCount(big)}</b>
        <span className="t-label">kills</span>
      </span>
    </div>
  )
}

export function SiteWeaponList({
  weapons,
  subtitle,
  sort,
  onSort,
  resetKey,
}: {
  weapons: MemberWeapon[]
  subtitle: string
  sort: SiteSortKey
  onSort: (sort: SiteSortKey) => void
  /** Filtres de la page : un changement ramène à la première page. */
  resetKey: string
}) {
  const small = useIsSmall()
  const sorter = SITE_SORTS.find((entry) => entry.key === sort) ?? SITE_SORTS[0]
  const sorted = [...weapons].sort((a, b) => sorter.value(b) - sorter.value(a) || b.kills - a.kills || a.name.localeCompare(b.name, 'fr'))
  // Médailles : les trois premiers en kills de la liste affichée (catégorie comprise), quel que soit le tri.
  const podium = new Map([...weapons].filter((weapon) => weapon.kills > 0).sort((a, b) => b.kills - a.kills || a.name.localeCompare(b.name, 'fr')).slice(0, 3).map((weapon, index) => [weapon.id, index + 1]))
  return (
    <WeaponList
      key={`${sort}-${resetKey}`}
      title="Ton râtelier"
      subtitle={subtitle}
      items={sorted}
      itemKey={(weapon) => weapon.id}
      empty="Aucune arme dans cette catégorie sur la période."
      sortControl={
        <SegmentedControl
          options={SITE_SORTS.map((entry) => ({ value: entry.key, label: small ? entry.short : entry.label }))}
          value={sort}
          onChange={onSort}
          size="sm"
          fullWidthOnMobile
        />
      }
      renderCard={(weapon) => {
        const rank = podium.get(weapon.id)
        return (
          <article aria-label={weapon.name} className={`app-panel flex h-full flex-col gap-2.5 p-3.5 ${rank === 1 ? 'ring-1 ring-amber-400/50' : ''}`}>
            <CardHead
              name={weapon.name}
              badge={rank ? <RankCell rank={rank} size="xs" /> : null}
              sub={WEAPON_CATEGORY_LABELS[weapon.category]}
              big={weapon.kills}
            />
            <WeaponShowcase id={weapon.iconId} className="h-16" />
            <div className="grid grid-cols-2 gap-2">
              <Bar label="Précision" value={percent(weapon.accuracy)} width={weapon.accuracy ?? 0} color="var(--theme-ui-accent)" />
              <Bar label="Headshots" value={percent(weapon.headshotRate)} width={weapon.headshotRate ?? 0} color="var(--theme-ui-negative)" />
            </div>
            <span className="text-xs tabular-nums text-gray-500">
              moy. {meters(weapon.avgDistance)} · max {meters(weapon.maxDistance)} · {formatCount(weapon.matchCount)} partie{weapon.matchCount > 1 ? 's' : ''}
            </span>
          </article>
        )
      }}
    />
  )
}

// ── Onglet PUBG ──────────────────────────────────────────────────────────────────────────────────

function LevelRing({ level, expert, size }: { level: number; expert: number; size: 'sm' | 'lg' }) {
  const color = expertColor(expert)
  const background = `conic-gradient(${color} ${Math.min(100, level)}%, var(--theme-ui-border) 0)`
  if (size === 'sm') {
    return (
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background }} aria-label={`Niveau ${level}`}>
        <span className="t-hero t-hero--sm grid h-8 w-8 place-items-center rounded-full bg-white text-gray-900">{level}</span>
      </span>
    )
  }
  return (
    <span className="grid h-24 w-24 shrink-0 place-items-center rounded-full sm:h-[120px] sm:w-[120px]" style={{ background }}>
      <span className="weapon-hero-ring-core flex h-[82%] w-[82%] flex-col items-center justify-center rounded-full">
        <b className="t-hero t-hero--lg">{level}</b>
        <span className="text-[11px] font-extrabold tracking-[0.12em] text-violet-300">NIVEAU</span>
      </span>
    </span>
  )
}

function ExpertBadge({ expert, onDark = false }: { expert: number; onDark?: boolean }) {
  if (expert <= 0) return null
  return (
    <span
      className={`shrink-0 rounded-[5px] px-1.5 py-px text-[11px] font-black ${onDark ? 'text-slate-950' : 'text-white'}`}
      style={{ background: expertColor(expert) }}
      data-testid="expert-badge"
    >
      EXPERT {expert}
    </span>
  )
}

export function MasteryHero({ weapon }: { weapon: MasteryWeapon | null }) {
  return (
    <article
      aria-label="Arme la plus maîtrisée"
      className="weapon-hero-card weapon-hero-card--mastery relative flex min-w-0 flex-wrap items-center gap-[18px] overflow-hidden p-[18px]"
    >
      {weapon ? (
        <>
          <LevelRing level={weapon.level} expert={weapon.expert} size="lg" />
          <div className="flex min-w-[200px] flex-1 flex-col gap-2.5">
            <span className="text-[11px] font-black tracking-[0.18em] text-violet-300">ARME LA PLUS MAÎTRISÉE · CARRIÈRE</span>
            <div className="flex flex-wrap items-center gap-3.5">
              <b className="text-2xl font-black tracking-tight sm:text-[30px]">{weapon.name}</b>
              <ExpertBadge expert={weapon.expert} onDark />
              <WeaponShowcase id={weapon.iconId} onDark className="h-10 w-[110px] sm:w-[150px]" />
            </div>
            <HeroStats
              narrow
              stats={[
                [formatCount(weapon.kills), 'kills'],
                [formatCount(weapon.knocks), 'knocks'],
                [thousands(weapon.damage), 'dégâts'],
                [formatCount(weapon.headshots), 'headshots'],
              ]}
            />
          </div>
        </>
      ) : (
        <p className="text-sm text-slate-300">Aucune maîtrise d’arme synchronisée pour ce joueur.</p>
      )}
    </article>
  )
}

export function CareerPanel({ weapons }: { weapons: MasteryWeapon[] }) {
  const totals = careerTotals(weapons)
  const distribution = expertDistribution(weapons)
  return (
    <section aria-labelledby="career-title" className="app-panel flex min-w-0 flex-col gap-2.5 p-3.5">
      <div className="flex items-center gap-2">
        <Medal className="h-4 w-4 text-gray-500" aria-hidden="true" />
        <h2 id="career-title" className="text-[15px] font-extrabold text-gray-900">Carrière PUBG</h2>
        <span className="text-xs text-gray-500">toutes armes</span>
      </div>
      <dl className="grid grid-cols-2 gap-2.5 tabular-nums">
        {[
          [formatCount(totals.kills), 'kills'],
          [formatCount(totals.knocks), 'knocks'],
          [thousands(totals.damage), 'dégâts'],
          [formatCount(totals.headshots), 'headshots'],
        ].map(([value, label]) => (
          <div key={label} className="flex flex-col-reverse gap-0.5 rounded-[10px] bg-gray-50 p-2.5">
            <dt className="text-[11px] font-bold text-gray-500">{label}</dt>
            <dd className="t-hero t-hero--sm text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>
      {weapons.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <span className="t-label">Niveaux d’expert</span>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
            {distribution.map(({ expert, count }) => (
              <span key={expert} style={{ width: `${(count / weapons.length) * 100}%`, background: expertColor(expert) }} />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500" aria-label="Armes par niveau d’expert">
            {distribution.map(({ expert, count }) => (
              <li key={expert} className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ background: expertColor(expert) }} aria-hidden="true" />
                {expert === 0 ? 'Avant le niveau 100' : `Expert ${expert}`} · {count}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

export function MasteryList({
  weapons,
  sort,
  onSort,
  resetKey,
}: {
  weapons: MasteryWeapon[]
  sort: PubgSortKey
  onSort: (sort: PubgSortKey) => void
  resetKey: string
}) {
  const sorter = PUBG_SORTS.find((entry) => entry.key === sort) ?? PUBG_SORTS[0]
  const sorted = [...weapons].sort(sorter.compare)
  // Barres relatives à la meilleure arme de la liste : l'API ne donne aucun dénominateur (ni tirs ni touches).
  const maxKnocks = Math.max(1, ...weapons.map((weapon) => weapon.knocks))
  const maxHeadshots = Math.max(1, ...weapons.map((weapon) => weapon.headshots))
  return (
    <WeaponList
      key={`${sort}-${resetKey}`}
      title="Maîtrise par arme"
      subtitle={`${weapons.length} arme${weapons.length > 1 ? 's' : ''}`}
      items={sorted}
      itemKey={(weapon) => weapon.id}
      empty="Aucune arme dans cette catégorie."
      sortControl={
        <SegmentedControl options={PUBG_SORTS.map((entry) => ({ value: entry.key, label: entry.label }))} value={sort} onChange={onSort} size="sm" fullWidthOnMobile />
      }
      renderCard={(weapon) => (
        <article aria-label={weapon.name} className="app-panel flex h-full flex-col gap-2.5 p-3.5">
          <CardHead
            lead={<LevelRing level={weapon.level} expert={weapon.expert} size="sm" />}
            name={weapon.name}
            badge={<ExpertBadge expert={weapon.expert} />}
            sub={WEAPON_CATEGORY_LABELS[weapon.category]}
            big={weapon.kills}
          />
          <WeaponShowcase id={weapon.iconId} className="h-16" />
          <div className="grid grid-cols-2 gap-2">
            <Bar label="Knocks" value={formatCount(weapon.knocks)} width={(weapon.knocks / maxKnocks) * 100} color="var(--theme-ui-accent)" />
            <Bar label="Headshots" value={formatCount(weapon.headshots)} width={(weapon.headshots / maxHeadshots) * 100} color="var(--theme-ui-negative)" />
          </div>
          <span className="text-xs tabular-nums text-gray-500">
            {formatCount(Math.round(weapon.damage))} dégâts · {formatCount(weapon.xp)} XP
          </span>
        </article>
      )}
    />
  )
}
