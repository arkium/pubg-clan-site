'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  Award,
  CalendarDays,
  Crosshair,
  Handshake,
  Medal,
  Radio,
  Skull,
  Swords,
  Target,
  Trophy,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react'

import TeamModeBadge from '@/components/ui/TeamModeBadge'
import { getNavIcon } from '@/lib/nav-icons'
import { mapAssetUrl } from '@/lib/pubg-assets'
import { frDecimal, sessionDateParts } from '@/lib/match-sessions'
import type { ClanShowcase, ExploreIntent, SynergyBar } from '@/lib/clan-showcase'

/**
 * Sections de la vue d'ensemble d'un clan — refonte « vitrine » du 2026-09-26 (docs/features/clans.md,
 * maquette Claude Design « Vue ensemble clan », écrans 11a à 11f). Couleurs par jetons `.game-ui` / `--theme-ui-*`.
 */

const numberFormat = new Intl.NumberFormat('fr-FR')
const compactFormat = new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 })
const dayTime = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', hour: '2-digit', minute: '2-digit' })
const dayShort = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })

function pct(value: number) {
  return `${frDecimal(value * 100)} %`
}

// ── Vitrine ──────────────────────────────────────────────────────────────────────────────────────

export function ClanShowcaseHero({
  image,
  tag,
  name,
  syncedLabel,
  trackedMembers,
  showcase,
}: {
  image: string
  tag: string | null
  name: string
  syncedLabel: string | null
  trackedMembers: number
  showcase: ClanShowcase | null
}) {
  const palmares = showcase?.palmares
  const cells: Array<{ value: string; label: string; icon: LucideIcon; color: string; bg: string }> = palmares
    ? [
        { value: numberFormat.format(palmares.monthWins), label: `chicken dinner${palmares.monthWins > 1 ? 's' : ''} ce mois`, icon: Trophy, color: '#fbbf24', bg: 'rgb(251 191 36 / 0.18)' },
        palmares.league
          ? { value: `#${palmares.league.rank}`, label: `Ligue des clans · sur ${palmares.league.of}`, icon: Medal, color: '#e2e8f0', bg: 'rgb(148 163 184 / 0.2)' }
          : { value: '—', label: 'Ligue des clans', icon: Medal, color: '#e2e8f0', bg: 'rgb(148 163 184 / 0.2)' },
        { value: compactFormat.format(palmares.trackedKills), label: 'kills depuis le début du suivi', icon: Crosshair, color: '#fb7185', bg: 'rgb(244 63 94 / 0.18)' },
        palmares.tournament
          ? { value: '1er', label: `tournoi « ${palmares.tournament.title} »`, icon: Swords, color: '#a5b4fc', bg: 'rgb(129 140 248 / 0.2)' }
          : { value: numberFormat.format(palmares.monthGames), label: 'parties ce mois', icon: Swords, color: '#a5b4fc', bg: 'rgb(129 140 248 / 0.2)' },
      ]
    : []
  const members = showcase?.pubgMemberCount
  return (
    <header className="app-panel relative min-h-[300px] overflow-hidden p-0 text-white" aria-label="Fiche du clan">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover object-[center_35%]" />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/50 to-slate-950/10" aria-hidden="true" />
      <div className="relative flex min-h-[300px] flex-col justify-end gap-3.5 p-4 sm:px-8 sm:py-7">
        <div className="flex flex-wrap items-center gap-2">
          {tag && <span className="rounded-md bg-amber-400 px-2.5 py-0.5 text-xs font-extrabold tracking-[0.06em] text-amber-950">[{tag}]</span>}
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">Fiche PUBG officielle</span>
          {syncedLabel && (
            <span className="inline-flex items-center gap-1.5 text-[11px] text-white/60">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
              Synchronisée {syncedLabel}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-4">
          {showcase?.level ? (
            <div
              className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl border-2 border-amber-400 bg-slate-950/55 shadow-[0_0_0_4px_rgb(251_191_36/0.18)] sm:h-[84px] sm:w-[84px]"
              aria-label={`Niveau ${showcase.level}`}
            >
              <span className="text-[10px] font-bold tracking-[0.1em] text-amber-200">NIVEAU</span>
              <span className="text-[26px] font-black leading-none sm:text-[34px]">{showcase.level}</span>
            </div>
          ) : null}
          <div className="flex min-w-0 flex-1 basis-[180px] flex-col gap-1.5">
            <h1 className="m-0 text-[26px] font-black leading-[1.05] tracking-[-0.03em] [overflow-wrap:anywhere] [text-shadow:0_4px_24px_rgba(0,0,0,.4)] sm:text-[52px]">{name}</h1>
            <p className="m-0 text-sm text-white/85">
              {[
                members ? `${numberFormat.format(members)} membres PUBG` : null,
                `${numberFormat.format(trackedMembers)} suivis`,
                showcase?.platform ? showcase.platform.charAt(0).toUpperCase() + showcase.platform.slice(1) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>
        {cells.length > 0 && (
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {cells.map((cell) => {
              const Icon = cell.icon
              return (
                <div key={cell.label} className="flex items-center gap-2.5 rounded-xl border border-white/20 bg-slate-950/55 px-3 py-2.5 backdrop-blur">
                  <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]" style={{ background: cell.bg }}>
                    <Icon className="h-4 w-4" style={{ color: cell.color }} aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <dd className="text-lg font-extrabold leading-tight tabular-nums">{cell.value}</dd>
                    <dt className="text-[11px] leading-snug text-white/70 [text-wrap:balance]">{cell.label}</dt>
                  </span>
                </div>
              )
            })}
          </dl>
        )}
      </div>
    </header>
  )
}

// ── Briefing de la semaine ───────────────────────────────────────────────────────────────────────

type Chip = { icon: LucideIcon; text: string; color: string }

function BriefingCard({
  index,
  tag,
  title,
  chips,
  cta,
  accent,
  image,
  imagePosition,
  overlay,
}: {
  index: number
  tag: string
  title: string
  chips: Chip[]
  cta: { href: string; label: string }
  accent: string
  image: string
  imagePosition?: string
  overlay?: ReactNode
}) {
  return (
    <Link href={cta.href} className="app-panel group relative flex flex-col gap-2 overflow-hidden px-4 pb-3.5 pt-0 transition-colors hover:bg-gray-50">
      <div className="relative -mx-4 mb-1 h-[104px] overflow-hidden bg-slate-950" style={{ borderBottom: `3px solid ${accent}` }}>
        <div
          className="game-pan absolute -inset-[6%] bg-cover bg-no-repeat"
          style={{ backgroundImage: `url('${image}')`, backgroundPosition: imagePosition ?? 'center', animationDelay: `${-index * 3}s` }}
          aria-hidden="true"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 to-transparent" aria-hidden="true" />
        {overlay}
      </div>
      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-gray-500">
        Fait n°{index + 1} · {tag}
      </span>
      <span className="text-base font-extrabold leading-snug [text-wrap:pretty]">{title}</span>
      <span className="flex flex-wrap gap-1.5">
        {chips.map((chip) => {
          const Icon = chip.icon
          return (
            <span key={chip.text} className="inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full border border-gray-200 bg-gray-50 px-2.5 text-xs font-semibold text-gray-700">
              <Icon className="h-[13px] w-[13px] shrink-0" style={{ color: chip.color }} aria-hidden="true" />
              {chip.text}
            </span>
          )
        })}
      </span>
      <span className="mt-auto pt-1 text-xs font-semibold" style={{ color: 'var(--game-link)' }}>
        {cta.label} →
      </span>
    </Link>
  )
}

export function ClanBriefing({ clanId, showcase }: { clanId: number; showcase: ClanShowcase | null }) {
  if (!showcase) return null
  const { win, longestKill, streak } = showcase.briefing
  const matchesHref = `/clans/${clanId}/matches`
  const winMap = win ? mapAssetUrl(win.mapName) : null

  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="briefing-title">
      <div className="flex items-center gap-2">
        <Radio className="h-4 w-4" style={{ color: 'var(--game-gold)' }} aria-hidden="true" />
        <h2 id="briefing-title" className="m-0 text-xs font-extrabold uppercase tracking-[0.14em]" style={{ color: 'var(--game-gold)' }}>
          Briefing de la semaine
        </h2>
      </div>
      <div className="grid gap-2.5 md:grid-cols-3">
        {win ? (
          <BriefingCard
            index={0}
            tag="Chicken dinner"
            title={`Top 1 sur ${win.mapLabel}, ${dayTime.format(new Date(win.playedAt))}`}
            chips={[
              { icon: Skull, text: `${win.kills} kills`, color: 'var(--game-neg)' },
              ...(win.mvp ? [{ icon: Award, text: `${win.mvp.name} ×${win.mvp.kills}`, color: 'var(--game-gold)' }] : []),
              { icon: Users, text: win.squadSize >= 4 ? 'Squad' : win.squadSize === 3 ? 'Trio' : 'Duo', color: 'var(--game-pos)' },
            ]}
            cta={{ href: win.debriefPath, label: 'Voir le débriefing' }}
            accent="var(--game-gold)"
            image={winMap ?? '/5ec73c01-216b-4991-99cf-5ac7fdbaff30.jpg'}
            overlay={
              <span className="absolute bottom-2.5 left-3 -rotate-3 rounded-md bg-amber-400 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.04em] text-amber-950">
                Winner winner #1
              </span>
            }
          />
        ) : (
          <BriefingCard
            index={0}
            tag="Chicken dinner"
            title="Pas encore de top 1 cette semaine"
            chips={[{ icon: Swords, text: `${showcase.hints.weekGames} parties jouées`, color: 'var(--theme-ui-accent)' }]}
            cta={{ href: matchesHref, label: 'Voir les soirées' }}
            accent="var(--game-gold)"
            image="/5ec73c01-216b-4991-99cf-5ac7fdbaff30.jpg"
            imagePosition="70% 60%"
          />
        )}

        {longestKill ? (
          <BriefingCard
            index={1}
            tag="Tir de la semaine"
            title={`${longestKill.distanceMeters} m au ${longestKill.weapon}${longestKill.headshot ? ', tête' : ''}`}
            chips={[
              { icon: User, text: longestKill.killer, color: 'var(--game-pos)' },
              ...(longestKill.victimTag ? [{ icon: Target, text: `[${longestKill.victimTag}]`, color: 'var(--game-neg)' }] : []),
              { icon: CalendarDays, text: dayShort.format(new Date(longestKill.playedAt)), color: 'var(--game-sky)' },
            ]}
            cta={{ href: longestKill.replayPath, label: 'Voir dans le replay' }}
            accent="var(--game-neg)"
            image="/weapons.jpg"
            overlay={
              <span className="absolute bottom-2 right-3 text-[34px] font-black leading-none tracking-[-0.03em] text-white [text-shadow:0_2px_16px_rgba(0,0,0,.6)]">
                {longestKill.distanceMeters} m
              </span>
            }
          />
        ) : (
          <BriefingCard
            index={1}
            tag="Tir de la semaine"
            title="Aucun kill enregistré cette semaine"
            chips={[]}
            cta={{ href: matchesHref, label: 'Voir les soirées' }}
            accent="var(--game-neg)"
            image="/weapons.jpg"
          />
        )}

        <BriefingCard
          index={2}
          tag="Série"
          title={
            streak.count >= 2
              ? `${streak.atLeast ? 'Au moins ' : ''}${streak.count} soirées de suite avec un top 1`
              : `${streak.weekSessions} soirée${streak.weekSessions > 1 ? 's' : ''} cette semaine`
          }
          chips={[
            { icon: Trophy, text: `${streak.weekWins} top 1 cette semaine`, color: 'var(--game-gold)' },
            ...(streak.count >= 2
              ? [
                  {
                    icon: CalendarDays,
                    text: `${sessionDateParts(streak.dates[0]).weekday} ${sessionDateParts(streak.dates[0]).day} → ${sessionDateParts(streak.dates[streak.dates.length - 1]).weekday} ${
                      sessionDateParts(streak.dates[streak.dates.length - 1]).day
                    }`,
                    color: 'var(--game-sky)',
                  },
                ]
              : []),
          ]}
          cta={{ href: matchesHref, label: 'Voir les soirées' }}
          accent="var(--game-pos)"
          image="/drop.jpg"
          imagePosition="center 40%"
          overlay={
            streak.count >= 2 ? (
              <span className="absolute bottom-2.5 left-3 flex gap-1" aria-hidden="true">
                {streak.dates.slice(-4).map((date) => (
                  <span key={date} className="inline-flex h-9 w-9 flex-col items-center justify-center rounded-lg border border-amber-400/60 bg-amber-400/15 text-[9px] font-bold text-amber-100">
                    <Trophy className="h-3.5 w-3.5 text-amber-400" />
                    {sessionDateParts(date).weekday}
                  </span>
                ))}
              </span>
            ) : null
          }
        />
      </div>
    </section>
  )
}

// ── Performances par mode ────────────────────────────────────────────────────────────────────────

export function ModePerformanceCards({
  modes,
  matchesHref,
}: {
  modes: Array<{ mode: 'duo' | 'trio' | 'squad'; matches: number; kills: number; wins: number }>
  matchesHref: string
}) {
  const label = { duo: 'Duo', trio: 'Trio', squad: 'Squad' }
  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="modes-title">
      <h2 id="modes-title" className="m-0 text-lg font-extrabold">
        Performances par mode
      </h2>
      <div className="grid gap-2.5 md:grid-cols-3">
        {modes.map((mode) => (
          <article key={mode.mode} className="app-panel overflow-hidden p-0">
            <div className="relative h-[90px] bg-cover bg-center sm:h-28" style={{ backgroundColor: '#0b1120', backgroundImage: `url('/${mode.mode}.jpg')` }}>
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 to-slate-950/10" aria-hidden="true" />
              <span className="absolute bottom-2.5 left-3">
                <TeamModeBadge mode={mode.mode} size="sm" />
              </span>
              <span className="absolute bottom-2.5 right-3 rounded-full bg-amber-400/90 px-2.5 py-0.5 text-xs font-extrabold text-amber-950">
                {mode.wins} top 1
              </span>
            </div>
            <dl className="grid grid-cols-3 gap-2 px-3 py-2.5 tabular-nums">
              {[
                { label: 'Parties', value: numberFormat.format(mode.matches) },
                { label: 'Kills', value: numberFormat.format(mode.kills) },
                { label: 'Win rate', value: pct(mode.matches > 0 ? mode.wins / mode.matches : 0) },
              ].map((stat) => (
                <div key={stat.label}>
                  <dt className="text-[10px] font-semibold uppercase text-gray-500">{stat.label}</dt>
                  <dd className="text-base font-extrabold">{stat.value}</dd>
                </div>
              ))}
            </dl>
            <Link
              href={matchesHref}
              className="flex items-center gap-1.5 border-t border-gray-200 px-3 py-2 text-xs font-semibold hover:underline"
              style={{ color: 'var(--game-link)' }}
            >
              <Swords className="h-3.5 w-3.5" aria-hidden="true" />
              Se déployer en {label[mode.mode]} : parties et soirées →
            </Link>
          </article>
        ))}
      </div>
    </section>
  )
}

// ── Duo de la période et synergies ───────────────────────────────────────────────────────────────

export function DuoOfPeriod({
  periodLabel,
  duo,
  crossRevives,
  clanWinRate,
}: {
  periodLabel: string
  duo: { memberIds: number[]; memberNames: string[]; matchesPlayed: number; winRate: number; kills: [number, number] } | null
  crossRevives: number | null
  clanWinRate: number
}) {
  if (!duo) {
    return (
      <div className="app-panel flex flex-col items-start gap-2 p-4" style={{ borderColor: 'var(--game-gold-ring)' }}>
        <DuoTitle periodLabel={periodLabel} />
        <p className="text-sm text-gray-500">Aucune paire n’a joué au moins 5 parties ensemble sur la période.</p>
      </div>
    )
  }
  const wins = Math.round(duo.winRate * duo.matchesPlayed)
  const badge = (index: number, color: string) => (
    <Link href={`/members/${duo.memberIds[index]}/dashboard`} className="flex flex-col items-center gap-1.5 hover:underline">
      <span
        className="inline-flex h-16 w-16 items-center justify-center rounded-[18px] border-2 bg-gray-50 text-2xl font-black text-gray-900"
        style={{ borderColor: color }}
        aria-hidden="true"
      >
        {duo.memberNames[index].charAt(0).toUpperCase()}
      </span>
      <b className="max-w-[120px] truncate text-sm">{duo.memberNames[index]}</b>
      <span className="text-xs text-gray-500">{duo.kills[index]} kills</span>
    </Link>
  )
  return (
    <div className="app-panel flex flex-col gap-3.5 p-[18px]" style={{ borderColor: 'var(--game-gold-ring)' }}>
      <DuoTitle periodLabel={periodLabel} />
      <div className="flex items-center justify-center gap-3.5">
        {badge(0, 'var(--game-pos)')}
        <span
          className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full border text-lg font-black"
          style={{ background: 'var(--game-gold-soft)', borderColor: 'var(--game-gold-ring)', color: 'var(--game-gold)' }}
          aria-hidden="true"
        >
          +
        </span>
        {badge(1, 'var(--game-sky)')}
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center tabular-nums">
        {[
          { label: 'parties ensemble', value: numberFormat.format(duo.matchesPlayed), color: undefined },
          { label: 'top 1', value: numberFormat.format(wins), color: 'var(--game-gold)' },
          { label: 'réanimations croisées', value: crossRevives === null ? '—' : numberFormat.format(crossRevives), color: undefined },
        ].map((stat) => (
          <div key={stat.label} className="app-panel-muted p-2">
            <dd className="text-xl font-black" style={stat.color ? { color: stat.color } : undefined}>
              {stat.value}
            </dd>
            <dt className="text-[10px] font-semibold uppercase text-gray-500">{stat.label}</dt>
          </div>
        ))}
      </dl>
      <p className="text-center text-xs text-gray-500">
        {pct(duo.winRate)} de top 1 ensemble, contre {pct(clanWinRate)} pour le clan
      </p>
    </div>
  )
}

function DuoTitle({ periodLabel }: { periodLabel: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 self-start rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.08em]"
      style={{ background: 'var(--game-gold-soft)', borderColor: 'var(--game-gold-ring)', color: 'var(--game-gold)' }}
    >
      <Handshake className="h-3 w-3" aria-hidden="true" />
      Duo {periodLabel}
    </span>
  )
}

