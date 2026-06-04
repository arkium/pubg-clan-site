'use client'

import Link from 'next/link'
import { useMemo, useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

import ClanSectionNav from '@/components/ClanSectionNav'
import PlacementBadge from '@/components/ui/PlacementBadge'
import TeamModeBadge, { teamModeFromMemberCount } from '@/components/ui/TeamModeBadge'

type TelemetryStatus = 'success' | 'failed' | 'pending'

type TelemetrySummary = {
  totalEvents: number
  killEvents: number
  reviveEvents: number
  damageEvents: number
  knockoutEvents?: number
  itemUseEvents?: number
  vehicleEvents?: number
  positionEvents?: number
  phaseChangeEvents?: number
  blueZoneEvents?: number
  distinctEventTypes?: number
}

type TelemetryWeaponStat = {
  weaponName: string
  kills: number
  headshots: number
  damageDealt: number
}

type TelemetryMemberWeaponStat = {
  weaponName: string
  kills: number
  headshots: number
  damageDealt: number
  killDistance?: number
}

type TelemetryMemberStat = {
  memberKey: string
  teamId?: number
  teamPlacement?: number
  kills: number
  headshots: number
  damageDealt: number
  revives: number
  knockouts: number
  deaths: number
  blueZoneHits: number
  vehicleRideEvents: number
  vehicleLeaveEvents: number
  positionEvents: number
  weapons?: TelemetryMemberWeaponStat[]
}

type MatchMember = {
  memberId: number
  displayName: string
  kills: number
  damage: number
  assists: number
  revives: number
  placement: number
}

type MatchTelemetryResponse = {
  ok: boolean
  data?: {
    match?: {
      id: string
      pubgMatchId: string
      gameMode: string
      mapName: string
      placement: number
      createdAt: string
      totalKills: number
      totalDamage: number
      totalAssists: number
      totalRevives: number
      members: MatchMember[]
    }
    telemetry?: {
      status: TelemetryStatus
      attemptCount: number
      lastAttemptAt: string | null
      nextRetryAt: string | null
      parserVersion: string
      parsedAt: string
      sourceGeneratedAt: string | null
      contentLength: number | null
      bytesDownloaded: number | null
      errorCode: string | null
      errorMessage: string | null
      summary: unknown
      weaponStats: unknown
      memberStats: unknown
      createdAt: string
      updatedAt: string
    }
    weaponLabels?: Record<string, string>
    memberIdentityMap?: Record<string, string>
  }
  error?: {
    message?: string
  }
}

function parseUnknownJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value
  }

  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  return value as Record<string, unknown>
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function displayWeaponName(
  weaponName: string,
  labels?: Record<string, string>
) {
  if (labels && labels[weaponName]) {
    return labels[weaponName]
  }

  return weaponName
}

function normalizeAccountId(value: string) {
  const normalized = value.trim().toLowerCase()
  if (normalized.startsWith('account.')) {
    return normalized
  }

  return `account.${normalized}`
}

function resolveTelemetryMemberLabel(
  memberKey: string,
  memberIdentityMap?: Record<string, string>
) {
  const trimmedKey = memberKey.trim()
  const accountLike = /^account\./i.test(trimmedKey)

  if (!accountLike) {
    return {
      label: trimmedKey || 'Unknown',
      tone: 'known' as const,
      accountId: null,
    }
  }

  const resolved = memberIdentityMap?.[normalizeAccountId(trimmedKey)]
  if (resolved) {
    return {
      label: resolved,
      tone: 'resolved' as const,
      accountId: trimmedKey,
    }
  }

  return {
    label: trimmedKey,
    tone: 'unresolved' as const,
    accountId: trimmedKey,
  }
}

