'use client'

import Link from 'next/link'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { BarChart3, ChevronLeft, ChevronRight, Clock3, Crosshair, Flame, Gamepad2, MoonStar, Trophy } from 'lucide-react'

import MatchResultCard from '@/components/matches/MatchResultCard'
import { KpiGrid, MatchesBanner, SectionTitle, type Kpi } from '@/components/matches/MatchesUi'
import SessionFlightPlan from '@/components/matches/SessionFlightPlan'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { TableSkeleton } from '@/components/ui/skeletons/TableSkeleton'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { useSquadMatches } from '@/hooks/useSquadMatches'
import {
  chronological,
  formatPlayTime,
  frDecimal,
  neighbourDates,
  sessionBannerMap,
  sessionDateOf,
  sessionDateParts,
  summarizeSession,
} from '@/lib/match-sessions'
import { mapAssetUrl } from '@/lib/pubg-assets'
import { MATCH_PERIODS, parsePeriod as parseMatchPeriod } from '@/lib/period'
import type { SquadPeriod } from '@/types/squad-matches'

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/** La soirée reprend la période de la liste d'où elle est ouverte (`?period=`). */
function parsePeriod(value: string | null): SquadPeriod {
  return parseMatchPeriod(value, MATCH_PERIODS, 'week')
}

function parseGameMode(value: string | null) {
  return value === 'duo' || value === 'trio' || value === 'squad' ? value : undefined
}

