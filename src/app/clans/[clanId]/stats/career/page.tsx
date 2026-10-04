'use client'

import Link from 'next/link'
import { Clock, Crosshair, Medal, RefreshCw, Route, Trophy, type LucideIcon } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import CareerMetricCard from '@/components/clan-stats/CareerMetricCard'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import SectionAnchorNav, { type SectionAnchorNavItem } from '@/components/ui/SectionAnchorNav'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import {
  CAREER_GROUPS,
  careerHeadline,
  careerRefresh,
  computeCareerGroups,
  type CareerGroupId,
  type CareerMember,
} from '@/lib/clan-career'
import { elapsedLabel } from '@/lib/relative-time'

type CareerResponse = {
  clan: { id: number; name: string; tag: string | null }
  members: CareerMember[]
  activeMemberCount: number
  lifetimeSync: { expression: string; timezone: string; runsPerDay: number | null }
}

const GROUP_ICONS: Record<CareerGroupId, NonNullable<SectionAnchorNavItem['icon']>> = {
  engagement: 'playstyle',
  combat: 'combat',
  victory: 'victory',
  support: 'support',
  vehicle: 'vehicle',
  movement: 'movement',
  other: 'other',
}

/** Constante : SectionAnchorNav se réabonne quand ses `items` changent. */
const SECTIONS: SectionAnchorNavItem[] = CAREER_GROUPS.map((group) => ({
  id: `career-${group.id}`,
  label: group.title,
  icon: GROUP_ICONS[group.id],
}))

const HEADLINE_ICONS: Record<string, LucideIcon> = { time: Clock, kills: Crosshair, wins: Trophy, distance: Route }

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function runsPerDayLabel(runs: number | null) {
  if (runs === null) return null
  return runs === 1 ? 'une fois par jour' : `${runs} fois par jour`
}

/**
 * Carrière PUBG du clan — docs/features/statistiques.md (maquette « Statistiques », 2026-09-27). Cumuls depuis la
 * création des comptes, lus dans l'API PUBG : **aucune période**. Le bandeau ne docke donc pas sur mobile
 * (docs/TODO/sticky.md §2) ; sur ordinateur il garde les ancres des sept familles.
 */