export function SynergyBarsPanel({ bars, children }: { bars: SynergyBar[]; children?: ReactNode }) {
  return (
    <div className="app-panel flex flex-col gap-2.5 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="m-0 text-base font-extrabold">Synergies de squad</h2>
        <span className="text-xs text-gray-500">win rate ensemble</span>
      </div>
      {bars.length === 0 ? (
        <p className="text-sm text-gray-500">Pas encore de groupe avec au moins 5 parties ensemble sur la période.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {bars.map((bar, index) => (
            <li key={bar.key} className="grid items-center gap-2.5 text-[13px] [grid-template-columns:1fr_70px_52px] sm:[grid-template-columns:1fr_120px_52px]">
              <span className="flex min-w-0 items-center gap-1.5">
                <TeamModeBadge mode={bar.mode} size="xxs" />
                <span className="truncate font-semibold" title={`${bar.names} · ${bar.games} parties`}>
                  {bar.names}
                </span>
              </span>
              <span className="h-2 rounded-full" style={{ background: 'var(--game-track)' }} aria-hidden="true">
                <span
                  className="block h-2 rounded-full"
                  style={{ width: `${bar.widthPercent}%`, background: index === 0 ? 'var(--game-gold)' : 'var(--theme-ui-accent)' }}
                />
              </span>
              <b className="text-right tabular-nums">{pct(bar.winRate)}</b>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-auto text-xs text-gray-500">Minimum 5 parties ensemble sur la période.</p>
      {children}
    </div>
  )
}

// ── Explorer le clan ─────────────────────────────────────────────────────────────────────────────

export type ExploreLink = { key: string; label: string; href: string; hint?: string; navKey?: string; icon?: LucideIcon }

const INTENTS: Record<ExploreIntent, { title: string; description: string; icon: LucideIcon; color: string; bg: string }> = {
  play: { title: 'Jouer ensemble', description: 'Les parties et les soirées du clan', icon: Users, color: 'var(--game-pos)', bg: 'var(--game-pos-soft)' },
  improve: { title: 'Progresser', description: 'Ce que disent les données de jeu', icon: Crosshair, color: 'var(--game-sky)', bg: 'var(--game-sky-soft)' },
  compete: { title: 'Se mesurer', description: 'Classements, récompenses et rapports', icon: Trophy, color: 'var(--game-gold)', bg: 'var(--game-gold-soft)' },
}

export function ExploreClan({ groups }: { groups: Record<ExploreIntent, ExploreLink[]> }) {
  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="explore-title">
      <h2 id="explore-title" className="m-0 text-lg font-extrabold">
        Explorer le clan
      </h2>
      <div className="grid gap-2.5 md:grid-cols-3">
        {(Object.keys(INTENTS) as ExploreIntent[]).map((intent) => {
          const meta = INTENTS[intent]
          const Icon = meta.icon
          return (
            <nav key={intent} className="app-panel flex flex-col gap-2.5 p-3.5" aria-label={meta.title}>
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[10px]" style={{ background: meta.bg }}>
                  <Icon className="h-[18px] w-[18px]" style={{ color: meta.color }} aria-hidden="true" />
                </span>
                <div>
                  <p className="m-0 text-[15px] font-extrabold">{meta.title}</p>
                  <p className="m-0 text-xs text-gray-500">{meta.description}</p>
                </div>
              </div>
              <ul className="flex flex-col">
                {groups[intent].map((link) => {
                  const LinkIcon = link.icon ?? (link.navKey ? getNavIcon(link.navKey).icon : Crosshair)
                  return (
                    <li key={link.key}>
                      <Link href={link.href} className="flex min-h-[38px] items-center gap-2.5 border-t border-gray-200 px-1 text-[13px] font-semibold hover:bg-gray-50">
                        <LinkIcon className="h-[15px] w-[15px] shrink-0 text-gray-500" aria-hidden="true" />
                        <span className="truncate">{link.label}</span>
                        {link.hint ? <span className="ml-auto shrink-0 text-xs font-medium text-gray-500">{link.hint}</span> : null}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </nav>
          )
        })}
      </div>
    </section>
  )
}
