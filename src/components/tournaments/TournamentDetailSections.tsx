'use client'

import { ChevronLeft, ChevronRight, Crown, MapPin, Trophy } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import PodiumCards from '@/components/ui/PodiumCards'
import RankCell from '@/components/ui/RankCell'
import SortableTh from '@/components/ui/SortableTh'
import { matchTournamentDebriefPath } from '@/lib/match-links'
import { paginationItems } from '@/lib/pagination'
import { mapAssetUrl } from '@/lib/pubg-assets/map-asset'
import { tournamentMapLabel } from '@/lib/tournament-filters'
import {
  TOURNAMENT_MODE_DISPLAY,
  formatTournamentPoints,
  isViewerParticipant,
  ordinal,
  participantForm,
  placementScale,
  tournamentRuleLines,
  type TournamentViewer,
  type ViewerPosition,
} from '@/lib/tournament-mode-display'
import type { MixedSquadRule, TournamentMode } from '@/lib/tournament-service'
import type { TournamentRoundView, TournamentStandingView } from '@/lib/tournament-standings-view'

/**
 * Blocs de la page d'un tournoi (maquette « Tournois », 2026-09-27 — docs/features/tournois.md), selon la charte UI
 * (docs/ui/index.html, section « Tournois », 04/10/2026) : classes de rôle (`t-section-title`, `t-meta`, `t-num`,
 * `t-hero`), lecteur en accent (`.tournament-row--viewer`), Top 1 et MVP en or de jeu (`--game-gold`), barres de points
 * à la couleur du mode (`--tmode`), rangs par `RankCell`, aucun défilement horizontal (forme et manches paginées).
 */

export type TournamentRules = {
  mode: TournamentMode
  mixedSquadRule: MixedSquadRule
  placementPoints: Record<string, number>
  killPoints: number
  winBonus: number
  bestOfRounds: number | null
}

const numberFormat = new Intl.NumberFormat('fr-FR')
const roundDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

// ── Place du lecteur (bandeau) ──────────────────────────────────────────────────────────────────────

/**
 * Place du lecteur dans le bandeau : un rappel, jamais un contrôle. Teintée accent (charte §1.2), à la hauteur de la
 * ligne des ancres (`self-stretch`, pas de hauteur fixe). `compact` (docké sur mobile) : le rang seul, sans icône, pour
 * tenir sur la ligne des ancres à 375 px ; la phrase entière reste pour les lecteurs d'écran et en infobulle.
 */
