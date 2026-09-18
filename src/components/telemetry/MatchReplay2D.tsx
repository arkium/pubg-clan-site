'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Crosshair,
  Focus,
  Gauge,
  HeartHandshake,
  Package,
  Pause,
  Plane,
  PlaneLanding,
  Play,
  RotateCcw,
  Route,
  ShieldAlert,
  Skull,
  Target,
  Users,
} from 'lucide-react'

import MapZoomControl from '@/components/ui/MapZoomControl'
import { MAP_ZOOM_MIN, clampMapZoom, stepMapZoom, wheelZoomDirection } from '@/lib/map-zoom'
import {
  aircraftPositionAt,
  compassCardinal,
  compassHeadingDeg,
  type FlightTiming,
} from '@/lib/pubg-telemetry/flight-path'
import { applyReplaySquadFocus, squadColorsByIndex } from '@/lib/pubg-telemetry/replay-focus'

export type ReplayAffiliation = 0 | 1 | 2

export type ReplayLife = [number, number | null]

export type ReplayPlayer = {
  i: number
  key: string
  n: string
  t: string | null
  team: number
  aff: ReplayAffiliation
  /** Escouade consultée : membre du clan ou coéquipier de la même équipe. */
  sq: boolean
  bot: boolean
  p: number[]
  /** Vies successives `[début, fin]` — un rappel ouvre une nouvelle vie. */
  l: ReplayLife[]
  d: number | null
  land: number | null
  lands: number[]
  jump: number | null
}

export type ReplayZone = {
  t: number
  g: number
  alive: number
  teams: number
  sx: number | null
  sy: number | null
  sr: number
  px: number | null
  py: number | null
  pr: number
}

export type ReplayEvent = {
  id: string
  /** `kill` sans acteur = mort sans `KillEvent` ; `recall` = retour par l'avion de rappel. */
  k: 'kill' | 'knock' | 'revive' | 'recall'
  t: number
  a: number | null
  v: number | null
  x: number | null
  y: number | null
  w: string | null
  dist: number | null
  hs: boolean
}

export type MatchReplayData = {
  match: {
    mapName: string
    mapLabel: string
    mapAssetUrl: string | null
    mapWidth: number
    mapHeight: number
    durationSeconds: number
    clanTag: string | null
    trackedClanTags: string[]
    totalPlayers: number
    totalTeams: number
  }
  players: ReplayPlayer[]
  zones: ReplayZone[]
  events: ReplayEvent[]
  flightPath: {
    /** Payloads mis en cache avant le 2026-09-18 : champ absent, l'axe est alors supposé venir des sauts. */
    source?: 'jumps' | 'landings'
    start: { x: number; y: number }
    end: { x: number; y: number }
    dropStart: { x: number; y: number } | null
    dropEnd: { x: number; y: number } | null
    angleDeg: number
    timing: FlightTiming | null
  } | null
  /** Avions de rappel : chacun n'est affiché que pendant son survol de la carte. */
  recallFlights?: ReplayRecallFlight[]
  /** Caisses de largage — vide pour les matchs analysés avant le 2026-09-13. */
  crates?: ReplayCrate[]
}

export type ReplayRecallFlight = {
  start: { x: number; y: number }
  end: { x: number; y: number }
  angleDeg: number
  timing: FlightTiming
  riders: number
}

export type ReplayCrateKind = 'redbox' | 'small' | 'bluechip' | 'vehicle' | 'other'

export type ReplayCrate = {
  k: ReplayCrateKind
  sp: number | null
  t: number | null
  x: number
  y: number
  items: string[]
  lt: number | null
  sq: boolean
  /** Équipes ayant pillé la caisse (absent des payloads mis en cache avant le 2026-09-16). */
  lteams?: number[]
}

type VisibilityMode = 'squad' | 'tracked' | 'all'

type ReplayLayers = {
  /** Ligne de vol, fenêtre de largage, avion animé et badge de cap. */
  aircraft: boolean
  /** Trajet complet de l'escouade depuis le saut, au lieu des 75 dernières secondes. */
  fullTrail: boolean
  landings: boolean
  deaths: boolean
  /** Caisses de largage : en chute, posées, pillées. */
  crates: boolean
}

const SPEEDS = [0.5, 1, 2, 4, 8] as const
const MIN_ZOOM = MAP_ZOOM_MIN
/** Plus haut que les drop zones (×4) : il faut distinguer les joueurs d'un même bâtiment. */
const MAX_ZOOM = 8
const FOLLOW_ZOOM = 3
const DRAG_THRESHOLD_PX = 5
const STRIDE = 4
/** Rayon de contact (unités PUBG = cm) sous lequel un adversaire reste visible en mode Escouade. */
const ENGAGEMENT_RADIUS_UNITS = 30_000
const EVENT_FLASH_SECONDS = 2.5
/** Réanimations et rappels restent affichés plus longtemps : ce sont des moments clés de l'escouade. */
const SUPPORT_FLASH_SECONDS = 4
/** Fenêtre au-delà de laquelle un adversaire n'est plus considéré « au contact » en mode Escouade. */
const ENGAGEMENT_WINDOW_SECONDS = 12
const KILL_FEED_WINDOW_SECONDS = 14
const TRAIL_SECONDS = 75

const DEFAULT_LAYERS: ReplayLayers = {
  aircraft: true,
  fullTrail: false,
  landings: false,
  deaths: false,
  crates: true,
}

const CRATE_COLORS: Record<ReplayCrateKind, string> = {
  redbox: '#ef4444',
  small: '#f59e0b',
  bluechip: '#38bdf8',
  vehicle: '#84cc16',
  other: '#a1a1aa',
}

/** « 3 caisses de largage · 2 pillées · dont par l'escouade » — caisses déjà posées à l'instant `time`. */
function crateSummaryLabel(landed: ReplayCrate[], time: number) {
  const main = landed.filter((crate) => crate.k === 'redbox').length
  const looted = landed.filter((crate) => crate.lt !== null && crate.lt <= time)
  const parts = [
    `${main} ${main > 1 ? 'caisses' : 'caisse'} de largage`,
    `${looted.length} pillée${looted.length > 1 ? 's' : ''}`,
  ]
  if (looted.some((crate) => crate.sq)) parts.push("dont par l'escouade")
  return parts.join(' · ')
}

/** `Item_Weapon_AWM_C` → `AWM`. */
function crateWeaponLabel(items: string[]) {
  const weapon = items.find((item) => item.startsWith('Item_Weapon_'))
  return weapon ? weapon.replace(/^Item_Weapon_/, '').replace(/_C$/, '').replace(/_/g, ' ') : null
}

type AircraftPalette = { fill: string; stroke: string; glow: string }

const MAIN_AIRCRAFT_PALETTE: AircraftPalette = { fill: '#e0f2fe', stroke: '#0369a1', glow: 'rgba(56, 189, 248, 0.9)' }
const RECALL_AIRCRAFT_PALETTE: AircraftPalette = { fill: '#fef3c7', stroke: '#b45309', glow: 'rgba(251, 191, 36, 0.9)' }

const AFFILIATION_COLORS: Record<ReplayAffiliation, string> = {
  2: '#10b981',
  1: '#a855f7',
  0: '#94a3b8',
}

/** Coéquipier de l'escouade qui n'est membre d'aucun clan consulté. */
const SQUAD_MATE_COLOR = '#2dd4bf'

function playerColor(player: ReplayPlayer) {
  if (player.aff === 2) return AFFILIATION_COLORS[2]
  if (player.sq) return SQUAD_MATE_COLOR
  return AFFILIATION_COLORS[player.aff]
}

function flashDuration(event: ReplayEvent) {
  return event.k === 'revive' || event.k === 'recall' ? SUPPORT_FLASH_SECONDS : EVENT_FLASH_SECONDS
}

