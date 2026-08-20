'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'

import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { TableSkeleton } from '@/components/ui/skeletons/TableSkeleton'
import SegmentedControl from '@/components/ui/SegmentedControl'
import type { EncounteredPlayerResolutionStatus } from '@/lib/encountered-player-status'
import { useSelectedClan } from '@/hooks/useSelectedClan'

type Period = 'week' | 'month' | 'all'

type EncounteredPlayerRow = {
  id: string
  pubgAccountId: string
  pubgPlayerName: string
  pubgClanTag: string | null
  pubgClanName: string | null
  clanResolvedAt: string | null
  encounterCount: number
  teammateEncounterCount: number
  opponentEncounterCount: number
  resolveAttempts: number
  status: EncounteredPlayerResolutionStatus
  killedByClanCount: number
  killedClanMemberCount: number
  firstSeenAt: string
  lastSeenAt: string
}

const STATUS_LABELS: Record<EncounteredPlayerResolutionStatus, string> = {
  below_threshold: 'Pas encore éligible',
  never_attempted: 'En attente',
  retry_pending: 'Nouvel essai prévu',
  failed: 'Échec définitif',
  resolved_with_clan: 'Résolu',
  resolved_without_clan: 'Aucun clan',
}

const STATUS_TOOLTIPS: Record<EncounteredPlayerResolutionStatus, string> = {
  below_threshold: 'Seuil minimal de croisements non atteint.',
  never_attempted: 'Pas encore tenté.',
  retry_pending: 'Une tentative précédente a échoué, une autre aura lieu automatiquement.',
  failed: 'Nombre maximal de tentatives atteint.',
  resolved_with_clan: 'Clan PUBG résolu.',
  resolved_without_clan: 'Confirmé sans clan PUBG.',
}

const STATUS_BADGE_CLASSES: Record<EncounteredPlayerResolutionStatus, string> = {
  below_threshold: 'border-slate-200 bg-slate-50 text-slate-500',
  never_attempted: 'border-amber-200 bg-amber-50 text-amber-700',
  retry_pending: 'border-amber-200 bg-amber-50 text-amber-700',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
  resolved_with_clan: 'border-slate-200 bg-slate-50 text-slate-700',
  resolved_without_clan: 'border-slate-200 bg-slate-50 text-slate-500',
}

type RivalClan = {
  tag: string
  encounterCount: number
}

type RivalClanFull = {
  tag: string
  name: string | null
  playerCount: number
  opponentEncounterCount: number
  killedByClanCount: number
  killedClanMemberCount: number
  lastSeenAt: string
}

type BotStats = {
  avgBotsPerMatch: number | null
  matchesWithData: number
}

type EncounteredPlayersPayload = {
  data?: {
    period: Period
    summary: {
      totalPlayers: number
      resolvedCount: number
      pendingCount: number
      distinctClansIdentified: number
      teammateCount: number
      killedByClanPlayerCount: number
      killedByClanTotalKills: number
      killedClanMemberPlayerCount: number
      killedClanMemberTotalKills: number
    }
    botStats: BotStats
    topRivalClans: RivalClan[]
    rivalClans: RivalClanFull[]
    players: EncounteredPlayerRow[]
    playersListLimit: number
    playersListTruncated: boolean
    thresholds: { minEncounters: number; maxAttempts: number }
  }
  error?: string
}

type SortKey =
  | 'encounterCount'
  | 'lastSeenAt'
  | 'pubgPlayerName'
  | 'killedByClanCount'
  | 'killedClanMemberCount'

type ClanSortKey =
  | 'opponentEncounterCount'
  | 'playerCount'
  | 'killedByClanCount'
  | 'killedClanMemberCount'
  | 'lastSeenAt'
  | 'tag'

const PAGE_SIZE = 20
const CLAN_PAGE_SIZE = 10

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function formatDateTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })
}

