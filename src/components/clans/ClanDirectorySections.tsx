'use client'

import { useState } from 'react'
import { ChevronRight, Medal, Pin, Trophy } from 'lucide-react'

import { DEFAULT_CLAN_IMAGE } from '@/components/clan-overview/ClanOverviewSections'
import { frDecimal } from '@/lib/match-sessions'
import { relativeLastGame } from '@/lib/clan-directory'

/**
 * Sections de l'annuaire des clans (`/clans`) — refonte du 2026-09-26 (docs/features/clans.md §Annuaire, maquette
 * Claude Design « Clans », écrans 12a à 12e). Couleurs par jetons `.game-ui` / `--theme-ui-*`.
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
}

const numberFormat = new Intl.NumberFormat('fr-FR')

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
  if (!clan.wins7 && !clan.leagueRank) return null
  return (
    <span className="flex flex-wrap gap-1">
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

/** Clan épinglé (« Mon clan » pour un connecté, « Dernier clan consulté » pour un visiteur). */
export function PinnedClanCard({ clan, label, onOpen }: { clan: DirectoryClan; label: string; onOpen: () => void }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-gray-500">{label}</span>
      <button
        type="button"
        onClick={onOpen}
        className="relative flex min-h-[200px] flex-col justify-end overflow-hidden rounded-2xl border bg-cover bg-center text-left text-white"
        style={{
          backgroundColor: '#0b1120',
          backgroundImage: `url('${clan.imageUrl ?? DEFAULT_CLAN_IMAGE}')`,
          borderColor: 'var(--theme-ui-accent-ring)',
          boxShadow: '0 0 0 3px var(--theme-ui-accent-soft)',
        }}
      >
        <span className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/50 to-slate-950/20" aria-hidden="true" />
        <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-slate-950/60 px-2.5 py-0.5 text-[11px] font-bold">
          <Pin className="h-3 w-3 text-indigo-300" aria-hidden="true" />
          Épinglé
        </span>
        {clan.playedTonight > 0 && (
          <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-emerald-400/60 bg-emerald-500/30 px-2.5 py-0.5 text-[11px] font-bold">
            <span className="h-[7px] w-[7px] rounded-full bg-emerald-400" aria-hidden="true" />
            {clan.playedTonight} ce soir
          </span>
        )}
        <span className="relative flex flex-col gap-2.5 p-4">
          <span className="flex items-baseline gap-2">
            <b className="text-2xl tracking-[-0.02em]">{clan.name}</b>
            <span className="text-[13px] font-bold text-amber-200">[{clan.tag}]</span>
          </span>
          <span className="flex flex-wrap gap-1.5 text-xs font-bold">
            {clan.wins7 > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/90 px-2.5 py-0.5 text-amber-950">
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
          <span className="inline-flex h-8 items-center self-start rounded-[9px] px-3.5 text-[13px] font-bold" style={{ background: 'var(--theme-ui-accent)' }}>
            Ouvrir {label === 'Mon clan' ? 'mon clan' : 'le clan'} →
          </span>
        </span>
      </button>
    </div>
  )
}

/** Clan du moment : le plus en forme sur 7 jours. */
export function ClanOfMomentCard({ clan, leagueSize, onOpen }: { clan: DirectoryClan; leagueSize: number; onOpen: () => void }) {
  const winRate = clan.games7 > 0 ? clan.wins7 / clan.games7 : 0
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--game-gold)' }}>
        Clan du moment
      </span>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Clan du moment : ${clan.name}`}
        className="relative flex min-h-[200px] flex-col justify-end overflow-hidden rounded-2xl border bg-cover bg-center text-left text-white"
        style={{ backgroundColor: '#0b1120', backgroundImage: `url('${clan.imageUrl ?? DEFAULT_CLAN_IMAGE}')`, borderColor: 'var(--game-gold-ring)' }}
      >
        <span className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/55 to-slate-950/15" aria-hidden="true" />
        <span className="absolute left-3 top-3 -rotate-2 rounded-md bg-amber-400 px-2.5 py-0.5 text-[11px] font-black tracking-[0.05em] text-amber-950">
          EN FEU CETTE SEMAINE
        </span>
        <span className="relative flex flex-col gap-2.5 p-4">
          <span className="flex items-baseline gap-2">
            <b className="text-[22px]">{clan.name}</b>
            <span className="text-[13px] font-bold text-amber-200">[{clan.tag}]</span>
          </span>
          <dl className="grid grid-cols-3 gap-2 tabular-nums">
            {[
              { value: numberFormat.format(clan.wins7), label: 'top 1 en 7 j', gold: true },
              { value: clan.leagueRank ? `#${clan.leagueRank}` : '—', label: `Ligue · sur ${leagueSize}` },
              { value: `${frDecimal(winRate * 100)} %`, label: 'win rate 7 j' },
            ].map((stat) => (
              <div key={stat.label}>
                <dd className="text-[22px] font-black" style={stat.gold ? { color: '#fcd34d' } : undefined}>
                  {stat.value}
                </dd>
                <dt className="text-[10px] font-semibold uppercase text-white/70">{stat.label}</dt>
              </div>
            ))}
          </dl>
        </span>
      </button>
    </div>
  )
}

