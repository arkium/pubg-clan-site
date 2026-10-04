/**
 * Agrégation à la volée des échantillons bruts de télémétrie (`SquadMatchTelemetry`) en cellules de heatmap,
 * pour les matchs qui n'ont pas encore de `PositionMetricCell` (synchronisations d'août-septembre 2026 avant le
 * correctif, matchs non rattrapés). Même grille et mêmes règles que `buildPositionMetricCellRows` : les deux
 * sources s'additionnent dans la route Positions.
 */
import { POSITION_METRIC_GRID_SIZE, type PositionMetric } from '@/lib/position-metric-cells'
import { toMapPercent } from '@/lib/pubg-telemetry/position-heatmap'
import { isInTacticalPhase, type TacticalPhase } from '@/lib/tactical-phase'
import { vehicleTripFlags } from '@/lib/vehicle-trips'

export type RawPositionTelemetryRow = {
  positionSamples?: unknown
  deathSamples?: unknown
  killSamples?: unknown
  shotSamples?: unknown
  damageSamples?: unknown
  knockoutSamples?: unknown
  reviveSamples?: unknown
  vehicleSamples?: unknown
  /**
   * Comptes et pseudos (minuscules) des membres du clan **de cette escouade** (`SquadMember` du match). Même règle
   * que les cellules : un membre du clan joué dans une autre escouade du même lobby a son propre match, il ne doit
   * pas être compté deux fois. Absent : tous les membres du clan.
   */
  squadMemberKeys?: Set<string>
}

export type PositionMetricCellCount = {
  metric: PositionMetric
  xIndex: number
  yIndex: number
  count: number
}

/** Cellule d'un membre (clé canonique) : répartition « Qui … où » de la Cartographie tactique. */
export type PositionMetricMemberCellCount = PositionMetricCellCount & { memberKey: string }

type SampleRow = Record<string, unknown>

function asRows(value: unknown): SampleRow[] {
  let rows = value
  if (typeof rows === 'string') {
    try {
      rows = JSON.parse(rows)
    } catch {
      return []
    }
  }
  return Array.isArray(rows) ? rows.filter((row): row is SampleRow => Boolean(row) && typeof row === 'object') : []
}

const toNumber = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null)
const toKey = (value: unknown) => (typeof value === 'string' && value.trim().length > 0 ? value.trim() : null)

