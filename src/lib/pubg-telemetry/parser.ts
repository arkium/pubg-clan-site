type TelemetryEvent = Record<string, unknown>

type TelemetryMemberStats = {
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
  healsUsed: number
  healAmountTotal: number
  boostsUsed: number
  maxVehicleSpeedKph: number
  weapons: TelemetryMemberWeaponStats[]
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

type ZoneState = {
  x: number
  y: number
  radius: number
}

export type TelemetryPhaseSnapshot = {
  isGame: number
  timestampSeconds: number
  numAlivePlayers: number
  numAliveTeams: number
  safetyZoneRadiusMeters: number
  poisonGasWarningRadiusMeters: number
  safetyZoneX?: number
  safetyZoneY?: number
}

export type TelemetryKillSample = {
  memberKey: string
  phase: number
  timestampSeconds: number | null
  x: number
  y: number
}

export type TelemetryShotCluster = {
  memberKey: string
  weaponName: string | null
  phase: number
  count: number
  x: number
  y: number
}

export type TelemetryDamageCluster = {
  memberKey: string
  role: 'attacker' | 'victim'
  weaponName: string | null
  phase: number
  count: number
  x: number
  y: number
}

export type TelemetryKnockoutSample = {
  memberKey: string
  role: 'knocker' | 'victim'
  phase: number
  timestampSeconds: number | null
  x: number
  y: number
}

export type TelemetryReviveSample = {
  memberKey: string
  role: 'reviver' | 'revived'
  phase: number
  timestampSeconds: number | null
  x: number
  y: number
}

export type TelemetryVehicleSample = {
  memberKey: string
  action: 'ride' | 'leave'
  vehicleType: string | null
  phase: number
  timestampSeconds: number | null
  x: number
  y: number
}

type ShotClusterAccum = {
  memberKey: string
  weaponName: string | null
  phase: number
  count: number
  sumX: number
  sumY: number
}

type DamageClusterAccum = {
  memberKey: string
  role: 'attacker' | 'victim'
  weaponName: string | null
  phase: number
  count: number
  sumX: number
  sumY: number
}

type MemberCircleTiming = {
  lastTimestampSeconds: number | null
  lastOutside: boolean | null
  accumulatedObservedSeconds: number
  accumulatedOutsideSeconds: number
}

type MemberPositionTracking = {
  x: number
  y: number
  hasVehicleContext: boolean
  inVehicle: boolean
  lastSampleTimestampSeconds: number | null
  lastSampleLocation: { x: number; y: number } | null
}

type TelemetryMemberWeaponStats = {
  weaponName: string
  kills: number
  headshots: number
  damageDealt: number
  shotsFired: number
  hitsLanded: number
  killDistanceTotal: number
  killDistanceCount: number
  killDistanceMax: number
}

type TelemetryWeaponStats = {
  weaponName: string
  kills: number
  headshots: number
  damageDealt: number
  shotsFired: number
  hitsLanded: number
}

type TelemetryAccumulator = {
  memberStats: Map<string, TelemetryMemberStats>
  weaponStats: Map<string, TelemetryWeaponStats>
  memberWeaponStats: Map<string, Map<string, TelemetryMemberWeaponStats>>
  memberCircleTimings: Map<string, MemberCircleTiming>
  memberPositionTracking: Map<string, MemberPositionTracking>
  memberWeaponFireCounts: Map<string, number>
  latestZoneState: ZoneState | null
  currentPhase: number
  currentIsGame: number | null
  teamPlacements: Map<number, number>
  eventTypes: Set<string>
  positionSamples: TelemetryPositionSample[]
  trajectorySegments: TelemetryTrajectorySegment[]
  deathSamples: TelemetryPositionSample[]
  landingSamples: TelemetryPositionSample[]
  phaseSnapshots: TelemetryPhaseSnapshot[]
  minPositionSampleIntervalSeconds: number
  clanMemberKeys: Set<string>
  shotClusterRadiusUnits: number
  damageClusterRadiusUnits: number
  killSamples: TelemetryKillSample[]
  shotClusters: Map<string, ShotClusterAccum>
  damageClusters: Map<string, DamageClusterAccum>
  knockoutSamples: TelemetryKnockoutSample[]
  reviveSamples: TelemetryReviveSample[]
  vehicleSamples: TelemetryVehicleSample[]
  summary: {
    totalEvents: number
    killEvents: number
    reviveEvents: number
    damageEvents: number
    knockoutEvents: number
    itemUseEvents: number
    vehicleEvents: number
    positionEvents: number
    phaseChangeEvents: number
    blueZoneEvents: number
  }
}

function getObjectProperty(value: unknown, key: string) {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  return (value as Record<string, unknown>)[key]
}

export type ParsedTelemetrySnapshot = {
  summary: {
    totalEvents: number
    killEvents: number
    reviveEvents: number
    damageEvents: number
    knockoutEvents: number
    itemUseEvents: number
    vehicleEvents: number
    positionEvents: number
    phaseChangeEvents: number
    blueZoneEvents: number
    distinctEventTypes: number
  }
  weaponStats: TelemetryWeaponStats[]
  memberStats: TelemetryMemberStats[]
  positionSamples: TelemetryPositionSample[]
  trajectorySegments: TelemetryTrajectorySegment[]
  deathSamples: TelemetryPositionSample[]
  landingSamples: TelemetryPositionSample[]
  phaseSnapshots: TelemetryPhaseSnapshot[]
  killSamples: TelemetryKillSample[]
  shotSamples: TelemetryShotCluster[]
  damageSamples: TelemetryDamageCluster[]
  knockoutSamples: TelemetryKnockoutSample[]
  reviveSamples: TelemetryReviveSample[]
  vehicleSamples: TelemetryVehicleSample[]
}

function getEventType(event: TelemetryEvent) {
  const rawType = event._T ?? event.eventType ?? event.type ?? event.event_name ?? event.eventName
  return typeof rawType === 'string' ? rawType : 'Unknown'
}

function getStringValue(value: unknown) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function getValueByPath(root: unknown, path: string) {
  let cursor: unknown = root

  for (const segment of path.split('.')) {
    if (!cursor || typeof cursor !== 'object') {
      return undefined
    }

    cursor = (cursor as Record<string, unknown>)[segment]
  }

  return cursor
}

function getFirstStringFromPaths(root: unknown, paths: string[]) {
  for (const path of paths) {
    const value = getStringValue(getValueByPath(root, path))
    if (value) {
      return value
    }
  }

  return null
}

function getKillerKey(event: TelemetryEvent) {
  return getFirstStringFromPaths(event, [
    'killer.accountId',
    'killer.name',
    'attacker.accountId',
    'attacker.name',
    'finisher.accountId',
    'finisher.name',
    'dBNOMaker.accountId',
    'dBNOMaker.name',
    'killerName',
    'attackerName',
    'playerId',
    'accountId',
  ])
}

function getVictimKey(event: TelemetryEvent) {
  return getFirstStringFromPaths(event, [
    'victim.accountId',
    'victim.name',
    'target.accountId',
    'target.name',
    'victimName',
    'targetName',
    'playerId',
  ])
}

function getReviverKey(event: TelemetryEvent) {
  return getFirstStringFromPaths(event, [
    'reviver.accountId',
    'reviver.name',
    'reviverName',
    'helperName',
  ])
}

function getCharacterKey(event: TelemetryEvent) {
  return getFirstStringFromPaths(event, ['character.accountId', 'character.name', 'accountId', 'playerId'])
}

function isHeadshotKill(event: TelemetryEvent) {
  if (event.headshot === true || event.isHeadshot === true) {
    return true
  }

  const damageReason = getFirstStringFromPaths(event, [
    'killerDamageInfo.damageReason',
    'finishDamageInfo.damageReason',
    'dBNODamageInfo.damageReason',
    'damageReason',
  ])

  return damageReason?.toLowerCase().includes('headshot') === true
}

function isBlueZoneDamage(event: TelemetryEvent) {
  const category = getFirstStringFromPaths(event, ['damageTypeCategory'])
  if (!category) {
    return false
  }

  return category.toLowerCase().includes('bluezone')
}

function getWeaponName(event: TelemetryEvent) {
  const item = getObjectProperty(event, 'item')
  const candidates = [
    event.weapon,
    event.weaponName,
    event.damageCauserName,
    getValueByPath(event, 'killerDamageInfo.damageCauserName'),
    getValueByPath(event, 'finishDamageInfo.damageCauserName'),
    getValueByPath(event, 'dBNODamageInfo.damageCauserName'),
    getObjectProperty(item, 'weaponName'),
    getObjectProperty(item, 'name'),
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return normalizeWeaponIdentifier(candidate.trim())
    }
  }

  return null
}

