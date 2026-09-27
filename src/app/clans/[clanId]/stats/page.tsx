'use client'

import Link from 'next/link'
import { Radar } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import {
  CooperationSection,
  ItemUseSection,
  PlaystyleRoleCards,
  PlaystyleThemeCards,
  SectionHeading,
  SynergySection,
} from '@/components/clan-stats/PlaystyleSections'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import PeriodFilter from '@/components/ui/PeriodFilter'
import SectionAnchorNav, { type SectionAnchorNavItem } from '@/components/ui/SectionAnchorNav'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { useClanMatchesCache } from '@/hooks/useClanMatchesCache'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { playstyleContext, type ClanPlaystyleRow, type CooperationPair } from '@/lib/clan-playstyle'
import type { ItemUseStats } from '@/lib/item-use-stats'
import { STANDARD_PERIODS } from '@/lib/period'

/** Constante : SectionAnchorNav se réabonne quand ses `items` changent. */
const SECTIONS: SectionAnchorNavItem[] = [
  { id: 'sec-profile', label: 'Profil de jeu', icon: 'playstyle' },
  { id: 'sec-items', label: 'Objets consommés', icon: 'support' },
  { id: 'sec-synergies', label: 'Synergies', icon: 'victory' },
  { id: 'sec-cooperation', label: 'Coopération', icon: 'other' },
]

/**
 * Synergies et coopération : type de match « Officiel », comme le réglage par défaut de la vue d'ensemble, et tous
 * modes confondus (décision du 2026-09-27) — les chiffres des deux pages concordent pour une même période.
 */
