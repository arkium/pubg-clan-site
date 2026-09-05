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
} from 'lucide-react'
import { DamageBodySvg, BodyZoneKey } from './DamageBodySvg'

export type CombatAffiliation = 'current_clan' | 'tracked_clan' | 'external'

export type CombatEvent = {
  id: string
  type: 'kill' | 'knock' | 'revive'
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
 * Infers rough body zones based on damageReason or default lethal distribution.
 */
function inferHitZones(damageReason?: string): Partial<Record<BodyZoneKey, number>> {
  if (!damageReason) {
    return { torso: 75, pelvis: 25 }
  }
  const reason = damageReason.toLowerCase()
  if (reason.includes('head')) {
    return { head: 100 }
  }
  if (reason.includes('pelvis') || reason.includes('groin')) {
    return { pelvis: 80, torso: 20 }
  }
  if (reason.includes('arm') || reason.includes('hand')) {
    return { arms: 70, torso: 30 }
  }
  if (reason.includes('leg') || reason.includes('foot')) {
    return { legs: 80, pelvis: 20 }
  }
  return { torso: 70, pelvis: 30 }
}

export function MatchCombatTimeline({
  events,
  clanTag,
  clanName,
  otherTrackedClanTags = [],
  className = '',
}: MatchCombatTimelineProps) {
  const [filterMode, setFilterMode] = useState<'clan' | 'tracked' | 'all'>('clan')
  const [typeFilter, setTypeFilter] = useState<'all' | 'kill' | 'knock' | 'revive'>('all')
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null)

  const hasOtherTracked = otherTrackedClanTags.length > 0

  // Filter events
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      // Clan filter
      if (filterMode === 'clan') {
        const involvesCurrentClan =
          ev.isClanActor ||
          ev.isClanTarget ||
          ev.actorAffiliation === 'current_clan' ||
          ev.targetAffiliation === 'current_clan'
        if (!involvesCurrentClan) return false
      } else if (filterMode === 'tracked') {
        const involvesTracked =
          ev.isClanActor ||
          ev.isClanTarget ||
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

  const totalClanKills = events.filter(
    (e) => e.type === 'kill' && (e.isClanActor || e.actorAffiliation === 'current_clan')
  ).length
  const totalClanKnocks = events.filter(
    (e) => e.type === 'knock' && (e.isClanActor || e.actorAffiliation === 'current_clan')
  ).length
  const totalClanDeaths = events.filter(
    (e) => e.type === 'kill' && (e.isClanTarget || e.targetAffiliation === 'current_clan')
  ).length

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
            <span className="text-emerald-400 font-mono">+{totalClanKills} kills {clanTag ? `[${clanTag}]` : ''}</span>
            <span className="text-slate-600">•</span>
            <span className="text-amber-400 font-mono">+{totalClanKnocks} knocks</span>
            <span className="text-slate-600">•</span>
            <span className="text-rose-400 font-mono">-{totalClanDeaths} morts</span>
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
            {(['all', 'kill', 'knock', 'revive'] as const).map((t) => (
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
                {t === 'all' ? 'Tous' : t === 'kill' ? 'Kills' : t === 'knock' ? 'Knocks' : 'Revives'}
              </button>
            ))}
          </div>
        </div>
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
                  const isHeadshot = ev.damageReason?.toLowerCase().includes('head')

                  const isActorCurrent = ev.isClanActor || ev.actorAffiliation === 'current_clan'
                  const isActorTracked = ev.isTrackedClanActor || ev.actorAffiliation === 'tracked_clan'

                  const isTargetCurrent = ev.isClanTarget || ev.targetAffiliation === 'current_clan'
                  const isTargetTracked = ev.isTrackedClanTarget || ev.targetAffiliation === 'tracked_clan'

                  // Highlight card borders based on affiliation
                  let cardBorder = 'border-slate-800/80 hover:border-slate-700'
                  let cardBg = 'bg-slate-900/40 hover:bg-slate-900/70'

                  if (isActorCurrent && isKill) {
                    cardBorder = 'border-emerald-500/40 bg-emerald-950/20 hover:border-emerald-500/60'
                  } else if (isTargetCurrent && isKill) {
                    cardBorder = 'border-rose-500/40 bg-rose-950/20 hover:border-rose-500/60'
                  } else if (isActorCurrent && isKnock) {
                    cardBorder = 'border-amber-500/30 bg-amber-950/15 hover:border-amber-500/50'
                  } else if (isActorTracked || isTargetTracked) {
                    cardBorder = 'border-purple-500/40 bg-purple-950/15 hover:border-purple-500/55'
                  }

                  const hitZones = ev.damageByZone || inferHitZones(ev.damageReason)

                  return (
                    <div
                      key={ev.id}
                      className={`rounded-xl border transition-all overflow-hidden ${cardBorder} ${cardBg}`}
                    >
                      {/* Main Compact Row */}
                      <div
                        onClick={() => setExpandedEventId(isExpanded ? null : ev.id)}
                        className="flex items-center justify-between p-3 cursor-pointer select-none gap-3"
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
                          {isRevive ? (
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
                            </div>
                          )}

                          <span className="text-slate-500 font-bold shrink-0">➔</span>

                          {/* Target */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isTargetCurrent ? (
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
                        <div className="shrink-0 text-slate-400 hover:text-slate-200">
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </div>
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
                                {ev.damageReason && (
                                  <div>
                                    Localisation fatale :{' '}
                                    <span className="font-mono text-rose-400 font-bold">
                                      {ev.damageReason}
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
                                damageByZone={hitZones}
                                size="sm"
                                showTooltips={true}
                                showLabels={true}
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

