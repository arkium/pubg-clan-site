'use client'

import {
  Backpack,
  Bandage,
  Beer,
  Bomb,
  Car,
  Crosshair,
  Flame,
  Footprints,
  Medal,
  RefreshCw,
  Skull,
  Sprout,
  Trophy,
  Truck,
  type LucideIcon,
} from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import ClanTopPerformers from '@/components/awards/ClanTopPerformers'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import PeriodFilter from '@/components/ui/PeriodFilter'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import ToolbarGroup from '@/components/ui/ToolbarGroup'
import { usePagePeriod } from '@/hooks/usePagePeriod'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import RankCell from '@/components/ui/RankCell'
import { STANDARD_PERIODS, type StandardPeriod } from '@/lib/period'

type AwardPeriod = StandardPeriod
type AwardScope = 'normal' | 'all'

type AwardWinner = {
  memberId: number
  memberName: string
  value: number
}

type ClanAward = {
  key: string
  label: string
  description: string
  unit: string
  top3: AwardWinner[]
}

type ClanAwardsResponse = {
  clanId: number
  period: AwardPeriod
  scope: AwardScope
  periodKey: string
  matchCount: number
  awards: ClanAward[]
}

// Même vocabulaire que le classement (« Officiel » / « Tous ») ; l'API garde ses valeurs `normal` / `all`.
const SCOPE_OPTIONS: Array<{ value: AwardScope; label: string }> = [
  { value: 'normal', label: 'Officiel' },
  { value: 'all', label: 'Tous' },
]

const SCOPE_HINT =
  'Officiel : parties officielles en duo, trio et squad (sans casual, bots, customs ni modes spéciaux). Tous : tous les types de parties en duo, trio et squad.'

const REFRESH_HINT = 'Les awards sont gardés en cache ; Rafraîchir les recalcule depuis les matchs.'

/** Charte §5 : pas d'emoji — une tuile lucide teintée à l'accent par award (comme les défis). */
const AWARD_ICON_BY_KEY: Record<string, LucideIcon> = {
  top_killer: Skull,
  top_damage: Flame,
  jacky_tuning: Car,
  le_rodeur: Footprints,
  brouteur_herbe: Sprout,
  alcoolique_dimanche: Beer,
  fou_hopital: Bandage,
  destructeur: Bomb,
  le_sniper: Crosshair,
  collectionneur: Backpack,
  brute_metal: Truck,
}

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function formatDuration(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`
  }

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`
  }

  return `${remainingSeconds}s`
}

function formatAwardValue(award: ClanAward, value: number) {
  if (award.key === 'brouteur_herbe') {
    return formatDuration(value)
  }

  if (award.unit === 'm') {
    if (value >= 1000) {
      return `${(value / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} km`
    }

    return `${Math.round(value).toLocaleString('fr-FR')} m`
  }

  if (award.key === 'top_damage') {
    return `${Math.round(value).toLocaleString('fr-FR')} ${award.unit}`
  }

  return `${Math.round(value).toLocaleString('fr-FR')} ${award.unit}`
}

function getErrorMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') {
    return fallback
  }

  if ('error' in payload && typeof (payload as { error?: unknown }).error === 'string') {
    return (payload as { error: string }).error
  }

  return fallback
}

