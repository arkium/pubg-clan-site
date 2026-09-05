'use client'

import React, { useMemo, useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Crosshair,
  MapPin,
  Plane,
  Radio,
  RefreshCw,
  Shield,
  ShieldAlert,
  Skull,
  Sparkles,
  Swords,
  Trophy,
  Users,
  Flame,
  ChevronRight,
  ExternalLink,
  Target,
  Clock,
  Zap,
} from 'lucide-react'

import PlacementBadge from '@/components/ui/PlacementBadge'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { getMapBounds, clamp01 } from '@/lib/pubg-telemetry/position-heatmap'
import { resolveGameMode, resolveMapName } from '@/lib/pubg-assets'

import { DamageBodySvg, BodyZoneKey, inferHitZones } from '@/components/telemetry/DamageBodySvg'
import { WeaponAccuracyBadge } from '@/components/telemetry/WeaponAccuracyBadge'
import { MatchCombatTimeline, CombatEvent } from '@/components/telemetry/MatchCombatTimeline'

type TelemetryStatus = 'success' | 'failed' | 'pending'

type MatchMember = {
  memberId: number
  displayName: string
  kills: number
  damage: number
  assists: number
  revives: number
  placement: number
}

type KillEventApi = {
  id: string
  killerName: string
  victimName: string
  damageCauser: string
  damageReason: string
  distance: number
  timestamp: string | number
  killerClanTag: string | null
  victimClanTag: string | null
  isClanKill: boolean
  isClanVictim: boolean
}

type ThrowableStatApi = {
  memberId: number
  smokeGrenadeCount: number
  fragGrenadeCount: number
  flashBangCount: number
  molotovCount: number
  stunCount: number
}

type FlightPathApi = {
  start: { x: number; y: number }
  end: { x: number; y: number }
  dropStart?: { x: number; y: number }
  dropEnd?: { x: number; y: number }
  angleDeg: number
}

type TrajectorySegmentApi = {
  memberKey: string
  phase: number
  fromX: number
  fromY: number
  toX: number
  toY: number
}

type PositionSampleApi = {
  memberKey: string
  phase: number
  x: number
  y: number
  timestamp?: number
}

type PhaseSnapshotApi = {
  isGame: number
  timestampSeconds: number
  numAlivePlayers: number
  numAliveTeams: number
  safetyZoneRadiusMeters: number
  poisonGasWarningRadiusMeters: number
  safetyZoneX?: number
  safetyZoneY?: number
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
      summary: unknown
      weaponStats: unknown
      memberStats: unknown
      positionSamples: unknown
      trajectorySegments: unknown
      deathSamples: unknown
      landingSamples: unknown
      knockoutSamples: unknown
      reviveSamples: unknown
      phaseSnapshots: unknown
      flightPath: FlightPathApi | null
    }
    killEvents?: KillEventApi[]
    throwableStats?: ThrowableStatApi[]
    weaponLabels?: Record<string, string>
    phaseLabels?: Record<string, string>
    memberIdentityMap?: Record<string, { name: string; clanTag?: string; clanId?: number }>
    opponentIdentityMap?: Record<string, { name: string; clanTag: string | null }>
  }
  error?: {
    message?: string
  }
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (!value) return fallback
  if (typeof value !== 'string') return value as T
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function mapAssetPath(mapName: string) {
  return `/maps/pubg/${mapName}.webp`
}