function normalizeWeaponIdentifier(weaponName: string) {
  if (weaponName.startsWith('Item_Weapon_')) {
    return `Weap${weaponName.slice('Item_Weapon_'.length)}`
  }

  return weaponName
}

function getFiringWeaponName(event: TelemetryEvent) {
  const weaponName = getFirstStringFromPaths(event, ['weapon.itemId', 'weapon.weaponId', 'weaponId'])
  return weaponName ? normalizeWeaponIdentifier(weaponName) : null
}

function isCountableWeaponName(weaponName: string | null) {
  if (!weaponName) {
    return false
  }

  const normalized = weaponName.toLowerCase()
  if (!normalized.startsWith('item_weapon_') && !normalized.startsWith('weap')) {
    return false
  }

  return !normalized.includes('snowball')
    && !normalized.includes('throw')
    && !normalized.includes('grenade')
    && !normalized.includes('molotov')
    && !normalized.includes('smoke')
    && !normalized.includes('flare')
    && !normalized.includes('debuff')
    && !normalized.includes('effectactor')
}

function isCountableAttackWeapon(event: TelemetryEvent) {
  const attackType = getFirstStringFromPaths(event, ['attackType'])
  if (attackType && attackType.toLowerCase() !== 'weapon') {
    return false
  }

  const weapon = getObjectProperty(event, 'weapon')
  const category = getFirstStringFromPaths(weapon, ['category'])
  const subCategory = getFirstStringFromPaths(weapon, ['subCategory'])

  if (subCategory?.toLowerCase() === 'throwable') {
    return false
  }

  const weaponName = getFiringWeaponName(event)
  return isCountableWeaponName(weaponName) && category !== 'Equipment'
}

function getDamageValue(event: TelemetryEvent) {
  const candidates = [event.damage, event.damageDealt, event.amount]
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate
    }
  }

  return 0
}

function getFirstNumberFromPaths(root: unknown, paths: string[]) {
  for (const path of paths) {
    const value = getValueByPath(root, path)
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
  }

  return null
}

function getTimestampSeconds(event: TelemetryEvent) {
  const elapsedSeconds = getFirstNumberFromPaths(event, [
    'elapsedTime',
    'common.elapsedTime',
    'gameState.elapsedTime',
  ])
  if (typeof elapsedSeconds === 'number' && Number.isFinite(elapsedSeconds) && elapsedSeconds >= 0) {
    return elapsedSeconds
  }

  const timestampString = getFirstStringFromPaths(event, ['_D', 'timestamp', 'eventTime'])
  if (!timestampString) {
    return null
  }

  const parsedMillis = Date.parse(timestampString)
  if (!Number.isFinite(parsedMillis) || parsedMillis < 0) {
    return null
  }

  return parsedMillis / 1000
}

function getZoneStateFromEvent(event: TelemetryEvent): ZoneState | null {
  const x = getFirstNumberFromPaths(event, [
    'gameState.safetyZonePosition.x',
    'safetyZonePosition.x',
  ])
  const y = getFirstNumberFromPaths(event, [
    'gameState.safetyZonePosition.y',
    'safetyZonePosition.y',
  ])
  const radius = getFirstNumberFromPaths(event, ['gameState.safetyZoneRadius', 'safetyZoneRadius'])

  if (
    typeof x !== 'number' ||
    !Number.isFinite(x) ||
    typeof y !== 'number' ||
    !Number.isFinite(y) ||
    typeof radius !== 'number' ||
    !Number.isFinite(radius) ||
    radius <= 0
  ) {
    return null
  }

  return { x, y, radius }
}

function getLocationFromPaths(
  event: TelemetryEvent,
  xPaths: string[],
  yPaths: string[]
): { x: number; y: number } | null {
  const x = getFirstNumberFromPaths(event, xPaths)
  const y = getFirstNumberFromPaths(event, yPaths)

  if (
    typeof x !== 'number' ||
    !Number.isFinite(x) ||
    typeof y !== 'number' ||
    !Number.isFinite(y)
  ) {
    return null
  }

  return { x, y }
}

function getCharacterLocation(event: TelemetryEvent): { x: number; y: number } | null {
  return getLocationFromPaths(event, ['character.location.x', 'location.x'], ['character.location.y', 'location.y'])
}

function getVictimLocation(event: TelemetryEvent): { x: number; y: number } | null {
  return getLocationFromPaths(
    event,
    ['victim.character.location.x', 'victim.location.x', 'target.character.location.x', 'target.location.x'],
    ['victim.character.location.y', 'victim.location.y', 'target.character.location.y', 'target.location.y']
  )
}

function getKillerLocation(event: TelemetryEvent): { x: number; y: number } | null {
  return getLocationFromPaths(
    event,
    ['killer.location.x', 'killer.character.location.x', 'attacker.location.x', 'attacker.character.location.x', 'finisher.location.x'],
    ['killer.location.y', 'killer.character.location.y', 'attacker.location.y', 'attacker.character.location.y', 'finisher.location.y']
  )
}

function getAttackerLocation(event: TelemetryEvent): { x: number; y: number } | null {
  return getLocationFromPaths(
    event,
    ['attacker.location.x', 'attacker.character.location.x'],
    ['attacker.location.y', 'attacker.character.location.y']
  )
}

