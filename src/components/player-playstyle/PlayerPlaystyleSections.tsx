'use client'

import { Car, Crosshair, HeartPulse, MapPin, Package, RefreshCcw, Shield, Target, Users, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { useState, type ReactNode } from 'react'

import { ArcGauge } from '@/components/clan-stats/PlaystyleSections'
import Pagination from '@/components/ui/Pagination'
import RankCell from '@/components/ui/RankCell'
import SortableTh from '@/components/ui/SortableTh'
import { formatDecimal, formatInteger, formatPercent, playstyleThemes, type ClanPlaystyleRow, type PlaystyleRoleId } from '@/lib/clan-playstyle'
import { paginate } from '@/lib/pagination'
import { cooperationTotals, roleDeltaLabel, type CooperationPartner, type PlayerRoleComparison } from '@/lib/player-playstyle'

/**
 * Blocs du style de jeu d'un joueur (`/members/[id]/playstyle`, docs/features/membres.md). Écrits d'emblée selon la
 * charte (docs/ui/index.html) : classes de rôle, chiffres héros en Teko, couleurs par jetons.
 */

/**
 * Couleur d’un rôle : les teintes du tableau de bord (`rosterRole`), mais en jetons de thème — en clair, les teintes
 * fixes ne sont pas lisibles comme texte (« FRAGGER », « 82 % ») sur fond blanc.
 */
const ROLE_COLOR: Record<PlaystyleRoleId, string> = { fragger: 'var(--game-neg)', medic: 'var(--game-sky)', ghost: 'var(--game-pos)' }

const ROLE_ICON: Record<PlaystyleRoleId, LucideIcon> = { fragger: Crosshair, medic: HeartPulse, ghost: Shield }

export function PlaystyleSectionTitle({ id, title, subtitle }: { id: string; title: string; subtitle: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <h2 id={id} className="t-section-title">{title}</h2>
      <p className="t-meta">{subtitle}</p>
    </div>
  )
}

// ── Profil de jeu : un rôle face au clan ────────────────────────────────────────────────────────────

export function PlayerRoleCards({ roles }: { roles: PlayerRoleComparison[] }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {roles.map((role) => {
        const color = ROLE_COLOR[role.id]
        const Icon = ROLE_ICON[role.id]
        const delta = roleDeltaLabel(role.delta)
        return (
          <article key={role.id} aria-label={`${role.role} : ${role.metric}`} className="app-panel flex flex-col gap-3 p-4" data-testid={`role-${role.id}`}>
            <div className="flex items-center gap-3.5">
              <div className="relative h-[84px] w-[84px] shrink-0">
                <ArcGauge value={role.score} color={color} />
                <span className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                  <Icon className="h-4 w-4" style={{ color }} aria-hidden="true" />
                  <b className="t-hero t-hero--sm" style={{ color }}>{role.score} %</b>
                </span>
              </div>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="t-label" style={{ color }}>{role.role}</span>
                <b className="t-card-title">{role.metric}</b>
                <span className="t-meta">{role.hint}</span>
              </div>
            </div>
            {role.clanAverage !== null ? (
              <div className="flex flex-col gap-2 border-t border-gray-200 pt-3">
                {/* Barre du joueur et repère de la moyenne du clan, comme la carte « Profil de jeu » du tableau de bord. */}
                <div className="relative h-2.5 rounded-[6px] bg-[var(--theme-ui-surface-strong)]" aria-hidden="true">
                  <div className="h-full rounded-[6px]" style={{ width: `${role.score}%`, backgroundColor: color }} />
                  <span className="absolute -top-[3px] h-4 w-0.5 bg-[var(--theme-ui-text)]" style={{ left: `${role.clanAverage}%` }} />
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="t-meta">
                    Moyenne du clan <b className="t-num text-gray-900">{role.clanAverage} %</b>
                  </span>
                  {delta ? (
                    <span className={`app-kpi__delta text-xs ${role.delta! > 0 ? 'app-kpi__delta--up' : role.delta! < 0 ? 'app-kpi__delta--down' : 'app-kpi__delta--flat'}`}>{delta}</span>
                  ) : null}
                </div>
                <span className="t-meta t-num" data-testid={`rank-${role.id}`}>
                  {role.rank === 1 ? 'Meilleur du clan' : `${role.rank}ᵉ sur ${role.ranked} joueurs du clan`}
                </span>
              </div>
            ) : (
              <span className="t-meta border-t border-gray-200 pt-3">Pas assez de joueurs du clan mesurés pour comparer.</span>
            )}
          </article>
        )
      })}
    </div>
  )
}

// ── Mobilité, cercle, survie : le joueur et le clan ─────────────────────────────────────────────────

