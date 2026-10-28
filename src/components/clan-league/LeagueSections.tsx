'use client'

import Link from 'next/link'
import { ChevronDown, CircleDashed, Crosshair, Flame, HandFist, Hourglass, Info, Rocket, ShieldCheck, Swords, TrendingDown, TrendingUp, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import ClanTag from '@/components/ui/ClanTag'
import PodiumSteps, { ClanLogo, PodiumPlate, PodiumStats, PodiumTitle } from '@/components/ui/PodiumSteps'
import RankCell from '@/components/ui/RankCell'
import RankMovement from '@/components/ui/RankMovement'
import {
  LEAGUE_MATCH_TYPE_OPTIONS,
  leagueCriterion,
  targetAhead,
  type LeagueAverage,
  type LeagueClan,
  type LeagueCriterion,
  type LeagueFeedEvent,
  type LeagueMatchType,
  type LeagueQualifier,
  type LeagueSettings,
} from '@/lib/clan-league'
import type { LeagueEntry } from '@/lib/clan-league-service'

/**
 * Blocs de la Ligue Inter-Clans (maquette « Ligue clans », 22a–22e ; docs/features/ligue-clans.md), selon la charte UI
 * (docs/ui/index.html, section « Ligue inter-clans », 04/10/2026). Signatures conservées : podium en marches (toujours
 * sombre, `.app-on-photo`, partagé avec les tournois : `PodiumSteps`), couronne en or de jeu, fil de la ligue, blue zone
 * (seul bleu autorisé).
 */

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

// ── Type de partie ────────────────────────────────────────────────────────────────────────────────

/**
 * Menu du type de partie (bandeau) : déclencheur `app-menu-trigger`, accent hors de « Normal ». Le même menu à toutes les
 * largeurs depuis le 2026-10-18 (plus de segmented sur téléphone) ; `className` / `triggerClassName` l'étirent sur mobile.
 */
export function MatchTypeMenu({
  value,
  onChange,
  className = '',
  triggerClassName = '',
}: {
  value: LeagueMatchType
  onChange: (value: LeagueMatchType) => void
  className?: string
  triggerClassName?: string
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
  const current = LEAGUE_MATCH_TYPE_OPTIONS.find((option) => option.value === value) ?? LEAGUE_MATCH_TYPE_OPTIONS[0]
  return (
    // Étiré à la hauteur de la ligne du bandeau : même hauteur que le segmented voisin.
    <div ref={rootRef} className={`relative flex shrink-0 self-stretch ${className}`.trim()}>
      <button
        type="button"
        onClick={() => setOpen((state) => !state)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Type de partie : ${current.label}`}
        data-testid="match-type-chip"
        className={`app-menu-trigger ${value !== 'official' ? 'app-menu-trigger--active' : ''} ${triggerClassName}`.trim()}
      >
        {current.label}
        <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" aria-label="Type de partie" className="app-menu absolute left-0 top-full z-50 mt-1.5 w-[250px]">
          {LEAGUE_MATCH_TYPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={option.value === value}
              onClick={() => {
                onChange(option.value)
                setOpen(false)
              }}
              className={`app-menu__item ${option.value === value ? 'app-menu__item--active' : ''}`}
            >
              <span className="flex min-w-0 flex-col items-start">
                <b className="text-[13px]">{option.label}</b>
                <span className="text-[11px] font-normal opacity-75">{option.hint}</span>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ── Podium ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Podium de la Ligue, au gabarit de la page Joueurs (demande du 2026-10-18) : titre en évidence, sans tampon, plaque de
 * score au métal de la marche (valeur et unité du critère), « N parties · N Top 1 », tag du clan en or de jeu.
 */
export function LeaguePodium({ ranked, criterion, access }: { ranked: RankedEntry[]; criterion: LeagueCriterion; access: ClanAccess }) {
  const meta = leagueCriterion(criterion)
  return (
    <PodiumSteps
      ariaLabel={`Podium · ${meta.long}`}
      title={<PodiumTitle label={meta.long} />}
      stamp={null}
      emphasis
      entries={ranked.slice(0, 3).map((entry) => ({
        key: String(entry.clanId),
        position: entry.position,
        id: `league-clan-${entry.clanId}`,
        testId: `podium-${entry.position}`,
        identity: (
          <ClanLink access={access} clanId={entry.clanId} className="flex min-w-0 max-w-full flex-col items-center gap-1 rounded-lg hover:!bg-transparent hover:opacity-90">
            <ClanLogo imageUrl={entry.imageUrl} size={48} className="rounded-[14px] sm:h-14 sm:w-14" />
            <b className="max-w-full truncate text-sm font-extrabold tracking-tight sm:text-lg">{entry.name}</b>
          </ClanLink>
        ),
        caption: <ClanTag tag={entry.tag} tone="photo" size="md" />,
        value: <PodiumPlate value={meta.plate(meta.value(entry))} unit={meta.unit} />,
        detail: <PodiumStats count={entry.matches} label="parties" wins={entry.wins} />,
      }))}
    />
  )
}

// ── Fil de la ligue ───────────────────────────────────────────────────────────────────────────────

const FEED_ICONS: Record<LeagueFeedEvent['kind'], LucideIcon> = { first: Crosshair, climb: TrendingUp, overtake: Swords, 'zone-in': ShieldCheck, 'zone-out': TrendingDown }
const FEED_COLORS: Partial<Record<LeagueFeedEvent['kind'], string>> = {
  first: 'text-[var(--game-gold)]',
  climb: 'text-[var(--theme-ui-positive)]',
  'zone-in': 'text-[var(--theme-ui-positive)]',
  // Blue zone : seule exception bleue autorisée (charte §1.3).
  'zone-out': 'text-blue-500 dark:text-blue-400',
}

export function LeagueFeed({ events }: { events: LeagueFeedEvent[] }) {
  return (
    <section aria-labelledby="league-feed-title" className="app-panel flex min-w-0 flex-col gap-2 p-3.5">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-[var(--game-neg)] shadow-[0_0_0_3px_var(--game-neg-soft)]" aria-hidden="true" />
        <h2 id="league-feed-title" className="t-label">Fil de la ligue</h2>
        <span className="t-meta ml-auto">7 dernières soirées · Power score</span>
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
  // Couleurs de jeu (conteneur `.game-ui`) : plus de hex.
  const cards: Array<{ key: string; title: string; icon: LucideIcon; color: string; tint: string; who: string; value: string }> = []
  if (titles.damage) cards.push({ key: 'damage', title: 'Plus gros dégâts', icon: Flame, color: 'var(--game-warn)', tint: 'var(--game-warn-soft)', who: titles.damage.name, value: `${integer.format(titles.damage.value)} / partie` })
  if (titles.knocks) cards.push({ key: 'knocks', title: 'Machine à knocks', icon: HandFist, color: 'var(--game-neg)', tint: 'var(--game-neg-soft)', who: titles.knocks.name, value: `${oneDecimal.format(titles.knocks.value)} / partie` })
  if (titles.climb) cards.push({ key: 'climb', title: 'Meilleure remontée', icon: Rocket, color: 'var(--game-pos)', tint: 'var(--game-pos-soft)', who: titles.climb.name, value: `▲${titles.climb.places} place${titles.climb.places > 1 ? 's' : ''}` })
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
              <span className="t-label">{card.title}</span>
              <span className="flex min-w-0 items-baseline gap-1.5">
                <b className="truncate text-[15px] text-gray-900">{card.who}</b>
                <span className="t-num whitespace-nowrap text-[13px] font-bold" style={{ color: card.color }}>{card.value}</span>
              </span>
            </span>
          </article>
        )
      })}
    </section>
  )
}

// ── Classement par cercle ───────────────────────────────────────────────────────────────────────

const MINE_BADGE = 'shrink-0 rounded-[5px] bg-[var(--theme-ui-accent-soft)] px-1.5 py-px text-[11px] font-extrabold text-[var(--theme-ui-accent-text)]'

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
        <span className="flex w-[26px] shrink-0 justify-end">
          <RankCell rank={entry.position} size="xs" />
        </span>
        {showMovement ? <span className="w-[34px] shrink-0"><RankMovement rank={entry.rank} previousRank={entry.previousRank} /></span> : null}
        <ClanLogo imageUrl={entry.imageUrl} size={32} className={`rounded-lg ${dimmed ? 'grayscale-[.5]' : ''}`} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-baseline gap-1.5">
            <b className="truncate text-sm">{entry.name}</b>
            <span className="shrink-0 font-mono text-[11px] text-gray-500">[{entry.tag}]</span>
            {mine ? <span className={MINE_BADGE}>MON CLAN</span> : null}
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
        <span className="t-num hidden gap-[18px] whitespace-nowrap text-xs text-gray-500 sm:flex">
          <span>{entry.matches} parties</span>
          <span>{oneDecimal.format(entry.winRate * 100)} % WR</span>
          <span>{entry.activeMembers} actif{entry.activeMembers > 1 ? 's' : ''}</span>
        </span>
        <span className="t-num w-14 shrink-0 text-right text-[15px] font-extrabold sm:w-[72px]">{meta.format(value)}</span>
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
      <h2 className="t-section-title">{title}</h2>
      <span className="text-[13px] text-gray-500">{subtitle}</span>
      {action ? (
        <span className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-[var(--theme-ui-accent-text)]">
          {action}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </span>
      ) : null}
    </>
  )
  // Bloc bordé de la charte (`.app-panel` / `.app-panel-muted`) ; la blue zone garde son bleu (exception §1.3).
  const box = tone === 'blue' ? 'rounded-[14px] border border-blue-400/35 bg-blue-500/5' : tone === 'muted' ? 'app-panel-muted' : 'app-panel'
  return (
    <div className="flex flex-col gap-2">
      {onToggle ? (
        <button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={controls} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-left">
          {heading}
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">{heading}</div>
      )}
      {children ? <div className={`overflow-hidden ${box}`}>{children}</div> : null}
    </div>
  )
}

function IdleChip({ clan, mine, access, children, dimmed = true }: { clan: LeagueClan; mine: boolean; access: ClanAccess; children?: ReactNode; dimmed?: boolean }) {
  return (
    <li id={`league-clan-${clan.clanId}`} className="scroll-mt-[160px]">
      <ClanLink access={access} clanId={clan.clanId} className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1 text-[13px] text-gray-700">
        <ClanLogo imageUrl={clan.imageUrl} size={20} className={`rounded-[5px] ${dimmed ? 'grayscale' : ''}`} />
        {clan.name}
        <span className="font-mono text-[11px] text-gray-500">[{clan.tag}]</span>
        {children}
        {mine ? <span className={MINE_BADGE}>MON CLAN</span> : null}
      </ClanLink>
    </li>
  )
}

export function LeagueRanking({
  ranked,
  criterion,
  showMovement,
  mineClanId,
  blueOpen,
  onToggleBlue,
  qualifying,
  withoutMatch,
  periodWhen,
  typeNoun,
  zoneEnd,
  access,
}: {
  access: ClanAccess
  /** Dernier rang « Dans la zone » (réglage de la ligue, 8 par défaut). */
  zoneEnd: number
  ranked: RankedEntry[]
  criterion: LeagueCriterion
  showMovement: boolean
  mineClanId: number | null
  blueOpen: boolean
  onToggleBlue: () => void
  qualifying: LeagueQualifier[]
  withoutMatch: LeagueClan[]
  periodWhen: string
  /** « normale », « Ranked »… : « sans partie normale cette semaine ». */
  typeNoun: string
}) {
  const [idleOpen, setIdleOpen] = useState(false)
  const meta = leagueCriterion(criterion)
  const top = ranked[0] ? meta.value(ranked[0]) : 0
  const zone = ranked.slice(3, zoneEnd)
  const blue = ranked.slice(zoneEnd)
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
          subtitle={`${zoneEnd + 1} à ${ranked.length} · à l’extérieur du cercle`}
          icon={CircleDashed}
          iconClass="text-blue-500 dark:text-blue-400"
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
      {qualifying.length > 0 ? (
        <Group
          title="En qualification"
          subtitle={`${qualifying.length} clan${qualifying.length > 1 ? 's' : ''} sous les ${qualifying[0].required} parties · pas encore classé${qualifying.length > 1 ? 's' : ''}`}
          icon={Hourglass}
          iconClass="t-warn"
          tone="muted"
        >
          <ul aria-label="Clans en qualification" className="flex flex-wrap gap-2 p-3">
            {qualifying.map((clan) => (
              <IdleChip key={clan.clanId} clan={clan} mine={clan.clanId === mineClanId} access={access} dimmed={false}>
                <span className="inline-flex items-center gap-1.5" title={`${clan.matches} partie${clan.matches > 1 ? 's' : ''} sur ${clan.required} pour être classé`}>
                  <span className="h-[5px] w-10 overflow-hidden rounded-full bg-[var(--theme-ui-surface-strong)]" aria-hidden="true">
                    <span className="block h-full rounded-full bg-[var(--game-warn)]" style={{ width: `${Math.round((clan.matches / clan.required) * 100)}%` }} />
                  </span>
                  <span className="t-num text-[11px] font-bold text-gray-700">{clan.matches} / {clan.required} parties</span>
                </span>
              </IdleChip>
            ))}
          </ul>
        </Group>
      ) : null}
      {withoutMatch.length > 0 ? (
        <Group
          title="Sans partie"
          subtitle={`${withoutMatch.length} clan${withoutMatch.length > 1 ? 's' : ''} sans partie ${typeNoun} ${periodWhen} · non classé${withoutMatch.length > 1 ? 's' : ''}`}
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
                <IdleChip key={clan.clanId} clan={clan} mine={clan.clanId === mineClanId} access={access} />
              ))}
            </ul>
          ) : null}
        </Group>
      ) : null}
    </section>
  )
}

// ── Explication du Power score ──────────────────────────────────────────────────────────────────

/**
 * Explication lue dans les réglages en vigueur (`scoring.settings`) et la période choisie : elle suit ce que le SuperUser
 * a réglé. Contenu de la barre « Comment c'est calculé ? » de la page (`CalculationHelp`), une fois le classement chargé.
 */
export function PowerScoreExplanation({ scoring }: { scoring: { minMatches: number; settings: LeagueSettings; league: LeagueAverage } }) {
  const { settings } = scoring
  const scale = settings.placementPoints.map((points, index) => `${index + 1}${index === 0 ? 'er' : 'e'} ${points}`).join(' · ')
  const weight = (value: number) => integer.format(value)
  return (
    <div className="flex flex-col gap-2.5" data-testid="power-score-explanation">
      <p>
        <b>1. Score brut</b> du clan, moyennes par partie (membres actifs uniquement) :
      </p>
      <code className="font-mono text-[13px] text-gray-900">
        points de placement × {weight(settings.placementWeight)} + dégâts{settings.damageWeight !== 1 ? ` × ${oneDecimal.format(settings.damageWeight)}` : ''} + kills ×{' '}
        {weight(settings.killWeight)} + knocks × {weight(settings.knockWeight)}
      </code>
      <p className="text-gray-500">
        Points de placement : {scale} ; au-delà de la {settings.placementPoints.length}e, 0. Un top 2 rapporte, plus seulement la victoire.
      </p>
      <p>
        <b>2. Pondération par le volume</b> : on ajoute {settings.priorMatches} parties fictives au niveau moyen de la ligue (score brut{' '}
        <span className="t-num font-bold text-gray-900">{integer.format(scoring.league.rawScore)}</span> sur la période). Avec peu de parties, le
        score reste proche de la moyenne ; plus un clan joue, plus son propre niveau pèse.
      </p>
      <p>
        <b>3. Qualification</b> : un clan est classé à partir de <b>{scoring.minMatches} parties</b> sur la période ; en dessous, il apparaît « En
        qualification ». Le win rate reste affiché, il ne compte plus dans le score.
      </p>
    </div>
  )
}
