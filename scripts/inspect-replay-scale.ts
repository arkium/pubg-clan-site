/**
 * Diagnostic d'échelle/orientation du replay : dimensions réelles des assets
 * cartographiques et bornes effectives des positions d'un match Erangel.
 * Usage: npx tsx scripts/inspect-replay-scale.ts [mapName]
 */
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

import { prisma } from '../src/lib/prisma'
import { computeFlightPath } from '../src/lib/pubg-telemetry/flight-path'
import { getMapBounds } from '../src/lib/pubg-telemetry/position-heatmap'

/** Lit la largeur/hauteur d'un WebP (formats VP8, VP8L et VP8X). */
function readWebpDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    return null
  }

  const format = buffer.toString('ascii', 12, 16)

  if (format === 'VP8X') {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    }
  }

  if (format === 'VP8 ') {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    }
  }

  if (format === 'VP8L') {
    const bits = buffer.readUInt32LE(21)
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    }
  }

  return null
}

async function reportAssets() {
  const dir = path.join(process.cwd(), 'public', 'maps', 'pubg')
  const files = (await readdir(dir)).filter((name) => name.endsWith('.webp'))

  console.log('=== DIMENSIONS DES ASSETS ===')
  for (const name of files.sort()) {
    const buffer = await readFile(path.join(dir, name))
    const dimensions = readWebpDimensions(buffer)
    const key = name.replace(/\.webp$/, '')
    const bounds = getMapBounds(key)
    console.log(
      `  ${key.padEnd(18)} image ${dimensions ? `${dimensions.width}x${dimensions.height}` : '??'}` +
        `${dimensions && dimensions.width !== dimensions.height ? '  <-- NON CARRE' : ''}` +
        `   bornes telemetrie ${bounds.width}x${bounds.height}`
    )
  }
}

