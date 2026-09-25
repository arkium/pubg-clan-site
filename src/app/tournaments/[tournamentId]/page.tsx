'use client'

import Link from 'next/link'
import { ChevronDown, Crown, Info, Megaphone, RefreshCw, Settings, Swords, Trophy } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import TournamentBroadcastModal from '@/components/discord/TournamentBroadcastModal'
import SegmentedControl from '@/components/ui/SegmentedControl'
import TeamModeBadge, { type TeamMode } from '@/components/ui/TeamModeBadge'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { matchTournamentDebriefPath } from '@/lib/match-links'
import { tournamentGameModeLabel, tournamentMapLabel } from '@/lib/tournament-filters'
import type { MixedSquadRule, TournamentMode } from '@/lib/tournament-service'
import type {
  TournamentRoundView,
  TournamentStandingView,
} from '@/lib/tournament-standings-view'

type NormalizedRules = {
  mode: TournamentMode
  mixedSquadRule: MixedSquadRule
  placementPoints: Record<string, number>
  killPoints: number
  winBonus: number
  bestOfRounds: number | null
}

type Tournament = {
  id: string
  title: string
  description: string | null
  status: string
  startDate: string
  endDate: string
  gameMode: string | null
  mapName: string | null
  organizerClan: { id: number; name: string; tag: string | null } | null
  rules: NormalizedRules
}

type StandingsResponse = {
  tournament?: Tournament
  rules?: NormalizedRules
  modeStandings?: TournamentStandingView[]
  squadBreakdown?: TournamentStandingView[]
  clanTrophy?: Array<{ clanId: number; label: string; points: number; kills: number; players: number }>
  rounds?: TournamentRoundView[]
  mvp?: { memberId: number; label: string; kills: number; damage: number } | null
  participantClanIds?: number[]
  error?: string
}

const MODE_LABELS: Record<TournamentMode, string> = {
  inter_clan: 'Inter-Clans',
  custom_teams: 'Équipes libres',
  solo_ffa: 'Solo',
  intra_clan: 'Tournoi interne',
}

const MEDALS: Record<number, { icon: string; alt: string; ring: string }> = {
  1: { icon: '/icons/medal-gold.svg', alt: 'Médaille or', ring: 'border-amber-400/60 bg-amber-500/10' },
  2: { icon: '/icons/medal-silver.svg', alt: 'Médaille argent', ring: 'border-slate-300/60 bg-slate-400/10' },
  3: { icon: '/icons/medal-bronze.svg', alt: 'Médaille bronze', ring: 'border-orange-400/60 bg-orange-500/10' },
}

const numberFormat = new Intl.NumberFormat('fr-FR')
const dateFormat = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
const dateTimeFormat = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Les points deviennent décimaux avec le partage au prorata : on n'affiche la décimale que si elle existe. */
const formatPoints = (value: number) =>
  Number.isInteger(value) ? numberFormat.format(value) : value.toLocaleString('fr-FR', { maximumFractionDigits: 1 })

function teamModeFromGameMode(gameMode: string | null): TeamMode | null {
  if (!gameMode) return null
  const normalized = gameMode.toLowerCase()
  if (normalized.includes('solo')) return 'solo'
  if (normalized.includes('duo')) return 'duo'
  if (normalized.includes('squad')) return 'squad'
  return null
}

function resolvePhase(tournament: Tournament, now: Date): 'live' | 'upcoming' | 'finished' | 'draft' {
  if (tournament.status === 'draft') return 'draft'
  if (tournament.status === 'finished') return 'finished'
  const end = new Date(tournament.endDate)
  end.setHours(23, 59, 59, 999)
  if (now < new Date(tournament.startDate)) return 'upcoming'
  if (now > end) return 'finished'
  return 'live'
}

const PHASE_BADGES: Record<string, { label: string; className: string; pulse?: boolean }> = {
  live: { label: 'EN DIRECT', className: 'border-emerald-400/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-300', pulse: true },
  upcoming: { label: 'À VENIR', className: 'border-sky-400/40 bg-sky-500/15 text-sky-600 dark:text-sky-300' },
  finished: { label: 'TERMINÉ', className: 'border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300' },
  draft: { label: 'BROUILLON', className: 'border-amber-400/40 bg-amber-500/15 text-amber-700 dark:text-amber-300' },
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="app-panel-muted rounded-full px-2.5 py-1 text-[11px] text-gray-600">{children}</span>
}

