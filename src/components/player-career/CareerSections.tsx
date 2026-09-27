'use client'

import { Bomb, Car, Crosshair, Flame, Footprints, HeartPulse, Hourglass, Ruler, Trophy } from 'lucide-react'
import Link from 'next/link'

import SegmentedControl from '@/components/ui/SegmentedControl'
import {
  CAREER_MODE_LABELS,
  defaultSeasonTab,
  formatCount,
  formatRatio,
  formatThousands,
  gamesOf,
  nextRankStep,
  normalKd,
  rankedTierColor,
  rankedTierLabel,
  seasonLabel,
  winRateOf,
  type CalendarCell,
  type CareerMedal,
  type CareerMode,
  type CareerRecord,
  type CareerTheme,
  type LifetimeStats,
  type MedalRank,
  type MedalRanks,
  type SeasonRow,
} from '@/lib/player-career'

/** Blocs de la page Carrière PUBG d'un joueur et de son tableau de bord (maquette « Stats joueur », 25a–25g ; docs/features/carriere-joueur.md). */

const oneDecimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 })

export const MEDALS: Record<MedalRank, { src: string; alt: string }> = {
  1: { src: '/icons/medal-gold.svg', alt: 'Or · 1er du clan' },
  2: { src: '/icons/medal-silver.svg', alt: 'Argent · 2e du clan' },
  3: { src: '/icons/medal-bronze.svg', alt: 'Bronze · 3e du clan' },
}

function MedalIcon({ rank, size }: { rank: MedalRank; size: number }) {
  const medal = MEDALS[rank]
  // eslint-disable-next-line @next/next/no-img-element -- SVG statique de 16 à 26 px, sans intérêt à l'optimiser.
  return <img src={medal.src} alt={medal.alt} title={medal.alt} width={size} height={size} className="shrink-0" />
}

// ── Plaque militaire et états de service ─────────────────────────────────────────────────────────

export function ServiceRecord({
  stats,
  mode,
  name,
  clan,
}: {
  stats: LifetimeStats
  mode: CareerMode
  name: string
  clan: { name: string; tag: string } | null
}) {
  const games = gamesOf(stats)
  const modeLabel = CAREER_MODE_LABELS[mode].toUpperCase()
  return (
    <article
      aria-label="États de service"
      className="relative flex min-w-0 flex-wrap items-center gap-4 overflow-hidden rounded-2xl border border-gray-200 bg-[radial-gradient(120%_100%_at_0%_0%,#1f2937,#0b0f1a_70%)] p-4 text-white sm:gap-6 sm:px-[22px] sm:py-5"
    >
      {/* Plaque militaire : gravée au nom du joueur, sur sa chaîne. */}
      <div className="relative h-[120px] w-[200px] shrink-0 sm:h-[136px] sm:w-[230px]" data-testid="dog-tag">
        <span className="absolute left-[18px] top-1.5 h-[86%] w-[86%] rotate-[8deg] rounded-[22px] bg-[linear-gradient(135deg,#64748b,#334155)] shadow-[0_10px_20px_-8px_rgba(0,0,0,0.6)]" aria-hidden="true" />
        <div className="absolute inset-0 flex flex-col justify-center gap-[3px] min-w-0 rounded-[22px] bg-[linear-gradient(135deg,#e2e8f0_0%,#94a3b8_45%,#cbd5e1_60%,#64748b_100%)] py-3.5 pl-[34px] pr-3 font-mono text-[#1e293b] shadow-[inset_0_2px_0_rgba(255,255,255,0.6),0_14px_24px_-10px_rgba(0,0,0,0.7)] [text-shadow:0_1px_0_rgba(255,255,255,0.6)]">
          <span className="absolute left-3 top-1/2 -mt-1.5 h-3 w-3 rounded-full bg-[#0b0f1a] shadow-[inset_0_1px_2px_rgba(0,0,0,0.8)]" aria-hidden="true" />
          <b className="truncate text-xl font-black uppercase tracking-[0.06em] sm:text-[22px]">{name}</b>
          {clan ? <span className="truncate text-[11px] font-bold uppercase">{clan.name} · [{clan.tag}]</span> : null}
          <span className="truncate text-[11px] font-bold">
            TOP 1 ×{formatCount(stats.victory.wins)} · K/D {formatRatio(stats.combat.kdRatio)}
          </span>
          <span className="truncate text-[11px] font-bold">
            {formatCount(games)} PARTIES · {modeLabel}
          </span>
        </div>
      </div>
      <div className="flex min-w-[220px] flex-1 flex-col gap-3">
        <span className="text-[11px] font-black tracking-[0.18em] text-amber-300">ÉTATS DE SERVICE · {modeLabel}</span>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 tabular-nums">
          {[
            [formatCount(stats.victory.wins), 'chicken dinners', 'text-amber-300'],
            [formatCount(stats.combat.kills), 'kills', 'text-white'],
            [formatRatio(stats.combat.kdRatio), 'ratio K/D', 'text-white'],
            [formatThousands(stats.other.damageGiven), 'dégâts', 'text-white'],
          ].map(([value, label, color]) => (
            <div key={label} className="flex flex-col-reverse gap-0.5">
              <dt className="text-[11px] font-bold uppercase tracking-[0.06em] text-slate-400">{label}</dt>
              <dd className={`text-[26px] font-black leading-none sm:text-[32px] ${color}`}>{value}</dd>
            </div>
          ))}
        </dl>
        <span className="text-xs text-slate-300">
          {formatCount(games)} parties · {oneDecimal.format(winRateOf(stats))} % de top 1 · {formatCount(stats.combat.assists)} assists
        </span>
      </div>
    </article>
  )
}