/** Silhouette vue de dessus, nez vers +x, demi-contour côté y ≥ 0 (miroir pour l'autre aile). */
const AIRCRAFT_HALF_OUTLINE: ReadonlyArray<readonly [number, number]> = [
  [12, 0],
  [9, 1.6],
  [3, 1.6],
  [-2, 11],
  [-5.5, 11],
  [-3.5, 1.6],
  [-9, 1.6],
  [-11.5, 5],
  [-13.5, 5],
  [-12.5, 0],
]

function formatClock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(safe / 60)
  const rest = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

function weaponLabel(raw: string | null) {
  if (!raw) return ''
  return raw.replace(/^Weap/, '').replace(/^Proj/, '').replace(/_C$/, '').replace(/_/g, ' ')
}

/** Vie en cours à l'instant `time`, `null` si le joueur n'est pas sur la carte. */
function lifeAt(player: ReplayPlayer, time: number): ReplayLife | null {
  for (const life of player.l) {
    if (time >= life[0] && (life[1] === null || time <= life[1])) return life
  }
  return null
}

/** Mort à l'instant `time` : après sa première apparition et hors de toute vie (en attente de rappel ou éliminé). */
function isDeadAt(player: ReplayPlayer, time: number) {
  if (lifeAt(player, time)) return false
  const firstLife = player.l[0]
  return firstLife !== undefined && time > firstLife[0]
}

/** Position interpolée d'un joueur à l'instant `time`, ou `null` s'il n'est pas sur la carte. */
function samplePlayerAt(player: ReplayPlayer, time: number) {
  const life = lifeAt(player, time)
  if (!life) return null

  const track = player.p
  const count = track.length / STRIDE
  if (count === 0) return null

  if (time < track[0]) return null

  const lastIndex = (count - 1) * STRIDE
  if (time >= track[lastIndex]) {
    // Le dernier point appartient à une vie précédente : rien à afficher dans celle-ci.
    if (track[lastIndex] < life[0]) return null
    return { x: track[lastIndex + 1], y: track[lastIndex + 2], v: track[lastIndex + 3] === 1 }
  }

  let low = 0
  let high = count - 1
  while (low < high - 1) {
    const mid = (low + high) >> 1
    if (track[mid * STRIDE] <= time) low = mid
    else high = mid
  }

  // Ne jamais interpoler à travers une mort : les deux points doivent appartenir à la vie courante.
  if (track[low * STRIDE] < life[0]) low = high
  if (life[1] !== null && track[high * STRIDE] > life[1]) high = low

  const aOffset = low * STRIDE
  const bOffset = high * STRIDE
  const ta = track[aOffset]
  const tb = track[bOffset]
  const ratio = tb > ta ? (time - ta) / (tb - ta) : 0

  return {
    x: track[aOffset + 1] + (track[bOffset + 1] - track[aOffset + 1]) * ratio,
    y: track[aOffset + 2] + (track[bOffset + 2] - track[aOffset + 2]) * ratio,
    v: track[(ratio < 0.5 ? aOffset : bOffset) + 3] === 1,
  }
}

/** Cercles de zone interpolés entre deux snapshots encadrant `time`. */
function sampleZoneAt(zones: ReplayZone[], time: number) {
  if (zones.length === 0) return null

  let low = 0
  let high = zones.length - 1
  if (time <= zones[0].t) return zones[0]
  if (time >= zones[high].t) return zones[high]

  while (low < high - 1) {
    const mid = (low + high) >> 1
    if (zones[mid].t <= time) low = mid
    else high = mid
  }

  const a = zones[low]
  const b = zones[high]
  const ratio = b.t > a.t ? (time - a.t) / (b.t - a.t) : 0

  const lerp = (left: number | null, right: number | null) => {
    if (left === null || right === null) return left ?? right
    return left + (right - left) * ratio
  }

  return {
    ...a,
    sx: lerp(a.sx, b.sx),
    sy: lerp(a.sy, b.sy),
    sr: a.sr + (b.sr - a.sr) * ratio,
    px: lerp(a.px, b.px),
    py: lerp(a.py, b.py),
    pr: a.pr + (b.pr - a.pr) * ratio,
  }
}

/**
 * Empêche la caméra de montrer du vide autour de la carte, comme le fait
 * naturellement le conteneur scrollable des drop zones. À ×1 la carte est centrée.
 */
function clampCameraToMap(
  camera: { cx: number; cy: number; zoom: number },
  width: number,
  height: number
) {
  const worldScale = Math.min(width, height) * camera.zoom
  if (worldScale <= 0) return
  const halfX = width / (2 * worldScale)
  const halfY = height / (2 * worldScale)
  camera.cx = halfX >= 0.5 ? 0.5 : Math.min(1 - halfX, Math.max(halfX, camera.cx))
  camera.cy = halfY >= 0.5 ? 0.5 : Math.min(1 - halfY, Math.max(halfY, camera.cy))
}

function drawAircraft(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angleRad: number,
  scale: number,
  palette: AircraftPalette = MAIN_AIRCRAFT_PALETTE
) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angleRad)
  ctx.scale(scale, scale)

  ctx.beginPath()
  AIRCRAFT_HALF_OUTLINE.forEach(([px, py], index) => {
    if (index === 0) ctx.moveTo(px, py)
    else ctx.lineTo(px, py)
  })
  for (let index = AIRCRAFT_HALF_OUTLINE.length - 2; index > 0; index -= 1) {
    const [px, py] = AIRCRAFT_HALF_OUTLINE[index]
    ctx.lineTo(px, -py)
  }
  ctx.closePath()

  ctx.shadowColor = palette.glow
  ctx.shadowBlur = 12
  ctx.fillStyle = palette.fill
  ctx.fill()
  ctx.shadowBlur = 0
  ctx.lineWidth = 1.2 / scale
  ctx.strokeStyle = palette.stroke
  ctx.stroke()
  ctx.restore()
}

/**
 * Caisse vue de dessus. En chute : parachute au-dessus de la caisse. Pillée : contour seul,
 * avec un anneau émeraude si c'est l'escouade qui l'a pillée.
 */
function drawCrate(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  crate: ReplayCrate,
  state: { falling: boolean; looted: boolean },
  scale: number,
  showLabel: boolean
) {
  const color = CRATE_COLORS[crate.k]
  const half = (crate.k === 'redbox' || crate.k === 'vehicle' ? 5 : 3.5) * scale

  ctx.save()
  ctx.globalAlpha = state.falling ? 0.75 : state.looted ? 0.6 : 1

  if (state.falling) {
    const canopyY = py - half * 3
    ctx.beginPath()
    ctx.arc(px, canopyY, half * 2, Math.PI, 0)
    ctx.fillStyle = 'rgba(248, 250, 252, 0.85)'
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(px - half * 2, canopyY)
    ctx.lineTo(px - half * 0.6, py - half)
    ctx.moveTo(px + half * 2, canopyY)
    ctx.lineTo(px + half * 0.6, py - half)
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.8)'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  ctx.beginPath()
  if (crate.k === 'vehicle') {
    ctx.moveTo(px, py - half)
    ctx.lineTo(px + half, py)
    ctx.lineTo(px, py + half)
    ctx.lineTo(px - half, py)
    ctx.closePath()
  } else {
    ctx.rect(px - half, py - half, half * 2, half * 2)
  }
  if (!state.looted) {
    ctx.fillStyle = color
    ctx.fill()
  }
  ctx.lineWidth = state.looted ? 2 : 1.2
  ctx.strokeStyle = state.looted ? color : 'rgba(2, 6, 23, 0.9)'
  ctx.stroke()

  if (state.looted && crate.sq) {
    ctx.beginPath()
    ctx.arc(px, py, half + 4, 0, Math.PI * 2)
    ctx.strokeStyle = '#10b981'
    ctx.lineWidth = 1.8
    ctx.stroke()
  }
  ctx.restore()

  const weapon = showLabel ? crateWeaponLabel(crate.items) : null
  if (weapon) {
    ctx.font = '700 10px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.textAlign = 'center'
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(2, 6, 23, 0.9)'
    ctx.strokeText(weapon, px, py + half + 12)
    ctx.fillStyle = color
    ctx.fillText(weapon, px, py + half + 12)
  }
}