export default function TournamentDetailPage() {
  const params = useParams()
  const tournamentId = typeof params.tournamentId === 'string' ? params.tournamentId : null
  const { clanId: selectedClanId } = useSelectedClan()
  const { permissions, isSuperUser } = useAuthSession()

  const [payload, setPayload] = useState<StandingsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [trophyOpen, setTrophyOpen] = useState(false)
  const [granularity, setGranularity] = useState<'clan' | 'squad'>('clan')
  const [broadcastOpen, setBroadcastOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const now = useMemo(() => new Date(), [])

  useEffect(() => {
    if (!tournamentId) return
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch(`/api/tournaments/${tournamentId}/standings`, { cache: 'no-store' })
        const data = (await response.json()) as StandingsResponse
        if (cancelled) return
        if (!response.ok) {
          setPayload(null)
          setError(data.error ?? 'Impossible de charger le tournoi.')
          return
        }
        setPayload(data)
      } catch {
        if (!cancelled) {
          setPayload(null)
          setError('Impossible de charger le tournoi.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [tournamentId])

  const tournament = payload?.tournament ?? null
  const rules = payload?.rules ?? tournament?.rules ?? null
  const standings = payload?.modeStandings ?? []
  const rounds = payload?.rounds ?? []
  const organizerClanId = tournament?.organizerClan?.id ?? null

  // Les actions d'organisateur ne s'affichent que pour qui peut réellement les exécuter sur ce clan.
  const canManageTournament =
    isSuperUser ||
    (organizerClanId !== null &&
      selectedClanId === organizerClanId &&
      (permissions.includes('*') || permissions.includes('manage_settings')))

  async function syncTournament() {
    if (!organizerClanId || !tournamentId) return
    try {
      setSyncing(true)
      setNotice('Synchronisation PUBG en cours…')
      const response = await fetch(`/api/clans/${organizerClanId}/tournaments/${tournamentId}/sync`, { method: 'POST' })
      const data = (await response.json().catch(() => null)) as { error?: string; eligibleMatches?: number } | null
      if (!response.ok) throw new Error(data?.error ?? 'Synchronisation impossible.')
      setNotice(`Synchronisation terminée : ${data?.eligibleMatches ?? 0} manche(s) éligible(s). Rechargez pour voir le classement à jour.`)
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Synchronisation impossible.')
    } finally {
      setSyncing(false)
    }
  }

  if (!tournamentId) {
    return (
      <div className="app-container app-main flex-1">
        <p className="text-sm text-red-600">Tournoi invalide.</p>
      </div>
    )
  }

  const phase = tournament ? resolvePhase(tournament, now) : 'draft'
  const phaseBadge = PHASE_BADGES[phase]
  const teamMode = teamModeFromGameMode(tournament?.gameMode ?? null)
  const displayedStandings = rules?.mode === 'inter_clan' && granularity === 'squad'
    ? payload?.squadBreakdown ?? []
    : standings
  const podium = displayedStandings.slice(0, 3)

  return (
    <div className="app-container app-main flex-1 space-y-5">
      <NavigationTrail
        currentLabel={tournament?.title ?? 'Tournoi'}
        currentHref={`/tournaments/${tournamentId}`}
        fallbackParent={{ href: '/tournaments', label: 'Tournois' }}
      />

      {loading ? <p className="text-sm text-gray-500">Chargement du tournoi…</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {notice ? <p className="app-panel-muted rounded-lg p-3 text-sm text-gray-700">{notice}</p> : null}

      {tournament && rules ? (
        <>
          <header className="app-panel space-y-3 p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Trophy className="h-5 w-5 text-amber-500" aria-hidden />
                  <h1 className="text-xl font-bold text-gray-900">{tournament.title}</h1>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold ${phaseBadge.className}`}
                  >
                    {phaseBadge.pulse ? <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> : null}
                    {phaseBadge.label}
                  </span>
                </div>
                {tournament.description ? <p className="mt-1 text-sm text-gray-600">{tournament.description}</p> : null}
                <p className="mt-1 text-sm text-gray-500">
                  {tournament.organizerClan ? (
                    <>
                      Organisé par{' '}
                      <Link href={`/clans/${tournament.organizerClan.id}/overview`} className="font-medium text-gray-700 hover:underline">
                        {tournament.organizerClan.tag ? `[${tournament.organizerClan.tag}] ` : ''}
                        {tournament.organizerClan.name}
                      </Link>{' '}
                    </>
                  ) : null}
                  · {dateFormat.format(new Date(tournament.startDate))} → {dateFormat.format(new Date(tournament.endDate))}
                </p>
              </div>

              {canManageTournament ? (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={syncTournament} disabled={syncing} className="app-btn app-btn--sm app-btn--secondary">
                    <RefreshCw className={`mr-1.5 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} aria-hidden />
                    Synchroniser PUBG
                  </button>
                  <button type="button" onClick={() => setBroadcastOpen(true)} className="app-btn app-btn--sm app-btn--secondary">
                    <Megaphone className="mr-1.5 h-4 w-4" aria-hidden />
                    Diffuser sur Discord
                  </button>
                  {organizerClanId ? (
                    <Link href={`/clans/${organizerClanId}/settings/tournaments`} className="app-btn app-btn--sm app-btn--secondary">
                      <Settings className="mr-1.5 h-4 w-4" aria-hidden />
                      Paramètres
                    </Link>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Badge>
                {MODE_LABELS[rules.mode]}
                {rules.mode === 'inter_clan' ? (rules.mixedSquadRule === 'prorata' ? ' (prorata)' : ' (100 %)') : ''}
              </Badge>
              {teamMode ? (
                <TeamModeBadge mode={teamMode} size="xs" label={tournamentGameModeLabel(tournament.gameMode)} />
              ) : (
                <Badge>{tournamentGameModeLabel(tournament.gameMode)}</Badge>
              )}
              <Badge>{tournamentMapLabel(tournament.mapName)}</Badge>
              <Badge>
                {(payload?.participantClanIds ?? []).length} clan
                {(payload?.participantClanIds ?? []).length > 1 ? 's' : ''} détecté
                {(payload?.participantClanIds ?? []).length > 1 ? 's' : ''}
              </Badge>
              <Badge>
                {rounds.length} manche{rounds.length > 1 ? 's' : ''}
              </Badge>
            </div>
          </header>

          <section className="app-panel p-4">
            <button
              type="button"
              onClick={() => setRulesOpen((open) => !open)}
              aria-expanded={rulesOpen}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <span className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
                <Info className="h-4 w-4 text-sky-500" aria-hidden />
                <strong className="text-gray-900">Barème</strong>
                <span>{rules.killPoints} pt/kill</span>
                <span>· bonus Top 1 : {rules.winBonus}</span>
                <span>· {rules.bestOfRounds ? `${rules.bestOfRounds} meilleure(s) manche(s)` : 'toutes les manches'}</span>
              </span>
              <ChevronDown className={`h-5 w-5 text-gray-500 transition-transform duration-200 ${rulesOpen ? 'rotate-180' : ''}`} aria-hidden />
            </button>

            {rulesOpen ? (
              <div className="app-modal-callout mt-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {Object.entries(rules.placementPoints)
                    .sort((left, right) => Number(left[0]) - Number(right[0]))
                    .map(([placement, points]) => (
                      <div key={placement} className="app-panel-muted rounded px-2 py-1 text-xs text-gray-700">
                        Top {placement} : <strong>{points}</strong>
                      </div>
                    ))}
                </div>
                {rules.mode === 'inter_clan' ? (
                  <p className="mt-3 text-xs text-gray-600">
                    <strong>Escouades mixtes :</strong>{' '}
                    {rules.mixedSquadRule === 'prorata'
                      ? 'points de placement et bonus divisés selon l’effectif de chaque clan dans l’escouade. Les kills restent attribués à leur auteur, d’où des totaux décimaux.'
                      : 'chaque clan présent dans l’escouade reçoit 100 % des points de placement et du bonus, plus ses propres kills.'}
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          {podium.length > 0 ? (
            <section className="grid gap-3 sm:grid-cols-3">
              {podium.map((standing) => {
                const medal = MEDALS[standing.rank]
                return (
                  <article key={standing.key} className={`app-panel border ${medal?.ring ?? ''} p-4`}>
                    <div className="flex items-center gap-2">
                      {medal ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={medal.icon} alt={medal.alt} width={28} height={28} className="h-7 w-7" />
                      ) : (
                        <Crown className="h-6 w-6 text-amber-500" aria-hidden />
                      )}
                      <span className="text-sm font-semibold text-gray-500">#{standing.rank}</span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-base font-semibold text-gray-900">{standing.label}</p>
                    <p className="mt-1 text-2xl font-bold text-gray-900">{formatPoints(standing.totalPoints)} pts</p>
                    <p className="text-xs text-gray-500">
                      {standing.totalKills} kills · {standing.wins} victoire{standing.wins > 1 ? 's' : ''} ·{' '}
                      {standing.matchesPlayed} manche{standing.matchesPlayed > 1 ? 's' : ''}
                    </p>
                  </article>
                )
              })}
            </section>
          ) : null}

          {rules.mode === 'solo_ffa' && payload?.mvp ? (
            <section className="app-panel flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-500">
                  <Swords className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">MVP de la compétition</p>
                  <p className="text-base font-semibold text-gray-900">{payload.mvp.label}</p>
                </div>
              </div>
              <p className="text-sm text-gray-600">
                {payload.mvp.kills} kills · {numberFormat.format(payload.mvp.damage)} dégâts
              </p>
            </section>
          ) : null}

          <section className="app-panel p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-gray-900">
                {rules.mode === 'solo_ffa'
                  ? 'Classement des joueurs'
                  : rules.mode === 'inter_clan'
                    ? 'Classement des clans'
                    : 'Classement des équipes'}
              </h2>
              {rules.mode === 'inter_clan' && (payload?.squadBreakdown ?? []).length > 0 ? (
                <SegmentedControl
                  options={[
                    { value: 'clan', label: 'Cumul par clan' },
                    { value: 'squad', label: 'Détail par escouade' },
                  ]}
                  value={granularity}
                  onChange={setGranularity}
                />
              ) : null}
            </div>

            {displayedStandings.length === 0 ? (
              <p className="text-sm text-gray-600">
                Aucune manche comptabilisée pour l’instant. Lancez une synchronisation depuis les paramètres du
                tournoi, ou vérifiez ses filtres de mode et de carte.
              </p>
            ) : (
              <div className="app-table-shell overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="app-table-head">
                    <tr>
                      <th className="w-14 px-3 py-2 text-center">Rang</th>
                      <th className="px-3 py-2 text-left">
                        {rules.mode === 'solo_ffa' ? 'Joueur' : rules.mode === 'inter_clan' && granularity === 'clan' ? 'Clan' : 'Équipe'}
                      </th>
                      <th className="px-3 py-2 text-right">Points</th>
                      <th className="px-3 py-2 text-right">Kills</th>
                      {rules.mode === 'solo_ffa' ? <th className="px-3 py-2 text-right">Dégâts</th> : null}
                      <th className="px-3 py-2 text-right">Manches</th>
                      <th className="px-3 py-2 text-right">Victoires</th>
                      <th className="px-3 py-2 text-right">Meilleure place</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedStandings.map((standing) => (
                      <tr key={standing.key} className={`app-table-row ${standing.rank <= 3 ? `app-table-row--top${standing.rank}` : ''}`}>
                        <td className="px-3 py-3 text-center font-semibold">{standing.rank}</td>
                        <td className="px-3 py-3">
                          <span className="font-medium text-gray-900">{standing.label}</span>
                          {standing.memberLabels.length > 1 && rules.mode !== 'solo_ffa' ? (
                            <span className="ml-2 text-xs text-gray-500">{standing.memberLabels.length} joueurs</span>
                          ) : null}
                        </td>
                        <td
                          className="px-3 py-3 text-right font-semibold tabular-nums"
                          title={
                            rules.mixedSquadRule === 'prorata' && rules.mode === 'inter_clan'
                              ? 'Points de placement partagés entre les clans de l’escouade, au prorata de leur effectif.'
                              : undefined
                          }
                        >
                          {formatPoints(standing.totalPoints)}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{standing.totalKills}</td>
                        {rules.mode === 'solo_ffa' ? (
                          <td className="px-3 py-3 text-right tabular-nums">
                            {numberFormat.format(Math.round(standing.totalDamage))}
                          </td>
                        ) : null}
                        <td className="px-3 py-3 text-right tabular-nums">{standing.matchesPlayed}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{standing.wins}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{standing.bestPlacement ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {rules.mode === 'solo_ffa' && (payload?.clanTrophy ?? []).length > 0 ? (
            <section className="space-y-3">
              <button
                type="button"
                onClick={() => setTrophyOpen((open) => !open)}
                aria-expanded={trophyOpen}
                className="app-panel flex w-full items-center justify-between gap-3 p-4 text-left"
              >
                <span className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-gray-900">Trophée des clans</h2>
                  <span className="app-panel-muted rounded-full px-2 py-0.5 text-xs text-gray-600">
                    somme des points de leurs joueurs
                  </span>
                </span>
                <ChevronDown className={`h-5 w-5 text-gray-500 transition-transform duration-200 ${trophyOpen ? 'rotate-180' : ''}`} aria-hidden />
              </button>
              {trophyOpen ? (
                <div className="app-table-shell overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="app-table-head">
                      <tr>
                        <th className="px-3 py-2 text-left">Clan</th>
                        <th className="px-3 py-2 text-right">Points</th>
                        <th className="px-3 py-2 text-right">Kills</th>
                        <th className="px-3 py-2 text-right">Joueurs classés</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(payload?.clanTrophy ?? []).map((entry) => (
                        <tr key={entry.clanId} className="app-table-row">
                          <td className="px-3 py-2 font-medium text-gray-900">{entry.label}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatPoints(entry.points)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{entry.kills}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{entry.players}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </section>
          ) : null}

          {rounds.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-gray-900">Manches comptabilisées</h2>
              {rounds.map((round) => (
                <article key={round.matchId} className="app-panel space-y-2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">Manche #{round.index}</h3>
                      <p className="text-xs text-gray-500">
                        {dateTimeFormat.format(new Date(round.createdAt))} · {tournamentMapLabel(round.mapName)} ·{' '}
                        {tournamentGameModeLabel(round.gameMode)}
                      </p>
                    </div>
                    <Link
                      href={matchTournamentDebriefPath(tournament.id, round.matchId)}
                      className="app-btn app-btn--xs app-btn--secondary"
                    >
                      🗺️ Débriefing &amp; replay
                    </Link>
                  </div>

                  <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                    <Badge>Vainqueur : {round.winnerLabel ?? 'inconnu'}</Badge>
                    {round.mvp ? (
                      <Badge>
                        MVP : {round.mvp.label} ({round.mvp.kills} kills, {numberFormat.format(round.mvp.damage)} dégâts)
                      </Badge>
                    ) : null}
                  </div>

                  <ul className="grid gap-1 sm:grid-cols-2">
                    {round.scores.map((score) => (
                      <li key={score.key} className="app-panel-muted flex items-center justify-between gap-2 rounded px-2 py-1 text-xs">
                        <span className="truncate text-gray-700">{score.label}</span>
                        <span className="shrink-0 tabular-nums text-gray-900">
                          {formatPoints(score.points)} pts · place {score.bestPlacement}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </section>
          ) : null}

          {broadcastOpen && organizerClanId ? (
            <TournamentBroadcastModal
              clanId={organizerClanId}
              tournamentId={tournament.id}
              tournamentTitle={tournament.title}
              onClose={() => setBroadcastOpen(false)}
              onBroadcast={(message) => {
                setNotice(message)
                setBroadcastOpen(false)
              }}
            />
          ) : null}
        </>
      ) : null}
    </div>
  )
}