function getReviverLocation(event: TelemetryEvent): { x: number; y: number } | null {
  return getLocationFromPaths(
    event,
    ['reviver.location.x', 'reviver.character.location.x'],
    ['reviver.location.y', 'reviver.character.location.y']
  )
}

function getVehicleType(event: TelemetryEvent): string | null {
  return getFirstStringFromPaths(event, ['vehicle.vehicleType', 'vehicleType'])
}

function isOutsideSafeZone(location: { x: number; y: number }, zone: ZoneState) {
  const dx = location.x - zone.x
  const dy = location.y - zone.y
  const distanceSquared = dx * dx + dy * dy
  return distanceSquared > zone.radius * zone.radius
}

function getVehicleContextFromPositionEvent(event: TelemetryEvent):
  | { hasVehicleContext: true; inVehicle: boolean }
  | { hasVehicleContext: false } {
  const isInVehicle = getValueByPath(event, 'character.isInVehicle') ?? getValueByPath(event, 'isInVehicle')
  if (typeof isInVehicle === 'boolean') {
    return { hasVehicleContext: true, inVehicle: isInVehicle }
  }

  const vehicleInfo = getValueByPath(event, 'character.vehicle') ?? getValueByPath(event, 'vehicle')
  if (vehicleInfo && typeof vehicleInfo === 'object') {
    return { hasVehicleContext: true, inVehicle: true }
  }

  return { hasVehicleContext: false }
}

function getOrCreateMemberCircleTiming(
  timings: Map<string, MemberCircleTiming>,
  memberKey: string
): MemberCircleTiming {
  const existing = timings.get(memberKey)
  if (existing) {
    return existing
  }

  const created: MemberCircleTiming = {
    lastTimestampSeconds: null,
    lastOutside: null,
    accumulatedObservedSeconds: 0,
    accumulatedOutsideSeconds: 0,
  }

  timings.set(memberKey, created)
  return created
}

function getOrCreateMemberPositionTracking(
  tracking: Map<string, MemberPositionTracking>,
  memberKey: string
): MemberPositionTracking {
  const existing = tracking.get(memberKey)
  if (existing) {
    return existing
  }

  const created: MemberPositionTracking = {
    x: 0,
    y: 0,
    hasVehicleContext: false,
    inVehicle: false,
    lastSampleTimestampSeconds: null,
    lastSampleLocation: null,
  }

  tracking.set(memberKey, created)
  return created
}

function getKillDistance(event: TelemetryEvent) {
  return getFirstNumberFromPaths(event, [
    'distance',
    'distanceByVictimToKiller',
    'distanceByAttackerToTarget',
    'killerDamageInfo.distance',
    'killerDamageInfo.distanceByVictimToKiller',
    'finishDamageInfo.distance',
    'finishDamageInfo.distanceByVictimToKiller',
    'dBNODamageInfo.distance',
    'dBNODamageInfo.distanceByVictimToKiller',
  ])
}

function getKillerTeamId(event: TelemetryEvent) {
  return getFirstNumberFromPaths(event, [
    'killer.teamId',
    'attacker.teamId',
    'finisher.teamId',
    'dBNOMaker.teamId',
  ])
}

function getVictimTeamId(event: TelemetryEvent) {
  return getFirstNumberFromPaths(event, ['victim.teamId', 'target.teamId'])
}

function getReviverTeamId(event: TelemetryEvent) {
  return getFirstNumberFromPaths(event, ['reviver.teamId'])
}

function getCharacterTeamId(event: TelemetryEvent) {
  return getFirstNumberFromPaths(event, ['character.teamId', 'teamId'])
}

function getOrCreateMemberStats(stats: Map<string, TelemetryMemberStats>, memberKey: string) {
  const existing = stats.get(memberKey)
  if (existing) {
    return existing
  }

  const created: TelemetryMemberStats = {
    memberKey,
    firstKillPhase: 0,
    kills: 0,
    headshots: 0,
    damageDealt: 0,
    damageTaken: 0,
    onFootDistanceMeters: 0,
    vehicleDistanceMeters: 0,
    revives: 0,
    knockouts: 0,
    deaths: 0,
    blueZoneHits: 0,
    circleDelaySeconds: 0,
    circleDelayPercent: 0,
    vehicleRideEvents: 0,
    vehicleLeaveEvents: 0,
    positionEvents: 0,
    healsUsed: 0,
    healAmountTotal: 0,
    boostsUsed: 0,
    maxVehicleSpeedKph: 0,
    weapons: [],
  }

  stats.set(memberKey, created)
  return created
}

function getOrCreateMemberStatsWithTeam(
  stats: Map<string, TelemetryMemberStats>,
  memberKey: string,
  teamId: number | null,
  teamPlacements: Map<number, number>
) {
  const member = getOrCreateMemberStats(stats, memberKey)

  if (
    typeof teamId === 'number' &&
    Number.isFinite(teamId) &&
    teamId >= 0 &&
    typeof member.teamId !== 'number'
  ) {
    member.teamId = teamId
  }

  if (typeof member.teamId === 'number') {
    const placement = teamPlacements.get(member.teamId)
    if (typeof placement === 'number' && Number.isFinite(placement) && placement > 0) {
      member.teamPlacement = placement
    }
  }

  return member
}

function updateTeamPlacementsFromMatchEnd(
  event: TelemetryEvent,
  teamPlacements: Map<number, number>,
  memberStats: Map<string, TelemetryMemberStats>
) {
  const arrayCandidates: unknown[] = [
    getValueByPath(event, 'gameResultOnFinished.results'),
    getValueByPath(event, 'gameResult.results'),
    getObjectProperty(event, 'results'),
    getObjectProperty(event, 'characters'),
  ]

  for (const candidate of arrayCandidates) {
    if (!Array.isArray(candidate)) {
      continue
    }

    for (const entry of candidate) {
      const teamId = getFirstNumberFromPaths(entry, ['teamId', 'character.teamId'])
      const ranking = getFirstNumberFromPaths(entry, ['rank', 'ranking', 'gameResult.rank', 'gameResult.ranking'])

      if (
        typeof teamId === 'number' &&
        Number.isFinite(teamId) &&
        teamId >= 0 &&
        typeof ranking === 'number' &&
        Number.isFinite(ranking) &&
        ranking > 0
      ) {
        const existing = teamPlacements.get(teamId)
        if (typeof existing !== 'number' || ranking < existing) {
          teamPlacements.set(teamId, ranking)
        }
      }

      const memberKey = getFirstStringFromPaths(entry, [
        'accountId',
        'character.accountId',
        'name',
        'character.name',
      ])

      if (memberKey) {
        const member = getOrCreateMemberStatsWithTeam(memberStats, memberKey, teamId, teamPlacements)
        if (
          typeof ranking === 'number' &&
          Number.isFinite(ranking) &&
          ranking > 0
        ) {
          member.teamPlacement = ranking
        }
      }
    }
  }
}

