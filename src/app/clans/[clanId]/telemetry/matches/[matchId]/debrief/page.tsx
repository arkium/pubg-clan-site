'use client'

import React, { useMemo, useRef, useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Crosshair,
  PlayCircle,
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
  Info,
} from 'lucide-react'

import PlacementBadge from '@/components/ui/PlacementBadge'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { mapAssetUrl, resolveGameMode, resolveMapName } from '@/lib/pubg-assets'

import { DamageBodySvg, BodyZoneKey } from '@/components/telemetry/DamageBodySvg'
import { WeaponAccuracyBadge } from '@/components/telemetry/WeaponAccuracyBadge'
import { MatchCombatTimeline, CombatEvent } from '@/components/telemetry/MatchCombatTimeline'
import { MatchReplay2D, type MatchReplayData } from '@/components/telemetry/MatchReplay2D'
import {
  summarizeBodyZones as summarizeBodyZoneTotals,
  type BodyZone,
  type BodyZoneBreakdown,
} from '@/lib/pubg-telemetry/body-zones'
import type { SquadMateStats } from '@/lib/pubg-telemetry/squad-mates'

type SquadMateApi = SquadMateStats & {
  /** Fiche ClanMember dans un autre clan du site : le joueur est suivi, simplement pas par ce clan. */
  trackedClan?: { id: number; tag: string | null; name: string | null } | null
  /** Dernière résolution du clan PUBG (tag potentiellement périmé). */
  pubgClanCheckedAt?: string | null
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' }).format(date)
}

function SquadMateBadge({ mate }: { mate: Pick<SquadMateApi, 'clanTag' | 'trackedClan' | 'pubgClanCheckedAt'> }) {
  const checkedOn = formatShortDate(mate.pubgClanCheckedAt)
  if (mate.trackedClan) {
    return (
      <span
        className="px-1.5 py-0.5 rounded bg-purple-950/70 border border-purple-700/60 text-[10px] font-bold uppercase tracking-wide text-purple-200"
        title={`Coéquipier suivi dans le clan ${mate.trackedClan.name ?? mate.trackedClan.tag ?? ''} du site, qui n'a pas encore synchronisé ce match : statistiques issues de la télémétrie.`}
      >
        {mate.trackedClan.tag ? `[${mate.trackedClan.tag}] ` : ''}suivi
      </span>
    )
  }
  return (
    <span
      className="px-1.5 py-0.5 rounded bg-teal-950/70 border border-teal-800/60 text-[10px] font-bold uppercase tracking-wide text-teal-300"
      title={`Coéquipier sans fiche membre sur le site : statistiques issues de la télémétrie.${
        mate.clanTag
          ? ` Tag [${mate.clanTag}] = clan PUBG${checkedOn ? ` relevé le ${checkedOn}` : ''}, il peut avoir changé depuis.`
          : ''
      }`}
    >
      {mate.clanTag ? `[${mate.clanTag}] ` : ''}non suivi
    </span>
  )
}

function DuelSourceChip() {
  return (
    <span
      className="inline-flex items-center px-1 py-px rounded border border-teal-700/60 bg-teal-950/60 text-[10px] font-bold text-teal-300 align-middle"
      title="Frag retrouvé dans le kill-feed de la télémétrie : le clan du joueur n'avait pas synchronisé ce match."
    >
      télémétrie
    </span>
  )
}

type SquadBodyZonesApi = {
  squadBodyZones?: {
    available: boolean
    dealt: BodyZoneBreakdown[]
    taken: BodyZoneBreakdown[]
  }
}

const SILHOUETTE_ZONES: BodyZone[] = ['head', 'torso', 'pelvis', 'arms', 'legs']

function toZoneRecord(
  breakdown: BodyZoneBreakdown[] | undefined,
  field: 'damage' | 'hits'
): Record<BodyZoneKey, number> {
  const record: Record<BodyZoneKey, number> = { head: 0, torso: 0, pelvis: 0, arms: 0, legs: 0 }
  for (const row of breakdown ?? []) {
    if (!SILHOUETTE_ZONES.includes(row.zone)) continue
    record[row.zone as BodyZoneKey] = row[field]
  }
  return record
}

