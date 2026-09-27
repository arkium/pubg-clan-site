'use client'

import Link from 'next/link'
import { MapPin, Megaphone, RefreshCw, Settings } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import TournamentBroadcastModal from '@/components/discord/TournamentBroadcastModal'
import TournamentModeBadge, { tournamentModeClass } from '@/components/tournaments/TournamentModeBadge'
import { tournamentFormatLabel } from '@/components/tournaments/TournamentListSections'
import {
  TournamentClanTrophy,
  TournamentPodium,
  TournamentRounds,
  TournamentRulesPanel,
  TournamentStandingsTable,
  type TournamentRules,
} from '@/components/tournaments/TournamentDetailSections'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import SectionAnchorNav, { type SectionAnchorNavItem } from '@/components/ui/SectionAnchorNav'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { mapAssetUrl } from '@/lib/pubg-assets/map-asset'
import {
  TOURNAMENT_MODE_DISPLAY,
  countdownLabel,
  formatTournamentPoints,
  ordinal,
  resolveTournamentPhase,
  viewerPosition,
  type TournamentPhase,
  type TournamentViewer,
} from '@/lib/tournament-mode-display'
import type { TournamentRoundView, TournamentStandingView } from '@/lib/tournament-standings-view'

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
}

type StandingsResponse = {
  tournament?: Tournament
  rules?: TournamentRules
  modeStandings?: TournamentStandingView[]
  squadBreakdown?: TournamentStandingView[]
  clanTrophy?: Array<{ clanId: number; label: string; points: number; kills: number; players: number }>
  rounds?: TournamentRoundView[]
  mvp?: { memberId: number; label: string; kills: number; damage: number } | null
  error?: string
}

const SECTIONS: SectionAnchorNavItem[] = [
  { id: 'tournament-standings', label: 'Classement', icon: 'victory' },
  { id: 'tournament-rounds', label: 'Manches', icon: 'combat' },
  { id: 'tournament-rules', label: 'Barème', icon: 'other' },
]
/** Sans manche comptabilisée, pas d'ancre vers une section absente. Constantes : SectionAnchorNav dépend de `items`. */
const SECTIONS_WITHOUT_ROUNDS = SECTIONS.filter((section) => section.id !== 'tournament-rounds')

const PHASE_BADGES: Record<TournamentPhase, { label: string; className: string }> = {
  live: { label: 'EN DIRECT', className: 'bg-red-500 text-white' },
  upcoming: { label: 'À VENIR', className: 'bg-sky-500 text-white' },
  finished: { label: 'TERMINÉ', className: 'bg-white/15 text-white' },
  draft: { label: 'BROUILLON', className: 'bg-amber-400 text-slate-950' },
}

const dayMonth = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
const hourMinute = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const shortDate = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' })

/**
 * Page d'un tournoi — docs/features/tournois.md, « Pages joueurs » (maquette « Tournois », 2026-09-27). En-tête sur la
 * carte avec le mode en clair, bandeau collant (ancres + place du lecteur), podium et MVP dans tous les modes,
 * classement avec la forme manche par manche, manches une par une, barème en barres.
 */
