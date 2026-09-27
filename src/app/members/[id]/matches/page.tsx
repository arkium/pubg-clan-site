'use client'

import { BarChart3, Crosshair, Flame, Plane, Trophy } from 'lucide-react'
import { useParams, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import MemberPageHeader from '@/components/member/MemberPageHeader'
import { KpiGrid } from '@/components/matches/MatchesUi'
import { Chronology, ModeBar, ModeMenu, SessionList } from '@/components/player-matches/PlayerMatchesSections'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import PeriodFilter from '@/components/ui/PeriodFilter'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { useIsSmallScreen } from '@/hooks/useIsSmallScreen'
import { usePageData } from '@/hooks/usePageData'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { formatPlayTime, frDecimal, sessionDateOf } from '@/lib/match-sessions'
import { PERIOD_WHEN_LABELS, STANDARD_PERIODS, type StandardPeriod } from '@/lib/period'
import {
  SESSIONS_PER_PAGE,
  chronologyPage,
  filterByMode,
  groupSessions,
  modeCounts,
  modeShares,
  parsePlayerMode,
  parseSessionDate,
  playerKpis,
  sessionPageOf,
  type PlayerMode,
} from '@/lib/player-matches'
import type { DashboardMatch, MatchesResponse } from '@/types/dashboard'

const pickMatches = (payload: unknown) => {
  const body = payload as MatchesResponse | null
  return body?.matches ? body : null
}
const pickName = (payload: unknown) => (payload as { displayName?: string } | null)?.displayName ?? null

const count = new Intl.NumberFormat('fr-FR')
const dayFormat = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })

