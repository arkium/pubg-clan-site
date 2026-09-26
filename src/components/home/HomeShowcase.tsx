'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Teko } from 'next/font/google'
import { ChevronLeft, ChevronRight, LogIn, Menu, Plane, User, X } from 'lucide-react'

import MatchTypeBadge from '@/components/ui/MatchTypeBadge'
import TeamModeBadge from '@/components/ui/TeamModeBadge'
import { useHomeShowcase } from '@/hooks/useHomeShowcase'
import { formatMatchDuration, type ShowcaseDinner, type ShowcaseFeedEntry } from '@/lib/home-showcase'
import { getPeriodStart } from '@/lib/period'

/**
 * Vitrine publique de chickendinner.fr (`/`, visiteurs non connectés) — docs/features/accueil.md.
 * Maquette : Claude Design « Accueil chickendinner.dc.html » (écrans 4a à 4d).
 *
 * Plein écran, sans le shell : héros de jeu (boussole, compteurs, kill feed), Top 1 récents en carrousel, appel à
 * rejoindre. Le héros et le bandeau « Rejoindre » sont sombres par construction (photo) ; le reste suit le thème.
 * Affichée à tous : un membre connecté (`accountHref`) y trouve « Mon espace » au lieu de « Se connecter ».
 */

const teko = Teko({ subsets: ['latin'], weight: ['400', '500', '600'], display: 'swap', variable: '--font-teko' })

const HERO_IMAGE = '/5ec73c01-216b-4991-99cf-5ac7fdbaff30.jpg'
const FEED_VISIBLE = 5
const FEED_INTERVAL_MS = 2400
const COMPASS = ['N', '15', '30', 'NE', '60', '75', 'E', '105', '120', 'SE', '150', '165', 'S', '195', '210', 'SO', '240', '255', 'O', '285', '300', 'NO', '330', '345']

const NAV_LINKS = [
  { href: '/clans-leaderboard', label: 'Ligue des clans' },
  { href: '/clans/comparator', label: 'Comparateur' },
  { href: '/tournaments', label: 'Tournois' },
]

const JOIN_STEPS = [
  { title: 'Donne ton pseudo PUBG', text: 'On retrouve ton compte et le clan PUBG auquel il appartient.' },
  {
    title: 'Rejoins ton clan ou fais-le suivre',
    text: 'Ton clan est déjà ici : demande à le rejoindre. Sinon, propose-le, un administrateur valide.',
  },
  { title: 'Tes stats arrivent ici', text: 'Kills, drops, armes, top 1 : ton tableau de bord se remplit tout seul.' },
]

const numberFormat = new Intl.NumberFormat('fr-FR')
const dayFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

function formatPlayedAt(value: string) {
  const date = new Date(value)
  return `${dayFormat.format(date)} · ${timeFormat.format(date)}`
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}

