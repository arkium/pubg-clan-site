'use client'

import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Clock, Lock, Megaphone, RefreshCw, Settings, type LucideIcon } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import TournamentBroadcastModal from '@/components/discord/TournamentBroadcastModal'
import TournamentDetailHeader from '@/components/tournaments/TournamentDetailHeader'
import { tournamentModeClass } from '@/components/tournaments/TournamentModeBadge'
import {
  TournamentClanFilter,
  TournamentClanTrophy,
  TournamentEmptyStandings,
  TournamentRounds,
  TournamentRulesPanel,
  TournamentPlayerTable,
  TournamentStandingsTable,
  TournamentViewerChip,
  type TournamentRules,
} from '@/components/tournaments/TournamentDetailSections'
import {
  TournamentAwards,
  TournamentClanAverageTable,
  TournamentLeaders,
  TournamentPodium,
  TournamentWeapons,
} from '@/components/tournaments/TournamentStatsSections'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import SectionAnchorNav, { type SectionAnchorNavItem } from '@/components/ui/SectionAnchorNav'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useTournamentAutoSync } from '@/hooks/useTournamentAutoSync'
import { mapAssetUrl } from '@/lib/pubg-assets/map-asset'
import { tournamentManageAccess } from '@/lib/tournament-manage-access'
import { TOURNAMENT_SYNC_HINT, type TournamentSyncNotice } from '@/lib/tournament-sync-summary'
import {
  TOURNAMENT_MODE_DISPLAY,
  participantClanIds,
  resolveTournamentPhase,
  viewerPosition,
  type TournamentViewer,
} from '@/lib/tournament-mode-display'
import type { TournamentRoundView, TournamentStandingView } from '@/lib/tournament-standings-view'
import type {
  TournamentAwardsView,
  TournamentClanAverage,
  TournamentLeaders as TournamentLeadersData,
  TournamentWeapon,
} from '@/lib/tournament-stats'

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
  /** Manches escouade par escouade : tableau de chaque manche et forme du détail par escouade (inter-clans). */
  squadRounds?: TournamentRoundView[]
  /** Détail par player (inter-clans) : même barème, joueur par joueur. */
  playerBreakdown?: TournamentStandingView[]
  /** Kills de chaque player à chaque manche. */
  playerRounds?: Array<{ index: number; scores: Array<{ key: string; bestPlacement: number; totalKills: number }> }>
  /** Clans qui ont participé, et leurs noms : le filtre « Clan » des détails par squad et par player. */
  participantClanIds?: number[]
  clans?: Record<string, { name: string; tag: string | null }>
  clanTrophy?: Array<{ clanId: number; label: string; points: number; kills: number; players: number }>
  rounds?: TournamentRoundView[]
  mvp?: { memberId: number; label: string; kills: number; damage: number } | null
  /** Moyenne par player de chaque clan (inter-clans) : l'onglet « Moyenne par clan ». */
  clanAverages?: TournamentClanAverage[]
  /** Top killers (le premier est le MVP) et top scorers, sous le podium. */
  leaders?: TournamentLeadersData
  /** Awards et fun facts ; `null` si la route n'a pas pu les calculer. */
  awards?: TournamentAwardsView | null
  weapons?: TournamentWeapon[]
  /** Logo des clans du podium. */
  clanImages?: Record<string, string | null>
  error?: string
}

const SECTIONS: SectionAnchorNavItem[] = [
  { id: 'tournament-podium', label: 'Podium', icon: 'podium' },
  { id: 'tournament-standings', label: 'Classement', icon: 'victory' },
  { id: 'tournament-rounds', label: 'Manches', icon: 'combat' },
  { id: 'tournament-awards', label: 'Awards', icon: 'award' },
  { id: 'tournament-weapons', label: 'Armes', icon: 'weapon' },
  { id: 'tournament-rules', label: 'Barème', icon: 'other' },
]

/**
 * Ancres du bandeau docké, sur une seule ligne avec la place du lecteur (charte §6) : awards et armes, qui se suivent,
 * y partagent une ancre « Stats » (vers la première des deux présente). Sur mobile, ni icône, ni « Podium » (en haut de
 * page), ni « Barème » : mesuré le 2026-10-11, 392 px pour 343 avec « Podium ».
 */