function summarizeBodyZones(breakdown: BodyZoneBreakdown[] | undefined) {
  return {
    damageByZone: toZoneRecord(breakdown, 'damage'),
    hitsByZone: toZoneRecord(breakdown, 'hits'),
    ...summarizeBodyZoneTotals(breakdown),
  }
}

const BODY_ZONE_VIEW_COPY = {
  dealt: {
    title: 'Tirs infligés',
    subtitle: 'Où l’escouade touche ses adversaires',
    accent: 'text-emerald-400',
    unlocalized: 'dégâts non localisés (explosifs, véhicules…)',
  },
  taken: {
    title: 'Tirs subis',
    subtitle: 'Où l’escouade est touchée',
    accent: 'text-rose-400',
    unlocalized: 'dégâts non localisés (zone bleue, chute, explosion)',
  },
} as const

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
  /** Escouade = clan consulté + coéquipiers. Absent des anciens payloads. */
  isSquadKill?: boolean
  isSquadVictim?: boolean
  source?: 'sync' | 'telemetry'
}

type ThrowableStatApi = {
  memberId: number
  smokeGrenadeCount: number
  fragGrenadeCount: number
  flashBangCount: number
  molotovCount: number
  stunCount: number
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
    }
    killEvents?: KillEventApi[]
    throwableStats?: ThrowableStatApi[]
    /** Coéquipiers hors clan, statistiques issues de la télémétrie (`memberStats`). */
    squadMates?: SquadMateApi[]
    /** Le kill-feed complet est enregistré pour ce match (analysé après le 2026-09-14). */
    killFeedAvailable?: boolean
    weaponLabels?: Record<string, string>
    phaseLabels?: Record<string, string>
    memberIdentityMap?: Record<string, { name: string; clanTag?: string; clanId?: number }>
    opponentIdentityMap?: Record<string, { name: string; clanTag: string | null }>
  }
  error?: {
    message?: string
    code?: string
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
  // Résout les alias (`Erangel_Main` → `Baltic_Main`, libellés affichés) et
  // renvoie `null` plutôt qu'un 404 quand aucun asset n'existe.
  return mapAssetUrl(mapName)
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
  // L'ancienne « Carte Tactique 2D » statique a été fusionnée dans le Replay
  // (calques persistants, cap C-130, accès rapide aux phases).
  const [activeTab, setActiveTab] = useState<'combat' | 'replay' | 'squad' | 'duels'>('combat')

  // Replay 2D — chargé uniquement à l'ouverture de l'onglet (payload dédié).
  const [replayData, setReplayData] = useState<MatchReplayData | null>(null)
  const [replayLoading, setReplayLoading] = useState(false)
  const [replayError, setReplayError] = useState('')
  const [replayRetryToken, setReplayRetryToken] = useState(0)
  const replayRequestIdRef = useRef(0)
  const replayLoadedRef = useRef(false)

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
          // Les liens des listes, du tableau de bord et de Discord mènent ici : un match sans télémétrie
          // parsée doit s'expliquer en français plutôt qu'afficher le message technique de l'API.
          if (data?.error?.code === 'TELEMETRY_NOT_FOUND') {
            throw new Error(
              "La télémétrie de ce match n'est pas disponible : elle n'a pas encore été traitée, ou PUBG ne la conserve plus (environ 14 jours)."
            )
          }
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

  useEffect(() => {
    if (activeTab !== 'replay' || !clanId || !matchId || replayLoadedRef.current) return

    // Garde de fraîcheur plutôt qu'un drapeau d'annulation : sous StrictMode l'effet
    // est joué deux fois, et un nettoyage annulerait la seule requête réellement lancée.
    const requestId = replayRequestIdRef.current + 1
    replayRequestIdRef.current = requestId
    const isCurrent = () => replayRequestIdRef.current === requestId

    async function loadReplay() {
      try {
        setReplayLoading(true)
        setReplayError('')
        const res = await fetch(`/api/clans/${clanId}/matches/${matchId}/replay`)
        const data = (await res.json().catch(() => null)) as
          | { ok?: boolean; data?: MatchReplayData; error?: { message?: string } }
          | null
        if (!res.ok || !data?.ok || !data.data) {
          throw new Error(data?.error?.message ?? `Replay indisponible pour ce match (HTTP ${res.status})`)
        }
        if (isCurrent()) {
          replayLoadedRef.current = true
          setReplayData(data.data)
        }
      } catch (err) {
        if (isCurrent()) {
          setReplayError(err instanceof Error ? err.message : 'Erreur lors du chargement du replay.')
        }
      } finally {
        if (isCurrent()) setReplayLoading(false)
      }
    }

    loadReplay()
  }, [activeTab, clanId, matchId, replayRetryToken])

  const match = payload?.match
  const telemetry = payload?.telemetry
  const killEvents = useMemo(() => payload?.killEvents ?? [], [payload?.killEvents])
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

  // Timeline events provided directly by API, pre-resolved and paired
  const timelineEvents = useMemo<CombatEvent[]>(() => {
    const raw =
      (payload as any)?.combatEvents ||
      (telemetry as any)?.combatEvents ||
      []
    return Array.isArray(raw) ? raw : []
  }, [payload, telemetry])

  // Clan roster and aggregated combat stats
  const clanKills = match?.totalKills ?? 0
  const clanDamage = Math.round(match?.totalDamage ?? 0)
  const clanAssists = match?.totalAssists ?? 0
  const clanRevives = match?.totalRevives ?? 0

  // Coéquipiers hors clan : ni dans SquadMember ni dans les totaux du match.
  const squadMates = useMemo(() => payload?.squadMates ?? [], [payload?.squadMates])
  const mateTotals = useMemo(
    () =>
      squadMates.reduce(
        (totals, mate) => ({
          kills: totals.kills + mate.kills,
          damage: totals.damage + mate.damage,
          revives: totals.revives + mate.revives,
        }),
        { kills: 0, damage: 0, revives: 0 }
      ),
    [squadMates]
  )

  const killFeedAvailable = payload?.killFeedAvailable === true
  const squadKills = useMemo(
    () => killEvents.filter((kill) => kill.isSquadKill ?? kill.isClanKill),
    [killEvents]
  )
  const squadDeaths = useMemo(
    () => killEvents.filter((kill) => kill.isSquadVictim ?? kill.isClanVictim),
    [killEvents]
  )
  // Kills de l'escouade selon les statistiques du match (API pour le clan, télémétrie pour les
  // coéquipiers) qui n'ont pas de frag détaillé : typiquement un clan non synchronisé.
  const unlistedSquadKills = Math.max(0, clanKills + mateTotals.kills - squadKills.length)

  const squadRows = useMemo(
    () => [
      ...(match?.members ?? []).map((member) => ({
        rowKey: `member-${member.memberId}`,
        memberId: member.memberId as number | null,
        accountId: null as string | null,
        displayName: member.displayName,
        clanTag: null as string | null,
        trackedClan: null as SquadMateApi['trackedClan'],
        pubgClanCheckedAt: null as string | null,
        isMate: false,
        kills: member.kills,
        damage: member.damage,
        assists: member.assists as number | null,
        revives: member.revives,
        recalls: 0,
      })),
      ...squadMates.map((mate) => ({
        rowKey: `mate-${mate.accountId}`,
        memberId: null,
        accountId: mate.accountId.toLowerCase(),
        displayName: mate.name,
        clanTag: mate.clanTag,
        trackedClan: mate.trackedClan ?? null,
        pubgClanCheckedAt: mate.pubgClanCheckedAt ?? null,
        isMate: true,
        kills: mate.kills,
        damage: mate.damage,
        // La télémétrie ne compte pas les assistances.
        assists: null,
        revives: mate.revives,
        recalls: mate.recalls,
      })),
    ],
    [match?.members, squadMates]
  )

  // Impacts anatomiques réels de l'escouade, agrégés côté API depuis
  // LogPlayerTakeDamage.damageReason. Absent des matchs parsés avant 2026-09-13.
  const squadBodyZones = (telemetry as SquadBodyZonesApi | undefined)?.squadBodyZones ?? null
  const squadBodyZonesAvailable = squadBodyZones?.available === true

  // Deux lectures du même match : où l'escouade touche ses adversaires, et où elle est touchée.
  const bodyZoneViews = useMemo(
    () =>
      (['dealt', 'taken'] as const).map((direction) => ({
        direction,
        ...summarizeBodyZones(squadBodyZones?.[direction]),
      })),
    [squadBodyZones]
  )

  if (loading) {
    return (
      <main className="app-container app-main space-y-4">
        <NavigationTrail
          currentLabel="Débriefing Tactique"
          currentHref={`/clans/${clanId}/telemetry/matches/${matchId}/debrief`}
          fallbackParent={{
            href: `/clans/${clanId}/matches`,
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
            href: `/clans/${clanId}/matches`,
            label: 'Matchs',
            altHref: '/clans',
          }}
        />
        <div className="p-6 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300">
          <p className="font-semibold">{error || 'Match introuvable.'}</p>
          <Link
            href={`/clans/${clanId}/matches`}
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
          href: `/clans/${clanId}/matches`,
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
        {mapAssetPath(match.mapName) && (
          <div className="absolute right-0 top-0 w-1/2 h-full opacity-15 pointer-events-none overflow-hidden blur-sm">
            <Image
              src={mapAssetPath(match.mapName) as string}
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

              {/* Escouade : membres suivis puis coéquipiers hors clan */}
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
                {squadMates.map((mate) => (
                  <div
                    key={mate.accountId}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-dashed border-teal-700/70 text-xs shadow-sm"
                    title={`${mate.name} — coéquipier ${mate.trackedClan ? `suivi dans [${mate.trackedClan.tag ?? '?'}]` : 'non suivi'} · ${mate.knockouts} knock(s), ${mate.revives} réanimation(s), ${mate.recalls} rappel(s) déclenché(s), ${mate.deaths} mort(s). Statistiques issues de la télémétrie.`}
                  >
                    <span className="font-bold text-sm text-teal-300">{mate.name}</span>
                    <SquadMateBadge mate={mate} />
                    <span className="text-xs text-slate-300 font-mono font-medium ml-0.5">
                      {mate.kills}K • {mate.damage} dmg
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Quick Squad KPI Strip — toute l'escouade, coéquipiers hors clan compris */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 shrink-0">
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800/80 text-center">
              <div className="text-xs uppercase font-bold tracking-wider text-slate-400 flex items-center justify-center gap-1.5">
                <Skull className="w-3.5 h-3.5 text-rose-400" /> Kills Escouade
              </div>
              <div className="mt-1 text-2xl font-mono font-black text-white">{clanKills + mateTotals.kills}</div>
              {squadMates.length > 0 && (
                <div className="mt-0.5 text-xs font-mono text-slate-400">dont coéquipiers : {mateTotals.kills}</div>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800/80 text-center">
              <div className="text-xs uppercase font-bold tracking-wider text-slate-400 flex items-center justify-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-400" /> Dégâts Totaux
              </div>
              <div className="mt-1 text-2xl font-mono font-black text-amber-300">{clanDamage + mateTotals.damage}</div>
              {squadMates.length > 0 && (
                <div className="mt-0.5 text-xs font-mono text-slate-400">dont coéquipiers : {mateTotals.damage}</div>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800/80 text-center">
              <div className="text-xs uppercase font-bold tracking-wider text-slate-400 flex items-center justify-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-cyan-400" /> Assistances
              </div>
              <div className="mt-1 text-2xl font-mono font-black text-cyan-300">{clanAssists}</div>
              {squadMates.length > 0 && (
                <div
                  className="mt-0.5 text-xs font-mono text-slate-400"
                  title="La télémétrie ne compte pas les assistances : seules celles des membres suivis sont connues."
                >
                  membres suivis
                </div>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800/80 text-center">
              <div className="text-xs uppercase font-bold tracking-wider text-slate-400 flex items-center justify-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-emerald-400" /> Réanimations
              </div>
              <div className="mt-1 text-2xl font-mono font-black text-emerald-300">{clanRevives + mateTotals.revives}</div>
              {squadMates.length > 0 && (
                <div className="mt-0.5 text-xs font-mono text-slate-400">dont coéquipiers : {mateTotals.revives}</div>
              )}
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
          onClick={() => setActiveTab('replay')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all shrink-0 ${
            activeTab === 'replay'
              ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
          }`}
        >
          <PlayCircle className="w-4 h-4" />
          <span>🎮 Replay 2D</span>
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
      {/* TAB 2: ANIMATED 2D REPLAY                                                 */}
      {/* ========================================================================= */}
      {activeTab === 'replay' && (
        <section className="space-y-4">
          {replayLoading && <CardSkeleton className="h-96" />}

          {replayError && !replayLoading && (
            <div className="p-6 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-sm font-semibold space-y-3">
              <p>{replayError}</p>
              <button
                type="button"
                onClick={() => {
                  replayLoadedRef.current = false
                  setReplayError('')
                  setReplayRetryToken((token) => token + 1)
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-900/60 border border-rose-700 text-xs font-bold text-rose-100 hover:bg-rose-900 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Réessayer
              </button>
            </div>
          )}

          {!replayLoading && !replayError && !replayData && (
            <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800 text-slate-300 text-sm font-semibold">
              Aucune donnée de replay renvoyée pour ce match.
            </div>
          )}

          {replayData && !replayLoading && <MatchReplay2D data={replayData} />}
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
                  {squadRows.map((member) => {
                    const stats =
                      member.accountId !== null
                        ? memberStats.find((s) => s.memberKey?.toLowerCase() === member.accountId)
                        : memberStats.find(
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
                    const throwables =
                      member.memberId !== null
                        ? throwableStats.find((t) => t.memberId === member.memberId)
                        : undefined

                    return (
                      <tr key={member.rowKey} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-3.5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className={`font-bold text-sm ${member.isMate ? 'text-teal-300' : 'text-slate-100'}`}>
                              {member.displayName}
                            </span>
                            {member.isMate && <SquadMateBadge mate={member} />}
                          </div>
                          <div className="text-xs text-slate-400 font-mono mt-0.5">
                            {member.assists !== null ? `Assists: ${member.assists} • ` : ''}Revives: {member.revives}
                            {member.recalls > 0 ? ` • Rappels: ${member.recalls}` : ''}
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
          {/* Légende : d'où viennent les duels */}
          <div className="flex items-start gap-2.5 px-4 py-3 rounded-2xl bg-slate-900/40 border border-slate-800 text-xs text-slate-300 leading-relaxed">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
            <div className="space-y-1.5">
              <p>
                <span className="font-bold text-white">Comment les duels sont établis.</span> Un duel est un frag
                (élimination confirmée) où le tueur ou la victime appartient à l&apos;escouade : membres{' '}
                <span className="font-semibold text-emerald-400">[{clanTag}]</span> et coéquipiers de la même équipe{' '}
                <span className="font-semibold text-teal-300">(turquoise)</span>. Les mises à terre ne comptent pas :
                elles figurent dans le Combat Log.
              </p>
              <p>
                Sources : les frags enregistrés lors de la synchronisation des clans suivis, puis le kill-feed complet
                de la télémétrie pour les autres (marqués <DuelSourceChip />).
                {killFeedAvailable
                  ? ''
                  : " Ce match a été analysé avant l'enregistrement du kill-feed complet : seuls les frags des clans ayant synchronisé le match apparaissent."}
              </p>
              {unlistedSquadKills > 0 && (
                <p className="text-amber-300/90">
                  {unlistedSquadKills} kill{unlistedSquadKills > 1 ? 's' : ''} de l&apos;escouade selon les statistiques du
                  match {unlistedSquadKills > 1 ? 'ne sont pas détaillés' : "n'est pas détaillé"} ici
                  {killFeedAvailable
                    ? ' (écart entre statistiques et kill-feed, par exemple un frag par zone ou véhicule).'
                    : ' — relancez « Resync ce match » depuis l’Audit Technique Brut pour les obtenir (matchs de moins de 14 jours).'}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Kills landed by Squad */}
            <div className="p-4 md:p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
              <h2 className="text-base font-bold text-emerald-400 mb-3.5 flex items-center gap-2">
                <Trophy className="w-4 h-4" />
                Duels remportés par l&apos;escouade (+{squadKills.length})
              </h2>

              <div className="flex flex-col gap-2.5">
                {squadKills.length === 0 ? (
                  <p className="text-xs text-slate-500">Aucune élimination enregistrée.</p>
                ) : (
                  squadKills.map((k) => (
                    <div
                      key={k.id}
                      className="p-3 rounded-xl bg-emerald-950/15 border border-emerald-800/40 flex items-center justify-between text-xs gap-3"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`font-bold text-sm truncate ${k.isClanKill ? 'text-emerald-300' : 'text-teal-300'}`}>
                          {k.killerName}
                        </span>
                        <span className="text-slate-500 font-mono">➔</span>
                        <span className="text-slate-200 text-sm truncate font-medium">
                          {k.victimClanTag && `[${k.victimClanTag}] `}
                          {k.victimName}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 font-mono text-xs text-slate-400">
                        {k.source === 'telemetry' && <DuelSourceChip />}
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
                Duels perdus par l&apos;escouade (-{squadDeaths.length})
              </h2>

              <div className="flex flex-col gap-2.5">
                {squadDeaths.length === 0 ? (
                  <p className="text-xs text-slate-500">Aucun membre éliminé.</p>
                ) : (
                  squadDeaths.map((k) => (
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
                        <span className={`font-semibold text-sm truncate ${k.isClanVictim ? 'text-slate-200' : 'text-teal-300'}`}>
                          {k.victimName}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 font-mono text-xs text-slate-400">
                        {k.source === 'telemetry' && <DuelSourceChip />}
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

          {/* Répartition anatomique : infligés en regard des subis */}
          <div className="p-5 md:p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-5">
            <div className="text-center md:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono font-bold uppercase mb-2.5">
                <Crosshair className="w-3.5 h-3.5" /> Analyse balistique escouade
              </div>
              <h3 className="text-lg font-bold text-white tracking-tight">
                Répartition anatomique des impacts
              </h3>
              {squadBodyZonesAvailable ? (
                <p className="text-xs text-slate-300 mt-2 leading-relaxed max-w-3xl">
                  Localisations réellement enregistrées par la télémétrie (
                  <span className="font-mono text-slate-200">LogPlayerTakeDamage</span>) : à gauche
                  les touches portées par l&apos;escouade, à droite celles qu&apos;elle a reçues. Les
                  dégâts qu&apos;un membre s&apos;inflige lui-même ne comptent pas comme infligés.
                </p>
              ) : (
                <p className="text-xs text-amber-300/90 mt-2 leading-relaxed max-w-3xl">
                  Ce match a été analysé avant la capture des zones d&apos;impact. Aucune
                  répartition n&apos;est inventée ici — relancez une synchronisation télémétrie pour
                  l&apos;obtenir (possible uniquement sur les matchs de moins de 14 jours).
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {bodyZoneViews.map((view) => {
                const copy = BODY_ZONE_VIEW_COPY[view.direction]
                return (
                  <div
                    key={view.direction}
                    className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-slate-950/80 border border-slate-800/90 shadow-xl"
                  >
                    <div className="w-full text-center">
                      <div className={`text-sm font-bold ${copy.accent}`}>{copy.title}</div>
                      <div className="text-xs text-slate-400">{copy.subtitle}</div>
                      {squadBodyZonesAvailable && view.localizedHits > 0 && (
                        <div className="mt-1.5 text-xs font-mono text-slate-300">
                          {view.localizedHits} touche{view.localizedHits > 1 ? 's' : ''} ·{' '}
                          {Math.round(view.localizedDamage)} dmg
                          {view.headHitRate !== null && ` · ${view.headHitRate} % à la tête`}
                        </div>
                      )}
                    </div>

                    <div className="w-full max-w-[280px]">
                      <DamageBodySvg
                        damageByZone={view.damageByZone}
                        hitsByZone={view.hitsByZone}
                        size="md"
                        variant={view.direction === 'dealt' ? 'dealt' : 'received'}
                        showLabels={true}
                        showTooltips={true}
                        unavailable={!squadBodyZonesAvailable}
                        unavailableLabel="Zones d'impact non capturées pour ce match"
                      />
                    </div>

                    {squadBodyZonesAvailable && view.localizedHits === 0 && (
                      <p className="text-xs text-slate-500 text-center">Aucune touche localisée.</p>
                    )}
                    {squadBodyZonesAvailable && view.unlocalizedDamage > 0 && (
                      <p className="text-xs text-slate-500 font-mono text-center">
                        + {Math.round(view.unlocalizedDamage)} {copy.unlocalized}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