// ── Saisons ──────────────────────────────────────────────────────────────────────────────────────

export function SeasonsCard({ seasons, tab, onTab }: { seasons: SeasonRow[]; tab: 'ranked' | 'normal' | null; onTab: (tab: 'ranked' | 'normal') => void }) {
  const active = tab ?? defaultSeasonTab(seasons)
  const current = seasons[0] ?? null
  const ranked = active === 'ranked'
  const next = current && ranked ? nextRankStep(current.rankedPoints, current.rankedTier, current.rankedSubTier) : null
  const color = rankedTierColor(current?.rankedTier ?? null)
  return (
    <section aria-labelledby="seasons-title" className="app-panel flex min-w-0 flex-col gap-2.5 p-3.5" style={ranked && current?.rankedTier ? { borderColor: `${color}66` } : undefined}>
      <div className="flex items-center gap-2">
        <h2 id="seasons-title" className="text-[15px] font-extrabold text-gray-900">Saisons</h2>
        <SegmentedControl
          options={[
            { value: 'ranked', label: 'Ranked' },
            { value: 'normal', label: 'Normal' },
          ]}
          value={active}
          onChange={onTab}
          size="xs"
          className="ml-auto"
        />
      </div>
      {seasons.length === 0 ? <p className="text-[13px] text-gray-500">Aucune saison synchronisée pour ce joueur.</p> : null}
      {current && ranked ? (
        current.rankedTier ? (
          <>
            <div className="flex items-center gap-3.5">
              <span
                className="grid h-[72px] w-16 shrink-0 place-items-center [clip-path:polygon(50%_0,100%_22%,100%_78%,50%_100%,0_78%,0_22%)]"
                style={{ background: `linear-gradient(160deg, ${color}, #0b0f1a)` }}
                aria-hidden="true"
              >
                <b className="text-lg font-black text-white">{current.rankedSubTier ?? ''}</b>
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-gray-500">{seasonLabel(current.seasonId)} · en cours</span>
                <b className="text-[22px] font-black" style={{ color }} data-testid="current-tier">
                  {rankedTierLabel(current.rankedTier, current.rankedSubTier)}
                </b>
                <span className="text-xs tabular-nums text-gray-600">
                  {formatCount(current.rankedPoints)} pts
                  {current.rankedBestTier ? ` · meilleur : ${rankedTierLabel(current.rankedBestTier, current.rankedBestSubTier)}` : ''}
                </span>
              </span>
            </div>
            {next ? (
              <div className="flex flex-col gap-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true">
                  <span className="block h-full" style={{ width: `${next.progress}%`, background: color }} />
                </div>
                <span className="text-[11px] text-gray-500">
                  {formatCount(next.missing)} pts avant {next.label}
                </span>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-[13px] text-gray-500">Pas de partie classée en {seasonLabel(current.seasonId)}.</p>
        )
      ) : null}
      {seasons.length > 0 ? (
        <ul className="grid grid-cols-3 gap-1.5" aria-label={ranked ? 'Saisons classées' : 'Saisons normales'}>
          {seasons.slice(0, 3).map((season, index) => {
            const tierColor = rankedTierColor(season.rankedTier)
            const avgDamage = season.normalMatches > 0 ? season.normalDamage / season.normalMatches : 0
            return (
              <li
                key={season.seasonId}
                className="flex min-w-0 flex-col gap-0.5 rounded-[10px] border bg-gray-50 p-2"
                style={{ borderColor: ranked && index === 0 && season.rankedTier ? tierColor : 'var(--theme-ui-border)' }}
              >
                <span className="text-[11px] font-extrabold text-gray-500">{seasonLabel(season.seasonId)}</span>
                {ranked ? (
                  <>
                    <b className="truncate text-[13px]" style={{ color: season.rankedTier ? tierColor : undefined }}>
                      {rankedTierLabel(season.rankedTier, season.rankedSubTier)}
                    </b>
                    <span className="text-[11px] tabular-nums text-gray-600">{season.rankedTier ? `${formatCount(season.rankedPoints)} pts` : '—'}</span>
                    <span className="text-[11px] tabular-nums text-gray-600">{formatCount(season.rankedMatches)} parties</span>
                    <span className="text-[11px] tabular-nums text-gray-600">{formatCount(season.rankedWins)} top 1</span>
                  </>
                ) : (
                  <>
                    <b className="truncate text-[13px] text-[var(--theme-ui-positive)]">Squad</b>
                    <span className="text-[11px] tabular-nums text-gray-600">{formatCount(season.normalMatches)} parties</span>
                    <span className="text-[11px] tabular-nums text-gray-600">{formatCount(season.normalWins)} top 1</span>
                    <span className="text-[11px] tabular-nums text-gray-600">K/D {formatRatio(normalKd(season))}</span>
                    <span className="text-[11px] tabular-nums text-gray-600">{formatCount(avgDamage)} dég./partie</span>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}

// ── Vitrine du clan ──────────────────────────────────────────────────────────────────────────────

export function MedalShowcase({ medals, counts, mode }: { medals: CareerMedal[]; counts: Record<MedalRank, number>; mode: CareerMode }) {
  return (
    <section
      aria-labelledby="medals-title"
      className="flex flex-col gap-2.5 rounded-2xl border border-amber-400/45 bg-[linear-gradient(180deg,rgba(251,191,36,0.08),transparent)] p-3.5"
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h2 id="medals-title" className="text-base font-extrabold text-gray-900">Vitrine du clan</h2>
        <span className="text-[13px] text-gray-600">
          {mode === 'all' ? 'Tes places sur le podium du clan, stat par stat.' : 'Calculée sur tous les modes.'}
        </span>
        <span className="ml-auto inline-flex gap-2.5 text-[13px] font-extrabold tabular-nums text-gray-900" data-testid="medal-counts">
          {([1, 2, 3] as const).map((rank) => (
            <span key={rank} className="inline-flex items-center gap-1">
              <MedalIcon rank={rank} size={18} />×{counts[rank]}
            </span>
          ))}
        </span>
      </div>
      {medals.length === 0 ? (
        <p className="text-[13px] text-gray-500">Pas encore de place sur le podium du clan.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="Stats médaillées">
          {medals.map((medal) => (
            <li key={medal.key} className="app-panel flex min-w-0 items-center gap-2 px-2.5 py-2">
              <MedalIcon rank={medal.rank} size={26} />
              <span className="flex min-w-0 flex-col">
                <b className="truncate text-[13px] text-gray-900">{medal.label}</b>
                <span className="text-[11px] tabular-nums text-gray-500">{medal.value}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// ── Hauts faits et fiches ────────────────────────────────────────────────────────────────────────

const RECORD_STYLE: Record<CareerRecord['id'], { Icon: typeof Ruler; color: string; bg: string }> = {
  longest: { Icon: Ruler, color: 'text-amber-500', bg: 'bg-amber-400/15' },
  streak: { Icon: Flame, color: 'text-rose-500', bg: 'bg-rose-500/15' },
  survival: { Icon: Hourglass, color: 'text-emerald-500', bg: 'bg-emerald-500/15' },
  roadkills: { Icon: Car, color: 'text-sky-500', bg: 'bg-sky-400/15' },
  vehicles: { Icon: Bomb, color: 'text-gray-600', bg: 'bg-gray-100' },
}

export function CareerRecords({ records }: { records: CareerRecord[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2.5 lg:grid-cols-5" aria-label="Hauts faits">
      {records.map((record) => {
        const { Icon, color, bg } = RECORD_STYLE[record.id]
        return (
          <li key={record.id} className={`app-panel flex flex-col gap-1.5 p-3 ${record.id === 'vehicles' ? 'col-span-2 lg:col-span-1' : ''}`}>
            <span className={`grid h-8 w-8 place-items-center rounded-[9px] ${bg}`}>
              <Icon className={`h-[17px] w-[17px] ${color}`} aria-hidden="true" />
            </span>
            <b className="text-xl font-black tabular-nums text-gray-900">{record.value}</b>
            <span className="text-xs text-gray-500">{record.label}</span>
          </li>
        )
      })}
    </ul>
  )
}

const THEME_STYLE: Record<CareerTheme['id'], { Icon: typeof Ruler; color: string }> = {
  combat: { Icon: Crosshair, color: 'text-rose-500' },
  victory: { Icon: Trophy, color: 'text-amber-500' },
  support: { Icon: HeartPulse, color: 'text-emerald-500' },
  movement: { Icon: Footprints, color: 'text-sky-500' },
}

export function CareerThemes({ themes, ranks, showMedals }: { themes: CareerTheme[]; ranks: MedalRanks; showMedals: boolean }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {themes.map((theme) => {
        const { Icon, color } = THEME_STYLE[theme.id]
        return (
          <section key={theme.id} aria-labelledby={`theme-${theme.id}`} className="app-panel flex flex-col gap-1 p-3.5">
            <div className="flex items-center gap-2 pb-1.5">
              <Icon className={`h-4 w-4 ${color}`} aria-hidden="true" />
              <h2 id={`theme-${theme.id}`} className="text-[15px] font-extrabold text-gray-900">{theme.title}</h2>
            </div>
            <dl>
              {theme.rows.map((row) => {
                const rank = showMedals && row.medalKey ? ranks[row.medalKey] : null
                return (
                  <div key={row.label} className="flex items-center gap-2 border-t border-gray-200 py-1.5 text-[13px]">
                    <dt className="text-gray-600">{row.label}</dt>
                    {rank ? <MedalIcon rank={rank} size={16} /> : null}
                    <dd className="ml-auto font-bold tabular-nums text-gray-900">{row.value}</dd>
                  </div>
                )
              })}
            </dl>
            {theme.note ? <p className="mt-1.5 rounded-[10px] bg-gray-50 px-2.5 py-2 text-xs text-gray-600">{theme.note}</p> : null}
          </section>
        )
      })}
    </div>
  )
}

// ── Tableau de bord : Carrière PUBG et calendrier ────────────────────────────────────────────────

export function CareerSummaryCard({
  memberId,
  stats,
  currentSeason,
  goldMedals,
}: {
  memberId: number
  stats: LifetimeStats | null
  currentSeason: SeasonRow | null
  goldMedals: number
}) {
  return (
    <Link
      href={`/members/${memberId}/stats`}
      className="relative flex items-center gap-3.5 overflow-hidden rounded-2xl border border-gray-200 bg-[radial-gradient(120%_100%_at_0%_0%,#1f2937,#0b0f1a_70%)] p-3.5 text-white hover:border-[var(--theme-ui-accent-ring)]"
      aria-label="Carrière PUBG : voir la page"
      data-testid="career-card"
    >
      <span className="relative flex h-12 w-[74px] shrink-0 flex-col justify-center rounded-xl bg-[linear-gradient(135deg,#e2e8f0_0%,#94a3b8_45%,#cbd5e1_60%,#64748b_100%)] pl-[18px] font-mono text-[#1e293b] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]" aria-hidden="true">
        <span className="absolute left-1.5 top-1/2 -mt-[3.5px] h-[7px] w-[7px] rounded-full bg-[#0b0f1a]" />
        <b className="text-[13px] leading-none">×{stats ? formatCount(stats.victory.wins) : '—'}</b>
        <span className="text-[9px] font-extrabold">TOP 1</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-[11px] font-black tracking-[0.14em] text-amber-300">CARRIÈRE PUBG</span>
        {stats ? (
          <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums text-slate-300">
            <span>
              <b className="text-sm text-white">{formatRatio(stats.combat.kdRatio)}</b> K/D
            </span>
            <span>
              <b className="text-sm text-white">{formatCount(stats.combat.kills)}</b> kills
            </span>
            {currentSeason?.rankedTier ? (
              <b className="text-sm" style={{ color: rankedTierColor(currentSeason.rankedTier) }}>
                {rankedTierLabel(currentSeason.rankedTier, currentSeason.rankedSubTier)}
              </b>
            ) : null}
          </span>
        ) : (
          <span className="text-xs text-slate-300">Carrière pas encore synchronisée.</span>
        )}
        {goldMedals > 0 ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-300">
            <MedalIcon rank={1} size={14} />
            {goldMedals} médaille{goldMedals > 1 ? 's' : ''} d’or dans le clan
          </span>
        ) : null}
      </span>
      <span className="shrink-0 text-xs font-bold text-indigo-300">Voir →</span>
    </Link>
  )
}

const CALENDAR_LEVEL = [
  'bg-gray-100',
  'bg-[color-mix(in_srgb,var(--theme-ui-accent)_25%,transparent)]',
  'bg-[color-mix(in_srgb,var(--theme-ui-accent)_50%,transparent)]',
  'bg-[color-mix(in_srgb,var(--theme-ui-accent)_75%,transparent)]',
  'bg-[var(--theme-ui-accent)]',
] as const
const WEEKDAY_HEAD = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const LONG_DATE = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

export function CalendarCard({
  calendar,
}: {
  calendar: { cells: CalendarCell[]; playedDays: number; elapsedDays: number; favouriteDay: string | null; favouriteSlot: string | null } | null
}) {
  return (
    <section aria-labelledby="calendar-title" className="app-panel flex flex-col gap-2.5 p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="calendar-title" className="text-[15px] font-extrabold text-gray-900">Calendrier</h2>
        <span className="text-xs text-gray-500">5 dernières semaines</span>
      </div>
      {calendar ? (
        <>
          <div className="grid grid-cols-7 gap-1" aria-hidden="true">
            {WEEKDAY_HEAD.map((day, index) => (
              <span key={index} className="text-center text-[10px] font-extrabold text-gray-500">
                {day}
              </span>
            ))}
          </div>
          <ol className="grid grid-cols-7 gap-1" aria-label="Parties par jour">
            {calendar.cells.map((cell) => {
              const title = `${LONG_DATE.format(new Date(`${cell.date}T00:00:00Z`))} : ${cell.games} partie${cell.games > 1 ? 's' : ''}${cell.wins > 0 ? ` · ${cell.wins} top 1` : ''}`
              return (
                <li
                  key={cell.date}
                  title={cell.future ? undefined : title}
                  aria-label={cell.future ? undefined : title}
                  data-games={cell.games}
                  data-in-period={cell.inPeriod ? 'true' : 'false'}
                  className={`relative grid h-7 place-items-center rounded-md text-[10px] font-bold tabular-nums ${
                    cell.future ? 'border border-gray-200 opacity-35' : `${CALENDAR_LEVEL[cell.level]} ${cell.inPeriod ? '' : 'opacity-35'}`
                  } ${cell.today ? 'ring-2 ring-inset ring-[var(--theme-ui-text)]' : ''} ${cell.level >= 3 ? 'text-white' : 'text-gray-500'}`}
                >
                  {cell.future ? '' : cell.dayOfMonth}
                  {!cell.future && cell.wins > 0 ? (
                    <span className="absolute -right-[3px] -top-[3px] h-[9px] w-[9px] rounded-full border-2 border-[var(--theme-ui-surface)] bg-amber-400" data-testid="calendar-win" aria-hidden="true" />
                  ) : null}
                </li>
              )
            })}
          </ol>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500" aria-hidden="true">
            <span>0</span>
            {CALENDAR_LEVEL.slice(1).map((level) => (
              <span key={level} className={`h-3 w-3 rounded-[3px] ${level}`} />
            ))}
            <span>6+ parties</span>
            <span className="ml-2 inline-flex items-center gap-1">
              <span className="h-[9px] w-[9px] rounded-full bg-amber-400" />
              top 1
            </span>
          </div>
          <dl className="grid grid-cols-3 gap-2 border-t border-gray-200 pt-2.5 tabular-nums">
            {[
              [`${calendar.playedDays} jour${calendar.playedDays > 1 ? 's' : ''}`, `joués sur ${calendar.elapsedDays}`],
              [calendar.favouriteDay ?? '—', 'jour favori'],
              [calendar.favouriteSlot ?? '—', 'créneau favori'],
            ].map(([value, label]) => (
              <div key={label} className="flex flex-col-reverse">
                <dt className="text-[11px] text-gray-500">{label}</dt>
                <dd className="text-sm font-bold text-gray-900">{value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p className="text-[13px] text-gray-500">Chargement du calendrier…</p>
      )}
    </section>
  )
}
