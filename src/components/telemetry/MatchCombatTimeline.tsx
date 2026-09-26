'use client'

import React, { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Crosshair, Filter, HeartHandshake, Info, Layers, Plane, ShieldAlert, Skull } from 'lucide-react'

import type { BodyZoneKey } from './DamageBodySvg'
import {
  countTimelineTypes,
  filterTimeline,
  formatClock,
  groupTimelineByPhase,
  hitZoneLabel,
  isHeadshot,
  isSquadActor,
  isSquadTarget,
  squadTotals,
  weaponDisplayName,
  type TimelineScope,
  type TimelineType,
} from '@/lib/pubg-telemetry/debrief-view'

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
  otherTrackedClanTags?: string[]
  /** Libellés d'armes de l'API (`WeapHK416_C` → `M416`). */
  weaponLabels?: Record<string, string>
  /** « Voir dans le replay » : ouvre l'onglet Replay à cet instant. */
  onShowInReplay?: (seconds: number) => void
  className?: string
}

const TYPE_META: Record<CombatEvent['type'], { label: string; icon: typeof Skull; color: string; soft: string }> = {
  kill: { label: 'Kill', icon: Skull, color: 'var(--debrief-neg)', soft: 'var(--debrief-neg-soft)' },
  knock: { label: 'Mise à terre', icon: ShieldAlert, color: 'var(--debrief-warn)', soft: 'var(--debrief-warn-soft)' },
  revive: { label: 'Réanimation', icon: HeartHandshake, color: 'var(--debrief-sky)', soft: 'var(--debrief-sky-soft)' },
  recall: { label: 'Rappel', icon: Plane, color: 'var(--debrief-sky)', soft: 'var(--debrief-sky-soft)' },
}

const TYPE_FILTERS: Array<{ value: TimelineType; label: string; short: string; icon: typeof Skull; color: string }> = [
  { value: 'all', label: 'Tous', short: 'Tous', icon: Layers, color: 'var(--theme-ui-text-secondary)' },
  { value: 'kill', label: 'Kills', short: 'Kills', icon: Skull, color: 'var(--debrief-neg)' },
  { value: 'knock', label: 'Mises à terre', short: 'À terre', icon: ShieldAlert, color: 'var(--debrief-warn)' },
  { value: 'revive', label: 'Réanimations', short: 'Réa.', icon: HeartHandshake, color: 'var(--debrief-sky)' },
  { value: 'recall', label: 'Rappels', short: 'Rappel', icon: Plane, color: 'var(--debrief-sky)' },
]

const isClan = (affiliation?: CombatAffiliation, flag?: boolean) => Boolean(flag || affiliation === 'current_clan')
const isTracked = (affiliation?: CombatAffiliation, flag?: boolean) => Boolean(flag || affiliation === 'tracked_clan')

/** Couleur du nom de l'auteur : membre du clan, coéquipier, autre clan suivi, adversaire. */
function actorColor(ev: CombatEvent) {
  if (isClan(ev.actorAffiliation, ev.isClanActor)) return 'var(--debrief-pos)'
  if (isSquadActor(ev)) return 'var(--debrief-mate)'
  if (isTracked(ev.actorAffiliation, ev.isTrackedClanActor)) return 'var(--theme-ui-accent-text)'
  return 'var(--theme-ui-text)'
}

function targetColor(ev: CombatEvent) {
  if (ev.type === 'revive') return 'var(--debrief-sky)'
  if (isSquadTarget(ev)) return 'var(--debrief-neg)'
  if (isTracked(ev.targetAffiliation, ev.isTrackedClanTarget)) return 'var(--theme-ui-accent-text)'
  return 'var(--theme-ui-text-secondary)'
}

function TelemetryChip() {
  return (
    <span
      className="rounded border px-1 text-[10px] font-bold"
      style={{ borderColor: 'var(--debrief-mate)', color: 'var(--debrief-mate)' }}
      title="Frag retrouvé dans le kill-feed de la télémétrie : le clan du joueur n'avait pas synchronisé ce match."
    >
      télémétrie
    </span>
  )
}

/**
 * Chronologie du match (onglet « Chronologie » du débriefing) : liste continue groupée par phase, deux lignes par
 * événement, filet coloré pour les seuls kills et morts de l'escouade. Maquette : Claude Design « Débrief
 * télémétrie », écrans 8a, 8e, 8g.
 */
