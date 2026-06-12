'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import ClanSectionNav from '@/components/ClanSectionNav'
import { useClanOverview } from '@/hooks/useClanOverview'
import { useSelectedClan } from '@/hooks/useSelectedClan'

type DiffResult = {
  pubgClanId: string
  shard: string
  pubgMembersCount: number
  matched: Array<{ accountId: string; pubgName: string | null; memberId: number; displayName: string }>
  inPubgOnly: Array<{ accountId: string; pubgName: string | null }>
  inSiteOnly: Array<{ memberId: number; displayName: string; pubgAccountId: string }>
  unverified: Array<{ memberId: number; displayName: string }>
}

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
        <ClanSectionNav clanId={clanId} />
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
          <section className="app-panel p-6">
            <h2 className="mb-4 text-base font-semibold text-gray-900">Fiche PUBG officielle</h2>

            {!pubg ? (
              <p className="text-sm text-gray-500">
                Aucune donnée PUBG — lancez une sync stats depuis les paramètres d&apos;abord.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded bg-gray-100 px-2 py-1 font-mono text-sm text-gray-700">
                    [{pubg.tag}]
                  </span>
                  <span className="text-xl font-bold text-gray-900">{pubg.name}</span>
                </div>

                <p className="font-mono text-xs text-gray-400">{pubg.clanId}</p>

                <div className="flex flex-wrap gap-8">
                  <Stat label="Membres PUBG officiel" value={String(pubg.memberCount ?? '—')} />
                  <Stat label="Membres trackés" value={String(tracked?.membersCount ?? '—')} />
                  {memberCountGap !== null && memberCountGap !== 0 && (
                    <Stat
                      label="Écart"
                      value={`${memberCountGap > 0 ? '+' : ''}${memberCountGap}`}
                      accent={Math.abs(memberCountGap) > 0}
                    />
                  )}
                </div>

                <p className="text-xs text-gray-500">
                  Dernière sync :{' '}
                  {fmtRelative((rawStats?.syncedAt as string | undefined) ?? null)}
                </p>
              </div>
            )}
          </section>

          {/* Bloc 2 — Agrégats all-time */}
          {tracked && (
            <section className="app-panel p-6">
              <h2 className="mb-4 text-base font-semibold text-gray-900">
                Statistiques all-time ({tracked.membersCount} membres trackés)
              </h2>

              <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Kills', value: fmtNum(tracked.aggregated.totalKills) },
                  { label: 'Dégâts', value: fmtNum(tracked.aggregated.totalDamage) },
                  { label: 'Matchs', value: fmtNum(tracked.aggregated.matchesPlayed) },
                  { label: 'Victoires', value: fmtNum(tracked.aggregated.matchesWon) },
                  { label: 'Win rate', value: fmtPct(tracked.aggregated.winRate) },
                  { label: 'Assists', value: fmtNum(tracked.aggregated.totalAssists) },
                  { label: 'Relèves', value: fmtNum(tracked.aggregated.totalRevives) },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
                  >
                    <p className="mb-1 text-xs uppercase tracking-wide text-gray-500">{label}</p>
                    <p className="text-lg font-bold tabular-nums text-gray-900">{value}</p>
                  </div>
                ))}
              </div>

              <h3 className="mb-3 text-sm font-semibold text-gray-700">Top performers</h3>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <TopPerformerCard
                  label="Top Killer"
                  performer={tracked.topPerformers.kills}
                  formatValue={(v) => `${fmtNum(v)} kills`}
                />
                <TopPerformerCard
                  label="Top Damage"
                  performer={tracked.topPerformers.damage}
                  formatValue={(v) => `${fmtNum(v)} dégâts`}
                />
                <TopPerformerCard
                  label="Meilleur Win Rate"
                  performer={tracked.topPerformers.winRate}
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