/** Carte compacte d'un clan actif. */
export function ActiveClanCard({ clan, active, onOpen }: { clan: DirectoryClan; active: boolean; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={active ? 'true' : undefined}
      className="app-panel flex w-full items-center gap-3 p-2.5 text-left transition-colors hover:bg-gray-50"
      style={active ? { borderColor: 'var(--theme-ui-accent-ring)' } : undefined}
    >
      <span
        className="relative h-16 w-16 shrink-0 rounded-xl bg-cover bg-center"
        style={{ backgroundColor: '#0b1120', backgroundImage: `url('${clan.imageUrl ?? DEFAULT_CLAN_IMAGE}')` }}
        aria-hidden="true"
      >
        {clan.playedTonight > 0 && (
          <span
            className="absolute -right-1 -top-1 inline-flex items-center rounded-full border-2 bg-emerald-600 px-1.5 text-[10px] font-extrabold text-white"
            style={{ borderColor: 'var(--theme-ui-surface)' }}
            title={`${clan.playedTonight} joueur${clan.playedTonight > 1 ? 's ont' : ' a'} joué ce soir`}
          >
            ● {clan.playedTonight}
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <b className="truncate text-sm">{clan.name}</b>
          <span className="shrink-0 text-[11px] font-bold text-gray-500">[{clan.tag}]</span>
        </span>
        <span className="text-xs tabular-nums text-gray-500">
          {numberFormat.format(clan.membersCount)} joueur{clan.membersCount > 1 ? 's' : ''} · {numberFormat.format(clan.games7)} partie
          {clan.games7 > 1 ? 's' : ''} ensemble en 7 j · dernière partie{' '}
          {relativeLastGame(clan.lastMatchAt)}
        </span>
        <Palmares clan={clan} />
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
    </button>
  )
}

/** Clans en sommeil (pas de partie depuis 14 jours) : liste repliée, grisée. */
export function SleepingClans({ clans, onOpen }: { clans: DirectoryClan[]; onOpen: (clanId: number) => void }) {
  const [open, setOpen] = useState(false)
  if (clans.length === 0) return null
  return (
    <section className="flex flex-col gap-2.5" aria-label="Clans en sommeil">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex items-center gap-2 text-left">
        <span className="h-2 w-2 rounded-full bg-gray-400" aria-hidden="true" />
        <h2 className="m-0 text-[17px] font-extrabold text-gray-700">En sommeil</h2>
        <span className="text-[13px] text-gray-500">
          {clans.length} clan{clans.length > 1 ? 's' : ''} · pas de partie depuis 14 jours
        </span>
        <span className="ml-auto text-xs font-semibold" style={{ color: 'var(--game-link)' }}>
          {open ? 'Masquer' : 'Afficher'}
        </span>
      </button>
      {open && (
        <ul className="app-panel overflow-hidden p-0">
          {clans.map((clan) => (
            <li key={clan.id} className="border-b border-gray-200 last:border-b-0">
              <button type="button" onClick={() => onOpen(clan.id)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left opacity-80 hover:bg-gray-50 hover:opacity-100">
                <span
                  className="h-8 w-8 shrink-0 rounded-lg bg-cover bg-center grayscale-[0.6]"
                  style={{ backgroundColor: '#0b1120', backgroundImage: `url('${clan.imageUrl ?? DEFAULT_CLAN_IMAGE}')` }}
                  aria-hidden="true"
                />
                <b className="text-[13px]">{clan.name}</b>
                <span className="text-[11px] font-bold text-gray-500">[{clan.tag}]</span>
                <span className="ml-auto text-xs text-gray-500">dernière partie {relativeLastGame(clan.lastMatchAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