export function MatchCombatTimeline({
  events,
  clanTag,
  otherTrackedClanTags = [],
  weaponLabels = {},
  onShowInReplay,
  className = '',
}: MatchCombatTimelineProps) {
  const [scope, setScope] = useState<TimelineScope>('squad')
  const [type, setType] = useState<TimelineType>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const hasOtherTracked = otherTrackedClanTags.length > 0
  const scopes: Array<{ value: TimelineScope; label: string }> = [
    { value: 'squad', label: clanTag ? `Escouade [${clanTag}]` : 'Escouade' },
    ...(hasOtherTracked ? [{ value: 'tracked' as const, label: 'Clans suivis' }] : []),
    { value: 'all', label: 'Tout le match' },
  ]

  const counts = useMemo(() => countTimelineTypes(events, scope), [events, scope])
  const groups = useMemo(() => groupTimelineByPhase(filterTimeline(events, scope, type)), [events, scope, type])
  const totals = useMemo(() => squadTotals(events), [events])
  const telemetryKills = events.filter((e) => e.type === 'kill' && e.source === 'telemetry').length
  const sourcesNote =
    `Escouade : membres ${clanTag ? `[${clanTag}]` : 'du clan'} et coéquipiers de la même équipe, suivis ailleurs ou non. ` +
    'Kills issus des frags enregistrés à la synchronisation du clan, complétés par le kill-feed de la télémétrie' +
    (telemetryKills > 0 ? ` (${telemetryKills} frag${telemetryKills > 1 ? 's' : ''} marqué${telemetryKills > 1 ? 's' : ''} « télémétrie »).` : '.') +
    ' Mises à terre, réanimations et rappels couvrent tout le lobby.'

  return (
    <section className={`flex flex-col gap-3.5 ${className}`} aria-label="Chronologie du match">
      {/* Filtres — ordinateur */}
      <div className="hidden flex-wrap items-center justify-between gap-2.5 sm:flex">
        <div className="debrief-seg" role="group" aria-label="Portée">
          {scopes.map((option) => (
            <button key={option.value} type="button" aria-pressed={scope === option.value} onClick={() => setScope(option.value)}>
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="Type d'événement">
          {TYPE_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className="debrief-chip"
              aria-pressed={type === option.value}
              onClick={() => setType(option.value)}
            >
              {option.label}
              <span className="tabular-nums text-gray-500">{counts[option.value]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Filtres — mobile : portée en deux cases, types en cinq cases avec icône et compteur */}
      <div className="flex flex-col gap-2.5 sm:hidden">
        <div className="debrief-seg grid" style={{ gridTemplateColumns: `repeat(${scopes.length}, minmax(0, 1fr))` }} role="group" aria-label="Portée">
          {scopes.map((option) => (
            <button key={option.value} type="button" aria-pressed={scope === option.value} onClick={() => setScope(option.value)} className="truncate">
              {option.label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-5 gap-1.5" role="group" aria-label="Type d'événement">
          {TYPE_FILTERS.map((option) => {
            const active = type === option.value
            const Icon = option.icon
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                aria-label={`${option.label} (${counts[option.value]})`}
                onClick={() => setType(option.value)}
                className="debrief-chip relative h-[58px] flex-col justify-center gap-0.5 rounded-[10px] px-0"
              >
                <span className="absolute right-1.5 top-1 text-[10px] font-bold tabular-nums">{counts[option.value]}</span>
                <Icon className="h-[18px] w-[18px]" style={{ color: active ? 'var(--theme-ui-accent-text)' : option.color }} aria-hidden="true" />
                <span className="text-[10px] font-bold">{option.short}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Bilan de l'escouade */}
      <div className="hidden flex-wrap gap-4 text-[13px] tabular-nums sm:flex">
        <span>
          <b style={{ color: 'var(--debrief-pos)' }}>+{totals.kills}</b> <span className="text-gray-500">kills</span>
        </span>
        <span>
          <b style={{ color: 'var(--debrief-warn)' }}>+{totals.knocks}</b> <span className="text-gray-500">mises à terre</span>
        </span>
        <span>
          <b style={{ color: 'var(--debrief-neg)' }}>−{totals.deaths}</b> <span className="text-gray-500">morts</span>
        </span>
        {totals.recalls > 0 && (
          <span>
            <b style={{ color: 'var(--debrief-sky)' }}>{totals.recalls}</b>{' '}
            <span className="text-gray-500">rappel{totals.recalls > 1 ? 's' : ''}</span>
          </span>
        )}
        <span className="inline-flex cursor-help items-center gap-1 text-gray-500" title={sourcesNote}>
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          Sources
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="app-panel flex flex-col items-center gap-2 p-8 text-center text-sm text-gray-500">
          <Filter className="h-7 w-7 opacity-40" aria-hidden="true" />
          Aucun événement ne correspond aux filtres sélectionnés.
        </div>
      ) : (
        <div className="app-panel overflow-hidden p-0">
          {groups.map((group) => (
            <div key={group.phase}>
              <div className="debrief-row -mt-px flex items-center gap-2.5 border-t border-gray-200 bg-gray-50 px-3.5 py-2">
                <span className="text-[11px] font-extrabold uppercase tracking-[0.08em]" style={{ color: 'var(--theme-ui-accent-text)' }}>
                  Phase {group.phase}
                </span>
                <span className="text-xs tabular-nums text-gray-500">à partir de {formatClock(group.start)}</span>
                {group.summary && <span className="ml-auto text-xs text-gray-500">{group.summary}</span>}
              </div>
              <ol>
                {group.events.map((ev) => {
                  const meta = TYPE_META[ev.type]
                  const Icon = meta.icon
                  const expandable = ev.type === 'kill' || ev.type === 'knock'
                  const expanded = expandable && expandedId === ev.id
                  const squadKill = ev.type === 'kill' && isSquadActor(ev)
                  const squadDeath = ev.type === 'kill' && isSquadTarget(ev)
                  const weapon = ev.weaponName ? weaponDisplayName(ev.weaponName, weaponLabels) : null
                  const distance = ev.distanceMeters && ev.distanceMeters > 0 ? `${Math.round(ev.distanceMeters)} m` : null
                  const detail =
                    ev.type === 'revive'
                      ? 'Réanimation'
                      : ev.type === 'recall'
                        ? 'Avion de rappel'
                        : [weapon, distance].filter(Boolean).join(' · ') || 'Arme inconnue'
                  const content = (
                    <>
                      <span className="text-xs font-semibold tabular-nums text-gray-500">{formatClock(ev.timestamp)}</span>
                      <span
                        className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-[7px]"
                        style={{ background: meta.soft }}
                        title={meta.label}
                      >
                        <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} aria-label={meta.label} />
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="flex min-w-0 items-center gap-1.5 text-sm">
                          {ev.actorClanTag && <span className="shrink-0 text-[11px] font-bold text-gray-500">[{ev.actorClanTag}]</span>}
                          <span className="truncate font-bold" style={{ color: actorColor(ev) }}>
                            {ev.actorName}
                          </span>
                          {ev.type === 'recall' ? (
                            <span className="shrink-0 text-gray-500">revient en jeu</span>
                          ) : (
                            <>
                              <span className="shrink-0 text-gray-500" aria-hidden="true">
                                →
                              </span>
                              {ev.targetClanTag && <span className="shrink-0 text-[11px] font-bold text-gray-500">[{ev.targetClanTag}]</span>}
                              <span className="truncate font-semibold" style={{ color: targetColor(ev) }}>
                                {ev.targetName}
                              </span>
                            </>
                          )}
                        </span>
                        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                          <span className="font-semibold text-gray-700">{detail}</span>
                          {expandable && isHeadshot(ev.damageReason) && (
                            <span className="inline-flex items-center gap-0.5 font-bold" style={{ color: 'var(--debrief-warn)' }}>
                              <Crosshair className="h-3 w-3" aria-hidden="true" />
                              Tête
                            </span>
                          )}
                          {ev.type === 'kill' && ev.source === 'telemetry' && <TelemetryChip />}
                        </span>
                      </span>
                      <span className="text-gray-500" aria-hidden="true">
                        {expandable ? expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" /> : null}
                      </span>
                    </>
                  )
                  const gridClass =
                    'grid w-full items-center gap-2.5 px-3.5 py-2.5 text-left [grid-template-columns:40px_26px_1fr_14px] sm:[grid-template-columns:52px_26px_1fr_14px]'
                  return (
                    <li
                      key={ev.id}
                      className={`debrief-row ${squadKill ? 'debrief-row--kill' : squadDeath ? 'debrief-row--death' : ''}`}
                    >
                      {expandable ? (
                        <button
                          type="button"
                          className={gridClass}
                          aria-expanded={expanded}
                          onClick={() => setExpandedId(expanded ? null : ev.id)}
                        >
                          {content}
                        </button>
                      ) : (
                        <div className={gridClass}>{content}</div>
                      )}
                      {expanded && (
                        <div className="grid gap-2 px-3.5 pb-3.5 pt-1 sm:pl-[102px] [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
                          {[
                            { label: 'Arme', value: weapon ?? 'Inconnue' },
                            { label: 'Distance', value: distance ?? '—' },
                            { label: 'Zone touchée', value: hitZoneLabel(ev.damageReason) },
                          ].map((tile) => (
                            <div key={tile.label} className="app-panel-muted px-2.5 py-2">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-gray-500">{tile.label}</p>
                              <p className="text-sm font-bold">{tile.value}</p>
                            </div>
                          ))}
                          {onShowInReplay && (
                            <div className="app-panel-muted flex items-center px-2.5 py-2">
                              <button
                                type="button"
                                onClick={() => onShowInReplay(Math.max(0, ev.timestamp - 5))}
                                className="text-[13px] font-semibold hover:underline"
                                style={{ color: 'var(--debrief-link)' }}
                              >
                                Voir dans le replay →
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
