/**
 * Construit le payload compact consommé par le lecteur de replay 2D.
 *
 * Le stockage télémétrie mélange deux bases de temps : `positionSamples` et
 * `phaseSnapshots` sont relatifs au début du match, tandis que
 * `landingSamples`, `deathSamples`, `knockoutSamples`, `reviveSamples` et
 * `KillEvent` portent un epoch absolu. Tout est ramené ici à une seconde
 * relative unique pour que le lecteur n'ait plus aucune conversion à faire.
 */

import type { CarePackageType, TelemetryCarePackage } from './care-packages'
import { computeRecallFlights, type FlightTiming, type RecallFlight } from './flight-path'

/** 0 = lobby externe, 1 = autre clan suivi, 2 = clan consulté. */
export type ReplayAffiliation = 0 | 1 | 2

export type ReplayIdentity = {
  name: string
  clanTag: string | null
  clanId: number | null
}

/** Une vie sur la carte : `[début, fin]`, fin `null` si le joueur est encore en vie à la fin du match. */
export type ReplayLife = [number, number | null]

export type ReplayPlayer = {
  /** Index stable, utilisé comme référence compacte dans les événements. */
  i: number
  key: string
  n: string
  t: string | null
  team: number
  aff: ReplayAffiliation
  /**
   * Membre de l'escouade consultée : joueur du clan, ou coéquipier de la même équipe
   * même s'il n'appartient à aucun clan suivi.
   */
  sq: boolean
  bot: boolean
  /**
   * Piste aplatie `[t, x, y, inVehicle, ...]` — 4 entrées par échantillon. Ne contient
   * que des points situés dans une vie : les positions du cadavre et de l'attente d'un
   * rappel sont écartées.
   */
  p: number[]
  /**
   * Vies successives. Un rappel (retour en avion après la mort) ouvre une nouvelle vie
   * qui démarre au saut, comme la première.
   */
  l: ReplayLife[]
  /** Seconde relative de la mort définitive, `null` si le joueur a survécu jusqu'à la fin. */
  d: number | null
  /** Seconde relative du premier atterrissage en parachute. */
  land: number | null
  /** Tous les atterrissages, rappels compris. */
  lands: number[]
  /** Seconde relative du saut initial hors de l'avion. */
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

/**
 * `kill` sans acteur (`a = null`) : mort relevée dans `deathSamples` pour laquelle
 * aucun `KillEvent` n'existe — ces derniers ne sont persistés que pour le clan suivi.
 * `recall` : retour en jeu par l'avion de rappel, positionné au saut (`a` = joueur).
 */
export type ReplayEventKind = 'kill' | 'knock' | 'revive' | 'recall'

export type ReplayEvent = {
  id: string
  k: ReplayEventKind
  t: number
  a: number | null
  v: number | null
  x: number | null
  y: number | null
  w: string | null
  dist: number | null
  hs: boolean
}

/** Caisse de largage, temps en secondes relatives. */
export type ReplayCrate = {
  k: CarePackageType
  /** Largage (caisse en l'air). */
  sp: number | null
  /** Atterrissage. */
  t: number | null
  x: number
  y: number
  items: string[]
  /** Premier pillage, toutes équipes confondues. */
  lt: number | null
  /** Pillée par l'escouade consultée. */
  sq: boolean
  /** Équipes ayant pillé la caisse : permet de recalculer `sq` pour une autre escouade côté client. */
  lteams: number[]
}

export type MatchReplayPayload = {
  match: {
    squadMatchId: string
    pubgMatchId: string
    mapName: string
    mapAssetKey: string | null
    mapLabel: string
    mapWidth: number
    mapHeight: number
    gameMode: string
    placement: number
    createdAt: string
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
    /** `jumps` : positions réelles de l'appareil. `landings` : axe approché depuis les atterrissages. */
    source: 'jumps' | 'landings'
    start: { x: number; y: number }
    end: { x: number; y: number }
    dropStart: { x: number; y: number } | null
    dropEnd: { x: number; y: number } | null
    angleDeg: number
    /** Horaires de survol, `null` quand le plan de vol vient du repli sur les atterrissages. */
    timing: FlightTiming | null
  } | null
  /** Avions de rappel, chacun visible seulement pendant son survol de la carte. */
  recallFlights: RecallFlight[]
  /** Vide pour les matchs parsés avant l'extraction des caisses (2026-09-13). */
  crates: ReplayCrate[]
}

type SampleRow = {
  memberKey?: unknown
  teamId?: unknown
  phase?: unknown
  timestampSeconds?: unknown
  x?: unknown
  y?: unknown
  inVehicle?: unknown
  role?: unknown
  action?: unknown
  vehicleType?: unknown
  damageCauser?: unknown
  damageReason?: unknown
}

/**
 * Au-delà de cette fenêtre après le premier saut, un départ d'aéronef provient de
 * l'avion de rappel de fin de partie et non du largage initial.
 */
const INITIAL_DROP_WINDOW_SECONDS = 120

/** Écart toléré entre une mort de `deathSamples` et le `KillEvent` correspondant. */
const DEATH_KILL_MATCH_SECONDS = 2

function isAircraftLeave(row: SampleRow) {
  if (row.action !== 'leave') return false
  const vehicleType = typeof row.vehicleType === 'string' ? row.vehicleType : ''
  return /aircraft|plane/i.test(vehicleType)
}

type PhaseSnapshotRow = {
  isGame?: unknown
  timestampSeconds?: unknown
  numAlivePlayers?: unknown
  numAliveTeams?: unknown
  safetyZoneRadiusMeters?: unknown
  poisonGasWarningRadiusMeters?: unknown
  safetyZoneX?: unknown
  safetyZoneY?: unknown
  poisonGasWarningX?: unknown
  poisonGasWarningY?: unknown
}

export type ReplayKillEventInput = {
  id: string
  killerAccountId: string | null
  killerRawKey: string | null
  victimAccountId: string | null
  victimRawKey: string | null
  weaponName: string | null
  distance: number | null
  headshot: boolean
  timestampSeconds: number | null
}

/** Au-delà de ce seuil, la valeur est un epoch absolu et non une seconde de match. */
const EPOCH_THRESHOLD_SECONDS = 1_000_000

export function normalizeReplayKey(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  return trimmed.length > 0 ? trimmed : null
}

export function isBotKey(key: string) {
  return key.startsWith('ai.')
}

/**
 * Rassemble les identifiants de compte présents dans le lobby, toutes couches
 * télémétriques confondues, pour borner les requêtes de résolution d'identité.
 * Les bots sont exclus : ils n'existent dans aucune table d'identité.
 */
export function collectLobbyAccountIds(...sources: unknown[]): string[] {
  const keys = new Set<string>()

  for (const source of sources) {
    let rows = source
    if (typeof rows === 'string') {
      try {
        rows = JSON.parse(rows)
      } catch {
        continue
      }
    }
    if (!Array.isArray(rows)) continue

    for (const row of rows) {
      if (!row || typeof row !== 'object') continue
      const key = normalizeReplayKey((row as Record<string, unknown>).memberKey)
      if (key && !isBotKey(key)) keys.add(key)
    }
  }

  return Array.from(keys)
}

export function toRelativeSeconds(value: unknown, matchStartEpochSeconds: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const relative = value > EPOCH_THRESHOLD_SECONDS ? value - matchStartEpochSeconds : value
  if (!Number.isFinite(relative)) return null
  return Math.max(0, Math.round(relative))
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseArray(value: unknown): SampleRow[] {
  if (Array.isArray(value)) return value as SampleRow[]
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value)
      return Array.isArray(parsed) ? (parsed as SampleRow[]) : []
    } catch {
      return []
    }
  }
  return []
}