export function TournamentViewerChip({ position, compact }: { position: ViewerPosition; compact: boolean }) {
  const detail =
    position.rank === 1
      ? position.leadOverSecond !== null
        ? `en tête, ${formatTournamentPoints(position.leadOverSecond)} pts d’avance`
        : 'en tête'
      : `à ${formatTournamentPoints(position.gapToLeader)} pts du 1er`
  const sentence = `${position.who} : ${ordinal(position.rank)} · ${detail}`
  return (
    <span
      className={`inline-flex min-w-0 items-center self-stretch rounded-lg border border-[var(--theme-ui-accent-ring)] bg-[var(--theme-ui-accent-soft)] text-[13px] text-[var(--theme-ui-accent-text)] ${
        compact ? 'shrink-0 px-2' : 'gap-2 px-3'
      }`}
      title={sentence}
      data-testid="tournament-viewer-position"
    >
      {compact ? null : <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      {compact ? (
        <>
          <span className="sr-only">{position.who} : </span>
          <b className="t-num whitespace-nowrap">{ordinal(position.rank)}</b>
          <span className="sr-only"> · {detail}</span>
        </>
      ) : (
        <>
          <b className="t-num whitespace-nowrap">
            {position.who} : {ordinal(position.rank)}
          </b>
          <span className="truncate">· {detail}</span>
        </>
      )}
    </span>
  )
}

// ── Podium et MVP ───────────────────────────────────────────────────────────────────────────────────

export function TournamentPodium({
  standings,
  mvp,
}: {
  standings: TournamentStandingView[]
  mvp: { label: string; kills: number; damage: number } | null
}) {
  if (standings.length === 0 && !mvp) return null
  return (
    <section aria-label="Podium" className="flex flex-col gap-3">
      <PodiumCards
        metricLabel="Points"
        entries={standings.slice(0, 3).map((standing) => ({
          key: standing.key,
          name: standing.label,
          subline: `${standing.totalKills} kills · ${standing.wins} Top 1`,
          value: formatTournamentPoints(standing.totalPoints),
        }))}
      />
      {mvp ? (
        // Bloc bordé = `.app-panel` (charte §2), teinté de l'or du Top 1 : `!` car la bordure et le fond de la classe
        // globale l'emportent sinon sur les utilitaires.
        <div className="app-panel flex flex-wrap items-center gap-x-5 gap-y-2 border-[var(--game-gold-ring)]! bg-[var(--game-gold-soft)]! px-4 py-3">
          <span className="t-label t-gold inline-flex items-center gap-1.5">
            <Crown className="h-3.5 w-3.5" aria-hidden="true" />
            MVP du tournoi
          </span>
          <b className="t-card-title">{mvp.label}</b>
          <div className="flex items-baseline gap-3.5 text-gray-900">
            <span className="flex items-baseline gap-1">
              <b className="t-hero t-hero--sm">{mvp.kills}</b>
              <span className="t-meta">kills</span>
            </span>
            <span className="flex items-baseline gap-1">
              <b className="t-hero t-hero--sm">{numberFormat.format(mvp.damage)}</b>
              <span className="t-meta">dégâts</span>
            </span>
          </div>
          <span className="t-meta sm:ml-auto">Le plus de kills, départagé par les dégâts</span>
        </div>
      ) : null}
    </section>
  )
}

// ── Classement ──────────────────────────────────────────────────────────────────────────────────────

/** Classement encore vide : état vide de la charte (panneau, icône atténuée, message). */
export function TournamentEmptyStandings({ upcoming, canManage }: { upcoming: boolean; canManage: boolean }) {
  return (
    <div className="app-panel flex flex-col items-center gap-2.5 px-4 py-8 text-center">
      <Trophy className="h-9 w-9 text-gray-500 opacity-50" aria-hidden="true" />
      <p className="t-body max-w-[34rem] text-gray-600">
        {upcoming
          ? 'Le tournoi n’a pas commencé : le classement apparaîtra après la première manche.'
          : 'Aucune manche comptabilisée pour l’instant.'}
        {canManage ? ' Lancez une synchronisation PUBG, ou vérifiez les filtres de format et de carte du tournoi.' : ''}
      </p>
    </div>
  )
}

function PlaceChip({ round, placement }: { round: number; placement: number | null }) {
  if (placement === null) {
    return (
      <span className="tournament-place tournament-place--absent" title={`Manche ${round} : absent`}>
        –
      </span>
    )
  }
  const tone = placement === 1 ? 'tournament-place--win' : placement <= 10 ? 'tournament-place--top10' : ''
  return (
    <span className={`tournament-place ${tone}`} title={`Manche ${round} : ${placement === 1 ? '1re' : `${placement}e`} place`}>
      {placement === 1 ? '#1' : placement}
    </span>
  )
}

/**
 * Forme affichée sans défilement horizontal (charte §4) : les 5 dernières manches de 768 à 1 023 px, les 10 dernières
 * au-delà. Les plus anciennes restent dans le débrief de chaque manche.
 */
const FORM_TABLET = 5
const FORM_DESKTOP = 10

function FormHeader({ count }: { count: number }) {
  if (count <= FORM_TABLET) return <>Forme · {count} manche{count > 1 ? 's' : ''}</>
  return (
    <>
      Forme · <span className="lg:hidden">{FORM_TABLET} dernières</span>
      <span className="max-lg:hidden">{count <= FORM_DESKTOP ? `${count} manches` : `${FORM_DESKTOP} dernières`}</span>
    </>
  )
}

export function TournamentStandingsTable({
  mode,
  standings,
  rounds,
  viewer,
  showForm,
  prorata,
}: {
  mode: TournamentMode
  standings: TournamentStandingView[]
  rounds: TournamentRoundView[]
  viewer: TournamentViewer
  /** Faux en détail par escouade : la forme se lit par participant du mode, pas par escouade. */
  showForm: boolean
  prorata: boolean
}) {
  const display = TOURNAMENT_MODE_DISPLAY[mode]
  const top = Math.max(1, standings[0]?.totalPoints ?? 1)
  const showChips = mode === 'custom_teams'
  return (
    // Aucun défilement horizontal (charte §4) : sous 768 px, kills, Top 1 et forme passent dans la sous-ligne ou
    // disparaissent ; la forme est bornée aux dernières manches.
    <div className="app-table-shell overflow-hidden">
      <table className="w-full table-auto text-[13px]">
        <thead className="app-table-head">
          <tr>
            <SortableTh align="left" className="w-12 pl-3">Rang</SortableTh>
            <SortableTh align="left">{display.column}</SortableTh>
            <SortableTh align="left" className="max-md:text-right" title={prorata ? 'Points de placement partagés au prorata de l’effectif : totaux décimaux possibles.' : undefined}>
              Points
            </SortableTh>
            <SortableTh className="max-md:hidden">Kills</SortableTh>
            <SortableTh className={`max-md:hidden ${showForm ? '' : 'pr-3'}`}>Top 1</SortableTh>
            {showForm ? (
              <SortableTh align="left" className="pr-3 max-md:hidden" title="Place à chaque manche, la plus récente à droite">
                <FormHeader count={rounds.length} />
              </SortableTh>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {standings.map((standing) => {
            const mine = isViewerParticipant(standing.participant, viewer)
            const form = showForm ? participantForm(standing.key, rounds) : []
            return (
              <tr key={standing.key} className={`app-table-row${mine ? ' tournament-row--viewer' : ''}`} aria-current={mine ? 'true' : undefined}>
                <td className="py-2 pl-3 pr-[9px]">
                  <RankCell rank={standing.rank} />
                </td>
                <td className="min-w-0 px-[9px] py-2">
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <b className="truncate text-sm text-gray-900">{standing.label}</b>
                      {mine ? (
                        // Marque du lecteur : accent teinté (jamais de blanc sur le jaune), 11 px minimum.
                        <span className="shrink-0 rounded-md bg-[var(--theme-ui-accent-soft)] px-1.5 py-px text-[11px] font-extrabold uppercase text-[var(--theme-ui-accent-text)]">
                          {display.viewer}
                        </span>
                      ) : null}
                    </span>
                    {showChips && standing.memberLabels.length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {standing.memberLabels.map((label) => (
                          <span key={label} className="rounded-md bg-gray-100 px-1.5 py-px text-[11px] font-semibold text-gray-700">
                            {label}
                          </span>
                        ))}
                      </span>
                    ) : null}
                    <span className="t-meta t-num md:hidden">
                      {standing.totalKills} kills · {standing.wins} Top 1
                    </span>
                  </span>
                </td>
                <td className="px-[9px] py-2 max-md:text-right">
                  <span className="flex items-center gap-2 max-md:justify-end">
                    <span className="h-2 min-w-[5rem] flex-1 overflow-hidden rounded-md bg-[var(--theme-ui-surface-strong)] max-md:hidden" aria-hidden="true">
                      <span
                        className="block h-full rounded-md bg-[var(--tmode)]"
                        style={{ width: `${Math.max(0, Math.round((standing.totalPoints / top) * 100))}%` }}
                      />
                    </span>
                    <b className="t-num min-w-[2.5rem] text-right text-[15px] font-extrabold text-gray-900">
                      {formatTournamentPoints(standing.totalPoints)}
                    </b>
                  </span>
                </td>
                <td className="t-num px-[9px] py-2 text-right text-gray-700 max-md:hidden">{standing.totalKills}</td>
                <td
                  className={`t-num py-2 pl-[9px] text-right font-extrabold max-md:hidden ${showForm ? 'pr-[9px]' : 'pr-3'} ${
                    standing.wins > 0 ? 't-gold' : 'text-gray-500'
                  }`}
                >
                  {standing.wins}
                </td>
                {showForm ? (
                  <td className="py-2 pl-[9px] pr-3 max-md:hidden">
                    <span className="flex gap-[3px]">
                      {form.map((entry, index) => {
                        // Âge de la manche (1 = la dernière) : les plus anciennes se masquent selon la largeur.
                        const age = form.length - index
                        const visibility = age > FORM_DESKTOP ? 'hidden' : age > FORM_TABLET ? 'max-lg:hidden' : undefined
                        return (
                          // Visibilité sur l'enveloppe : la classe globale `.tournament-place` impose son `display`.
                          <span key={entry.round} className={visibility}>
                            <PlaceChip round={entry.round} placement={entry.placement} />
                          </span>
                        )
                      })}
                    </span>
                  </td>
                ) : null}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Trophée des clans (solo) ────────────────────────────────────────────────────────────────────────

export function TournamentClanTrophy({ entries }: { entries: Array<{ clanId: number; label: string; points: number; players: number }> }) {
  if (entries.length === 0) return null
  const top = Math.max(1, entries[0].points)
  return (
    <section aria-labelledby="tournament-trophy" className="app-panel flex flex-col gap-2 px-4 py-3.5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h2 id="tournament-trophy" className="t-card-title">Trophée des clans</h2>
        <span className="t-meta">somme des points de leurs joueurs</span>
      </div>
      {entries.map((entry, index) => (
        <div key={entry.clanId} className="grid grid-cols-[24px_minmax(0,1fr)_minmax(0,2fr)_64px] items-center gap-2.5 text-[13px]">
          <span className="flex justify-center">
            <RankCell rank={index + 1} size="xs" />
          </span>
          <b className="truncate text-gray-900" title={`${entry.players} joueur${entry.players > 1 ? 's' : ''} classé${entry.players > 1 ? 's' : ''}`}>
            {entry.label}
          </b>
          <span className="h-2 overflow-hidden rounded-md bg-[var(--theme-ui-surface-strong)]" aria-hidden="true">
            <span className="block h-full rounded-md bg-[var(--tmode)]" style={{ width: `${Math.round((entry.points / top) * 100)}%` }} />
          </span>
          <b className="t-num text-right text-gray-900">{formatTournamentPoints(entry.points)} pts</b>
        </div>
      ))}
    </section>
  )
}

// ── Manches, une par une ────────────────────────────────────────────────────────────────────────────

/** Jusqu'à 7 manches, toutes les puces ; au-delà, la première, la dernière, la courante et ses voisines (« … »). */
const ALL_ROUND_CHIPS_UP_TO = 7

export function TournamentRounds({
  tournamentId,
  mode,
  rounds,
  standings,
  viewer,
}: {
  tournamentId: string
  mode: TournamentMode
  rounds: TournamentRoundView[]
  standings: TournamentStandingView[]
  viewer: TournamentViewer
}) {
  // La dernière manche jouée d'abord : c'est celle qu'on vient voir pendant un tournoi.
  const [selected, setSelected] = useState(rounds.length - 1)
  if (rounds.length === 0) return null
  const index = Math.min(Math.max(0, selected), rounds.length - 1)
  const round = rounds[index]
  const image = mapAssetUrl(round.mapName) ?? '/matches.jpg'
  const viewerKeys = new Set(standings.filter((standing) => isViewerParticipant(standing.participant, viewer)).map((standing) => standing.key))
  // Puces paginées plutôt qu'une rangée qui défile de côté (charte §4, « Pagination ») : 7 au plus, chevrons compris
  // la rangée tient dans 343 px.
  const chips: Array<number | 'gap'> =
    rounds.length <= ALL_ROUND_CHIPS_UP_TO ? rounds.map((_, chipIndex) => chipIndex + 1) : paginationItems(index + 1, rounds.length, 1)

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="t-section-title">Manches</h2>
        <div className="ml-auto flex min-w-0 max-w-full items-center gap-1" role="group" aria-label="Choisir une manche">
          <button
            type="button"
            onClick={() => setSelected(index - 1)}
            disabled={index === 0}
            aria-label="Manche précédente"
            className="app-pager-button"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          {chips.map((chip, chipIndex) =>
            chip === 'gap' ? (
              <span key={`gap-${chipIndex}`} className="app-pager-button" aria-hidden="true">
                …
              </span>
            ) : (
              <button
                key={rounds[chip - 1].matchId}
                type="button"
                onClick={() => setSelected(chip - 1)}
                aria-pressed={chip - 1 === index}
                className={`app-pager-button ${chip - 1 === index ? 'app-pager-button--active' : ''}`}
              >
                M{chip}
              </button>
            )
          )}
          <button
            type="button"
            onClick={() => setSelected(index + 1)}
            disabled={index === rounds.length - 1}
            aria-label="Manche suivante"
            className="app-pager-button"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <article
        aria-label={`Manche ${round.index}`}
        className="app-table-shell grid overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]"
      >
        {/* Carte de la manche, toujours sombre : `.app-on-photo` (or de jeu lisible dans les deux thèmes). */}
        <div className="app-on-photo bg-map-fallback relative min-h-[240px] bg-cover bg-center text-white" style={{ backgroundImage: `url('${image}')` }}>
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 from-35% to-slate-950/30" />
          <div className="absolute inset-x-3.5 bottom-3.5 flex flex-col gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-white/70">
              Manche {round.index} · {tournamentMapLabel(round.mapName)}
            </span>
            <span className="text-xs text-white/80">{roundDate.format(new Date(round.createdAt))}</span>
            {/* Vainqueur de la manche : tampon « Chicken dinner » (signature, accent à encre sombre), cadre en or de jeu. */}
            <div className="flex flex-col items-start gap-1.5 rounded-[10px] border border-[var(--game-gold-ring)] bg-[var(--game-gold-soft)] p-2.5">
              <span className="app-stamp app-stamp--sm">Chicken dinner</span>
              <b className="text-sm">{round.winnerLabel ?? 'Hors des participants suivis'}</b>
            </div>
            {round.mvp ? (
              <span className="text-xs text-white/85">
                <b className="t-gold">MVP</b> {round.mvp.label} · {round.mvp.kills} kills
              </span>
            ) : null}
            {/* Lien sur la photo : accent, souligné au survol (plus d'indigo, charte §1.2). */}
            <Link
              href={matchTournamentDebriefPath(tournamentId, round.matchId)}
              className="self-start text-xs font-bold text-[var(--theme-ui-accent)] underline decoration-transparent underline-offset-[3px] transition-colors hover:decoration-current"
            >
              Débrief 2D de la manche →
            </Link>
          </div>
        </div>
        <table className="w-full self-start text-[13px]">
          <thead className="app-table-head">
            <tr>
              <SortableTh align="left" className="w-14 pl-3.5">Place</SortableTh>
              <SortableTh align="left">{TOURNAMENT_MODE_DISPLAY[mode].column}</SortableTh>
              <SortableTh>Kills</SortableTh>
              <SortableTh className="pr-3.5">Pts</SortableTh>
            </tr>
          </thead>
          <tbody>
            {round.scores.map((score) => (
              <tr key={score.key} className={`app-table-row${viewerKeys.has(score.key) ? ' tournament-row--viewer' : ''}`}>
                <td className="py-2 pl-3.5 pr-[9px]">
                  <PlaceChip round={round.index} placement={score.bestPlacement} />
                </td>
                <td className="max-w-0 truncate px-[9px] py-2 font-semibold text-gray-900">{score.label}</td>
                <td className="t-num px-[9px] py-2 text-right text-gray-700">{score.totalKills}</td>
                <td className="t-num py-2 pl-[9px] pr-3.5 text-right font-bold text-gray-900">{formatTournamentPoints(score.points)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </>
  )
}

// ── Barème ──────────────────────────────────────────────────────────────────────────────────────────

/**
 * Barème en barres : une seule valeur à l'accent, le Top 1 ; les autres à la couleur des traits (`--game-track-strong`,
 * « --line » de la charte §5g).
 */
export function TournamentRulesPanel({ rules }: { rules: TournamentRules }) {
  const scale = placementScale(rules.placementPoints)
  return (
    <div className="app-panel grid gap-3 p-4 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-2.5">
        <h2 className="t-card-title">Barème</h2>
        <div className="flex h-[90px] items-end gap-1" role="list" aria-label="Points de placement">
          {scale.map((entry) => (
            <div key={entry.placement} role="listitem" className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" aria-label={`Top ${entry.placement} : ${entry.points} points`}>
              <b className="t-num text-[11px] text-gray-900">{formatTournamentPoints(entry.points)}</b>
              <span
                className={`w-full rounded-t-md ${entry.placement === 1 ? 'bg-[var(--theme-ui-accent)]' : 'bg-[var(--game-track-strong)]'}`}
                style={{ height: `${Math.max(2, Math.round(entry.ratio * 60))}px` }}
              />
              <span className="text-[11px] text-gray-500">T{entry.placement}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="t-body flex flex-col gap-2">
        {tournamentRuleLines(rules).map((line) => (
          <div key={line.label} className="app-panel-muted flex justify-between gap-2.5 rounded-[10px]! px-2.5 py-2">
            <span className="text-gray-700">{line.label}</span>
            <b className="text-right text-gray-900">{line.value}</b>
          </div>
        ))}
      </div>
    </div>
  )
}
