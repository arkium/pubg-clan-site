'use client'

import { Medal } from 'lucide-react'
import { useParams, useSearchParams } from 'next/navigation'
import { useMemo, useState } from 'react'

import MemberPageHeader from '@/components/member/MemberPageHeader'
import { CareerRecords, CareerThemes, MedalShowcase, SeasonsCard, ServiceRecord } from '@/components/player-career/CareerSections'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import SegmentedControl from '@/components/ui/SegmentedControl'
import SyncStatus from '@/components/ui/SyncStatus'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { useCanRefreshMember } from '@/hooks/useCanRefreshMember'
import { usePageData } from '@/hooks/usePageData'
import {
  CAREER_MODES,
  careerMedals,
  careerRecords,
  careerThemes,
  medalCounts,
  type CareerMode,
  type LifetimeStats,
  type MedalRanks,
  type SeasonRow,
} from '@/lib/player-career'

type CareerPayload = {
  stats: LifetimeStats
  statsByMode: { squad: LifetimeStats | null; duo: LifetimeStats | null; solo: LifetimeStats | null } | null
  clanRanks: MedalRanks
  lastRefreshedAt: string | null
  member: { displayName: string; pubgPlayerName: string; clanId: number | null; clan: { name: string; tag: string } | null } | null
}

const pickCareer = (payload: unknown) => {
  const body = payload as CareerPayload | null
  return body?.stats ? body : null
}
const pickSeasons = (payload: unknown) => (payload as { seasons?: SeasonRow[] } | null)?.seasons ?? null

const isCareerMode = (value: string | null): value is CareerMode => CAREER_MODES.some((mode) => mode.value === value)

