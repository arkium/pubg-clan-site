'use client'

import Image from 'next/image'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import MemberLifetimeStatsPanel from '@/components/MemberLifetimeStatsPanel'
import SectionNav from '@/components/SectionNav'
import MemberPageHeader from '@/components/member/MemberPageHeader'

type LifetimeStats = {
  combat: {
    kills: number
    deaths: number
    kdRatio: number
    headshots: number
    assists: number
    knockouts: number
    highestKillstreak: number
    longestKill: number
    teamkills: number
    suicides: number
  }
  victory: {
    wins: number
    losses: number
    winLossRatio: number
    longestTimeAlive: number
  }
  support: {
    teammatesRevived: number
    boostsUsed: number
    healed: number
  }
  vehicle: {
    vehiclesDestroyed: number
    roadkills: number
  }
  movement: {
    drivenDistance: number
    walkedDistance: number
    swamDistance: number
  }
  other: {
    weaponsPicked: number
    damageGiven: number
  }
}

type StatsByMode = {
  squad: LifetimeStats | null
  duo: LifetimeStats | null
  solo: LifetimeStats | null
}

type ClanMetricRanks = Record<string, 1 | 2 | 3 | null>

type MemberSeasonStatsRow = {
  id: number
  memberId: number
  seasonId: string
  rankedGameMode: string | null
  rankedTier: string | null
  rankedSubTier: string | null
  rankedPoints: number
  rankedBestTier: string | null
  rankedBestSubTier: string | null
  rankedBestPoints: number
  rankedKills: number
  rankedDamage: number
  rankedWins: number
  rankedMatches: number
  rankedAssists: number
  rankedRevives: number
  normalKills: number
  normalDamage: number
  normalWins: number
  normalLosses: number
  normalAssists: number
  normalRevives: number
  normalMatches: number
  lastRefreshedAt: string
}

type MemberSeasonStatsResponse = {
  memberId: number
  seasons: MemberSeasonStatsRow[]
}

const MEDAL_META: Record<1 | 2 | 3, { label: string; iconPath: string; alt: string }> = {
  1: { label: 'Or', iconPath: '/icons/medal-gold.svg', alt: 'Medaille or' },
  2: { label: 'Argent', iconPath: '/icons/medal-silver.svg', alt: 'Medaille argent' },
  3: { label: 'Bronze', iconPath: '/icons/medal-bronze.svg', alt: 'Medaille bronze' },
}

const MEDAL_CARD_META: Record<
  1 | 2 | 3,
  {
    accentClass: string
    badgeClass: string
    chipClass: string
  }
> = {
  1: {
    accentClass: 'member-medal-card--gold',
    badgeClass: 'member-medal-badge--gold',
    chipClass: 'member-medal-chip--gold',
  },
  2: {
    accentClass: 'member-medal-card--silver',
    badgeClass: 'member-medal-badge--silver',
    chipClass: 'member-medal-chip--silver',
  },
  3: {
    accentClass: 'member-medal-card--bronze',
    badgeClass: 'member-medal-badge--bronze',
    chipClass: 'member-medal-chip--bronze',
  },
}

const METRIC_LABELS: Record<string, string> = {
  'combat.kills': 'Kills',
  'combat.deaths': 'Morts',
  'combat.kdRatio': 'Ratio K/D',
  'combat.headshots': 'Headshots',
  'combat.assists': 'Assists',
  'combat.knockouts': 'KO',
  'combat.highestKillstreak': 'Serie max',
  'combat.longestKill': 'Distance max',
  'victory.wins': 'Victoires',
  'victory.losses': 'Defaites',
  'victory.winLossRatio': 'Ratio V/D',
  'victory.longestTimeAlive': 'Survie max',
  'support.teammatesRevived': 'Reanimation',
  'support.boostsUsed': 'Boosts',
  'support.healed': 'Soin',
  'vehicle.vehiclesDestroyed': 'Vehicules detruits',
  'vehicle.roadkills': 'Roadkills',
  'movement.drivenDistance': 'Distance vehicule',
  'movement.walkedDistance': 'Distance a pied',
  'movement.swamDistance': 'Distance nage',
  'other.weaponsPicked': 'Armes ramassees',
  'other.damageGiven': 'Degats infliges',
}

