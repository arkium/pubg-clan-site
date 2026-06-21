'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useMemo, useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'

import SectionNav from '@/components/SectionNav'
import PlacementBadge from '@/components/ui/PlacementBadge'
import TeamModeBadge, { teamModeFromMemberCount } from '@/components/ui/TeamModeBadge'
import { isGameLabel } from '@/lib/phase-label-service'
import { getMapBounds } from '@/lib/pubg-telemetry/position-heatmap'
import { resolveGameMode } from '@/lib/pubg-assets'

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
  firstKillPhase: number
  kills: number
  headshots: number
  damageDealt: number
  damageTaken: number
  onFootDistanceMeters: number
  vehicleDistanceMeters: number
  revives: number
  knockouts: number
  deaths: number
  blueZoneHits: number
  circleDelaySeconds: number
  circleDelayPercent: number
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
      positionSamples: unknown
      trajectorySegments: unknown
      deathSamples: unknown
      phaseSnapshots: unknown
      createdAt: string
      updatedAt: string
    }
    weaponLabels?: Record<string, string>
    phaseLabels?: Record<string, string>
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

function formatSeconds(value: number) {
  return `${Math.max(0, value).toFixed(1)} s`
}

function formatPercent(value: number) {
  return `${Math.max(0, value).toFixed(1)}%`
}

function formatMeters(value: number) {
  // Distances telemetry are stored with a x10 scale.
  return `${(Math.max(0, value) / 10).toFixed(0)} m`
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

type TelemetryPositionSample = {
  memberKey: string
  teamId?: number
  phase: number
  timestampSeconds: number | null
  x: number
  y: number
  inVehicle: boolean
}

type TelemetryTrajectorySegment = {
  memberKey: string
  teamId?: number
  phase: number
  timestampStart: number | null
  timestampEnd: number | null
  fromX: number
  fromY: number
  toX: number
  toY: number
}

function toTelemetryPositionSamples(value: unknown): TelemetryPositionSample[] {
  const parsed = parseUnknownJson(value)
  if (!Array.isArray(parsed)) {
    return []
  }

  return parsed
    .filter((entry): entry is Record<string, unknown> => {
      const candidate = asRecord(entry)
      return !!candidate && typeof candidate.memberKey === 'string'
    })
    .map((entry) => ({
      memberKey: asString(entry.memberKey, 'Unknown'),
      teamId: asOptionalNumber(entry.teamId),
      phase: asNumber(entry.phase),
      timestampSeconds: asOptionalNumber(entry.timestampSeconds) ?? null,
      x: asNumber(entry.x),
      y: asNumber(entry.y),
      inVehicle: Boolean(entry.inVehicle),
    }))
}

function toTelemetryTrajectorySegments(value: unknown): TelemetryTrajectorySegment[] {
  const parsed = parseUnknownJson(value)
  if (!Array.isArray(parsed)) {
    return []
  }

  return parsed
    .filter((entry): entry is Record<string, unknown> => {
      const candidate = asRecord(entry)
      return !!candidate && typeof candidate.memberKey === 'string'
    })
    .map((entry) => ({
      memberKey: asString(entry.memberKey, 'Unknown'),
      teamId: asOptionalNumber(entry.teamId),
      phase: asNumber(entry.phase),
      timestampStart: asOptionalNumber(entry.timestampStart) ?? null,
      timestampEnd: asOptionalNumber(entry.timestampEnd) ?? null,
      fromX: asNumber(entry.fromX),
      fromY: asNumber(entry.fromY),
      toX: asNumber(entry.toX),
      toY: asNumber(entry.toY),
    }))
}

function toMapPercent(mapName: string, x: number, y: number) {
  const bounds = getMapBounds(mapName)
  return {
    x: clamp01(x / bounds.width) * 100,
    y: clamp01(y / bounds.height) * 100,
  }
}

function toMapPercentUnclamped(mapName: string, x: number, y: number) {
  const bounds = getMapBounds(mapName)
  return {
    x: (x / bounds.width) * 100,
    y: (y / bounds.height) * 100,
  }
}

function isWithinMapBounds(percent: { x: number; y: number }) {
  return percent.x >= 0 && percent.x <= 100 && percent.y >= 0 && percent.y <= 100
}

function mapAssetPath(mapName: string) {
  return `/maps/pubg/${mapName}.webp`
}

type PhaseSnapshot = {
  isGame: number
  timestampSeconds: number
  numAlivePlayers: number
  numAliveTeams: number
  safetyZoneRadiusMeters: number
  poisonGasWarningRadiusMeters: number
}

function toPhaseSnapshots(value: unknown): PhaseSnapshot[] {
  const parsed = parseUnknownJson(value)
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter((entry): entry is Record<string, unknown> => !!asRecord(entry))
    .map((entry) => ({
      isGame: asNumber(entry.isGame),
      timestampSeconds: asNumber(entry.timestampSeconds),
      numAlivePlayers: asNumber(entry.numAlivePlayers),
      numAliveTeams: asNumber(entry.numAliveTeams),
      // PUBG telemetry radii are in centimeters; convert to meters for UI.
      safetyZoneRadiusMeters: Math.max(0, asNumber(entry.safetyZoneRadiusMeters)) / 100,
      poisonGasWarningRadiusMeters: Math.max(0, asNumber(entry.poisonGasWarningRadiusMeters)) / 100,
    }))
    .filter((s) => s.timestampSeconds >= 0)
}

function phaseType(isGame: number): 'stable' | 'shrinking' | 'pre' {
  if (isGame < 1) return 'pre'
  return Number.isInteger(isGame) ? 'stable' : 'shrinking'
}

function formatElapsed(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}m${String(s).padStart(2, '0')}s`
}

function formatDistanceMeters(meters: number) {
  if (!Number.isFinite(meters) || meters <= 0) {
    return '0 m'
  }

  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`
  }

  return `${Math.round(meters)} m`
}