const SYNERGY_MATCH_TYPE = 'official' as const

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/** Charge une API de la page ; pendant un rechargement, la réponse précédente reste affichée. */
function usePageData<T>(url: string | null, pick: (payload: unknown) => T | null) {
  // L'adresse de la dernière réponse reçue : « en chargement » tant qu'elle diffère de l'adresse demandée.
  const [state, setState] = useState<{ url: string | null; data: T | null; error: string }>({ url: null, data: null, error: '' })

  useEffect(() => {
    if (!url) return
    let cancelled = false
    fetch(url, { cache: 'no-store' })
      .then(async (response) => {
        const payload: unknown = await response.json().catch(() => null)
        if (!response.ok) throw new Error('Chargement impossible.')
        if (!cancelled) setState({ url, data: pick(payload), error: '' })
      })
      .catch((caught: unknown) => {
        if (!cancelled) setState({ url, data: null, error: caught instanceof Error ? caught.message : 'Chargement impossible.' })
      })
    return () => {
      cancelled = true
    }
    // `pick` est une fonction pure déclarée au niveau du module : seule l'adresse compte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  const loading = url === null || state.url !== url
  return { data: state.data, loading, error: loading ? '' : state.error }
}

const pickPlaystyle = (payload: unknown) => ((payload as { rows?: ClanPlaystyleRow[] } | null)?.rows ?? [])
const pickBots = (payload: unknown) => (payload as { data?: { avgBotsPerMatch: number | null } } | null)?.data?.avgBotsPerMatch ?? null
const pickItems = (payload: unknown) => (payload as { data?: ItemUseStats } | null)?.data ?? null
const pickPairs = (payload: unknown) => ((payload as { rows?: CooperationPair[] } | null)?.rows ?? [])

/**
 * Style de jeu du clan — docs/features/statistiques.md (maquette « Statistiques », 2026-09-27). Tout ce que mesure la
 * télémétrie des matchs, sur **une seule période** (semaine par défaut) : profil de jeu, objets consommés, synergies et
 * coopération. La carrière PUBG (cumuls depuis la création des comptes, sans période) a sa propre page.
 */
export default function ClanStatsPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

  // Période de la page : URL, puis mémoire de la visite, puis semaine (docs/TODO/sticky.md §4.E).
  const { period, setPeriod, ready } = usePagePeriod(STANDARD_PERIODS, 'week')

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }
    setClanId(clanId)
  }, [clanId, router, setClanId])

  const base = clanId && ready ? `/api/clans/${clanId}` : null
  const playstyle = usePageData(base && `${base}/telemetry/playstyle?period=${period}`, pickPlaystyle)
  const bots = usePageData(base && `${base}/bot-stats?period=${period}`, pickBots)
  const items = usePageData(base && `${base}/telemetry/item-use?period=${period}`, pickItems)
  const cooperation = usePageData(
    base && `${base}/telemetry/synergies?period=${period}&matchType=${SYNERGY_MATCH_TYPE}&mode=all`,
    pickPairs
  )
  const { data: matchesCache, loading: synergiesLoading } = useClanMatchesCache(base ? clanId : null, period, SYNERGY_MATCH_TYPE)

  if (!clanId) return null

  const rows = playstyle.data ?? []
  const synergies = matchesCache?.payload.byMode.all?.synergies ?? null

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    <div className="app-main-flush flex-1">
      <div className="app-container app-gutter">
        <NavigationTrail
          currentLabel="Style de jeu du clan"
          currentHref={`/clans/${clanId}/stats`}
          fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
        />
        <header
          className="relative min-h-[10rem] overflow-hidden rounded-2xl bg-cover bg-[center_45%] bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/clan-stats.jpg')` }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-black/20 sm:bg-gradient-to-r sm:from-black/85 sm:via-black/40 sm:to-black/5" />
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2.5 px-3 py-2.5 sm:px-5 sm:py-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Radar className="h-4 w-4 text-emerald-400 sm:h-6 sm:w-6" aria-hidden="true" />
              <h1 className="text-sm font-bold tracking-tight text-white drop-shadow-md sm:text-xl md:text-2xl">Style de jeu du clan</h1>
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs font-semibold text-white">
              {playstyle.data ? (
                <span className="rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5">
                  {rows.length} joueur{rows.length > 1 ? 's' : ''} analysé{rows.length > 1 ? 's' : ''}
                </span>
              ) : null}
              <span className="rounded-full border border-emerald-400/60 bg-emerald-500/20 px-2.5 py-0.5 text-emerald-200">
                Télémétrie des matchs
              </span>
            </div>
          </div>
        </header>
      </div>

      <DockingToolbar ariaLabel="Filtres du style de jeu du clan">
        {({ isSticky, compact }) => (
          <div className="flex w-full flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} />
              {!isSticky ? (
                <>
                  <span className="text-xs text-gray-500" data-testid="playstyle-context">
                    {playstyleContext(rows, bots.data ?? null)}
                  </span>
                  <Link href={`/clans/${clanId}/stats/career`} className="ml-auto text-xs font-semibold text-[var(--theme-ui-accent-text)] hover:underline">
                    Carrière PUBG du clan →
                  </Link>
                </>
              ) : null}
            </div>
            {/* Ancres : seconde ligne du bandeau, jamais un second élément collant (sticky.md §4.B). */}
            {!compact ? <SectionAnchorNav ariaLabel="Sections du style de jeu" items={SECTIONS} /> : null}
          </div>
        )}
      </DockingToolbar>

      <div className="app-container app-gutter flex flex-col gap-[22px]">
        <section id="sec-profile" aria-labelledby="sec-profile-title" className="flex flex-col gap-3">
          <SectionHeading id="sec-profile-title" title="Profil de jeu" subtitle="Moyenne des joueurs du clan, et les trois qui incarnent le mieux chaque rôle." />
          {playstyle.loading && !playstyle.data ? <CardSkeleton /> : null}
          {playstyle.error ? <p className="text-sm text-red-600">{playstyle.error}</p> : null}
          {playstyle.data ? (
            rows.length > 0 ? (
              <div aria-busy={playstyle.loading} className={`flex flex-col gap-3 ${playstyle.loading ? 'opacity-60' : ''}`}>
                <PlaystyleRoleCards rows={rows} />
                <PlaystyleThemeCards rows={rows} />
              </div>
            ) : (
              <p className="app-panel p-4 text-sm text-gray-600">Aucun match analysé par la télémétrie sur cette période.</p>
            )
          ) : null}
        </section>

        <section id="sec-items" aria-labelledby="sec-items-title" className="flex flex-col gap-3">
          <SectionHeading id="sec-items-title" title="Objets consommés" subtitle="Soins, boosts, carburant et gadgets réellement utilisés en match." />
          {items.loading && !items.data ? <CardSkeleton /> : null}
          {items.error ? <p className="text-sm text-red-600">{items.error}</p> : null}
          {!items.error && (items.data || !items.loading) ? (
            <div aria-busy={items.loading} className={`flex flex-col gap-3 ${items.loading ? 'opacity-60' : ''}`}>
              <ItemUseSection key={period} stats={items.data} />
            </div>
          ) : null}
        </section>

        <section id="sec-synergies" aria-labelledby="sec-synergies-title" className="flex flex-col gap-3">
          <SectionHeading
            id="sec-synergies-title"
            title="Synergies d'équipe"
            subtitle="Duos, trios et squads les plus actifs ensemble en parties officielles, classés par matchs joués puis par taux de victoire."
          />
          {synergiesLoading && !synergies ? <CardSkeleton /> : null}
          {synergies || !synergiesLoading ? (
            <div aria-busy={synergiesLoading} className={synergiesLoading ? 'opacity-60' : ''}>
              <SynergySection synergies={synergies} />
            </div>
          ) : null}
        </section>

        <section id="sec-cooperation" aria-labelledby="sec-cooperation-title" className="flex flex-col gap-3">
          <SectionHeading
            id="sec-cooperation-title"
            title="Coopération"
            subtitle="Entraide entre coéquipiers en parties officielles : réanimations, éliminations à deux (co-kills) et rappels de squad (recalls)."
          />
          {cooperation.loading && !cooperation.data ? <CardSkeleton /> : null}
          {cooperation.error ? <p className="text-sm text-red-600">{cooperation.error}</p> : null}
          {cooperation.data ? (
            <div aria-busy={cooperation.loading} className={`flex flex-col gap-3 ${cooperation.loading ? 'opacity-60' : ''}`}>
              <CooperationSection pairs={cooperation.data} />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  )
}