export default function EncounteredOpponentsPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })

  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<EncounteredPlayersPayload['data'] | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [clanFilter, setClanFilter] = useState<'all' | 'resolved' | 'pending'>('all')
  const [relationFilter, setRelationFilter] = useState<'all' | 'opponents' | 'teammates'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('encounterCount')
  const [period, setPeriod] = useState<Period>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [clanSearchTerm, setClanSearchTerm] = useState('')
  const [clanSortKey, setClanSortKey] = useState<ClanSortKey>('opponentEncounterCount')
  const [clanCurrentPage, setClanCurrentPage] = useState(1)

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }

    setClanId(clanId)
  }, [clanId, router, setClanId])

  const loadPlayers = useCallback(
    async (currentClanId: number, currentPeriod: Period) => {
      try {
        setLoading(true)
        const response = await fetch(
          `/api/clans/${currentClanId}/encountered-players?period=${currentPeriod}`,
          { cache: 'no-store' }
        )

        const data = (await response.json().catch(() => null)) as EncounteredPlayersPayload | null

        if (!response.ok || !data?.data) {
          if (response.status === 401 || response.status === 403) {
            router.replace(`/login?redirect=${encodeURIComponent(`/clans/${currentClanId}/telemetry/opponents`)}`)
            return
          }

          setPayload(null)
          setError(data?.error ?? 'Chargement des adversaires rencontrés impossible')
          return
        }

        setPayload(data.data)
        setError(null)
      } catch {
        setPayload(null)
        setError('Chargement des adversaires rencontrés impossible')
      } finally {
        setLoading(false)
      }
    },
    [router]
  )

  useEffect(() => {
    if (!clanId) {
      return
    }

    void loadPlayers(clanId, period)
  }, [clanId, period, loadPlayers])

  const filteredPlayers = useMemo(() => {
    if (!payload) {
      return []
    }

    const search = searchTerm.trim().toLowerCase()

    const isResolvedStatus = (status: EncounteredPlayerResolutionStatus) =>
      status === 'resolved_with_clan' || status === 'resolved_without_clan'

    return payload.players.filter((player) => {
      if (clanFilter === 'resolved' && !isResolvedStatus(player.status)) {
        return false
      }

      if (clanFilter === 'pending' && isResolvedStatus(player.status)) {
        return false
      }

      if (relationFilter === 'opponents' && player.opponentEncounterCount === 0) {
        return false
      }

      if (relationFilter === 'teammates' && player.teammateEncounterCount === 0) {
        return false
      }

      if (!search) {
        return true
      }

      const haystack = [player.pubgPlayerName, player.pubgClanTag ?? '', player.pubgClanName ?? '']
        .join(' ')
        .toLowerCase()

      return haystack.includes(search)
    })
  }, [payload, searchTerm, clanFilter, relationFilter])

  const sortedPlayers = useMemo(() => {
    return [...filteredPlayers].sort((left, right) => {
      if (sortKey === 'pubgPlayerName') {
        return left.pubgPlayerName.localeCompare(right.pubgPlayerName)
      }

      if (sortKey === 'lastSeenAt') {
        return new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime()
      }

      if (sortKey === 'killedByClanCount') {
        return right.killedByClanCount - left.killedByClanCount
      }

      if (sortKey === 'killedClanMemberCount') {
        return right.killedClanMemberCount - left.killedClanMemberCount
      }

      return right.encounterCount - left.encounterCount
    })
  }, [filteredPlayers, sortKey])

  const totalPages = Math.max(1, Math.ceil(sortedPlayers.length / PAGE_SIZE))

  // Recherche/filtre/tri changent l'ensemble affiché — sans ce reset, une
  // recherche pourrait laisser la page sur un numéro qui n'existe plus dans
  // les nouveaux résultats (page blanche silencieuse, pas une erreur visible).
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, clanFilter, relationFilter, sortKey, period])

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const paginatedPlayers = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE
    return sortedPlayers.slice(start, start + PAGE_SIZE)
  }, [sortedPlayers, currentPage])

  const paginationRange = useMemo(() => {
    if (sortedPlayers.length === 0) {
      return { start: 0, end: 0 }
    }

    const start = (currentPage - 1) * PAGE_SIZE + 1
    const end = Math.min(sortedPlayers.length, currentPage * PAGE_SIZE)
    return { start, end }
  }, [sortedPlayers.length, currentPage])

  const filteredRivalClans = useMemo(() => {
    if (!payload) {
      return []
    }

    const search = clanSearchTerm.trim().toLowerCase()
    if (!search) {
      return payload.rivalClans
    }

    return payload.rivalClans.filter((clan) =>
      [clan.tag, clan.name ?? ''].join(' ').toLowerCase().includes(search)
    )
  }, [payload, clanSearchTerm])

  const sortedRivalClans = useMemo(() => {
    return [...filteredRivalClans].sort((left, right) => {
      if (clanSortKey === 'tag') {
        return left.tag.localeCompare(right.tag)
      }

      if (clanSortKey === 'lastSeenAt') {
        return new Date(right.lastSeenAt).getTime() - new Date(left.lastSeenAt).getTime()
      }

      return right[clanSortKey] - left[clanSortKey]
    })
  }, [filteredRivalClans, clanSortKey])

  const clanTotalPages = Math.max(1, Math.ceil(sortedRivalClans.length / CLAN_PAGE_SIZE))

  useEffect(() => {
    setClanCurrentPage(1)
  }, [clanSearchTerm, clanSortKey, period])

  useEffect(() => {
    if (clanCurrentPage > clanTotalPages) {
      setClanCurrentPage(clanTotalPages)
    }
  }, [clanCurrentPage, clanTotalPages])

  const paginatedRivalClans = useMemo(() => {
    const start = (clanCurrentPage - 1) * CLAN_PAGE_SIZE
    return sortedRivalClans.slice(start, start + CLAN_PAGE_SIZE)
  }, [sortedRivalClans, clanCurrentPage])

  const clanPaginationRange = useMemo(() => {
    if (sortedRivalClans.length === 0) {
      return { start: 0, end: 0 }
    }

    const start = (clanCurrentPage - 1) * CLAN_PAGE_SIZE + 1
    const end = Math.min(sortedRivalClans.length, clanCurrentPage * CLAN_PAGE_SIZE)
    return { start, end }
  }, [sortedRivalClans.length, clanCurrentPage])

  if (loading) {
    return (
      <main className="app-container app-main flex-1 space-y-4">
        <NavigationTrail
          currentLabel="Adversaires rencontrés"
          currentHref={`/clans/${clanId}/telemetry/opponents`}
          fallbackParent={{ href: `/clans/${clanId}/telemetry/dashboard`, label: 'Télémétrie' }}
        />
        <TableSkeleton rows={3} />
      </main>
    )
  }

  return (
    <main className="app-container app-main flex-1 space-y-6">
      <NavigationTrail
        currentLabel="Adversaires rencontrés"
        currentHref={`/clans/${clanId}/telemetry/opponents`}
        fallbackParent={{ href: `/clans/${clanId}/telemetry/dashboard`, label: 'Télémétrie' }}
      />
      <section className="app-panel p-4">
        <SettingsPageHeader
          title="Adversaires rencontrés"
          subtitle="Joueurs adverses croisés en match par le clan — nom et clan PUBG identifiés, sans les ajouter au tracking actif."
        />
        <div className="mt-3">
          <SegmentedControl
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'week', label: 'Semaine' },
              { value: 'month', label: 'Mois' },
              { value: 'all', label: 'Tout' },
            ]}
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Filtre sur la dernière rencontre — le compteur de croisements affiché reste le cumul total, pas recalculé pour la période.
          </p>
        </div>
      </section>

      {error ? <section className="app-panel p-4 text-sm text-rose-800">{error}</section> : null}

      {payload ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Joueurs croisés</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{payload.summary.totalPlayers}</p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Dont coéquipiers</p>
              <p className="mt-2 text-2xl font-bold text-sky-700">{payload.summary.teammateCount}</p>
              <p className="mt-1 text-[11px] text-slate-400">Même squad qu&apos;un membre, pas des adversaires</p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Clans identifiés</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{payload.summary.distinctClansIdentified}</p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Résolus</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">{payload.summary.resolvedCount}</p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">En attente de résolution</p>
              <p className="mt-2 text-2xl font-bold text-amber-700">{payload.summary.pendingCount}</p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Bots moy. / match</p>
              <p className="mt-2 text-2xl font-bold text-slate-500">
                {payload.botStats.avgBotsPerMatch !== null ? payload.botStats.avgBotsPerMatch.toFixed(1) : '-'}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">{payload.botStats.matchesWithData} match(s) mesuré(s)</p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Déjà tués par le clan</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">{payload.summary.killedByClanPlayerCount}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                {payload.summary.killedByClanTotalKills} kill(s) au total (hors bots) d&apos;après le kill-feed
              </p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Ont déjà tué un membre</p>
              <p className="mt-2 text-2xl font-bold text-rose-700">{payload.summary.killedClanMemberPlayerCount}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                {payload.summary.killedClanMemberTotalKills} kill(s) au total (hors bots) d&apos;après le kill-feed
              </p>
            </article>
          </section>

          {payload.topRivalClans.length > 0 ? (
            <section className="app-panel p-4">
              <h2 className="text-lg font-semibold text-slate-900">Clans adverses les plus croisés</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {payload.topRivalClans.map((rival) => (
                  <span
                    key={rival.tag}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700"
                  >
                    [{rival.tag}] · {rival.encounterCount} croisement{rival.encounterCount > 1 ? 's' : ''}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <section className="app-panel p-4">
            <h2 className="text-lg font-semibold text-slate-900">Liste des adversaires</h2>
            <p className="mt-1 text-sm text-slate-600">
              Résolution du clan PUBG limitée aux joueurs croisés au moins deux fois, un seul appel par joueur.
            </p>
            {payload.playersListTruncated ? (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                Affichage limité aux {payload.playersListLimit} joueurs les plus croisés sur la période sélectionnée
                — les totaux ci-dessus ({payload.summary.totalPlayers} joueurs) portent eux sur l&apos;ensemble réel.
              </p>
            ) : null}

            <div className="mt-4 grid gap-2 md:grid-cols-4">
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Recherche
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="joueur, tag de clan..."
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 placeholder:text-slate-400"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Relation
                <select
                  value={relationFilter}
                  onChange={(event) => setRelationFilter(event.target.value as 'all' | 'opponents' | 'teammates')}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                >
                  <option value="all">Tous</option>
                  <option value="opponents">Adversaires uniquement</option>
                  <option value="teammates">Coéquipiers uniquement</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Statut de résolution
                <select
                  value={clanFilter}
                  onChange={(event) => setClanFilter(event.target.value as 'all' | 'resolved' | 'pending')}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                >
                  <option value="all">Tous</option>
                  <option value="resolved">Résolus</option>
                  <option value="pending">En attente</option>
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Tri
                <select
                  value={sortKey}
                  onChange={(event) => setSortKey(event.target.value as SortKey)}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                >
                  <option value="encounterCount">Croisements</option>
                  <option value="lastSeenAt">Dernière rencontre</option>
                  <option value="pubgPlayerName">Nom</option>
                  <option value="killedByClanCount">Tué par le clan</option>
                  <option value="killedClanMemberCount">A tué un membre</option>
                </select>
              </label>
            </div>

            <div className="mt-3">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {sortedPlayers.length === 0
                  ? `Résultats : 0 / ${payload.players.length}`
                  : `Lignes ${paginationRange.start}-${paginationRange.end} sur ${sortedPlayers.length} (total ${payload.players.length})`}
              </span>
            </div>

            <div className="app-table-shell mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="app-table-head text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Joueur</th>
                    <th className="px-2 py-2">Clan PUBG</th>
                    <th className="px-2 py-2 text-right">Adversaire</th>
                    <th className="px-2 py-2 text-right">Coéquipier</th>
                    <th className="px-2 py-2 text-right">Tué par le clan</th>
                    <th className="px-2 py-2 text-right">A tué un membre</th>
                    <th className="px-2 py-2">Première rencontre</th>
                    <th className="px-2 py-2">Dernière rencontre</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPlayers.map((player) => (
                    <tr key={player.id} className="app-table-row align-top">
                      <td className="px-2 py-2 font-medium text-slate-900">
                        {player.pubgPlayerName}
                        {player.teammateEncounterCount > 0 && player.opponentEncounterCount > 0 ? (
                          <span className="ml-1.5 rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                            Mixte
                          </span>
                        ) : player.teammateEncounterCount > 0 ? (
                          <span className="ml-1.5 rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
                            Coéquipier
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-slate-700">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {player.pubgClanTag ? (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                              [{player.pubgClanTag}] {player.pubgClanName ?? ''}
                            </span>
                          ) : null}
                          {player.status !== 'resolved_with_clan' ? (
                            <span
                              title={
                                player.status === 'retry_pending'
                                  ? `${STATUS_TOOLTIPS[player.status]} (tentative ${player.resolveAttempts}/${payload?.thresholds.maxAttempts ?? '-'})`
                                  : STATUS_TOOLTIPS[player.status]
                              }
                              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${STATUS_BADGE_CLASSES[player.status]}`}
                            >
                              {STATUS_LABELS[player.status]}
                              {player.status === 'retry_pending'
                                ? ` (${player.resolveAttempts}/${payload?.thresholds.maxAttempts ?? '-'})`
                                : ''}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                        {player.opponentEncounterCount > 0 ? player.opponentEncounterCount : '-'}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-sky-700">
                        {player.teammateEncounterCount > 0 ? player.teammateEncounterCount : '-'}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-emerald-700">
                        {player.killedByClanCount > 0 ? player.killedByClanCount : '-'}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-rose-700">
                        {player.killedClanMemberCount > 0 ? player.killedClanMemberCount : '-'}
                      </td>
                      <td className="px-2 py-2 text-slate-700">{formatDateTime(player.firstSeenAt)}</td>
                      <td className="px-2 py-2 text-slate-700">{formatDateTime(player.lastSeenAt)}</td>
                    </tr>
                  ))}
                  {sortedPlayers.length === 0 ? (
                    <tr className="app-table-row">
                      <td colSpan={8} className="px-2 py-6 text-center text-sm text-slate-500">
                        Aucun joueur croisé pour l&apos;instant.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {sortedPlayers.length > PAGE_SIZE ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-sm text-slate-600">
                <p>
                  Page {currentPage} / {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="app-btn app-btn--sm app-btn--secondary"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                  >
                    Première
                  </button>
                  <button
                    type="button"
                    className="app-btn app-btn--sm app-btn--secondary"
                    onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={currentPage === 1}
                  >
                    Précédent
                  </button>
                  <span className="tabular-nums text-xs font-semibold text-slate-500">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    className="app-btn app-btn--sm app-btn--secondary"
                    onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                    disabled={currentPage === totalPages}
                  >
                    Suivant
                  </button>
                  <button
                    type="button"
                    className="app-btn app-btn--sm app-btn--secondary"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    Dernière
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="app-panel p-4">
            <h2 className="text-lg font-semibold text-slate-900">Clans rencontrés</h2>
            <p className="mt-1 text-sm text-slate-600">
              Clans PUBG identifiés, agrégés par tag — coéquipiers occasionnels exclus, seuls les croisements en tant qu&apos;adversaires comptent.
            </p>

            <div className="mt-4 grid gap-2 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Recherche
                <input
                  value={clanSearchTerm}
                  onChange={(event) => setClanSearchTerm(event.target.value)}
                  placeholder="tag ou nom de clan..."
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 placeholder:text-slate-400"
                />
              </label>

              <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Tri
                <select
                  value={clanSortKey}
                  onChange={(event) => setClanSortKey(event.target.value as ClanSortKey)}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700"
                >
                  <option value="opponentEncounterCount">Croisements</option>
                  <option value="playerCount">Joueurs identifiés</option>
                  <option value="killedByClanCount">Tué par le clan</option>
                  <option value="killedClanMemberCount">A tué un membre</option>
                  <option value="lastSeenAt">Dernière rencontre</option>
                  <option value="tag">Tag</option>
                </select>
              </label>
            </div>

            <div className="mt-3">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {sortedRivalClans.length === 0
                  ? `Résultats : 0 / ${payload.rivalClans.length}`
                  : `Lignes ${clanPaginationRange.start}-${clanPaginationRange.end} sur ${sortedRivalClans.length} (total ${payload.rivalClans.length})`}
              </span>
            </div>

            <div className="app-table-shell mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="app-table-head text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Clan</th>
                    <th className="px-2 py-2 text-right">Joueurs identifiés</th>
                    <th className="px-2 py-2 text-right">Croisements</th>
                    <th className="px-2 py-2 text-right">Tué par le clan</th>
                    <th className="px-2 py-2 text-right">A tué un membre</th>
                    <th className="px-2 py-2">Dernière rencontre</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRivalClans.map((clan) => (
                    <tr key={clan.tag} className="app-table-row align-top">
                      <td className="px-2 py-2 font-medium text-slate-900">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700">
                          [{clan.tag}] {clan.name ?? ''}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-700">{clan.playerCount}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-700">
                        {clan.opponentEncounterCount}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-emerald-700">
                        {clan.killedByClanCount > 0 ? clan.killedByClanCount : '-'}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-rose-700">
                        {clan.killedClanMemberCount > 0 ? clan.killedClanMemberCount : '-'}
                      </td>
                      <td className="px-2 py-2 text-slate-700">{formatDateTime(clan.lastSeenAt)}</td>
                    </tr>
                  ))}
                  {sortedRivalClans.length === 0 ? (
                    <tr className="app-table-row">
                      <td colSpan={6} className="px-2 py-6 text-center text-sm text-slate-500">
                        Aucun clan identifié pour l&apos;instant.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {sortedRivalClans.length > CLAN_PAGE_SIZE ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-sm text-slate-600">
                <p>
                  Page {clanCurrentPage} / {clanTotalPages}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="app-btn app-btn--sm app-btn--secondary"
                    onClick={() => setClanCurrentPage(1)}
                    disabled={clanCurrentPage === 1}
                  >
                    Première
                  </button>
                  <button
                    type="button"
                    className="app-btn app-btn--sm app-btn--secondary"
                    onClick={() => setClanCurrentPage((page) => Math.max(1, page - 1))}
                    disabled={clanCurrentPage === 1}
                  >
                    Précédent
                  </button>
                  <span className="tabular-nums text-xs font-semibold text-slate-500">
                    {clanCurrentPage} / {clanTotalPages}
                  </span>
                  <button
                    type="button"
                    className="app-btn app-btn--sm app-btn--secondary"
                    onClick={() => setClanCurrentPage((page) => Math.min(clanTotalPages, page + 1))}
                    disabled={clanCurrentPage === clanTotalPages}
                  >
                    Suivant
                  </button>
                  <button
                    type="button"
                    className="app-btn app-btn--sm app-btn--secondary"
                    onClick={() => setClanCurrentPage(clanTotalPages)}
                    disabled={clanCurrentPage === clanTotalPages}
                  >
                    Dernière
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </main>
  )
}