function isSamePhase(left: number, right: number) {
  return Math.abs(left - right) < 0.01
}

function formatPhaseFilterLabel(phase: number, labels: Record<string, string>) {
  const alias = isGameLabel(phase, labels)

  if (phase < 1) {
    return `${alias} (${phase.toFixed(1)})`
  }

  if (Number.isInteger(phase)) {
    return `${alias} (${phase.toFixed(0)})`
  }

  return `${alias} (${phase.toFixed(1)})`
}

// Derive one representative row per distinct isGame value (first occurrence)
function buildPhaseTable(snapshots: PhaseSnapshot[]): PhaseSnapshot[] {
  const seen = new Map<number, PhaseSnapshot>()
  for (const snap of snapshots) {
    if (!seen.has(snap.isGame)) seen.set(snap.isGame, snap)
  }
  return Array.from(seen.values()).sort((a, b) => a.timestampSeconds - b.timestampSeconds)
}

// Build a downsampled series for charts: keep first of each distinct isGame + ~1 per 15s max
function buildChartSeries(snapshots: PhaseSnapshot[]): PhaseSnapshot[] {
  if (snapshots.length === 0) return []
  const out: PhaseSnapshot[] = [snapshots[0]]
  for (const snap of snapshots.slice(1)) {
    const prev = out.at(-1)!
    if (prev.isGame !== snap.isGame || snap.timestampSeconds - prev.timestampSeconds >= 15) {
      out.push(snap)
    }
  }
  return out
}

