'use client'

/* eslint-disable @next/next/no-img-element -- avatars, icônes d'armes et fonds de carte locaux, tailles fixes */

import Link from 'next/link'
import { Crosshair, Skull } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import ChevronPager from '@/components/ui/ChevronPager'
import PlacementBadge from '@/components/ui/PlacementBadge'
import { DISTINCTION_BADGE_META, type DistinctionBadgeKey } from '@/lib/distinction-badges'
import { matchDebriefPath } from '@/lib/match-links'
import { sessionDateOf } from '@/lib/match-sessions'
import { playedTonight, rosterInitials, rosterRole, type RosterRoleId } from '@/lib/member-roster'
import { getNavIcon } from '@/lib/nav-icons'
import { PERIOD_OF_LABELS, type StandardPeriod } from '@/lib/period'
import { barHeights, clanGap, clanGapLabel, profileRows, trendLabel } from '@/lib/player-dashboard'
import { mapAssetUrl, weaponWhiteIconUrl } from '@/lib/pubg-assets'
import type { CityInsights } from '@/types/city-insights'
import type { DashboardMatch, PlayerDashboardResponse, PlayerPlaystyle } from '@/types/dashboard'
import type { DropPressureDashboardStats } from '@/types/drop-pressure'

/** Blocs du tableau de bord d'un joueur (maquette « Membres et joueur », 17a–17c ; docs/features/membres.md). */

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const oneDecimal = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const monthYear = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
const shortDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', timeZone: 'Europe/Paris' })

const formatInteger = (value: number) => integer.format(Math.round(value))
const formatPercent = (value: number) => `${oneDecimal.format(value)} %`

const TEAM_MODE_LABEL: Record<string, string> = { solo: 'Solo', duo: 'Duo', trio: 'Trio', squad: 'Squad' }
const gameModeLabel = (gameMode: string) => {
  const base = gameMode.replace(/-fpp$/, '')
  return `${TEAM_MODE_LABEL[base] ?? gameMode}${gameMode.endsWith('-fpp') ? ' FPP' : ''}`
}

export function DashboardCard({
  title,
  link,
  aside,
  tone = 'default',
  children,
  className = '',
}: {
  title: string
  link?: { href: string; label: string }
  aside?: ReactNode
  tone?: 'default' | 'danger'
  children: ReactNode
  className?: string
}) {
  return (
    <article
      aria-label={title}
      className={`app-panel flex flex-col gap-2.5 p-3.5 ${tone === 'danger' ? 'border-red-500/35' : ''} ${className}`.trim()}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-extrabold text-gray-900">{title}</h2>
        {link ? (
          <Link href={link.href} className="shrink-0 text-xs font-semibold text-[var(--theme-ui-accent-text)] hover:underline">
            {link.label}
          </Link>
        ) : aside ? (
          <span className="shrink-0 text-xs text-gray-500">{aside}</span>
        ) : null}
      </div>
      {children}
    </article>
  )
}

const EmptyNote = ({ children }: { children: ReactNode }) => <p className="text-sm text-gray-500">{children}</p>

// ── Carte joueur (bandeau) ────────────────────────────────────────────────────────────────────────

export type HeroNavItem = { navKey: string; label: string; href: string; badge?: string }

