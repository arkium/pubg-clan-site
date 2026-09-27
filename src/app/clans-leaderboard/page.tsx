'use client'

import { ArrowDownUp, Trophy } from 'lucide-react'
import { Suspense, useMemo, useState } from 'react'

import { LeagueFeed, LeaguePodium, LeagueRanking, LeagueTitles, PowerScoreHelp, type ClanAccess } from '@/components/clan-league/LeagueSections'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import PeriodFilter from '@/components/ui/PeriodFilter'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { useAuthSession } from '@/hooks/useAuthSession'
import { usePageData } from '@/hooks/usePageData'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { LEAGUE_CRITERIA, leagueCriterion, rankByCriterion, type LeagueCriterion } from '@/lib/clan-league'
import { clanBackgroundImage } from '@/lib/clan-image'
import type { ClanLeaguePayload } from '@/lib/clan-league-service'
import { PERIOD_OF_LABELS, PERIOD_WHEN_LABELS, STANDARD_PERIODS } from '@/lib/period'
import { elapsedLabel } from '@/lib/relative-time'

const pickLeague = (payload: unknown) => (payload as ClanLeaguePayload | null) ?? null

function LeagueContent() {
  // Période de la page : URL, puis mémoire de la visite, puis semaine (docs/TODO/sticky.md §4.E).
  const { period, setPeriod, ready } = usePagePeriod(STANDARD_PERIODS, 'week')
  const [criterion, setCriterion] = useState<LeagueCriterion>('power')
  const [blueOpen, setBlueOpen] = useState(false)
  const [now] = useState(() => new Date())
  const { authenticated, authDisabled, isSuperUser, members, activeMemberId } = useAuthSession()
  const { setClanId } = useSelectedClan()
  // « Mon clan » : celui du membre actif de la session (comme l'annuaire des clans) ; déconnecté, pas de pastille.
  const mineClanId = authenticated ? members.find((member) => member.memberId === activeMemberId)?.clanId ?? null : null

  // Ouverture d'un clan : même règle que l'annuaire des clans (SuperUser ou visiteur : tous ; membre : le sien).
  const access: ClanAccess = {
    canOpen: (clanId) => isSuperUser || authDisabled || clanId === mineClanId,
    onOpen: (clanId) => {
      setClanId(clanId, { force: true })
    },
  }

  const { data, loading, error } = usePageData(ready ? `/api/clans-leaderboard?period=${period}` : null, pickLeague)
  const ranked = useMemo(() => (data ? rankByCriterion(data.standings, criterion) : []), [criterion, data])
  const mine = ranked.find((entry) => entry.clanId === mineClanId) ?? null
  const mineIdle = data?.withoutMatch.find((clan) => clan.clanId === mineClanId) ?? null
  const criterionIndex = LEAGUE_CRITERIA.findIndex((entry) => entry.key === criterion)

  function goToMine() {
    if (!mineClanId) return
    if (mine && mine.position > 8) setBlueOpen(true)
    // Après l'ouverture éventuelle de la blue zone : la ligne existe alors dans la page.
    requestAnimationFrame(() => document.getElementById(`league-clan-${mineClanId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <>
      {/*
        Exception à sticky.md §2 (décision du 2026-09-27, maquette « Ligue clans ») : docké sur mobile, le bandeau garde,
        sur une ligne, la période, le critère (un bouton qui passe au suivant) et la pastille « Mon clan ».
      */}
      <DockingToolbar ariaLabel="Filtres de la ligue inter-clans">
        <div className="flex w-full flex-nowrap items-center gap-2">
          <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} size="xs" className="map-toolbar-period" />
          <div role="group" aria-label="Critère" className="hidden sm:block">
            <SegmentedControl options={LEAGUE_CRITERIA.map((entry) => ({ value: entry.key, label: entry.label }))} value={criterion} onChange={setCriterion} />
          </div>
          <button
            type="button"
            onClick={() => setCriterion(LEAGUE_CRITERIA[(criterionIndex + 1) % LEAGUE_CRITERIA.length].key)}
            aria-label={`Critère : ${leagueCriterion(criterion).label} (toucher pour passer au suivant)`}
            className="inline-flex h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-[var(--theme-ui-accent-ring)] bg-[var(--theme-ui-accent-soft)] px-2.5 text-[13px] font-bold text-[var(--theme-ui-accent-text)] sm:hidden"
          >
            <ArrowDownUp className="h-3.5 w-3.5" aria-hidden="true" />
            {leagueCriterion(criterion).label}
          </button>
          {mine || mineIdle ? (
            <button
              type="button"
              onClick={goToMine}
              className="ml-auto inline-flex h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-gray-200 bg-white px-2.5 text-[13px] font-bold text-gray-900"
              aria-label={mine ? `Mon clan : ${mine.position}e, aller à sa ligne` : 'Mon clan : sans partie, aller à sa ligne'}
              data-testid="mine-chip"
            >
              <span aria-hidden="true" className="h-[18px] w-[18px] rounded-[5px] bg-[#0b1120] bg-cover bg-center" style={{ backgroundImage: clanBackgroundImage((mine ?? mineIdle)?.imageUrl) }} />
              <span className="hidden sm:inline">Mon clan ·</span>
              {mine ? `#${mine.position}` : '—'}
            </button>
          ) : null}
        </div>
      </DockingToolbar>

      <div className="app-container app-gutter flex flex-col gap-4 pb-8 sm:gap-5">
        {error ? <p className="app-panel p-4 text-sm text-red-600">{error}</p> : null}
        {!data && loading ? <CardSkeleton /> : null}
        {data ? (
          <div className={`flex flex-col gap-4 transition-opacity sm:gap-5 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            <p className="text-xs text-gray-500" data-testid="league-freshness">
              {data.standings.length} clan{data.standings.length > 1 ? 's' : ''} classé{data.standings.length > 1 ? 's' : ''} {PERIOD_WHEN_LABELS[period]}
              {data.lastMatchAt ? ` · dernière partie prise en compte ${elapsedLabel(data.lastMatchAt, now)}` : ''}
              {period !== 'all' && criterion === 'power' ? ' · ▲▼ par rapport à la période précédente' : ''}
            </p>
            {ranked.length > 0 ? (
              <>
                <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
                  <LeaguePodium ranked={ranked} criterion={criterion} access={access} />
                  <LeagueFeed events={data.feed} />
                </div>
                <LeagueTitles titles={data.titles} periodOf={PERIOD_OF_LABELS[period]} />
                <LeagueRanking
                  ranked={ranked}
                  criterion={criterion}
                  showMovement={criterion === 'power' && period !== 'all'}
                  mineClanId={mineClanId}
                  blueOpen={blueOpen}
                  onToggleBlue={() => setBlueOpen((open) => !open)}
                  withoutMatch={data.withoutMatch}
                  periodWhen={PERIOD_WHEN_LABELS[period]}
                  access={access}
                />
              </>
            ) : (
              <p className="app-panel-muted p-4 text-sm text-gray-500">Aucun clan n’a joué de partie officielle {PERIOD_WHEN_LABELS[period]}.</p>
            )}
            <PowerScoreHelp />
          </div>
        ) : null}
      </div>
    </>
  )
}

/**
 * Ligue Inter-Clans — un classement qui se joue comme une partie (maquette « Ligue clans », 2026-09-27 ;
 * docs/features/ligue-clans.md). Podium en marches, fil de la ligue, titres, classement par cercle (dans la zone,
 * blue zone repliée, clans sans partie), pastille « Mon clan ». Données recalculées depuis les parties officielles.
 */
export default function ClansLeaderboardPage() {
  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    <div className="app-main-flush flex-1">
      <div className="app-container app-gutter">
        <header
          className="relative min-h-[10rem] overflow-hidden rounded-2xl bg-[#0b1120] bg-cover bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/ClanLeaderboardTable.jpg')`, backgroundPosition: 'center 40%' }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1.5 px-3.5 py-3 sm:px-6 sm:py-5">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-400 sm:h-6 sm:w-6" aria-hidden="true" />
              <h1 className="text-xl font-extrabold tracking-tight text-white drop-shadow-md sm:text-[26px]">Ligue Inter-Clans</h1>
            </div>
            <p className="text-[13px] text-white/80 drop-shadow-md">Les clans suivis, classés sur leurs parties officielles.</p>
          </div>
        </header>
      </div>

      {/* `usePagePeriod` lit `?period=` : une route statique exige cette frontière (CLAUDE.md, piège n° 5). */}
      <Suspense fallback={<div className="app-container app-gutter"><CardSkeleton /></div>}>
        <LeagueContent />
      </Suspense>
    </div>
  )
}
