type TelemetryEvent = Record<string, unknown>

type TelemetryMemberStats = {
  memberKey: string
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
  weapons: TelemetryMemberWeaponStats[]
}

type TelemetryMemberWeaponStats = {
  weaponName: string
  kills: number
  headshots: number
  damageDealt: number
  killDistanceTotal: number
  killDistanceCount: number
}

type TelemetryWeaponStats = {
  weaponName: string
  kills: number
  headshots: number
  damageDealt: number
}

type TelemetryAccumulator = {
  memberStats: Map<string, TelemetryMemberStats>
  weaponStats: Map<string, TelemetryWeaponStats>
  memberWeaponStats: Map<string, Map<string, TelemetryMemberWeaponStats>>
  eventTypes: Set<string>
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
      return candidate.trim()
    }
  }

  return null
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

function getOrCreateMemberStats(stats: Map<string, TelemetryMemberStats>, memberKey: string) {
  const existing = stats.get(memberKey)
  if (existing) {
    return existing
  }

  const created: TelemetryMemberStats = {
    memberKey,
    kills: 0,
    headshots: 0,
    damageDealt: 0,
    revives: 0,
    knockouts: 0,
    deaths: 0,
    blueZoneHits: 0,
    vehicleRideEvents: 0,
    vehicleLeaveEvents: 0,
    positionEvents: 0,
    weapons: [],
  }

  stats.set(memberKey, created)
  return created
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
      killDistanceTotal: 0,
      killDistanceCount: 0,
    }
    existingByMember.set(weaponName, created)
    return created
  }

  const created: TelemetryMemberWeaponStats = {
    weaponName,
    kills: 0,
    headshots: 0,
    damageDealt: 0,
    killDistanceTotal: 0,
    killDistanceCount: 0,
  }

  statsByMember.set(memberKey, new Map([[weaponName, created]]))
  return created
}

function createTelemetryAccumulator(): TelemetryAccumulator {
  return {
    memberStats: new Map<string, TelemetryMemberStats>(),
    weaponStats: new Map<string, TelemetryWeaponStats>(),
    memberWeaponStats: new Map<string, Map<string, TelemetryMemberWeaponStats>>(),
    eventTypes: new Set<string>(),
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
  const weaponName = getWeaponName(event)
  const damage = getDamageValue(event)
  const killDistance = getKillDistance(event)

  if (eventType === 'LogPlayerKill' || eventType === 'LogPlayerKillV2') {
    accumulator.summary.killEvents += 1
    if (killerKey) {
      getOrCreateMemberStats(accumulator.memberStats, killerKey).kills += 1
    }
    if (victimKey) {
      getOrCreateMemberStats(accumulator.memberStats, victimKey).deaths += 1
    }
    const wasHeadshot = isHeadshotKill(event)
    if (killerKey && wasHeadshot) {
      getOrCreateMemberStats(accumulator.memberStats, killerKey).headshots += 1
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
        }
      }
    }
    return
  }

  if (eventType === 'LogPlayerRevive') {
    accumulator.summary.reviveEvents += 1
    if (reviveKey) {
      getOrCreateMemberStats(accumulator.memberStats, reviveKey).revives += 1
    }
    return
  }

  if (eventType === 'LogPlayerMakeGroggy') {
    accumulator.summary.knockoutEvents += 1
    if (killerKey) {
      getOrCreateMemberStats(accumulator.memberStats, killerKey).knockouts += 1
    }
    return
  }

  if (eventType === 'LogPlayerTakeDamage') {
    accumulator.summary.damageEvents += 1
    if (killerKey) {
      getOrCreateMemberStats(accumulator.memberStats, killerKey).damageDealt += damage
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
      }
    }
    if (victimKey && isBlueZoneDamage(event)) {
      getOrCreateMemberStats(accumulator.memberStats, victimKey).blueZoneHits += 1
    }
    return
  }

  if (eventType === 'LogItemUse') {
    accumulator.summary.itemUseEvents += 1
    return
  }

  if (eventType === 'LogVehicleRide' || eventType === 'LogVehicleLeave' || eventType === 'LogVehicleDestroy') {
    accumulator.summary.vehicleEvents += 1
    if (actorKey) {
      const member = getOrCreateMemberStats(accumulator.memberStats, actorKey)
      if (eventType === 'LogVehicleRide') {
        member.vehicleRideEvents += 1
      }
      if (eventType === 'LogVehicleLeave') {
        member.vehicleLeaveEvents += 1
      }
    }
    return
  }

  if (eventType === 'LogPlayerPosition') {
    accumulator.summary.positionEvents += 1
    if (actorKey) {
      getOrCreateMemberStats(accumulator.memberStats, actorKey).positionEvents += 1
    }
    return
  }

  if (eventType === 'LogGameStatePeriodically') {
    accumulator.summary.blueZoneEvents += 1
    return
  }

  if (eventType === 'LogPhaseChange') {
    accumulator.summary.phaseChangeEvents += 1
  }
}

function finalizeTelemetrySnapshot(accumulator: TelemetryAccumulator): ParsedTelemetrySnapshot {
  const memberStats = Array.from(accumulator.memberStats.values())
    .map((member) => {
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
  maxBytes: number
): Promise<{ snapshot: ParsedTelemetrySnapshot; bytesRead: number }> {
  if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
    throw new Error('Telemetry max bytes must be greater than 0')
  }

  const accumulator = createTelemetryAccumulator()
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

  if (!arrayClosed) {
    throw new Error('Telemetry stream ended before closing JSON array')
  }

  return {
    snapshot: finalizeTelemetrySnapshot(accumulator),
    bytesRead,
  }
}
