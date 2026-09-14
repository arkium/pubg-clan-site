'use client'

import React, { useMemo, useState } from 'react'
import {
  Crosshair,
  Skull,
  ShieldAlert,
  HeartHandshake,
  ChevronDown,
  ChevronUp,
  Filter,
  Flame,
  Shield,
  Clock,
  Swords,
  Users,
  Plane,
  Info,
} from 'lucide-react'
import { DamageBodySvg, BodyZoneKey } from './DamageBodySvg'
import { resolveBodyZone } from '@/lib/pubg-telemetry/body-zones'

export type CombatAffiliation = 'current_clan' | 'tracked_clan' | 'external'

export type CombatEvent = {
  id: string
  /** `recall` : retour en jeu par l'avion de rappel (pas de cible). */
  type: 'kill' | 'knock' | 'revive' | 'recall'
  timestamp: number // seconds from match start
  phaseNumber: number
  actorName: string
  actorClanTag?: string | null
  actorAffiliation?: CombatAffiliation
  targetName: string
  targetClanTag?: string | null
  targetAffiliation?: CombatAffiliation
  weaponName?: string
  damageReason?: string
  distanceMeters?: number
  isClanActor?: boolean
  isClanTarget?: boolean
  isTrackedClanActor?: boolean
  isTrackedClanTarget?: boolean
  /** Escouade = membres du clan consulté + coéquipiers de la même équipe, suivis ou non. */
  isSquadActor?: boolean
  isSquadTarget?: boolean
  /** Kills : `sync` = KillEvent enregistré à la synchronisation, `telemetry` = retrouvé dans le kill-feed. */
  source?: 'sync' | 'telemetry'
  // Optional detailed hit map if available
  damageByZone?: Partial<Record<BodyZoneKey, number>>
  totalDamage?: number
}

