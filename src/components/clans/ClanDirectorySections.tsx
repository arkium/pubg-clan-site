'use client'

import { useState } from 'react'
import { ChevronRight, Medal, Pin, Trophy } from 'lucide-react'

import PlaystyleBadge, { playstyleLabel } from '@/components/ui/PlaystyleBadge'
import { clanBackgroundImage } from '@/lib/clan-image'
import { frDecimal } from '@/lib/match-sessions'
import { relativeLastGame, type ClanStyle } from '@/lib/clan-directory'

/**
 * Sections de l'annuaire des clans (`/clans`) — refonte du 2026-09-26 (docs/features/clans.md §Annuaire, maquette
 * Claude Design « Clans », écrans 12a à 12e), charte UI du 2026-10-04 (docs/ui/index.html) : couleurs par jetons
 * `.game-ui` / `--theme-ui-*`, cartes photo en `.app-on-photo`, noms en Teko, tampon `app-stamp`, style de jeu du clan
 * (`PlaystyleBadge`).
 */

export type DirectoryClan = {
  id: number
  name: string
  tag: string
  imageUrl: string | null
  isSystem: boolean
  membersCount: number
  games7: number
  wins7: number
  playedTonight: number
  lastMatchAt: string | null
  leagueRank: number | null
  /** Style de jeu dominant depuis le début du suivi ; `null` sans assez de parties analysées. */
  style: ClanStyle | null
}

const numberFormat = new Intl.NumberFormat('fr-FR')
const percent = (value: number) => `${Math.round(value)} %`

/** Titre d'une carte qu'on ne peut pas ouvrir (membre sans droit de changer de clan, hors mode visiteur). */
const NOT_OPENABLE = 'Consultable par les membres de ce clan'

/** Détail du badge : les trois scores, comme les jauges de « Style de jeu du clan ». */
function styleTitle(style: ClanStyle) {
  return `Style de jeu du clan : ${playstyleLabel(style.id)} — agressivité ${percent(style.aggression)}, support ${percent(style.support)}, discipline de zone ${percent(style.zoneDiscipline)} (depuis le début du suivi, ${numberFormat.format(style.matches)} parties de ${style.members} joueur${style.members > 1 ? 's' : ''})`
}

/** Carte cliquable (`button`) ou simple bloc quand on ne peut pas ouvrir le clan. */
function CardShell({
  onOpen,
  className,
  style,
  label,
  children,
}: {
  onOpen?: () => void
  className: string
  style?: React.CSSProperties
  label?: string
  children: React.ReactNode
}) {
  if (onOpen) {
    return (
      <button type="button" onClick={onOpen} aria-label={label} className={className} style={style}>
        {children}
      </button>
    )
  }
  return (
    <div className={className} style={style} aria-label={label} title={NOT_OPENABLE}>
      {children}
    </div>
  )
}

function Pill({ children, gold }: { children: React.ReactNode; gold?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 text-[11px] font-bold"
      style={
        gold
          ? { background: 'var(--game-gold-soft)', borderColor: 'var(--game-gold-ring)', color: 'var(--game-gold)' }
          : { background: 'var(--theme-ui-surface-soft)', borderColor: 'var(--theme-ui-border)', color: 'var(--theme-ui-text-secondary)' }
      }
    >
      {children}
    </span>
  )
}

function Palmares({ clan }: { clan: DirectoryClan }) {
  if (!clan.wins7 && !clan.leagueRank && !clan.style) return null
  return (
    <span className="flex flex-wrap gap-1">
      {clan.style ? <PlaystyleBadge role={clan.style.id} title={styleTitle(clan.style)} /> : null}
      {clan.wins7 > 0 && (
        <Pill gold>
          <Trophy className="h-[11px] w-[11px]" aria-hidden="true" />
          {clan.wins7} top 1
        </Pill>
      )}
      {clan.leagueRank && (
        <Pill>
          <Medal className="h-[11px] w-[11px]" aria-hidden="true" />#{clan.leagueRank} Ligue
        </Pill>
      )}
    </span>
  )
}

/** Logo du clan (photo) : fond sombre fixe derrière l'image, dans les deux thèmes. */
const LOGO = 'bg-photo-fallback bg-cover bg-center'

