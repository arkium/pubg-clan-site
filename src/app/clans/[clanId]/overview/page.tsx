'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import SectionNav from '@/components/SectionNav'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { useClanOverview } from '@/hooks/useClanOverview'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import type { ClanMatchesResponse } from '@/types/squad-matches'

type DiffResult = {
  pubgClanId: string
  shard: string
  pubgMembersCount: number
  matched: Array<{ accountId: string; pubgName: string | null; memberId: number; displayName: string }>
  inPubgOnly: Array<{ accountId: string; pubgName: string | null }>
  inSiteOnly: Array<{ memberId: number; displayName: string; pubgAccountId: string }>
  unverified: Array<{ memberId: number; displayName: string }>
}

type OverviewPeriod = 'week' | 'month' | 'all'

type TopPerformer = {
  memberId: number
  displayName: string
  value: number
  matchesPlayed: number
} | null

type OverviewTrackedSnapshot = {
  aggregated: {
    totalKills: number
    totalDamage: number
    totalAssists: number
    totalRevives: number
    matchesPlayed: number
    matchesWon: number
    winRate: number
  }
  topPerformers: {
    kills: TopPerformer
    damage: TopPerformer
    winRate: TopPerformer
  }
}

const OVERVIEW_PERIOD_OPTIONS: Array<{ value: OverviewPeriod; label: string }> = [
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
  { value: 'all', label: 'Tous' },
]

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function fmtNum(value: number) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(value))
}

function fmtPct(value: number) {
  return `${(value * 100).toFixed(1).replace('.', ',')} %`
}

function fmtDate(value: string | Date | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

function fmtRelative(value: string | Date | null) {
  if (!value) return '—'
  const diffMs = Date.now() - new Date(value).getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 2) return "à l'instant"
  if (mins < 60) return `il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `il y a ${hours}h`
  const days = Math.floor(hours / 24)
  return `il y a ${days} jour${days > 1 ? 's' : ''}`
}

function getPeriodDateRangeLabel(period: Exclude<OverviewPeriod, 'all'>) {
  const now = new Date()

  if (period === 'week') {
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(now)
    monday.setDate(diff)
    monday.setHours(0, 0, 0, 0)

    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)

    return `du ${fmtDate(monday)} au ${fmtDate(sunday)}`
  }

  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  return `du ${fmtDate(start)} au ${fmtDate(end)}`
}

function periodTitle(period: OverviewPeriod) {
  if (period === 'week') return 'Semaine'
  if (period === 'month') return 'Mois'
  return 'Tous'
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${accent ? 'text-amber-600' : 'text-gray-900'}`}>
        {value}
      </p>
    </div>
  )
}

function TopPerformerCard({
  label,
  performer,
  formatValue,
}: {
  label: string
  performer: { memberId: number; displayName: string; value: number; matchesPlayed: number } | null
  formatValue: (v: number) => string
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="mb-2 text-xs uppercase tracking-wide text-gray-500">{label}</p>
      {performer ? (
        <>
          <p className="font-semibold text-gray-900">{performer.displayName}</p>
          <p className="tabular-nums text-sm text-gray-600">{formatValue(performer.value)}</p>
          <p className="mt-1 text-xs text-gray-400">{performer.matchesPlayed} matchs</p>
        </>
      ) : (
        <p className="text-sm text-gray-400">—</p>
      )}
    </div>
  )
}