export function MatchReplay2D({
  data: rawData,
  focusTeamId = null,
  focusTag = null,
  className = '',
}: {
  data: MatchReplayData
  /** Équipe choisie dans la bande des escouades du débriefing ; `null` = escouade du clan consulté. */
  focusTeamId?: number | null
  focusTag?: string | null
  className?: string
}) {
  const data = useMemo(
    () => applyReplaySquadFocus(rawData, focusTeamId, focusTag),
    [rawData, focusTeamId, focusTag]
  )
  const squadColors = useMemo(() => squadColorsByIndex(data.players), [data.players])
  // Escouade suivie : couleurs d'escouade PUBG ; le reste du lobby garde les couleurs d'affiliation.
  const colorOf = useCallback(
    (player: ReplayPlayer) => squadColors.get(player.i) ?? playerColor(player),
    [squadColors]
  )
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrubberRef = useRef<HTMLInputElement>(null)

  const timeRef = useRef(0)
  const playingRef = useRef(false)
  const speedRef = useRef<number>(1)
  const cameraRef = useRef({ cx: 0.5, cy: 0.5, zoom: MIN_ZOOM })
  const followRef = useRef<number | null>(null)
  const visibilityRef = useRef<VisibilityMode>('squad')
  const layersRef = useRef<ReplayLayers>(DEFAULT_LAYERS)
  const mapImageRef = useRef<HTMLImageElement | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    lastX: number
    lastY: number
    moved: boolean
  } | null>(null)

  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<number>(1)
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const [dragging, setDragging] = useState(false)
  const [visibility, setVisibility] = useState<VisibilityMode>('squad')
  const [layers, setLayers] = useState<ReplayLayers>(DEFAULT_LAYERS)
  const [follow, setFollow] = useState<number | null>(null)
  const [displaySeconds, setDisplaySeconds] = useState(0)
  const [mapLoadFailed, setMapLoadFailed] = useState(false)
  const mapUnavailable = data.match.mapAssetUrl === null || mapLoadFailed

  const duration = Math.max(1, data.match.durationSeconds)
  const mapWidth = data.match.mapWidth
  const mapHeight = data.match.mapHeight
  const flight = data.flightPath
  const flightTiming = flight?.timing ?? null
  // Payloads mis en cache avant l'ajout des rappels et des caisses : champs absents.
  const recallFlights = useMemo(() => data.recallFlights ?? [], [data.recallFlights])
  const crates = useMemo(() => data.crates ?? [], [data.crates])

  const playersByIndex = useMemo(() => {
    const list: ReplayPlayer[] = []
    for (const player of data.players) list[player.i] = player
    return list
  }, [data.players])

  const squadPlayers = useMemo(() => data.players.filter((p) => p.sq), [data.players])
  const hasTrackedClans = data.match.trackedClanTags.length > 0

  /**
   * Premier instant où chaque adversaire a échangé un knock ou un kill avec
   * l'escouade : en mode Escouade, ses marqueurs persistants (atterrissage,
   * élimination) ne s'affichent qu'à partir de là.
   */
  const squadContactTimes = useMemo(() => {
    const times = new Map<number, number>()
    for (const event of data.events) {
      if (event.a === null || event.v === null) continue
      const actor = playersByIndex[event.a]
      const victim = playersByIndex[event.v]
      if (!actor || !victim) continue
      const other = actor.sq ? victim : victim.sq ? actor : null
      if (!other || other.sq) continue
      const known = times.get(other.i)
      if (known === undefined || event.t < known) times.set(other.i, event.t)
    }
    return times
  }, [data.events, playersByIndex])

  /** Périodes « à terre » : d'un knock à la réanimation, à la mort ou à la fin de la vie. */
  const downedByPlayer = useMemo(() => {
    const intervals = new Map<number, Array<[number, number]>>()
    for (const knock of data.events) {
      if (knock.k !== 'knock' || knock.v === null) continue
      const player = playersByIndex[knock.v]
      if (!player) continue

      let end = duration
      for (const other of data.events) {
        if (other.v !== knock.v || other.t < knock.t || other === knock) continue
        if (other.k === 'revive' || other.k === 'kill' || other.k === 'knock') end = Math.min(end, other.t)
      }
      const lifeEnd = lifeAt(player, knock.t)?.[1]
      if (lifeEnd !== null && lifeEnd !== undefined) end = Math.min(end, lifeEnd)
      if (end <= knock.t) continue

      const list = intervals.get(knock.v) ?? []
      list.push([knock.t, end])
      intervals.set(knock.v, list)
    }
    return intervals
  }, [data.events, duration, playersByIndex])

  const isEventShownInMode = useCallback(
    (event: ReplayEvent, mode: VisibilityMode) => {
      if (mode === 'all') return true
      return [event.a, event.v].some((index) => {
        if (index === null) return false
        const player = playersByIndex[index]
        if (!player) return false
        return mode === 'tracked' ? player.sq || player.aff >= 1 : player.sq
      })
    },
    [playersByIndex]
  )

  const phaseStarts = useMemo(() => {
    const starts: Array<{ phase: number; t: number }> = []
    const seen = new Set<number>()
    for (const zone of data.zones) {
      const phase = Math.floor(zone.g)
      if (phase < 1 || seen.has(phase)) continue
      seen.add(phase)
      starts.push({ phase, t: zone.t })
    }
    return starts.sort((left, right) => left.phase - right.phase)
  }, [data.zones])

  const jumpers = useMemo(
    () => data.players.filter((player) => player.jump !== null),
    [data.players]
  )

  const zoneAtCurrentTime = useMemo(
    () => sampleZoneAt(data.zones, displaySeconds),
    [data.zones, displaySeconds]
  )

  // Filtré comme la carte : en mode Escouade, les knocks du reste du lobby ne doivent pas
  // chasser du journal une réanimation ou un rappel de l'escouade.
  const killFeed = useMemo(() => {
    return data.events
      .filter(
        (event) =>
          event.t <= displaySeconds &&
          event.t > displaySeconds - KILL_FEED_WINDOW_SECONDS &&
          isEventShownInMode(event, visibility)
      )
      .slice(-6)
      .reverse()
  }, [data.events, displaySeconds, isEventShownInMode, visibility])

  useEffect(() => {
    const url = data.match.mapAssetUrl
    if (!url) {
      mapImageRef.current = null
      return
    }

    const image = new window.Image()
    image.src = url
    image.onload = () => {
      mapImageRef.current = image
    }
    image.onerror = () => {
      mapImageRef.current = null
      setMapLoadFailed(true)
    }

    return () => {
      image.onload = null
      image.onerror = null
    }
  }, [data.match.mapAssetUrl])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const cssWidth = canvas.clientWidth
    const cssHeight = canvas.clientHeight
    if (cssWidth === 0 || cssHeight === 0) return

    if (canvas.width !== Math.round(cssWidth * dpr) || canvas.height !== Math.round(cssHeight * dpr)) {
      canvas.width = Math.round(cssWidth * dpr)
      canvas.height = Math.round(cssHeight * dpr)
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssWidth, cssHeight)
    ctx.fillStyle = '#020617'
    ctx.fillRect(0, 0, cssWidth, cssHeight)

    const time = timeRef.current
    const camera = cameraRef.current
    const activeLayers = layersRef.current

    if (followRef.current !== null) {
      const followed = playersByIndex[followRef.current]
      const position = followed ? samplePlayerAt(followed, time) : null
      if (position) {
        camera.cx = position.x / mapWidth
        camera.cy = position.y / mapHeight
      }
    }
    clampCameraToMap(camera, cssWidth, cssHeight)

    const baseScale = Math.min(cssWidth, cssHeight)
    const worldScale = baseScale * camera.zoom
    const originX = cssWidth / 2 - camera.cx * worldScale
    const originY = cssHeight / 2 - camera.cy * worldScale

    const projectX = (x: number) => originX + (x / mapWidth) * worldScale
    const projectY = (y: number) => originY + (y / mapHeight) * worldScale
    const projectRadius = (radius: number) => (radius / mapWidth) * worldScale

    const mapImage = mapImageRef.current
    if (mapImage) {
      ctx.drawImage(mapImage, originX, originY, worldScale, worldScale)
    } else {
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.12)'
      ctx.lineWidth = 1
      for (let step = 0; step <= 10; step += 1) {
        const offset = (step / 10) * worldScale
        ctx.beginPath()
        ctx.moveTo(originX + offset, originY)
        ctx.lineTo(originX + offset, originY + worldScale)
        ctx.moveTo(originX, originY + offset)
        ctx.lineTo(originX + worldScale, originY + offset)
        ctx.stroke()
      }
    }

    ctx.fillStyle = 'rgba(2, 6, 23, 0.35)'
    ctx.fillRect(originX, originY, worldScale, worldScale)

    const zone = sampleZoneAt(data.zones, time)

    if (zone && zone.sx !== null && zone.sy !== null && zone.sr > 0) {
      const cx = projectX(zone.sx)
      const cy = projectY(zone.sy)
      const radius = projectRadius(zone.sr)

      // Assombrit tout ce qui est hors de la zone jouable courante.
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, cssWidth, cssHeight)
      ctx.arc(cx, cy, radius, 0, Math.PI * 2, true)
      ctx.fillStyle = 'rgba(37, 99, 235, 0.28)'
      ctx.fill('evenodd')
      ctx.restore()

      ctx.beginPath()
      ctx.arc(cx, cy, radius, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.9)'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    if (zone && zone.px !== null && zone.py !== null && zone.pr > 0) {
      ctx.beginPath()
      ctx.arc(projectX(zone.px), projectY(zone.py), projectRadius(zone.pr), 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 5])
      ctx.stroke()
      ctx.setLineDash([])
    }

    const aircraftPosition =
      flight && activeLayers.aircraft ? aircraftPositionAt(flight, time) : null

    if (flight && activeLayers.aircraft) {
      const startX = projectX(flight.start.x)
      const startY = projectY(flight.start.y)

      ctx.beginPath()
      ctx.moveTo(startX, startY)
      ctx.lineTo(projectX(flight.end.x), projectY(flight.end.y))
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.55)'
      ctx.lineWidth = 1.5
      ctx.setLineDash([10, 8])
      ctx.stroke()
      ctx.setLineDash([])

      // Tronçon déjà parcouru par l'avion, pendant son survol.
      if (aircraftPosition) {
        ctx.beginPath()
        ctx.moveTo(startX, startY)
        ctx.lineTo(projectX(aircraftPosition.x), projectY(aircraftPosition.y))
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // Fenêtre de largage : du premier au dernier saut.
      if (flight.dropStart && flight.dropEnd) {
        const dropStartX = projectX(flight.dropStart.x)
        const dropStartY = projectY(flight.dropStart.y)
        const dropEndX = projectX(flight.dropEnd.x)
        const dropEndY = projectY(flight.dropEnd.y)

        ctx.beginPath()
        ctx.moveTo(dropStartX, dropStartY)
        ctx.lineTo(dropEndX, dropEndY)
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.45)'
        ctx.lineWidth = 4
        ctx.stroke()

        for (const [markerX, markerY, color] of [
          [dropStartX, dropStartY, '#10b981'],
          [dropEndX, dropEndY, '#f59e0b'],
        ] as const) {
          ctx.beginPath()
          ctx.arc(markerX, markerY, 4, 0, Math.PI * 2)
          ctx.fillStyle = color
          ctx.fill()
          ctx.lineWidth = 1.5
          ctx.strokeStyle = '#ffffff'
          ctx.stroke()
        }
      }
    }

    // Avions de rappel : ligne et appareil affichés uniquement pendant le survol de la carte.
    const recallsInFlight: Array<{ flight: ReplayRecallFlight; x: number; y: number }> = []
    if (activeLayers.aircraft) {
      for (const recall of recallFlights) {
        const position = aircraftPositionAt(recall, time)
        if (!position) continue
        recallsInFlight.push({ flight: recall, ...position })

        const startX = projectX(recall.start.x)
        const startY = projectY(recall.start.y)
        ctx.beginPath()
        ctx.moveTo(startX, startY)
        ctx.lineTo(projectX(recall.end.x), projectY(recall.end.y))
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)'
        ctx.lineWidth = 1.5
        ctx.setLineDash([8, 6])
        ctx.stroke()
        ctx.setLineDash([])

        ctx.beginPath()
        ctx.moveTo(startX, startY)
        ctx.lineTo(projectX(position.x), projectY(position.y))
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.75)'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }

    if (activeLayers.crates) {
      const crateScale = Math.min(1.6, 0.85 + camera.zoom * 0.12)
      for (const crate of crates) {
        const falling = crate.sp !== null && time >= crate.sp && (crate.t === null || time < crate.t)
        const landed = crate.t !== null && time >= crate.t
        if (!falling && !landed) continue
        drawCrate(
          ctx,
          projectX(crate.x),
          projectY(crate.y),
          crate,
          { falling, looted: landed && crate.lt !== null && time >= crate.lt },
          crateScale,
          crate.k === 'redbox' && camera.zoom >= 3
        )
      }
    }

    const mode = visibilityRef.current

    const isShownInMode = (player: ReplayPlayer) => {
      if (mode === 'all') return true
      if (mode === 'tracked') return player.sq || player.aff >= 1
      if (player.sq) return true
      const contact = squadContactTimes.get(player.i)
      return contact !== undefined && contact <= time
    }

    // Calques persistants hérités de l'ancienne carte tactique : tout ce qui a
    // eu lieu jusqu'à l'instant courant reste affiché, rappels compris.
    if (activeLayers.landings) {
      for (const player of data.players) {
        if (!isShownInMode(player)) continue
        for (const landing of player.lands) {
          if (landing > time) break
          const position = samplePlayerAt(player, landing)
          if (!position) continue
          ctx.beginPath()
          ctx.arc(projectX(position.x), projectY(position.y), 3, 0, Math.PI * 2)
          ctx.fillStyle = player.sq ? colorOf(player) : 'rgba(52, 211, 153, 0.55)'
          ctx.fill()
          ctx.lineWidth = 1
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)'
          ctx.stroke()
        }
      }
    }

    if (activeLayers.deaths) {
      for (const player of data.players) {
        if (!isShownInMode(player)) continue
        for (const [, lifeEnd] of player.l) {
          if (lifeEnd === null || lifeEnd > time) continue
          const position = samplePlayerAt(player, lifeEnd)
          if (!position) continue
          const px = projectX(position.x)
          const py = projectY(position.y)
          const size = player.sq ? 5 : 3.5
          ctx.beginPath()
          ctx.moveTo(px - size, py - size)
          ctx.lineTo(px + size, py + size)
          ctx.moveTo(px + size, py - size)
          ctx.lineTo(px - size, py + size)
          ctx.lineCap = 'round'
          ctx.lineWidth = 4
          ctx.strokeStyle = 'rgba(2, 6, 23, 0.85)'
          ctx.stroke()
          ctx.lineWidth = 2
          ctx.strokeStyle = player.sq ? '#fb7185' : 'rgba(244, 63, 94, 0.75)'
          ctx.stroke()
          ctx.lineCap = 'butt'
        }
      }
    }

    const squadPositions: Array<{ x: number; y: number }> = []

    for (const player of data.players) {
      if (!player.sq) continue
      const position = samplePlayerAt(player, time)
      if (position) squadPositions.push(position)
    }

    // Adversaires « au contact » : seulement ceux qui ont échangé récemment avec l'escouade,
    // pas n'importe quel duel du lobby.
    const engagedIndices = new Set<number>()
    if (mode === 'squad') {
      for (const event of data.events) {
        if (event.t > time || event.t < time - ENGAGEMENT_WINDOW_SECONDS) continue
        if (event.a === null || event.v === null) continue
        const actor = playersByIndex[event.a]
        const victim = playersByIndex[event.v]
        if (!actor || !victim) continue
        if (actor.sq) engagedIndices.add(victim.i)
        if (victim.sq) engagedIndices.add(actor.i)
      }
    }

    const followedIndex = followRef.current
    const drawn: Array<{ player: ReplayPlayer; x: number; y: number; inVehicle: boolean }> = []
    const drawnIndices = new Set<number>()

    for (const player of data.players) {
      const position = samplePlayerAt(player, time)
      if (!position) continue

      if (mode === 'tracked' && !player.sq && player.aff === 0) continue
      if (mode === 'squad' && !player.sq && player.i !== followedIndex) {
        const isEngaged =
          engagedIndices.has(player.i) ||
          squadPositions.some(
            (squadPosition) =>
              Math.hypot(squadPosition.x - position.x, squadPosition.y - position.y) <=
              ENGAGEMENT_RADIUS_UNITS
          )
        if (!isEngaged) continue
      }

      drawn.push({ player, x: position.x, y: position.y, inVehicle: position.v })
      drawnIndices.add(player.i)
    }

    // Traces : escouade en permanence, autres joueurs seulement si suivis. En « trace
    // complète », les membres morts gardent leur trajet. Le tracé est coupé à chaque mort :
    // la vie suivante repart du saut de rappel, sans ligne fantôme depuis le cadavre.
    const trailStart = activeLayers.fullTrail ? -Infinity : time - TRAIL_SECONDS
    for (const player of data.players) {
      if (!player.sq && player.i !== followedIndex) continue
      const isOnMap = drawnIndices.has(player.i)
      if (!isOnMap && !activeLayers.fullTrail) continue

      const track = player.p
      ctx.beginPath()
      let started = false
      let previousT = -Infinity
      for (let offset = 0; offset < track.length; offset += STRIDE) {
        const sampleTime = track[offset]
        if (sampleTime < trailStart) continue
        if (sampleTime > time) break
        const px = projectX(track[offset + 1])
        const py = projectY(track[offset + 2])
        const crossedDeath = player.l.some(
          ([, lifeEnd]) => lifeEnd !== null && previousT <= lifeEnd && sampleTime > lifeEnd
        )
        if (!started || crossedDeath) {
          ctx.moveTo(px, py)
          started = true
        } else {
          ctx.lineTo(px, py)
        }
        previousT = sampleTime
      }
      if (!started) continue

      if (isOnMap) {
        const current = samplePlayerAt(player, time)
        if (current) ctx.lineTo(projectX(current.x), projectY(current.y))
      }
      ctx.strokeStyle =
        player.i === followedIndex
          ? 'rgba(56, 189, 248, 0.75)'
          : player.aff === 2
            ? isOnMap ? 'rgba(16, 185, 129, 0.45)' : 'rgba(16, 185, 129, 0.25)'
            : isOnMap ? 'rgba(45, 212, 191, 0.4)' : 'rgba(45, 212, 191, 0.22)'
      ctx.lineWidth = 1.8
      ctx.stroke()
    }

    const dotRadius = Math.max(3.5, Math.min(9, 3 + camera.zoom * 0.8))

    for (const entry of drawn) {
      const { player } = entry
      const px = projectX(entry.x)
      const py = projectY(entry.y)
      const color = colorOf(player)
      const isFollowed = player.i === followedIndex
      const isDowned = (downedByPlayer.get(player.i) ?? []).some(
        ([downStart, downEnd]) => time >= downStart && time < downEnd
      )

      if (isFollowed) {
        ctx.beginPath()
        ctx.arc(px, py, dotRadius + 6, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)'
        ctx.lineWidth = 2
        ctx.stroke()
      }

      ctx.beginPath()
      ctx.arc(px, py, dotRadius, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.globalAlpha = isDowned ? 0.45 : player.aff === 0 && !player.sq ? 0.75 : 1
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.lineWidth = 1.5
      ctx.strokeStyle = entry.inVehicle ? '#fbbf24' : 'rgba(2, 6, 23, 0.85)'
      ctx.stroke()

      // À terre : anneau ambre pointillé jusqu'à la réanimation ou la mort.
      if (isDowned) {
        ctx.beginPath()
        ctx.arc(px, py, dotRadius + 3.5, 0, Math.PI * 2)
        ctx.strokeStyle = '#fbbf24'
        ctx.lineWidth = 2
        ctx.setLineDash([3, 3])
        ctx.stroke()
        ctx.setLineDash([])
      }

      const showLabel = player.sq || isFollowed || camera.zoom >= 3
      if (showLabel) {
        const baseLabel =
          player.aff === 0 && !player.sq && !isFollowed && camera.zoom < 4 ? `#${player.team}` : player.n
        const label = isDowned && player.sq ? `${baseLabel} (à terre)` : baseLabel
        ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace'
        ctx.textAlign = 'center'
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(2, 6, 23, 0.9)'
        ctx.strokeText(label, px, py - dotRadius - 5)
        ctx.fillStyle = player.aff === 0 && !player.sq ? '#cbd5e1' : color
        ctx.fillText(label, px, py - dotRadius - 5)
      }
    }

    for (const event of data.events) {
      const flashSeconds = flashDuration(event)
      if (event.t > time || event.t < time - flashSeconds) continue
      if (!isEventShownInMode(event, mode)) continue

      const age = (time - event.t) / flashSeconds
      const victim = event.v !== null ? playersByIndex[event.v] : null
      const actor = event.a !== null ? playersByIndex[event.a] : null

      let targetX = event.x
      let targetY = event.y
      if (targetX === null || targetY === null) {
        const victimPosition = victim ? samplePlayerAt(victim, Math.max(0, event.t - 1)) : null
        targetX = victimPosition?.x ?? null
        targetY = victimPosition?.y ?? null
      }
      if (targetX === null || targetY === null) continue

      const px = projectX(targetX)
      const py = projectY(targetY)
      // Pour un rappel, l'acteur est le joueur lui-même : pas de ligne à tracer.
      const actorPosition =
        actor && event.k !== 'recall' ? samplePlayerAt(actor, Math.max(0, event.t - 1)) : null

      const color =
        event.k === 'revive'
          ? '#34d399'
          : event.k === 'recall'
            ? '#38bdf8'
            : event.k === 'knock'
              ? '#fbbf24'
              : '#f43f5e'

      ctx.globalAlpha = Math.max(0, 1 - age)
      ctx.strokeStyle = color

      if (actorPosition) {
        ctx.beginPath()
        ctx.moveTo(projectX(actorPosition.x), projectY(actorPosition.y))
        ctx.lineTo(px, py)
        ctx.lineWidth = event.k === 'revive' ? 2.2 : 1.4
        ctx.stroke()
      }

      ctx.beginPath()
      ctx.arc(px, py, dotRadius + 4 + age * 14, 0, Math.PI * 2)
      ctx.lineWidth = 2
      ctx.stroke()

      if (event.k === 'kill') {
        const size = dotRadius + 2
        ctx.beginPath()
        ctx.moveTo(px - size, py - size)
        ctx.lineTo(px + size, py + size)
        ctx.moveTo(px + size, py - size)
        ctx.lineTo(px - size, py + size)
        ctx.lineWidth = 2.4
        ctx.stroke()
      }

      if (event.k === 'revive' || event.k === 'recall') {
        if (event.k === 'revive') {
          const size = dotRadius + 1
          ctx.beginPath()
          ctx.moveTo(px - size, py)
          ctx.lineTo(px + size, py)
          ctx.moveTo(px, py - size)
          ctx.lineTo(px, py + size)
          ctx.lineWidth = 2.6
          ctx.stroke()
        }
        const tag = event.k === 'revive' ? 'RÉANIMÉ' : 'RAPPEL'
        ctx.font = '800 10px ui-monospace, SFMono-Regular, Menlo, monospace'
        ctx.textAlign = 'center'
        ctx.lineWidth = 3
        ctx.strokeStyle = 'rgba(2, 6, 23, 0.9)'
        ctx.strokeText(tag, px, py + dotRadius + 16)
        ctx.fillStyle = color
        ctx.fillText(tag, px, py + dotRadius + 16)
      }
      ctx.globalAlpha = 1
    }

    // Les avions survolent tout le reste : dessinés en dernier.
    const aircraftScale = Math.min(2, 0.9 + camera.zoom * 0.15)
    if (flight && aircraftPosition) {
      drawAircraft(
        ctx,
        projectX(aircraftPosition.x),
        projectY(aircraftPosition.y),
        Math.atan2(flight.end.y - flight.start.y, flight.end.x - flight.start.x),
        aircraftScale
      )
    }
    for (const recall of recallsInFlight) {
      drawAircraft(
        ctx,
        projectX(recall.x),
        projectY(recall.y),
        Math.atan2(recall.flight.end.y - recall.flight.start.y, recall.flight.end.x - recall.flight.start.x),
        aircraftScale * 0.85,
        RECALL_AIRCRAFT_PALETTE
      )
    }
  }, [
    colorOf,
    crates,
    data.events,
    data.players,
    data.zones,
    downedByPlayer,
    recallFlights,
    flight,
    isEventShownInMode,
    mapHeight,
    mapWidth,
    playersByIndex,
    squadContactTimes,
  ])

  useEffect(() => {
    let frame = 0
    let previous = performance.now()

    function loop(now: number) {
      const deltaSeconds = Math.min(0.25, (now - previous) / 1000)
      previous = now

      if (playingRef.current) {
        const next = timeRef.current + deltaSeconds * speedRef.current
        if (next >= duration) {
          timeRef.current = duration
          playingRef.current = false
          setPlaying(false)
        } else {
          timeRef.current = next
        }
      }

      const rounded = Math.floor(timeRef.current)
      setDisplaySeconds((current) => (current === rounded ? current : rounded))

      if (scrubberRef.current && document.activeElement !== scrubberRef.current) {
        scrubberRef.current.value = String(timeRef.current)
      }

      draw()
      frame = requestAnimationFrame(loop)
    }

    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [draw, duration])

  const applyZoom = useCallback((nextZoom: number, anchor?: { x: number; y: number }) => {
    const canvas = canvasRef.current
    const camera = cameraRef.current
    const bounded = clampMapZoom(nextZoom, MAX_ZOOM)

    if (canvas && anchor) {
      // Conserve le point situé sous le curseur, comme sur les drop zones.
      const baseScale = Math.min(canvas.clientWidth, canvas.clientHeight)
      const offsetX = (anchor.x - canvas.clientWidth / 2) / (baseScale * camera.zoom)
      const offsetY = (anchor.y - canvas.clientHeight / 2) / (baseScale * camera.zoom)
      const worldX = camera.cx + offsetX
      const worldY = camera.cy + offsetY
      camera.cx = worldX - (anchor.x - canvas.clientWidth / 2) / (baseScale * bounded)
      camera.cy = worldY - (anchor.y - canvas.clientHeight / 2) / (baseScale * bounded)
    }

    camera.zoom = bounded
    if (canvas) clampCameraToMap(camera, canvas.clientWidth, canvas.clientHeight)
    setZoom(bounded)
  }, [])

  // Écouteur natif non passif : un `onWheel` React est passif et laisserait la page
  // défiler pendant le zoom. Comme sur les drop zones, la page reprend la main
  // quand le zoom est déjà en butée.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const activeCanvas = canvas

    function handleWheel(event: WheelEvent) {
      const direction = wheelZoomDirection(event.deltaY)
      if (direction === null) return

      const nextZoom = stepMapZoom(cameraRef.current.zoom, direction, MAX_ZOOM)
      if (nextZoom === cameraRef.current.zoom) return

      event.preventDefault()
      const rect = activeCanvas.getBoundingClientRect()
      applyZoom(nextZoom, { x: event.clientX - rect.left, y: event.clientY - rect.top })
    }

    activeCanvas.addEventListener('wheel', handleWheel, { passive: false })
    return () => activeCanvas.removeEventListener('wheel', handleWheel)
  }, [applyZoom])

  const toggleFollow = useCallback((index: number) => {
    const next = followRef.current === index ? null : index
    followRef.current = next
    setFollow(next)
    if (next !== null && cameraRef.current.zoom < FOLLOW_ZOOM) {
      cameraRef.current.zoom = FOLLOW_ZOOM
      setZoom(FOLLOW_ZOOM)
    }
  }, [])

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    if (cameraRef.current.zoom > MIN_ZOOM) setDragging(true)
    event.preventDefault()
  }, [])

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    const canvas = canvasRef.current
    if (!drag || !canvas || drag.pointerId !== event.pointerId) return

    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= DRAG_THRESHOLD_PX) {
      drag.moved = true
    }

    const camera = cameraRef.current
    // À ×1 la carte entière est visible : pas de déplacement, comme sur les drop zones.
    if (drag.moved && camera.zoom > MIN_ZOOM) {
      const baseScale = Math.min(canvas.clientWidth, canvas.clientHeight)
      camera.cx -= (event.clientX - drag.lastX) / (baseScale * camera.zoom)
      camera.cy -= (event.clientY - drag.lastY) / (baseScale * camera.zoom)
      clampCameraToMap(camera, canvas.clientWidth, canvas.clientHeight)

      if (followRef.current !== null) {
        followRef.current = null
        setFollow(null)
      }
    }

    drag.lastX = event.clientX
    drag.lastY = event.clientY
  }, [])

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current
      dragRef.current = null
      setDragging(false)
      const canvas = canvasRef.current
      if (!drag || !canvas || drag.pointerId !== event.pointerId) return

      if (canvas.hasPointerCapture(event.pointerId)) {
        canvas.releasePointerCapture(event.pointerId)
      }

      if (drag.moved) return

      const rect = canvas.getBoundingClientRect()
      const pointerX = event.clientX - rect.left
      const pointerY = event.clientY - rect.top
      const baseScale = Math.min(canvas.clientWidth, canvas.clientHeight)
      const camera = cameraRef.current
      const worldScale = baseScale * camera.zoom
      const originX = canvas.clientWidth / 2 - camera.cx * worldScale
      const originY = canvas.clientHeight / 2 - camera.cy * worldScale

      let closest: { index: number; distance: number } | null = null
      for (const player of data.players) {
        const position = samplePlayerAt(player, timeRef.current)
        if (!position) continue
        const px = originX + (position.x / mapWidth) * worldScale
        const py = originY + (position.y / mapHeight) * worldScale
        const distance = Math.hypot(px - pointerX, py - pointerY)
        if (distance <= 16 && (!closest || distance < closest.distance)) {
          closest = { index: player.i, distance }
        }
      }

      if (closest) toggleFollow(closest.index)
    },
    [data.players, mapHeight, mapWidth, toggleFollow]
  )

  function togglePlay() {
    const next = !playingRef.current
    if (next && timeRef.current >= duration) {
      timeRef.current = 0
    }
    playingRef.current = next
    setPlaying(next)
  }

  function seekTo(value: number) {
    timeRef.current = Math.max(0, Math.min(duration, value))
    setDisplaySeconds(Math.floor(timeRef.current))
  }

  function resetCamera() {
    cameraRef.current = { cx: 0.5, cy: 0.5, zoom: MIN_ZOOM }
    followRef.current = null
    setFollow(null)
    setZoom(MIN_ZOOM)
  }

  function changeVisibility(mode: VisibilityMode) {
    visibilityRef.current = mode
    setVisibility(mode)
  }

  function toggleLayer(layer: keyof ReplayLayers) {
    const next = { ...layersRef.current, [layer]: !layersRef.current[layer] }
    layersRef.current = next
    setLayers(next)
  }

  function changeSpeed(value: number) {
    speedRef.current = value
    setSpeed(value)
  }

  const aliveSquadCount = squadPlayers.filter((player) => !isDeadAt(player, displaySeconds)).length

  const heading = flight ? compassHeadingDeg(flight.angleDeg) : null
  const aircraftInFlight =
    flightTiming !== null && displaySeconds >= flightTiming.startT && displaySeconds <= flightTiming.endT
  const jumpedCount = jumpers.filter((player) => (player.jump ?? Infinity) <= displaySeconds).length
  const currentPhase = zoneAtCurrentTime ? Math.floor(zoneAtCurrentTime.g) : 0
  const activeRecall = recallFlights.find(
    (recall) => displaySeconds >= recall.timing.startT && displaySeconds <= recall.timing.endT
  )
  const activeRecallHeading = activeRecall ? compassHeadingDeg(activeRecall.angleDeg) : null
  const landedCrates = crates.filter((crate) => crate.t !== null && crate.t <= displaySeconds)

  const layerToggles: Array<{
    key: keyof ReplayLayers
    label: string
    icon: React.ReactNode
    hidden?: boolean
    disabledReason?: string
  }> = [
    {
      key: 'aircraft',
      label: recallFlights.length > 0 ? `C-130 & rappels` : 'C-130',
      icon: <Plane className="w-3.5 h-3.5" />,
      hidden: !flight && recallFlights.length === 0,
    },
    { key: 'fullTrail', label: 'Trace complète', icon: <Route className="w-3.5 h-3.5" /> },
    { key: 'landings', label: 'Atterrissages', icon: <PlaneLanding className="w-3.5 h-3.5" /> },
    { key: 'deaths', label: 'Éliminations', icon: <Skull className="w-3.5 h-3.5" /> },
    {
      key: 'crates',
      label: crates.length > 0 ? `Largages (${crates.length})` : 'Largages',
      icon: <Package className="w-3.5 h-3.5" />,
      disabledReason:
        crates.length === 0
          ? "Caisses non capturées pour ce match : analysé avant le 13/09/2026, relancez la synchronisation télémétrie (matchs de moins de 14 jours)."
          : undefined,
    },
  ]

  return (
    <div className={`flex flex-col gap-3 ${className}`} ref={containerRef}>
      {/* --- Barre de transport --- */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
        <button
          type="button"
          onClick={togglePlay}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 hover:bg-amber-500/30 text-sm font-bold transition-colors"
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {playing ? 'Pause' : 'Lecture'}
        </button>

        <div className="font-mono text-lg font-black text-white tabular-nums">
          {formatClock(displaySeconds)}
          <span className="ml-1 text-xs font-semibold text-slate-400">/ {formatClock(duration)}</span>
        </div>

        <input
          ref={scrubberRef}
          type="range"
          min={0}
          max={duration}
          step={0.1}
          defaultValue={0}
          onChange={(event) => seekTo(Number(event.target.value))}
          className="flex-1 min-w-[180px] accent-amber-500"
          aria-label="Position dans le match"
        />

        <div className="inline-flex items-center rounded-lg p-0.5 bg-slate-950 border border-slate-800">
          <Gauge className="w-3.5 h-3.5 mx-1.5 text-slate-400" />
          {SPEEDS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => changeSpeed(value)}
              className={`px-2 py-1 rounded-md text-xs font-mono font-bold transition-colors ${
                speed === value ? 'bg-amber-500/20 text-amber-300' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              ×{value}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => seekTo(0)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Début
        </button>
      </div>

      {/* --- Filtres de visibilité --- */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
        <div className="inline-flex rounded-lg p-0.5 bg-slate-950 border border-slate-800 text-xs sm:text-sm">
          <button
            type="button"
            onClick={() => changeVisibility('squad')}
            className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
              visibility === 'squad'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'text-slate-400 hover:text-slate-200'
            }`}
            title="Escouade du clan et adversaires au contact direct"
          >
            Escouade {data.match.clanTag ? `[${data.match.clanTag}]` : ''}
          </button>
          {hasTrackedClans && (
            <button
              type="button"
              onClick={() => changeVisibility('tracked')}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                visibility === 'tracked'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title={`Clans suivis présents : ${data.match.trackedClanTags.join(', ')}`}
            >
              Clans suivis
            </button>
          )}
          <button
            type="button"
            onClick={() => changeVisibility('all')}
            className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
              visibility === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Global ({data.match.totalPlayers})
          </button>
        </div>

        <div className="flex items-center gap-3 text-xs font-semibold text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-emerald-400" />
            {aliveSquadCount}/{squadPlayers.length} en vie
          </span>
          {zoneAtCurrentTime && (
            <>
              <span className="text-slate-600">•</span>
              <span className="font-mono">Phase {Math.max(1, currentPhase)}</span>
              <span className="text-slate-600">•</span>
              <span className="font-mono">
                {zoneAtCurrentTime.alive} joueurs · {zoneAtCurrentTime.teams} équipes
              </span>
            </>
          )}
        </div>
      </div>

      {/* --- Calques & accès rapide aux phases --- */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-bold uppercase tracking-wider text-slate-400">Calques</span>
          {layerToggles
            .filter((toggle) => !toggle.hidden)
            .map((toggle) => (
              <button
                key={toggle.key}
                type="button"
                aria-pressed={toggle.disabledReason ? false : layers[toggle.key]}
                disabled={Boolean(toggle.disabledReason)}
                title={toggle.disabledReason}
                onClick={() => toggleLayer(toggle.key)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  layers[toggle.key] && !toggle.disabledReason
                    ? 'bg-sky-500/15 border-sky-500/40 text-sky-200'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {toggle.icon}
                {toggle.label}
              </button>
            ))}
        </div>

        {(phaseStarts.length > 0 || flightTiming || recallFlights.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs font-bold uppercase tracking-wider text-slate-400">Aller à</span>
            {flightTiming && (
              <button
                type="button"
                onClick={() => seekTo(Math.max(0, Math.floor(flightTiming.startT)))}
                className={`px-2.5 py-1 rounded-md border text-xs font-bold transition-colors ${
                  aircraftInFlight
                    ? 'bg-sky-500/15 border-sky-500/40 text-sky-200'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white'
                }`}
                title="Passage de l'avion au-dessus de la carte"
              >
                Largage
              </button>
            )}
            {recallFlights.map((recall, index) => (
              <button
                key={`recall-${recall.timing.startT}`}
                type="button"
                onClick={() => seekTo(Math.max(0, Math.floor(recall.timing.startT)))}
                className={`px-2 py-1 rounded-md border text-xs font-mono font-bold transition-colors ${
                  activeRecall === recall
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-200'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white'
                }`}
                title={`Avion de rappel n°${index + 1} — survol ${formatClock(recall.timing.startT)} → ${formatClock(recall.timing.endT)}, ${recall.riders} joueur(s) rappelé(s)`}
              >
                R{index + 1}
              </button>
            ))}
            {phaseStarts.map(({ phase, t }) => (
              <button
                key={phase}
                type="button"
                onClick={() => seekTo(t)}
                className={`px-2 py-1 rounded-md border text-xs font-mono font-bold transition-colors ${
                  currentPhase === phase
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white'
                }`}
                title={`Début de la phase ${phase} (${formatClock(t)})`}
              >
                P{phase}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* --- Canevas --- */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => {
            dragRef.current = null
            setDragging(false)
          }}
          className={`w-full aspect-square rounded-2xl border-2 border-slate-800 bg-slate-950 shadow-2xl touch-none select-none ${
            zoom > MIN_ZOOM ? (dragging ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-crosshair'
          }`}
        />

        <div className="absolute left-3 top-3 z-30 flex max-w-[calc(100%-12rem)] flex-col items-start gap-2">
          {flight && heading !== null && layers.aircraft && (
            <div className="inline-flex h-10 items-center gap-2 rounded border border-white/25 bg-slate-950/80 px-3 text-xs font-semibold text-white shadow-lg backdrop-blur">
              {/* L'icône Lucide pointe nativement au nord-est (45°). */}
              <Plane
                className="h-4 w-4 shrink-0 text-sky-300"
                style={{ transform: `rotate(${heading - 45}deg)` }}
                aria-hidden="true"
              />
              <span className="font-mono tabular-nums whitespace-nowrap">
                Cap C-130 : {String(heading).padStart(3, '0')}° {compassCardinal(heading)}
              </span>
              {flight.source === 'landings' ? (
                <span
                  className="whitespace-nowrap rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200"
                  title="Cet axe est déduit des points d’atterrissage : l’appareil n’a pas été suivi directement."
                >
                  axe estimé
                </span>
              ) : null}
              {aircraftInFlight && jumpers.length > 0 && (
                <span className="hidden sm:inline font-mono tabular-nums text-slate-400 whitespace-nowrap">
                  · {jumpedCount}/{jumpers.length} sautés
                </span>
              )}
            </div>
          )}

          {activeRecall && activeRecallHeading !== null && layers.aircraft && (
            <div className="inline-flex h-10 items-center gap-2 rounded border border-amber-400/40 bg-slate-950/80 px-3 text-xs font-semibold text-amber-100 shadow-lg backdrop-blur">
              <Plane
                className="h-4 w-4 shrink-0 text-amber-300"
                style={{ transform: `rotate(${activeRecallHeading - 45}deg)` }}
                aria-hidden="true"
              />
              <span className="font-mono tabular-nums whitespace-nowrap">
                Avion de rappel : {String(activeRecallHeading).padStart(3, '0')}° {compassCardinal(activeRecallHeading)}
              </span>
              <span className="hidden sm:inline font-mono tabular-nums text-amber-200/70 whitespace-nowrap">
                · {activeRecall.riders} rappelé{activeRecall.riders > 1 ? 's' : ''}
              </span>
            </div>
          )}

          {layers.crates && landedCrates.length > 0 && (
            <div className="hidden sm:inline-flex h-8 items-center gap-2 rounded border border-white/15 bg-slate-950/70 px-2.5 text-[11px] font-semibold text-slate-300 backdrop-blur">
              <Package className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" />
              <span className="font-mono tabular-nums whitespace-nowrap">{crateSummaryLabel(landedCrates, displaySeconds)}</span>
            </div>
          )}

          {mapUnavailable && (
            <div className="px-3 py-1.5 rounded-lg bg-rose-950/80 border border-rose-800 text-xs font-semibold text-rose-300">
              Fond de carte indisponible pour « {data.match.mapName} » — grille de repli affichée
            </div>
          )}
        </div>

        <MapZoomControl zoom={zoom} max={MAX_ZOOM} onZoomChange={(next) => applyZoom(next)} onReset={resetCamera} />

        {/* Journal de combat flottant */}
        {killFeed.length > 0 && (
          <div className="absolute left-3 bottom-3 flex flex-col gap-1 max-w-[70%]">
            {killFeed.map((event) => {
              const actor = event.a !== null ? playersByIndex[event.a] : null
              const victim = event.v !== null ? playersByIndex[event.v] : null
              return (
                <div
                  key={event.id}
                  className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-950/85 border border-slate-800 text-[11px] font-semibold text-slate-200 backdrop-blur-sm"
                >
                  <span className="font-mono text-slate-500">{formatClock(event.t)}</span>
                  {event.k === 'kill' && <Skull className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                  {event.k === 'knock' && (
                    <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  )}
                  {event.k === 'revive' && (
                    <HeartHandshake className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  )}
                  {event.k === 'recall' && <Plane className="w-3.5 h-3.5 text-sky-400 shrink-0" />}

                  {event.k === 'recall' ? (
                    <>
                      <span style={{ color: actor ? colorOf(actor) : '#94a3b8' }}>{actor?.n ?? '—'}</span>
                      <span className="text-sky-300">revient par rappel</span>
                    </>
                  ) : event.k === 'kill' && !actor ? (
                    <>
                      <span style={{ color: victim ? colorOf(victim) : '#94a3b8' }}>{victim?.n ?? '—'}</span>
                      <span className="text-rose-300">éliminé</span>
                    </>
                  ) : (
                    <>
                      <span style={{ color: actor ? colorOf(actor) : '#94a3b8' }}>{actor?.n ?? '—'}</span>
                      <span className={event.k === 'revive' ? 'text-emerald-300' : 'text-slate-500'}>
                        {event.k === 'revive' ? 'réanime' : '→'}
                      </span>
                      <span style={{ color: victim ? colorOf(victim) : '#94a3b8' }}>{victim?.n ?? '—'}</span>
                    </>
                  )}
                  {event.w && <span className="text-slate-400 font-mono">{weaponLabel(event.w)}</span>}
                  {event.dist !== null && event.dist > 0 && (
                    <span className="text-slate-500 font-mono">{event.dist} m</span>
                  )}
                  {event.hs && <Target className="w-3 h-3 text-rose-300" />}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* --- Roster de l'escouade avec suivi caméra --- */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl bg-slate-900/60 border border-slate-800">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
          <Focus className="w-3.5 h-3.5 text-cyan-400" /> Suivi caméra
        </span>
        {squadPlayers.map((player) => {
          const isDead = isDeadAt(player, displaySeconds)
          return (
            <button
              key={player.key}
              type="button"
              onClick={() => toggleFollow(player.i)}
              title={
                player.aff === 2
                  ? `${player.n} — membre ${data.match.clanTag ? `[${data.match.clanTag}]` : 'du clan'}`
                  : `${player.n} — coéquipier${player.t ? ` [${player.t}]` : ''}, hors clan`
              }
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                follow === player.i
                  ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-200'
                  : 'bg-slate-950 border-slate-800 hover:text-white'
              } ${isDead ? 'opacity-50' : ''}`}
              style={follow === player.i ? undefined : { color: colorOf(player) }}
            >
              {isDead ? <Skull className="w-3.5 h-3.5" /> : <Crosshair className="w-3.5 h-3.5" />}
              {player.n}
            </button>
          )
        })}
        {follow !== null && (
          <button
            type="button"
            onClick={resetCamera}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
          >
            Libérer la caméra
          </button>
        )}
      </div>
    </div>
  )
}

export default MatchReplay2D
