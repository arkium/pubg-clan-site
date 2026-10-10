'use client'

/* eslint-disable @next/next/no-img-element */
import Link from 'next/link'
import type { CSSProperties } from 'react'
import { ArrowRight } from 'lucide-react'

import type { HomeShowcaseStats, ShowcaseClan } from '@/lib/home-showcase'

/**
 * Hub des clans — fin de la vitrine, après « Lecture de zone » (docs/features/accueil.md). Maquette Claude Design
 * « Accueil - Bandeau clans.dc.html », variante 1a « Bande de largage » (1c en clair, 1e en mobile) : la vitrine parle
 * surtout d'un squad, ce bandeau dit en une seconde que le site réunit TOUS les clans.
 *
 * Toujours sombre, comme le héros. Deux bandes inclinées qui se croisent et défilent en sens opposés : la jaune porte
 * logo, nom, tag et rang en Ligue ; la noire, bordée de rayures de balisage, Power score, parties et tendance. Chiffres
 * de la Ligue de la semaine, parties Normal (décision du 2026-10-10) ; tous les clans suivis, les non classés après.
 * Défilement continu, en pause au survol ou au clavier, figé si l'appareil limite les animations (`globals.css`).
 *
 * Accessibilité : la bande jaune est la liste des clans (un lien par clan, chiffres en texte masqué) ; sa copie de
 * bouclage et la bande noire, redondantes, sont masquées aux lecteurs d'écran et hors tabulation.
 */

const numberFormat = new Intl.NumberFormat('fr-FR')
const DEFAULT_LOGO = '/pubg.png'
/** Durée d'un tour par clan : la vitesse reste la même quel que soit le nombre de clans. */
const SECONDS_PER_CLAN = 4

function plural(count: number, word: string) {
  return `${numberFormat.format(count)} ${word}${count > 1 ? 's' : ''}`
}

/** Chiffres de la bande noire et du texte masqué. */
function leagueLine(clan: ShowcaseClan) {
  const league = clan.league
  if (league.status === 'ranked') return `${numberFormat.format(league.powerScore)} PS · ${plural(league.matches, 'partie')}`
  if (league.status === 'qualifying') return `En qualification · ${league.matches} / ${plural(league.required, 'partie')}`
  return 'Pas encore de partie cette semaine'
}

/** Tendance depuis la semaine dernière ; rien quand elle n'existe pas (clan non classé alors). */
function Trend({ clan }: { clan: ShowcaseClan }) {
  if (clan.league.status !== 'ranked' || clan.league.rankDelta === null) return null
  const delta = clan.league.rankDelta
  if (delta === 0) return <span className="text-white/55">=</span>
  return delta > 0 ? <span className="text-emerald-400">▲{delta}</span> : <span className="text-red-400">▼{-delta}</span>
}

function srSummary(clan: ShowcaseClan) {
  const league = clan.league
  if (league.status !== 'ranked') return leagueLine(clan)
  const trend =
    league.rankDelta === null
      ? ''
      : league.rankDelta === 0
        ? ', même rang que la semaine dernière'
        : `, ${league.rankDelta > 0 ? '+' : '−'}${plural(Math.abs(league.rankDelta), 'place')} depuis la semaine dernière`
  return `${league.rank}e de la Ligue, ${leagueLine(clan)}${trend}`
}

function ClanLogo({ src }: { src: string | null }) {
  return (
    <img
      src={src ?? DEFAULT_LOGO}
      alt=""
      loading="lazy"
      className="home-hub-logo"
      onError={(event) => {
        if (!event.currentTarget.src.endsWith(DEFAULT_LOGO)) event.currentTarget.src = DEFAULT_LOGO
      }}
    />
  )
}