function formatTimeElapsed(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}m${String(s).padStart(2, '0')}s`
}

function formatDateTime(value: string | undefined) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsed)
}

function toMapPercent(mapName: string, x: number, y: number) {
  const bounds = getMapBounds(mapName)
  return {
    x: clamp01(x / bounds.width) * 100,
    y: clamp01(y / bounds.height) * 100,
  }
}

export default function MatchTacticalDebriefPage() {
  const params = useParams()
  const searchParams = useSearchParams()

  const clanId = params.clanId ? String(params.clanId) : ''
  const matchId = params.matchId ? String(params.matchId) : ''
  const period = searchParams.get('period') === 'month' ? 'month' : 'week'
  const fromDate = searchParams.get('fromDate')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState<MatchTelemetryResponse['data'] | null>(null)
  const [activeTab, setActiveTab] = useState<'combat' | 'map' | 'squad' | 'duels'>('combat')

  // Map controls
  const [selectedPhase, setSelectedPhase] = useState<number | 'all'>('all')
  const [showFlightPath, setShowFlightPath] = useState(true)
  const [showLandings, setShowLandings] = useState(true)
  const [showDeaths, setShowDeaths] = useState(true)
  const [showTrajectories, setShowTrajectories] = useState(true)
  const [hoveredMapPoint, setHoveredMapPoint] = useState<string | null>(null)

  useEffect(() => {
    if (!clanId || !matchId) return

    let cancelled = false
    async function loadData() {
      try {
        setLoading(true)
        setError('')
        const res = await fetch(`/api/clans/${clanId}/matches/${matchId}/telemetry`, {
          cache: 'no-store',
        })
        const data = (await res.json().catch(() => null)) as MatchTelemetryResponse | null
        if (!res.ok || !data?.ok || !data.data?.match) {
          throw new Error(data?.error?.message ?? 'Impossible de charger le débriefing du match')
        }
        if (!cancelled) {
          setPayload(data.data)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erreur lors du chargement.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadData()
    return () => {
      cancelled = true
    }
  }, [clanId, matchId])

  const match = payload?.match
  const telemetry = payload?.telemetry
  const killEvents = payload?.killEvents ?? []
  const throwableStats = payload?.throwableStats ?? []
  const memberIdentityMap = payload?.memberIdentityMap ?? {}
  const clanTag = (match as any)?.clanTag || 'Clan'
  const otherTrackedClanTags = (match as any)?.otherTrackedClans || []

  // Parsed Telemetry Data
  const memberStats = useMemo(() => {
    return parseJson<any[]>(telemetry?.memberStats, [])
  }, [telemetry?.memberStats])

  const weaponStats = useMemo(() => {
    return parseJson<any[]>(telemetry?.weaponStats, [])
  }, [telemetry?.weaponStats])

  const trajectorySegments = useMemo(() => {
    return parseJson<TrajectorySegmentApi[]>(telemetry?.trajectorySegments, [])
  }, [telemetry?.trajectorySegments])

  const deathSamples = useMemo(() => {
    return parseJson<PositionSampleApi[]>(telemetry?.deathSamples, [])
  }, [telemetry?.deathSamples])

  const landingSamples = useMemo(() => {
    return parseJson<PositionSampleApi[]>(telemetry?.landingSamples, [])
  }, [telemetry?.landingSamples])

  const knockoutSamples = useMemo(() => {
    return parseJson<any[]>(telemetry?.knockoutSamples, [])
  }, [telemetry?.knockoutSamples])

  const reviveSamples = useMemo(() => {
    return parseJson<any[]>(telemetry?.reviveSamples, [])
  }, [telemetry?.reviveSamples])

  const phaseSnapshots = useMemo(() => {
    return parseJson<PhaseSnapshotApi[]>(telemetry?.phaseSnapshots, [])
  }, [telemetry?.phaseSnapshots])

  const flightPath = telemetry?.flightPath || (payload as any)?.flightPath

  // Available phases
  const availablePhases = useMemo(() => {
    const set = new Set<number>()
    for (const snap of phaseSnapshots) {
      if (snap.isGame >= 1 && Number.isInteger(snap.isGame)) {
        set.add(snap.isGame)
      }
    }
    return Array.from(set).sort((a, b) => a - b)
  }, [phaseSnapshots])

  // Current Safe Zone Circle for selected phase
  const activeZoneSnapshot = useMemo(() => {
    if (selectedPhase === 'all' || phaseSnapshots.length === 0) return null
    return (
      phaseSnapshots.find(
        (s) => Math.floor(s.isGame) === selectedPhase && s.safetyZoneRadiusMeters > 0
      ) || null
    )
  }, [phaseSnapshots, selectedPhase])

  // Timeline events provided directly by API, pre-resolved and paired
  const timelineEvents = useMemo<CombatEvent[]>(() => {
    const raw =
      (payload as any)?.combatEvents ||
      (telemetry as any)?.combatEvents ||
      []
    return Array.isArray(raw) ? raw : []
  }, [payload, telemetry])

  // Filtered map elements
  const filteredTrajectorySegments = useMemo(() => {
    if (selectedPhase === 'all') return trajectorySegments
    return trajectorySegments.filter((seg) => seg.phase === selectedPhase)
  }, [trajectorySegments, selectedPhase])

  const filteredDeaths = useMemo(() => {
    if (selectedPhase === 'all') return deathSamples
    return deathSamples.filter((d) => d.phase === selectedPhase)
  }, [deathSamples, selectedPhase])

  // Clan roster and aggregated combat stats
  const clanKills = match?.totalKills ?? 0
  const clanDamage = Math.round(match?.totalDamage ?? 0)
  const clanAssists = match?.totalAssists ?? 0
  const clanRevives = match?.totalRevives ?? 0

  // Aggregated anatomical hits suffered by squad from killEvents
  const squadDamageByZone = useMemo(() => {
    const clanVictims = killEvents.filter((k) => k.isClanVictim)
    const acc: Record<BodyZoneKey, number> = { head: 0, torso: 0, pelvis: 0, arms: 0, legs: 0 }
    if (clanVictims.length > 0) {
      for (const ev of clanVictims) {
        const zones = inferHitZones(ev.damageReason)
        for (const [k, v] of Object.entries(zones)) {
          acc[k as BodyZoneKey] += v
        }
      }
    } else {
      // If squad had no deaths, show distribution from general match duel events
      for (const ev of killEvents) {
        const zones = inferHitZones(ev.damageReason)
        for (const [k, v] of Object.entries(zones)) {
          acc[k as BodyZoneKey] += Math.round(v * 0.4)
        }
      }
    }
    return acc
  }, [killEvents])

  if (loading) {
    return (
      <main className="app-container app-main space-y-4">
        <NavigationTrail
          currentLabel="Débriefing Tactique"
          currentHref={`/clans/${clanId}/telemetry/matches/${matchId}/debrief`}
          fallbackParent={{
            href: `/clans/${clanId}/telemetry/matches`,
            label: 'Matchs',
            altHref: '/clans',
          }}
        />
        <CardSkeleton className="h-48" />
        <CardSkeleton className="h-96" />
      </main>
    )
  }

  if (error || !match) {
    return (
      <main className="app-container app-main space-y-4">
        <NavigationTrail
          currentLabel="Erreur"
          currentHref={`/clans/${clanId}/telemetry/matches/${matchId}/debrief`}
          fallbackParent={{
            href: `/clans/${clanId}/telemetry/matches`,
            label: 'Matchs',
            altHref: '/clans',
          }}
        />
        <div className="p-6 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300">
          <p className="font-semibold">{error || 'Match introuvable.'}</p>
          <Link
            href={`/clans/${clanId}/telemetry/matches`}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-rose-400 hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Retour à la liste des matchs
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="app-container app-main space-y-5">
      {/* --- Breadcrumb Trail --- */}
      <NavigationTrail
        currentLabel={`Débriefing #${match.placement} • ${resolveMapName(match.mapName)}`}
        currentHref={`/clans/${clanId}/telemetry/matches/${matchId}/debrief`}
        fallbackParent={{
          href: `/clans/${clanId}/telemetry/matches`,
          label: 'Matchs',
          altHref: '/clans',
        }}
      />

      {/* --- Notification Banner: Parallel Mode Discovery --- */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-amber-500/15 via-slate-900/80 to-blue-500/15 border border-amber-500/30 text-xs shadow-sm">
        <div className="flex items-center gap-2 text-slate-200">
          <span className="p-1.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40">
            <Sparkles className="w-4 h-4" />
          </span>
          <div>
            <span className="font-bold text-amber-300">Nouvelle vue Débriefing Tactique 2D Replay :</span>{' '}
            Silhouette anatomique SVG, combat log chronologique par phase, trajectoire avion C-130 et précision au tir.
          </div>
        </div>
        <Link
          href={`/clans/${clanId}/telemetry/matches/${matchId}/telemetry?period=${period}${
            fromDate ? `&fromDate=${fromDate}` : ''
          }`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold transition-colors shrink-0"
        >
          <span>Voir l'Audit Technique Brut</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* --- Tactical Hero Match Banner --- */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 p-5 md:p-6 shadow-xl">
        {/* Background Map Ambient Glow */}
        {match.mapName && (
          <div className="absolute right-0 top-0 w-1/2 h-full opacity-15 pointer-events-none overflow-hidden blur-sm">
            <Image
              src={mapAssetPath(match.mapName)}
              alt=""
              fill
              className="object-cover object-center"
              unoptimized
            />
          </div>
        )}

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Placement & Match Identity */}
          <div className="flex items-start gap-4">
            <div className="flex flex-col items-center">
              <PlacementBadge placement={match.placement} className="text-base px-3.5 py-1.5 font-bold" />
              <span className="mt-1 text-xs font-mono uppercase tracking-wider text-slate-400 font-semibold">
                {match.placement === 1 ? 'Victoire' : match.placement <= 3 ? 'Podium' : 'Éliminés'}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                  {resolveMapName(match.mapName)}
                </h1>
                <span className="px-2 py-0.5 rounded-md bg-slate-800/90 border border-slate-700 text-xs font-mono text-slate-300">
                  {match.mapName}
                </span>
                <span className="px-2.5 py-0.5 rounded-md bg-blue-950/70 border border-blue-800/70 text-xs font-semibold text-blue-300">
                  {resolveGameMode(match.gameMode)}
                </span>
                <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {formatDateTime(match.createdAt)}
                </span>
              </div>

              {/* Clan members pills */}
              <div className="flex items-center gap-2 flex-wrap mt-1.5">
                {match.members.map((m) => (
                  <div
                    key={m.memberId}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs shadow-sm"
                  >
                    <span className="font-bold text-sm text-emerald-400">{m.displayName}</span>
                    <span className="text-xs text-slate-300 font-mono font-medium ml-0.5">
                      {m.kills}K • {Math.round(m.damage)} dmg
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Squad KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800/80 text-center">
              <div className="text-xs uppercase font-bold tracking-wider text-slate-400 flex items-center justify-center gap-1.5">
                <Skull className="w-3.5 h-3.5 text-rose-400" /> Kills Escouade
              </div>
              <div className="mt-1 text-2xl font-mono font-black text-white">{clanKills}</div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800/80 text-center">
              <div className="text-xs uppercase font-bold tracking-wider text-slate-400 flex items-center justify-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-400" /> Dégâts Totaux
              </div>
              <div className="mt-1 text-2xl font-mono font-black text-amber-300">{clanDamage}</div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800/80 text-center">
              <div className="text-xs uppercase font-bold tracking-wider text-slate-400 flex items-center justify-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-cyan-400" /> Assistances
              </div>
              <div className="mt-1 text-2xl font-mono font-black text-cyan-300">{clanAssists}</div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800/80 text-center">
              <div className="text-xs uppercase font-bold tracking-wider text-slate-400 flex items-center justify-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-emerald-400" /> Réanimations
              </div>
              <div className="mt-1 text-2xl font-mono font-black text-emerald-300">{clanRevives}</div>
            </div>
          </div>
        </div>
      </div>

      {/* --- Primary Navigation Tabs --- */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-1 overflow-x-auto select-none">
        <button
          type="button"
          onClick={() => setActiveTab('combat')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all shrink-0 ${
            activeTab === 'combat'
              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Swords className="w-4 h-4" />
          <span>🎯 Débriefing & Combat Log</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-800 text-xs font-mono font-semibold text-slate-300">
            {timelineEvents.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('map')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all shrink-0 ${
            activeTab === 'map'
              ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <MapPin className="w-4 h-4" />
          <span>🗺️ Carte Tactique 2D</span>
          {flightPath && (
            <span className="px-2 py-0.5 rounded-full bg-blue-950 text-xs font-mono font-semibold text-blue-300 border border-blue-800/60">
              C-130
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('squad')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all shrink-0 ${
            activeTab === 'squad'
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>📊 Escouade & Précision</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('duels')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all shrink-0 ${
            activeTab === 'duels'
              ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <Crosshair className="w-4 h-4" />
          <span>⚔️ Matrice des Duels</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: COMBAT LOG & DEBRIEFING                                             */}
      {/* ========================================================================= */}
      {activeTab === 'combat' && (
        <section className="space-y-4">
          <MatchCombatTimeline
            events={timelineEvents}
            clanTag={clanTag}
            otherTrackedClanTags={otherTrackedClanTags}
          />
        </section>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: 2D TACTICAL MAP                                                    */}
      {/* ========================================================================= */}
      {activeTab === 'map' && (
        <section className="space-y-4">
          {/* Map Controls & Phase Selector Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900/80 border border-slate-800">
            {/* Phase Pills */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-300 mr-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-blue-400" /> Phase :
              </span>
              <button
                type="button"
                onClick={() => setSelectedPhase('all')}
                className={`px-3 py-1 rounded text-xs font-bold transition-all ${
                  selectedPhase === 'all'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Tout le match
              </button>
              {availablePhases.map((phase) => (
                <button
                  key={phase}
                  type="button"
                  onClick={() => setSelectedPhase(phase)}
                  className={`px-2.5 py-1 rounded text-xs font-bold font-mono transition-all ${
                    selectedPhase === phase
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  P{phase}
                </button>
              ))}
            </div>

            {/* Layer Toggles */}
            <div className="flex items-center gap-4 text-xs font-semibold text-slate-200 flex-wrap">
              {flightPath && (
                <label className="flex items-center gap-1.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={showFlightPath}
                    onChange={(e) => setShowFlightPath(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-0"
                  />
                  <span>Avion C-130</span>
                </label>
              )}
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showLandings}
                  onChange={(e) => setShowLandings(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-0"
                />
                <span>Atterrissages</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showTrajectories}
                  onChange={(e) => setShowTrajectories(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-amber-500 focus:ring-0"
                />
                <span>Trajectoires</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showDeaths}
                  onChange={(e) => setShowDeaths(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-800 text-rose-500 focus:ring-0"
                />
                <span>Éliminations</span>
              </label>
            </div>
          </div>

          {/* 2D Satellite Canvas & Interactive SVG */}
          <div className="relative aspect-square max-w-4xl mx-auto overflow-hidden rounded-2xl border-2 border-slate-800 bg-slate-950 shadow-2xl">
            {match.mapName && (
              <Image
                src={mapAssetPath(match.mapName)}
                alt={`Carte ${resolveMapName(match.mapName)}`}
                fill
                className="object-fill brightness-90 contrast-105 select-none pointer-events-none"
                unoptimized
              />
            )}

            {/* Dark Vignette Overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-slate-950/20 pointer-events-none" />

            {/* SVG Tactical Layer */}
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {/* --- 1. SAFE ZONE CIRCLE (White) --- */}
              {activeZoneSnapshot && activeZoneSnapshot.safetyZoneX && activeZoneSnapshot.safetyZoneY && (
                (() => {
                  const center = toMapPercent(
                    match.mapName,
                    activeZoneSnapshot.safetyZoneX,
                    activeZoneSnapshot.safetyZoneY
                  )
                  const bounds = getMapBounds(match.mapName)
                  // Coordinates and radius are natively in centimeters
                  const radiusPercent = (activeZoneSnapshot.safetyZoneRadiusMeters / bounds.width) * 100
                  return (
                    <circle
                      cx={center.x}
                      cy={center.y}
                      r={Math.max(0.5, radiusPercent)}
                      fill="rgba(255, 255, 255, 0.04)"
                      stroke="#ffffff"
                      strokeWidth="0.6"
                      strokeDasharray="1.5, 1"
                      className="filter drop-shadow-[0_0_8px_rgba(255,255,255,0.6)] animate-pulse"
                    />
                  )
                })()
              )}

              {/* --- 2. C-130 FLIGHT PATH VECTOR --- */}
              {showFlightPath && flightPath && (
                (() => {
                  const startPct = toMapPercent(match.mapName, flightPath.start.x, flightPath.start.y)
                  const endPct = toMapPercent(match.mapName, flightPath.end.x, flightPath.end.y)
                  const dropStartPct = (flightPath as any).dropStart
                    ? toMapPercent(match.mapName, (flightPath as any).dropStart.x, (flightPath as any).dropStart.y)
                    : null
                  const dropEndPct = (flightPath as any).dropEnd
                    ? toMapPercent(match.mapName, (flightPath as any).dropEnd.x, (flightPath as any).dropEnd.y)
                    : null

                  return (
                    <g id="tactical-flight-path">
                      {/* Full Traversing Flight Path Line (from map border to map border) */}
                      <line
                        x1={startPct.x}
                        y1={startPct.y}
                        x2={endPct.x}
                        y2={endPct.y}
                        stroke="rgba(59, 130, 246, 0.3)"
                        strokeWidth="1.2"
                      />
                      <line
                        x1={startPct.x}
                        y1={startPct.y}
                        x2={endPct.x}
                        y2={endPct.y}
                        stroke="#3b82f6"
                        strokeWidth="0.5"
                        strokeDasharray="2.5, 1.5"
                        opacity="0.85"
                      />

                      {/* Active Jump Window (Highlighted drop zone between first & last jump) */}
                      {dropStartPct && dropEndPct && (
                        <>
                          <line
                            x1={dropStartPct.x}
                            y1={dropStartPct.y}
                            x2={dropEndPct.x}
                            y2={dropEndPct.y}
                            stroke="#60a5fa"
                            strokeWidth="0.9"
                            strokeDasharray="1.5, 1"
                            className="drop-shadow-[0_0_4px_rgba(96,165,250,0.9)]"
                          />
                          {/* Drop Start Marker (Green) */}
                          <circle
                            cx={dropStartPct.x}
                            cy={dropStartPct.y}
                            r="1.0"
                            fill="#10b981"
                            stroke="#ffffff"
                            strokeWidth="0.3"
                          />
                          {/* Drop End Marker (Amber) */}
                          <circle
                            cx={dropEndPct.x}
                            cy={dropEndPct.y}
                            r="1.0"
                            fill="#f59e0b"
                            stroke="#ffffff"
                            strokeWidth="0.3"
                          />
                        </>
                      )}

                      {/* Airplane Entrance Point Marker */}
                      <circle
                        cx={startPct.x}
                        cy={startPct.y}
                        r="1.3"
                        fill="#3b82f6"
                        stroke="#ffffff"
                        strokeWidth="0.4"
                      />
                      {/* Airplane Exit Point Marker */}
                      <circle
                        cx={endPct.x}
                        cy={endPct.y}
                        r="1.3"
                        fill="#1d4ed8"
                        stroke="#93c5fd"
                        strokeWidth="0.4"
                      />
                    </g>
                  )
                })()
              )}

              {/* --- 3. TRAJECTORY SEGMENTS (Squad movement) --- */}
              {showTrajectories &&
                filteredTrajectorySegments.slice(0, 1500).map((seg, idx) => {
                  const from = toMapPercent(match.mapName, seg.fromX, seg.fromY)
                  const to = toMapPercent(match.mapName, seg.toX, seg.toY)
                  return (
                    <line
                      key={`traj-${idx}`}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke="rgba(245, 158, 11, 0.65)"
                      strokeWidth="0.4"
                      strokeLinecap="round"
                    />
                  )
                })}

              {/* --- 4. LANDING SAMPLES (Parachute Drop Points) --- */}
              {showLandings &&
                landingSamples.map((pt, idx) => {
                  const pos = toMapPercent(match.mapName, pt.x, pt.y)
                  return (
                    <g
                      key={`land-${idx}`}
                      transform={`translate(${pos.x}, ${pos.y})`}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredMapPoint(`Atterrissage: ${pt.memberKey}`)}
                      onMouseLeave={() => setHoveredMapPoint(null)}
                    >
                      <circle r="1" fill="#10b981" stroke="#ffffff" strokeWidth="0.3" />
                    </g>
                  )
                })}

              {/* --- 5. DEATH SAMPLES (Kills / Eliminations) --- */}
              {showDeaths &&
                filteredDeaths.map((d, idx) => {
                  const pos = toMapPercent(match.mapName, d.x, d.y)
                  return (
                    <g
                      key={`death-${idx}`}
                      transform={`translate(${pos.x}, ${pos.y})`}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredMapPoint(`Élimination: ${d.memberKey}`)}
                      onMouseLeave={() => setHoveredMapPoint(null)}
                    >
                      <circle r="1.3" fill="#ef4444" stroke="#ffffff" strokeWidth="0.4" />
                    </g>
                  )
                })}
            </svg>

            {/* Hover Tooltip Overlay on Map */}
            {hoveredMapPoint && (
              <div className="absolute bottom-4 left-4 z-20 px-3.5 py-2 rounded-lg bg-slate-900/95 border border-slate-700 text-xs font-semibold text-white shadow-xl backdrop-blur-md">
                {hoveredMapPoint}
              </div>
            )}

            {/* Flight Path Badge overlay */}
            {flightPath && showFlightPath && (
              <div className="absolute top-4 right-4 z-10 flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-900/90 border border-blue-500/50 text-xs font-mono font-semibold text-blue-200 shadow-xl backdrop-blur-md">
                <Plane
                  className="w-4 h-4 text-blue-400 shrink-0"
                  style={{ transform: `rotate(${flightPath.angleDeg - 45}deg)` }}
                />
                <span>Cap C-130 : {Math.round(((flightPath.angleDeg % 360) + 360) % 360)}°</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: SQUAD MEMBERS & WEAPON ACCURACY                                    */}
      {/* ========================================================================= */}
      {activeTab === 'squad' && (
        <section className="space-y-6">
          {/* Squad Roster Table */}
          <div className="p-4 md:p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
            <h2 className="text-base font-bold text-white mb-3.5 flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              Performances individuelles de l'escouade
            </h2>

            <div className="overflow-x-auto">
              <table className="min-w-full text-xs text-left">
                <thead className="bg-slate-950/90 text-slate-300 uppercase font-mono tracking-wider text-xs font-bold border-b border-slate-800">
                  <tr>
                    <th className="px-3.5 py-3">Membre</th>
                    <th className="px-3.5 py-3 text-center">Kills</th>
                    <th className="px-3.5 py-3 text-right">Dégâts infligés</th>
                    <th className="px-3.5 py-3 text-right">Dégâts subis</th>
                    <th className="px-3.5 py-3 text-center">Précision Globale</th>
                    <th className="px-3.5 py-3 text-right">Pied / Véhicule</th>
                    <th className="px-3.5 py-3 text-center">Utilitaires</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {match.members.map((member) => {
                    const stats = memberStats.find(
                      (s) =>
                        s.memberKey?.toLowerCase().includes(member.displayName.toLowerCase()) ||
                        memberIdentityMap[s.memberKey]?.name === member.displayName
                    )

                    // Calculate accuracy from member weapons if available
                    let shotsTotal = 0
                    let hitsTotal = 0
                    if (stats?.weapons && Array.isArray(stats.weapons)) {
                      for (const w of stats.weapons) {
                        shotsTotal += Number(w.shotsFired) || 0
                        hitsTotal += Number(w.hitsLanded) || 0
                      }
                    }

                    // Fallback to squad weapon stats if member weapons empty
                    const damageTaken = Number(stats?.damageTaken) || 0
                    const onFootDist = Math.round(Number(stats?.onFootDistanceMeters) || 0)
                    const vehicleDist = Math.round(Number(stats?.vehicleDistanceMeters) || 0)

                    // Throwable stats
                    const throwables = throwableStats.find((t) => t.memberId === member.memberId)

                    return (
                      <tr key={member.memberId} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-3.5 py-3.5">
                          <div className="font-bold text-slate-100 text-sm">{member.displayName}</div>
                          <div className="text-xs text-slate-400 font-mono mt-0.5">
                            Assists: {member.assists} • Revives: {member.revives}
                          </div>
                        </td>

                        <td className="px-3.5 py-3.5 text-center">
                          <span className="px-2.5 py-1 rounded bg-emerald-950/70 text-emerald-300 font-bold font-mono text-sm border border-emerald-800/50">
                            {member.kills}
                          </span>
                        </td>

                        <td className="px-3.5 py-3.5 text-right font-mono font-bold text-amber-300 text-sm">
                          {Math.round(member.damage)}
                        </td>

                        <td className="px-3.5 py-3.5 text-right font-mono font-semibold text-rose-400 text-sm">
                          {damageTaken > 0 ? Math.round(damageTaken) : '--'}
                        </td>

                        <td className="px-3.5 py-3.5 text-center">
                          {shotsTotal > 0 ? (
                            <WeaponAccuracyBadge
                              shotsFired={shotsTotal}
                              hitsLanded={hitsTotal}
                              size="sm"
                              showBar={true}
                            />
                          ) : (
                            <span className="text-slate-500 font-mono text-xs">--%</span>
                          )}
                        </td>

                        <td className="px-3.5 py-3.5 text-right font-mono text-slate-200 text-xs">
                          <div>{onFootDist}m (pied)</div>
                          {vehicleDist > 0 && <div className="text-slate-400">{vehicleDist}m (auto)</div>}
                        </td>

                        <td className="px-3.5 py-3.5 text-center">
                          {throwables ? (
                            <div className="flex items-center justify-center gap-2 font-mono text-xs font-medium">
                              {throwables.smokeGrenadeCount > 0 && (
                                <span title="Fumigènes" className="text-slate-200">
                                  💨 {throwables.smokeGrenadeCount}
                                </span>
                              )}
                              {throwables.fragGrenadeCount > 0 && (
                                <span title="Grenades à fragmentation" className="text-rose-400 font-semibold">
                                  💣 {throwables.fragGrenadeCount}
                                </span>
                              )}
                              {throwables.flashBangCount > 0 && (
                                <span title="Flashbangs" className="text-amber-300">
                                  ⚡ {throwables.flashBangCount}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-600 text-xs">--</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Weapon Statistics Grid */}
          <div className="p-4 md:p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
            <h2 className="text-base font-bold text-white mb-3.5 flex items-center gap-2">
              <Crosshair className="w-4 h-4 text-cyan-400" />
              Précision et arsenal de l'escouade
            </h2>

            {weaponStats.length === 0 ? (
              <p className="text-xs text-slate-500">Aucune statistique d'armes disponible.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {weaponStats.slice(0, 9).map((w: any) => {
                  const shots = Number(w.shotsFired) || 0
                  const hits = Number(w.hitsLanded) || 0
                  return (
                    <div
                      key={w.weaponName}
                      className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-100 truncate text-sm">
                          {w.weaponName?.replace(/^Weap/, '')}
                        </div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">
                          {w.kills || 0} kills • {Math.round(w.damageDealt || 0)} dmg
                        </div>
                      </div>

                      {shots > 0 ? (
                        <WeaponAccuracyBadge
                          shotsFired={shots}
                          hitsLanded={hits}
                          size="sm"
                          showBar={true}
                        />
                      ) : (
                        <span className="text-slate-600 text-xs font-mono">--</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: DUELS MATRIX                                                       */}
      {/* ========================================================================= */}
      {activeTab === 'duels' && (
        <section className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Kills landed by Squad */}
            <div className="p-4 md:p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
              <h2 className="text-base font-bold text-emerald-400 mb-3.5 flex items-center gap-2">
                <Trophy className="w-4 h-4" />
                Duels remportés par l'escouade (+{killEvents.filter((k) => k.isClanKill).length})
              </h2>

              <div className="flex flex-col gap-2.5">
                {killEvents.filter((k) => k.isClanKill).length === 0 ? (
                  <p className="text-xs text-slate-500">Aucune élimination enregistrée.</p>
                ) : (
                  killEvents
                    .filter((k) => k.isClanKill)
                    .map((k) => (
                      <div
                        key={k.id}
                        className="p-3 rounded-xl bg-emerald-950/15 border border-emerald-800/40 flex items-center justify-between text-xs gap-3"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-bold text-sm text-emerald-300 truncate">{k.killerName}</span>
                          <span className="text-slate-500 font-mono">➔</span>
                          <span className="text-slate-200 text-sm truncate font-medium">
                            {k.victimClanTag && `[${k.victimClanTag}] `}
                            {k.victimName}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 font-mono text-xs text-slate-400">
                          <span className="px-2.5 py-0.5 rounded bg-slate-900 border border-slate-800 font-semibold text-slate-300">
                            {k.damageCauser?.replace(/^Weap/, '')}
                          </span>
                          {k.distance > 0 && <span className="text-slate-300 font-medium">{Math.round(k.distance)}m</span>}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Right: Casualties suffered by Squad */}
            <div className="p-4 md:p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
              <h2 className="text-base font-bold text-rose-400 mb-3.5 flex items-center gap-2">
                <Skull className="w-4 h-4" />
                Duels perdus par l'escouade (-{killEvents.filter((k) => k.isClanVictim).length})
              </h2>

              <div className="flex flex-col gap-2.5">
                {killEvents.filter((k) => k.isClanVictim).length === 0 ? (
                  <p className="text-xs text-slate-500">Aucun membre éliminé.</p>
                ) : (
                  killEvents
                    .filter((k) => k.isClanVictim)
                    .map((k) => (
                      <div
                        key={k.id}
                        className="p-3 rounded-xl bg-rose-950/15 border border-rose-800/40 flex items-center justify-between text-xs gap-3"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-rose-400 font-bold text-sm truncate">
                            {k.killerClanTag && `[${k.killerClanTag}] `}
                            {k.killerName}
                          </span>
                          <span className="text-slate-500 font-mono">➔</span>
                          <span className="font-semibold text-sm text-slate-200 truncate">{k.victimName}</span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 font-mono text-xs text-slate-400">
                          <span className="px-2.5 py-0.5 rounded bg-slate-900 border border-slate-800 font-semibold text-slate-300">
                            {k.damageCauser?.replace(/^Weap/, '')}
                          </span>
                          {k.distance > 0 && <span className="text-slate-300 font-medium">{Math.round(k.distance)}m</span>}
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>
          </div>

          {/* Squad Anatomical Damage Heatmap Overview */}
          <div className="p-5 md:p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row items-center justify-around gap-8">
            <div className="text-center md:text-left max-w-md">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono font-bold uppercase mb-2.5">
                <Crosshair className="w-3.5 h-3.5" /> Analyse balistique escouade
              </div>
              <h3 className="text-lg font-bold text-white tracking-tight">
                Répartition anatomique des tirs subis
              </h3>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                Visualisez les points d'impact et localisations critiques enregistrés sur les membres de l'escouade lors des affrontements décisifs. Les données de chaque zone sont affichées directement sur l'opérateur.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/90 shadow-xl shrink-0 w-full sm:w-auto min-w-[220px] max-w-[280px]">
              <DamageBodySvg
                damageByZone={squadDamageByZone}
                size="md"
                showLabels={true}
                showTooltips={true}
              />
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