export interface MatchCombatTimelineProps {
  events: CombatEvent[]
  clanTag?: string
  clanName?: string
  otherTrackedClanTags?: string[]
  className?: string
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}m${String(s).padStart(2, '0')}s`
}

function getWeaponDisplayName(rawWeapon: string | undefined): string {
  if (!rawWeapon) return 'Inconnu'
  return rawWeapon
    .replace(/^Weap/, '')
    .replace(/_C$/, '')
    .replace(/^Proj/, '')
    .replace(/_Item_C$/, '')
}

/**
 * Localisation réelle de l'impact fatal. La télémétrie ne persiste pas la zone
 * événement par événement : seul un headshot est une information certaine.
 * Renvoie `null` quand la zone est inconnue, pour afficher un état explicite
 * plutôt qu'une répartition inventée.
 */
function resolveEventHitZones(
  damageReason?: string
): Partial<Record<BodyZoneKey, number>> | null {
  if (!damageReason) return null
  const zone = resolveBodyZone(damageReason)
  return zone === 'other' ? null : { [zone]: 100 }
}

function TelemetrySourceChip() {
  return (
    <span
      className="inline-flex items-center px-1 py-px rounded border border-teal-700/60 bg-teal-950/60 text-[10px] font-bold text-teal-300 align-middle"
      title="Frag retrouvé dans le kill-feed de la télémétrie : le clan du joueur n'avait pas encore synchronisé ce match."
    >
      télémétrie
    </span>
  )
}

function SquadMateName({ name, clanTag, tracked }: { name: string; clanTag?: string | null; tracked: boolean }) {
  return (
    <>
      <span
        className="px-1.5 py-0.5 rounded border border-teal-600/60 bg-teal-950/80 text-xs font-mono text-teal-200 font-bold"
        title={tracked ? 'Coéquipier de l’escouade, suivi dans un autre clan du site' : 'Coéquipier de l’escouade, non suivi sur le site'}
      >
        {clanTag ? `[${clanTag}] ` : ''}
        {tracked ? 'SUIVI' : 'ÉQUIPIER'}
      </span>
      <span className="font-bold text-sm text-teal-300 truncate max-w-[140px] sm:max-w-[180px]">{name}</span>
    </>
  )
}

const isClanActor = (ev: CombatEvent) => Boolean(ev.isClanActor || ev.actorAffiliation === 'current_clan')
const isClanTarget = (ev: CombatEvent) => Boolean(ev.isClanTarget || ev.targetAffiliation === 'current_clan')
// Les anciens payloads n'ont pas les drapeaux d'escouade : on retombe alors sur le clan.
const isSquadActor = (ev: CombatEvent) => Boolean(ev.isSquadActor ?? isClanActor(ev))
const isSquadTarget = (ev: CombatEvent) => Boolean(ev.isSquadTarget ?? isClanTarget(ev))

const ZONE_DISPLAY_LABELS: Record<BodyZoneKey, string> = {
  head: 'Tête',
  torso: 'Torse',
  pelvis: 'Bassin',
  arms: 'Bras',
  legs: 'Jambes',
}

export function MatchCombatTimeline({
  events,
  clanTag,
  clanName,
  otherTrackedClanTags = [],
  className = '',
}: MatchCombatTimelineProps) {
  const [filterMode, setFilterMode] = useState<'clan' | 'tracked' | 'all'>('clan')
  const [typeFilter, setTypeFilter] = useState<'all' | 'kill' | 'knock' | 'revive' | 'recall'>('all')
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null)

  const hasOtherTracked = otherTrackedClanTags.length > 0

  // Filter events
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      // Clan filter
      if (filterMode === 'clan') {
        // « Escouade » : membres du clan ET coéquipiers de la même équipe.
        if (!isSquadActor(ev) && !isSquadTarget(ev)) return false
      } else if (filterMode === 'tracked') {
        const involvesTracked =
          isSquadActor(ev) ||
          isSquadTarget(ev) ||
          ev.isTrackedClanActor ||
          ev.isTrackedClanTarget ||
          ev.actorAffiliation === 'current_clan' ||
          ev.targetAffiliation === 'current_clan' ||
          ev.actorAffiliation === 'tracked_clan' ||
          ev.targetAffiliation === 'tracked_clan'
        if (!involvesTracked) return false
      }
      // Type filter
      if (typeFilter !== 'all' && ev.type !== typeFilter) {
        return false
      }
      return true
    })
  }, [events, filterMode, typeFilter])

  // Group events by Phase
  const groupedByPhase = useMemo(() => {
    const map = new Map<number, CombatEvent[]>()
    for (const ev of filteredEvents) {
      const phase = ev.phaseNumber || 1
      if (!map.has(phase)) {
        map.set(phase, [])
      }
      map.get(phase)!.push(ev)
    }
    // Sort phases ascending
    return Array.from(map.entries()).sort(([a], [b]) => a - b)
  }, [filteredEvents])

  const totalClanKills = events.filter((e) => e.type === 'kill' && isSquadActor(e)).length
  const totalClanKnocks = events.filter((e) => e.type === 'knock' && isSquadActor(e)).length
  const totalClanDeaths = events.filter((e) => e.type === 'kill' && isSquadTarget(e)).length
  const totalSquadRecalls = events.filter((e) => e.type === 'recall' && isSquadActor(e)).length
  const telemetryKills = events.filter((e) => e.type === 'kill' && e.source === 'telemetry').length

  const totalTrackedKills = events.filter(
    (e) => e.type === 'kill' && (e.isTrackedClanActor || e.actorAffiliation === 'tracked_clan')
  ).length

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      {/* --- Filter & Summary Header Bar --- */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-900/70 border border-slate-800">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/90 border border-slate-700/70 text-sm text-slate-200">
            <Swords className="w-4 h-4 text-amber-400" />
            <span className="font-extrabold text-white text-base">{events.length}</span> événements
          </div>
          <div className="hidden sm:flex items-center gap-2.5 text-xs sm:text-sm font-semibold">
            <span className="text-emerald-400 font-mono">+{totalClanKills} kills escouade</span>
            <span className="text-slate-600">•</span>
            <span className="text-amber-400 font-mono">+{totalClanKnocks} knocks</span>
            <span className="text-slate-600">•</span>
            <span className="text-rose-400 font-mono">-{totalClanDeaths} morts</span>
            {totalSquadRecalls > 0 && (
              <>
                <span className="text-slate-600">•</span>
                <span className="text-sky-300 font-mono">{totalSquadRecalls} rappel{totalSquadRecalls > 1 ? 's' : ''}</span>
              </>
            )}
            {hasOtherTracked && totalTrackedKills > 0 && (
              <>
                <span className="text-slate-600">•</span>
                <span className="text-purple-300 font-mono">+{totalTrackedKills} kills [{otherTrackedClanTags.join(', ')}]</span>
              </>
            )}
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Clan vs Tracked vs All Switch */}
          <div className="inline-flex rounded-lg p-0.5 bg-slate-950 border border-slate-800 text-xs sm:text-sm">
            <button
              type="button"
              onClick={() => setFilterMode('clan')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                filterMode === 'clan'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Escouade {clanTag ? `[${clanTag}]` : 'Clan'}
            </button>

            {hasOtherTracked && (
              <button
                type="button"
                onClick={() => setFilterMode('tracked')}
                className={`px-3 py-1.5 rounded-md font-semibold transition-all flex items-center gap-1.5 ${
                  filterMode === 'tracked'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={`Inclut les clans suivis sur le site : ${[clanTag, ...otherTrackedClanTags].filter(Boolean).join(', ')}`}
              >
                <span>Clans Suivis</span>
                <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-purple-950 border border-purple-800/60 text-purple-300">
                  {clanTag ? `[${clanTag} + ${otherTrackedClanTags.join(', ')}]` : otherTrackedClanTags.join(', ')}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-all ${
                filterMode === 'all'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tout le match ({events.length})
            </button>
          </div>

          {/* Type pills */}
          <div className="inline-flex rounded-lg p-0.5 bg-slate-950 border border-slate-800 text-xs sm:text-sm">
            {(['all', 'kill', 'knock', 'revive', 'recall'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(t)}
                className={`px-2.5 py-1.5 rounded-md capitalize transition-all ${
                  typeFilter === t
                    ? 'bg-slate-700 text-white font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t === 'all' ? 'Tous' : t === 'kill' ? 'Kills' : t === 'knock' ? 'Knocks' : t === 'revive' ? 'Revives' : 'Rappels'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* --- Légende : qui compte dans l'escouade, d'où viennent les kills --- */}
      <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-xl bg-slate-900/40 border border-slate-800 text-xs text-slate-400 leading-relaxed">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
        <p>
          <span className="font-semibold text-slate-300">Escouade</span> : membres{' '}
          <span className="text-emerald-400 font-semibold">{clanTag ? `[${clanTag}]` : 'du clan'}</span> et coéquipiers de
          la même équipe, <span className="text-teal-300 font-semibold">suivis ailleurs ou non</span>. Knocks, réanimations
          et rappels couvrent tout le lobby. Les kills viennent des frags enregistrés à la synchronisation du clan,
          complétés par le kill-feed de la télémétrie
          {telemetryKills > 0 ? (
            <> ({telemetryKills} frag{telemetryKills > 1 ? 's' : ''} marqué{telemetryKills > 1 ? 's' : ''} <TelemetrySourceChip />)</>
          ) : null}
          .
        </p>
      </div>

      {/* --- Events Timeline --- */}
      {groupedByPhase.length === 0 ? (
        <div className="p-8 text-center rounded-xl bg-slate-900/30 border border-dashed border-slate-800 text-slate-400 text-sm">
          <Filter className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p>Aucun événement ne correspond aux filtres sélectionnés.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6 relative">
          {groupedByPhase.map(([phase, phaseEvents]) => (
            <div key={phase} className="flex flex-col gap-2.5">
              {/* Phase Marker */}
              <div className="sticky top-2 z-10 flex items-center gap-2.5 py-1">
                <span className="px-3 py-1 rounded-full text-xs font-black tracking-wider uppercase bg-blue-950/90 border border-blue-700/80 text-blue-200 shadow-md backdrop-blur-md">
                  Phase {phase}
                </span>
                <div className="h-[1px] flex-1 bg-gradient-to-r from-blue-700/50 via-slate-800 to-transparent" />
              </div>

              {/* Event Cards in Phase */}
              <div className="flex flex-col gap-2 pl-2 border-l-2 border-slate-800/80 ml-3">
                {phaseEvents.map((ev) => {
                  const isExpanded = expandedEventId === ev.id
                  const isKill = ev.type === 'kill'
                  const isKnock = ev.type === 'knock'
                  const isRevive = ev.type === 'revive'
                  const isRecall = ev.type === 'recall'
                  const isHeadshot = ev.damageReason?.toLowerCase().includes('head')

                  const isActorCurrent = isClanActor(ev)
                  // Coéquipier de l'escouade hors clan consulté (qu'il soit suivi ailleurs ou non).
                  const isActorMate = !isActorCurrent && isSquadActor(ev)
                  const isActorTracked =
                    !isActorMate && Boolean(ev.isTrackedClanActor || ev.actorAffiliation === 'tracked_clan')

                  const isTargetCurrent = isClanTarget(ev)
                  const isTargetMate = !isTargetCurrent && isSquadTarget(ev)
                  const isTargetTracked =
                    !isTargetMate && Boolean(ev.isTrackedClanTarget || ev.targetAffiliation === 'tracked_clan')

                  // Highlight card borders based on affiliation
                  let cardBorder = 'border-slate-800/80 hover:border-slate-700'
                  const cardBg = 'bg-slate-900/40 hover:bg-slate-900/70'

                  if (isSquadActor(ev) && isKill) {
                    cardBorder = 'border-emerald-500/40 bg-emerald-950/20 hover:border-emerald-500/60'
                  } else if (isSquadTarget(ev) && isKill) {
                    cardBorder = 'border-rose-500/40 bg-rose-950/20 hover:border-rose-500/60'
                  } else if (isSquadActor(ev) && isKnock) {
                    cardBorder = 'border-amber-500/30 bg-amber-950/15 hover:border-amber-500/50'
                  } else if (isRecall && isSquadActor(ev)) {
                    cardBorder = 'border-sky-500/40 bg-sky-950/20 hover:border-sky-500/60'
                  } else if (isActorTracked || isTargetTracked) {
                    cardBorder = 'border-purple-500/40 bg-purple-950/15 hover:border-purple-500/55'
                  }

                  const hitZones = ev.damageByZone ?? resolveEventHitZones(ev.damageReason)
                  const hitZonesUnavailable = !hitZones || Object.keys(hitZones).length === 0

                  return (
                    <div
                      key={ev.id}
                      className={`rounded-xl border transition-all overflow-hidden ${cardBorder} ${cardBg}`}
                    >
                      {/* Main Compact Row */}
                      <div
                        onClick={() => {
                          if (!isRecall) setExpandedEventId(isExpanded ? null : ev.id)
                        }}
                        className={`flex items-center justify-between p-3 select-none gap-3 ${isRecall ? '' : 'cursor-pointer'}`}
                      >
                        {/* Left: Time & Icon Badge */}
                        <div className="flex items-center gap-2 min-w-[85px] shrink-0 font-mono text-slate-300 text-xs">
                          <Clock className="w-3.5 h-3.5 opacity-70" />
                          <span className="font-semibold">{formatTime(ev.timestamp)}</span>
                          {isKill && (
                            <span className="p-1 rounded bg-rose-950 text-rose-300 border border-rose-800/60">
                              <Skull className="w-3.5 h-3.5" />
                            </span>
                          )}
                          {isKnock && (
                            <span className="p-1 rounded bg-amber-950 text-amber-300 border border-amber-800/60">
                              <ShieldAlert className="w-3.5 h-3.5" />
                            </span>
                          )}
                          {isRevive && (
                            <span className="p-1 rounded bg-blue-950 text-blue-200 border border-blue-800/60">
                              <HeartHandshake className="w-3.5 h-3.5" />
                            </span>
                          )}
                          {isRecall && (
                            <span className="p-1 rounded bg-sky-950 text-sky-200 border border-sky-800/60">
                              <Plane className="w-3.5 h-3.5" />
                            </span>
                          )}
                        </div>

                        {/* Center: Action / Duel Players */}
                        <div className="flex items-center gap-2.5 flex-1 min-w-0 overflow-hidden text-ellipsis">
                          {/* Actor */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isActorCurrent ? (
                              <>
                                {ev.actorClanTag && (
                                  <span className="text-xs text-emerald-400 font-mono font-bold">
                                    [{ev.actorClanTag}]
                                  </span>
                                )}
                                <span className="font-bold text-sm text-emerald-300 truncate max-w-[140px] sm:max-w-[180px]">
                                  {ev.actorName}
                                </span>
                              </>
                            ) : isActorMate ? (
                              <SquadMateName name={ev.actorName} clanTag={ev.actorClanTag} tracked={ev.actorAffiliation === 'tracked_clan'} />
                            ) : isActorTracked ? (
                              <>
                                <span
                                  className="px-1.5 py-0.5 rounded border border-purple-500/60 bg-purple-950/90 text-xs font-mono text-purple-200 font-bold flex items-center gap-1"
                                  title="Autre clan suivi sur le site"
                                >
                                  [{ev.actorClanTag || 'Suivi'}]
                                  <span className="text-[10px] bg-purple-800/80 text-purple-100 px-1 py-0.2 rounded font-sans font-bold">
                                    SUIVI
                                  </span>
                                </span>
                                <span className="font-bold text-sm text-purple-200 truncate max-w-[140px] sm:max-w-[180px]">
                                  {ev.actorName}
                                </span>
                              </>
                            ) : (
                              <>
                                {ev.actorClanTag && (
                                  <span className="text-xs text-slate-400 font-mono font-medium">[{ev.actorClanTag}]</span>
                                )}
                                <span className="text-sm text-slate-200 font-medium truncate max-w-[140px] sm:max-w-[180px]">
                                  {ev.actorName}
                                </span>
                              </>
                            )}
                          </div>

                          {/* Weapon & Distance pill or Revive pill */}
                          {isRecall ? (
                            <div className="flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-md bg-sky-950/80 border border-sky-800/70 text-xs font-mono font-semibold text-sky-200">
                              <span>Revient en jeu par rappel</span>
                            </div>
                          ) : isRevive ? (
                            <div className="flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-md bg-blue-950/80 border border-blue-800/70 text-xs font-mono font-semibold text-blue-200">
                              <span>Réanimation</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-md bg-slate-950/80 border border-slate-800 text-xs font-mono text-slate-200">
                              <span className="font-semibold">{getWeaponDisplayName(ev.weaponName)}</span>
                              {isHeadshot && (
                                <span
                                  className="text-amber-400 font-bold ml-0.5"
                                  title="Coup critique à la tête"
                                >
                                  🎯 Headshot
                                </span>
                              )}
                              {ev.distanceMeters !== undefined && ev.distanceMeters > 0 && (
                                <span className="text-slate-400 ml-1">
                                  {Math.round(ev.distanceMeters)}m
                                </span>
                              )}
                              {isKill && ev.source === 'telemetry' && <TelemetrySourceChip />}
                            </div>
                          )}

                          {!isRecall && <span className="text-slate-500 font-bold shrink-0">➔</span>}

                          {/* Target */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isRecall ? null : isTargetCurrent ? (
                              <>
                                {ev.targetClanTag && (
                                  <span className="text-xs font-mono font-bold text-rose-400">
                                    [{ev.targetClanTag}]
                                  </span>
                                )}
                                <span
                                  className={`text-sm truncate max-w-[140px] sm:max-w-[180px] ${
                                    isRevive ? 'text-blue-300 font-bold' : 'text-rose-400 font-bold'
                                  }`}
                                >
                                  {ev.targetName}
                                </span>
                              </>
                            ) : isTargetMate ? (
                              <SquadMateName name={ev.targetName} clanTag={ev.targetClanTag} tracked={ev.targetAffiliation === 'tracked_clan'} />
                            ) : isTargetTracked ? (
                              <>
                                <span
                                  className="px-1.5 py-0.5 rounded border border-purple-500/60 bg-purple-950/90 text-xs font-mono text-purple-200 font-bold flex items-center gap-1"
                                  title="Autre clan suivi sur le site"
                                >
                                  [{ev.targetClanTag || 'Suivi'}]
                                  <span className="text-[10px] bg-purple-800/80 text-purple-100 px-1 py-0.2 rounded font-sans font-bold">
                                    SUIVI
                                  </span>
                                </span>
                                <span
                                  className={`text-sm truncate max-w-[140px] sm:max-w-[180px] font-bold ${
                                    isRevive ? 'text-blue-200' : 'text-purple-200'
                                  }`}
                                >
                                  {ev.targetName}
                                </span>
                              </>
                            ) : (
                              <>
                                {ev.targetClanTag && (
                                  <span className="text-xs text-slate-400 font-mono font-medium">[{ev.targetClanTag}]</span>
                                )}
                                <span className="text-sm text-slate-200 font-medium truncate max-w-[140px] sm:max-w-[180px]">
                                  {ev.targetName}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Right: Expand arrow */}
                        {!isRecall && (
                          <div className="shrink-0 text-slate-400 hover:text-slate-200">
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </div>
                        )}
                      </div>

                      {/* Expanded Tactical Duel View */}
                      {isExpanded && (
                        <div className="border-t border-slate-800/80 bg-slate-950/90 p-5 animate-in fade-in duration-200">
                          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                            {/* Attacker Panel */}
                            <div className="flex-1 flex flex-col items-center sm:items-start gap-2.5 text-center sm:text-left">
                              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                Vainqueur du duel
                              </div>
                              <div className="flex items-center gap-2 text-base font-black text-white flex-wrap">
                                {isActorCurrent ? (
                                  <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-700/70 text-emerald-300 text-xs font-mono font-bold">
                                    [{ev.actorClanTag || clanTag}] Clan Actif
                                  </span>
                                ) : isActorTracked ? (
                                  <span className="px-2 py-0.5 rounded bg-purple-950/80 border border-purple-700/70 text-purple-200 text-xs font-mono font-bold">
                                    [{ev.actorClanTag}] Clan Suivi
                                  </span>
                                ) : ev.actorClanTag ? (
                                  <span className="text-slate-400 font-mono text-xs font-medium">[{ev.actorClanTag}]</span>
                                ) : null}
                                <span
                                  className={
                                    isActorCurrent
                                      ? 'text-emerald-400'
                                      : isActorTracked
                                      ? 'text-purple-300'
                                      : 'text-white'
                                  }
                                >
                                  {ev.actorName}
                                </span>
                              </div>
                              <div className="text-sm text-slate-300 flex flex-col gap-1">
                                <div>
                                  Arme :{' '}
                                  <span className="font-mono text-white font-bold">
                                    {getWeaponDisplayName(ev.weaponName)}
                                  </span>
                                </div>
                                {ev.distanceMeters !== undefined && (
                                  <div>
                                    Distance d'engagement :{' '}
                                    <span className="font-mono text-amber-400 font-bold">
                                      {Math.round(ev.distanceMeters)} mètres
                                    </span>
                                  </div>
                                )}
                                {!hitZonesUnavailable && (
                                  <div>
                                    Localisation fatale :{' '}
                                    <span className="font-mono text-rose-400 font-bold">
                                      {ZONE_DISPLAY_LABELS[
                                        Object.keys(hitZones ?? {})[0] as BodyZoneKey
                                      ] ?? ev.damageReason}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Center Anatomical Damage Hitmap */}
                            <div className="flex flex-col items-center gap-2 px-4 py-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 shrink-0 min-w-[190px] max-w-[240px] shadow-lg">
                              <div className="text-xs text-slate-300 uppercase font-mono font-bold tracking-wider flex items-center gap-1.5">
                                <Crosshair className="w-3.5 h-3.5 text-rose-400" />
                                Impact corporel
                              </div>
                              <DamageBodySvg
                                damageByZone={hitZones ?? {}}
                                size="sm"
                                showTooltips={true}
                                showLabels={true}
                                unavailable={hitZonesUnavailable}
                                unavailableLabel="Localisation de l'impact non enregistrée"
                              />
                            </div>

                            {/* Victim Panel */}
                            <div className="flex-1 flex flex-col items-center sm:items-end gap-2.5 text-center sm:text-right">
                              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                                Cible abattue
                              </div>
                              <div className="flex items-center gap-2 text-base font-black text-white flex-wrap justify-center sm:justify-end">
                                {isTargetCurrent ? (
                                  <span className="px-2 py-0.5 rounded bg-rose-950/80 border border-rose-700/70 text-rose-300 text-xs font-mono font-bold">
                                    [{ev.targetClanTag || clanTag}] Clan Actif
                                  </span>
                                ) : isTargetTracked ? (
                                  <span className="px-2 py-0.5 rounded bg-purple-950/80 border border-purple-700/70 text-purple-200 text-xs font-mono font-bold">
                                    [{ev.targetClanTag}] Clan Suivi
                                  </span>
                                ) : ev.targetClanTag ? (
                                  <span className="text-slate-400 font-mono text-xs font-medium">[{ev.targetClanTag}]</span>
                                ) : null}
                                <span
                                  className={
                                    isTargetCurrent
                                      ? 'text-rose-400'
                                      : isTargetTracked
                                      ? 'text-purple-300'
                                      : 'text-white'
                                  }
                                >
                                  {ev.targetName}
                                </span>
                              </div>
                              <div className="text-sm text-slate-300 flex flex-col gap-1.5 items-center sm:items-end">
                                <span className="px-2.5 py-1 rounded-md bg-rose-950/70 border border-rose-700/70 text-rose-200 font-mono font-extrabold text-xs">
                                  {isKill ? 'K.I.A. (Éliminé)' : 'Mise à terre (D.B.N.O)'}
                                </span>
                                <span className="text-xs text-slate-400 font-mono font-medium">
                                  Chronomètre : {formatTime(ev.timestamp)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