export function PlayerHero({
  member,
  role,
  distinction,
  period,
  navItems,
  now,
}: {
  member: PlayerDashboardResponse['member']
  role: { id: RosterRoleId; score: number } | null
  distinction: DistinctionBadgeKey | null
  period: StandardPeriod
  navItems: HeroNavItem[]
  now: Date
}) {
  const [avatarFailed, setAvatarFailed] = useState(false)
  const roleMeta = role ? rosterRole(role.id) : null
  const tonight = playedTonight(member.lastMatchAt, now)
  const color = roleMeta?.color ?? 'rgba(255, 255, 255, 0.4)'

  return (
    <header
      className="relative min-h-[10rem] overflow-hidden rounded-2xl bg-[#1a1410] bg-cover bg-no-repeat text-white sm:min-h-[13rem]"
      style={{ backgroundImage: `url('/member-dashboard.jpg')`, backgroundPosition: 'center 25%' }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/60 to-slate-950/30 sm:bg-gradient-to-r sm:from-slate-950/90 sm:via-slate-950/60 sm:to-slate-950/10" />
      <div className="relative flex min-h-[10rem] flex-col justify-end gap-4 px-3.5 pb-3.5 pt-6 sm:min-h-[13rem] sm:px-7 sm:pb-5">
        <div className="flex items-center gap-4">
          <span
            className="relative grid h-16 w-16 shrink-0 place-items-center rounded-[20px] border-[3px] bg-[#0b1120] text-[22px] font-black sm:h-[84px] sm:w-[84px] sm:text-[28px]"
            style={{ borderColor: color, boxShadow: roleMeta ? `0 0 0 6px ${roleMeta.tint}` : undefined }}
          >
            {member.avatarUrl && !avatarFailed ? (
              <img src={member.avatarUrl} alt="" className="h-full w-full rounded-[17px] object-cover" onError={() => setAvatarFailed(true)} />
            ) : (
              rosterInitials(member.displayName)
            )}
            {tonight ? (
              <span className="absolute -bottom-1.5 -right-1.5 h-4 w-4 rounded-full border-[3px] border-[#0b1120] bg-emerald-500" title="A joué ce soir" />
            ) : null}
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <h1 className="truncate text-2xl font-black leading-none tracking-tight sm:text-[34px]">{member.displayName}</h1>
            <span className="text-[13px] text-white/75">
              {[
                member.pubgPlayerName !== member.displayName ? member.pubgPlayerName : null,
                member.clan ? `${member.clan.name} [${member.clan.tag}]` : null,
                `suivi depuis ${monthYear.format(new Date(member.createdAt))}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <div className="flex flex-wrap gap-1.5" data-testid="player-badges">
              {roleMeta && role ? (
                <span className="rounded-md px-2 py-0.5 text-[11px] font-black uppercase tracking-[0.08em] text-[#0b1120]" style={{ backgroundColor: roleMeta.color }}>
                  {roleMeta.label} · {Math.round(role.score)} %
                </span>
              ) : null}
              {distinction ? (
                <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-400/90 px-2 py-0.5 text-[11px] font-extrabold text-[#1c1003]">
                  <img src={DISTINCTION_BADGE_META[distinction].iconPath} width={14} height={14} alt="" />
                  {DISTINCTION_BADGE_META[distinction].shortLabel} {PERIOD_OF_LABELS[period]}
                </span>
              ) : null}
              {tonight ? (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/60 bg-emerald-500/30 px-2 py-0.5 text-[11px] font-bold">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />A joué ce soir
                </span>
              ) : null}
            </div>
          </div>
        </div>
        {navItems.length > 0 ? (
          <ChevronPager
            ariaLabel="Pages du joueur"
            tone="dark"
            pageSize={4}
            items={navItems.map((item) => {
              const { icon: Icon, colorClass } = getNavIcon(item.navKey)
              return {
                key: item.navKey,
                node: (
                  <Link
                    href={item.href}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] border border-white/20 bg-slate-950/55 px-2.5 text-xs font-semibold text-white backdrop-blur-md transition hover:border-white/40 hover:bg-slate-950/75"
                  >
                    <Icon className={`h-3.5 w-3.5 ${colorClass}`} aria-hidden="true" />
                    {item.label}
                    {item.badge ? <span className="rounded-[5px] bg-white/15 px-1.5 text-[10px] font-extrabold">{item.badge}</span> : null}
                  </Link>
                ),
              }
            })}
          />
        ) : null}
      </div>
    </header>
  )
}

// ── Chiffres clés ─────────────────────────────────────────────────────────────────────────────────

function ActivityBars({ values, labels, currentIndex, positive, name }: { values: number[]; labels: string[]; currentIndex: number; positive: boolean; name: string }) {
  const heights = barHeights(values)
  return (
    <span
      role="img"
      aria-label={`${name} : ${labels.map((label, index) => `${label} ${formatInteger(values[index])}`).join(', ')}`}
      className="flex h-7 shrink-0 items-end gap-0.5"
    >
      {heights.map((height, index) => (
        <span
          key={labels[index]}
          className="w-[3px] rounded-sm sm:w-[5px]"
          style={{
            height: `${Math.max(height, 6)}%`,
            backgroundColor:
              index === currentIndex ? (positive ? 'var(--theme-ui-positive)' : 'var(--theme-ui-text-secondary)') : 'var(--theme-ui-border)',
          }}
        />
      ))}
    </span>
  )
}

export function PlayerKpis({ data, now }: { data: PlayerDashboardResponse; now: Date }) {
  const { stats, clanAverage, activity } = data
  const labels = activity.buckets.map((bucket) => bucket.label)
  const today = sessionDateOf(now)
  const currentIndex =
    activity.unit === 'day' ? activity.buckets.findIndex((bucket) => bucket.key === today) : activity.buckets.length - 1
  const series = (pick: (bucket: (typeof activity.buckets)[number]) => number) => activity.buckets.map(pick)

  if (!stats || stats.matchesPlayed === 0) {
    return <p className="app-panel-muted p-4 text-sm text-gray-500">Aucune partie officielle sur la période.</p>
  }

  const killsGap = clanGap(stats.totalKills, clanAverage?.avgKills)
  const damageGap = clanGap(stats.totalDamage, clanAverage?.avgDamage)
  const kpis = [
    { label: 'Kills', value: formatInteger(stats.totalKills), note: clanGapLabel(killsGap), positive: (killsGap ?? 0) > 0, values: series((b) => b.kills) },
    { label: 'Dégâts', value: formatInteger(stats.totalDamage), note: clanGapLabel(damageGap), positive: (damageGap ?? 0) > 0, values: series((b) => b.damage) },
    {
      label: 'Win rate',
      value: formatPercent(stats.winRate * 100),
      note: `${stats.matchesWon} top 1 sur ${stats.matchesPlayed} partie${stats.matchesPlayed > 1 ? 's' : ''}`,
      positive: false,
      values: series((b) => b.wins),
    },
    {
      label: 'Parties',
      value: formatInteger(stats.matchesPlayed),
      note: `${formatInteger(stats.totalAssists)} assistances · ${formatInteger(stats.totalRevives)} réanimations`,
      positive: false,
      values: series((b) => b.matches),
    },
  ]
  const unit = activity.unit === 'day' ? 'par soirée' : 'par semaine'

  return (
    <section aria-label="Chiffres clés" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <div
          key={kpi.label}
          className={`app-panel flex flex-col gap-1.5 p-3.5 ${kpi.positive ? 'border-[var(--theme-ui-accent-ring)]' : ''}`}
          data-testid={`kpi-${kpi.label}`}
        >
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-500">{kpi.label}</span>
          <div className="flex items-end justify-between gap-2">
            <b className="whitespace-nowrap text-[22px] font-black leading-none tracking-tight tabular-nums text-gray-900 sm:text-[28px]">{kpi.value}</b>
            <ActivityBars values={kpi.values} labels={labels} currentIndex={currentIndex} positive={kpi.positive} name={`${kpi.label} ${unit}`} />
          </div>
          {kpi.note ? (
            <span className={`text-xs font-semibold ${kpi.positive ? 'text-[var(--theme-ui-positive)]' : 'text-gray-500'}`}>{kpi.note}</span>
          ) : null}
        </div>
      ))}
    </section>
  )
}

// ── Meilleure partie et profil de jeu ──────────────────────────────────────────────────────────────

export function BestMatchCard({ match }: { match: PlayerDashboardResponse['bestMatch'] }) {
  if (!match) {
    return (
      <DashboardCard title="Meilleure partie de la période">
        <EmptyNote>Aucune partie officielle sur la période.</EmptyNote>
      </DashboardCard>
    )
  }
  const map = mapAssetUrl(match.mapName)
  const details = [
    match.mapLabel,
    gameModeLabel(match.gameMode),
    shortDate.format(new Date(match.createdAt)),
    match.timeSurvived ? `${Math.round(match.timeSurvived / 60)} min en vie` : null,
    match.teammates.length > 0 ? `avec ${match.teammates.join(', ')}` : null,
  ].filter(Boolean)

  return (
    <article
      aria-label="Meilleure partie de la période"
      className="relative flex min-h-[220px] flex-col justify-end overflow-hidden rounded-2xl border border-amber-400/50 bg-[#1c2a1a] bg-cover bg-center text-white"
      style={map ? { backgroundImage: `url('${map}')` } : undefined}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 from-30% to-slate-950/35" />
      {match.placement === 1 ? (
        <span className="absolute left-3 top-3 -rotate-2 rounded-md bg-amber-400 px-2.5 py-0.5 text-[11px] font-black tracking-[0.06em] text-[#1c1003]">
          WINNER WINNER CHICKEN DINNER
        </span>
      ) : null}
      <div className="relative flex flex-col gap-2.5 p-4">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/70">Meilleure partie de la période</h2>
        <dl className="grid grid-cols-3 gap-2 tabular-nums">
          <div className="flex flex-col-reverse">
            <dt className="text-[10px] font-bold uppercase text-white/70">kills</dt>
            <dd className="text-[30px] font-black leading-none text-amber-300">{match.kills}</dd>
          </div>
          <div className="flex flex-col-reverse">
            <dt className="text-[10px] font-bold uppercase text-white/70">dégâts</dt>
            <dd className="text-[30px] font-black leading-none">{formatInteger(match.damage)}</dd>
          </div>
          <div className="flex flex-col-reverse">
            <dt className="text-[10px] font-bold uppercase text-white/70">{match.placement === 1 ? 'top 1' : 'place'}</dt>
            <dd className="text-[30px] font-black leading-none">#{match.placement}</dd>
          </div>
        </dl>
        <span className="text-xs text-white/80">{details.join(' · ')}</span>
        {match.debriefHref ? (
          <Link href={match.debriefHref} className="self-start text-xs font-semibold text-amber-200 hover:underline">
            Revoir la partie →
          </Link>
        ) : null}
      </div>
    </article>
  )
}

export function PlayerProfileCard({ playstyle }: { playstyle: PlayerPlaystyle }) {
  const current = playstyle.current
  return (
    <DashboardCard
      title="Profil de jeu"
      aside={
        playstyle.clan ? (
          <span className="inline-flex items-center gap-1.5 text-[11px]">
            <span className="h-3 w-0.5 bg-gray-900" aria-hidden="true" />
            moyenne du clan
          </span>
        ) : undefined
      }
    >
      {current ? (
        <>
          <ul className="flex flex-col gap-3" aria-label="Rôles">
            {profileRows(current, playstyle.previous, playstyle.clan).map((row) => {
              const color = rosterRole(row.id).color
              const trend = trendLabel(row.trend)
              return (
                <li key={row.id} className="flex flex-col gap-1.5" data-testid={`profile-${row.id}`}>
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="inline-flex items-center gap-2">
                      <b className="text-[11px] font-black uppercase tracking-[0.12em]" style={{ color }}>{row.role}</b>
                      <span className="text-gray-600">{row.metric}</span>
                    </span>
                    <span className="inline-flex items-baseline gap-2 tabular-nums">
                      {trend ? (
                        <span
                          className="text-[11px] font-bold"
                          style={{ color: (row.trend ?? 0) > 0 ? 'var(--theme-ui-positive)' : (row.trend ?? 0) < 0 ? 'var(--theme-ui-negative)' : 'var(--theme-ui-text-muted)' }}
                          title="Écart avec la période précédente, en points"
                        >
                          {trend}
                        </span>
                      ) : null}
                      <b className="text-base" style={{ color }}>{row.value} %</b>
                    </span>
                  </div>
                  <div className="relative h-2.5 rounded-[5px] bg-[var(--theme-ui-surface-strong)]">
                    <div className="h-full rounded-[5px]" style={{ width: `${row.value}%`, backgroundColor: color }} />
                    {row.clan !== null ? (
                      <span className="absolute -top-[3px] h-4 w-0.5 bg-gray-900" style={{ left: `${row.clan}%` }} title={`Moyenne du clan : ${row.clan} %`} />
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
          <dl className="mt-auto grid grid-cols-3 gap-2 border-t border-gray-200 pt-3 tabular-nums">
            <div className="flex flex-col-reverse">
              <dt className="text-[11px] text-gray-500">du temps en zone sûre</dt>
              <dd className="text-[15px] font-bold text-gray-900">{Math.round(current.safeZonePercent)} %</dd>
            </div>
            <div className="flex flex-col-reverse">
              <dt className="text-[11px] text-gray-500">des dégâts soignés</dt>
              <dd className="text-[15px] font-bold text-gray-900">{current.healCoveragePercent === null ? '–' : `${Math.round(current.healCoveragePercent)} %`}</dd>
            </div>
            <div className="flex flex-col-reverse">
              <dt className="text-[11px] text-gray-500">premier contact</dt>
              <dd className="text-[15px] font-bold text-gray-900">
                {current.firstContactPhase === null ? '–' : `phase ${oneDecimal.format(current.firstContactPhase)}`}
              </dd>
            </div>
          </dl>
        </>
      ) : (
        <EmptyNote>Aucune partie mesurée par la télémétrie sur la période.</EmptyNote>
      )}
    </DashboardCard>
  )
}

// ── Arsenal, frères d'armes, némésis, drop ─────────────────────────────────────────────────────────

export type ArsenalWeapon = { weaponName: string; weaponLabel: string; kills: number; headshots: number; accuracy: number; maxDistance: number | null }

function WhiteWeapon({ id }: { id: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <Crosshair className="h-5 w-16 shrink-0 text-white/40" aria-hidden="true" />
  return (
    <img
      src={weaponWhiteIconUrl(id)}
      alt=""
      className="h-[26px] w-16 shrink-0 object-contain"
      ref={(img) => {
        if (img && img.complete && img.naturalWidth === 0) setFailed(true)
      }}
      onError={() => setFailed(true)}
    />
  )
}

export function ArsenalCard({ weapons, memberId }: { weapons: ArsenalWeapon[]; memberId: number }) {
  return (
    <DashboardCard title="Arsenal" link={{ href: `/members/${memberId}/weapons`, label: 'Armes →' }}>
      {weapons.length > 0 ? (
        <ol className="flex flex-col gap-2">
          {weapons.map((weapon) => {
            const headshotShare = weapon.kills > 0 ? (weapon.headshots / weapon.kills) * 100 : 0
            return (
              <li key={weapon.weaponName} className="flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-slate-800 to-slate-900 px-2.5 py-2 text-white">
                <WhiteWeapon id={weapon.weaponName} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <b className="truncate text-[13px]">{weapon.weaponLabel}</b>
                  <span className="truncate text-[11px] text-slate-400">
                    {Math.round(headshotShare)} % HS · {Math.round(weapon.accuracy)} % précision
                  </span>
                </span>
                <b className="text-[15px] tabular-nums text-amber-300" title="Kills">{weapon.kills}</b>
              </li>
            )
          })}
        </ol>
      ) : (
        <EmptyNote>Aucun kill mesuré sur la période.</EmptyNote>
      )}
    </DashboardCard>
  )
}

const hoursTogether = (seconds: number) => (seconds >= 3600 ? `${oneDecimal.format(seconds / 3600)} h ensemble` : `${Math.max(1, Math.round(seconds / 60))} min ensemble`)

export function MatesCard({ mates }: { mates: PlayerDashboardResponse['mates'] }) {
  return (
    <DashboardCard title="Frères d’armes" aside="parties · WR">
      {mates.length > 0 ? (
        <ol className="flex flex-col gap-2.5">
          {mates.map((mate) => {
            const role = mate.role ? rosterRole(mate.role) : null
            return (
              <li key={mate.memberId}>
                <Link href={`/members/${mate.memberId}/dashboard`} className="flex items-center gap-2.5 rounded-lg transition hover:bg-gray-50">
                  <span
                    className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] border-2 bg-[#0b1120] text-xs font-black text-white"
                    style={{ borderColor: role?.color ?? 'var(--theme-ui-border)' }}
                  >
                    {rosterInitials(mate.displayName)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <b className="truncate text-[13px] text-gray-900">{mate.displayName}</b>
                    <span className="truncate text-[11px] text-gray-500">
                      {[role?.label, mate.sharedPlayTimeSeconds > 0 ? hoursTogether(mate.sharedPlayTimeSeconds) : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="text-right tabular-nums">
                    <b className="block text-[13px] text-gray-900">{mate.matchCount} partie{mate.matchCount > 1 ? 's' : ''}</b>
                    <span className="text-[11px] font-bold text-[var(--theme-ui-positive)]">{formatPercent(mate.winRate * 100)} WR</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
      ) : (
        <EmptyNote>Aucune partie avec un membre du clan sur la période.</EmptyNote>
      )}
    </DashboardCard>
  )
}

export type NemesisSummary = {
  botKillCount: number
  topKillers: Array<{ name: string; clanTag: string | null; resolved?: boolean; count: number }>
  topVictims: Array<{ name: string; clanTag: string | null; resolved?: boolean; count: number }>
}

// Un adversaire jamais relevé dans un lobby n'a que son identifiant de compte : « Joueur inconnu », comme sur la page Némésis.
const opponentName = (entry: { name: string; clanTag: string | null; resolved?: boolean }) =>
  entry.resolved === false ? 'Joueur inconnu' : entry.clanTag ? `${entry.name} [${entry.clanTag}]` : entry.name

export function NemesisCard({ nemesis, memberId }: { nemesis: NemesisSummary | null; memberId: number }) {
  const killer = nemesis?.topKillers[0] ?? null
  const victim = nemesis?.topVictims[0] ?? null
  return (
    <DashboardCard title="Némésis" link={{ href: `/members/${memberId}/nemesis`, label: 'Détail →' }} tone="danger">
      {killer || victim ? (
        <>
          {killer ? (
            <div className="flex items-center gap-2.5 rounded-xl bg-red-500/10 p-2.5">
              <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-red-950">
                <Skull className="h-[18px] w-[18px] text-red-400" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[var(--theme-ui-negative)]">Ton bourreau</span>
                <b className="truncate text-[13px] text-gray-900">{opponentName(killer)}</b>
                <span className="text-[11px] text-gray-500">t’a éliminé {killer.count} fois</span>
              </span>
            </div>
          ) : null}
          {victim ? (
            <div className="flex items-center gap-2.5 rounded-xl bg-gray-50 p-2.5">
              <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-amber-400/15">
                <Crosshair className="h-[18px] w-[18px] text-amber-500" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-amber-500">Ta victime préférée</span>
                <b className="truncate text-[13px] text-gray-900">{opponentName(victim)}</b>
                <span className="text-[11px] text-gray-500">éliminé {victim.count} fois</span>
              </span>
            </div>
          ) : null}
        </>
      ) : (
        <EmptyNote>Aucun duel mesuré sur la période.</EmptyNote>
      )}
      {nemesis ? (
        <span className="text-xs text-gray-500">
          Bots neutralisés : <b className="text-gray-900">{nemesis.botKillCount}</b>
        </span>
      ) : null}
    </DashboardCard>
  )
}

export function DropCard({ city, drop, memberId }: { city: CityInsights | null; drop: DropPressureDashboardStats | null; memberId: number }) {
  const favorite = city?.favoriteCity ?? null
  const map = favorite ? mapAssetUrl(favorite.mapName) : null
  const rows = drop && drop.dropCount > 0
    ? [
        { label: 'Drops analysés', value: formatInteger(drop.dropCount) },
        { label: 'Drops chauds', value: `${Math.round(drop.hotDropShare)} %` },
        {
          label: 'Adversaires à 250 m',
          value: drop.averageNearbyOpponents250m === null ? '–' : oneDecimal.format(drop.averageNearbyOpponents250m),
        },
      ]
    : []
  return (
    <DashboardCard title="Au drop" link={{ href: `/members/${memberId}/drop-zones`, label: 'Zones →' }}>
      {favorite ? (
        <div
          className="relative h-[74px] overflow-hidden rounded-xl bg-[#1c2a1a] bg-cover bg-center"
          style={map ? { backgroundImage: `url('${map}')` } : undefined}
        >
          <span className="absolute bottom-1.5 left-2 rounded-[5px] bg-slate-950/70 px-1.5 text-[11px] font-extrabold text-white">
            Ville favorite : {favorite.name}
          </span>
        </div>
      ) : null}
      {rows.length > 0 ? (
        <dl className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <div key={row.label} className="flex items-baseline justify-between gap-2 text-xs">
              <dt className="text-gray-600">{row.label}</dt>
              <dd className="text-[13px] font-bold tabular-nums text-gray-900">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : !favorite ? (
        <EmptyNote>Aucun atterrissage mesuré sur la période.</EmptyNote>
      ) : null}
    </DashboardCard>
  )
}

// ── Dernières parties ────────────────────────────────────────────────────────────────────────────

export function RecentMatches({ matches, mapLabels, memberId, period }: { matches: DashboardMatch[]; mapLabels: Record<string, string>; memberId: number; period: StandardPeriod }) {
  return (
    <section aria-label="Dernières parties" className="app-panel overflow-hidden">
      <div className="flex items-baseline justify-between gap-2 border-b border-gray-200 px-3.5 py-3">
        <h2 className="text-base font-extrabold text-gray-900">Dernières parties</h2>
        <Link href={`/members/${memberId}/matches?period=${period}`} className="text-xs font-semibold text-[var(--theme-ui-accent-text)] hover:underline">
          Tout l’historique →
        </Link>
      </div>
      {matches.length > 0 ? (
        <ol className="divide-y divide-gray-200">
          {matches.map((match) => {
            const map = mapAssetUrl(match.mapName)
            const row = (
              <>
                <PlacementBadge placement={match.placement} className="justify-self-start" />
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="h-[26px] w-9 shrink-0 rounded-md bg-[#1c2a1a] bg-cover bg-center" style={map ? { backgroundImage: `url('${map}')` } : undefined} />
                  <span className="flex min-w-0 flex-col">
                    <b className="truncate text-[13px] text-gray-900">{mapLabels[match.mapName] ?? match.mapName}</b>
                    <span className="truncate text-[11px] text-gray-500">
                      {TEAM_MODE_LABEL[match.clanMode] ?? gameModeLabel(match.gameMode)} · {shortDate.format(new Date(match.pubgCreatedAt))}
                    </span>
                  </span>
                </span>
                <span className="text-right text-[13px] tabular-nums text-gray-900">
                  <b>{match.kills}</b> <span className="text-[11px] text-gray-500">kills</span>
                </span>
                <span className="hidden text-right text-[13px] tabular-nums text-gray-900 sm:block">
                  <b>{formatInteger(match.damageDealt)}</b> <span className="text-[11px] text-gray-500">dégâts</span>
                </span>
              </>
            )
            const grid = 'grid grid-cols-[44px_minmax(0,1fr)_64px] items-center gap-3 px-3.5 py-2 sm:grid-cols-[48px_minmax(0,1fr)_90px_110px]'
            const href = match.telemetryAvailable && match.squadMatchId && match.clanId
              ? matchDebriefPath(match.clanId, match.squadMatchId, { period })
              : null
            return (
              <li key={match.id}>
                {href ? (
                  <Link href={href} className={`${grid} transition hover:bg-gray-50`}>
                    {row}
                  </Link>
                ) : (
                  <div className={grid}>{row}</div>
                )}
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="px-3.5 py-3 text-sm text-gray-500">Aucune partie sur la période.</p>
      )}
    </section>
  )
}
