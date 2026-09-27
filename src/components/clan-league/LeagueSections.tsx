'use client'

import Link from 'next/link'
import { ChevronDown, CircleDashed, Crosshair, Crown, Flame, HandFist, Info, Rocket, ShieldCheck, Swords, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { leagueCriterion, targetAhead, type LeagueClan, type LeagueCriterion, type LeagueFeedEvent } from '@/lib/clan-league'
import type { LeagueEntry } from '@/lib/clan-league-service'
import { clanBackgroundImage } from '@/lib/clan-image'

/** Blocs de la Ligue Inter-Clans (maquette « Ligue clans », 22a–22e ; docs/features/ligue-clans.md). */

export type RankedEntry = LeagueEntry & { position: number }

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const oneDecimal = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' })

const clanHref = (clanId: number) => `/clans/${clanId}/overview`

/**
 * Ouverture d'un clan, même règle que l'annuaire (`/clans`) : SuperUser ou mode visiteur, n'importe quel clan ; un
 * membre connecté, seulement le sien. Un clan qu'on ne peut pas ouvrir reste affiché, sans lien.
 */
export type ClanAccess = { canOpen: (clanId: number) => boolean; onOpen: (clanId: number) => void }

function ClanLink({ access, clanId, className, children, label }: { access: ClanAccess; clanId: number; className: string; children: ReactNode; label?: string }) {
  if (!access.canOpen(clanId)) {
    return <div className={className} aria-label={label}>{children}</div>
  }
  return (
    <Link href={clanHref(clanId)} onClick={() => access.onOpen(clanId)} className={`${className} transition hover:bg-gray-50`} aria-label={label}>
      {children}
    </Link>
  )
}

function ClanLogo({ imageUrl, size, className = '' }: { imageUrl: string | null; size: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 bg-[#0b1120] bg-cover bg-center ${className}`}
      style={{ width: size, height: size, backgroundImage: clanBackgroundImage(imageUrl) }}
    />
  )
}

// ── Podium ────────────────────────────────────────────────────────────────────────────────────────

const STEPS = [
  { ring: 'rgba(203,213,225,.55)', gradient: 'linear-gradient(180deg, rgba(148,163,184,.25), rgba(148,163,184,.75))', height: 'h-[70px] sm:h-[110px]', number: 'rgba(255,255,255,.55)' },
  { ring: 'rgba(251,191,36,.7)', gradient: 'linear-gradient(180deg, rgba(146,64,14,.35), #d97706)', height: 'h-[100px] sm:h-[150px]', number: 'rgba(28,16,3,.45)' },
  { ring: 'rgba(234,88,12,.55)', gradient: 'linear-gradient(180deg, rgba(124,45,18,.3), #9a3412)', height: 'h-[52px] sm:h-[80px]', number: 'rgba(255,255,255,.55)' },
]

export function LeaguePodium({ ranked, criterion, access }: { ranked: RankedEntry[]; criterion: LeagueCriterion; access: ClanAccess }) {
  const meta = leagueCriterion(criterion)
  const order = [ranked[1], ranked[0], ranked[2]]
  return (
    <section
      aria-label={`Podium · ${meta.long}`}
      className="relative flex min-w-0 flex-col gap-2.5 overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-b from-slate-900 to-slate-950 px-2.5 pt-3.5 text-slate-100 sm:px-5 sm:pt-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <span className="min-w-0 truncate text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-400">Podium · {meta.long}</span>
        <span className="-rotate-2 whitespace-nowrap rounded-[5px] bg-amber-400 px-2 py-0.5 text-[10px] font-black tracking-[0.06em] text-[#1c1003]">
          WINNER WINNER CHICKEN DINNER
        </span>
      </div>
      <ol className="grid grid-cols-3 items-end gap-2 sm:gap-4">
        {order.map((entry, index) =>
          entry ? (
            <li key={entry.clanId} id={`league-clan-${entry.clanId}`} className="flex min-w-0 scroll-mt-[160px] flex-col items-center gap-1.5" style={{ order: index }} data-testid={`podium-${entry.position}`}>
              {entry.position === 1 ? <Crown className="h-6 w-6 text-amber-400" aria-label="Premier" /> : null}
              <ClanLink access={access} clanId={entry.clanId} className="flex min-w-0 max-w-full flex-col items-center gap-1 rounded-lg hover:!bg-transparent hover:opacity-90">
                <ClanLogo imageUrl={entry.imageUrl} size={48} className="rounded-[14px] sm:h-14 sm:w-14" />
                <b className="max-w-full truncate text-sm font-extrabold tracking-tight sm:text-lg">{entry.name}</b>
              </ClanLink>
              <span className="font-mono text-xs text-slate-400">[{entry.tag}]</span>
              <span className="whitespace-nowrap rounded-full bg-slate-950 px-2.5 py-0.5 text-xs font-extrabold tabular-nums">
                {meta.format(meta.value(entry))}
                {criterion === 'winRate' ? ' WR' : ''}
              </span>
              <span
                className={`relative flex w-full justify-center overflow-hidden rounded-t-xl rounded-b-sm border pt-2.5 ${STEPS[index].height}`}
                style={{ background: STEPS[index].gradient, borderColor: STEPS[index].ring }}
                aria-hidden="true"
              >
                <span className="text-[34px] font-black leading-none sm:text-[52px]" style={{ color: STEPS[index].number }}>{entry.position}</span>
                <span className="absolute inset-x-0 bottom-0 h-2.5 bg-[repeating-linear-gradient(90deg,rgba(0,0,0,.18)_0_8px,transparent_8px_16px)]" />
              </span>
            </li>
          ) : (
            <li key={`empty-${index}`} style={{ order: index }} />
          )
        )}
      </ol>
    </section>
  )
}

// ── Fil de la ligue ───────────────────────────────────────────────────────────────────────────────

const FEED_ICONS: Record<LeagueFeedEvent['kind'], LucideIcon> = { first: Crosshair, climb: TrendingUp, overtake: Swords, 'zone-in': ShieldCheck, 'zone-out': TrendingDown }
const FEED_COLORS: Partial<Record<LeagueFeedEvent['kind'], string>> = {
  first: 'text-amber-500',
  climb: 'text-[var(--theme-ui-positive)]',
  'zone-in': 'text-[var(--theme-ui-positive)]',
  'zone-out': 'text-blue-400',
}

export function LeagueFeed({ events }: { events: LeagueFeedEvent[] }) {
  return (
    <section aria-labelledby="league-feed-title" className="app-panel flex min-w-0 flex-col gap-2 p-3.5">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-red-500 shadow-[0_0_0_3px_rgba(239,68,68,.25)]" aria-hidden="true" />
        <h2 id="league-feed-title" className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500">Fil de la ligue</h2>
        <span className="ml-auto text-xs text-gray-500">7 dernières soirées · Power score</span>
      </div>
      {events.length > 0 ? (
        <ol className="flex flex-col gap-1.5 [&>li:nth-child(n+4)]:hidden sm:[&>li:nth-child(n+4)]:flex" aria-label="Fil de la ligue">
          {events.map((event, index) => {
            const Icon = FEED_ICONS[event.kind]
            return (
              <li key={`${event.date}-${event.clan}-${index}`} className="flex min-w-0 items-center gap-2 rounded-md bg-gray-50 px-2.5 py-[7px] text-[13px]">
                <b className={`whitespace-nowrap ${FEED_COLORS[event.kind] ?? 'text-gray-900'}`}>{event.clan}</b>
                <Icon className="h-[15px] w-[15px] shrink-0 text-gray-500" aria-hidden="true" />
                <span className="min-w-0 truncate text-gray-600">{event.text}</span>
                <span className="ml-auto shrink-0 text-[11px] font-bold text-gray-500">{WEEKDAY.format(new Date(`${event.date}T12:00:00Z`))}</span>
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="text-sm text-gray-500">Rien n’a bougé en tête du classement ces 7 dernières soirées.</p>
      )}
    </section>
  )
}

// ── Titres ────────────────────────────────────────────────────────────────────────────────────────

type Titles = {
  damage: { clanId: number; name: string; value: number } | null
  knocks: { clanId: number; name: string; value: number } | null
  climb: { clanId: number; name: string; places: number } | null
}

export function LeagueTitles({ titles, periodOf }: { titles: Titles; periodOf: string }) {
  const cards: Array<{ key: string; title: string; icon: LucideIcon; color: string; tint: string; who: string; value: string }> = []
  if (titles.damage) cards.push({ key: 'damage', title: 'Plus gros dégâts', icon: Flame, color: '#f97316', tint: 'rgba(249,115,22,.16)', who: titles.damage.name, value: `${integer.format(titles.damage.value)} / partie` })
  if (titles.knocks) cards.push({ key: 'knocks', title: 'Machine à knocks', icon: HandFist, color: '#f43f5e', tint: 'rgba(244,63,94,.16)', who: titles.knocks.name, value: `${oneDecimal.format(titles.knocks.value)} / partie` })
  if (titles.climb) cards.push({ key: 'climb', title: 'Meilleure remontée', icon: Rocket, color: 'var(--theme-ui-positive)', tint: 'rgba(16,185,129,.16)', who: titles.climb.name, value: `▲${titles.climb.places} place${titles.climb.places > 1 ? 's' : ''}` })
  if (cards.length === 0) return null
  return (
    <section aria-label={`Titres ${periodOf}`} className={`grid gap-2.5 ${cards.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
      {cards.map((card) => {
        const Icon = card.icon
        return (
          <article key={card.key} aria-label={card.title} className="app-panel flex items-center gap-3 px-3.5 py-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px]" style={{ backgroundColor: card.tint }}>
              <Icon className="h-5 w-5" style={{ color: card.color }} aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-gray-500">{card.title}</span>
              <span className="flex min-w-0 items-baseline gap-1.5">
                <b className="truncate text-[15px] text-gray-900">{card.who}</b>
                <span className="whitespace-nowrap text-[13px] font-bold tabular-nums" style={{ color: card.color }}>{card.value}</span>
              </span>
            </span>
          </article>
        )
      })}
    </section>
  )
}

// ── Classement par cercle ───────────────────────────────────────────────────────────────────────

function Movement({ entry }: { entry: RankedEntry }) {
  if (entry.previousRank === null) return <span className="text-[10px] font-extrabold text-gray-500" title="Pas classé sur la période précédente">nouv.</span>
  const delta = entry.previousRank - entry.rank
  if (delta === 0) return <span className="text-[11px] font-extrabold text-gray-500" title="Même rang que la période précédente">=</span>
  return (
    <span
      className="text-[11px] font-extrabold tabular-nums"
      style={{ color: delta > 0 ? 'var(--theme-ui-positive)' : 'var(--theme-ui-negative)' }}
      title={`${delta > 0 ? 'Gagne' : 'Perd'} ${Math.abs(delta)} place${Math.abs(delta) > 1 ? 's' : ''} par rapport à la période précédente (${entry.previousRank}e)`}
    >
      {delta > 0 ? `▲${delta}` : `▼${-delta}`}
    </span>
  )
}

function LeagueRow({ entry, ranked, criterion, mine, showMovement, top, barColor, dimmed, access }: {
  access: ClanAccess
  entry: RankedEntry
  ranked: RankedEntry[]
  criterion: LeagueCriterion
  mine: boolean
  showMovement: boolean
  top: number
  barColor: string
  dimmed: boolean
}) {
  const meta = leagueCriterion(criterion)
  const value = meta.value(entry)
  const target = mine ? targetAhead(ranked, entry.clanId, criterion) : null
  return (
    <li id={`league-clan-${entry.clanId}`} className="scroll-mt-[160px] border-t border-gray-200 first:border-t-0">
      <ClanLink
        access={access}
        clanId={entry.clanId}
        className={`relative flex items-center gap-2 px-3 py-[9px] text-gray-900 sm:gap-3 ${mine ? 'bg-[var(--theme-ui-accent-soft)] shadow-[inset_3px_0_0_var(--theme-ui-accent-text)]' : ''}`}
        label={`${entry.position}. ${entry.name}${mine ? ' (mon clan)' : ''}`}
      >
        <span className="w-[26px] shrink-0 text-right text-[15px] font-black tabular-nums text-gray-600">{entry.position}</span>
        {showMovement ? <span className="w-[34px] shrink-0">{<Movement entry={entry} />}</span> : null}
        <ClanLogo imageUrl={entry.imageUrl} size={32} className={`rounded-lg ${dimmed ? 'grayscale-[.5]' : ''}`} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <b className="truncate text-sm">{entry.name}</b>
            <span className="shrink-0 font-mono text-[11px] text-gray-500">[{entry.tag}]</span>
            {mine ? <span className="shrink-0 rounded-[5px] bg-[var(--theme-ui-accent-soft)] px-1.5 py-px text-[10px] font-extrabold text-[var(--theme-ui-accent-text)]">MON CLAN</span> : null}
          </span>
          <span className="flex items-center gap-2">
            <span className="h-[5px] max-w-[260px] flex-1 overflow-hidden rounded-full bg-[var(--theme-ui-surface-strong)]" aria-hidden="true">
              <span className="block h-full rounded-full" style={{ width: `${Math.max(4, Math.round((top > 0 ? value / top : 0) * 100))}%`, backgroundColor: barColor }} />
            </span>
            {target ? (
              <span className="whitespace-nowrap text-[11px] font-bold text-[var(--theme-ui-accent-text)]" data-testid="league-target">
                <span className="hidden sm:inline">cible : </span>
                {target.name} à {target.gap}
              </span>
            ) : null}
          </span>
        </span>
        <span className="hidden gap-[18px] whitespace-nowrap text-xs tabular-nums text-gray-500 sm:flex">
          <span>{oneDecimal.format(entry.winRate * 100)} % WR</span>
          <span>{entry.activeMembers} actif{entry.activeMembers > 1 ? 's' : ''}</span>
        </span>
        <span className="w-14 shrink-0 text-right text-[15px] font-extrabold tabular-nums sm:w-[72px]">{meta.format(value)}</span>
      </ClanLink>
    </li>
  )
}

function Group({ title, subtitle, icon: Icon, iconClass, action, onToggle, expanded, controls, children, tone }: {
  title: string
  subtitle: string
  icon: LucideIcon
  iconClass: string
  action?: string
  onToggle?: () => void
  expanded?: boolean
  controls?: string
  children: ReactNode | null
  tone: 'zone' | 'blue' | 'muted'
}) {
  const heading = (
    <>
      <Icon className={`h-4 w-4 ${iconClass}`} aria-hidden="true" />
      <h2 className="text-base font-extrabold text-gray-900">{title}</h2>
      <span className="text-[13px] text-gray-500">{subtitle}</span>
      {action ? (
        <span className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-[var(--theme-ui-accent-text)]">
          {action}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </span>
      ) : null}
    </>
  )
  const box = tone === 'blue' ? 'border-blue-400/35 bg-blue-500/5' : tone === 'muted' ? 'app-panel-muted' : 'app-panel'
  return (
    <div className="flex flex-col gap-2">
      {onToggle ? (
        <button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={controls} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-left">
          {heading}
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">{heading}</div>
      )}
      {children ? <div className={`overflow-hidden rounded-xl border ${tone === 'blue' ? box : `border-gray-200 ${box}`}`}>{children}</div> : null}
    </div>
  )
}

export function LeagueRanking({
  ranked,
  criterion,
  showMovement,
  mineClanId,
  blueOpen,
  onToggleBlue,
  withoutMatch,
  periodWhen,
  access,
}: {
  access: ClanAccess
  ranked: RankedEntry[]
  criterion: LeagueCriterion
  showMovement: boolean
  mineClanId: number | null
  blueOpen: boolean
  onToggleBlue: () => void
  withoutMatch: LeagueClan[]
  periodWhen: string
}) {
  const [idleOpen, setIdleOpen] = useState(false)
  const meta = leagueCriterion(criterion)
  const top = ranked[0] ? meta.value(ranked[0]) : 0
  const zone = ranked.slice(3, 8)
  const blue = ranked.slice(8)
  const visibleBlue = blueOpen ? blue : blue.filter((entry) => entry.clanId === mineClanId)
  const row = (entry: RankedEntry, barColor: string, dimmed = false) => (
    <LeagueRow key={entry.clanId} access={access} entry={entry} ranked={ranked} criterion={criterion} mine={entry.clanId === mineClanId} showMovement={showMovement} top={top} barColor={barColor} dimmed={dimmed} />
  )
  const idleMine = withoutMatch.some((clan) => clan.clanId === mineClanId)

  return (
    <section className="flex flex-col gap-3.5" aria-label="Classement">
      {zone.length > 0 ? (
        <Group title="Dans la zone" subtitle={`4 à ${3 + zone.length}`} icon={ShieldCheck} iconClass="text-[var(--theme-ui-positive)]" tone="zone">
          <ul aria-label="Dans la zone">{zone.map((entry) => row(entry, 'var(--theme-ui-positive)'))}</ul>
        </Group>
      ) : null}
      {blue.length > 0 ? (
        <Group
          title="Blue zone"
          subtitle={`9 à ${ranked.length} · à l’extérieur du cercle`}
          icon={CircleDashed}
          iconClass="text-blue-400"
          action={blueOpen ? 'Replier' : `Voir les ${blue.length} clans`}
          onToggle={onToggleBlue}
          expanded={blueOpen}
          controls="league-blue-zone"
          tone="blue"
        >
          {visibleBlue.length > 0 ? (
            <ul id="league-blue-zone" aria-label="Blue zone">{visibleBlue.map((entry) => row(entry, '#3b82f6', true))}</ul>
          ) : null}
        </Group>
      ) : null}
      {withoutMatch.length > 0 ? (
        <Group
          title="Sans partie"
          subtitle={`${withoutMatch.length} clan${withoutMatch.length > 1 ? 's' : ''} sans partie officielle ${periodWhen} · non classé${withoutMatch.length > 1 ? 's' : ''}`}
          icon={Info}
          iconClass="text-gray-500"
          action={idleOpen ? 'Replier' : 'Voir'}
          onToggle={() => setIdleOpen((open) => !open)}
          expanded={idleOpen}
          controls="league-idle"
          tone="muted"
        >
          {idleOpen || idleMine ? (
            <ul id="league-idle" aria-label="Clans sans partie" className="flex flex-wrap gap-2 p-3">
              {(idleOpen ? withoutMatch : withoutMatch.filter((clan) => clan.clanId === mineClanId)).map((clan) => (
                <li key={clan.clanId} id={`league-clan-${clan.clanId}`} className="scroll-mt-[160px]">
                  <ClanLink access={access} clanId={clan.clanId} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[13px] text-gray-700">
                    <ClanLogo imageUrl={clan.imageUrl} size={20} className="rounded-[5px] grayscale" />
                    {clan.name}
                    <span className="font-mono text-[11px] text-gray-500">[{clan.tag}]</span>
                    {clan.clanId === mineClanId ? <span className="rounded-[5px] bg-[var(--theme-ui-accent-soft)] px-1.5 text-[10px] font-extrabold text-[var(--theme-ui-accent-text)]">MON CLAN</span> : null}
                  </ClanLink>
                </li>
              ))}
            </ul>
          ) : null}
        </Group>
      ) : null}
    </section>
  )
}

export function PowerScoreHelp() {
  const [open, setOpen] = useState(false)
  return (
    <section className="app-panel">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center gap-2 px-3.5 py-3 text-left text-[13px]">
        <Info className="h-[15px] w-[15px] text-gray-500" aria-hidden="true" />
        <b className="text-gray-900">Comment le Power score est calculé</b>
        <span className="ml-auto font-bold text-[var(--theme-ui-accent-text)]">{open ? 'Masquer' : 'Voir'}</span>
      </button>
      {open ? (
        <div className="flex flex-col gap-2 px-3.5 pb-3.5 text-[13px] text-gray-600">
          <code className="font-mono text-[13px] text-gray-900">Win rate × 100 × 100 + dégâts moy. + kills moy. × 10 + knocks moy. × 5</code>
          <span className="text-gray-500">
            Moyennes par partie officielle, membres actifs du clan uniquement. Plus un clan gagne, inflige de dégâts, met au sol et
            élimine en moyenne, plus son score monte.
          </span>
        </div>
      ) : null}
    </section>
  )
}