/** Mode dans l'URL (`?mode=squad`), comme la période ailleurs : sans entrée d'historique. */
function writeMode(mode: CareerMode) {
  const query = new URLSearchParams(window.location.search)
  if (mode === 'all') query.delete('mode')
  else query.set('mode', mode)
  const search = query.toString()
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`)
}

function parseMemberId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Carrière PUBG d'un joueur — des états de service (maquette « Stats joueur », 2026-09-27 ; docs/features/carriere-joueur.md).
 * Chiffres officiels PUBG, sans période : plaque et états de service, saisons, vitrine des médailles du clan, hauts
 * faits, quatre fiches. Le mode (Tous, Squad, Duo, Solo) et la synchro vivent dans le bandeau, qui colle aussi sur mobile.
 */
export default function MemberCareerPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])
  const [mode, setModeState] = useState<CareerMode>(() => {
    const value = searchParams.get('mode')
    return isCareerMode(value) ? value : 'all'
  })
  const [seasonTab, setSeasonTab] = useState<'ranked' | 'normal' | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState('')
  const [now] = useState(() => new Date())

  const version = refreshNonce ? `?v=${refreshNonce}` : ''
  const career = usePageData(memberId ? `/api/members/${memberId}/stats${version}` : null, pickCareer)
  const seasons = usePageData(memberId ? `/api/members/${memberId}/season-stats${version}` : null, pickSeasons)
  const canRefresh = useCanRefreshMember(career.data?.member?.clanId)

  if (!memberId) {
    return (
      <div className="app-container app-main flex-1">
        <p className="text-sm text-red-600">Identifiant de joueur invalide.</p>
      </div>
    )
  }

  const data = career.data
  const byMode = data?.statsByMode ?? null
  const available = (value: CareerMode) => value === 'all' || !!byMode?.[value]
  const stats = data ? (mode === 'all' ? data.stats : (byMode?.[mode] ?? null)) : null
  const name = data?.member?.displayName ?? null

  function setMode(next: CareerMode) {
    setModeState(next)
    writeMode(next)
  }

  async function refresh() {
    setRefreshing(true)
    setRefreshError('')
    try {
      const responses = await Promise.all([
        fetch(`/api/members/${memberId}/stats`, { method: 'POST' }),
        fetch(`/api/members/${memberId}/season-stats`, { method: 'POST' }),
      ])
      if (responses.some((response) => !response.ok)) throw new Error()
    } catch {
      setRefreshError('Synchronisation PUBG impossible pour le moment.')
    } finally {
      setRefreshNonce((current) => current + 1)
      setRefreshing(false)
    }
  }

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    <div className="app-main-flush flex-1">
      <div className="app-container app-gutter space-y-4">
        <NavigationTrail
          currentLabel="Carrière PUBG"
          currentHref={`/members/${memberId}/stats`}
          fallbackParent={{ href: `/members/${memberId}/dashboard`, label: name ?? 'Tableau de bord', altHref: '/members' }}
        />
        <section>
          <MemberPageHeader
            title="Carrière PUBG"
            subtitle={name ? `Toute la carrière de ${name}, selon les chiffres officiels PUBG.` : 'Toute la carrière, selon les chiffres officiels PUBG.'}
            showBackButton={false}
            backgroundImage="/statsplayer.jpg"
            icon={<Medal className="h-4 w-4 text-amber-400 sm:h-6 sm:w-6" aria-hidden="true" />}
          />
        </section>
      </div>

      {/*
        Page sans période qui docke aussi sur mobile (exception à sticky.md §2, décision du 2026-09-27, maquette « Stats
        joueur ») : le mode et la synchro restent à portée pendant la lecture des fiches.
      */}
      <DockingToolbar ariaLabel="Mode et synchro de la carrière">
        <div className="flex w-full flex-nowrap items-center gap-2">
          <SegmentedControl
            options={CAREER_MODES.map((option) => ({ ...option, disabled: !!data && !available(option.value) }))}
            value={mode}
            onChange={setMode}
            size="xs"
            className="shrink-0"
          />
          <span className="ml-auto">
            <SyncStatus
              lastRefresh={data?.lastRefreshedAt ?? null}
              now={now}
              canRefresh={canRefresh}
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              subject="la carrière PUBG"
              prefix="Synchro PUBG"
              testId="career-sync"
            />
          </span>
        </div>
      </DockingToolbar>

      <div className="app-container app-gutter flex flex-col gap-3.5 pb-8 sm:gap-[18px]">
        {refreshError ? <p className="app-panel p-3 text-sm text-red-600">{refreshError}</p> : null}
        {career.error ? (
          <p className="app-panel p-4 text-sm text-gray-600">Carrière PUBG indisponible : aucun compte PUBG relié ou API injoignable.</p>
        ) : null}
        {!data && career.loading ? <CardSkeleton /> : null}

        {data ? (
          <div className={`flex flex-col gap-3.5 transition-opacity sm:gap-[18px] ${career.loading ? 'opacity-60' : ''}`} aria-busy={career.loading}>
            <div className="grid items-stretch gap-3.5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
              {stats ? (
                <ServiceRecord stats={stats} mode={mode} name={data.member?.pubgPlayerName ?? name ?? ''} clan={data.member?.clan ?? null} />
              ) : (
                <p className="app-panel p-4 text-sm text-gray-600">Aucune partie en {mode} dans la carrière PUBG.</p>
              )}
              <SeasonsCard seasons={seasons.data ?? []} tab={seasonTab} onTab={setSeasonTab} />
            </div>
            <MedalShowcase medals={careerMedals(data.clanRanks, data.stats)} counts={medalCounts(data.clanRanks)} mode={mode} />
            {stats ? (
              <>
                <CareerRecords records={careerRecords(stats)} />
                <CareerThemes themes={careerThemes(stats)} ranks={data.clanRanks} showMedals={mode === 'all'} />
              </>
            ) : null}
            <p className="text-xs text-gray-500">
              Chiffres officiels PUBG (carrière et saisons), synchronisés chaque nuit. Les médailles comparent les membres actifs
              du clan, tous modes confondus ; les ex æquo partagent la médaille. Soins et boosts : nombre d’objets utilisés.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
