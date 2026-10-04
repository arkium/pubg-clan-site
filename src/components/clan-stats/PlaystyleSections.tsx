'use client'

import { Car, Cpu, Crosshair, Fuel, HeartPulse, MapPin, Package, RefreshCcw, Shield, Target, Users, Wrench, Zap, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import Pagination from '@/components/ui/Pagination'
import RankCell from '@/components/ui/RankCell'
import ShowMoreToggle from '@/components/ui/ShowMoreToggle'
import TeamModeBadge from '@/components/ui/TeamModeBadge'
import {
  formatDecimal,
  formatInteger,
  formatPercent,
  itemFamilyColor,
  itemFamilyLabel,
  itemLabel,
  type CooperationPair,
  type CooperationTopId,
  cooperationSummary,
  cooperationTop,
  playstyleRoles,
  playstyleThemes,
  synergyGroups,
  type ClanPlaystyleRow,
  type PlaystyleRoleId,
  type SynergyEntry,
} from '@/lib/clan-playstyle'
import type { ItemUseStats } from '@/lib/item-use-stats'
import { paginate } from '@/lib/pagination'
import { itemIconUrl, resolveItemName } from '@/lib/pubg-assets'

/** Blocs de la page « Style de jeu du clan » (maquette « Statistiques », 2026-09-27 — docs/features/statistiques.md). */

export function SectionHeading({ id, title, subtitle, children }: { id: string; title: string; subtitle: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="t-section-title">{title}</h2>
        <span className="t-meta">{subtitle}</span>
      </div>
      {children}
    </div>
  )
}

// ── Profil de jeu ───────────────────────────────────────────────────────────────────────────────────

/** Couleurs des rôles : jetons de thème (charte, « Rôles ») — lisibles en texte dans les deux thèmes, comme le style de jeu du joueur. */
const ROLE_STYLE: Record<PlaystyleRoleId, { color: string; icon: LucideIcon }> = {
  fragger: { color: 'var(--game-neg)', icon: Crosshair },
  medic: { color: 'var(--game-sky)', icon: HeartPulse },
  ghost: { color: 'var(--game-pos)', icon: Shield },
}

/** Fond teinté d'une couleur (jeton compris : `${hex}26` ne marche pas sur une variable CSS). */
const tint = (color: string, percent: number) => `color-mix(in srgb, ${color} ${percent}%, transparent)`

/** Jauge en arc de 270°, comme le tableau de bord d’un joueur ; reprise par le style de jeu du joueur. */
export function ArcGauge({ value, color }: { value: number; color: string }) {
  const radius = 34
  const circumference = 2 * Math.PI * radius
  const arc = circumference * 0.75
  const fill = arc * Math.min(1, Math.max(0, value / 100))
  return (
    <svg width={84} height={84} viewBox="0 0 80 80" aria-hidden="true">
      <g transform="rotate(135 40 40)">
        <circle cx="40" cy="40" r={radius} fill="none" stroke="var(--theme-ui-surface-strong)" strokeWidth="7" strokeDasharray={`${arc} ${circumference - arc}`} strokeLinecap="round" />
        <circle cx="40" cy="40" r={radius} fill="none" stroke={color} strokeWidth="7" strokeDasharray={`${fill} ${circumference - fill}`} strokeLinecap="round" />
      </g>
    </svg>
  )
}

export function PlaystyleRoleCards({ rows }: { rows: ClanPlaystyleRow[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {playstyleRoles(rows).map((role) => {
        const { color, icon: Icon } = ROLE_STYLE[role.id]
        const best = role.top[0]?.score ?? 0
        return (
          <article key={role.id} className="app-panel flex flex-col gap-3 p-4" aria-label={`${role.role} : ${role.metric}`}>
            <div className="flex items-center gap-3.5">
              <div className="relative h-[84px] w-[84px] shrink-0">
                <ArcGauge value={role.average} color={color} />
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-px">
                  <Icon className="h-4 w-4" style={{ color }} aria-hidden="true" />
                  <b className="t-hero t-hero--sm" style={{ color }}>{formatPercent(role.average)}</b>
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="t-label" style={{ color }}>{role.role}</span>
                <b className="t-card-title">{role.metric}</b>
                <span className="t-meta">{role.hint}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 border-t border-gray-200 pt-3">
              {role.top.length === 0 ? (
                <span className="t-meta">Aucun joueur avec ce score sur la période.</span>
              ) : (
                role.top.map((entry, index) => (
                  <div key={entry.memberId} className="grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 text-xs">
                    <RankCell rank={index + 1} size="xs" />
                    <span className="flex min-w-0 flex-col gap-1">
                      <span className="truncate text-gray-900">{entry.displayName}</span>
                      <span className="h-[5px] overflow-hidden rounded bg-[var(--theme-ui-surface-strong)]">
                        <span className="block h-full rounded" style={{ width: `${best > 0 ? (entry.score / best) * 100 : 0}%`, backgroundColor: color }} />
                      </span>
                    </span>
                    <b className="t-num" style={{ color }}>{formatPercent(entry.score)}</b>
                  </div>
                ))
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}

function ThemeCard({
  title,
  subtitle,
  icon: Icon,
  color,
  bar,
  rows,
}: {
  title: string
  subtitle: string
  icon: LucideIcon
  color: string
  bar: Array<{ value: number; color: string; label: string }>
  rows: Array<{ label: string; value: string }>
}) {
  return (
    <article className="app-panel flex flex-col gap-2.5 p-4" aria-label={title}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-[9px]" style={{ backgroundColor: tint(color, 15) }}>
          <Icon className="h-4 w-4" style={{ color }} aria-hidden="true" />
        </span>
        <span className="flex flex-col">
          <b className="t-card-title">{title}</b>
          <span className="t-meta">{subtitle}</span>
        </span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--theme-ui-surface-strong)]" aria-hidden="true">
        {bar.map((segment) => (
          <span key={segment.label} style={{ width: `${Math.max(0, Math.min(100, segment.value))}%`, backgroundColor: segment.color }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
        {bar.map((segment) => (
          <span key={segment.label} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: segment.color }} aria-hidden="true" />
            {segment.label}
          </span>
        ))}
      </div>
      <dl className="flex flex-col gap-1.5 border-t border-gray-200 pt-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-2 text-xs">
            <dt className="text-gray-700">{row.label}</dt>
            <dd className="t-num text-[13px] font-bold text-gray-900">{row.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  )
}

export function PlaystyleThemeCards({ rows }: { rows: ClanPlaystyleRow[] }) {
  const { mobility, circle, survival } = playstyleThemes(rows)
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <ThemeCard
        title="Mobilité"
        subtitle={`${formatDecimal(mobility.distance)} km par match en moyenne`}
        icon={Car}
        color="var(--game-sky)"
        bar={[
          { value: mobility.footShare, color: 'var(--game-sky)', label: `${formatPercent(mobility.footShare)} à pied` },
          { value: mobility.vehicleShare, color: 'var(--game-violet)', label: `${formatPercent(mobility.vehicleShare)} en véhicule` },
        ]}
        rows={[
          { label: 'À pied', value: `${formatDecimal(mobility.foot)} km` },
          { label: 'En véhicule', value: `${formatDecimal(mobility.vehicle)} km` },
          { label: 'Vitesse max', value: `${formatDecimal(mobility.maxSpeed)} km/h` },
        ]}
      />
      <ThemeCard
        title="Gestion du cercle"
        subtitle={`${formatPercent(circle.safe)} du temps en zone sûre`}
        icon={MapPin}
        color="var(--game-pos)"
        bar={[
          { value: circle.safe, color: 'var(--game-pos)', label: `En zone ${formatPercent(circle.safe)}` },
          ...(circle.outside !== null ? [{ value: circle.outside, color: 'var(--game-neg)', label: `Hors zone ${formatPercent(circle.outside)}` }] : []),
        ]}
        rows={[
          { label: 'Coups de zone bleue', value: `${formatDecimal(circle.blueZoneHits)} / match` },
          { label: 'Premier contact', value: `phase ${formatDecimal(circle.firstContactPhase)}` },
          { label: 'Retard sur le cercle', value: circle.delaySeconds !== null ? `${formatDecimal(circle.delaySeconds)} s` : '–' },
        ]}
      />
      <ThemeCard
        title="Survie et soins"
        subtitle={`${formatInteger(survival.healed)} PV soignés · ${formatInteger(survival.damageTaken)} dégâts reçus`}
        icon={HeartPulse}
        color="var(--game-neg)"
        bar={[{ value: survival.coverage, color: 'var(--game-pos)', label: `Les soins couvrent ${formatPercent(survival.coverage)} des dégâts reçus` }]}
        rows={[
          { label: 'Soins', value: `${formatDecimal(survival.heals)} / match` },
          { label: 'Boosts', value: `${formatDecimal(survival.boosts)} / match` },
          { label: 'Dégâts reçus', value: `${formatInteger(survival.damageTaken)} / match` },
        ]}
      />
    </div>
  )
}

// ── Objets consommés ────────────────────────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 8
const MEMBERS_PER_PAGE = 8

/** Pictogramme de repli quand le dépôt officiel PUBG n'a pas d'icône pour l'objet (bouclier pliable, puce bleue…). */
const ITEM_FALLBACK_ICONS: Record<string, LucideIcon> = {
  Item_BulletproofShield_C: Shield,
  Item_Bluechip_C: Cpu,
}
const FAMILY_FALLBACK_ICONS: Record<string, LucideIcon> = { Heal: HeartPulse, Boost: Zap, Fuel, Gadget: Wrench }

function ItemVignetteIcon({ itemId, subCategory }: { itemId: string; subCategory: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) {
    const Icon = ITEM_FALLBACK_ICONS[itemId] ?? FAMILY_FALLBACK_ICONS[subCategory] ?? Package
    return (
      <span className="flex h-[52px] w-[52px] items-center justify-center" data-testid="item-icon-fallback">
        <Icon className="h-9 w-9" style={{ color: itemFamilyColor(subCategory) }} strokeWidth={1.75} aria-hidden="true" />
      </span>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- icônes PUBG locales, sur vignette sombre
    <img
      src={itemIconUrl(itemId)}
      alt=""
      className="h-[52px] w-[52px] object-contain drop-shadow-[0_4px_6px_rgba(0,0,0,0.5)]"
      // Une erreur survenue avant l'hydratation n'appelle pas onError : on relit l'état de l'image au montage.
      ref={(img) => {
        if (img && img.complete && img.naturalWidth === 0) setFailed(true)
      }}
      onError={() => setFailed(true)}
    />
  )
}

export function ItemUseSection({ stats }: { stats: ItemUseStats | null }) {
  const [itemPage, setItemPage] = useState(1)
  const [memberPage, setMemberPage] = useState(1)

  if (!stats || stats.totalCount === 0) {
    return (
      <p className="app-panel t-body p-4 text-gray-700">
        Aucun objet consommé enregistré sur cette période. Le détail par objet n’existe que pour les matchs analysés
        depuis le 2026-09-17 : la télémétrie plus ancienne ne conserve pas ces événements.
      </p>
    )
  }

  const perMatch = stats.matchCount > 0 ? stats.totalCount / stats.matchCount : 0
  const dominant = stats.families[0]
  const items = paginate(stats.items, itemPage, ITEMS_PER_PAGE)
  const members = paginate(stats.members, memberPage, MEMBERS_PER_PAGE)
  const bestPerMatch = stats.members.reduce((max, member) => Math.max(max, member.perMatch), 0)

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Objets consommés', value: formatInteger(stats.totalCount), detail: `${formatInteger(stats.matchCount)} matchs analysés`, color: undefined },
          { label: 'Par match', value: formatDecimal(perMatch), detail: 'toutes familles confondues', color: undefined },
          {
            label: 'Famille dominante',
            value: dominant ? itemFamilyLabel(dominant.subCategory) : '–',
            detail: dominant ? `${formatDecimal(dominant.share)} % des objets` : '',
            color: dominant ? itemFamilyColor(dominant.subCategory) : undefined,
          },
        ].map((kpi) => (
          <div key={kpi.label} className="app-panel app-kpi">
            <span className="t-label">{kpi.label}</span>
            <b className="t-hero t-hero--md flex items-center gap-2 text-gray-900">
              {kpi.color ? <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: kpi.color }} aria-hidden="true" /> : null}
              {kpi.value}
            </b>
            <span className="t-meta">{kpi.detail}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="app-panel flex flex-col gap-3 p-4">
          <div className="flex h-3 overflow-hidden rounded-full bg-[var(--theme-ui-surface-strong)]" aria-hidden="true">
            {stats.families.map((family) => (
              <span key={family.subCategory} title={itemFamilyLabel(family.subCategory)} style={{ width: `${family.share}%`, backgroundColor: itemFamilyColor(family.subCategory) }} />
            ))}
          </div>
          <ul className="grid grid-cols-2 gap-2" aria-label="Familles d'objets">
            {stats.families.map((family) => (
              <li key={family.subCategory} className="app-panel-muted flex items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 text-[13px]">
                <span className="inline-flex items-center gap-1.5 text-gray-700">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: itemFamilyColor(family.subCategory) }} aria-hidden="true" />
                  {itemFamilyLabel(family.subCategory)}
                </span>
                <span className="t-num text-gray-900">
                  <b>{formatInteger(family.count)}</b> <span className="text-[11px] text-gray-500">{formatDecimal(family.share)} %</span>
                </span>
              </li>
            ))}
          </ul>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Objets les plus consommés">
            {items.visible.map((item, index) => (
              <li
                key={item.itemId}
                className="relative flex flex-col items-center gap-1 rounded-xl bg-gradient-to-b from-slate-700 to-slate-900 px-2 pb-2 pt-2.5 text-white"
                style={{ borderBottom: `3px solid ${itemFamilyColor(item.subCategory)}` }}
              >
                <span className="t-num absolute left-2 top-1.5 text-[11px] font-extrabold text-white/55">#{items.start + index + 1}</span>
                <ItemVignetteIcon itemId={item.itemId} subCategory={item.subCategory} />
                <span className="flex min-h-[26px] items-center text-center text-[11px] font-semibold leading-tight">
                  {itemLabel(item.itemId, resolveItemName)}
                </span>
                <b className="t-num text-[15px]">{formatInteger(item.count)}</b>
              </li>
            ))}
          </ul>
          <Pagination
            ariaLabel="Pages des objets"
            itemLabel="Objets"
            page={items.current}
            pageCount={items.pageCount}
            total={stats.items.length}
            pageSize={ITEMS_PER_PAGE}
            onPageChange={setItemPage}
          />
        </div>

        {stats.members.length > 0 ? (
          <div className="app-panel flex flex-col gap-2 p-4">
            <div className="flex items-baseline justify-between">
              <b className="t-card-title">Par membre</b>
              <span className="t-meta">objets / match</span>
            </div>
            <ol className="flex flex-col gap-2" aria-label="Objets consommés par membre">
              {members.visible.map((member) => (
                <li key={member.memberId} className="grid grid-cols-[minmax(0,1fr)_70px_40px] items-center gap-2 text-xs">
                  <span className="truncate text-gray-900">{member.displayName}</span>
                  <span className="h-1.5 overflow-hidden rounded bg-[var(--theme-ui-surface-strong)]" aria-hidden="true">
                    <span className="block h-full rounded bg-[var(--theme-ui-accent)]" style={{ width: `${bestPerMatch > 0 ? (member.perMatch / bestPerMatch) * 100 : 0}%` }} />
                  </span>
                  <b className="t-num text-right text-gray-900">{formatDecimal(member.perMatch)}</b>
                </li>
              ))}
            </ol>
            <Pagination
              className="mt-auto pt-2"
              ariaLabel="Pages des membres"
              itemLabel="Membres"
              page={members.current}
              pageCount={members.pageCount}
              total={stats.members.length}
              pageSize={MEMBERS_PER_PAGE}
              onPageChange={setMemberPage}
            />
          </div>
        ) : null}
      </div>
    </>
  )
}

// ── Synergies d'équipe ──────────────────────────────────────────────────────────────────────────────

function NameChips({ names }: { names: string[] }) {
  return (
    <span className="flex min-w-0 flex-1 flex-wrap gap-1">
      {names.map((name) => (
        <span key={name} className="app-panel-muted rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-gray-900">
          {name}
        </span>
      ))}
    </span>
  )
}

function SynergyList({ id, label, entries }: { id: 'duo' | 'trio' | 'squad'; label: string; entries: SynergyEntry[] }) {
  const [expanded, setExpanded] = useState(false)
  const visible = expanded ? entries : entries.slice(0, 3)
  return (
    <article className="app-panel overflow-hidden p-0!" aria-label={`Synergies ${label}`}>
      <div className="bg-photo-fallback relative h-[84px] bg-cover bg-center" style={{ backgroundImage: `url('/${id}.jpg')` }}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-black/5" />
        <TeamModeBadge mode={id} size="sm" className="absolute bottom-2.5 left-3" />
      </div>
      <div className="flex flex-col px-3.5 py-1">
        {entries.length === 0 ? (
          <p className="t-meta py-3">Pas encore assez de parties ensemble.</p>
        ) : (
          visible.map((entry, index) => (
            <div key={entry.memberIds.join(':')} className="flex flex-col gap-1.5 border-b border-gray-200 py-2.5 last:border-b-0">
              <div className="flex items-center gap-2.5">
                <RankCell rank={index + 1} size="xs" />
                <NameChips names={entry.memberNames} />
                <span className="t-num grid grid-cols-2 gap-x-3 text-right">
                  <b className="text-[13px] text-gray-900">{formatInteger(entry.matchesPlayed)}</b>
                  <b className="t-pos text-[13px]">{formatDecimal(entry.winRate * 100)} %</b>
                  <span className="t-label">Matchs</span>
                  <span className="t-label" title="Win rate">WR</span>
                </span>
              </div>
              {/* La barre de win rate de l'ancien bloc « Synergies de squad », fusionné ici (décision du 2026-09-27). */}
              <span className="h-1.5 overflow-hidden rounded-full bg-[var(--theme-ui-surface-strong)]" aria-hidden="true">
                <span className="block h-full rounded-full bg-[var(--game-pos)]" style={{ width: `${Math.min(100, entry.winRate * 100)}%` }} />
              </span>
            </div>
          ))
        )}
        {entries.length > 3 ? <ShowMoreToggle expanded={expanded} onToggle={() => setExpanded((value) => !value)} /> : null}
      </div>
    </article>
  )
}

export function SynergySection({ synergies }: { synergies: { topPairs: SynergyEntry[]; topSquads: SynergyEntry[] } | null }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {synergyGroups(synergies).map((group) => (
        <SynergyList key={group.id} id={group.id} label={group.label} entries={group.entries} />
      ))}
    </div>
  )
}

// ── Coopération ─────────────────────────────────────────────────────────────────────────────────────

const COOPERATION_TOPS: Array<{ id: CooperationTopId; title: string; image: string; icon: LucideIcon; color: string }> = [
  { id: 'revives', title: 'Top sauvetages', image: '/sauvetage.jpg', icon: HeartPulse, color: 'var(--game-pos)' },
  { id: 'coKills', title: 'Top co-kills', image: '/cokills.jpg', icon: Target, color: 'var(--game-neg)' },
  { id: 'recalls', title: 'Top recalls', image: '/recall.jpg', icon: RefreshCcw, color: 'var(--game-sky)' },
]

function CooperationTop({ pairs, top }: { pairs: CooperationPair[]; top: (typeof COOPERATION_TOPS)[number] }) {
  const [expanded, setExpanded] = useState(false)
  const rows = cooperationTop(pairs, top.id)
  const visible = expanded ? rows : rows.slice(0, 3)
  const Icon = top.icon
  return (
    <article className="app-panel overflow-hidden p-0!" aria-label={top.title}>
      <div className="app-on-photo bg-photo-fallback relative h-[84px] bg-cover bg-center" style={{ backgroundImage: `url('${top.image}')` }}>
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 to-black/5" />
        <span className="absolute bottom-2.5 left-3 inline-flex items-center gap-1.5 rounded-md bg-black/60 px-2.5 py-1 text-[13px] font-extrabold text-white">
          <Icon className="h-3.5 w-3.5" style={{ color: top.color }} aria-hidden="true" />
          {top.title}
        </span>
      </div>
      <div className="flex flex-col px-3.5 pb-2 pt-1">
        {rows.length === 0 ? (
          <p className="t-meta py-3">Aucun binôme sur cette période.</p>
        ) : (
          visible.map((row, index) => (
            <div key={row.key} className="flex items-center gap-2.5 border-b border-gray-200 py-2.5 last:border-b-0">
              <RankCell rank={index + 1} size="xs" />
              <NameChips names={row.names} />
              <b className="t-num rounded-md px-2 py-0.5 text-[13px]" style={{ backgroundColor: tint(top.color, 18), color: top.color }}>
                {formatInteger(row.value)}
              </b>
            </div>
          ))
        )}
        {rows.length > 3 ? <ShowMoreToggle expanded={expanded} onToggle={() => setExpanded((value) => !value)} /> : null}
      </div>
    </article>
  )
}

export function CooperationSection({ pairs }: { pairs: CooperationPair[] }) {
  const summary = cooperationSummary(pairs)
  const kpis: Array<{ label: string; value: string; unit?: string; icon: LucideIcon; color: string; title?: string }> = [
    {
      label: 'Indice de synergie',
      value: formatDecimal(summary.index),
      unit: ' / 100',
      icon: Zap,
      color: 'var(--theme-ui-accent)',
      title: 'Proche de 100 quand tous les binômes coopèrent autant que le meilleur ; proche de 0 quand la coopération repose sur un seul binôme.',
    },
    { label: 'Binômes actifs', value: formatInteger(summary.pairs), icon: Users, color: 'var(--theme-ui-text-muted)' },
    { label: 'Réanimations', value: formatInteger(summary.revives), icon: HeartPulse, color: 'var(--game-pos)' },
    { label: 'Co-kills', value: formatInteger(summary.coKills), icon: Target, color: 'var(--game-neg)' },
    { label: 'Recalls', value: formatInteger(summary.recalls), icon: RefreshCcw, color: 'var(--game-sky)' },
  ]
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          return (
            <div key={kpi.label} className="app-panel app-kpi" title={kpi.title}>
              <span className="grid h-7 w-7 place-items-center rounded-lg" style={{ backgroundColor: tint(kpi.color, 16) }}>
                <Icon className="h-[15px] w-[15px]" style={{ color: kpi.color }} aria-hidden="true" />
              </span>
              <b className="t-hero t-hero--md text-gray-900">
                {kpi.value}
                {kpi.unit ? <span className="ml-0.5 text-base text-gray-500">{kpi.unit}</span> : null}
              </b>
              <span className="t-label">{kpi.label}</span>
            </div>
          )
        })}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {COOPERATION_TOPS.map((top) => (
          <CooperationTop key={top.id} pairs={pairs} top={top} />
        ))}
      </div>
      <p className="t-meta flex flex-wrap gap-4">
        <span>
          Dégâts partagés : <b className="t-num text-gray-900">{formatInteger(summary.sharedDamage)}</b>
        </span>
        <span>
          Score moyen par binôme : <b className="t-num text-gray-900">{formatDecimal(summary.averageScore)}</b>
        </span>
      </p>
    </>
  )
}