export default function ClanOverviewPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

  const { data, loading, error } = useClanOverview(clanId)
  const [selectedPeriod, setSelectedPeriod] = useState<OverviewPeriod>('all')
  const [periodSnapshot, setPeriodSnapshot] = useState<OverviewTrackedSnapshot | null>(null)
  const [periodLoading, setPeriodLoading] = useState(false)
  const [periodError, setPeriodError] = useState('')

  const [diff, setDiff] = useState<DiffResult | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState('')

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }
    setClanId(clanId)
  }, [clanId, router, setClanId])

  async function loadDiff() {
    if (!clanId || diffLoading) return
    try {
      setDiffLoading(true)
      setDiffError('')
      const response = await fetch(`/api/clans/${clanId}/pubg-diff`)
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error ?? 'Erreur lors du chargement du diff')
      setDiff(payload.diff as DiffResult)
    } catch (err) {
      setDiffError(err instanceof Error ? err.message : 'Erreur lors du chargement du diff')
    } finally {
      setDiffLoading(false)
    }
  }

  useEffect(() => {
    if (!clanId || selectedPeriod === 'all') {
      setPeriodSnapshot(null)
      setPeriodError('')
      setPeriodLoading(false)
      return
    }

    let cancelled = false

    async function fetchPeriodSnapshot() {
      try {
        setPeriodLoading(true)
        setPeriodError('')

        const response = await fetch(`/api/clans/${clanId}/matches?period=${selectedPeriod}`)
        const payload = (await response.json()) as ClanMatchesResponse | { error?: string }

        if (!response.ok) {
          throw new Error(payload && 'error' in payload ? payload.error ?? 'Erreur API' : 'Erreur API')
        }

        const matchesPayload = payload as ClanMatchesResponse
        const matchesWon = matchesPayload.squads.filter((match) => match.isWin).length
        const totalAssists = matchesPayload.squads.reduce((sum, match) => sum + match.totalAssists, 0)
        const totalRevives = matchesPayload.squads.reduce((sum, match) => sum + match.totalRevives, 0)

        const winRateByMember = new Map<
          number,
          { memberId: number; displayName: string; matchesPlayed: number; wins: number }
        >()

        for (const match of matchesPayload.squads) {
          for (const member of match.members) {
            const current = winRateByMember.get(member.memberId) ?? {
              memberId: member.memberId,
              displayName: member.displayName,
              matchesPlayed: 0,
              wins: 0,
            }
            current.matchesPlayed += 1
            current.wins += match.isWin ? 1 : 0
            winRateByMember.set(member.memberId, current)
          }
        }

        const bestWinRate = Array.from(winRateByMember.values())
          .filter((row) => row.matchesPlayed > 0)
          .sort((left, right) => {
            const leftRate = left.wins / left.matchesPlayed
            const rightRate = right.wins / right.matchesPlayed
            if (rightRate !== leftRate) return rightRate - leftRate
            return right.matchesPlayed - left.matchesPlayed
          })[0]

        if (!cancelled) {
          setPeriodSnapshot({
            aggregated: {
              totalKills: matchesPayload.stats.totalKills,
              totalDamage: matchesPayload.stats.totalDamage,
              totalAssists,
              totalRevives,
              matchesPlayed: matchesPayload.stats.matchCount,
              matchesWon,
              winRate: matchesPayload.stats.winRate,
            },
            topPerformers: {
              kills: matchesPayload.topPerformers.kills[0]
                ? {
                    memberId: matchesPayload.topPerformers.kills[0].memberId,
                    displayName: matchesPayload.topPerformers.kills[0].displayName,
                    value: matchesPayload.topPerformers.kills[0].totalKills,
                    matchesPlayed: matchesPayload.topPerformers.kills[0].matchesPlayed,
                  }
                : null,
              damage: matchesPayload.topPerformers.damage[0]
                ? {
                    memberId: matchesPayload.topPerformers.damage[0].memberId,
                    displayName: matchesPayload.topPerformers.damage[0].displayName,
                    value: matchesPayload.topPerformers.damage[0].totalDamage,
                    matchesPlayed: matchesPayload.topPerformers.damage[0].matchesPlayed,
                  }
                : null,
              winRate: bestWinRate
                ? {
                    memberId: bestWinRate.memberId,
                    displayName: bestWinRate.displayName,
                    value: bestWinRate.wins / bestWinRate.matchesPlayed,
                    matchesPlayed: bestWinRate.matchesPlayed,
                  }
                : null,
            },
          })
        }
      } catch (err) {
        if (!cancelled) {
          setPeriodSnapshot(null)
          setPeriodError(err instanceof Error ? err.message : 'Erreur de chargement des statistiques')
        }
      } finally {
        if (!cancelled) {
          setPeriodLoading(false)
        }
      }
    }

    void fetchPeriodSnapshot()

    return () => {
      cancelled = true
    }
  }, [clanId, selectedPeriod])

  if (!clanId) return null

  const clan = data?.clan
  const rawStats = data?.clanStats as Record<string, unknown> | null
  const pubg = rawStats?.pubg as {
    name: string
    tag: string
    clanId: string
    memberCount: number | null
  } | null
  const tracked = rawStats?.tracked as {
    membersCount: number
    aggregated: {
      totalKills: number
      totalDamage: number
      totalAssists: number
      totalRevives: number
      matchesPlayed: number
      matchesWon: number
      winRate: number
    }
    topPerformers: {
      kills: { memberId: number; displayName: string; value: number; matchesPlayed: number } | null
      damage: { memberId: number; displayName: string; value: number; matchesPlayed: number } | null
      winRate: { memberId: number; displayName: string; value: number; matchesPlayed: number } | null
    }
  } | null

  const activeTrackedSnapshot =
    selectedPeriod === 'all' ? tracked : periodSnapshot

  const analysisRangeLabel =
    selectedPeriod === 'all' ? 'historique complet' : getPeriodDateRangeLabel(selectedPeriod)

  const memberCountGap =
    typeof pubg?.memberCount === 'number' && typeof tracked?.membersCount === 'number'
      ? pubg.memberCount - tracked.membersCount
      : null

  return (
    <main className="app-container app-main">
      <header className="app-panel mb-6 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Vue d&apos;ensemble du clan</h1>
        <p className="text-sm text-gray-600">
          Données PUBG officielles, roster et comparaison des membres.
        </p>
        <SectionNav section="clan-section" />
      </header>

      {loading && <p className="text-sm text-gray-500">Chargement...</p>}

      {error && (
        <div className="app-panel p-6 text-sm text-red-600">
          {error === 'Unauthorized'
            ? 'Vous n’avez pas la permission de voir cette page.'
            : error}
        </div>
      )}

      {!loading && !error && data && (
        <div className="space-y-6">
          {/* Bloc 1 — Fiche PUBG officielle */}
          <section className="app-panel relative overflow-hidden">
            {!pubg ? (
              <div className="p-6">
                <h2 className="mb-2 text-base font-semibold text-gray-900">
                  Fiche PUBG officielle
                </h2>
                <p className="text-sm text-gray-500">
                  Aucune donnée PUBG — lancez une sync stats depuis les paramètres d&apos;abord.
                </p>
              </div>
            ) : (
              <>
                <img
                  src="/maps/pubg/Baltic_Main.webp"
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover object-[center_30%] opacity-70"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/55 to-black/85" />

                <div className="relative px-6 py-5">
                  {/* Identité du clan */}
                  <div className="mb-5">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="rounded bg-amber-400 px-2 py-0.5 font-mono text-xs font-bold tracking-widest text-black">
                        [{pubg.tag}]
                      </span>
                      <span className="font-mono text-xs text-white/40">{pubg.clanId}</span>
                    </div>
                    <h2 className="text-2xl font-bold leading-tight text-white drop-shadow">
                      {pubg.name}
                    </h2>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex flex-col items-center rounded-xl border border-t-4 border-white/15 border-t-blue-400 bg-white/10 px-3 py-4 backdrop-blur-sm">
                      <p className="text-3xl font-bold tabular-nums text-white">
                        {pubg.memberCount ?? '—'}
                      </p>
                      <p className="mt-1.5 text-center text-xs text-white/60">Membres PUBG</p>
                    </div>

                    <div className="flex flex-col items-center rounded-xl border border-t-4 border-white/15 border-t-emerald-400 bg-white/10 px-3 py-4 backdrop-blur-sm">
                      <p className="text-3xl font-bold tabular-nums text-white">
                        {tracked?.membersCount ?? '—'}
                      </p>
                      <p className="mt-1.5 text-center text-xs text-white/60">Trackés</p>
                      {typeof pubg.memberCount === 'number' &&
                        typeof tracked?.membersCount === 'number' &&
                        pubg.memberCount > 0 && (
                          <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-white/20">
                            <div
                              className="h-full rounded-full bg-emerald-400"
                              style={{
                                width: `${Math.min(100, (tracked.membersCount / pubg.memberCount) * 100)}%`,
                              }}
                            />
                          </div>
                        )}
                    </div>

                    <div
                      className={`flex flex-col items-center rounded-xl border border-t-4 border-white/15 bg-white/10 px-3 py-4 backdrop-blur-sm ${
                        memberCountGap !== null && memberCountGap > 0
                          ? 'border-t-amber-400'
                          : 'border-t-white/20'
                      }`}
                    >
                      <p
                        className={`text-3xl font-bold tabular-nums ${
                          memberCountGap !== null && memberCountGap > 0
                            ? 'text-amber-400'
                            : 'text-white'
                        }`}
                      >
                        {memberCountGap === null
                          ? '—'
                          : memberCountGap > 0
                            ? `+${memberCountGap}`
                            : String(memberCountGap)}
                      </p>
                      <p className="mt-1.5 text-center text-xs text-white/60">Écart</p>
                    </div>
                  </div>

                  {/* Badge sync */}
                  <div className="mt-4">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs text-white/60 backdrop-blur-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                      Sync {fmtRelative((rawStats?.syncedAt as string | undefined) ?? null)}
                    </span>
                  </div>
                </div>
              </>
            )}
          </section>

          {/* Bloc 2 — Agrégats all-time */}
          {tracked && (
            <section className="app-panel relative overflow-hidden p-6">
              <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-cyan-500/10 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-12 -left-12 h-36 w-36 rounded-full bg-emerald-500/10 blur-2xl" />

              <div className="relative mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Statistiques clan ({tracked.membersCount} membres trackés)
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Période: <span className="font-semibold text-gray-900">{periodTitle(selectedPeriod)}</span>
                    {' · '}Analyse {analysisRangeLabel}
                    {' · '}
                    <span className="font-semibold text-gray-900">
                      {fmtNum(activeTrackedSnapshot?.aggregated.matchesPlayed ?? 0)} matchs
                    </span>
                  </p>
                </div>

                <SegmentedControl
                  options={OVERVIEW_PERIOD_OPTIONS}
                  value={selectedPeriod}
                  onChange={setSelectedPeriod}
                  size="sm"
                  fullWidthOnMobile
                  className="shrink-0"
                />
              </div>

              {periodError && (
                <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {periodError}
                </div>
              )}

              {periodLoading && selectedPeriod !== 'all' && (
                <p className="mb-4 text-sm text-gray-500">Chargement des statistiques de période...</p>
              )}

              <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                {[
                  {
                    label: 'Kills',
                    value: fmtNum(activeTrackedSnapshot?.aggregated.totalKills ?? 0),
                  },
                  {
                    label: 'Dégâts',
                    value: fmtNum(activeTrackedSnapshot?.aggregated.totalDamage ?? 0),
                  },
                  {
                    label: 'Matchs',
                    value: fmtNum(activeTrackedSnapshot?.aggregated.matchesPlayed ?? 0),
                  },
                  {
                    label: 'Victoires',
                    value: fmtNum(activeTrackedSnapshot?.aggregated.matchesWon ?? 0),
                  },
                  {
                    label: 'Win rate',
                    value: fmtPct(activeTrackedSnapshot?.aggregated.winRate ?? 0),
                  },
                  {
                    label: 'Assists',
                    value: fmtNum(activeTrackedSnapshot?.aggregated.totalAssists ?? 0),
                  },
                  {
                    label: 'Relèves',
                    value: fmtNum(activeTrackedSnapshot?.aggregated.totalRevives ?? 0),
                  },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 shadow-sm"
                  >
                    <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
                    <p className="mt-2 text-right text-2xl font-black tabular-nums text-gray-900">{value}</p>
                  </div>
                ))}
              </div>

              <h3 className="mb-3 text-sm font-semibold text-gray-700">Top performers</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <TopPerformerCard
                  label="Top Killer"
                  performer={activeTrackedSnapshot?.topPerformers.kills ?? null}
                  formatValue={(v) => `${fmtNum(v)} kills`}
                />
                <TopPerformerCard
                  label="Top Damage"
                  performer={activeTrackedSnapshot?.topPerformers.damage ?? null}
                  formatValue={(v) => `${fmtNum(v)} dégâts`}
                />
                <TopPerformerCard
                  label="Meilleur Win Rate"
                  performer={activeTrackedSnapshot?.topPerformers.winRate ?? null}
                  formatValue={fmtPct}
                />
              </div>
            </section>
          )}

          {/* Bloc 3 — Diff PUBG vs site */}
          <section className="app-panel p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Comparaison PUBG vs site</h2>
              {!diff && clan?.pubgClanId && (
                <button
                  onClick={loadDiff}
                  disabled={diffLoading}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {diffLoading ? 'Chargement…' : 'Comparer avec le clan PUBG'}
                </button>
              )}
            </div>

            {!clan?.pubgClanId && (
              <p className="text-sm text-gray-500">
                Le clan n&apos;a pas encore de PUBG Clan ID — sync stats d&apos;abord.
              </p>
            )}

            {diffError && <p className="text-sm text-red-600">{diffError}</p>}

            {diff && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-6 text-sm text-gray-600">
                  <span>
                    Membres PUBG :{' '}
                    <strong className="text-gray-900">{diff.pubgMembersCount}</strong>
                  </span>
                  <span>
                    Correspondances :{' '}
                    <strong className="text-green-700">{diff.matched.length}</strong>
                  </span>
                  <span>
                    PUBG seulement :{' '}
                    <strong className="text-amber-700">{diff.inPubgOnly.length}</strong>
                  </span>
                  <span>
                    Site seulement :{' '}
                    <strong className="text-red-700">{diff.inSiteOnly.length}</strong>
                  </span>
                  {diff.unverified.length > 0 && (
                    <span>
                      Non vérifiés :{' '}
                      <strong className="text-gray-500">{diff.unverified.length}</strong>
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        {['Joueur PUBG', 'Présent sur le site', 'Statut'].map((col) => (
                          <th
                            key={col}
                            className="pb-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                          >
                            {col}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {diff.matched.map((m) => (
                        <tr key={m.accountId}>
                          <td className="py-2 pr-4 text-gray-700">{m.pubgName ?? m.accountId}</td>
                          <td className="py-2 pr-4 text-gray-700">{m.displayName}</td>
                          <td className="py-2 text-green-700 font-medium">✓ Correspondance</td>
                        </tr>
                      ))}
                      {diff.inPubgOnly.map((m) => (
                        <tr key={m.accountId} className="bg-amber-50">
                          <td className="py-2 pr-4 text-gray-700">{m.pubgName ?? m.accountId}</td>
                          <td className="py-2 pr-4 text-gray-400">—</td>
                          <td className="py-2">
                            <span className="mr-3 font-medium text-amber-700">Absent du site</span>
                            <Link
                              href={`/clans/${clanId}/settings/members`}
                              className="text-xs text-gray-500 underline hover:text-gray-700"
                            >
                              Gérer les membres →
                            </Link>
                          </td>
                        </tr>
                      ))}
                      {diff.inSiteOnly.map((m) => (
                        <tr key={m.memberId} className="bg-red-50">
                          <td className="py-2 pr-4 text-gray-400">—</td>
                          <td className="py-2 pr-4 text-gray-700">{m.displayName}</td>
                          <td className="py-2 font-medium text-red-700">
                            Absent du clan PUBG — archiver ?
                          </td>
                        </tr>
                      ))}
                      {diff.unverified.map((m) => (
                        <tr key={m.memberId} className="opacity-60">
                          <td className="py-2 pr-4 text-gray-400">Non résolu</td>
                          <td className="py-2 pr-4 text-gray-700">{m.displayName}</td>
                          <td className="py-2 text-gray-400">Compte PUBG non vérifié</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          {/* Bloc 4 — Roster membres actifs */}
          <section className="app-panel p-6">
            <h2 className="mb-4 text-base font-semibold text-gray-900">
              Membres actifs ({data.roster.length})
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    {['Membre', 'Rôle', 'Depuis', 'Compte site', 'Lien PUBG', 'Dernière sync'].map(
                      (col) => (
                        <th
                          key={col}
                          className="pb-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 last:pr-0"
                        >
                          {col}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.roster.map((member) => (
                    <tr key={member.id} className="hover:bg-gray-50">
                      <td className="py-2 pr-4">
                        <Link
                          href={`/members/${member.id}`}
                          className="font-medium text-gray-900 hover:underline"
                        >
                          {member.displayName}
                        </Link>
                        {member.pubgPlayerName !== member.displayName && (
                          <p className="text-xs text-gray-400">{member.pubgPlayerName}</p>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-gray-700">{member.role}</td>
                      <td className="py-2 pr-4 whitespace-nowrap text-gray-500">
                        {fmtDate(member.joinedAt)}
                      </td>
                      <td className="py-2 pr-4">
                        {member.hasAccount ? (
                          <span className="font-medium text-green-700">✓ Oui</span>
                        ) : (
                          <span className="text-gray-400">Non</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {member.pubgAccountId ? (
                          <span className="font-medium text-green-700">✓ Vérifié</span>
                        ) : (
                          <span className="text-gray-400">En attente</span>
                        )}
                      </td>
                      <td className="py-2 whitespace-nowrap text-gray-500">
                        {fmtRelative(member.lastRefreshedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