/** Regroupe des échantillons appariés (knocker/victim, reviver/revived) par horodatage. */
function pairByTimestamp(rows: SampleRow[], actorRole: string, targetRole: string) {
  const pairs = new Map<number, { actor?: SampleRow; target?: SampleRow }>()

  for (const row of rows) {
    const ts = asFiniteNumber(row.timestampSeconds)
    if (ts === null) continue
    const entry = pairs.get(ts) ?? {}
    if (row.role === actorRole) entry.actor = row
    else if (row.role === targetRole) entry.target = row
    pairs.set(ts, entry)
  }

  return pairs
}

/**
 * Instant et lieu exacts où chaque joueur quitte l'avion de largage.
 *
 * Indispensable : les échantillons `LogPlayerPosition` émis avant le saut
 * correspondent au spawn / à l'île d'attente et se situent à plusieurs
 * kilomètres de l'appareil. Les interpoler produirait de longues trajectoires
 * fantômes en début de partie.
 */
export function extractInitialJumps(
  vehicleSamples: unknown,
  matchStartEpochSeconds: number
): Map<string, { t: number; x: number; y: number }> {
  const jumps = new Map<string, { t: number; x: number; y: number }>()

  const rows = parseArray(vehicleSamples).filter(isAircraftLeave)

  const timed = rows
    .map((row) => ({
      key: normalizeReplayKey(row.memberKey),
      t: toRelativeSeconds(row.timestampSeconds, matchStartEpochSeconds),
      x: asFiniteNumber(row.x),
      y: asFiniteNumber(row.y),
    }))
    .filter(
      (row): row is { key: string; t: number; x: number; y: number } =>
        row.key !== null && row.t !== null && row.x !== null && row.y !== null
    )
    .sort((left, right) => left.t - right.t)

  if (timed.length === 0) return jumps

  const windowEnd = timed[0].t + INITIAL_DROP_WINDOW_SECONDS

  for (const row of timed) {
    if (row.t > windowEnd) break
    if (!jumps.has(row.key)) {
      jumps.set(row.key, { t: row.t, x: Math.round(row.x), y: Math.round(row.y) })
    }
  }

  return jumps
}