/** Fenêtre glissante de `FEED_VISIBLE` entrées ; une nouvelle entre toutes les `FEED_INTERVAL_MS`. */
function useRotatingFeed(entries: readonly ShowcaseFeedEntry[], paused: boolean) {
  const [offset, setOffset] = useState(0)
  useEffect(() => {
    if (paused || entries.length <= FEED_VISIBLE) return
    const timer = window.setInterval(() => setOffset((value) => value + 1), FEED_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [entries.length, paused])

  return useMemo(() => {
    if (entries.length === 0) return []
    const count = Math.min(FEED_VISIBLE, entries.length)
    return Array.from({ length: count }, (_, index) => {
      const position = offset + index
      return { entry: entries[position % entries.length], key: `${position}` }
    })
  }, [entries, offset])
}

function KillFeed({ entries, mobile, paused }: { entries: readonly ShowcaseFeedEntry[]; mobile?: boolean; paused: boolean }) {
  const rows = useRotatingFeed(entries, paused)
  return (
    <ol className={`flex w-full flex-col gap-1 ${mobile ? 'items-stretch' : 'items-end'}`} aria-label="Kill feed des dernières victoires">
      {rows.map(({ entry, key }, index) => {
        const last = index === rows.length - 1
        const base = `home-feed-row flex min-w-0 items-center overflow-hidden whitespace-nowrap rounded ${
          mobile ? 'gap-1.5 px-2 py-[5px] text-xs' : 'gap-2 px-2.5 py-[5px] text-[13px]'
        } ${last && !paused ? 'home-feed-enter' : ''}`
        const style = { opacity: 0.55 + (index * 0.45) / Math.max(1, rows.length - 1) }
        if (entry.kind === 'win') {
          return (
            <li key={key} className={`${base} home-feed-win font-bold`} style={style}>
              <span className="home-display text-[17px] leading-[14px]">#1</span>
              <span className="truncate">
                [{entry.clanTag}] — Chicken Dinner sur {entry.mapLabel}
              </span>
            </li>
          )
        }
        return (
          <li key={key} className={`${base} home-feed-kill`} style={style}>
            <span className="shrink-0 font-bold text-amber-200">
              {/* Sur mobile, la ligne est trop courte : le tag du tueur laisse sa place à la victime. */}
              {entry.killerClanTag && !mobile ? <span className="font-semibold text-white/60">[{entry.killerClanTag}] </span> : null}
              {entry.killer}
            </span>
            <span className="home-feed-weapon shrink-0 rounded-[3px] px-1.5 text-[11px] font-semibold">
              {entry.weapon}
              {entry.headshot ? ' ✚ tête' : ''}
            </span>
            <span className="min-w-0 truncate text-white/90">
              {entry.victimClanTag ? `un joueur [${entry.victimClanTag}]` : 'un adversaire'}
            </span>
            {entry.distanceMeters !== null ? (
              <span className="ml-auto shrink-0 pl-2 text-[11px] tabular-nums text-white/55">{entry.distanceMeters} m</span>
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

function Compass() {
  const strip = [...COMPASS, ...COMPASS]
  return (
    <div className="home-compass home-display relative h-[34px] overflow-hidden" aria-hidden="true">
      <div className="home-compass-strip flex" style={{ width: 38 * strip.length }}>
        {strip.map((label, index) => {
          const cardinal = /[A-Z]/.test(label)
          return (
            <span
              key={index}
              className={`w-[38px] shrink-0 text-center ${cardinal ? 'text-xl font-semibold' : 'text-sm'} ${
                label === 'N' ? 'text-amber-400' : 'text-white/85'
              }`}
            >
              {label}
            </span>
          )
        })}
      </div>
      <div className="absolute bottom-0 left-1/2 -ml-px h-2 w-0.5 bg-amber-400" />
    </div>
  )
}

function StatPill({ value, label, highlight }: { value: string; label: string; highlight?: boolean }) {
  return (
    <span
      className={`home-display inline-flex items-baseline gap-1.5 rounded px-3 py-0.5 ${
        highlight ? 'bg-amber-400/90 text-amber-950' : 'bg-slate-950/60 text-white'
      }`}
    >
      <b className="text-[26px] font-semibold">{value}</b>
      <span className={`text-[15px] tracking-[0.08em] ${highlight ? '' : 'text-white/70'}`}>{label}</span>
    </span>
  )
}

function DinnerCard({ dinner }: { dinner: ShowcaseDinner }) {
  const duration = formatMatchDuration(dinner.durationSeconds)
  return (
    <div className="app-panel grid overflow-hidden p-0 md:grid-cols-2" data-testid="home-dinner">
      <div
        className="relative min-h-[300px] bg-cover bg-center md:min-h-[340px]"
        style={{ backgroundImage: `url(${dinner.mapImage ?? HERO_IMAGE})`, backgroundColor: '#0b1120' }}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/15 to-slate-950/85" />
        <div className="absolute left-4 top-4 flex flex-wrap items-center gap-1.5 rounded-full bg-slate-950/60 py-1 pl-1 pr-3 text-xs font-semibold text-white">
          <TeamModeBadge mode={dinner.teamMode} size="xs" />
          <Link href={`/clans/${dinner.clanId}/overview`} className="text-white hover:text-amber-200">
            [{dinner.clanTag}] {dinner.clanName}
          </Link>
          <MatchTypeBadge matchType={dinner.matchType} />
        </div>
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 px-6 py-5 text-white">
          <span className="home-display text-[30px] font-semibold uppercase leading-[0.9] text-amber-400 [text-shadow:0_2px_16px_rgba(0,0,0,.5)] lg:text-[42px]">
            Winner winner
            <br />
            chicken dinner !
          </span>
          <span className="home-display flex items-baseline gap-3.5 leading-none">
            <span className="text-[56px] font-semibold">#1</span>
            {dinner.teamCount ? <span className="text-2xl text-white/70">/ {dinner.teamCount}</span> : null}
          </span>
          <span className="text-[13px] text-white/80">
            {[dinner.mapLabel, formatPlayedAt(dinner.playedAt), duration].filter(Boolean).join(' · ')}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-[18px] p-5 lg:p-7">
        <dl className="grid grid-cols-3 gap-2.5">
          {[
            { label: 'Kills équipe', value: numberFormat.format(dinner.kills) },
            { label: 'Dégâts', value: numberFormat.format(dinner.damage) },
            { label: 'Kill le + long', value: dinner.longestKillMeters > 0 ? `${dinner.longestKillMeters} m` : '—' },
          ].map((stat) => (
            <div key={stat.label} className="app-panel-muted p-3">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-500">{stat.label}</dt>
              <dd className="home-display mt-0.5 text-4xl font-semibold leading-none">{stat.value}</dd>
            </div>
          ))}
        </dl>

        <ul className="flex flex-col">
          {dinner.squad.map((member) => {
            const detail =
              member.weapons.length > 0
                ? member.weapons.join(' · ')
                : member.revives > 0
                  ? `${member.revives} réanimation${member.revives > 1 ? 's' : ''}`
                  : null
            return (
              <li key={member.memberId} className="home-squad-row flex items-center gap-3 py-2.5">
                <span className="app-panel-muted inline-flex h-9 w-9 shrink-0 items-center justify-center text-[13px] font-bold">
                  {member.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                    <Link href={`/members/${member.memberId}/dashboard`} className="truncate hover:underline">
                      {member.name}
                    </Link>
                    {member.mvp ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src="/icons/distinctions/mvp.svg" width={16} height={16} alt="MVP" title="MVP de la partie" />
                    ) : null}
                  </p>
                  {detail ? <p className="truncate text-xs text-gray-500">{detail}</p> : null}
                </div>
                <div className="text-right tabular-nums">
                  <p className="text-[15px] font-bold">
                    {member.kills} <span className="text-[11px] font-semibold text-gray-500">KILLS</span>
                  </p>
                  <p className="text-xs text-gray-500">{numberFormat.format(member.damage)} dégâts</p>
                </div>
              </li>
            )
          })}
        </ul>

        <Link href={dinner.debriefPath} className="home-link self-start text-sm font-semibold">
          Revoir la partie (débrief + trajectoires) →
        </Link>
      </div>
    </div>
  )
}

function DinnerSection({
  dinners,
  loading,
  error,
  isoWeek,
  weekWins,
}: {
  dinners: readonly ShowcaseDinner[]
  loading: boolean
  error: string
  isoWeek: number | null
  weekWins: number | null
}) {
  const [index, setIndex] = useState(0)
  const current = dinners.length > 0 ? dinners[index % dinners.length] : null
  const weekStart = getPeriodStart('week')
  const allThisWeek = dinners.length > 0 && weekStart !== null && dinners.every((d) => new Date(d.playedAt) >= weekStart)
  const move = (step: number) => setIndex((value) => (value + step + dinners.length) % dinners.length)

  return (
    <section className="px-4 pt-10 md:px-8 md:pt-16 lg:px-14 lg:pt-20" aria-labelledby="home-dinner-title">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="home-gold text-xs font-bold uppercase tracking-[0.14em]">
              {isoWeek !== null ? `Semaine ${isoWeek}` : 'Cette semaine'}
              {weekWins !== null ? ` · ${numberFormat.format(weekWins)} top 1` : ''}
            </span>
            <h2 id="home-dinner-title" className="home-display m-0 text-[38px] font-semibold uppercase leading-[0.95] lg:text-[56px]">
              {allThisWeek || dinners.length === 0 ? 'Chicken Dinner de la semaine' : 'Derniers Chicken Dinners'}
            </h2>
          </div>
          {dinners.length > 1 ? (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => move(-1)} aria-label="Top 1 précédent" className="home-carousel-btn">
                <ChevronLeft className="h-5 w-5" aria-hidden="true" />
              </button>
              <span className="home-display min-w-[54px] text-center text-[22px] text-gray-500" aria-live="polite">
                {(index % dinners.length) + 1} / {dinners.length}
              </span>
              <button type="button" onClick={() => move(1)} aria-label="Top 1 suivant" className="home-carousel-btn">
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>

        {current ? (
          <div className={loading ? 'opacity-60 transition-opacity' : undefined}>
            <DinnerCard dinner={current} />
          </div>
        ) : (
          <div className="app-panel flex min-h-[200px] items-center justify-center p-6 text-center text-sm text-gray-500">
            {loading
              ? 'Chargement des derniers Top 1…'
              : error
                ? 'Les derniers Top 1 sont momentanément indisponibles.'
                : 'Aucun Top 1 pour l’instant : la semaine ne fait que commencer.'}
          </div>
        )}
      </div>
    </section>
  )
}

export default function HomeShowcase({
  visitorMode,
  accountHref,
}: {
  visitorMode: boolean
  /** Tableau de bord du membre connecté ; `null` pour un visiteur. */
  accountHref: string | null
}) {
  const { data, loading, error } = useHomeShowcase()
  const reducedMotion = usePrefersReducedMotion()
  const [menuOpen, setMenuOpen] = useState(false)
  const feed = data?.killFeed ?? []
  const stats = data?.stats ?? null
  const year = new Date().getFullYear()

  return (
    <div className={`home-showcase ${teko.variable} w-full`}>
      {/* HÉROS */}
      <section className="home-hero relative overflow-hidden text-white">
        <div
          className="home-hero-bg absolute bg-cover bg-no-repeat"
          style={{ backgroundImage: `url(${HERO_IMAGE})` }}
          aria-hidden="true"
        />
        <div className="home-hero-shade absolute inset-0" aria-hidden="true" />

        <header className="absolute inset-x-0 top-0 z-[3] flex items-center gap-4 px-4 py-3 md:px-8 lg:px-14 lg:py-5">
          <Link href="/" className="flex items-center text-white">
            <span className="home-display whitespace-nowrap text-[22px] font-semibold leading-none tracking-[0.02em] lg:text-[28px]">
              chickendinner<span className="text-amber-400">.fr</span>
            </span>
          </Link>
          <nav className="ml-6 hidden gap-1 lg:flex" aria-label="Navigation publique">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="home-hero-link rounded-lg px-3 py-2 text-sm font-medium">
                {link.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href={accountHref ?? '/login'}
              className="home-glass hidden h-[38px] items-center rounded-[10px] px-3.5 text-sm font-semibold text-white lg:inline-flex"
            >
              {accountHref ? 'Mon espace' : 'Se connecter'}
            </Link>
            <Link
              href={accountHref ?? '/login'}
              aria-label={accountHref ? 'Mon espace' : 'Se connecter'}
              className="home-glass inline-flex h-[38px] w-[38px] items-center justify-center rounded-[10px] text-white lg:hidden"
            >
              {accountHref ? (
                <User className="h-[18px] w-[18px]" aria-hidden="true" />
              ) : (
                <LogIn className="h-[18px] w-[18px]" aria-hidden="true" />
              )}
            </Link>
            <a href="#rejoindre" className="hidden h-[38px] items-center rounded-[10px] bg-amber-400 px-4 text-sm font-bold text-amber-950 hover:bg-amber-300 lg:inline-flex">
              Rejoindre
            </a>
            <button
              type="button"
              className="home-glass inline-flex h-[38px] w-[38px] items-center justify-center rounded-[10px] text-white lg:hidden"
              aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
              aria-expanded={menuOpen}
              aria-controls="home-mobile-menu"
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X className="h-[18px] w-[18px]" aria-hidden="true" /> : <Menu className="h-[18px] w-[18px]" aria-hidden="true" />}
            </button>
          </div>
        </header>

        {menuOpen ? (
          <nav
            id="home-mobile-menu"
            aria-label="Navigation publique"
            className="absolute inset-x-4 top-[62px] z-[4] flex flex-col gap-1 rounded-xl bg-slate-950/90 p-2 backdrop-blur lg:hidden"
          >
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="home-hero-link rounded-lg px-3 py-2.5 text-sm font-medium">
                {link.label}
              </Link>
            ))}
            <a href="#rejoindre" onClick={() => setMenuOpen(false)} className="rounded-lg px-3 py-2.5 text-sm font-bold text-amber-300">
              Rejoindre
            </a>
          </nav>
        ) : null}

        <div className="absolute left-1/2 top-16 z-[2] w-[min(460px,60vw)] min-w-[240px] -translate-x-1/2 lg:top-[84px]">
          <Compass />
        </div>

        <div className="absolute right-14 top-[124px] z-[2] hidden w-[380px] flex-col items-end gap-2.5 lg:flex">
          <div className="flex gap-1.5">
            <StatPill value={stats ? numberFormat.format(stats.players) : '—'} label="JOUEURS" />
            <StatPill value={stats ? numberFormat.format(stats.weekKills) : '—'} label="KILLS CETTE SEMAINE" highlight />
          </div>
          <KillFeed entries={feed} paused={reducedMotion} />
        </div>

        <div className="absolute inset-x-4 bottom-7 z-[2] flex max-w-[720px] flex-col gap-3.5 md:inset-x-8 lg:inset-x-14 lg:bottom-16 lg:gap-5">
          <span className="inline-flex items-center gap-2 self-start rounded-full border border-amber-400/50 bg-slate-950/55 px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.06em] text-amber-200">
            <span className="h-[7px] w-[7px] rounded-full bg-emerald-400" aria-hidden="true" />
            {stats ? `${numberFormat.format(stats.clans)} clans suivis` : 'Clans PUBG'} · PC
          </span>
          <h1 className="home-display m-0 text-[52px] font-semibold uppercase leading-[0.86] tracking-[0.005em] [text-shadow:0_4px_30px_rgba(0,0,0,.45)] md:text-[80px] lg:text-[112px]">
            Winner winner,
            <br />
            <span className="text-amber-400">chicken dinner.</span>
          </h1>
          <p className="m-0 max-w-[560px] text-[15px] leading-normal text-white/90 lg:text-[19px]">
            Le QG des clans PUBG : chaque partie importée, chaque kill compté, chaque top 1 fêté. Stats, classements et
            soirées squad au même endroit.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <a
              href="#rejoindre"
              className="relative inline-flex h-12 items-center gap-2 rounded-xl bg-amber-400 px-[22px] text-base font-bold text-amber-950 hover:bg-amber-300"
            >
              <span className="home-cta-glow absolute -inset-1 rounded-2xl" aria-hidden="true" />
              <Plane className="relative h-[18px] w-[18px]" aria-hidden="true" />
              <span className="relative">Rejoindre le squad</span>
            </a>
            <Link
              href="/clans-leaderboard"
              className="home-glass inline-flex h-12 items-center rounded-xl px-5 text-[15px] font-semibold text-white"
            >
              Voir le classement
            </Link>
          </div>
        </div>
      </section>

      {/* KILL FEED — mobile et tablette */}
      <section className="px-4 pt-4 md:px-8 lg:hidden" aria-label="Kill feed">
        <div className="home-feed-card flex flex-col gap-2.5 rounded-[14px] p-3 text-white">
          <div className="flex items-center justify-between">
            <span className="home-display text-xl tracking-[0.08em] text-amber-200">KILL FEED</span>
            <span className="home-display text-lg text-white/70">
              <b className="text-white">{stats ? numberFormat.format(stats.weekKills) : '—'}</b> KILLS CETTE SEMAINE
            </span>
          </div>
          {feed.length > 0 ? (
            <KillFeed entries={feed} mobile paused={reducedMotion} />
          ) : (
            <p className="text-xs text-white/60">{loading ? 'Chargement…' : 'Aucun kill à afficher pour l’instant.'}</p>
          )}
        </div>
      </section>

      <DinnerSection
        dinners={data?.dinners ?? []}
        loading={loading}
        error={error}
        isoWeek={stats?.isoWeek ?? null}
        weekWins={stats?.weekWins ?? null}
      />

      {/* REJOINDRE */}
      <section id="rejoindre" className="scroll-mt-4 px-4 py-10 md:px-8 md:py-16 lg:px-14 lg:py-20">
        <div className="home-join relative mx-auto max-w-[1200px] overflow-hidden rounded-[22px] text-white">
          <div className="home-join-bg absolute inset-0 bg-cover bg-no-repeat" style={{ backgroundImage: `url(${HERO_IMAGE})` }} aria-hidden="true" />
          <div className="home-join-shade absolute inset-0" aria-hidden="true" />
          <div className="relative flex max-w-[640px] flex-col gap-[22px] p-6 md:p-10 lg:p-14">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-amber-400">Recrutement ouvert</span>
            <h2 className="home-display m-0 text-[40px] font-semibold uppercase leading-[0.92] lg:text-[64px]">
              Il reste une place
              <br />
              dans l&apos;avion.
            </h2>
            <ol className="flex flex-col gap-3">
              {JOIN_STEPS.map((step, index) => (
                <li key={step.title} className="flex items-start gap-3.5">
                  <span className="home-display inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] border border-amber-400/55 bg-amber-400/10 text-[22px] text-amber-200">
                    {index + 1}
                  </span>
                  <div>
                    <p className="m-0 text-[15px] font-bold">{step.title}</p>
                    <p className="m-0 mt-0.5 text-sm leading-normal text-white/75">{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-2.5">
              <Link
                href="/join"
                className="inline-flex h-12 items-center gap-2 rounded-xl bg-amber-400 px-[22px] text-base font-bold text-amber-950 hover:bg-amber-300"
              >
                Demander à rejoindre
              </Link>
              {accountHref || visitorMode ? (
                <Link
                  href="/clans"
                  className="inline-flex h-12 items-center rounded-xl border border-white/25 px-[18px] text-[15px] font-semibold text-white hover:bg-white/10"
                >
                  {accountHref ? 'Voir les clans' : 'Parcourir en visiteur'}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <footer className="home-footer flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5 px-4 py-[22px] text-[13px] text-gray-500 md:px-8 lg:px-14">
        <span>
          <b className="home-footer-brand">chickendinner.fr</b> · © {year} Arkium
        </span>
        <span>PUBG: BATTLEGROUNDS est une marque de KRAFTON, Inc. Site communautaire non officiel.</span>
      </footer>
    </div>
  )
}