async function reportMatch(mapName: string) {
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      squadMatchId: string
      mapName: string
      createdAt: Date
      positionSamples: unknown
      landingSamples: unknown
    }>
  >(
    `SELECT sm.id AS squadMatchId, sm.mapName, sm.createdAt, t.positionSamples, t.landingSamples
     FROM SquadMatch sm
     INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id
     WHERE t.status = 'success' AND t.positionSamples IS NOT NULL AND sm.mapName = ?
     ORDER BY sm.createdAt DESC
     LIMIT 1`,
    mapName
  )

  const row = rows[0]
  if (!row) {
    console.log(`\nAucun match ${mapName} avec positions`)
    return
  }

  const positions = JSON.parse(String(row.positionSamples)) as Array<{
    memberKey: string
    timestampSeconds: number
    x: number
    y: number
  }>

  const bounds = getMapBounds(row.mapName)
  const xs = positions.map((p) => p.x)
  const ys = positions.map((p) => p.y)

  console.log(`\n=== MATCH ${row.squadMatchId} (${row.mapName}, ${row.createdAt.toISOString()}) ===`)
  console.log({
    echantillons: positions.length,
    xMin: Math.round(Math.min(...xs)),
    xMax: Math.round(Math.max(...xs)),
    yMin: Math.round(Math.min(...ys)),
    yMax: Math.round(Math.max(...ys)),
    bornes: `${bounds.width}x${bounds.height}`,
    xMaxPct: `${((Math.max(...xs) / bounds.width) * 100).toFixed(1)}%`,
    yMaxPct: `${((Math.max(...ys) / bounds.height) * 100).toFixed(1)}%`,
  })

  // Trajectoire réelle de l'avion : positions au tout début, avant tout saut.
  const early = positions
    .filter((p) => p.timestampSeconds <= 20)
    .sort((a, b) => a.timestampSeconds - b.timestampSeconds)

  const first = early.filter((p) => p.timestampSeconds === early[0]?.timestampSeconds)
  const last = early.slice(-Math.max(1, Math.floor(early.length * 0.2)))

  const avg = (list: typeof positions, key: 'x' | 'y') =>
    Math.round(list.reduce((sum, p) => sum + p[key], 0) / list.length)

  console.log('\n--- Cap reel de l avion (positions t<=20s) ---')
  console.log({
    t0: { t: early[0]?.timestampSeconds, x: avg(first, 'x'), y: avg(first, 'y'), n: first.length },
    tFin: {
      t: early[early.length - 1]?.timestampSeconds,
      x: avg(last, 'x'),
      y: avg(last, 'y'),
      n: last.length,
    },
    capDeg:
      Math.round(
        (Math.atan2(avg(last, 'y') - avg(first, 'y'), avg(last, 'x') - avg(first, 'x')) * 180) /
          Math.PI
      ) || 0,
  })

  console.log('\n--- Plan de vol calcule depuis les atterrissages ---')
  console.log(computeFlightPath(row.landingSamples, row.mapName))

  // Piste alternative : mediane des positions par horodatage. A t=0 tous les
  // joueurs sont dans l'avion, donc la mediane est la position de l'avion.
  const byTimestamp = new Map<number, Array<{ x: number; y: number }>>()
  for (const sample of positions) {
    if (sample.timestampSeconds > 60) continue
    const list = byTimestamp.get(sample.timestampSeconds) ?? []
    list.push({ x: sample.x, y: sample.y })
    byTimestamp.set(sample.timestampSeconds, list)
  }

  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
  }

  const timestamps = Array.from(byTimestamp.keys()).sort((a, b) => a - b)
  console.log('\n--- Mediane des positions par horodatage (debut de partie) ---')
  for (const timestamp of timestamps.slice(0, 7)) {
    const list = byTimestamp.get(timestamp)!
    console.log({
      t: timestamp,
      n: list.length,
      medX: Math.round(median(list.map((p) => p.x))),
      medY: Math.round(median(list.map((p) => p.y))),
    })
  }

  if (timestamps.length >= 2) {
    const first = byTimestamp.get(timestamps[0])!
    const second = byTimestamp.get(timestamps[1])!
    const dx = median(second.map((p) => p.x)) - median(first.map((p) => p.x))
    const dy = median(second.map((p) => p.y)) - median(first.map((p) => p.y))
    console.log({
      capMedianDeg: Math.round((Math.atan2(dy, dx) * 180) / Math.PI),
      distanceMetres: Math.round(Math.hypot(dx, dy) / 100),
    })
  }

  // Source exacte : chaque saut hors de l'avion donne la position de l'appareil
  // a un instant precis, donc la trajectoire orientee sans ambiguite.
  const vehicleRows = await prisma.$queryRawUnsafe<Array<{ vehicleSamples: unknown }>>(
    `SELECT vehicleSamples FROM SquadMatchTelemetry WHERE squadMatchId = ?`,
    row.squadMatchId
  )

  const vehicleSamples = vehicleRows[0]?.vehicleSamples
    ? (JSON.parse(String(vehicleRows[0].vehicleSamples)) as Array<{
        action: string
        vehicleType: string | null
        timestampSeconds: number | null
        x: number
        y: number
      }>)
    : []

  const types = new Map<string, number>()
  for (const sample of vehicleSamples) {
    const key = `${sample.action}:${sample.vehicleType ?? 'null'}`
    types.set(key, (types.get(key) ?? 0) + 1)
  }

  console.log('\n--- vehicleSamples : types rencontres ---')
  console.log(Object.fromEntries(Array.from(types.entries()).slice(0, 20)))

  const jumps = vehicleSamples
    .filter(
      (sample) =>
        sample.action === 'leave' &&
        typeof sample.vehicleType === 'string' &&
        /aircraft|plane/i.test(sample.vehicleType) &&
        typeof sample.timestampSeconds === 'number'
    )
    .sort((a, b) => (a.timestampSeconds ?? 0) - (b.timestampSeconds ?? 0))

  console.log('\n--- Sauts hors de l avion (trajectoire exacte) ---')
  if (jumps.length >= 2) {
    const matchStartEpoch = row.createdAt.getTime() / 1000
    const toRelative = (value: number) => (value > 1_000_000 ? value - matchStartEpoch : value)
    const firstJumpTime = toRelative(jumps[0].timestampSeconds ?? 0)

    const initial = jumps.filter(
      (sample) => toRelative(sample.timestampSeconds ?? 0) - firstJumpTime <= 120
    )

    console.log(`Sauts totaux ${jumps.length}, dont ${initial.length} dans le largage initial`)
    for (const sample of initial.slice(0, 6)) {
      console.log(
        `  t=${Math.round(toRelative(sample.timestampSeconds ?? 0))}s  x=${Math.round(
          sample.x
        )}  y=${Math.round(sample.y)}`
      )
    }
    console.log('  ...')
    for (const sample of initial.slice(-3)) {
      console.log(
        `  t=${Math.round(toRelative(sample.timestampSeconds ?? 0))}s  x=${Math.round(
          sample.x
        )}  y=${Math.round(sample.y)}`
      )
    }

    const start = initial[0]
    const end = initial[initial.length - 1]
    console.log({
      capDeg: Math.round((Math.atan2(end.y - start.y, end.x - start.x) * 180) / Math.PI),
      longueurMetres: Math.round(Math.hypot(end.x - start.x, end.y - start.y) / 100),
    })
  } else {
    console.log(`Seulement ${jumps.length} saut(s) exploitable(s)`)
  }
}

async function main() {
  await reportAssets()
  await reportMatch(process.argv[2] ?? 'Baltic_Main')
  await prisma.$disconnect()
}

main().catch(async (error) => {
  console.error(error)
  await prisma.$disconnect()
  process.exit(1)
})