function getOrCreateWeaponStats(stats: Map<string, TelemetryWeaponStats>, weaponName: string) {
  const existing = stats.get(weaponName)
  if (existing) {
    return existing
  }

  const created: TelemetryWeaponStats = {
    weaponName,
    kills: 0,
    headshots: 0,
    damageDealt: 0,
    shotsFired: 0,
    hitsLanded: 0,
  }

  stats.set(weaponName, created)
  return created
}

function getOrCreateMemberWeaponStats(
  statsByMember: Map<string, Map<string, TelemetryMemberWeaponStats>>,
  memberKey: string,
  weaponName: string
) {
  const existingByMember = statsByMember.get(memberKey)
  if (existingByMember) {
    const existing = existingByMember.get(weaponName)
    if (existing) {
      return existing
    }

    const created: TelemetryMemberWeaponStats = {
      weaponName,
      kills: 0,
      headshots: 0,
      damageDealt: 0,
      shotsFired: 0,
      hitsLanded: 0,
      killDistanceTotal: 0,
      killDistanceCount: 0,
      killDistanceMax: 0,
    }
    existingByMember.set(weaponName, created)
    return created
  }

  const created: TelemetryMemberWeaponStats = {
    weaponName,
    kills: 0,
    headshots: 0,
    damageDealt: 0,
    shotsFired: 0,
    hitsLanded: 0,
    killDistanceTotal: 0,
    killDistanceCount: 0,
    killDistanceMax: 0,
  }

  statsByMember.set(memberKey, new Map([[weaponName, created]]))
  return created
}

function createTelemetryAccumulator(options?: {
  minPositionSampleIntervalSeconds?: number
  clanMemberKeys?: Set<string>
  shotClusterRadiusMeters?: number
  damageClusterRadiusMeters?: number
}): TelemetryAccumulator {
  return {
    memberStats: new Map<string, TelemetryMemberStats>(),
    weaponStats: new Map<string, TelemetryWeaponStats>(),
    memberWeaponStats: new Map<string, Map<string, TelemetryMemberWeaponStats>>(),
    memberCircleTimings: new Map<string, MemberCircleTiming>(),
    memberPositionTracking: new Map<string, MemberPositionTracking>(),
    memberWeaponFireCounts: new Map<string, number>(),
    latestZoneState: null,
    currentPhase: 1,
    currentIsGame: null,
    teamPlacements: new Map<number, number>(),
    eventTypes: new Set<string>(),
    positionSamples: [],
    trajectorySegments: [],
    deathSamples: [],
    landingSamples: [],
    phaseSnapshots: [],
    minPositionSampleIntervalSeconds: options?.minPositionSampleIntervalSeconds ?? 10,
    clanMemberKeys: options?.clanMemberKeys ?? new Set<string>(),
    shotClusterRadiusUnits: (options?.shotClusterRadiusMeters ?? 50) * 100,
    damageClusterRadiusUnits: (options?.damageClusterRadiusMeters ?? 30) * 100,
    killSamples: [],
    shotClusters: new Map<string, ShotClusterAccum>(),
    damageClusters: new Map<string, DamageClusterAccum>(),
    knockoutSamples: [],
    reviveSamples: [],
    vehicleSamples: [],
    summary: {
      totalEvents: 0,
      killEvents: 0,
      reviveEvents: 0,
      damageEvents: 0,
      knockoutEvents: 0,
      itemUseEvents: 0,
      vehicleEvents: 0,
      positionEvents: 0,
      phaseChangeEvents: 0,
      blueZoneEvents: 0,
    },
  }
}