function parseId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parseMatchId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  return value.trim().length > 0 ? value : null
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'n/a'
  }

  return new Date(value).toLocaleString('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function formatBytes(value: number | null) {
  if (!value || value <= 0) {
    return 'n/a'
  }

  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} Mo`
  }

  if (value >= 1024) {
    return `${Math.round(value / 1024)} Ko`
  }

  return `${value} o`
}

function telemetryTone(status: TelemetryStatus) {
  if (status === 'success') {
    return 'border-emerald-200 bg-emerald-100 text-emerald-900'
  }

  if (status === 'failed') {
    return 'border-rose-200 bg-rose-100 text-rose-900'
  }

  return 'border-amber-200 bg-amber-100 text-amber-900'
}

function telemetryLabel(status: TelemetryStatus) {
  if (status === 'success') {
    return 'Telemetrie OK'
  }

  if (status === 'failed') {
    return 'Telemetrie KO'
  }

  return 'Telemetrie en attente'
}

function toTelemetrySummary(value: unknown): TelemetrySummary | null {
  const parsed = parseUnknownJson(value)
  const candidate = asRecord(parsed)

  if (!candidate) {
    return null
  }

  return {
    totalEvents: asNumber(candidate.totalEvents),
    killEvents: asNumber(candidate.killEvents),
    reviveEvents: asNumber(candidate.reviveEvents),
    damageEvents: asNumber(candidate.damageEvents),
    knockoutEvents: asNumber(candidate.knockoutEvents),
    itemUseEvents: asNumber(candidate.itemUseEvents),
    vehicleEvents: asNumber(candidate.vehicleEvents),
    positionEvents: asNumber(candidate.positionEvents),
    phaseChangeEvents: asNumber(candidate.phaseChangeEvents),
    blueZoneEvents: asNumber(candidate.blueZoneEvents),
    distinctEventTypes: asNumber(candidate.distinctEventTypes),
  }
}

function toTelemetryWeaponStats(value: unknown): TelemetryWeaponStat[] {
  const parsed = parseUnknownJson(value)
  if (!Array.isArray(parsed)) {
    return []
  }

  return parsed
    .filter((entry): entry is TelemetryWeaponStat => {
      const candidate = asRecord(entry)
      return !!candidate && typeof candidate.weaponName === 'string'
    })
    .map((entry) => {
      const candidate = entry as unknown as Record<string, unknown>
      return {
        weaponName: asString(candidate.weaponName, 'Unknown'),
        kills: asNumber(candidate.kills),
        headshots: asNumber(candidate.headshots),
        damageDealt: asNumber(candidate.damageDealt),
      }
    })
    .sort((left, right) => {
      if (right.kills !== left.kills) {
        return right.kills - left.kills
      }

      return right.damageDealt - left.damageDealt
    })
}

function toTelemetryMemberStats(value: unknown): TelemetryMemberStat[] {
  const parsed = parseUnknownJson(value)
  if (!Array.isArray(parsed)) {
    return []
  }

  return parsed
    .filter((entry): entry is TelemetryMemberStat => {
      const candidate = asRecord(entry)
      return !!candidate && typeof candidate.memberKey === 'string'
    })
    .map((member) => {
      const source = member as unknown as Record<string, unknown>
      const weapons = Array.isArray(source.weapons)
        ? source.weapons
            .filter((entry): entry is Record<string, unknown> => {
              const candidate = asRecord(entry)
              return !!candidate && typeof candidate.weaponName === 'string'
            })
            .map((entry) => ({
              weaponName: asString(entry.weaponName, 'Unknown'),
              kills: asNumber(entry.kills),
              headshots: asNumber(entry.headshots),
              damageDealt: asNumber(entry.damageDealt),
              killDistance: asNumber(entry.killDistance),
            }))
        : []

      return {
        memberKey: asString(source.memberKey, 'Unknown'),
        teamId: asOptionalNumber(source.teamId),
        teamPlacement: asOptionalNumber(source.teamPlacement),
        kills: asNumber(source.kills),
        headshots: asNumber(source.headshots),
        damageDealt: asNumber(source.damageDealt),
        revives: asNumber(source.revives),
        knockouts: asNumber(source.knockouts),
        deaths: asNumber(source.deaths),
        blueZoneHits: asNumber(source.blueZoneHits),
        vehicleRideEvents: asNumber(source.vehicleRideEvents),
        vehicleLeaveEvents: asNumber(source.vehicleLeaveEvents),
        positionEvents: asNumber(source.positionEvents),
        weapons,
      }
    })
    .sort((left, right) => {
      if (right.kills !== left.kills) {
        return right.kills - left.kills
      }

      return right.damageDealt - left.damageDealt
    })
}

export default function MatchTelemetryDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()

  const clanId = useMemo(() => parseId(params.clanId), [params.clanId])
  const matchId = useMemo(() => parseMatchId(params.matchId), [params.matchId])
  const hasValidParams = Boolean(clanId && matchId)

  const period = searchParams.get('period') === 'month' ? 'month' : 'week'
  const fromDate = searchParams.get('fromDate')

  const [loading, setLoading] = useState(hasValidParams)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState<MatchTelemetryResponse['data'] | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [resyncLoading, setResyncLoading] = useState(false)
  const [resyncMessage, setResyncMessage] = useState('')

  useEffect(() => {
    if (!hasValidParams || !clanId || !matchId) {
      return
    }

    let cancelled = false

    async function loadDetail() {
      try {
        setLoading(true)
        setError('')

        const response = await fetch(`/api/clans/${clanId}/matches/${matchId}/telemetry`, {
          cache: 'no-store',
        })

        const data = (await response.json().catch(() => null)) as MatchTelemetryResponse | null

        if (!response.ok || !data?.ok || !data.data?.match || !data.data?.telemetry) {
          throw new Error(data?.error?.message ?? 'Impossible de charger la telemetrie du match')
        }

        if (!cancelled) {
          setPayload(data.data)
        }
      } catch (loadError) {
        if (!cancelled) {
          setPayload(null)
          setError(loadError instanceof Error ? loadError.message : 'Impossible de charger la telemetrie du match')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadDetail()

    return () => {
      cancelled = true
    }
  }, [hasValidParams, clanId, matchId, reloadNonce])

  async function runResyncMatch() {
    if (!clanId || !matchId) {
      return
    }

    try {
      setResyncLoading(true)
      setResyncMessage('')

      const response = await fetch(`/api/clans/${clanId}/telemetry/sync-selected`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          squadMatchIds: [matchId],
        }),
      })

      const data = (await response.json().catch(() => null)) as
        | {
            ok?: boolean
            error?: string
            successCount?: number
            failedCount?: number
          }
        | null

      if (!response.ok || !data?.ok) {
        setResyncMessage(data?.error ?? 'Echec resync telemetry.')
        return
      }

      setResyncMessage(
        `Resync termine: ${data.successCount ?? 0} succes, ${data.failedCount ?? 0} echec.`
      )
      setReloadNonce((current) => current + 1)
    } catch {
      setResyncMessage('Echec resync telemetry.')
    } finally {
      setResyncLoading(false)
    }
  }

  const backHref = useMemo(() => {
    if (!clanId) {
      return '/clans'
    }

    if (fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
      return `/clans/${clanId}/matches/session/${fromDate}?period=${period}`
    }

    return `/clans/${clanId}/matches?period=${period}`
  }, [clanId, fromDate, period])

  if (!clanId || !matchId) {
    return (
      <main className="app-container app-main">
        <p className="text-sm text-rose-700">Identifiants invalides.</p>
      </main>
    )
  }

  const match = payload?.match
  const telemetry = payload?.telemetry
  const weaponLabels = payload?.weaponLabels
  const memberIdentityMap = payload?.memberIdentityMap

  const summary = toTelemetrySummary(telemetry?.summary)
  const weaponStats = toTelemetryWeaponStats(telemetry?.weaponStats)
  const memberStats = toTelemetryMemberStats(telemetry?.memberStats)
  const clanAccountIds = useMemo(() => {
    return new Set(
      Object.keys(memberIdentityMap ?? {}).map((accountId) => normalizeAccountId(accountId))
    )
  }, [memberIdentityMap])

  const clanTeamId = useMemo(() => {
    for (const member of memberStats) {
      if (typeof member.teamId !== 'number') {
        continue
      }

      const key = member.memberKey.trim()
      if (!/^account\./i.test(key)) {
        continue
      }

      if (clanAccountIds.has(normalizeAccountId(key))) {
        return member.teamId
      }
    }

    return null
  }, [memberStats, clanAccountIds])

  const groupedMemberStats = useMemo(() => {
    const byTeam = new Map<number, TelemetryMemberStat[]>()
    const unknownTeamMembers: TelemetryMemberStat[] = []

    for (const member of memberStats) {
      if (typeof member.teamId === 'number') {
        const bucket = byTeam.get(member.teamId)
        if (bucket) {
          bucket.push(member)
        } else {
          byTeam.set(member.teamId, [member])
        }
      } else {
        unknownTeamMembers.push(member)
      }
    }

    const knownGroups = Array.from(byTeam.entries())
      .sort((left, right) => left[0] - right[0])
      .map(([teamId, members], index) => ({
        id: `team-${teamId}`,
        title: `Team #${index}`,
        teamId,
        members,
      }))

    if (unknownTeamMembers.length > 0) {
      knownGroups.push({
        id: 'team-unknown',
        title: 'Team inconnue',
        teamId: null,
        members: unknownTeamMembers,
      })
    }

    return knownGroups
  }, [memberStats])
  const hasMissingPersistedJson =
    telemetry?.status === 'success' &&
    telemetry?.summary === null &&
    telemetry?.weaponStats === null &&
    telemetry?.memberStats === null

  return (
    <main className="app-container app-main space-y-4">
      <section className="app-panel p-4 md:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">Telemetry match detail</p>
            <h1 className="text-2xl font-bold text-slate-900">Detail telemetrie du match</h1>
            <p className="mt-1 text-sm text-slate-600">
              Donnees lues depuis SquadMatchTelemetry pour audit parser/aggregats.
            </p>
          </div>
          <Link href={backHref} className="app-btn app-btn--sm app-btn--secondary">
            Retour
          </Link>
        </div>
        <ClanSectionNav clanId={clanId} />
      </section>

      {loading ? <p className="text-sm text-slate-600">Chargement de la telemetrie...</p> : null}
      {!loading && error ? (
        <section className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </section>
      ) : null}

      {!loading && !error && match && telemetry ? (
        <>
          <section className="app-panel p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Contexte match</h2>
                <p className="text-sm text-slate-600">Match {match.pubgMatchId}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <TeamModeBadge mode={teamModeFromMemberCount(match.members.length)} />
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${telemetryTone(telemetry.status)}`}>
                  {telemetryLabel(telemetry.status)}
                </span>
                <button
                  type="button"
                  onClick={runResyncMatch}
                  className="app-btn app-btn--sm app-btn--secondary"
                  disabled={resyncLoading}
                >
                  {resyncLoading ? 'Resync en cours...' : 'Resync ce match'}
                </button>
              </div>
            </div>

            {resyncMessage ? <p className="mt-2 text-sm text-amber-700">{resyncMessage}</p> : null}

            {hasMissingPersistedJson ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Snapshot telemetry marque en succes mais JSON detail absent en base.
                Utilise "Resync ce match" pour reparser et repersister les champs summary/weaponStats/memberStats.
              </div>
            ) : null}

            <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Carte</dt>
                <dd className="mt-1 font-semibold text-slate-900">{match.mapName}</dd>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Mode</dt>
                <dd className="mt-1 font-semibold text-slate-900">{match.gameMode}</dd>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Placement</dt>
                <dd className="mt-1"><PlacementBadge placement={match.placement} /></dd>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Date match</dt>
                <dd className="mt-1 font-semibold text-slate-900">{formatDateTime(match.createdAt)}</dd>
              </div>
            </dl>

            <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Kills team</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-900">{match.totalKills}</dd>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Damage team</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-900">{Math.round(match.totalDamage)}</dd>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Assists team</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-900">{match.totalAssists}</dd>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Revives team</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-900">{match.totalRevives}</dd>
              </div>
            </dl>

            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-2 py-2">Joueur</th>
                    <th className="px-2 py-2 text-right">Kills</th>
                    <th className="px-2 py-2 text-right">Damage</th>
                    <th className="px-2 py-2 text-right">Assists</th>
                    <th className="px-2 py-2 text-right">Revives</th>
                  </tr>
                </thead>
                <tbody>
                  {match.members.map((member) => (
                    <tr key={member.memberId} className="border-t border-slate-100">
                      <td className="px-2 py-2">{member.displayName}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{member.kills}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{Math.round(member.damage)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{member.assists}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{member.revives}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="app-panel p-4 md:p-5">
            <h2 className="text-lg font-semibold text-slate-900">Etat pipeline telemetry</h2>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Parser version</dt>
                <dd className="mt-1 font-semibold text-slate-900">{telemetry.parserVersion}</dd>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Attempts</dt>
                <dd className="mt-1 font-semibold text-slate-900">{telemetry.attemptCount}</dd>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Bytes download</dt>
                <dd className="mt-1 font-semibold text-slate-900">{formatBytes(telemetry.bytesDownloaded)}</dd>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Content length</dt>
                <dd className="mt-1 font-semibold text-slate-900">{formatBytes(telemetry.contentLength)}</dd>
              </div>
            </dl>

            <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Parsed at</dt>
                <dd className="mt-1 text-sm font-medium text-slate-900">{formatDateTime(telemetry.parsedAt)}</dd>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Source generated at</dt>
                <dd className="mt-1 text-sm font-medium text-slate-900">{formatDateTime(telemetry.sourceGeneratedAt)}</dd>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Last attempt</dt>
                <dd className="mt-1 text-sm font-medium text-slate-900">{formatDateTime(telemetry.lastAttemptAt)}</dd>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                <dt className="text-xs uppercase tracking-wide text-slate-500">Next retry</dt>
                <dd className="mt-1 text-sm font-medium text-slate-900">{formatDateTime(telemetry.nextRetryAt)}</dd>
              </div>
            </dl>

            {telemetry.status === 'failed' ? (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                <p className="font-semibold">Erreur telemetry</p>
                <p className="mt-1">Code: {telemetry.errorCode ?? 'n/a'}</p>
                <p className="mt-1">Message: {telemetry.errorMessage ?? 'n/a'}</p>
              </div>
            ) : null}
          </section>

          <section className="app-panel p-4 md:p-5">
            <h2 className="text-lg font-semibold text-slate-900">Resume parser</h2>
            {summary ? (
              <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Total events</dt>
                  <dd className="mt-1 text-lg font-semibold text-slate-900">{summary.totalEvents}</dd>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Kills</dt>
                  <dd className="mt-1 text-lg font-semibold text-slate-900">{summary.killEvents}</dd>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Revives</dt>
                  <dd className="mt-1 text-lg font-semibold text-slate-900">{summary.reviveEvents}</dd>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Damage events</dt>
                  <dd className="mt-1 text-lg font-semibold text-slate-900">{summary.damageEvents}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Aucun resume exploitable dans la colonne summary.</p>
            )}
          </section>

          <section className="app-panel p-4 md:p-5">
            <h2 className="text-lg font-semibold text-slate-900">Top armes (weaponStats)</h2>
            {weaponStats.length > 0 ? (
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-2">Arme</th>
                      <th className="px-2 py-2 text-right">Kills</th>
                      <th className="px-2 py-2 text-right">Headshots</th>
                      <th className="px-2 py-2 text-right">Damage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weaponStats.map((weapon) => (
                      <tr key={weapon.weaponName} className="border-t border-slate-100">
                        <td className="px-2 py-2">{displayWeaponName(weapon.weaponName, weaponLabels)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{weapon.kills}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{weapon.headshots}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{Math.round(weapon.damageDealt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Aucune arme exploitable dans weaponStats.</p>
            )}
          </section>

          <section className="app-panel mb-4 p-4 md:p-5">
            <h2 className="text-lg font-semibold text-slate-900">Stats membres parser (memberStats)</h2>
            {memberStats.length > 0 ? (
              <div className="mt-3 space-y-3">
                <p className="text-xs text-slate-500">
                  Legende: Tetes=headshots, Knocks=ennemis a terre, Zone bleue=degats zone, Vehicule=actions vehicule, Positions=events de position.
                </p>
                {groupedMemberStats.map((group) => {
                  const parsedTeamPlacement =
                    group.members.find((member) => typeof member.teamPlacement === 'number')?.teamPlacement
                  const placement =
                    typeof parsedTeamPlacement === 'number'
                      ? parsedTeamPlacement
                      : typeof group.teamId === 'number' &&
                          typeof clanTeamId === 'number' &&
                          group.teamId === clanTeamId
                        ? match.placement
                        : null
                  const teamPlacementLabel = typeof placement === 'number' ? ` · Classement #${placement}` : ''
                  const groupLabel = `${group.title}${group.teamId !== null ? ` · teamId ${group.teamId}` : ''}${teamPlacementLabel} · ${group.members.length} joueur(s)`
                  const membersGrid = (
                    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
                      {group.members.map((member) => (
                        (() => {
                          const resolved = resolveTelemetryMemberLabel(member.memberKey, memberIdentityMap)
                          const cardTone =
                            resolved.tone === 'resolved'
                              ? 'border-emerald-200 bg-emerald-50'
                              : resolved.tone === 'unresolved'
                                ? 'border-amber-200 bg-amber-50'
                                : 'border-slate-200 bg-slate-50'
                          const badgeTone =
                            resolved.tone === 'resolved'
                              ? 'border-emerald-300 bg-white text-emerald-700'
                              : resolved.tone === 'unresolved'
                                ? 'border-amber-300 bg-white text-amber-700'
                                : 'border-slate-300 bg-white text-slate-600'

                          return (
                            <article key={member.memberKey} className={`rounded-lg border px-3 py-2 ${cardTone}`}>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                  <p className="min-w-0 break-all font-semibold text-slate-900">{resolved.label}</p>
                                  {resolved.tone === 'resolved' ? (
                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeTone}`}>
                                      Membre du clan
                                    </span>
                                  ) : null}
                                  {resolved.tone === 'unresolved' ? (
                                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeTone}`}>
                                      Account non mappe
                                    </span>
                                  ) : null}
                                </div>
                                <p className="text-xs text-slate-600">
                                  {member.kills} K · {Math.round(member.damageDealt)} Dmg · {member.revives} Rev · {member.deaths} Deaths
                                </p>
                              </div>
                              {resolved.accountId ? (
                                <p className="mt-1 break-all text-[10px] text-slate-500">Source parser: {resolved.accountId}</p>
                              ) : null}
                              <div className="mt-2 flex flex-wrap gap-1 text-xs text-slate-700">
                                <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">Tetes {member.headshots}</span>
                                <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">Knocks {member.knockouts}</span>
                                <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">Zone bleue {member.blueZoneHits}</span>
                                <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">Vehicule {member.vehicleRideEvents}</span>
                                <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">Positions {member.positionEvents}</span>
                              </div>
                              {member.weapons && member.weapons.length > 0 ? (
                                <div className="mt-2 min-w-0">
                                  <table className="w-full table-fixed text-[11px] leading-tight">
                                    <thead className="text-left uppercase tracking-wide text-slate-500">
                                      <tr>
                                        <th className="w-[58%] px-1 py-1">Arme</th>
                                        <th className="w-[12%] px-1 py-1 text-right">K</th>
                                        <th className="w-[10%] px-1 py-1 text-right">HS</th>
                                        <th className="w-[20%] px-1 py-1 text-right">Dmg</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {member.weapons.map((weapon) => (
                                        <tr key={`${member.memberKey}-${weapon.weaponName}`} className="border-t border-slate-200">
                                          <td className="break-all px-1 py-1">{displayWeaponName(weapon.weaponName, weaponLabels)}</td>
                                          <td className="whitespace-nowrap px-1 py-1 text-right tabular-nums">{weapon.kills}</td>
                                          <td className="whitespace-nowrap px-1 py-1 text-right tabular-nums">{weapon.headshots}</td>
                                          <td className="whitespace-nowrap px-1 py-1 text-right tabular-nums">{Math.round(weapon.damageDealt)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : null}
                            </article>
                          )
                        })()
                      ))}
                    </div>
                  )

                  if (group.title === 'Team #0') {
                    return (
                      <details key={group.id} className="space-y-2">
                        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {groupLabel}
                        </summary>
                        {membersGrid}
                      </details>
                    )
                  }

                  return (
                    <div key={group.id} className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{groupLabel}</p>
                      {membersGrid}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Aucune entree exploitable dans memberStats.</p>
            )}
          </section>

          <section className="app-panel p-4 md:p-5">
            <h2 className="text-lg font-semibold text-slate-900">Payload JSON brut (DB)</h2>
            <p className="mt-1 text-sm text-slate-600">
              Affichage integral des colonnes JSON pour debug et verification des donnees persistees.
            </p>

            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <article className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">summary</p>
                <pre className="max-h-72 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
                  {JSON.stringify(telemetry.summary, null, 2)}
                </pre>
              </article>
              <article className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">weaponStats</p>
                <pre className="max-h-72 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
                  {JSON.stringify(telemetry.weaponStats, null, 2)}
                </pre>
              </article>
              <article className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">memberStats</p>
                <pre className="max-h-72 overflow-auto rounded bg-slate-900 p-2 text-xs text-slate-100">
                  {JSON.stringify(telemetry.memberStats, null, 2)}
                </pre>
              </article>
            </div>
          </section>
        </>
      ) : null}
    </main>
  )
}