type TimedPoint = { t: number; x: number | null; y: number | null }

/**
 * Découpe la présence d'un joueur en vies successives.
 *
 * Une vie s'achève à une mort ; la suivante ne commence qu'au **saut** d'un avion
 * postérieur à cette mort (rappel). Entre les deux, la télémétrie continue d'émettre
 * des positions — le cadavre immobile, puis l'avion de rappel — qui ne doivent
 * surtout pas être interpolées. Une mort sans saut ultérieur est définitive.
 */
export function computeReplayLives(
  start: number,
  deaths: TimedPoint[],
  aircraftLeaves: TimedPoint[]
): { lives: ReplayLife[]; endingDeaths: TimedPoint[]; respawns: TimedPoint[] } {
  const lives: ReplayLife[] = []
  const endingDeaths: TimedPoint[] = []
  const respawns: TimedPoint[] = []
  const sortedDeaths = [...deaths].sort((left, right) => left.t - right.t)
  const sortedLeaves = [...aircraftLeaves].sort((left, right) => left.t - right.t)

  let cursor: number | null = start
  for (const death of sortedDeaths) {
    if (cursor === null) break
    // Doublon ou mort antérieure au début de la vie courante.
    if (death.t < cursor) continue

    lives.push([cursor, death.t])
    endingDeaths.push(death)

    const respawn = sortedLeaves.find((leave) => leave.t > death.t)
    if (!respawn) {
      cursor = null
      break
    }
    respawns.push(respawn)
    cursor = respawn.t
  }

  if (cursor !== null) lives.push([cursor, null])

  return { lives, endingDeaths, respawns }
}

/**
 * Retours en jeu par l'avion de rappel, pour les vues qui n'ont pas besoin des pistes
 * complètes (journal de combat). Même règle que le replay : un saut d'avion postérieur
 * à une mort rouvre une vie.
 */
export function extractRespawnEvents(
  deathSamples: unknown,
  vehicleSamples: unknown,
  matchStartEpochSeconds: number
): Array<{ key: string; t: number; x: number | null; y: number | null }> {
  const deathsByKey = new Map<string, TimedPoint[]>()
  for (const row of parseArray(deathSamples)) {
    const key = normalizeReplayKey(row.memberKey)
    const t = toRelativeSeconds(row.timestampSeconds, matchStartEpochSeconds)
    if (!key || t === null) continue
    deathsByKey.set(key, [...(deathsByKey.get(key) ?? []), { t, x: asFiniteNumber(row.x), y: asFiniteNumber(row.y) }])
  }

  const leavesByKey = new Map<string, TimedPoint[]>()
  for (const row of parseArray(vehicleSamples)) {
    if (!isAircraftLeave(row)) continue
    const key = normalizeReplayKey(row.memberKey)
    const t = toRelativeSeconds(row.timestampSeconds, matchStartEpochSeconds)
    if (!key || t === null) continue
    leavesByKey.set(key, [...(leavesByKey.get(key) ?? []), { t, x: asFiniteNumber(row.x), y: asFiniteNumber(row.y) }])
  }

  const respawnEvents: Array<{ key: string; t: number; x: number | null; y: number | null }> = []
  for (const [key, deaths] of deathsByKey) {
    const { respawns } = computeReplayLives(0, deaths, leavesByKey.get(key) ?? [])
    for (const respawn of respawns) respawnEvents.push({ key, ...respawn })
  }
  return respawnEvents.sort((left, right) => left.t - right.t)
}