function isValidDateSegment(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return false
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

const numberFormat = new Intl.NumberFormat('fr-FR')
const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

/**
 * Soirée du clan — refonte du 2026-09-26 (docs/features/matches.md, maquette Claude Design « Matchs et soirées »,
 * écrans 10b, 10d, 10f) : même bandeau que la liste, navigation datée entre soirées, plan de vol, cartes de fin de
 * partie.
 */
export default function ClanSessionDatePage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })

  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const period = useMemo(() => parsePeriod(searchParams.get('period')), [searchParams])
  const gameMode = useMemo(() => parseGameMode(searchParams.get('gameMode')), [searchParams])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }

    setClanId(clanId)
  }, [clanId, router, setClanId])

  const validDate = isValidDateSegment(params.date)
  const date = validDate && typeof params.date === 'string' ? params.date : null

  const { clanName, mapLabels, squads, loading, error } = useSquadMatches(clanId, period, gameMode)

  const sessionMatches = useMemo(
    () => (date ? chronological(squads.filter((match) => sessionDateOf(match.createdAt) === date)) : []),
    [date, squads]
  )
  const summary = useMemo(() => summarizeSession(sessionMatches), [sessionMatches])
  const sessionMaxKills = useMemo(
    () => Math.max(0, ...sessionMatches.flatMap((match) => match.members.map((member) => member.kills))),
    [sessionMatches]
  )

  const sortedSessionDates = useMemo(
    () => Array.from(new Set(squads.map((match) => sessionDateOf(match.createdAt)))).sort((a, b) => b.localeCompare(a)),
    [squads]
  )
  const currentDateIndex = useMemo(() => sortedSessionDates.findIndex((value) => value === date), [date, sortedSessionDates])
  const previousDate = currentDateIndex >= 0 ? sortedSessionDates[currentDateIndex + 1] : undefined
  const nextDate = currentDateIndex > 0 ? sortedSessionDates[currentDateIndex - 1] : undefined
  const dayChips = useMemo(() => (date ? neighbourDates(sortedSessionDates, date, 7) : []), [date, sortedSessionDates])

  const sessionHref = useCallback(
    (targetDate: string) => {
      const paramsBuilder = new URLSearchParams({ period })
      if (gameMode) paramsBuilder.set('gameMode', gameMode)
      return `/clans/${clanId}/matches/session/${targetDate}?${paramsBuilder.toString()}`
    },
    [clanId, gameMode, period]
  )

  const selectMatch = useCallback((matchId: string) => {
    setSelectedId(matchId)
    document.getElementById(`match-${matchId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [])

  if (!clanId || !date) {
    return null
  }

  const { full } = sessionDateParts(date)
  const bannerMap = sessionBannerMap(sessionMatches)
  const games = summary.games
  const kpis: Kpi[] = [
    { label: 'Kills', value: numberFormat.format(summary.kills), detail: `${games ? frDecimal(summary.kills / games) : '0'} par partie`, icon: Crosshair, color: 'var(--game-neg)' },
    {
      label: 'Dégâts',
      value: numberFormat.format(Math.round(summary.damage)),
      detail: `${games ? numberFormat.format(Math.round(summary.damage / games)) : '0'} par partie`,
      icon: Flame,
      color: 'var(--game-warn)',
    },
    {
      label: 'Meilleure place',
      value: summary.best ? `#${summary.best.place}` : '—',
      detail: summary.best
        ? `${mapLabels[summary.best.match.mapName] ?? summary.best.match.mapName} · ${timeFormat.format(new Date(summary.best.match.createdAt))}`
        : '',
      icon: Trophy,
      color: 'var(--game-gold)',
    },
    {
      label: 'Place moyenne',
      value: summary.averagePlace !== null ? `#${frDecimal(summary.averagePlace)}` : '—',
      detail: `sur ${games} partie${games > 1 ? 's' : ''}`,
      icon: BarChart3,
      color: 'var(--theme-ui-accent)',
    },
  ]

  const dayLabel = (value: string) => {
    const parts = sessionDateParts(value)
    return `${parts.weekday} ${parts.day}`
  }

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    // `.charte` : page migrée vers la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-main-flush game-ui charte flex-1">
      <div className="app-container app-gutter">
        <NavigationTrail
          currentLabel={full}
          currentHref={`/clans/${clanId}/matches/session/${date}`}
          fallbackParent={{ href: `/clans/${clanId}/matches`, label: 'Soirées du clan', altHref: '/clans' }}
        />
        <MatchesBanner
          image={bannerMap ? mapAssetUrl(bannerMap) : '/matches.jpg'}
          eyebrow={clanName ? `Soirée · ${clanName}` : 'Soirée du clan'}
          icon={MoonStar}
          iconColor="var(--theme-ui-accent)"
          title={full}
          chips={[
            { icon: Gamepad2, text: `${games} partie${games > 1 ? 's' : ''}` },
            { icon: Clock3, text: `${formatPlayTime(summary.durationSeconds)} de jeu` },
            ...(summary.wins > 0 ? [{ icon: Trophy, text: `${summary.wins} chicken dinner${summary.wins > 1 ? 's' : ''}`, gold: true }] : []),
          ]}
        />
      </div>

      {/*
        Pas de période : le bandeau ne docke pas sur mobile (docs/TODO/sticky.md §2). Une seule hauteur par ligne : les
        boutons ‹ › (habillage app-toolbar-btn) et les jours s'étirent à la hauteur de la ligne, sans hauteur fixe.
      */}
      <DockingToolbar ariaLabel="Navigation entre les soirées" dockOnMobile={false}>
        <nav className="flex w-full items-stretch gap-3" aria-label="Soirées voisines">
          {previousDate ? (
            <Link
              href={sessionHref(previousDate)}
              className="app-toolbar-btn shrink-0"
              aria-label={`Soirée précédente : ${sessionDateParts(previousDate).full}`}
            >
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              {dayLabel(previousDate)}
            </Link>
          ) : (
            <span className="app-toolbar-btn shrink-0 opacity-45" aria-disabled="true">
              <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Précédente
            </span>
          )}
          <ol className="hidden min-w-0 flex-1 justify-center gap-1 overflow-hidden sm:flex">
            {dayChips.map((value) => {
              const parts = sessionDateParts(value)
              const current = value === date
              return (
                <li key={value} className="flex">
                  <Link
                    href={sessionHref(value)}
                    title={parts.full}
                    aria-current={current ? 'page' : undefined}
                    className="inline-flex min-h-8 min-w-10 flex-col items-center justify-center rounded-lg border px-1 text-[11px] font-semibold leading-none"
                    style={
                      current
                        ? { borderColor: 'var(--theme-ui-accent-ring)', background: 'var(--theme-ui-accent-soft)', color: 'var(--theme-ui-accent-text)' }
                        : { borderColor: 'var(--theme-ui-border)', color: 'var(--theme-ui-text-muted)' }
                    }
                  >
                    <b className="t-num text-[13px] leading-tight">{parts.day}</b>
                    {parts.weekday}
                  </Link>
                </li>
              )
            })}
          </ol>
          <span className="t-meta flex flex-1 items-center justify-center sm:hidden">
            {currentDateIndex >= 0 ? `Soirée ${sortedSessionDates.length - currentDateIndex} / ${sortedSessionDates.length}` : ''}
          </span>
          {nextDate ? (
            <Link
              href={sessionHref(nextDate)}
              className="app-toolbar-btn shrink-0"
              aria-label={`Soirée suivante : ${sessionDateParts(nextDate).full}`}
            >
              {dayLabel(nextDate)}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ) : (
            <span className="app-toolbar-btn shrink-0 opacity-45" aria-disabled="true">
              Suivante
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          )}
        </nav>
      </DockingToolbar>

      <div className="app-container app-gutter flex flex-col gap-4">
        {loading && sessionMatches.length === 0 ? <TableSkeleton /> : null}
        {error ? <p className="app-panel p-4 text-sm text-[var(--theme-ui-negative)]">{error}</p> : null}

        {!error && sessionMatches.length > 0 ? (
          <div aria-busy={loading} className={`flex flex-col gap-4 ${loading ? 'opacity-60' : ''}`}>
            <KpiGrid items={kpis} className="grid-cols-2 lg:grid-cols-4" />
            {/* `key` : une autre soirée rouvre le plan de vol sur sa première page. */}
            <SessionFlightPlan
              key={date}
              matches={sessionMatches}
              mapLabels={mapLabels}
              selectedId={selectedId}
              onSelect={selectMatch}
              start={summary.start}
              end={summary.end}
            />
            <section className="flex flex-col gap-2.5" aria-labelledby="session-games-title">
              <SectionTitle>
                <span id="session-games-title">Parties de la soirée</span>
              </SectionTitle>
              <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr))]">
                {sessionMatches.map((match) => (
                  <MatchResultCard
                    key={match.id}
                    clanId={clanId}
                    period={period}
                    match={match}
                    mapLabel={mapLabels[match.mapName] ?? match.mapName}
                    sessionMaxKills={sessionMaxKills}
                    selected={match.id === selectedId}
                  />
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {!loading && !error && sessionMatches.length === 0 ? (
          <p className="app-panel t-body p-4 text-gray-500">Aucune partie trouvée pour cette date avec les filtres actuels.</p>
        ) : null}
      </div>
    </div>
  )
}