/** Clan épinglé (« Mon clan » pour un connecté, « Dernier clan consulté » pour un visiteur). */
export function PinnedClanCard({ clan, label, onOpen }: { clan: DirectoryClan; label: string; onOpen?: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="t-label">{label}</span>
      <CardShell
        onOpen={onOpen}
        className={`app-on-photo ${LOGO} relative flex min-h-[200px] flex-col justify-end overflow-hidden rounded-[14px] border text-left text-white`}
        style={{
          backgroundImage: clanBackgroundImage(clan.imageUrl),
          borderColor: 'var(--theme-ui-accent-ring)',
          boxShadow: '0 0 0 3px var(--theme-ui-accent-soft)',
        }}
      >
        <span className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/50 to-slate-950/20" aria-hidden="true" />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-slate-950/60 px-2.5 py-0.5 text-[11px] font-bold">
          <Pin className="h-3 w-3 text-[var(--theme-ui-accent)]" aria-hidden="true" />
          Épinglé
        </span>
        {clan.playedTonight > 0 && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--game-pos-ring)] bg-[var(--game-pos-soft)] px-2.5 py-0.5 text-[11px] font-bold">
            <span className="h-[7px] w-[7px] rounded-full bg-[var(--game-pos)]" aria-hidden="true" />
            {clan.playedTonight} ce soir
          </span>
        )}
        <span className="relative flex flex-col gap-2.5 p-4">
          <span className="flex flex-wrap items-baseline gap-2">
            <b className="t-hero t-hero--md">{clan.name}</b>
            <span className="text-[13px] font-bold text-[var(--theme-ui-accent)]">[{clan.tag}]</span>
            {clan.style ? <PlaystyleBadge role={clan.style.id} title={styleTitle(clan.style)} size="md" /> : null}
          </span>
          <span className="flex flex-wrap gap-1.5 text-xs font-bold">
            {clan.wins7 > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[var(--game-gold-ring)] bg-[var(--game-gold-soft)] px-2.5 py-0.5 text-[var(--game-gold)]">
                <Trophy className="h-3 w-3" aria-hidden="true" />
                {clan.wins7} top 1 en 7 jours
              </span>
            )}
            {clan.leagueRank && (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/15 px-2.5 py-0.5">
                <Medal className="h-3 w-3" aria-hidden="true" />#{clan.leagueRank} Ligue
              </span>
            )}
            <span className="inline-flex items-center rounded-full border border-white/25 bg-white/15 px-2.5 py-0.5">
              {clan.games7} partie{clan.games7 > 1 ? 's' : ''} ensemble en 7 jours
            </span>
          </span>
          {onOpen && (
            // Bouton principal de la charte (accent), dans la carte cliquable : un span, pas un second bouton.
            <span className="app-btn app-btn--primary app-btn--xs self-start px-3.5 text-[13px]">
              Ouvrir {label === 'Mon clan' ? 'mon clan' : 'le clan'} →
            </span>
          )}
        </span>
      </CardShell>
    </div>
  )
}

/** Clan du moment : le plus en forme sur 7 jours. */
export function ClanOfMomentCard({ clan, leagueSize, onOpen }: { clan: DirectoryClan; leagueSize: number; onOpen?: () => void }) {
  const winRate = clan.games7 > 0 ? clan.wins7 / clan.games7 : 0
  return (
    <div className="flex flex-col gap-2">
      <span className="t-label t-gold">Clan du moment</span>
      <CardShell
        onOpen={onOpen}
        label={`Clan du moment : ${clan.name}`}
        className={`app-on-photo ${LOGO} relative flex min-h-[200px] flex-col justify-end overflow-hidden rounded-[14px] border text-left text-white`}
        style={{ backgroundImage: clanBackgroundImage(clan.imageUrl), borderColor: 'var(--game-gold-ring)' }}
      >
        <span className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/55 to-slate-950/15" aria-hidden="true" />
        <span className="app-stamp absolute left-3 top-3">En feu cette semaine</span>
        <span className="relative flex flex-col gap-2.5 p-4">
          <span className="flex flex-wrap items-baseline gap-2">
            <b className="t-hero t-hero--md">{clan.name}</b>
            <span className="text-[13px] font-bold text-[var(--theme-ui-accent)]">[{clan.tag}]</span>
            {clan.style ? <PlaystyleBadge role={clan.style.id} title={styleTitle(clan.style)} size="md" /> : null}
          </span>
          <dl className="grid grid-cols-3 gap-2">
            {[
              { value: numberFormat.format(clan.wins7), label: 'top 1 en 7 j', gold: true },
              { value: clan.leagueRank ? `#${clan.leagueRank}` : '—', label: `Ligue · sur ${leagueSize}` },
              { value: `${frDecimal(winRate * 100)} %`, label: 'win rate 7 j' },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col-reverse">
                <dt className="text-[11px] font-semibold uppercase text-white/70">{stat.label}</dt>
                <dd className={`t-hero t-hero--sm m-0 ${stat.gold ? 't-gold' : ''}`}>{stat.value}</dd>
              </div>
            ))}
          </dl>
        </span>
      </CardShell>
    </div>
  )
}