function isInsideLives(lives: ReplayLife[], t: number) {
  return lives.some(([start, end]) => t >= start && (end === null || t <= end))
}

/** Seconde relative sans arrondi : indispensable pour mesurer un vol de quelques secondes. */
function toPreciseRelativeSeconds(value: unknown, matchStartEpochSeconds: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value > EPOCH_THRESHOLD_SECONDS ? value - matchStartEpochSeconds : value
}

/**
 * Embarquements et sauts des avions de rappel : tout mouvement d'aéronef postérieur à la
 * fenêtre du largage initial.
 */
export function extractRecallAircraftPoints(
  vehicleSamples: unknown,
  matchStartEpochSeconds: number,
  initialJumps: Map<string, { t: number }>
) {
  const firstInitialJump = Math.min(...Array.from(initialJumps.values()).map((jump) => jump.t))
  const windowEnd = Number.isFinite(firstInitialJump)
    ? firstInitialJump + INITIAL_DROP_WINDOW_SECONDS
    : INITIAL_DROP_WINDOW_SECONDS

  const points: Array<{ t: number; x: number; y: number; key: string; action: 'ride' | 'leave' }> = []
  for (const row of parseArray(vehicleSamples)) {
    if (row.action !== 'ride' && row.action !== 'leave') continue
    const vehicleType = typeof row.vehicleType === 'string' ? row.vehicleType : ''
    if (!/aircraft|plane/i.test(vehicleType)) continue
    const t = toPreciseRelativeSeconds(row.timestampSeconds, matchStartEpochSeconds)
    const x = asFiniteNumber(row.x)
    const y = asFiniteNumber(row.y)
    const key = normalizeReplayKey(row.memberKey)
    if (t === null || x === null || y === null || !key || t <= windowEnd) continue
    points.push({ t, x, y, key, action: row.action })
  }
  return points
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/**
 * Caisses de largage : colonne `carePackageSamples` (2026-09-14). Repli sur
 * `summary.carePackages`, emplacement provisoire des matchs re-parsés le 2026-09-13.
 */
function readCarePackages(carePackageSamples: unknown, summary: unknown): TelemetryCarePackage[] {
  const column = parseJsonValue(carePackageSamples)
  if (Array.isArray(column)) return column as TelemetryCarePackage[]
  const legacy = parseJsonValue(summary)
  const crates = legacy && typeof legacy === 'object' ? (legacy as { carePackages?: unknown }).carePackages : null
  return Array.isArray(crates) ? (crates as TelemetryCarePackage[]) : []
}

/**
 * Complète les `KillEvent` (frags des seuls clans ayant synchronisé le match) par le
 * kill-feed complet de la télémétrie. Un frag déjà connu — même victime à 2 s près —
 * n'est pas dupliqué : la ligne `KillEvent` fait foi.
 */
export function mergeKillFeedWithKillEvents(
  killEvents: ReplayKillEventInput[],
  killFeedSamples: unknown,
  matchStartEpochSeconds: number
): ReplayKillEventInput[] {
  const feed = parseJsonValue(killFeedSamples)
  if (!Array.isArray(feed)) return killEvents

  const knownVictimTimes = new Map<string, number[]>()
  for (const kill of killEvents) {
    const victim = normalizeReplayKey(kill.victimAccountId) ?? normalizeReplayKey(kill.victimRawKey)
    const t = toPreciseRelativeSeconds(kill.timestampSeconds, matchStartEpochSeconds)
    if (!victim || t === null) continue
    knownVictimTimes.set(victim, [...(knownVictimTimes.get(victim) ?? []), t])
  }

  const merged = [...killEvents]
  feed.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return
    const sample = raw as Record<string, unknown>
    const killerKey = typeof sample.killerKey === 'string' ? sample.killerKey : null
    const victimKey = typeof sample.victimKey === 'string' ? sample.victimKey : null
    const victim = normalizeReplayKey(victimKey)
    const t = toPreciseRelativeSeconds(sample.timestampSeconds, matchStartEpochSeconds)
    if (!victim || t === null) return

    const alreadyKnown = (knownVictimTimes.get(victim) ?? []).some(
      (knownT) => Math.abs(knownT - t) <= DEATH_KILL_MATCH_SECONDS
    )
    if (alreadyKnown) return

    merged.push({
      id: `feed-${index}`,
      killerAccountId: killerKey,
      killerRawKey: killerKey,
      victimAccountId: victimKey,
      victimRawKey: victimKey,
      weaponName: typeof sample.weaponName === 'string' ? sample.weaponName : null,
      distance: asFiniteNumber(sample.distance),
      headshot: sample.headshot === true,
      timestampSeconds: asFiniteNumber(sample.timestampSeconds),
    })
  })

  return merged
}