export function aggregateRawPositionRows(input: {
  rows: RawPositionTelemetryRow[]
  mapName: string
  /** Clé d'échantillon (compte ou pseudo, en minuscules) → clé canonique du membre du clan. */
  canonicalKeyByLowerKey: Map<string, string>
  /** Membre demandé (clé canonique), `null` pour tout le clan. */
  requestedMemberKey: string | null
  phaseFilter: TacticalPhase
}): {
  cells: PositionMetricCellCount[]
  /** Cellules par membre, filtre de phase appliqué mais **sans** filtre de membre (tout le clan). */
  memberCells: PositionMetricMemberCellCount[]
  memberPoints: Map<string, number>
  phases: Set<number>
} {
  const cells = new Map<string, PositionMetricCellCount>()
  const memberCells = new Map<string, PositionMetricMemberCellCount>()
  const memberPoints = new Map<string, number>()
  const phases = new Set<number>()

  function add(metric: PositionMetric, sample: SampleRow, member: string, weight = 1) {
    const x = toNumber(sample.x)
    const y = toNumber(sample.y)
    if (x === null || y === null) return
    if (!isInTacticalPhase(toNumber(sample.phase), input.phaseFilter)) return
    const percent = toMapPercent(input.mapName, x, y)
    const xIndex = Math.min(POSITION_METRIC_GRID_SIZE - 1, Math.floor((percent.x / 100) * POSITION_METRIC_GRID_SIZE))
    const yIndex = Math.min(POSITION_METRIC_GRID_SIZE - 1, Math.floor((percent.y / 100) * POSITION_METRIC_GRID_SIZE))
    const memberKey = `${member}|${metric}:${xIndex}:${yIndex}`
    const memberCell = memberCells.get(memberKey)
    if (memberCell) memberCell.count += weight
    else memberCells.set(memberKey, { memberKey: member, metric, xIndex, yIndex, count: weight })
    if (input.requestedMemberKey && member !== input.requestedMemberKey) return
    const key = `${metric}:${xIndex}:${yIndex}`
    const existing = cells.get(key)
    if (existing) existing.count += weight
    else cells.set(key, { metric, xIndex, yIndex, count: weight })
  }

  let squadMemberKeys: Set<string> | undefined

  /** Clé canonique si l'échantillon appartient à un membre du clan de l'escouade, sinon `null`. */
  function memberOf(sample: SampleRow) {
    const rawKey = toKey(sample.memberKey)?.toLowerCase()
    if (!rawKey || (squadMemberKeys && !squadMemberKeys.has(rawKey))) return null
    return input.canonicalKeyByLowerKey.get(rawKey) ?? null
  }

  for (const row of input.rows) {
    squadMemberKeys = row.squadMemberKeys
    // Positions et morts alimentent aussi la liste des membres et des phases, avant tout filtre.
    for (const [metric, samples] of [
      ['position', row.positionSamples],
      ['death', row.deathSamples],
    ] as const) {
      for (const sample of asRows(samples)) {
        const member = memberOf(sample)
        if (!member) continue
        memberPoints.set(member, (memberPoints.get(member) ?? 0) + 1)
        const phase = toNumber(sample.phase)
        if (phase !== null && phase > 0) phases.add(phase)
        add(metric, sample, member)
      }
    }

    for (const sample of asRows(row.killSamples)) {
      const member = memberOf(sample)
      if (member) add('kill', sample, member)
    }
    for (const sample of asRows(row.shotSamples)) {
      const member = memberOf(sample)
      if (member) add('shot', sample, member, toNumber(sample.count) ?? 1)
    }
    for (const sample of asRows(row.damageSamples)) {
      const member = memberOf(sample)
      if (!member) continue
      if (sample.role === 'attacker') add('damage_dealt', sample, member, toNumber(sample.count) ?? 1)
      else if (sample.role === 'victim') add('damage_taken', sample, member, toNumber(sample.count) ?? 1)
    }
    for (const sample of asRows(row.knockoutSamples)) {
      const member = memberOf(sample)
      if (!member) continue
      if (sample.role === 'knocker') add('knockout_dealt', sample, member)
      else if (sample.role === 'victim') add('knockout_taken', sample, member)
    }
    for (const sample of asRows(row.reviveSamples)) {
      const member = memberOf(sample)
      if (!member) continue
      if (sample.role === 'reviver') add('revive_given', sample, member)
      else if (sample.role === 'revived') add('revive_received', sample, member)
    }
    const vehicleSamples = asRows(row.vehicleSamples).flatMap((sample) => {
      const x = toNumber(sample.x)
      const y = toNumber(sample.y)
      const memberKey = toKey(sample.memberKey)
      const action: 'ride' | 'leave' | null = sample.action === 'ride' ? 'ride' : sample.action === 'leave' ? 'leave' : null
      if (x === null || y === null || !memberKey || !action) return []
      const teammateAboard = typeof sample.teammateAboard === 'boolean' ? sample.teammateAboard : undefined
      return [{ sample, memberKey, action, vehicleType: sample.vehicleType, x, y, teammateAboard }]
    })
    const vehicleCounted = vehicleTripFlags(vehicleSamples, (memberKey) => memberOf({ memberKey }))
    vehicleSamples.forEach((trip, index) => {
      if (!vehicleCounted[index]) return
      add(trip.action === 'ride' ? 'vehicle_ride' : 'vehicle_leave', trip.sample, memberOf(trip.sample)!)
    })
  }

  return { cells: Array.from(cells.values()), memberCells: Array.from(memberCells.values()), memberPoints, phases }
}

export type PositionMapSummary = {
  mapName: string
  matches: number
  positionPoints: number
  rotationPoints: number
  deathPoints: number
}

/** Cartes jouées sur la période : matchs couverts par des cellules + matchs relus depuis la télémétrie brute. */
export function mergeMapSummaries(
  persisted: PositionMapSummary[],
  rawMatchCounts: Array<{ mapName: string; matches: number }>
): PositionMapSummary[] {
  const byMap = new Map(persisted.map((entry) => [entry.mapName, { ...entry }]))
  for (const raw of rawMatchCounts) {
    const existing = byMap.get(raw.mapName)
    if (existing) existing.matches += raw.matches
    else byMap.set(raw.mapName, { mapName: raw.mapName, matches: raw.matches, positionPoints: 0, rotationPoints: 0, deathPoints: 0 })
  }
  return Array.from(byMap.values()).sort(
    (left, right) => right.matches - left.matches || left.mapName.localeCompare(right.mapName)
  )
}