export default function ClanCareerPage() {
  const params = useParams()
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])
  const [data, setData] = useState<CareerResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const now = useMemo(() => new Date(), [])

  useEffect(() => {
    if (!clanId) return
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setError('')
        const response = await fetch(`/api/clans/${clanId}/lifetime-stats`, { cache: 'no-store' })
        const payload = (await response.json()) as CareerResponse | { error?: string }
        if (!response.ok) throw new Error('error' in payload && payload.error ? payload.error : 'Impossible de charger la carrière du clan')
        if (!cancelled) setData(payload as CareerResponse)
      } catch (caught) {
        if (!cancelled) {
          setData(null)
          setError(caught instanceof Error ? caught.message : 'Impossible de charger la carrière du clan')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [clanId])

  const members = useMemo(() => data?.members ?? [], [data?.members])
  const groups = useMemo(() => computeCareerGroups(members), [members])
  const headline = useMemo(() => careerHeadline(members), [members])
  const refresh = useMemo(() => careerRefresh(members), [members])

  if (!clanId) {
    return (
      <div className="app-container app-main flex-1">
        <p className="text-sm text-[var(--theme-ui-negative)]">Clan invalide.</p>
      </div>
    )
  }

  const unsynced = data ? Math.max(0, data.activeMemberCount - members.length) : 0
  const frequency = data ? runsPerDayLabel(data.lifetimeSync.runsPerDay) : null

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    // `.charte` : page migrée vers la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-main-flush game-ui charte flex-1">
      <div className="app-container app-gutter">
        <NavigationTrail
          currentLabel="Carrière PUBG"
          currentHref={`/clans/${clanId}/stats/career`}
          fallbackParent={{ href: `/clans/${clanId}/stats`, label: 'Style de jeu du clan', altHref: '/clans' }}
        />
        {/* Hauteur du bandeau inchangée : seul son contenu suit la charte (titre Teko, pastilles sur la photo). */}
        <header
          className="app-on-photo bg-hero-fallback relative min-h-[10rem] overflow-hidden rounded-[14px] bg-cover bg-[center_40%] bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/clan-stats2.jpg')` }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-black/20 sm:bg-gradient-to-r sm:from-black/90 sm:via-black/45 sm:to-black/5" />
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2.5 px-3 py-2.5 sm:px-5 sm:py-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Medal className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />
              <h1 className="t-banner-title text-white drop-shadow-md">Carrière PUBG du clan</h1>
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs font-semibold text-white">
              <span className="rounded-full border border-[var(--theme-ui-accent-ring)] bg-[var(--theme-ui-accent-soft)] px-2.5 py-0.5 text-[var(--theme-ui-accent)]">
                Depuis la création des comptes
              </span>
              {data ? (
                <span className="rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5">
                  {members.length} joueur{members.length > 1 ? 's' : ''}
                </span>
              ) : null}
            </div>
          </div>
        </header>
      </div>

      {/* Pas de période : rien ne docke sur mobile (sticky.md §2). Au repos, fraîcheur et source ; docké, les ancres. */}
      <DockingToolbar ariaLabel="Sections de la carrière du clan" dockOnMobile={false}>
        {({ isSticky }) => (
          <div className="flex w-full flex-col gap-2.5">
            {!isSticky ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                {refresh ? (
                  <span className="inline-flex items-center gap-1.5">
                    <RefreshCw className="h-3.5 w-3.5 text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
                    Mis à jour {elapsedLabel(refresh.latest, now)}
                    {frequency ? ` · ${frequency}` : ''}
                  </span>
                ) : null}
                <span>Source : API PUBG, statistiques de carrière de chaque joueur</span>
                <Link href={`/clans/${clanId}/stats`} className="app-link ml-auto font-semibold">
                  Style de jeu du clan →
                </Link>
              </div>
            ) : null}
            {members.length > 0 ? <SectionAnchorNav ariaLabel="Familles de statistiques" items={SECTIONS} /> : null}
          </div>
        )}
      </DockingToolbar>

      <div className="app-container app-gutter flex flex-col gap-[22px]">
        {loading && !data ? <CardSkeleton /> : null}
        {error ? <p className="app-panel p-4 text-sm text-[var(--theme-ui-negative)]">{error}</p> : null}

        {data && members.length === 0 ? (
          <p className="app-panel p-4 text-sm text-gray-600">
            Aucune carrière PUBG synchronisée pour ce clan. Elle arrive avec la synchro quotidienne des statistiques de carrière.
          </p>
        ) : null}

        {data && members.length > 0 ? (
          <>
            {unsynced > 0 ? (
              <p className="app-panel-muted px-3 py-2 text-xs text-gray-600">
                {unsynced} membre{unsynced > 1 ? 's' : ''} actif{unsynced > 1 ? 's' : ''} sans carrière PUBG synchronisée (compte
                introuvable ou synchro à venir) : absent{unsynced > 1 ? 's' : ''} des totaux.
              </p>
            ) : null}

            <section aria-label="Totaux de carrière" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {headline.map((item) => {
                const Icon = HEADLINE_ICONS[item.id]
                return (
                  // KPI de la charte (`app-kpi`, chiffre héros Teko) en or de jeu : des cumuls de carrière, pas une période.
                  <div key={item.id} className="app-panel app-kpi relative overflow-hidden border-[var(--game-gold-ring)]!">
                    <Icon className="absolute -bottom-3 -right-2 h-[72px] w-[72px] text-[var(--game-gold)] opacity-15" aria-hidden="true" />
                    <span className="t-label">{item.label}</span>
                    <b className="t-hero t-hero--md t-gold">{item.value}</b>
                    <span className="app-kpi__foot">{item.detail}</span>
                  </div>
                )
              })}
            </section>

            {groups.map((group) => (
              <section key={group.id} id={`career-${group.id}`} aria-labelledby={`career-${group.id}-title`} className="flex flex-col gap-2.5">
                <h2 id={`career-${group.id}-title`} className="t-section-title">
                  {group.title}
                </h2>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  {group.results.map((result) => (
                    <CareerMetricCard key={result.metric.key} result={result} />
                  ))}
                </div>
              </section>
            ))}
          </>
        ) : null}
      </div>
    </div>
  )
}