export default function TournamentDetailPage() {
  const params = useParams()
  const tournamentId = typeof params.tournamentId === 'string' ? params.tournamentId : null
  const { clanId: selectedClanId } = useSelectedClan()
  const { members, permissions, isSuperUser } = useAuthSession()

  const [payload, setPayload] = useState<StandingsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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
          setError(response.status === 404 ? 'Ce tournoi n’existe pas ou a été supprimé.' : (data.error ?? 'Impossible de charger le tournoi.'))
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

  const viewer: TournamentViewer = useMemo(
    () => ({
      memberIds: members.map((member) => member.memberId),
      clanIds: members.map((member) => member.clanId).filter((id): id is number => id !== null),
    }),
    [members]
  )

  const tournament = payload?.tournament ?? null
  const rules = payload?.rules ?? null
  const standings = useMemo(() => payload?.modeStandings ?? [], [payload?.modeStandings])
  const rounds = payload?.rounds ?? []
  const organizerClanId = tournament?.organizerClan?.id ?? null

  // Les actions d'organisateur ne s'affichent que pour qui peut réellement les exécuter sur ce clan.
  const canManageTournament =
    isSuperUser ||
    (organizerClanId !== null &&
      selectedClanId === organizerClanId &&
      (permissions.includes('*') || permissions.includes('manage_settings')))

  const position = useMemo(
    () => (rules ? viewerPosition(standings, viewer, rules.mode) : null),
    [rules, standings, viewer]
  )

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

  const phase = tournament ? resolveTournamentPhase(tournament, now) : 'draft'
  const display = rules ? TOURNAMENT_MODE_DISPLAY[rules.mode] : null
  const lastRound = rounds[rounds.length - 1] ?? null
  const heroImage =
    mapAssetUrl(tournament?.mapName) ?? mapAssetUrl(lastRound?.mapName) ?? '/ClanLeaderboardTable.jpg'
  const squadView = rules?.mode === 'inter_clan' && granularity === 'squad'
  const displayedStandings = squadView ? (payload?.squadBreakdown ?? []) : standings
  const sections = rounds.length > 0 ? SECTIONS : SECTIONS_WITHOUT_ROUNDS
  const endsIn = phase === 'live' && tournament ? countdownLabel(tournament.endDate, now) : null
  const startsIn = phase === 'upcoming' && tournament ? countdownLabel(tournament.startDate, now) : null

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    <div className={`app-main-flush flex-1 game-ui ${rules ? tournamentModeClass(rules.mode) : ''}`}>
      <div className="app-container app-gutter">
        <NavigationTrail
          currentLabel={tournament?.title ?? 'Tournoi'}
          currentHref={`/tournaments/${tournamentId}`}
          fallbackParent={{ href: '/tournaments', label: 'Tournois' }}
        />

        {loading && !payload ? <p className="text-sm text-gray-500">Chargement du tournoi…</p> : null}
        {error ? (
          <p className="app-panel p-4 text-sm text-red-600">
            {error}{' '}
            <Link href="/tournaments" className="font-semibold text-[var(--theme-ui-accent-text)] hover:underline">
              Voir tous les tournois
            </Link>
          </p>
        ) : null}

        {tournament && rules && display ? (
          <header
            className="relative overflow-hidden rounded-2xl bg-slate-950 bg-cover bg-center text-white"
            style={{ backgroundImage: `url('${heroImage}')` }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 from-40% to-slate-950/55 md:bg-gradient-to-r md:from-slate-950/95 md:via-slate-950/75 md:to-slate-950/45" />
            <div className="relative grid items-end gap-4 p-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:p-[26px]">
              <div className="flex min-w-0 flex-col gap-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-[11px] font-black tracking-[0.1em] ${PHASE_BADGES[phase].className}`}>
                    {phase === 'live' ? <span className="h-[7px] w-[7px] animate-pulse rounded-full bg-white" aria-hidden="true" /> : null}
                    {PHASE_BADGES[phase].label}
                  </span>
                  <TournamentModeBadge mode={rules.mode} onImage />
                  <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] font-bold">
                    {tournamentFormatLabel(tournament)}
                  </span>
                </div>
                <h1 className="text-2xl font-black leading-tight tracking-[-0.02em] md:text-[34px]">{tournament.title}</h1>
                <span className="text-[13px] text-white/80">
                  {tournament.organizerClan ? (
                    <>
                      Organisé par{' '}
                      <Link href={`/clans/${tournament.organizerClan.id}/overview`} className="font-semibold text-white hover:underline">
                        {tournament.organizerClan.tag ? `[${tournament.organizerClan.tag}] ` : ''}
                        {tournament.organizerClan.name}
                      </Link>{' '}
                      ·{' '}
                    </>
                  ) : null}
                  {dayMonth.format(new Date(tournament.startDate))} → {dayMonth.format(new Date(tournament.endDate))}
                  {endsIn ? ` · se termine ${endsIn}` : ''}
                  {startsIn ? ` · commence ${startsIn}` : ''}
                </span>
                <span className={`text-[13px] text-white/90 [text-wrap:pretty] ${tournamentModeClass(rules.mode, true)}`}>
                  <b className="text-[var(--tmode-text)]">{display.label} :</b> {display.help}
                </span>
                {tournament.description ? <p className="text-[13px] text-white/75">{tournament.description}</p> : null}
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
              <div className="grid grid-cols-3 gap-2 tabular-nums">
                {[
                  { value: String(rounds.length), label: rounds.length > 1 ? 'manches' : 'manche' },
                  { value: String(standings.length), label: standings.length > 1 ? display.unit.many : display.unit.one },
                  {
                    value: lastRound ? hourMinute.format(new Date(lastRound.createdAt)) : '–',
                    label: lastRound ? `dernière manche · ${shortDate.format(new Date(lastRound.createdAt))}` : 'dernière manche',
                  },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-xl border border-white/15 bg-slate-950/60 p-2.5 text-center">
                    <b className="block text-[22px] font-black">{stat.value}</b>
                    <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-white/70">{stat.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </header>
        ) : null}
      </div>

      {tournament && rules && display ? (
        <>
          {/*
            Pas de période, mais le bandeau docke aussi sur mobile : exception décidée le 2026-09-27 pour les tournois
            (docs/TODO/sticky.md §2). Ancres et place du lecteur : un rappel, jamais un contrôle.
          */}
          <DockingToolbar ariaLabel="Sections du tournoi">
            <div className="flex w-full min-w-0 flex-wrap items-center gap-2.5">
              <SectionAnchorNav ariaLabel="Sections du tournoi" items={sections} />
              {position ? (
                <span
                  className="inline-flex h-[34px] min-w-0 items-center gap-2 rounded-[9px] border border-[var(--theme-ui-accent-ring)] bg-[var(--theme-ui-accent-soft)] px-3 text-[13px] text-[var(--theme-ui-accent-text)]"
                  data-testid="tournament-viewer-position"
                >
                  <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <b className="whitespace-nowrap">
                    {position.who} : {ordinal(position.rank)}
                  </b>
                  <span className="truncate">
                    {position.rank === 1
                      ? position.leadOverSecond !== null
                        ? `· en tête, ${formatTournamentPoints(position.leadOverSecond)} pts d’avance`
                        : '· en tête'
                      : `· à ${formatTournamentPoints(position.gapToLeader)} pts du 1er`}
                  </span>
                </span>
              ) : null}
            </div>
          </DockingToolbar>

          <div className="app-container app-gutter flex flex-col gap-[18px]">
            {notice ? <p className="app-panel-muted rounded-lg p-3 text-sm text-gray-700">{notice}</p> : null}

            <TournamentPodium standings={standings} mvp={payload?.mvp ?? null} />

            <section id="tournament-standings" aria-labelledby="tournament-standings-title" className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                <h2 id="tournament-standings-title" className="text-[17px] font-extrabold text-gray-900">Classement</h2>
                <span className="text-[13px] text-gray-500">
                  {displayedStandings.length} {displayedStandings.length > 1 ? (squadView ? 'escouades' : display.unit.many) : squadView ? 'escouade' : display.unit.one} ·{' '}
                  {rounds.length} manche{rounds.length > 1 ? 's' : ''}
                  {!squadView && rounds.length > 0 ? ' · la forme montre la place à chaque manche' : ''}
                </span>
                {rules.mode === 'inter_clan' && (payload?.squadBreakdown ?? []).length > 0 ? (
                  <SegmentedControl
                    className="ml-auto"
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
                <p className="app-panel p-4 text-sm text-gray-600">
                  {phase === 'upcoming'
                    ? 'Le tournoi n’a pas commencé : le classement apparaîtra après la première manche.'
                    : 'Aucune manche comptabilisée pour l’instant.'}
                  {canManageTournament
                    ? ' Lancez une synchronisation PUBG, ou vérifiez les filtres de format et de carte du tournoi.'
                    : ''}
                </p>
              ) : (
                <TournamentStandingsTable
                  mode={squadView ? 'custom_teams' : rules.mode}
                  standings={displayedStandings}
                  rounds={rounds}
                  viewer={viewer}
                  showForm={!squadView && rounds.length > 0}
                  prorata={rules.mode === 'inter_clan' && rules.mixedSquadRule === 'prorata'}
                />
              )}
            </section>

            {rules.mode === 'solo_ffa' ? <TournamentClanTrophy entries={payload?.clanTrophy ?? []} /> : null}

            {rounds.length > 0 ? (
              <section id="tournament-rounds" aria-label="Manches" className="flex flex-col gap-2.5">
                <TournamentRounds tournamentId={tournament.id} mode={rules.mode} rounds={rounds} standings={standings} viewer={viewer} />
              </section>
            ) : null}

            <section id="tournament-rules" aria-label="Barème">
              <TournamentRulesPanel rules={rules} />
            </section>
          </div>

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