export default function ClanAwardsPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

  // Période de la page : URL, puis mémoire de la visite, puis semaine (docs/TODO/sticky.md §4.E).
  const { period, setPeriod, ready: periodReady } = usePagePeriod(STANDARD_PERIODS, 'week')
  const [scope, setScope] = useState<AwardScope>('normal')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<ClanAwardsResponse | null>(null)

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }

    setClanId(clanId)
  }, [clanId, router, setClanId])

  const loadAwards = useCallback(
    async (currentClanId: number, currentPeriod: AwardPeriod, currentScope: AwardScope, force = false) => {
      try {
        const forceParam = force ? '&force=true' : ''
        const response = await fetch(
          `/api/clans/${currentClanId}/awards?period=${currentPeriod}&scope=${currentScope}${forceParam}`,
          {
            cache: 'no-store',
          }
        )

        const data = (await response.json().catch(() => null)) as
          | ClanAwardsResponse
          | { error?: string }
          | null

        if (!response.ok || !data || !('awards' in data)) {
          if (response.status === 401 || response.status === 403) {
            router.replace(`/login?redirect=${encodeURIComponent(`/clans/${currentClanId}/awards`)}`)
            return
          }

          setPayload(null)
          setError(getErrorMessage(data, 'Chargement des awards impossible'))
          return
        }

        setPayload(data)
        setError(null)
      } catch (fetchError) {
        const message = fetchError instanceof Error ? fetchError.message : 'Chargement des awards impossible'
        setPayload(null)
        setError(message)
      }
    },
    [router]
  )

  useEffect(() => {
    if (!clanId || !periodReady) {
      return
    }

    let cancelled = false

    const run = async () => {
      setLoading(true)
      await loadAwards(clanId, period, scope)
      if (!cancelled) {
        setLoading(false)
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [clanId, period, periodReady, scope, loadAwards])

  const handleRefresh = useCallback(async () => {
    if (!clanId) {
      return
    }

    setRefreshing(true)
    await loadAwards(clanId, period, scope, true)
    setRefreshing(false)
  }, [clanId, period, scope, loadAwards])

  if (!clanId) {
    return null
  }

  const matchCount = payload?.matchCount ?? null

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    // `.charte` : page migrée vers la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-main-flush charte flex-1">
      <div className="app-container app-gutter">
        <NavigationTrail
          currentLabel="Awards"
          currentHref={`/clans/${clanId}/awards`}
          fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
        />
        {/* Hauteur du bandeau inchangée : seul son contenu suit la charte (titre Teko, pastille sur la photo). */}
        <header
          className="app-on-photo bg-hero-fallback relative min-h-[10rem] overflow-hidden rounded-[14px] bg-cover bg-center bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/awards.jpg')` }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 px-3 py-2.5 sm:px-5 sm:py-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Trophy className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />
              <h1 className="t-banner-title text-white drop-shadow-md">Awards du clan</h1>
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-200 drop-shadow-md sm:mt-2 sm:gap-2.5 sm:text-[13px]">
              {matchCount !== null ? (
                <span className="rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5 font-semibold text-white">
                  {matchCount} match{matchCount !== 1 ? 's' : ''} pris en compte
                </span>
              ) : null}
              <span>Distinctions fun, calculées à la volée</span>
            </p>
          </div>
        </header>
      </div>

      {/* Bandeau standard des pages à période (docs/TODO/sticky.md §4.A) : intitulés au repos ; docké sur mobile, la
          période seule. Rafraîchir : bouton de bandeau, plus sur la photo. */}
      <DockingToolbar ariaLabel="Filtres des awards">
        {({ isSticky, compact }) => (
          <div className="flex w-full flex-wrap items-end gap-3">
            <ToolbarGroup label="Période" showLabel={!isSticky}>
              <PeriodFilter periods={STANDARD_PERIODS} value={period} onChange={setPeriod} />
            </ToolbarGroup>
            {!compact ? (
              <ToolbarGroup label="Type de match" hint={SCOPE_HINT} showLabel={!isSticky}>
                <SegmentedControl options={SCOPE_OPTIONS} value={scope} onChange={setScope} size="sm" className="shrink-0" />
              </ToolbarGroup>
            ) : null}
            {/* Groupe étiré à la hauteur de la ligne : le bouton prend celle des segmented (une seule hauteur par ligne). */}
            {!compact ? (
              <ToolbarGroup label="Calcul" hint={REFRESH_HINT} showLabel={!isSticky} className="ml-auto self-stretch">
                <button
                  type="button"
                  className="app-toolbar-btn flex-1 shrink-0"
                  onClick={() => {
                    void handleRefresh()
                  }}
                  disabled={refreshing || loading}
                >
                  <RefreshCw className={`h-3.5 w-3.5${refreshing ? ' animate-spin' : ''}`} aria-hidden="true" />
                  {refreshing ? 'Rafraîchissement…' : 'Rafraîchir'}
                </button>
              </ToolbarGroup>
            ) : null}
          </div>
        )}
      </DockingToolbar>

      <div className="app-container app-gutter flex flex-col gap-6 pb-8">
        {loading && !payload ? <CardSkeleton /> : null}

        {error ? <p className="app-panel p-4 text-sm text-[var(--theme-ui-negative)]">{error}</p> : null}

        {/* Pendant un rechargement, les awards précédents restent affichés, estompés : la page ne se replie pas. */}
        {!error && payload ? (
          <section
            aria-label="Awards"
            aria-busy={loading}
            className={`grid grid-cols-1 gap-4 transition-opacity md:grid-cols-2 xl:grid-cols-3${loading ? ' opacity-60' : ''}`}
          >
            {payload.awards.map((award) => (
              <AwardCard key={award.key} award={award} />
            ))}
          </section>
        ) : null}

        {/* Top performers du clan (déplacés de la vue d'ensemble, docs/features/clans.md). */}
        {clanId && periodReady ? <ClanTopPerformers clanId={clanId} period={period} /> : null}
      </div>
    </div>
  )
}

/**
 * Un award : tuile lucide teintée, titre et règle, puis le lauréat mis en avant (médaille, chiffre héros Teko) et ses
 * deux suivants. Rangs par `RankCell` (charte §6 bis), aucune couleur en dur.
 */
function AwardCard({ award }: { award: ClanAward }) {
  const Icon = AWARD_ICON_BY_KEY[award.key] ?? Medal
  const [winner, ...followers] = award.top3
  return (
    <article className="app-panel flex flex-col gap-3 p-4" aria-label={award.label}>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--theme-ui-accent-soft)] shadow-[inset_0_0_0_1px_var(--theme-ui-accent-ring)]">
          <Icon className="h-[18px] w-[18px] text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <h2 className="t-card-title">{award.label}</h2>
          <span className="t-meta">{award.description}</span>
        </span>
      </div>

      {winner ? (
        <ol className="flex flex-col gap-1.5 border-t border-gray-200 pt-3">
          <li className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5" data-testid="award-winner">
            <RankCell rank={1} />
            <span className="truncate text-[15px] font-bold text-gray-900">{winner.memberName}</span>
            <b className="t-hero t-hero--sm t-accent">{formatAwardValue(award, winner.value)}</b>
          </li>
          {followers.map((entry, index) => (
            <li key={entry.memberId} className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5 text-[13px]">
              <span className="flex justify-center">
                <RankCell rank={index + 2} size="xs" />
              </span>
              <span className="truncate text-gray-700">{entry.memberName}</span>
              <span className="t-num text-gray-700">{formatAwardValue(award, entry.value)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="app-panel-muted p-3 text-sm text-gray-500">Pas de données sur cette période.</p>
      )}
    </article>
  )
}