type ThemeRow = { label: string; player: string; clan: string | null }

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
  rows: ThemeRow[]
}) {
  const withClan = rows.some((row) => row.clan !== null)
  return (
    <article aria-label={title} className="app-panel flex flex-col gap-2.5 p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px]" style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}>
          <Icon className="h-4 w-4" style={{ color }} aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-col">
          <b className="t-card-title">{title}</b>
          <span className="t-meta">{subtitle}</span>
        </span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-[var(--theme-ui-surface-strong)]" aria-hidden="true">
        {bar.map((segment) => (
          <span key={segment.label} style={{ width: `${Math.max(0, Math.min(100, segment.value))}%`, backgroundColor: segment.color }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
        {bar.map((segment) => (
          <span key={segment.label} className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: segment.color }} aria-hidden="true" />
            {segment.label}
          </span>
        ))}
      </div>
      <table className="t-num w-full border-t border-gray-200 text-xs">
        {withClan ? (
          <thead>
            <tr>
              <th scope="col" className="sr-only">Mesure</th>
              <th scope="col" className="pt-2 text-right text-[11px] font-semibold text-gray-500">Joueur</th>
              <th scope="col" className="pl-3 pt-2 text-right text-[11px] font-semibold text-gray-500">Clan</th>
            </tr>
          </thead>
        ) : null}
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row" className="py-1 text-left font-normal text-gray-700">{row.label}</th>
              <td className="py-1 text-right text-[13px] font-bold text-gray-900">{row.player}</td>
              {withClan ? <td className="py-1 pl-3 text-right text-gray-500">{row.clan ?? '–'}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  )
}

export function PlayerThemeCards({ player, clanRows }: { player: ClanPlaystyleRow; clanRows: ClanPlaystyleRow[] | null }) {
  const own = playstyleThemes([player])
  const clan = clanRows && clanRows.length > 1 ? playstyleThemes(clanRows) : null
  const { mobility, circle, survival } = own
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <ThemeCard
        title="Mobilité"
        subtitle={`${formatDecimal(mobility.distance)} km par match`}
        icon={Car}
        color="var(--game-sky)"
        bar={[
          { value: mobility.footShare, color: 'var(--game-sky)', label: `${formatPercent(mobility.footShare)} à pied` },
          { value: mobility.vehicleShare, color: 'var(--game-violet)', label: `${formatPercent(mobility.vehicleShare)} en véhicule` },
        ]}
        rows={[
          { label: 'À pied', player: `${formatDecimal(mobility.foot)} km`, clan: clan ? `${formatDecimal(clan.mobility.foot)} km` : null },
          { label: 'En véhicule', player: `${formatDecimal(mobility.vehicle)} km`, clan: clan ? `${formatDecimal(clan.mobility.vehicle)} km` : null },
          { label: 'Vitesse max', player: `${formatDecimal(mobility.maxSpeed)} km/h`, clan: clan ? `${formatDecimal(clan.mobility.maxSpeed)} km/h` : null },
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
          { label: 'Coups de zone bleue', player: `${formatDecimal(circle.blueZoneHits)} / match`, clan: clan ? `${formatDecimal(clan.circle.blueZoneHits)} / match` : null },
          { label: 'Premier contact', player: `phase ${formatDecimal(circle.firstContactPhase)}`, clan: clan ? `phase ${formatDecimal(clan.circle.firstContactPhase)}` : null },
          {
            label: 'Retard sur le cercle',
            player: circle.delaySeconds !== null ? `${formatDecimal(circle.delaySeconds)} s` : '–',
            clan: clan ? (clan.circle.delaySeconds !== null ? `${formatDecimal(clan.circle.delaySeconds)} s` : '–') : null,
          },
        ]}
      />
      <ThemeCard
        title="Survie et soins"
        subtitle={`${formatInteger(survival.healed)} PV soignés · ${formatInteger(survival.damageTaken)} dégâts reçus`}
        icon={HeartPulse}
        color="var(--game-neg)"
        bar={[{ value: survival.coverage, color: 'var(--game-pos)', label: `Les soins couvrent ${formatPercent(survival.coverage)} des dégâts reçus` }]}
        rows={[
          { label: 'Soins', player: `${formatDecimal(survival.heals)} / match`, clan: clan ? `${formatDecimal(clan.survival.heals)} / match` : null },
          { label: 'Boosts', player: `${formatDecimal(survival.boosts)} / match`, clan: clan ? `${formatDecimal(clan.survival.boosts)} / match` : null },
          { label: 'Dégâts reçus', player: `${formatInteger(survival.damageTaken)} / match`, clan: clan ? `${formatInteger(clan.survival.damageTaken)} / match` : null },
        ]}
      />
    </div>
  )
}

// ── Coopération avec les coéquipiers ────────────────────────────────────────────────────────────────

const PARTNERS_PER_PAGE = 10

export function PlayerCooperation({ partners }: { partners: CooperationPartner[] }) {
  const [page, setPage] = useState(1)
  const totals = cooperationTotals(partners)
  const { current, pageCount, start, visible } = paginate(partners, page, PARTNERS_PER_PAGE)
  const kpis: Array<{ label: string; value: number; icon: LucideIcon; color: string }> = [
    { label: 'Coéquipiers', value: totals.partners, icon: Users, color: 'var(--theme-ui-text-muted)' },
    { label: 'Réanimations', value: totals.revives, icon: HeartPulse, color: 'var(--game-pos)' },
    { label: 'Co-kills', value: totals.coKills, icon: Target, color: 'var(--game-neg)' },
    { label: 'Recalls', value: totals.recalls, icon: RefreshCcw, color: 'var(--game-sky)' },
  ]
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon
          return (
            <div key={kpi.label} className="app-panel app-kpi">
              <dt className="t-label flex items-center gap-1.5">
                <Icon className="h-[13px] w-[13px] shrink-0" style={{ color: kpi.color }} aria-hidden="true" />
                {kpi.label}
              </dt>
              <dd className="t-hero t-hero--md text-gray-900">{formatInteger(kpi.value)}</dd>
            </div>
          )
        })}
      </dl>
      {partners.length === 0 ? (
        <p className="app-panel t-body p-6 text-center text-gray-500">Aucune entraide mesurée avec un coéquipier du clan sur cette période.</p>
      ) : (
        <>
          <div className="app-table-shell overflow-hidden">
            <table className="w-full table-auto text-[13px]" aria-label="Coéquipiers, du plus coopératif au moins coopératif">
              <thead className="app-table-head">
                <tr>
                  <SortableTh align="left" className="w-10 pl-3">#</SortableTh>
                  <SortableTh align="left">Coéquipier</SortableTh>
                  <SortableTh title="Réanimations dans le binôme">Réa.</SortableTh>
                  <SortableTh title="Éliminations à deux">Co-kills</SortableTh>
                  <SortableTh title="Rappels de squad" className="hidden sm:table-cell">Recalls</SortableTh>
                  <SortableTh title="Événements de dégâts sur une même cible" className="hidden md:table-cell">Dégâts partagés</SortableTh>
                </tr>
              </thead>
              <tbody className="t-num">
                {visible.map((partner, index) => (
                  <tr key={partner.memberId} className="app-table-row">
                    <td className="py-2 pl-3 pr-[9px]">
                      <RankCell rank={start + index + 1} size="xs" />
                    </td>
                    <td className="max-w-0 px-[9px] py-2">
                      <Link href={`/members/${partner.memberId}/playstyle`} className="app-link block truncate font-semibold">
                        {partner.displayName}
                      </Link>
                    </td>
                    <td className="px-[9px] py-2 text-right font-semibold t-pos">{formatInteger(partner.revives)}</td>
                    <td className="px-[9px] py-2 text-right font-semibold t-neg">{formatInteger(partner.coKills)}</td>
                    <td className="hidden px-[9px] py-2 text-right text-gray-900 sm:table-cell">{formatInteger(partner.recalls)}</td>
                    <td className="hidden px-[9px] py-2 text-right text-gray-700 md:table-cell">{formatInteger(partner.sharedDamage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={current}
            pageCount={pageCount}
            total={partners.length}
            pageSize={PARTNERS_PER_PAGE}
            onPageChange={setPage}
            ariaLabel="Pages des coéquipiers"
            itemLabel="coéquipiers"
          />
        </>
      )}
    </div>
  )
}

// ── Aller plus loin ─────────────────────────────────────────────────────────────────────────────────

export function PlaystyleLinks({ links }: { links: Array<{ href: string; title: string; text: string; icon: LucideIcon }> }) {
  return (
    <ul className="grid gap-3 md:grid-cols-3">
      {links.map((link) => {
        const Icon = link.icon
        return (
          <li key={link.href}>
            <Link href={link.href} className="app-panel group flex h-full items-start gap-3 p-4 hover:border-[var(--theme-ui-accent-ring)]">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[var(--theme-ui-accent-soft)]">
                <Icon className="h-4 w-4 text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <b className="t-card-title group-hover:text-[var(--theme-ui-accent-text)]">{link.title} →</b>
                <span className="t-meta">{link.text}</span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export const PLAYSTYLE_LINK_ICONS = { items: Package, compositions: Users, career: Shield } satisfies Record<string, LucideIcon>

export function SectionBlock({ id, title, subtitle, children }: { id: string; title: string; subtitle: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex flex-col gap-3">
      <PlaystyleSectionTitle id={`${id}-title`} title={title} subtitle={subtitle} />
      {children}
    </section>
  )
}