/** Mode et soirée dans l'URL (`?mode=duo`, `?soiree=2026-09-26`), comme la période : sans entrée d'historique. */
function writeQuery(key: string, value: string | null) {
  const query = new URLSearchParams(window.location.search)
  if (value) query.set(key, value)
  else query.delete(key)
  const search = query.toString()
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`)
}

function parseMemberId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Carnet de vol d'un joueur (maquette « Matchs joueur », 2026-09-27 ; docs/features/matchs-joueur.md) : chiffres clés,
 * chronologie paginée par 10 (5 sur mobile), barre des modes, soirées paginées par 4 avec leurs cartes de fin de partie.
 * Période et mode dans le bandeau, qui colle aussi sur mobile ; la soirée ouverte vit dans l'URL.
 */
export default function MemberMatchesPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])
  // Période : URL, puis mémoire de la visite, puis semaine (docs/TODO/sticky.md §4.E).
  const { period, setPeriod, ready } = usePagePeriod(STANDARD_PERIODS, 'week')
  const [mode, setModeState] = useState<PlayerMode | null>(() => parsePlayerMode(searchParams.get('mode')))
  // `undefined` : la soirée la plus récente ; `null` : toutes repliées.
  const [openDate, setOpenDate] = useState<string | null | undefined>(() => parseSessionDate(searchParams.get('soiree')) ?? undefined)
  const [chronoPage, setChronoPage] = useState<number | null>(null)
  const [sessionPage, setSessionPage] = useState<number | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [now] = useState(() => new Date())
  const small = useIsSmallScreen()

  const base = memberId ? `/api/members/${memberId}` : null
  const response = usePageData(base && ready ? `${base}/matches?period=${period}&limit=all&sortBy=pubgCreatedAt&sortDirection=desc` : null, pickMatches)
  const name = usePageData(base, pickName).data

  // La carte choisie dans la chronologie est amenée à l'écran une fois sa soirée ouverte.
  useEffect(() => {
    if (!selectedId) return
    const frame = window.requestAnimationFrame(() => document.getElementById(`match-${selectedId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    return () => window.cancelAnimationFrame(frame)
  }, [selectedId])

  if (!memberId) {
    return (
      <div className="app-container app-main flex-1">
        <p className="text-sm text-red-600">Identifiant de joueur invalide.</p>
      </div>
    )
  }

  const data = response.data
  const all = data?.matches ?? []
  const mapLabels = data?.mapLabels ?? {}
  const matches = filterByMode(all, mode)
  const kpis = playerKpis(matches)
  const perPage = small ? 5 : 10
  const chrono = chronologyPage(matches, chronoPage, perPage)
  const sessions = groupSessions(matches)
  const effectiveOpen = openDate === null ? null : openDate && sessions.some((session) => session.date === openDate) ? openDate : (sessions[0]?.date ?? null)
  const sessionPageCount = Math.max(1, Math.ceil(sessions.length / SESSIONS_PER_PAGE))
  const currentSessionPage = Math.min(sessionPage ?? sessionPageOf(sessions, effectiveOpen), sessionPageCount)
  const visibleSessions = sessions.slice((currentSessionPage - 1) * SESSIONS_PER_PAGE, currentSessionPage * SESSIONS_PER_PAGE)
  const when = PERIOD_WHEN_LABELS[period]

  function resetView() {
    setChronoPage(null)
    setSessionPage(null)
    setOpenDate(undefined)
    setSelectedId(null)
    writeQuery('soiree', null)
  }

  function changePeriod(next: StandardPeriod) {
    setPeriod(next)
    resetView()
  }

  function changeMode(next: PlayerMode | null) {
    setModeState(next)
    writeQuery('mode', next)
    resetView()
  }

  function toggleSession(date: string) {
    const next = effectiveOpen === date ? null : date
    setOpenDate(next)
    setSelectedId(null)
    writeQuery('soiree', next)
  }

  function selectMatch(match: DashboardMatch) {
    const date = sessionDateOf(match.pubgCreatedAt)
    setOpenDate(date)
    setSessionPage(null)
    setSelectedId(match.id)
    writeQuery('soiree', date)
  }

  const best = kpis.best
  const subtitle = data
    ? `${kpis.games} partie${kpis.games > 1 ? 's' : ''} ${when} · ${formatPlayTime(kpis.playSeconds)} de jeu${kpis.wins > 0 ? ` · ${kpis.wins} chicken dinner${kpis.wins > 1 ? 's' : ''}` : ''}`
    : 'Tes parties, soirée par soirée.'

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    <div className="app-main-flush game-ui flex-1">
      <div className="app-container app-gutter space-y-4">
        <NavigationTrail
          currentLabel="Matchs"
          currentHref={`/members/${memberId}/matches`}
          fallbackParent={{ href: `/members/${memberId}/dashboard`, label: name ?? 'Tableau de bord', altHref: '/members' }}
        />
        <MemberPageHeader
          title={name ? `Carnet de vol de ${name}` : 'Carnet de vol'}
          subtitle={subtitle}
          showBackButton={false}
          backgroundImage="/matchesplayer.jpg"
          icon={<Plane className="h-4 w-4 text-amber-400 sm:h-6 sm:w-6" aria-hidden="true" />}
        />
      </div>

      {/*
        Exception à sticky.md §2 (décision du 2026-09-27, maquette « Matchs joueur ») : docké sur mobile, le bandeau garde
        la période et la pastille de mode, sur une ligne. Le champ de date exacte disparaît : les soirées le remplacent.
      */}
      <DockingToolbar ariaLabel="Filtres des matchs du joueur">
        <div className="flex w-full flex-nowrap items-center gap-2">
          <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={changePeriod} size="xs" className="map-toolbar-period" />
          <ModeMenu counts={modeCounts(all)} total={all.length} value={mode} onChange={changeMode} />
        </div>
      </DockingToolbar>

      <div className="app-container app-gutter flex flex-col gap-3.5 pb-8 sm:gap-[18px]">
        {response.error ? <p className="app-panel p-4 text-sm text-red-600">{response.error}</p> : null}
        {!data && response.loading ? <CardSkeleton /> : null}
        {data ? (
          <div className={`flex flex-col gap-3.5 transition-opacity sm:gap-[18px] ${response.loading ? 'opacity-60' : ''}`} aria-busy={response.loading}>
            <KpiGrid
              className="grid-cols-2 lg:grid-cols-4"
              items={[
                { label: 'Kills', value: count.format(kpis.kills), detail: `${frDecimal(kpis.killsPerGame)} par partie`, icon: Crosshair, color: 'var(--game-neg)' },
                { label: 'Dégâts', value: count.format(Math.round(kpis.damage)), detail: `${count.format(Math.round(kpis.damagePerGame))} par partie`, icon: Flame, color: 'var(--game-warn)' },
                {
                  label: 'Meilleure place',
                  value: best ? `#${best.placement}` : '—',
                  detail: best ? `${mapLabels[best.mapName] ?? best.mapName} · ${dayFormat.format(new Date(best.pubgCreatedAt)).replace('.', '')}` : 'aucune partie',
                  icon: Trophy,
                  color: 'var(--game-gold)',
                },
                {
                  label: 'Place moyenne',
                  value: kpis.averagePlace !== null ? `#${frDecimal(kpis.averagePlace)}` : '—',
                  detail: `sur ${kpis.games} partie${kpis.games > 1 ? 's' : ''}`,
                  icon: BarChart3,
                  color: 'var(--theme-ui-accent-text)',
                },
              ]}
            />
            {matches.length > 0 ? (
              <Chronology
                {...chrono}
                perPage={perPage}
                onPage={setChronoPage}
                selectedId={selectedId}
                onSelect={selectMatch}
                mapLabels={mapLabels}
                footer={<ModeBar shares={modeShares(matches)} playSeconds={kpis.playSeconds} />}
              />
            ) : null}
            <SessionList
              sessions={visibleSessions}
              page={currentSessionPage}
              pageCount={sessionPageCount}
              onPage={setSessionPage}
              openDate={effectiveOpen}
              onToggle={toggleSession}
              selectedId={selectedId}
              mapLabels={mapLabels}
              today={sessionDateOf(now)}
              small={small}
              period={period}
              emptyText={mode ? 'Aucune partie dans ce mode sur la période.' : 'Aucune partie sur la période.'}
            />
            <p className="text-xs text-gray-500">
              Parties suivies par le site, regroupées par soirée (de 06:00 à 06:00, heure de Paris). Mode : membres du clan dans
              l’équipe ; « Sans le clan » : aucun coéquipier du clan, donc pas de débriefing.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