function YellowItem({ clan, copy }: { clan: ShowcaseClan; copy: boolean }) {
  return (
    <li className="home-hub-item">
      <Link href={clan.overviewPath} tabIndex={copy ? -1 : undefined} className="home-hub-clan">
        <ClanLogo src={clan.logoUrl} />
        <span className="home-display home-hub-name">{clan.name}</span>
        <span className="home-hub-tag">[{clan.tag}]</span>
        {clan.league.status === 'ranked' ? <span className="home-hub-rank">#{clan.league.rank} Ligue</span> : null}
        {copy ? null : <span className="sr-only"> — {srSummary(clan)}</span>}
      </Link>
      <span className="home-hub-diamond" aria-hidden="true">
        ◆
      </span>
    </li>
  )
}

function DarkItem({ clan }: { clan: ShowcaseClan }) {
  return (
    <li className="home-hub-item home-hub-item--dark">
      <Link href={clan.overviewPath} tabIndex={-1} className="home-hub-clan">
        <span className="home-display home-hub-name">{clan.name}</span>
        <span className="home-hub-stats">{leagueLine(clan)}</span>
        <span className="home-hub-stats font-bold">
          <Trend clan={clan} />
        </span>
      </Link>
    </li>
  )
}

/** Une bande : la liste et sa copie à la suite, la piste glisse d'une longueur de liste (`globals.css`). */
function Band({ clans, variant }: { clans: readonly ShowcaseClan[]; variant: 'yellow' | 'dark' }) {
  const style = { '--home-hub-duration': `${Math.max(30, clans.length * SECONDS_PER_CLAN)}s` } as CSSProperties
  return (
    <div className={`home-hub-band home-hub-band--${variant}`} aria-hidden={variant === 'dark' ? true : undefined} data-testid={`home-hub-band-${variant}`}>
      <div className="home-hub-track" style={style}>
        {[false, true].map((copy) => (
          <ul
            key={String(copy)}
            className="home-hub-row"
            aria-hidden={copy && variant === 'yellow' ? true : undefined}
            aria-label={!copy && variant === 'yellow' ? 'Clans suivis sur chickendinner.fr' : undefined}
          >
            {clans.map((clan) =>
              variant === 'yellow' ? <YellowItem key={clan.clanId} clan={clan} copy={copy} /> : <DarkItem key={clan.clanId} clan={clan} />
            )}
          </ul>
        ))}
      </div>
    </div>
  )
}

function Counter({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col-reverse gap-1 border-l-2 border-amber-400 pl-3">
      <dt className="text-[11px] font-bold uppercase leading-tight tracking-[0.1em] text-white/70">{label}</dt>
      <dd className="home-display m-0 text-[34px] font-semibold leading-none lg:text-[44px]">{numberFormat.format(value)}</dd>
    </div>
  )
}

export function HomeClansHub({ clans, stats }: { clans: readonly ShowcaseClan[]; stats: HomeShowcaseStats | null }) {
  if (clans.length === 0 || !stats) return null

  return (
    <section className="home-hub relative overflow-hidden text-white" aria-labelledby="home-hub-title" data-testid="home-clans-hub">
      <div className="px-4 pt-12 md:px-8 md:pt-16 lg:px-14 lg:pt-20">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex max-w-[560px] flex-col gap-4">
            <span className="-rotate-2 self-start rounded-[5px] bg-amber-400 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.06em] text-amber-950">
              Le hub des clans PUBG FR
            </span>
            <h2 id="home-hub-title" className="home-display m-0 text-[44px] font-semibold uppercase leading-[0.9] lg:text-[72px]">
              Pas un clan.
              <br />
              <span className="text-amber-400">Tous les clans.</span>
            </h2>
            <p className="m-0 text-[15px] leading-normal text-white/80">
              chickendinner.fr réunit les clans francophones et analyse leurs parties : classement commun, stats de chaque
              joueur, tournois entre clans.
            </p>
          </div>
          <dl className="m-0 grid grid-cols-3 gap-3 lg:flex lg:gap-8" data-testid="home-hub-counters">
            <Counter value={stats.clans} label="Clans suivis" />
            <Counter value={stats.players} label="Joueurs" />
            <Counter value={stats.analyzedMatches} label="Parties analysées" />
          </dl>
        </div>
      </div>

      <div className="home-hub-bands my-10 lg:my-14">
        <Band clans={clans} variant="yellow" />
        <Band clans={clans} variant="dark" />
      </div>

      <div className="px-4 pb-12 md:px-8 md:pb-16 lg:px-14 lg:pb-20">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-5">
          <p className="m-0 font-mono text-[12px] text-white/55">
            Rang, Power score (PS) et parties : Ligue des clans de la semaine {stats.isoWeek}, parties Normal ; tendance
            depuis la semaine dernière.
          </p>
          <div className="flex flex-wrap gap-2.5">
            <Link
              href="/clans"
              className="inline-flex h-12 items-center gap-2 rounded-xl bg-amber-400 px-[22px] text-base font-bold text-amber-950 hover:bg-amber-300"
            >
              Explorer l’annuaire des clans
              <ArrowRight className="h-[18px] w-[18px]" aria-hidden="true" />
            </Link>
            <Link
              href="/clans-leaderboard"
              className="inline-flex h-12 items-center rounded-xl border border-white/25 px-[18px] text-[15px] font-semibold text-white hover:bg-white/10"
            >
              Voir la Ligue
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