export function buildMatchReplayPayload(input: {
  match: {
    squadMatchId: string
    pubgMatchId: string
    mapName: string
    mapAssetKey: string | null
    mapLabel: string
    mapWidth: number
    mapHeight: number
    gameMode: string
    placement: number
    createdAt: Date
  }
  matchStartEpochSeconds: number
  /** Clan consulté ; `null` en vue tournoi, où l'escouade est choisie côté client. */
  currentClanId: number | null
  currentClanTag: string | null
  identities: Map<string, ReplayIdentity>
  positionSamples: unknown
  deathSamples: unknown
  landingSamples: unknown
  knockoutSamples: unknown
  reviveSamples: unknown
  phaseSnapshots: unknown
  vehicleSamples: unknown
  /** Colonne `carePackageSamples` (2026-09-14). Optionnelle. */
  carePackageSamples?: unknown
  /** Colonne `summary` : repli pour les caisses des matchs re-parsés le 2026-09-13. Optionnelle. */
  summary?: unknown
  /** Colonne `killFeedSamples` (2026-09-14) : complète `killEvents` pour tout le lobby. Optionnelle. */
  killFeedSamples?: unknown
  killEvents: ReplayKillEventInput[]
  flightPath: MatchReplayPayload['flightPath']
}): MatchReplayPayload {
  const {
    match,
    matchStartEpochSeconds,
    currentClanId,
    currentClanTag,
    identities,
    killEvents,
    flightPath,
  } = input

  const positions = parseArray(input.positionSamples)
  const deaths = parseArray(input.deathSamples)
  const landings = parseArray(input.landingSamples)
  const knockouts = parseArray(input.knockoutSamples)
  const revives = parseArray(input.reviveSamples)
  const phases = parseArray(input.phaseSnapshots) as PhaseSnapshotRow[]
  const jumps = extractInitialJumps(input.vehicleSamples, matchStartEpochSeconds)

  type Sample = { t: number; x: number; y: number; v: number }

  type Accum = {
    key: string
    team: number
    samples: Sample[]
    deaths: TimedPoint[]
    aircraftLeaves: TimedPoint[]
    lands: number[]
    jump: { t: number; x: number; y: number } | null
  }

  const accumulators = new Map<string, Accum>()

  function getAccum(key: string, teamId: number | null): Accum {
    const existing = accumulators.get(key)
    if (existing) {
      if (existing.team === 0 && teamId) existing.team = teamId
      return existing
    }
    const created: Accum = {
      key,
      team: teamId ?? 0,
      samples: [],
      deaths: [],
      aircraftLeaves: [],
      lands: [],
      jump: jumps.get(key) ?? null,
    }
    accumulators.set(key, created)
    return created
  }

  let durationSeconds = 0

  for (const row of positions) {
    const key = normalizeReplayKey(row.memberKey)
    const x = asFiniteNumber(row.x)
    const y = asFiniteNumber(row.y)
    const t = toRelativeSeconds(row.timestampSeconds, matchStartEpochSeconds)
    if (!key || x === null || y === null || t === null) continue

    // Le tri par vie se fait plus bas : avant le saut, la position est celle du spawn,
    // et entre une mort et un rappel, celle du cadavre puis de l'avion.
    getAccum(key, asFiniteNumber(row.teamId)).samples.push({
      t,
      x: Math.round(x),
      y: Math.round(y),
      v: row.inVehicle === true ? 1 : 0,
    })
    if (t > durationSeconds) durationSeconds = t
  }

  for (const row of deaths) {
    const key = normalizeReplayKey(row.memberKey)
    const t = toRelativeSeconds(row.timestampSeconds, matchStartEpochSeconds)
    if (!key || t === null) continue
    getAccum(key, asFiniteNumber(row.teamId)).deaths.push({
      t,
      x: asFiniteNumber(row.x),
      y: asFiniteNumber(row.y),
    })
    if (t > durationSeconds) durationSeconds = t
  }

  for (const row of landings) {
    const key = normalizeReplayKey(row.memberKey)
    const t = toRelativeSeconds(row.timestampSeconds, matchStartEpochSeconds)
    if (!key || t === null) continue
    const accum = getAccum(key, asFiniteNumber(row.teamId))
    accum.lands.push(t)

    const x = asFiniteNumber(row.x)
    const y = asFiniteNumber(row.y)
    // L'atterrissage précède souvent le premier échantillon de position : il sert
    // alors de point d'ancrage pour que le joueur ne surgisse pas du néant.
    if (x !== null && y !== null) {
      accum.samples.push({ t, x: Math.round(x), y: Math.round(y), v: 0 })
    }
  }

  for (const row of parseArray(input.vehicleSamples)) {
    if (!isAircraftLeave(row)) continue
    const key = normalizeReplayKey(row.memberKey)
    const t = toRelativeSeconds(row.timestampSeconds, matchStartEpochSeconds)
    // Un saut ne crée pas de joueur à lui seul : il n'a de sens qu'avec une piste.
    if (!key || t === null || !accumulators.has(key)) continue
    accumulators.get(key)!.aircraftLeaves.push({
      t,
      x: asFiniteNumber(row.x),
      y: asFiniteNumber(row.y),
    })
  }

  const players: ReplayPlayer[] = []
  const lifeAnchors = new Map<string, { endingDeaths: TimedPoint[]; respawns: TimedPoint[] }>()
  const firstJumpT = jumps.size > 0 ? Math.min(...Array.from(jumps.values()).map((jump) => jump.t)) : null

  for (const accum of accumulators.values()) {
    const anchors: Sample[] = []
    if (accum.jump) anchors.push({ t: accum.jump.t, x: accum.jump.x, y: accum.jump.y, v: 0 })

    // Joueur sans saut dans un match qui en a (déconnexion avant le largage, saut non journalisé) : ses positions
    // antérieures au premier saut du lobby sont celles de l'île d'attente. Sans ancre, on les écarte ; s'il n'a rien
    // d'autre, il n'apparaît pas sur la carte.
    const samples =
      accum.jump || firstJumpT === null
        ? accum.samples
        : accum.samples.filter((sample) => sample.t >= firstJumpT)

    const candidates = [...anchors, ...samples]
    if (candidates.length === 0) continue

    const start = accum.jump?.t ?? Math.min(...candidates.map((sample) => sample.t))
    const { lives, endingDeaths, respawns } = computeReplayLives(
      start,
      accum.deaths,
      accum.aircraftLeaves
    )
    lifeAnchors.set(accum.key, { endingDeaths, respawns })

    // Bornes exactes de chaque vie : le saut de rappel l'ouvre, la mort la ferme.
    // Sans elles, l'interpolation relierait la dernière position à la vie suivante.
    for (const point of [...respawns, ...endingDeaths]) {
      if (point.x !== null && point.y !== null) {
        anchors.push({ t: point.t, x: Math.round(point.x), y: Math.round(point.y), v: 0 })
      }
    }

    // Les ancres passent en premier : à horodatage égal, le point exact l'emporte.
    const kept = [...anchors, ...samples]
      .filter((sample) => isInsideLives(lives, sample.t))
      .sort((left, right) => left.t - right.t)
    if (kept.length === 0) continue

    const flat: number[] = []
    let lastT = -1
    for (const sample of kept) {
      if (sample.t === lastT) continue
      flat.push(sample.t, sample.x, sample.y, sample.v)
      lastT = sample.t
    }

    const identity = identities.get(accum.key)
    const bot = isBotKey(accum.key)
    const clanId = identity?.clanId ?? null

    const aff: ReplayAffiliation =
      currentClanId !== null && clanId === currentClanId ? 2 : clanId !== null ? 1 : 0
    const lastLife = lives[lives.length - 1]
    const lands = [...accum.lands].sort((left, right) => left - right)

    players.push({
      i: 0,
      key: accum.key,
      n: identity?.name ?? (bot ? 'Bot' : accum.key.replace(/^account\./, '').slice(0, 8)),
      t: aff === 2 ? currentClanTag : identity?.clanTag ?? null,
      team: accum.team,
      aff,
      sq: aff === 2,
      bot,
      p: flat,
      l: lives,
      d: lastLife ? lastLife[1] : null,
      land: lands[0] ?? null,
      lands,
      jump: accum.jump?.t ?? null,
    })
  }

  // L'escouade consultée comprend les coéquipiers hors clan : même équipe qu'un membre du clan.
  const squadTeams = new Set(
    players.filter((player) => player.aff === 2 && player.team > 0).map((player) => player.team)
  )
  for (const player of players) {
    if (player.team > 0 && squadTeams.has(player.team)) player.sq = true
  }

  const displayRank = (player: ReplayPlayer) => (player.aff === 2 ? 3 : player.sq ? 2 : player.aff)

  players.sort((left, right) => {
    const rankDelta = displayRank(right) - displayRank(left)
    if (rankDelta !== 0) return rankDelta
    if (left.team !== right.team) return left.team - right.team
    return left.n.localeCompare(right.n)
  })

  const indexByKey = new Map<string, number>()
  players.forEach((player, index) => {
    player.i = index
    indexByKey.set(player.key, index)
  })

  const zones: ReplayZone[] = []
  for (const snapshot of phases) {
    const t = toRelativeSeconds(snapshot.timestampSeconds, matchStartEpochSeconds)
    const isGame = asFiniteNumber(snapshot.isGame)
    if (t === null || isGame === null) continue

    zones.push({
      t,
      g: isGame,
      alive: asFiniteNumber(snapshot.numAlivePlayers) ?? 0,
      teams: asFiniteNumber(snapshot.numAliveTeams) ?? 0,
      sx: asFiniteNumber(snapshot.safetyZoneX),
      sy: asFiniteNumber(snapshot.safetyZoneY),
      sr: Math.round(asFiniteNumber(snapshot.safetyZoneRadiusMeters) ?? 0),
      px: asFiniteNumber(snapshot.poisonGasWarningX),
      py: asFiniteNumber(snapshot.poisonGasWarningY),
      pr: Math.round(asFiniteNumber(snapshot.poisonGasWarningRadiusMeters) ?? 0),
    })

    if (t > durationSeconds) durationSeconds = t
  }

  zones.sort((left, right) => left.t - right.t)

  const events: ReplayEvent[] = []

  for (const kill of mergeKillFeedWithKillEvents(killEvents, input.killFeedSamples, matchStartEpochSeconds)) {
    const t = toRelativeSeconds(kill.timestampSeconds, matchStartEpochSeconds)
    if (t === null) continue

    const actorKey =
      normalizeReplayKey(kill.killerAccountId) ?? normalizeReplayKey(kill.killerRawKey)
    const victimKey =
      normalizeReplayKey(kill.victimAccountId) ?? normalizeReplayKey(kill.victimRawKey)

    events.push({
      id: `kill-${kill.id}`,
      k: 'kill',
      t,
      a: actorKey !== null ? indexByKey.get(actorKey) ?? null : null,
      v: victimKey !== null ? indexByKey.get(victimKey) ?? null : null,
      x: null,
      y: null,
      w: kill.weaponName,
      dist: kill.distance !== null ? Math.round(kill.distance / 100) : null,
      hs: kill.headshot,
    })

    if (t > durationSeconds) durationSeconds = t
  }

  let knockIndex = 0
  for (const [rawTimestamp, pair] of pairByTimestamp(knockouts, 'knocker', 'victim')) {
    knockIndex += 1
    const t = toRelativeSeconds(rawTimestamp, matchStartEpochSeconds)
    if (t === null) continue

    const actorKey = normalizeReplayKey(pair.actor?.memberKey)
    const victimKey = normalizeReplayKey(pair.target?.memberKey)
    const x = asFiniteNumber(pair.target?.x)
    const y = asFiniteNumber(pair.target?.y)

    let distance: number | null = null
    const ax = asFiniteNumber(pair.actor?.x)
    const ay = asFiniteNumber(pair.actor?.y)
    if (ax !== null && ay !== null && x !== null && y !== null) {
      distance = Math.round(Math.hypot(ax - x, ay - y) / 100)
    }

    events.push({
      id: `knock-${knockIndex}`,
      k: 'knock',
      t,
      a: actorKey !== null ? indexByKey.get(actorKey) ?? null : null,
      v: victimKey !== null ? indexByKey.get(victimKey) ?? null : null,
      x: x !== null ? Math.round(x) : null,
      y: y !== null ? Math.round(y) : null,
      w: typeof pair.actor?.damageCauser === 'string' ? pair.actor.damageCauser : null,
      dist: distance,
      hs: typeof pair.actor?.damageReason === 'string' && /headshot/i.test(pair.actor.damageReason),
    })

    if (t > durationSeconds) durationSeconds = t
  }

  let reviveIndex = 0
  for (const [rawTimestamp, pair] of pairByTimestamp(revives, 'reviver', 'revived')) {
    reviveIndex += 1
    const t = toRelativeSeconds(rawTimestamp, matchStartEpochSeconds)
    if (t === null) continue

    const actorKey = normalizeReplayKey(pair.actor?.memberKey)
    const targetKey = normalizeReplayKey(pair.target?.memberKey)
    const x = asFiniteNumber(pair.target?.x)
    const y = asFiniteNumber(pair.target?.y)

    events.push({
      id: `revive-${reviveIndex}`,
      k: 'revive',
      t,
      a: actorKey !== null ? indexByKey.get(actorKey) ?? null : null,
      v: targetKey !== null ? indexByKey.get(targetKey) ?? null : null,
      x: x !== null ? Math.round(x) : null,
      y: y !== null ? Math.round(y) : null,
      w: null,
      dist: null,
      hs: false,
    })

    if (t > durationSeconds) durationSeconds = t
  }

  // Morts et rappels déduits des vies. `KillEvent` ne couvre que les frags impliquant le
  // clan suivi : sans ce complément, la mort d'un coéquipier hors clan passerait inaperçue.
  const killTimesByVictim = new Map<number, number[]>()
  for (const event of events) {
    if (event.k !== 'kill' || event.v === null) continue
    const times = killTimesByVictim.get(event.v) ?? []
    times.push(event.t)
    killTimesByVictim.set(event.v, times)
  }

  for (const player of players) {
    const anchors = lifeAnchors.get(player.key)
    if (!anchors) continue

    anchors.endingDeaths.forEach((death, index) => {
      const knownKill = (killTimesByVictim.get(player.i) ?? []).some(
        (t) => Math.abs(t - death.t) <= DEATH_KILL_MATCH_SECONDS
      )
      if (knownKill) return
      events.push({
        id: `death-${player.i}-${index}`,
        k: 'kill',
        t: death.t,
        a: null,
        v: player.i,
        x: death.x !== null ? Math.round(death.x) : null,
        y: death.y !== null ? Math.round(death.y) : null,
        w: null,
        dist: null,
        hs: false,
      })
    })

    anchors.respawns.forEach((respawn, index) => {
      events.push({
        id: `recall-${player.i}-${index}`,
        k: 'recall',
        t: respawn.t,
        a: player.i,
        v: null,
        x: respawn.x !== null ? Math.round(respawn.x) : null,
        y: respawn.y !== null ? Math.round(respawn.y) : null,
        w: null,
        dist: null,
        hs: false,
      })
    })
  }

  events.sort((left, right) => left.t - right.t)

  const trackedClanTags = Array.from(
    new Set(
      players
        .filter((player) => player.aff === 1 && player.t)
        .map((player) => player.t as string)
    )
  ).sort()

  const recallFlights = computeRecallFlights(
    extractRecallAircraftPoints(input.vehicleSamples, matchStartEpochSeconds, jumps),
    match.mapName
  )

  const crates: ReplayCrate[] = readCarePackages(input.carePackageSamples, input.summary).map((crate) => {
    const landedAt = toRelativeSeconds(crate.timestampSeconds, matchStartEpochSeconds)
    const firstLoot = toRelativeSeconds(crate.firstLootTimestampSeconds, matchStartEpochSeconds)
    for (const t of [landedAt, firstLoot]) {
      if (t !== null && t > durationSeconds) durationSeconds = t
    }
    return {
      k: crate.type,
      sp: toRelativeSeconds(crate.spawnTimestampSeconds, matchStartEpochSeconds),
      t: landedAt,
      x: crate.x,
      y: crate.y,
      items: Array.isArray(crate.items) ? crate.items : [],
      lt: firstLoot,
      sq: Array.isArray(crate.lootTeamIds) && crate.lootTeamIds.some((team) => squadTeams.has(team)),
      lteams: Array.isArray(crate.lootTeamIds) ? crate.lootTeamIds : [],
    }
  })

  return {
    match: {
      squadMatchId: match.squadMatchId,
      pubgMatchId: match.pubgMatchId,
      mapName: match.mapName,
      mapAssetKey: match.mapAssetKey,
      mapLabel: match.mapLabel,
      mapWidth: match.mapWidth,
      mapHeight: match.mapHeight,
      gameMode: match.gameMode,
      placement: match.placement,
      createdAt: match.createdAt.toISOString(),
      durationSeconds,
      clanTag: currentClanTag,
      trackedClanTags,
      totalPlayers: players.length,
      totalTeams: new Set(players.map((player) => player.team).filter((team) => team > 0)).size,
    },
    players,
    zones,
    events,
    flightPath,
    recallFlights,
    crates,
  }
}