function applyTelemetryEvent(accumulator: TelemetryAccumulator, rawEvent: unknown) {
  if (!rawEvent || typeof rawEvent !== 'object') {
    return
  }

  const event = rawEvent as TelemetryEvent
  const eventType = getEventType(event)
  accumulator.eventTypes.add(eventType)
  accumulator.summary.totalEvents += 1

  const killerKey = getKillerKey(event)
  const victimKey = getVictimKey(event)
  const reviveKey = getReviverKey(event)
  const actorKey = getCharacterKey(event)
  const killerTeamId = getKillerTeamId(event)
  const victimTeamId = getVictimTeamId(event)
  const reviveTeamId = getReviverTeamId(event)
  const actorTeamId = getCharacterTeamId(event)
  const weaponName = getWeaponName(event)
  const firingWeaponName = getFiringWeaponName(event)
  const damage = getDamageValue(event)
  const killDistance = getKillDistance(event)
  const timestampSeconds = getTimestampSeconds(event)
  const samplePhase =
    typeof accumulator.currentIsGame === 'number' &&
    Number.isFinite(accumulator.currentIsGame) &&
    accumulator.currentIsGame > 0
      ? accumulator.currentIsGame
      : Math.max(1, accumulator.currentPhase)

  if (eventType === 'LogMatchEnd') {
    updateTeamPlacementsFromMatchEnd(event, accumulator.teamPlacements, accumulator.memberStats)
    return
  }

  if (eventType === 'LogPlayerKill' || eventType === 'LogPlayerKillV2') {
    accumulator.summary.killEvents += 1
    if (killerKey) {
      const killerStats = getOrCreateMemberStatsWithTeam(
        accumulator.memberStats,
        killerKey,
        killerTeamId,
        accumulator.teamPlacements
      )
      killerStats.kills += 1
      if (killerStats.firstKillPhase <= 0) {
        killerStats.firstKillPhase = Math.max(1, accumulator.currentPhase)
      }

      const isClanKiller =
        accumulator.clanMemberKeys.size === 0 ||
        accumulator.clanMemberKeys.has(killerKey.toLowerCase())
      if (isClanKiller) {
        const killerLocation = getKillerLocation(event)
        if (killerLocation) {
          accumulator.killSamples.push({
            memberKey: killerKey,
            phase: samplePhase,
            timestampSeconds,
            x: killerLocation.x,
            y: killerLocation.y,
          })
        }
      }
    }
    if (victimKey) {
      getOrCreateMemberStatsWithTeam(
        accumulator.memberStats,
        victimKey,
        victimTeamId,
        accumulator.teamPlacements
      ).deaths += 1

      const deathLocation = getVictimLocation(event)
      if (deathLocation) {
        accumulator.deathSamples.push({
          memberKey: victimKey,
          teamId: victimTeamId ?? undefined,
          phase: samplePhase,
          timestampSeconds,
          x: deathLocation.x,
          y: deathLocation.y,
          inVehicle: false,
        })
      }
    }
    const wasHeadshot = isHeadshotKill(event)
    if (killerKey && wasHeadshot) {
      getOrCreateMemberStatsWithTeam(
        accumulator.memberStats,
        killerKey,
        killerTeamId,
        accumulator.teamPlacements
      ).headshots += 1
    }
    if (weaponName) {
      const weapon = getOrCreateWeaponStats(accumulator.weaponStats, weaponName)
      weapon.kills += 1
      weapon.damageDealt += damage
      if (wasHeadshot) {
        weapon.headshots += 1
      }

      if (killerKey) {
        const memberWeapon = getOrCreateMemberWeaponStats(
          accumulator.memberWeaponStats,
          killerKey,
          weaponName
        )

        memberWeapon.kills += 1
        memberWeapon.damageDealt += damage
        if (wasHeadshot) {
          memberWeapon.headshots += 1
        }

        if (typeof killDistance === 'number' && Number.isFinite(killDistance) && killDistance >= 0) {
          memberWeapon.killDistanceTotal += killDistance
          memberWeapon.killDistanceCount += 1
          if (killDistance > memberWeapon.killDistanceMax) {
            memberWeapon.killDistanceMax = killDistance
          }
        }
      }
    }
    return
  }

  if (eventType === 'LogPlayerRevive') {
    accumulator.summary.reviveEvents += 1
    if (reviveKey) {
      getOrCreateMemberStatsWithTeam(
        accumulator.memberStats,
        reviveKey,
        reviveTeamId,
        accumulator.teamPlacements
      ).revives += 1

      const isClanReviver =
        accumulator.clanMemberKeys.size === 0 ||
        accumulator.clanMemberKeys.has(reviveKey.toLowerCase())
      if (isClanReviver) {
        const reviverLocation = getReviverLocation(event)
        if (reviverLocation) {
          accumulator.reviveSamples.push({
            memberKey: reviveKey,
            role: 'reviver',
            phase: samplePhase,
            timestampSeconds,
            x: reviverLocation.x,
            y: reviverLocation.y,
          })
        }
      }
    }
    if (victimKey) {
      const isClanRevived =
        accumulator.clanMemberKeys.size === 0 ||
        accumulator.clanMemberKeys.has(victimKey.toLowerCase())
      if (isClanRevived) {
        const revivedLocation = getVictimLocation(event)
        if (revivedLocation) {
          accumulator.reviveSamples.push({
            memberKey: victimKey,
            role: 'revived',
            phase: samplePhase,
            timestampSeconds,
            x: revivedLocation.x,
            y: revivedLocation.y,
          })
        }
      }
    }
    return
  }

  if (eventType === 'LogPlayerMakeGroggy') {
    accumulator.summary.knockoutEvents += 1
    if (killerKey) {
      getOrCreateMemberStatsWithTeam(
        accumulator.memberStats,
        killerKey,
        killerTeamId,
        accumulator.teamPlacements
      ).knockouts += 1

      const isClanKnocker =
        accumulator.clanMemberKeys.size === 0 ||
        accumulator.clanMemberKeys.has(killerKey.toLowerCase())
      if (isClanKnocker) {
        const knockerLocation = getKillerLocation(event)
        if (knockerLocation) {
          accumulator.knockoutSamples.push({
            memberKey: killerKey,
            role: 'knocker',
            phase: samplePhase,
            timestampSeconds,
            x: knockerLocation.x,
            y: knockerLocation.y,
          })
        }
      }
    }
    if (victimKey) {
      const isClanVictim =
        accumulator.clanMemberKeys.size === 0 ||
        accumulator.clanMemberKeys.has(victimKey.toLowerCase())
      if (isClanVictim) {
        const victimLocation = getVictimLocation(event)
        if (victimLocation) {
          accumulator.knockoutSamples.push({
            memberKey: victimKey,
            role: 'victim',
            phase: samplePhase,
            timestampSeconds,
            x: victimLocation.x,
            y: victimLocation.y,
          })
        }
      }
    }
    return
  }

  if (eventType === 'LogPlayerTakeDamage') {
    accumulator.summary.damageEvents += 1
    if (killerKey) {
      getOrCreateMemberStatsWithTeam(
        accumulator.memberStats,
        killerKey,
        killerTeamId,
        accumulator.teamPlacements
      ).damageDealt += damage
    }
    if (weaponName) {
      const weapon = getOrCreateWeaponStats(accumulator.weaponStats, weaponName)
      weapon.damageDealt += damage

      if (killerKey) {
        const memberWeapon = getOrCreateMemberWeaponStats(
          accumulator.memberWeaponStats,
          killerKey,
          weaponName
        )
        memberWeapon.damageDealt += damage
        if (victimKey && killerKey !== victimKey) {
          weapon.hitsLanded += 1
          memberWeapon.hitsLanded += 1
        }
      }
    }
    if (victimKey && isBlueZoneDamage(event)) {
      getOrCreateMemberStatsWithTeam(
        accumulator.memberStats,
        victimKey,
        victimTeamId,
        accumulator.teamPlacements
      ).blueZoneHits += 1
    }
    if (victimKey) {
      getOrCreateMemberStatsWithTeam(
        accumulator.memberStats,
        victimKey,
        victimTeamId,
        accumulator.teamPlacements
      ).damageTaken += damage
    }

    if (accumulator.clanMemberKeys.size > 0) {
      const damageRadiusUnits = accumulator.damageClusterRadiusUnits
      const damageCauserName = getFiringWeaponName(event) ?? weaponName

      if (killerKey && killerKey !== victimKey && accumulator.clanMemberKeys.has(killerKey.toLowerCase())) {
        const attackerLoc = getAttackerLocation(event)
        if (attackerLoc) {
          const cellX = Math.floor(attackerLoc.x / damageRadiusUnits)
          const cellY = Math.floor(attackerLoc.y / damageRadiusUnits)
          const clusterKey = `${killerKey}:attacker:${damageCauserName ?? ''}:${samplePhase}:${cellX}:${cellY}`
          const existing = accumulator.damageClusters.get(clusterKey)
          if (existing) {
            existing.count += 1
            existing.sumX += attackerLoc.x
            existing.sumY += attackerLoc.y
          } else {
            accumulator.damageClusters.set(clusterKey, {
              memberKey: killerKey,
              role: 'attacker',
              weaponName: damageCauserName ?? null,
              phase: samplePhase,
              count: 1,
              sumX: attackerLoc.x,
              sumY: attackerLoc.y,
            })
          }
        }
      }

      if (victimKey && accumulator.clanMemberKeys.has(victimKey.toLowerCase())) {
        const victimLoc = getVictimLocation(event)
        if (victimLoc) {
          const cellX = Math.floor(victimLoc.x / damageRadiusUnits)
          const cellY = Math.floor(victimLoc.y / damageRadiusUnits)
          const clusterKey = `${victimKey}:victim:${damageCauserName ?? ''}:${samplePhase}:${cellX}:${cellY}`
          const existing = accumulator.damageClusters.get(clusterKey)
          if (existing) {
            existing.count += 1
            existing.sumX += victimLoc.x
            existing.sumY += victimLoc.y
          } else {
            accumulator.damageClusters.set(clusterKey, {
              memberKey: victimKey,
              role: 'victim',
              weaponName: damageCauserName ?? null,
              phase: samplePhase,
              count: 1,
              sumX: victimLoc.x,
              sumY: victimLoc.y,
            })
          }
        }
      }
    }
    return
  }

  if (eventType === 'LogPlayerAttack' || eventType === 'LogWeaponFireCount') {
    const fireCount = getFirstNumberFromPaths(event, ['fireWeaponStackCount', 'fireCount'])
    const firingActorKey = eventType === 'LogPlayerAttack' ? getKillerKey(event) : getCharacterKey(event)
    const weaponId = getFiringWeaponName(event)

    if (
      firingActorKey &&
      weaponId &&
      (eventType === 'LogWeaponFireCount' ? isCountableWeaponName(weaponId) : isCountableAttackWeapon(event)) &&
      typeof fireCount === 'number' &&
      Number.isFinite(fireCount) &&
      fireCount > 0
    ) {
      const actorWeaponKey = `${firingActorKey}:${weaponId}`
      const previousFireCount = accumulator.memberWeaponFireCounts.get(actorWeaponKey)
      const delta =
        typeof previousFireCount === 'number' && previousFireCount >= 0 && fireCount >= previousFireCount
          ? fireCount - previousFireCount
          : fireCount

      if (delta > 0) {
        const memberWeapon = getOrCreateMemberWeaponStats(
          accumulator.memberWeaponStats,
          firingActorKey,
          weaponId
        )
        const weapon = getOrCreateWeaponStats(accumulator.weaponStats, weaponId)

        memberWeapon.shotsFired += delta
        weapon.shotsFired += delta
      }

      accumulator.memberWeaponFireCounts.set(actorWeaponKey, fireCount)
    }

    if (
      eventType === 'LogPlayerAttack' &&
      accumulator.clanMemberKeys.size > 0 &&
      isCountableAttackWeapon(event)
    ) {
      const shotActorKey = getKillerKey(event)
      if (shotActorKey && accumulator.clanMemberKeys.has(shotActorKey.toLowerCase())) {
        const shotLocation = getAttackerLocation(event)
        const shotWeaponId = getFiringWeaponName(event)
        if (shotLocation) {
          const radiusUnits = accumulator.shotClusterRadiusUnits
          const cellX = Math.floor(shotLocation.x / radiusUnits)
          const cellY = Math.floor(shotLocation.y / radiusUnits)
          const clusterKey = `${shotActorKey}:${shotWeaponId ?? ''}:${samplePhase}:${cellX}:${cellY}`
          const existing = accumulator.shotClusters.get(clusterKey)
          if (existing) {
            existing.count += 1
            existing.sumX += shotLocation.x
            existing.sumY += shotLocation.y
          } else {
            accumulator.shotClusters.set(clusterKey, {
              memberKey: shotActorKey,
              weaponName: shotWeaponId ?? null,
              phase: samplePhase,
              count: 1,
              sumX: shotLocation.x,
              sumY: shotLocation.y,
            })
          }
        }
      }
    }

    return
  }

  if (eventType === 'LogItemUse') {
    accumulator.summary.itemUseEvents += 1
    if (actorKey) {
      const itemId = getFirstStringFromPaths(event, ['item.itemId', 'itemId'])
      if (itemId) {
        const lower = itemId.toLowerCase()
        const isBoost =
          lower.includes('boost') ||
          lower.includes('energy') ||
          lower.includes('adrenaline') ||
          lower.includes('painkiller')
        if (isBoost) {
          getOrCreateMemberStatsWithTeam(
            accumulator.memberStats,
            actorKey,
            actorTeamId,
            accumulator.teamPlacements
          ).boostsUsed += 1
        }
      }
    }
    return
  }

  if (eventType === 'LogHeal') {
    accumulator.summary.itemUseEvents += 1
    if (actorKey) {
      const healAmount = getFirstNumberFromPaths(event, ['healAmount', 'amount', 'restoreHealth'])
      const member = getOrCreateMemberStatsWithTeam(
        accumulator.memberStats,
        actorKey,
        actorTeamId,
        accumulator.teamPlacements
      )
      member.healsUsed += 1
      if (typeof healAmount === 'number' && Number.isFinite(healAmount) && healAmount > 0) {
        member.healAmountTotal += healAmount
      }
    }
    return
  }

  if (eventType === 'LogVehicleRide' || eventType === 'LogVehicleLeave' || eventType === 'LogVehicleDestroy') {
    accumulator.summary.vehicleEvents += 1
    if (actorKey) {
      const member = getOrCreateMemberStatsWithTeam(
        accumulator.memberStats,
        actorKey,
        actorTeamId,
        accumulator.teamPlacements
      )
      if (eventType === 'LogVehicleRide') {
        member.vehicleRideEvents += 1
      }
      if (eventType === 'LogVehicleLeave') {
        member.vehicleLeaveEvents += 1
        const speed = getFirstNumberFromPaths(event, ['maxSpeed', 'vehicle.maxSpeed'])
        if (typeof speed === 'number' && Number.isFinite(speed) && speed > member.maxVehicleSpeedKph) {
          member.maxVehicleSpeedKph = speed
        }
      }

      if (eventType !== 'LogVehicleDestroy') {
        const isClanActor =
          accumulator.clanMemberKeys.size === 0 ||
          accumulator.clanMemberKeys.has(actorKey.toLowerCase())
        if (isClanActor) {
          const vehicleLocation = getCharacterLocation(event)
          if (vehicleLocation) {
            accumulator.vehicleSamples.push({
              memberKey: actorKey,
              action: eventType === 'LogVehicleRide' ? 'ride' : 'leave',
              vehicleType: getVehicleType(event),
              phase: samplePhase,
              timestampSeconds,
              x: vehicleLocation.x,
              y: vehicleLocation.y,
            })
          }
        }
      }
    }
    return
  }

  if (eventType === 'LogParachuteLanding') {
    if (actorKey) {
      const location = getCharacterLocation(event)
      if (location) {
        accumulator.landingSamples.push({
          memberKey: actorKey,
          teamId: actorTeamId ?? undefined,
          phase: 0,
          timestampSeconds,
          x: location.x,
          y: location.y,
          inVehicle: false,
        })
      }
    }
    return
  }

  if (eventType === 'LogPlayerPosition') {
    accumulator.summary.positionEvents += 1
    if (actorKey) {
      getOrCreateMemberStatsWithTeam(
        accumulator.memberStats,
        actorKey,
        actorTeamId,
        accumulator.teamPlacements
      ).positionEvents += 1

      const timing = getOrCreateMemberCircleTiming(accumulator.memberCircleTimings, actorKey)
      const tracking = getOrCreateMemberPositionTracking(accumulator.memberPositionTracking, actorKey)
      const location = getCharacterLocation(event)
      const movementContext = getVehicleContextFromPositionEvent(event)

      if (location) {
        const previous = accumulator.memberPositionTracking.get(actorKey)
        if (previous) {
          const dx = location.x - previous.x
          const dy = location.y - previous.y
          const distance = Math.sqrt(dx * dx + dy * dy)
          if (Number.isFinite(distance) && distance > 0) {
            const inVehicle = movementContext.hasVehicleContext
              ? movementContext.inVehicle
              : previous.hasVehicleContext
                ? previous.inVehicle
                : false

            const member = getOrCreateMemberStatsWithTeam(
              accumulator.memberStats,
              actorKey,
              actorTeamId,
              accumulator.teamPlacements
            )

            if (inVehicle) {
              member.vehicleDistanceMeters += distance
            } else {
              member.onFootDistanceMeters += distance
            }
          }
        }

        tracking.x = location.x
        tracking.y = location.y
        tracking.hasVehicleContext = movementContext.hasVehicleContext
          ? true
          : previous?.hasVehicleContext ?? false
        tracking.inVehicle = movementContext.hasVehicleContext
          ? movementContext.inVehicle
          : previous?.inVehicle ?? false

        const isPositionClanMember =
          accumulator.clanMemberKeys.size === 0 ||
          accumulator.clanMemberKeys.has(actorKey.toLowerCase())

        const shouldSamplePosition =
          isPositionClanMember &&
          (tracking.lastSampleTimestampSeconds === null ||
          (typeof timestampSeconds === 'number' &&
            Number.isFinite(timestampSeconds) &&
            timestampSeconds >= tracking.lastSampleTimestampSeconds + accumulator.minPositionSampleIntervalSeconds))

        if (shouldSamplePosition) {
          accumulator.positionSamples.push({
            memberKey: actorKey,
            teamId: actorTeamId ?? undefined,
            phase: samplePhase,
            timestampSeconds: typeof timestampSeconds === 'number' && Number.isFinite(timestampSeconds) ? timestampSeconds : null,
            x: location.x,
            y: location.y,
            inVehicle: movementContext.hasVehicleContext
              ? movementContext.inVehicle
              : previous?.inVehicle ?? false,
          })

          if (tracking.lastSampleLocation) {
            accumulator.trajectorySegments.push({
              memberKey: actorKey,
              teamId: actorTeamId ?? undefined,
              phase: samplePhase,
              timestampStart: tracking.lastSampleTimestampSeconds,
              timestampEnd: typeof timestampSeconds === 'number' && Number.isFinite(timestampSeconds) ? timestampSeconds : null,
              fromX: tracking.lastSampleLocation.x,
              fromY: tracking.lastSampleLocation.y,
              toX: location.x,
              toY: location.y,
            })
          }

          tracking.lastSampleTimestampSeconds =
            typeof timestampSeconds === 'number' && Number.isFinite(timestampSeconds)
              ? timestampSeconds
              : tracking.lastSampleTimestampSeconds
          tracking.lastSampleLocation = { x: location.x, y: location.y }
        }
      }

      const outsideSafeZone =
        location && accumulator.latestZoneState
          ? isOutsideSafeZone(location, accumulator.latestZoneState)
          : null

      if (
        typeof timestampSeconds === 'number' &&
        Number.isFinite(timestampSeconds) &&
        timestampSeconds >= 0 &&
        typeof timing.lastTimestampSeconds === 'number' &&
        Number.isFinite(timing.lastTimestampSeconds) &&
        timestampSeconds >= timing.lastTimestampSeconds &&
        timing.lastOutside !== null
      ) {
        const delta = timestampSeconds - timing.lastTimestampSeconds
        timing.accumulatedObservedSeconds += delta
        if (timing.lastOutside === true) {
          timing.accumulatedOutsideSeconds += delta
        }
      }

      if (
        typeof timestampSeconds === 'number' &&
        Number.isFinite(timestampSeconds) &&
        timestampSeconds >= 0
      ) {
        timing.lastTimestampSeconds = timestampSeconds
      }

      timing.lastOutside = outsideSafeZone
    }
    return
  }

  if (eventType === 'LogGameStatePeriodically' || eventType === 'LogGameStatePeriodic') {
    accumulator.summary.blueZoneEvents += 1
    const zoneState = getZoneStateFromEvent(event)
    if (zoneState) {
      accumulator.latestZoneState = zoneState
    }

    // Capture phase snapshot for visualisation
    const ts = getTimestampSeconds(event)
    const isGame = getFirstNumberFromPaths(event, ['gameState.isGame', 'common.isGame', 'isGame'])
    const numAlivePlayers = getFirstNumberFromPaths(event, ['gameState.numAlivePlayers', 'numAlivePlayers']) ?? 0
    const numAliveTeams = getFirstNumberFromPaths(event, ['gameState.numAliveTeams', 'numAliveTeams']) ?? 0
    const safeRadius = getFirstNumberFromPaths(event, ['gameState.safetyZoneRadius', 'safetyZoneRadius']) ?? 0
    const poisonRadius = getFirstNumberFromPaths(event, ['gameState.poisonGasWarningRadius', 'poisonGasWarningRadius']) ?? 0
    if (
      typeof ts === 'number' && Number.isFinite(ts) && ts >= 0 &&
      typeof isGame === 'number' && Number.isFinite(isGame)
    ) {
      accumulator.currentIsGame = isGame
      const last = accumulator.phaseSnapshots.at(-1)
      const isNewPhase = !last || last.isGame !== isGame
      // Gap uses relative offset from first snapshot timestamp
      const firstTs = accumulator.phaseSnapshots[0]?.timestampSeconds ?? ts
      const relTs = ts - firstTs
      const lastRelTs = last ? last.timestampSeconds - firstTs : -Infinity
      const gapOk = !last || relTs - lastRelTs >= 5
      if (isNewPhase || gapOk) {
        const safeX = getFirstNumberFromPaths(event, ['gameState.safetyZonePosition.x', 'safetyZonePosition.x'])
        const safeY = getFirstNumberFromPaths(event, ['gameState.safetyZonePosition.y', 'safetyZonePosition.y'])
        accumulator.phaseSnapshots.push({
          isGame,
          timestampSeconds: ts,
          numAlivePlayers,
          numAliveTeams,
          safetyZoneRadiusMeters: safeRadius,
          poisonGasWarningRadiusMeters: poisonRadius,
          ...(typeof safeX === 'number' && Number.isFinite(safeX) && typeof safeY === 'number' && Number.isFinite(safeY)
            ? { safetyZoneX: safeX, safetyZoneY: safeY }
            : {}),
        })
      }
    }
    return
  }

  if (eventType === 'LogPhaseChange') {
    accumulator.summary.phaseChangeEvents += 1
    accumulator.currentPhase += 1
  }
}