function dockedSections(present: SectionAnchorNavItem[], compact: boolean): SectionAnchorNavItem[] {
  const merged: SectionAnchorNavItem[] = []
  for (const section of present) {
    const stats = section.id === 'tournament-awards' || section.id === 'tournament-weapons'
    if (stats && merged.some((entry) => entry.label === 'Stats')) continue
    if (compact && (section.id === 'tournament-rules' || section.id === 'tournament-podium')) continue
    const label = stats ? 'Stats' : section.label
    merged.push(compact ? { id: section.id, label } : { id: section.id, label, icon: stats ? 'award' : section.icon })
  }
  return merged
}

const NOTICE_ICONS: Record<TournamentSyncNotice['tone'], { icon: LucideIcon; ink: string }> = {
  progress: { icon: RefreshCw, ink: 't-sky animate-spin motion-reduce:animate-none' },
  success: { icon: CheckCircle2, ink: 't-pos' },
  waiting: { icon: Clock, ink: 't-warn' },
  error: { icon: AlertTriangle, ink: 't-neg' },
}

/**
 * Page d'un tournoi — docs/features/tournois.md, « Pages joueurs » (maquette « Tournois », 2026-09-27). En-tête sur la
 * carte avec le mode en clair, bandeau collant (ancres + place du lecteur), podium en marches et top killers / top
 * scorers (le MVP en tête des killers), classement avec la forme manche par manche (et la moyenne par clan en
 * inter-clans), manches une par une, awards et fun facts, armes du tournoi, barème en barres.
 * Charte UI : docs/ui/index.html, section « Tournois » (04/10/2026).
 *
 * Rendue par la page serveur `src/app/tournaments/[tournamentId]/page.tsx`, qui lui passe `findings` : un résumé du
 * tournoi rendu côté serveur, affiché à la place du chargement puis remplacé par la page complète
 * (docs/TODO/geo-seo-propositions.md, lot 2).
 */
