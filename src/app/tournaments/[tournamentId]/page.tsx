'use client'

import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Clock, Lock, Megaphone, RefreshCw, Settings, type LucideIcon } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import TournamentBroadcastModal from '@/components/discord/TournamentBroadcastModal'
import TournamentDetailHeader from '@/components/tournaments/TournamentDetailHeader'
import { tournamentModeClass } from '@/components/tournaments/TournamentModeBadge'
import {
  TournamentClanTrophy,
  TournamentEmptyStandings,
  TournamentPodium,
  TournamentRounds,
  TournamentRulesPanel,
  TournamentStandingsTable,
  TournamentViewerChip,
  type TournamentRules,
} from '@/components/tournaments/TournamentDetailSections'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import SectionAnchorNav, { type SectionAnchorNavItem } from '@/components/ui/SectionAnchorNav'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { useAuthSession } from '@/hooks/useAuthSession'
import { mapAssetUrl } from '@/lib/pubg-assets/map-asset'
import { tournamentManageAccess } from '@/lib/tournament-manage-access'
import {
  TOURNAMENT_SYNC_PROGRESS_MESSAGE,
  summarizeTournamentSync,
  tournamentSyncFailureMessage,
  type TournamentSyncPayload,
} from '@/lib/tournament-sync-summary'
import {
  TOURNAMENT_MODE_DISPLAY,
  resolveTournamentPhase,
  viewerPosition,
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
/** Docké sur mobile : ancres sans icône, pour tenir sur une ligne avec la place du lecteur (charte §6). */
const COMPACT_SECTIONS: SectionAnchorNavItem[] = SECTIONS.map(({ id, label }) => ({ id, label }))
const COMPACT_SECTIONS_WITHOUT_ROUNDS = COMPACT_SECTIONS.filter((section) => section.id !== 'tournament-rounds')

type Notice = { tone: 'progress' | 'success' | 'waiting' | 'error'; message: string }

const NOTICE_ICONS: Record<Notice['tone'], { icon: LucideIcon; ink: string }> = {
  progress: { icon: RefreshCw, ink: 't-sky animate-spin motion-reduce:animate-none' },
  success: { icon: CheckCircle2, ink: 't-pos' },
  waiting: { icon: Clock, ink: 't-warn' },
  error: { icon: AlertTriangle, ink: 't-neg' },
}

/**
 * Page d'un tournoi — docs/features/tournois.md, « Pages joueurs » (maquette « Tournois », 2026-09-27). En-tête sur la
 * carte avec le mode en clair, bandeau collant (ancres + place du lecteur), podium et MVP dans tous les modes,
 * classement avec la forme manche par manche, manches une par une, barème en barres.
 * Charte UI : docs/ui/index.html, section « Tournois » (04/10/2026).
 */
export default function TournamentDetailPage() {
  const params = useParams()
  const tournamentId = typeof params.tournamentId === 'string' ? params.tournamentId : null
  const { members, permissions, isSuperUser, activeMemberId, ownerFeatures } = useAuthSession()

  const [payload, setPayload] = useState<StandingsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [granularity, setGranularity] = useState<'clan' | 'squad'>('clan')
  const [broadcastOpen, setBroadcastOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  // Incrémenté après une synchronisation : le classement se recharge sans que l'organisateur recharge la page.
  const [reloadToken, setReloadToken] = useState(0)

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
  }, [tournamentId, reloadToken])

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

  // Les actions d'organisateur ne s'affichent que pour qui peut réellement les exécuter (même règle que les routes).
  const access = tournamentManageAccess(
    { isSuperUser, activeMemberId, permissions, members, ownerFeatures },
    tournament?.organizerClan ?? null
  )
  const canManageTournament = access.canManage

  const position = useMemo(
    () => (rules ? viewerPosition(standings, viewer, rules.mode) : null),
    [rules, standings, viewer]
  )

  async function syncTournament() {
    if (!organizerClanId || !tournamentId || !tournament) return
    setSyncing(true)
    setNotice({ tone: 'progress', message: TOURNAMENT_SYNC_PROGRESS_MESSAGE })
    let response: Response
    try {
      response = await fetch(`/api/clans/${organizerClanId}/tournaments/${tournamentId}/sync`, { method: 'POST' })
    } catch {
      setNotice({ tone: 'error', message: tournamentSyncFailureMessage(null, null) })
      setSyncing(false)
      return
    }
    const data = (await response.json().catch(() => null)) as TournamentSyncPayload | null
    if (response.ok) {
      setNotice(summarizeTournamentSync(data, tournament))
      setReloadToken((token) => token + 1)
    } else {
      setNotice({ tone: 'error', message: tournamentSyncFailureMessage(response.status, data) })
    }
    setSyncing(false)
  }

  if (!tournamentId) {
    return (
      <div className="app-container app-main flex-1">
        <p className="t-body t-neg">Tournoi invalide.</p>
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
  const compactSections = rounds.length > 0 ? COMPACT_SECTIONS : COMPACT_SECTIONS_WITHOUT_ROUNDS

  const organizerActions = canManageTournament ? (
    <>
      {/* Les joueurs ne voient pas ces boutons : le dire, pour que l'organisateur ne se demande pas qui d'autre les a. */}
      <p className="flex basis-full items-center gap-1.5 text-[12px] font-semibold text-white/70">
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Réservé à l’organisation — les joueurs ne voient pas ces boutons.
      </p>
      <button
        type="button"
        onClick={syncTournament}
        disabled={syncing || !access.canSync}
        aria-describedby={access.syncBlockedReason ? 'tournament-sync-blocked' : undefined}
        className="app-btn app-btn--sm app-btn--secondary"
      >
        <RefreshCw className={`mr-1.5 h-4 w-4 ${syncing ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden />
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
      {access.syncBlockedReason ? (
        <p id="tournament-sync-blocked" className="basis-full text-[12px] text-white/70">
          {access.syncBlockedReason}
        </p>
      ) : null}
    </>
  ) : null
  const NoticeIcon = notice ? NOTICE_ICONS[notice.tone] : null

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    // `.charte` : page migrée vers la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html. La couleur du
    // mode (`--tmode`) colore les barres de points et le trophée des clans.
    <div className={`app-main-flush game-ui charte flex-1 ${rules ? tournamentModeClass(rules.mode) : ''}`}>
      <div className="app-container app-gutter">
        <NavigationTrail
          currentLabel={tournament?.title ?? 'Tournoi'}
          currentHref={`/tournaments/${tournamentId}`}
          fallbackParent={{ href: '/tournaments', label: 'Tournois' }}
        />

        {loading && !payload ? <CardSkeleton /> : null}
        {error ? (
          <p className="app-panel t-body t-neg p-4">
            {error}{' '}
            <Link href="/tournaments" className="app-link font-semibold">
              Voir tous les tournois
            </Link>
          </p>
        ) : null}

        {tournament && rules ? (
          <TournamentDetailHeader
            tournament={tournament}
            mode={rules.mode}
            phase={phase}
            now={now}
            roundCount={rounds.length}
            participantCount={standings.length}
            lastRoundAt={lastRound?.createdAt ?? null}
            heroImage={heroImage}
            actions={organizerActions}
          />
        ) : null}
      </div>

      {tournament && rules && display ? (
        <>
          {/*
            Pas de période, mais le bandeau docke aussi sur mobile : exception décidée le 2026-09-27 pour les tournois
            (docs/TODO/sticky.md §2). Ancres et place du lecteur : un rappel, jamais un contrôle. Une seule ligne une fois
            docké sur mobile (charte §6) : ancres sans icône, place réduite au rang.
          */}
          <DockingToolbar ariaLabel="Sections du tournoi">
            {({ compact }) => (
              <div className={`flex w-full min-w-0 items-center ${compact ? 'flex-nowrap gap-1.5' : 'flex-wrap gap-2.5'}`}>
                <SectionAnchorNav ariaLabel="Sections du tournoi" items={compact ? compactSections : sections} />
                {position ? <TournamentViewerChip position={position} compact={compact} /> : null}
              </div>
            )}
          </DockingToolbar>

          <div className="app-container app-gutter flex flex-col gap-4 pb-8 sm:gap-5">
            {notice && NoticeIcon ? (
              <div className="app-panel-muted flex items-start gap-2.5 p-3" role="status" data-testid="tournament-sync-notice">
                <NoticeIcon.icon className={`mt-0.5 h-4 w-4 shrink-0 ${NoticeIcon.ink}`} aria-hidden />
                <p className="t-body min-w-0 flex-1 text-gray-700">{notice.message}</p>
              </div>
            ) : null}

            <TournamentPodium standings={standings} mvp={payload?.mvp ?? null} />

            <section id="tournament-standings" aria-labelledby="tournament-standings-title" className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                <h2 id="tournament-standings-title" className="t-section-title">Classement</h2>
                <span className="t-meta">
                  {displayedStandings.length} {displayedStandings.length > 1 ? (squadView ? 'escouades' : display.unit.many) : squadView ? 'escouade' : display.unit.one} ·{' '}
                  {rounds.length} manche{rounds.length > 1 ? 's' : ''}
                  {!squadView && rounds.length > 0 ? ' · la forme montre la place à chaque manche' : ''}
                </span>
                {rules.mode === 'inter_clan' && (payload?.squadBreakdown ?? []).length > 0 ? (
                  // Granularité du classement : contrôle propre à la section, il reste ici (sticky.md, « contrôle de section »).
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
                <TournamentEmptyStandings upcoming={phase === 'upcoming'} canManage={canManageTournament} />
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
                setNotice({ tone: 'success', message })
                setBroadcastOpen(false)
              }}
            />
          ) : null}
        </>
      ) : null}
    </div>
  )
}