function finalizeTelemetrySnapshot(accumulator: TelemetryAccumulator): ParsedTelemetrySnapshot {
  for (const member of accumulator.memberStats.values()) {
    if (typeof member.teamId !== 'number') {
      continue
    }

    const placement = accumulator.teamPlacements.get(member.teamId)
    if (typeof placement === 'number' && Number.isFinite(placement) && placement > 0) {
      member.teamPlacement = placement
    }
  }

  const memberStats = Array.from(accumulator.memberStats.values())
    .map((member) => {
      const circleTiming = accumulator.memberCircleTimings.get(member.memberKey)
      const weapons = Array.from(
        accumulator.memberWeaponStats.get(member.memberKey)?.values() ?? []
      ).sort((left, right) => {
        if (right.kills !== left.kills) {
          return right.kills - left.kills
        }
        if (right.damageDealt !== left.damageDealt) {
          return right.damageDealt - left.damageDealt
        }
        return left.weaponName.localeCompare(right.weaponName)
      })

      return {
        ...member,
        damageTaken: Number(member.damageTaken.toFixed(2)),
        onFootDistanceMeters: Number(member.onFootDistanceMeters.toFixed(2)),
        vehicleDistanceMeters: Number(member.vehicleDistanceMeters.toFixed(2)),
        healAmountTotal: Number(member.healAmountTotal.toFixed(2)),
        circleDelaySeconds: Number((circleTiming?.accumulatedOutsideSeconds ?? 0).toFixed(2)),
        circleDelayPercent:
          circleTiming && circleTiming.accumulatedObservedSeconds > 0
            ? Number(
                (
                  (circleTiming.accumulatedOutsideSeconds / circleTiming.accumulatedObservedSeconds) *
                  100
                ).toFixed(1)
              )
            : 0,
        weapons,
      }
    })
    .sort((left, right) => {
      if (right.kills !== left.kills) {
        return right.kills - left.kills
      }
      if (right.damageDealt !== left.damageDealt) {
        return right.damageDealt - left.damageDealt
      }
      return left.memberKey.localeCompare(right.memberKey)
    })

  const shotSamples: TelemetryShotCluster[] = Array.from(accumulator.shotClusters.values()).map((c) => ({
    memberKey: c.memberKey,
    weaponName: c.weaponName,
    phase: c.phase,
    count: c.count,
    x: Math.round(c.sumX / c.count),
    y: Math.round(c.sumY / c.count),
  }))

  const damageSamples: TelemetryDamageCluster[] = Array.from(accumulator.damageClusters.values()).map((c) => ({
    memberKey: c.memberKey,
    role: c.role,
    weaponName: c.weaponName,
    phase: c.phase,
    count: c.count,
    x: Math.round(c.sumX / c.count),
    y: Math.round(c.sumY / c.count),
  }))

  return {
    summary: {
      ...accumulator.summary,
      distinctEventTypes: accumulator.eventTypes.size,
    },
    weaponStats: Array.from(accumulator.weaponStats.values()).sort((left, right) => {
      if (right.kills !== left.kills) {
        return right.kills - left.kills
      }
      return right.damageDealt - left.damageDealt
    }),
    memberStats,
    positionSamples: accumulator.positionSamples,
    trajectorySegments: accumulator.trajectorySegments,
    deathSamples: accumulator.deathSamples,
    landingSamples: accumulator.landingSamples,
    phaseSnapshots: accumulator.phaseSnapshots,
    killSamples: accumulator.killSamples,
    shotSamples,
    damageSamples,
    knockoutSamples: accumulator.knockoutSamples,
    reviveSamples: accumulator.reviveSamples,
    vehicleSamples: accumulator.vehicleSamples,
  }
}