export default function TournamentDetailPage({ findings }: { findings?: React.ReactNode }) {
  const params = useParams()
  const tournamentId = typeof params.tournamentId === 'string' ? params.tournamentId : null
  const { members, permissions, isSuperUser, activeMemberId, ownerFeatures } = useAuthSession()

  const [payload, setPayload] = useState<StandingsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [granularity, setGranularity] = useState<'clan' | 'average' | 'squad' | 'player'>('clan')
  // Filtre « Clan » des détails par squad et par player (`null` = tous).
  const [clanFilter, setClanFilter] = useState<number | null>(null)
  const [broadcastOpen, setBroadcastOpen] = useState(false)
  // Message de la diffusion Discord ; la synchronisation a le sien (`autoSync.notice`).
  const [notice, setNotice] = useState<TournamentSyncNotice | null>(null)
  // Incrémenté quand une manche arrive : le classement se recharge sans que l'organisateur recharge la page.
  const [reloadToken, setReloadToken] = useState(0)
  // Synchronisation avec relance automatique chaque minute tant qu'aucune manche n'arrive (10 essais).
  const autoSync = useTournamentAutoSync((_job, outcome) => {
    if (outcome.kind === 'synced' && outcome.summary.tone === 'success') setReloadToken((token) => token + 1)
  })

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

  // Pas d'ancre vers une section absente (sans manche, sans award, sans arme). Mémorisées : SectionAnchorNav dépend de
  // l'identité de `items`.
  const hasPodium = standings.length > 0
  const hasRounds = rounds.length > 0
  const awards = payload?.awards ?? null
  const hasAwards = Boolean(awards && (awards.awards.length > 0 || awards.facts.length > 0))
  const weapons = useMemo(() => payload?.weapons ?? [], [payload?.weapons])
  const hasWeapons = weapons.length > 0
  const anchors = useMemo(() => {
    const present = SECTIONS.filter(
      (section) =>
        (section.id !== 'tournament-podium' || hasPodium) &&
        (section.id !== 'tournament-rounds' || hasRounds) &&
        (section.id !== 'tournament-awards' || hasAwards) &&
        (section.id !== 'tournament-weapons' || hasWeapons)
    )
    return { rest: present, docked: dockedSections(present, false), compact: dockedSections(present, true) }
  }, [hasPodium, hasRounds, hasAwards, hasWeapons])

  function syncTournament() {
    if (!organizerClanId || !tournamentId || !tournament) return
    setNotice(null)
    autoSync.start({ clanId: organizerClanId, tournamentId, target: tournament })
  }
  const syncing = autoSync.syncingTournamentId !== null
  // Un message de diffusion, plus récent, passe devant celui de la synchronisation.
  const shownNotice = notice ?? autoSync.notice

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
  const playerView = rules?.mode === 'inter_clan' && granularity === 'player'
  // Moyenne par clan (2026-10-11) : points des players du clan ÷ nombre de players.
  const averageView = rules?.mode === 'inter_clan' && granularity === 'average'
  const clanAverages = payload?.clanAverages ?? []
  const displayedStandings = squadView
    ? (payload?.squadBreakdown ?? [])
    : playerView
      ? (payload?.playerBreakdown ?? [])
      : standings
  // Les squads ou players d'un clan qui a participé ; le rang reste celui du classement complet.
  const filterable = squadView || playerView
  const filteredStandings =
    filterable && clanFilter !== null
      ? displayedStandings.filter((standing) => participantClanIds(standing.participant).includes(clanFilter))
      : displayedStandings
  const filterClans = (payload?.participantClanIds ?? [])
    .map((id) => {
      const clan = payload?.clans?.[String(id)]
      return { id, label: clan ? (clan.tag ? `[${clan.tag}] ${clan.name}` : clan.name) : `Clan ${id}` }
    })
    .sort((left, right) => left.label.localeCompare(right.label, 'fr'))
  const displayedUnit = squadView
    ? { one: 'squad', many: 'squads' }
    : playerView
      ? { one: 'player', many: 'players' }
      : display?.unit
  // Forme : place de chaque escouade à chaque manche en détail par escouade, de chaque participant du mode sinon.
  const formRounds = squadView ? (payload?.squadRounds ?? []) : rounds
  // Manches escouade par escouade en inter-clans (demande du 2026-10-11) : une ligne par équipe PUBG, joueurs et clans,
  // plutôt que des clans aux points partagés. Le cumul par clan d'une manche reste au débrief, onglet du tournoi.
  const squadRounds = payload?.squadRounds ?? []
  const roundsBySquad = rules?.mode === 'inter_clan' && squadRounds.length === rounds.length && squadRounds.length > 0

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
        disabled={syncing}
        aria-describedby="tournament-sync-hint"
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
      <p id="tournament-sync-hint" className="basis-full text-[12px] text-white/70">
        {TOURNAMENT_SYNC_HINT}
      </p>
    </>
  ) : null
  const NoticeIcon = shownNotice ? NOTICE_ICONS[shownNotice.tone] : null

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

        {/* Pendant le chargement : le résumé du serveur (titre, dates, podium — dans le HTML), puis le squelette. */}
        {loading && !payload ? (
          <div className="flex flex-col gap-4">
            {findings}
            <CardSkeleton />
          </div>
        ) : null}
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
            // Bandeau de remerciement (2026-10-11) : les clans qui ont joué au moins une manche, par ordre alphabétique.
            thanksClans={rounds.length > 0 ? filterClans.map((clan) => clan.label) : []}
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
            {({ isSticky, compact }) => (
              // Docké : une seule ligne ; les ancres gardent leur largeur, la phrase du lecteur se coupe (« … ») si besoin.
              <div
                className={`flex w-full min-w-0 items-center ${isSticky ? 'flex-nowrap' : 'flex-wrap'} ${compact ? 'gap-1.5' : 'gap-2.5'}`}
              >
                <SectionAnchorNav
                  ariaLabel="Sections du tournoi"
                  items={compact ? anchors.compact : isSticky ? anchors.docked : anchors.rest}
                  className={isSticky ? 'shrink-0' : undefined}
                />
                {position ? <TournamentViewerChip position={position} compact={compact} /> : null}
              </div>
            )}
          </DockingToolbar>

          <div className="app-container app-gutter flex flex-col gap-4 pb-8 sm:gap-5">
            {shownNotice && NoticeIcon ? (
              <div className="app-panel-muted flex items-start gap-2.5 p-3" role="status" data-testid="tournament-sync-notice">
                <NoticeIcon.icon className={`mt-0.5 h-4 w-4 shrink-0 ${NoticeIcon.ink}`} aria-hidden />
                <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
                  <p className="t-body text-gray-700">{shownNotice.message}</p>
                  {!notice && autoSync.waiting ? (
                    <button type="button" onClick={autoSync.stop} className="app-btn app-btn--xs app-btn--secondary">
                      Arrêter les essais
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* Podium en marches comme la ligue, puis top killers et top scorers (demande du 2026-10-11). */}
            {hasPodium ? (
              <div id="tournament-podium" className="flex flex-col gap-4 sm:gap-5">
                <TournamentPodium mode={rules.mode} standings={standings} clanImages={payload?.clanImages ?? {}} />
                {payload?.leaders ? <TournamentLeaders leaders={payload.leaders} viewer={viewer} /> : null}
              </div>
            ) : null}

            <section id="tournament-standings" aria-labelledby="tournament-standings-title" className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                <h2 id="tournament-standings-title" className="t-section-title">Classement</h2>
                {averageView ? (
                  <span className="t-meta">
                    {clanAverages.length} clan{clanAverages.length > 1 ? 's' : ''} · moyenne = points des players du clan
                    (détail par player) ÷ nombre de players
                  </span>
                ) : (
                  <span className="t-meta">
                    {filteredStandings.length} {filteredStandings.length > 1 ? displayedUnit?.many : displayedUnit?.one}
                    {filteredStandings.length !== displayedStandings.length ? ` sur ${displayedStandings.length}` : ''} ·{' '}
                    {rounds.length} manche{rounds.length > 1 ? 's' : ''}
                    {playerView
                      ? ` · M1 à M${rounds.length} : kills de chaque player à chaque manche`
                      : formRounds.length > 0
                        ? ' · la forme montre la place à chaque manche'
                        : ''}
                  </span>
                )}
                {rules.mode === 'inter_clan' && (payload?.squadBreakdown ?? []).length > 0 ? (
                  // Granularité du classement : contrôle propre à la section, il reste ici (sticky.md, « contrôle de section »).
                  <span className="ml-auto flex flex-wrap items-stretch gap-2">
                    {filterable && filterClans.length > 1 ? (
                      <TournamentClanFilter clans={filterClans} value={clanFilter} onChange={setClanFilter} />
                    ) : null}
                    <SegmentedControl
                    options={[
                      { value: 'clan', label: 'Cumul par clan' },
                      ...(clanAverages.length > 0 ? [{ value: 'average' as const, label: 'Moyenne par clan' }] : []),
                      { value: 'squad', label: 'Détail par squad' },
                      { value: 'player', label: 'Détail par player' },
                    ]}
                      value={granularity}
                      onChange={setGranularity}
                    />
                  </span>
                ) : null}
              </div>
              {displayedStandings.length === 0 ? (
                <TournamentEmptyStandings upcoming={phase === 'upcoming'} canManage={canManageTournament} />
              ) : averageView ? (
                <TournamentClanAverageTable entries={clanAverages} viewer={viewer} />
              ) : playerView ? (
                // Clé du filtre : changer de clan ramène à la première page.
                <TournamentPlayerTable
                  key={clanFilter ?? 'tous'}
                  standings={filteredStandings}
                  rounds={payload?.playerRounds ?? []}
                  viewer={viewer}
                />
              ) : (
                <TournamentStandingsTable
                  mode={squadView ? 'custom_teams' : rules.mode}
                  standings={filteredStandings}
                  rounds={formRounds}
                  viewer={viewer}
                  showForm={formRounds.length > 0}
                  bySquad={squadView}
                  // Une escouade marque tous ses points : le prorata ne partage que le cumul par clan.
                  prorata={!squadView && rules.mode === 'inter_clan' && rules.mixedSquadRule === 'prorata'}
                />
              )}
            </section>

            {rules.mode === 'solo_ffa' ? <TournamentClanTrophy entries={payload?.clanTrophy ?? []} /> : null}

            {rounds.length > 0 ? (
              <section id="tournament-rounds" aria-label="Manches" className="flex flex-col gap-2.5">
                <TournamentRounds
                  tournamentId={tournament.id}
                  mode={rules.mode}
                  rounds={roundsBySquad ? squadRounds : rounds}
                  standings={roundsBySquad ? (payload?.squadBreakdown ?? []) : standings}
                  viewer={viewer}
                  bySquad={roundsBySquad}
                />
              </section>
            ) : null}

            {awards && hasAwards ? (
              <section id="tournament-awards" aria-label="Awards du tournoi">
                <TournamentAwards data={awards} />
              </section>
            ) : null}

            {hasWeapons ? (
              <section id="tournament-weapons" aria-label="Armes du tournoi">
                <TournamentWeapons weapons={weapons} viewer={viewer} />
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