function formatCompactNumber(value: number) {
  const absValue = Math.abs(value)

  if (absValue >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}b`
  }

  if (absValue >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}m`
  }

  if (absValue >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`
  }

  return value.toLocaleString('fr-FR')
}

const RANKED_TIER_CLASS: Record<string, string> = {
  Bronze: 'border-amber-700/40 bg-amber-50 text-amber-800',
  Silver: 'border-slate-400/40 bg-slate-50 text-slate-700',
  Gold: 'border-yellow-500/40 bg-yellow-50 text-yellow-800',
  Platinum: 'border-cyan-500/40 bg-cyan-50 text-cyan-800',
  Diamond: 'border-blue-500/40 bg-blue-50 text-blue-800',
  Master: 'border-fuchsia-500/40 bg-fuchsia-50 text-fuchsia-800',
}

function parseMemberId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function formatTier(tier: string | null, subTier: string | null) {
  if (!tier) {
    return 'Non classe'
  }

  if (!subTier) {
    return tier
  }

  return `${tier} ${subTier}`
}

function formatSeasonShort(seasonId: string) {
  const segments = seasonId.split('.')
  const shortId = segments[segments.length - 1] ?? seasonId
  return `Saison ${shortId}`
}

function toPercent(wins: number, matches: number) {
  if (!matches) {
    return '0.0%'
  }

  return `${((wins / matches) * 100).toFixed(1)}%`
}

function toKd(kills: number, matches: number, wins: number) {
  const losses = Math.max(0, matches - wins)
  if (!losses) {
    return kills > 0 ? kills.toFixed(2) : '0.00'
  }

  return (kills / losses).toFixed(2)
}

export default function MemberStatsPage() {
  const params = useParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])

  const [lifetimeStats, setLifetimeStats] = useState<LifetimeStats | null>(null)
  const [statsByMode, setStatsByMode] = useState<StatsByMode | null>(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string | null>(null)
  const [clanRanks, setClanRanks] = useState<ClanMetricRanks>({})
  const [loadingStats, setLoadingStats] = useState(true)
  const [statsError, setStatsError] = useState('')
  const [seasonStats, setSeasonStats] = useState<MemberSeasonStatsRow[]>([])
  const [loadingSeasonStats, setLoadingSeasonStats] = useState(true)
  const [refreshingSeasonStats, setRefreshingSeasonStats] = useState(false)
  const [seasonStatsError, setSeasonStatsError] = useState('')

  const medalsByRank = useMemo(() => {
    const grouped: Record<1 | 2 | 3, string[]> = { 1: [], 2: [], 3: [] }

    for (const [metricKey, rank] of Object.entries(clanRanks)) {
      if (!rank) {
        continue
      }

      const label = METRIC_LABELS[metricKey]
      if (!label) {
        continue
      }

      grouped[rank].push(label)
    }

    return grouped
  }, [clanRanks])

  useEffect(() => {
    if (!memberId) {
      return
    }

    let cancelled = false

    async function loadStats() {
      setLoadingStats(true)
      setStatsError('')

      try {
        const response = await fetch(`/api/members/${memberId}/stats`)
        const payload = (await response.json()) as {
          stats?: LifetimeStats
          statsByMode?: StatsByMode | null
          clanRanks?: ClanMetricRanks
          lastRefreshedAt?: string | null
          error?: string
        }

        if (!response.ok) {
          throw new Error(payload.error ?? 'Impossible de charger les statistiques globales')
        }

        if (!cancelled) {
          setLifetimeStats(payload.stats ?? null)
          setStatsByMode(payload.statsByMode ?? null)
          setClanRanks(payload.clanRanks ?? {})
          setLastRefreshedAt(payload.lastRefreshedAt ?? null)
        }
      } catch (loadError) {
        if (!cancelled) {
          setStatsError(
            loadError instanceof Error
              ? loadError.message
              : 'Impossible de charger les statistiques globales'
          )
        }
      } finally {
        if (!cancelled) {
          setLoadingStats(false)
        }
      }
    }

    void loadStats()

    return () => {
      cancelled = true
    }
  }, [memberId])

  const loadSeasonStats = useCallback(async () => {
    if (!memberId) {
      return
    }

    try {
      setLoadingSeasonStats(true)
      setSeasonStatsError('')

      const response = await fetch(`/api/members/${memberId}/season-stats`, { cache: 'no-store' })
      const payload = (await response.json()) as MemberSeasonStatsResponse | { error?: string }

      if (!response.ok || !('seasons' in payload) || !Array.isArray(payload.seasons)) {
        throw new Error(
          'error' in payload && typeof payload.error === 'string'
            ? payload.error
            : 'Impossible de charger les stats de saison'
        )
      }

      setSeasonStats(payload.seasons)
    } catch (error) {
      setSeasonStats([])
      setSeasonStatsError(
        error instanceof Error ? error.message : 'Impossible de charger les stats de saison'
      )
    } finally {
      setLoadingSeasonStats(false)
    }
  }, [memberId])

  useEffect(() => {
    void loadSeasonStats()
  }, [loadSeasonStats])

  const refreshSeasonStats = useCallback(async () => {
    if (!memberId) {
      return
    }

    try {
      setRefreshingSeasonStats(true)
      const response = await fetch(`/api/members/${memberId}/season-stats`, {
        method: 'POST',
      })
      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(payload.error ?? 'Rafraichissement des stats de saison impossible')
      }

      await loadSeasonStats()
    } catch (error) {
      setSeasonStatsError(
        error instanceof Error
          ? error.message
          : 'Rafraichissement des stats de saison impossible'
      )
    } finally {
      setRefreshingSeasonStats(false)
    }
  }, [loadSeasonStats, memberId])

  if (!memberId) {
    return (
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <p className="text-sm text-red-600">ID joueur invalide.</p>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <MemberPageHeader
          title="Statistiques globales"
          subtitle="Vue complete des statistiques PUBG cumulees du joueur."
          showBackButton={false}
          framed={false}
        />
        <SectionNav section="member-section" />
      </section>

      {statsError && lifetimeStats ? (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          {statsError}
        </div>
      ) : null}

      <section className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Saison & ranked</h2>
            <p className="text-sm text-gray-600">
              Donnees PUBG de saison (ranked + normal squad) sur les 3 saisons les plus recentes.
            </p>
          </div>
          <button
            type="button"
            className="app-btn app-btn--sm app-btn--secondary"
            disabled={refreshingSeasonStats || loadingSeasonStats}
            onClick={() => {
              void refreshSeasonStats()
            }}
          >
            {refreshingSeasonStats ? 'Rafraichissement...' : 'Rafraichir'}
          </button>
        </div>

        {seasonStatsError ? (
          <p className="mb-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {seasonStatsError}
          </p>
        ) : null}

        {loadingSeasonStats ? (
          <p className="text-sm text-gray-600">Chargement des stats de saison...</p>
        ) : null}

        {!loadingSeasonStats && seasonStats.length === 0 ? (
          <p className="text-sm text-gray-600">Aucune statistique de saison disponible.</p>
        ) : null}

        {!loadingSeasonStats && seasonStats.length > 0 ? (
          <div className="space-y-3">
            {seasonStats.map((season) => {
              const tierClass = season.rankedTier
                ? RANKED_TIER_CLASS[season.rankedTier] ?? 'border-gray-300 bg-gray-50 text-gray-700'
                : 'border-gray-300 bg-gray-50 text-gray-700'

              return (
                <article key={season.id} className="rounded-lg border border-gray-200 bg-gray-50/40 p-3">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-gray-900">{formatSeasonShort(season.seasonId)}</p>
                    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-semibold ${tierClass}`}>
                      {formatTier(season.rankedTier, season.rankedSubTier)}
                    </span>
                    <span className="rounded-full border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700">
                      Best: {formatTier(season.rankedBestTier, season.rankedBestSubTier)}
                    </span>
                    <span className="rounded-full border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700">
                      RP: {Math.round(season.rankedPoints).toLocaleString('fr-FR')}
                    </span>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded border border-gray-200 bg-white p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Ranked</p>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <p>Kills: <span className="font-semibold">{season.rankedKills.toLocaleString('fr-FR')}</span></p>
                        <p>Damage: <span className="font-semibold">{Math.round(season.rankedDamage).toLocaleString('fr-FR')}</span></p>
                        <p>Wins: <span className="font-semibold">{season.rankedWins.toLocaleString('fr-FR')}</span></p>
                        <p>Matchs: <span className="font-semibold">{season.rankedMatches.toLocaleString('fr-FR')}</span></p>
                        <p>K/D: <span className="font-semibold">{toKd(season.rankedKills, season.rankedMatches, season.rankedWins)}</span></p>
                        <p>Winrate: <span className="font-semibold">{toPercent(season.rankedWins, season.rankedMatches)}</span></p>
                      </div>
                    </div>

                    <div className="rounded border border-gray-200 bg-white p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Normal squad</p>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <p>Kills: <span className="font-semibold">{season.normalKills.toLocaleString('fr-FR')}</span></p>
                        <p>Damage: <span className="font-semibold">{Math.round(season.normalDamage).toLocaleString('fr-FR')}</span></p>
                        <p>Wins: <span className="font-semibold">{season.normalWins.toLocaleString('fr-FR')}</span></p>
                        <p>Matchs: <span className="font-semibold">{season.normalMatches.toLocaleString('fr-FR')}</span></p>
                        <p>K/D: <span className="font-semibold">{toKd(season.normalKills, season.normalMatches, season.normalWins)}</span></p>
                        <p>Winrate: <span className="font-semibold">{toPercent(season.normalWins, season.normalMatches)}</span></p>
                      </div>
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-gray-500">
                    Mis a jour le {new Date(season.lastRefreshedAt).toLocaleString('fr-FR')}
                  </p>
                </article>
              )
            })}
          </div>
        ) : null}
      </section>

      <section className="member-stats-summary member-stats-summary--medals member-stats-summary--kpi mb-4 overflow-hidden rounded-3xl border border-amber-300/70 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-4 shadow-sm ring-1 ring-amber-100">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-600">Repères clés</p>
            <h2 className="text-2xl font-semibold tracking-tight text-gray-900">Résumé express des points importants</h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-700">
              Ce bloc rappelle les indicateurs les plus utiles pour lire rapidement la performance globale du joueur.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/90 px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            x{medalsByRank[1].length + medalsByRank[2].length + medalsByRank[3].length} médailles
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {[1, 2, 3].map((rank) => {
            const rankValue = rank as 1 | 2 | 3
            const medal = MEDAL_META[rankValue]
            const labels = medalsByRank[rankValue]
            const cardMeta = MEDAL_CARD_META[rankValue]
            const topLabels = labels.slice(0, 3)

            return (
              <article key={rank} className={`member-medal-card ${cardMeta.accentClass}`} data-rank={rankValue}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-gray-500">Rang {rank}</p>
                    <h3 className="mt-1 text-lg font-semibold tracking-tight text-gray-900">{medal.label}</h3>
                  </div>
                  <div className={`member-medal-badge ${cardMeta.badgeClass}`}>
                    <Image src={medal.iconPath} alt={medal.alt} width={72} height={72} className="drop-shadow-[0_14px_16px_rgba(15,23,42,0.22)]" />
                  </div>
                </div>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-4xl font-black leading-none tracking-tight text-gray-900">{labels.length}</p>
                    <p className="mt-1 text-sm font-medium text-gray-700">{labels.length > 1 ? 'médailles' : 'médaille'}</p>
                  </div>
                  <p className="max-w-[11rem] text-right text-xs leading-5 text-gray-600">
                    {labels.length > 0 ? topLabels.join(' · ') : 'Aucune metrique medalisee'}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {topLabels.length > 0 ? (
                    topLabels.map((label) => (
                      <span key={label} className={`member-medal-chip ${cardMeta.chipClass}`}>
                        {label}
                      </span>
                    ))
                  ) : (
                    <span className={`member-medal-chip ${cardMeta.chipClass}`}>En attente de podium</span>
                  )}
                </div>
              </article>
            )
          })}
        </div>

        {lifetimeStats ? (
          <div className="member-kpi-strip mt-3 rounded-2xl border border-white/80 bg-white/80 p-3">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Vue synthétique</p>
                <h3 className="text-base font-semibold text-gray-900">Les 4 signaux à retenir</h3>
              </div>
              <p className="hidden text-xs text-gray-500 sm:block">Lecture rapide des stats les plus parlantes</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <article className="member-kpi-card member-kpi-card--gold">
                <div className="member-kpi-card__head">
                  <span className="member-kpi-card__dot" />
                  <p>Victoires totales</p>
                </div>
                <p className="member-kpi-card__value">{lifetimeStats.victory.wins.toLocaleString()}</p>
                <p className="member-kpi-card__hint">Nombre total de parties gagnées.</p>
              </article>

              <article className="member-kpi-card member-kpi-card--blue">
                <div className="member-kpi-card__head">
                  <span className="member-kpi-card__dot" />
                  <p>Ratio K/D</p>
                </div>
                <p className="member-kpi-card__value">{lifetimeStats.combat.kdRatio.toFixed(2)}</p>
                <p className="member-kpi-card__hint">Efficacité globale entre kills et morts.</p>
              </article>

              <article className="member-kpi-card member-kpi-card--emerald">
                <div className="member-kpi-card__head">
                  <span className="member-kpi-card__dot" />
                  <p>Eliminations</p>
                </div>
                <p className="member-kpi-card__value">{lifetimeStats.combat.kills.toLocaleString()}</p>
                <p className="member-kpi-card__hint">Volume d'éliminations sur la période.</p>
              </article>

              <article className="member-kpi-card member-kpi-card--rose">
                <div className="member-kpi-card__head">
                  <span className="member-kpi-card__dot" />
                  <p>Dégâts infligés</p>
                </div>
                <p className="member-kpi-card__value">{formatCompactNumber(Math.round(lifetimeStats.other.damageGiven))}</p>
                <p className="member-kpi-card__hint">Pression offensive totale produite.</p>
              </article>
            </div>
          </div>
        ) : null}
      </section>

      <MemberLifetimeStatsPanel
        lifetimeStats={lifetimeStats}
        statsByMode={statsByMode}
        clanRanks={clanRanks}
        loadingStats={loadingStats}
        statsError={statsError}
        lastRefreshedAt={lastRefreshedAt}
      />
    </main>
  )
}