export function parseTelemetrySnapshot(events: unknown): ParsedTelemetrySnapshot {
  if (!Array.isArray(events)) {
    throw new Error('Telemetry payload must be an array of events')
  }

  const accumulator = createTelemetryAccumulator()

  for (const rawEvent of events) {
    applyTelemetryEvent(accumulator, rawEvent)
  }

  return finalizeTelemetrySnapshot(accumulator)
}

export async function parseTelemetrySnapshotFromStream(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number,
  options?: {
    minPositionSampleIntervalSeconds?: number
    clanMemberKeys?: Set<string>
    shotClusterRadiusMeters?: number
    damageClusterRadiusMeters?: number
  }
): Promise<{ snapshot: ParsedTelemetrySnapshot; bytesRead: number }> {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new Error('Telemetry max bytes must be greater than 0')
  }

  const accumulator = createTelemetryAccumulator(options)
  const reader = stream.getReader()
  const decoder = new TextDecoder()

  let bytesRead = 0
  let arrayStarted = false
  let arrayClosed = false
  let objectDepth = 0
  let inString = false
  let escapeNext = false
  let currentObject = ''

  function consumeText(text: string) {
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index]

      if (!arrayStarted) {
        if (/\s/u.test(character)) {
          continue
        }

        if (character !== '[') {
          throw new Error('Telemetry stream must be a JSON array')
        }

        arrayStarted = true
        continue
      }

      if (arrayClosed) {
        if (/\s/u.test(character)) {
          continue
        }

        throw new Error('Telemetry stream contains trailing content after JSON array')
      }

      if (objectDepth === 0) {
        if (/\s/u.test(character) || character === ',') {
          continue
        }

        if (character === ']') {
          arrayClosed = true
          continue
        }

        if (character === '{') {
          objectDepth = 1
          currentObject = '{'
          inString = false
          escapeNext = false
          continue
        }

        throw new Error('Telemetry stream array must contain JSON objects')
      }

      currentObject += character

      if (inString) {
        if (escapeNext) {
          escapeNext = false
          continue
        }

        if (character === '\\') {
          escapeNext = true
          continue
        }

        if (character === '"') {
          inString = false
        }

        continue
      }

      if (character === '"') {
        inString = true
        continue
      }

      if (character === '{') {
        objectDepth += 1
        continue
      }

      if (character === '}') {
        objectDepth -= 1

        if (objectDepth === 0) {
          let parsedEvent: unknown
          try {
            parsedEvent = JSON.parse(currentObject)
          } catch {
            throw new Error('Telemetry stream contains invalid JSON object event')
          }

          applyTelemetryEvent(accumulator, parsedEvent)
          currentObject = ''
          inString = false
          escapeNext = false
        }
      }
    }
  }

  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) {
        break
      }

      bytesRead += chunk.value.byteLength
      if (bytesRead > maxBytes) {
        throw new Error(`Telemetry asset exceeded max size while streaming (${bytesRead} bytes)`)
      }

      consumeText(decoder.decode(chunk.value, { stream: true }))
    }

    consumeText(decoder.decode())
  } finally {
    reader.releaseLock()
  }

  if (!arrayStarted) {
    throw new Error('Telemetry stream is empty')
  }

  if (objectDepth !== 0 || inString || escapeNext) {
    throw new Error('Telemetry stream ended before JSON object was fully parsed')
  }

  // If the stream ended without ']' but all objects were cleanly parsed, the CDN
  // served a truncated file. Accept what we have rather than discarding all events.
  if (!arrayClosed) {
    console.warn('[TelemetryParser] Stream ended without closing JSON array bracket — using partial data', { bytesRead })
  }

  return {
    snapshot: finalizeTelemetrySnapshot(accumulator),
    bytesRead,
  }
}