/** Carte compacte d'un clan actif — `h-full` : même hauteur que sa voisine de rangée quand l'une passe sur 2 lignes. */
export function ActiveClanCard({ clan, active, onOpen }: { clan: DirectoryClan; active: boolean; onOpen?: () => void }) {
  return (
    <CardShell
      onOpen={onOpen}
      className={`app-panel flex h-full w-full items-center gap-3 p-2.5 text-left transition-colors ${onOpen ? 'hover:bg-gray-50' : ''}`}
      style={active ? { borderColor: 'var(--theme-ui-accent-ring)' } : undefined}
    >
      <span
        className={`${LOGO} relative h-16 w-16 shrink-0 rounded-xl`}
        style={{ backgroundImage: clanBackgroundImage(clan.imageUrl) }}
        aria-hidden="true"
      >
        {clan.playedTonight > 0 && (
          <span
            className="absolute -right-1 -top-1 inline-flex items-center rounded-full border-2 bg-[var(--game-pos)] px-1.5 text-[11px] font-extrabold text-white"
            style={{ borderColor: 'var(--theme-ui-surface)' }}
            title={`${clan.playedTonight} joueur${clan.playedTonight > 1 ? 's ont' : ' a'} joué ce soir`}
          >
            ● {clan.playedTonight}
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <b className="truncate text-sm text-gray-900">{clan.name}</b>
          <span className="shrink-0 text-[11px] font-bold text-gray-500">[{clan.tag}]</span>
        </span>
        <span className="t-num text-xs text-gray-500">
          {numberFormat.format(clan.membersCount)} joueur{clan.membersCount > 1 ? 's' : ''} · {numberFormat.format(clan.games7)} partie
          {clan.games7 > 1 ? 's' : ''} ensemble en 7 j · dernière partie{' '}
          {relativeLastGame(clan.lastMatchAt)}
        </span>
        <Palmares clan={clan} />
      </span>
      {onOpen && <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />}
    </CardShell>
  )
}

/** Clans en sommeil (pas de partie depuis 14 jours) : liste repliée, grisée. */
export function SleepingClans({
  clans,
  onOpen,
  canOpen = () => true,
}: {
  clans: DirectoryClan[]
  onOpen: (clanId: number) => void
  canOpen?: (clanId: number) => boolean
}) {
  const [open, setOpen] = useState(false)
  if (clans.length === 0) return null
  return (
    <section className="flex flex-col gap-2.5" aria-label="Clans en sommeil">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex items-center gap-2 text-left">
        <span className="h-2 w-2 rounded-full bg-gray-400" aria-hidden="true" />
        <h2 className="t-section-title m-0 text-gray-700">En sommeil</h2>
        <span className="text-[13px] text-gray-500">
          {clans.length} clan{clans.length > 1 ? 's' : ''} · pas de partie depuis 14 jours
        </span>
        <span className="ml-auto text-xs font-semibold text-[var(--theme-ui-accent-text)]">{open ? 'Masquer' : 'Afficher'}</span>
      </button>
      {open && (
        <ul className="app-panel overflow-hidden p-0">
          {clans.map((clan) => (
            <li key={clan.id} className="border-b border-gray-200 last:border-b-0">
              <CardShell
                onOpen={canOpen(clan.id) ? () => onOpen(clan.id) : undefined}
                className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left opacity-80 hover:bg-gray-50 hover:opacity-100"
              >
                <span
                  className={`${LOGO} h-8 w-8 shrink-0 rounded-lg grayscale-[0.6]`}
                  style={{ backgroundImage: clanBackgroundImage(clan.imageUrl) }}
                  aria-hidden="true"
                />
                <b className="text-[13px] text-gray-900">{clan.name}</b>
                <span className="text-[11px] font-bold text-gray-500">[{clan.tag}]</span>
                <span className="ml-auto text-xs text-gray-500">dernière partie {relativeLastGame(clan.lastMatchAt)}</span>
              </CardShell>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
