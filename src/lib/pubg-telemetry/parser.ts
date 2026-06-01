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
  const candidates = [
    event.weapon,
    event.weaponName,
    event.damageCauserName,
    event.item?.weaponName,
    event.item?.name,
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

export function parseTelemetrySnapshot(events: unknown): ParsedTelemetrySnapshot {
  if (!Array.isArray(events)) {
    throw new Error('Telemetry payload must be an array of events')
  }

  const memberStats = new Map<string, TelemetryMemberStats>()
  const weaponStats = new Map<string, TelemetryWeaponStats>()
  const eventTypes = new Set<string>()

  const summary = {
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
  }

  for (const rawEvent of events) {
    if (!rawEvent || typeof rawEvent !== 'object') {
      continue
    }

    const event = rawEvent as TelemetryEvent
    const eventType = getEventType(event)
    eventTypes.add(eventType)
    summary.totalEvents += 1

    const killerKey = getMemberKey(event, ['killerName', 'killer', 'attackerName', 'attacker', 'playerId'])
    const victimKey = getMemberKey(event, ['victimName', 'victim', 'targetName', 'target', 'playerId'])
    const reviveKey = getMemberKey(event, ['reviverName', 'reviver', 'helperName'])
    const knockedKey = getMemberKey(event, ['victimName', 'victim', 'targetName', 'target'])
    const weaponName = getWeaponName(event)
    const damage = getDamageValue(event)

    if (eventType === 'LogPlayerKill' || eventType === 'LogPlayerKillV2') {
      summary.killEvents += 1
      if (killerKey) {
        getOrCreateMemberStats(memberStats, killerKey).kills += 1
      }
      if (victimKey) {
        getOrCreateMemberStats(memberStats, victimKey).deaths += 1
      }
      if (weaponName) {
        const weapon = getOrCreateWeaponStats(weaponStats, weaponName)
        weapon.kills += 1
        weapon.damageDealt += damage
        if (event.headshot === true || event.isHeadshot === true) {
          weapon.headshots += 1
        }
      }
      continue
    }

    if (eventType === 'LogPlayerRevive') {
      summary.reviveEvents += 1
      if (reviveKey) {
        getOrCreateMemberStats(memberStats, reviveKey).revives += 1
      }
      continue
    }

    if (eventType === 'LogPlayerMakeGroggy') {
      summary.knockoutEvents += 1
      if (killerKey) {
        getOrCreateMemberStats(memberStats, killerKey).knockouts += 1
      }
      if (knockedKey) {
        getOrCreateMemberStats(memberStats, knockedKey).deaths += 0
      }
      continue
    }

    if (eventType === 'LogPlayerTakeDamage') {
      summary.damageEvents += 1
      if (killerKey) {
        getOrCreateMemberStats(memberStats, killerKey).damageDealt += damage
      }
      if (weaponName) {
        const weapon = getOrCreateWeaponStats(weaponStats, weaponName)
        weapon.damageDealt += damage
      }
      continue
    }

    if (eventType === 'LogItemUse') {
      summary.itemUseEvents += 1
      continue
    }

    if (eventType === 'LogVehicleRide' || eventType === 'LogVehicleLeave' || eventType === 'LogVehicleDestroy') {
      summary.vehicleEvents += 1
      if (killerKey) {
        const member = getOrCreateMemberStats(memberStats, killerKey)
        if (eventType === 'LogVehicleRide') {
          member.vehicleRideEvents += 1
        }
        if (eventType === 'LogVehicleLeave') {
          member.vehicleLeaveEvents += 1
        }
      }
      continue
    }

    if (eventType === 'LogPlayerPosition') {
      summary.positionEvents += 1
      if (killerKey) {
        getOrCreateMemberStats(memberStats, killerKey).positionEvents += 1
      }
      continue
    }

    if (eventType === 'LogGameStatePeriodically') {
      summary.blueZoneEvents += 1
      continue
    }

    if (eventType === 'LogPhaseChange') {
      summary.phaseChangeEvents += 1
    }
  }

  return {
    summary: {
      ...summary,
      distinctEventTypes: eventTypes.size,
    },
    weaponStats: Array.from(weaponStats.values()).sort((left, right) => {
      if (right.kills !== left.kills) {
        return right.kills - left.kills
      }
      return right.damageDealt - left.damageDealt
    }),
    memberStats: Array.from(memberStats.values()).sort((left, right) => {
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
