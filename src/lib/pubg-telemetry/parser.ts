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

function getMemberKey(event: TelemetryEvent, keys: string[]) {
  for (const key of keys) {
    const value = event[key]
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim()
    }
  }

  return null
}

function getWeaponName(event: TelemetryEvent) {
  const item = getObjectProperty(event, 'item')
  const candidates = [
    event.weapon,
    event.weaponName,
    event.damageCauserName,
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

function createTelemetryAccumulator(): TelemetryAccumulator {
  return {
    memberStats: new Map<string, TelemetryMemberStats>(),
    weaponStats: new Map<string, TelemetryWeaponStats>(),
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

  const killerKey = getMemberKey(event, ['killerName', 'killer', 'attackerName', 'attacker', 'playerId'])
  const victimKey = getMemberKey(event, ['victimName', 'victim', 'targetName', 'target', 'playerId'])
  const reviveKey = getMemberKey(event, ['reviverName', 'reviver', 'helperName'])
  const knockedKey = getMemberKey(event, ['victimName', 'victim', 'targetName', 'target'])
  const weaponName = getWeaponName(event)
  const damage = getDamageValue(event)

  if (eventType === 'LogPlayerKill' || eventType === 'LogPlayerKillV2') {
    accumulator.summary.killEvents += 1
    if (killerKey) {
      getOrCreateMemberStats(accumulator.memberStats, killerKey).kills += 1
    }
    if (victimKey) {
      getOrCreateMemberStats(accumulator.memberStats, victimKey).deaths += 1
    }
    if (weaponName) {
      const weapon = getOrCreateWeaponStats(accumulator.weaponStats, weaponName)
      weapon.kills += 1
      weapon.damageDealt += damage
      if (event.headshot === true || event.isHeadshot === true) {
        weapon.headshots += 1
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
    if (knockedKey) {
      getOrCreateMemberStats(accumulator.memberStats, knockedKey).deaths += 0
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
    }
    return
  }

  if (eventType === 'LogItemUse') {
    accumulator.summary.itemUseEvents += 1
    return
  }

  if (eventType === 'LogVehicleRide' || eventType === 'LogVehicleLeave' || eventType === 'LogVehicleDestroy') {
    accumulator.summary.vehicleEvents += 1
    if (killerKey) {
      const member = getOrCreateMemberStats(accumulator.memberStats, killerKey)
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
    if (killerKey) {
      getOrCreateMemberStats(accumulator.memberStats, killerKey).positionEvents += 1
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
    memberStats: Array.from(accumulator.memberStats.values()).sort((left, right) => {
      if (right.kills !== left.kills) {
        return right.kills - left.kills
      }
      if (right.damageDealt !== left.damageDealt) {
        return right.damageDealt - left.damageDealt
      }
      return left.memberKey.localeCompare(right.memberKey)
    }),
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