function SvgLineChart({
  series,
  lines,
  height = 140,
}: {
  series: PhaseSnapshot[]
  lines: Array<{
    getValue: (s: PhaseSnapshot) => number
    stroke: string
    fill?: string
    dashed?: boolean
    label: string
  }>
  height?: number
}) {
  if (series.length < 2) return <p className="text-xs text-slate-500">Pas assez de données.</p>

  const W = 600
  const H = height
  const PAD = { top: 8, right: 8, bottom: 24, left: 44 }
  const innerW = W - PAD.left - PAD.right
  const innerH = H - PAD.top - PAD.bottom

  const minT = series[0].timestampSeconds
  const maxT = series.at(-1)!.timestampSeconds
  const allValues = lines.flatMap(({ getValue }) => series.map(getValue))
  const minV = 0
  const maxV = Math.max(...allValues, 1)

  const tx = (t: number) => PAD.left + ((t - minT) / Math.max(maxT - minT, 1)) * innerW
  const ty = (v: number) => PAD.top + innerH - ((v - minV) / Math.max(maxV - minV, 1)) * innerH

  // X axis ticks: ~6 evenly spaced
  const tickCount = 6
  const xTicks = Array.from({ length: tickCount }, (_, i) =>
    minT + (i / (tickCount - 1)) * (maxT - minT)
  )
  // Y axis ticks: 4
  const yTicks = Array.from({ length: 4 }, (_, i) => minV + (i / 3) * (maxV - minV))

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full overflow-visible"
      style={{ height }}
    >
      {/* Grid lines */}
      {yTicks.map((v) => (
        <line
          key={v}
          x1={PAD.left} y1={ty(v)} x2={W - PAD.right} y2={ty(v)}
          stroke="currentColor" strokeOpacity={0.12} strokeWidth={0.7}
          className="text-slate-500"
        />
      ))}
      {/* Y axis labels */}
      {yTicks.map((v) => (
        <text key={v} x={PAD.left - 4} y={ty(v) + 4} textAnchor="end"
          className="text-[9px] fill-slate-400" fontSize={9}>
          {v >= 1000 ? `${(v / 1000).toFixed(0)}k` : Math.round(v)}
        </text>
      ))}
      {/* X axis labels */}
      {xTicks.map((t) => (
        <text key={t} x={tx(t)} y={H - 2} textAnchor="middle"
          className="text-[8px] fill-slate-400" fontSize={8}>
          {formatElapsed(t - minT)}
        </text>
      ))}

      {lines.map(({ getValue, stroke, fill, dashed, label }) => {
        const pts = series.map((s) => `${tx(s.timestampSeconds).toFixed(1)},${ty(getValue(s)).toFixed(1)}`).join(' ')
        const closeArea = fill
          ? ` ${tx(series.at(-1)!.timestampSeconds).toFixed(1)},${ty(0).toFixed(1)} ${tx(series[0].timestampSeconds).toFixed(1)},${ty(0).toFixed(1)}`
          : ''
        return (
          <g key={label}>
            {fill && (
              <polygon
                points={pts + closeArea}
                fill={fill} fillOpacity={0.15}
              />
            )}
            <polyline
              points={pts}
              fill="none"
              stroke={stroke}
              strokeWidth={1.5}
              strokeDasharray={dashed ? '4 3' : undefined}
            />
            {series
              .filter((s) => phaseType(s.isGame) !== 'pre')
              .filter((_, i) => i % Math.ceil(series.length / 20) === 0 || i === series.length - 1)
              .map((s) => (
                <circle
                  key={s.timestampSeconds}
                  cx={tx(s.timestampSeconds)} cy={ty(getValue(s))} r={2.5}
                  fill={phaseType(s.isGame) === 'shrinking' ? '#f97316' : stroke}
                  stroke="white" strokeWidth={0.8}
                />
              ))}
          </g>
        )
      })}
    </svg>
  )
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
        firstKillPhase: asNumber(source.firstKillPhase),
        kills: asNumber(source.kills),
        headshots: asNumber(source.headshots),
        damageDealt: asNumber(source.damageDealt),
        damageTaken: asNumber(source.damageTaken),
        onFootDistanceMeters: asNumber(source.onFootDistanceMeters),
        vehicleDistanceMeters: asNumber(source.vehicleDistanceMeters),
        revives: asNumber(source.revives),
        knockouts: asNumber(source.knockouts),
        deaths: asNumber(source.deaths),
        blueZoneHits: asNumber(source.blueZoneHits),
        circleDelaySeconds: asNumber(source.circleDelaySeconds),
        circleDelayPercent: asNumber(source.circleDelayPercent),
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
  const [fileImportLoading, setFileImportLoading] = useState(false)
  const [fileImportMessage, setFileImportMessage] = useState('')
  const [rawPhaseFilter, setRawPhaseFilter] = useState<'all' | number>('all')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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

  async function runFileImport(file: File) {
    if (!clanId || !matchId) {
      return
    }

    try {
      setFileImportLoading(true)
      setFileImportMessage('')

      const formData = new FormData()
      formData.append('squadMatchId', matchId)
      formData.append('recalculateAggregates', 'false')
      formData.append('file', file)

      const response = await fetch(`/api/clans/${clanId}/telemetry/import-file`, {
        method: 'POST',
        body: formData,
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
        setFileImportMessage(data?.error ?? 'Echec import fichier telemetry.')
        return
      }

      setFileImportMessage(
        `Import terminé: ${data.successCount ?? 0} succès, ${data.failedCount ?? 0} échec(s).`
      )
      setReloadNonce((current) => current + 1)
    } catch {
      setFileImportMessage('Echec import fichier telemetry.')
    } finally {
      setFileImportLoading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
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
  const phaseLabels = payload?.phaseLabels ?? {}
  const memberIdentityMap = payload?.memberIdentityMap

  const summary = toTelemetrySummary(telemetry?.summary)
  const weaponStats = toTelemetryWeaponStats(telemetry?.weaponStats)
  const memberStats = toTelemetryMemberStats(telemetry?.memberStats)
  const positionSamples = toTelemetryPositionSamples(telemetry?.positionSamples)
  const trajectorySegments = toTelemetryTrajectorySegments(telemetry?.trajectorySegments)
  const deathSamples = toTelemetryPositionSamples(telemetry?.deathSamples)
  const phaseSnapshots = toPhaseSnapshots(telemetry?.phaseSnapshots)

  const rawPhaseOptions = useMemo(() => {
    const phases = new Set<number>()
    for (const point of positionSamples) {
      if (Number.isFinite(point.phase) && point.phase > 0) {
        phases.add(point.phase)
      }
    }
    for (const segment of trajectorySegments) {
      if (Number.isFinite(segment.phase) && segment.phase > 0) {
        phases.add(segment.phase)
      }
    }
    for (const point of deathSamples) {
      if (Number.isFinite(point.phase) && point.phase > 0) {
        phases.add(point.phase)
      }
    }
    return Array.from(phases.values()).sort((a, b) => a - b)
  }, [positionSamples, trajectorySegments, deathSamples])

  useEffect(() => {
    if (rawPhaseFilter === 'all') {
      return
    }

    if (!rawPhaseOptions.some((phase) => isSamePhase(phase, rawPhaseFilter))) {
      setRawPhaseFilter('all')
    }
  }, [rawPhaseFilter, rawPhaseOptions])

  const filteredPositionSamples = useMemo(() => {
    if (rawPhaseFilter === 'all') {
      return positionSamples
    }

    return positionSamples.filter((point) => isSamePhase(point.phase, rawPhaseFilter))
  }, [positionSamples, rawPhaseFilter])

  const filteredTrajectorySegments = useMemo(() => {
    if (rawPhaseFilter === 'all') {
      return trajectorySegments
    }

    return trajectorySegments.filter((segment) => isSamePhase(segment.phase, rawPhaseFilter))
  }, [trajectorySegments, rawPhaseFilter])

  const filteredDeathSamples = useMemo(() => {
    if (rawPhaseFilter === 'all') {
      return deathSamples
    }

    return deathSamples.filter((point) => isSamePhase(point.phase, rawPhaseFilter))
  }, [deathSamples, rawPhaseFilter])

  const filteredInBoundsPositionSamples = useMemo(() => {
    if (!match?.mapName) {
      return filteredPositionSamples
    }
    return filteredPositionSamples.filter((point) =>
      isWithinMapBounds(toMapPercentUnclamped(match.mapName, point.x, point.y))
    )
  }, [filteredPositionSamples, match?.mapName])

  const filteredInBoundsDeathSamples = useMemo(() => {
    if (!match?.mapName) {
      return filteredDeathSamples
    }
    return filteredDeathSamples.filter((point) =>
      isWithinMapBounds(toMapPercentUnclamped(match.mapName, point.x, point.y))
    )
  }, [filteredDeathSamples, match?.mapName])

  const filteredInBoundsTrajectorySegments = useMemo(() => {
    if (!match?.mapName) {
      return filteredTrajectorySegments
    }
    return filteredTrajectorySegments.filter((segment) => {
      const from = toMapPercentUnclamped(match.mapName, segment.fromX, segment.fromY)
      const to = toMapPercentUnclamped(match.mapName, segment.toX, segment.toY)
      return isWithinMapBounds(from) && isWithinMapBounds(to)
    })
  }, [filteredTrajectorySegments, match?.mapName])

  const outOfBoundsSummary = useMemo(() => {
    return {
      points: filteredPositionSamples.length - filteredInBoundsPositionSamples.length,
      deaths: filteredDeathSamples.length - filteredInBoundsDeathSamples.length,
      segments: filteredTrajectorySegments.length - filteredInBoundsTrajectorySegments.length,
    }
  }, [
    filteredPositionSamples.length,
    filteredInBoundsPositionSamples.length,
    filteredDeathSamples.length,
    filteredInBoundsDeathSamples.length,
    filteredTrajectorySegments.length,
    filteredInBoundsTrajectorySegments.length,
  ])

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
        teamId: teamId as number | null,
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
        <SectionNav section="clan-section" />
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
                  disabled={resyncLoading || fileImportLoading}
                >
                  {resyncLoading ? 'Resync en cours...' : 'Resync ce match'}
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="app-btn app-btn--sm app-btn--secondary"
                  disabled={resyncLoading || fileImportLoading}
                >
                  {fileImportLoading ? 'Import en cours...' : 'Importer fichier telemetry'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.jsonl,application/json,text/plain"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (!file) {
                      return
                    }

                    void runFileImport(file)
                  }}
                />
              </div>
            </div>

            {resyncMessage ? <p className="mt-2 text-sm text-amber-700">{resyncMessage}</p> : null}
            {fileImportMessage ? <p className="mt-2 text-sm text-amber-700">{fileImportMessage}</p> : null}

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
                <dd className="mt-1 font-semibold text-slate-900">{resolveGameMode(match.gameMode)}</dd>
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
                  Legende: First contact=cercle du premier kill, Degats recus=pression subie, Pied/Vehicule=distance parcourue, Zone bleue=degats zone, Retard cercle=secondes hors safe zone, % hors zone=part du match hors safe zone.
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
                  const isClanTeam =
                    typeof group.teamId === 'number' &&
                    typeof clanTeamId === 'number' &&
                    group.teamId === clanTeamId
                  const teamPlacementLabel = typeof placement === 'number' ? ` · Classement #${placement}` : ''
                  const groupLabel = `${group.title}${group.teamId !== null ? ` · teamId ${group.teamId}` : ''}${teamPlacementLabel} · ${group.members.length} joueur(s)`
                  const teamKills = group.members.reduce((acc, member) => acc + member.kills, 0)
                  const teamHeadshots = group.members.reduce((acc, member) => acc + member.headshots, 0)
                  const teamDamage = Math.round(
                    group.members.reduce((acc, member) => acc + member.damageDealt, 0)
                  )
                  const membersGrid = (
                    <div className="overflow-x-auto pb-1">
                      <div className="grid min-w-[760px] grid-cols-2 gap-2 xl:grid-cols-4">
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
                              <article key={member.memberKey} className={`min-w-0 overflow-hidden rounded-lg border px-3 py-2 ${cardTone}`}>
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
                                  <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">First contact P{member.firstKillPhase > 0 ? member.firstKillPhase : '-'}</span>
                                  <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">Degats recus {Math.round(member.damageTaken)}</span>
                                  <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">Pied {formatMeters(member.onFootDistanceMeters)}</span>
                                  <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">Vehicule {formatMeters(member.vehicleDistanceMeters)}</span>
                                  <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">Retard cercle {formatSeconds(member.circleDelaySeconds)}</span>
                                  <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">Hors zone {formatPercent(member.circleDelayPercent)}</span>
                                  <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">Tetes {member.headshots}</span>
                                  <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">Knocks {member.knockouts}</span>
                                  <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">Zone bleue {member.blueZoneHits}</span>
                                  <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">Vehicule {member.vehicleRideEvents}</span>
                                  <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5">Positions {member.positionEvents}</span>
                                </div>
                                {member.weapons && member.weapons.length > 0 ? (
                                  <div className="mt-2 min-w-0 overflow-x-auto">
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
                    </div>
                  )

                  return (
                    <details
                      key={group.id}
                      className={`group space-y-2 rounded-lg border p-2 ${
                        isClanTeam ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200 bg-transparent'
                      }`}
                      open={isClanTeam}
                    >
                      <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 rounded-md px-1 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 [&::-webkit-details-marker]:hidden">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="inline-block text-sm leading-none transition-transform group-open:rotate-90">▸</span>
                          <span className="min-w-0 truncate">{groupLabel}</span>
                          {isClanTeam ? (
                            <span className="rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                              Team clan
                            </span>
                          ) : null}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-600">
                          {teamKills} K · {teamHeadshots} HS · {teamDamage} Dmg
                        </span>
                      </summary>
                      {membersGrid}
                    </details>
                  )
                })}
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600">Aucune entree exploitable dans memberStats.</p>
            )}
          </section>

          <section className="app-panel p-4 md:p-5">
            <h2 className="text-lg font-semibold text-slate-900">Phases du match (cercles)</h2>
            <p className="mt-1 text-sm text-slate-600">
              Évolution des zones, joueurs en vie et équipes par phase. Points orange = transition (rétrécissement actif), bleus = phase stable.
            </p>
            {match.mapName ? (
              <p className="mt-1 text-xs text-slate-500">
                Échelle carte {match.mapName}: {(getMapBounds(match.mapName).width / 100).toFixed(0)} m × {(getMapBounds(match.mapName).height / 100).toFixed(0)} m
              </p>
            ) : null}

            {phaseSnapshots.length < 2 ? (
              <p className="mt-3 text-sm text-slate-500">
                Aucune donnée de phases disponible. Resynchrisez ce match après la migration.
              </p>
            ) : (
              <>
                {/* Chart: players alive */}
                <div className="mt-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Joueurs en vie</p>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <SvgLineChart
                      series={buildChartSeries(phaseSnapshots)}
                      height={140}
                      lines={[
                        {
                          getValue: (s) => s.numAlivePlayers,
                          stroke: '#3b82f6',
                          fill: '#3b82f6',
                          label: 'Joueurs',
                        },
                      ]}
                    />
                    <div className="mt-1 flex gap-3 text-[10px] text-slate-500">
                      <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-blue-500/70" /> Phase stable (cercle fixe)</span>
                      <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-orange-400" /> Phase transition (rétrécissement)</span>
                    </div>
                  </div>
                </div>

                {/* Chart: zone radii */}
                <div className="mt-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Rayons des zones</p>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                    <SvgLineChart
                      series={buildChartSeries(phaseSnapshots)}
                      height={140}
                      lines={[
                        {
                          getValue: (s) => s.safetyZoneRadiusMeters,
                          stroke: '#10b981',
                          fill: '#10b981',
                          label: 'Zone safe',
                        },
                        {
                          getValue: (s) => s.poisonGasWarningRadiusMeters,
                          stroke: '#f97316',
                          dashed: true,
                          label: 'Zone poison',
                        },
                      ]}
                    />
                    <div className="mt-1 flex gap-3 text-[10px] text-slate-500">
                      <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-emerald-500" /> Zone safe</span>
                      <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-orange-400" /> Zone poison (avertissement)</span>
                    </div>
                  </div>
                </div>

                {/* Phase table */}
                <div className="mt-4">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Tableau des phases — {buildPhaseTable(phaseSnapshots).length} états distincts
                  </p>
                  <p className="mb-2 text-xs text-slate-500">
                    Les phases entières (isGame = 1, 2…) = cercle stable. Les phases .5 (1.5, 2.5…) = transition en rétrécissement actif.
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Phase (isGame)</th>
                          <th className="px-3 py-2">Type</th>
                          <th className="px-3 py-2">Début</th>
                          <th className="px-3 py-2 text-right">Joueurs</th>
                          <th className="px-3 py-2 text-right">Équipes</th>
                          <th className="px-3 py-2 text-right">Rayon safe</th>
                          <th className="px-3 py-2 text-right">Rayon poison</th>
                        </tr>
                      </thead>
                      <tbody>
                        {buildPhaseTable(phaseSnapshots).map((snap) => {
                          const type = phaseType(snap.isGame)
                          const minT = phaseSnapshots[0]?.timestampSeconds ?? 0
                          return (
                            <tr key={snap.isGame} className="border-t border-slate-100">
                              <td className="px-3 py-2 font-medium text-slate-900">
                                Phase {snap.isGame % 1 === 0
                                  ? snap.isGame
                                  : `${Math.floor(snap.isGame)}→${Math.ceil(snap.isGame)}`}
                              </td>
                              <td className="px-3 py-2">
                                {type === 'pre' ? (
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">pré-partie</span>
                                ) : type === 'shrinking' ? (
                                  <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-700">rétrécissement</span>
                                ) : (
                                  <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">stable</span>
                                )}
                              </td>
                              <td className="px-3 py-2 tabular-nums text-slate-700">{formatElapsed(snap.timestampSeconds - minT)}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">{snap.numAlivePlayers}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{snap.numAliveTeams}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatDistanceMeters(snap.safetyZoneRadiusMeters)}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">{formatDistanceMeters(snap.poisonGasWarningRadiusMeters)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </section>

          <section className="app-panel p-4 md:p-5">
            <h2 className="text-lg font-semibold text-slate-900">Positions brutes parser (intermediaire)</h2>
            <p className="mt-1 text-sm text-slate-600">
              Verification directe des champs positionSamples / trajectorySegments / deathSamples pour ce match.
            </p>

            <div className="mt-3 max-w-sm">
              <label className="block text-sm text-slate-700" htmlFor="raw-phase-filter">
                Filtre phase
              </label>
              <select
                id="raw-phase-filter"
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                value={rawPhaseFilter === 'all' ? 'all' : String(rawPhaseFilter)}
                onChange={(event) => {
                  const value = event.target.value
                  if (value === 'all') {
                    setRawPhaseFilter('all')
                    return
                  }

                  const parsed = Number(value)
                  setRawPhaseFilter(Number.isFinite(parsed) && parsed > 0 ? parsed : 'all')
                }}
              >
                <option value="all">Toutes les phases</option>
                {rawPhaseOptions.map((phase) => (
                  <option key={phase} value={String(phase)}>
                    {formatPhaseFilterLabel(phase, phaseLabels)}
                  </option>
                ))}
              </select>
            </div>

            {outOfBoundsSummary.points > 0 || outOfBoundsSummary.deaths > 0 || outOfBoundsSummary.segments > 0 ? (
              <p className="mt-2 text-xs text-amber-700">
                Hors bornes carte (masqués): {outOfBoundsSummary.points} points, {outOfBoundsSummary.segments} segments, {outOfBoundsSummary.deaths} morts.
              </p>
            ) : null}

            <dl className="mt-3 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                <dt className="text-xs uppercase tracking-wide text-slate-500">positionSamples</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-900">{filteredPositionSamples.length}</dd>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                <dt className="text-xs uppercase tracking-wide text-slate-500">trajectorySegments</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-900">{filteredTrajectorySegments.length}</dd>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                <dt className="text-xs uppercase tracking-wide text-slate-500">deathSamples</dt>
                <dd className="mt-1 text-lg font-semibold text-slate-900">{filteredDeathSamples.length}</dd>
              </div>
            </dl>

            {match.mapName ? (
              <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
                <div className="relative aspect-square">
                  <Image
                    src={mapAssetPath(match.mapName)}
                    alt={`Carte ${match.mapName}`}
                    fill
                    className="object-fill opacity-80"
                    unoptimized
                    sizes="(max-width: 1024px) 100vw, 60vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-950/45 via-transparent to-slate-950/55" />

                  <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {filteredInBoundsTrajectorySegments.slice(0, 1200).map((segment, index) => {
                      const from = toMapPercentUnclamped(match.mapName, segment.fromX, segment.fromY)
                      const to = toMapPercentUnclamped(match.mapName, segment.toX, segment.toY)
                      return (
                        <line
                          key={`seg-${index}`}
                          x1={from.x}
                          y1={from.y}
                          x2={to.x}
                          y2={to.y}
                          stroke="rgba(161, 129, 255, 0.65)"
                          strokeWidth={0.22}
                          strokeLinecap="round"
                        />
                      )
                    })}
                  </svg>

                  <div className="absolute inset-0">
                    {filteredInBoundsPositionSamples.slice(0, 2000).map((point, index) => {
                      const pos = toMapPercentUnclamped(match.mapName, point.x, point.y)
                      return (
                        <span
                          key={`pos-${index}`}
                          className="absolute h-1.5 w-1.5 rounded-full bg-cyan-300/80"
                          style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}
                          title={`${point.memberKey} p${point.phase}`}
                        />
                      )
                    })}
                    {filteredInBoundsDeathSamples.slice(0, 400).map((point, index) => {
                      const pos = toMapPercentUnclamped(match.mapName, point.x, point.y)
                      return (
                        <span
                          key={`death-${index}`}
                          className="absolute h-2 w-2 rounded-full border border-rose-200 bg-rose-500/85"
                          style={{ left: `${pos.x}%`, top: `${pos.y}%`, transform: 'translate(-50%, -50%)' }}
                          title={`death ${point.memberKey} p${point.phase}`}
                        />
                      )
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              <article className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Apercu positionSamples</p>
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-900 p-2 text-xs text-slate-100">
                  {JSON.stringify(filteredPositionSamples.slice(0, 40), null, 2)}
                </pre>
              </article>
              <article className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Apercu deathSamples</p>
                <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-900 p-2 text-xs text-slate-100">
                  {JSON.stringify(filteredDeathSamples.slice(0, 40), null, 2)}
                </pre>
              </article>
            </div>
          </section>

          <section className="app-panel p-4 md:p-5">
            <h2 className="text-lg font-semibold text-slate-900">Payload JSON brut (DB)</h2>
            <p className="mt-1 text-sm text-slate-600">
              Affichage integral des colonnes JSON pour debug et verification des donnees persistees.
            </p>

            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <article className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">summary</p>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-900 p-2 text-xs text-slate-100">
                  {JSON.stringify(telemetry.summary, null, 2)}
                </pre>
              </article>
              <article className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">weaponStats</p>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-900 p-2 text-xs text-slate-100">
                  {JSON.stringify(telemetry.weaponStats, null, 2)}
                </pre>
              </article>
              <article className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">memberStats</p>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-900 p-2 text-xs text-slate-100">
                  {JSON.stringify(telemetry.memberStats, null, 2)}
                </pre>
              </article>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              <article className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">positionSamples</p>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-900 p-2 text-xs text-slate-100">
                  {JSON.stringify(telemetry.positionSamples, null, 2)}
                </pre>
              </article>
              <article className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">trajectorySegments</p>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-900 p-2 text-xs text-slate-100">
                  {JSON.stringify(telemetry.trajectorySegments, null, 2)}
                </pre>
              </article>
              <article className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 p-2">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">deathSamples</p>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-slate-900 p-2 text-xs text-slate-100">
                  {JSON.stringify(telemetry.deathSamples, null, 2)}
                </pre>
              </article>
            </div>
          </section>
        </>
      ) : null}
    </main>
  )
}
