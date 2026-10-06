/**
 * Mesure, en LECTURE SEULE, ce que la page « Lecture de zone » pourrait afficher : volumes de parties analysables
 * par carte et par mode, puis, sur un échantillon, le lien entre la ligne de vol du C-130 et les cercles.
 *
 *   npx tsx scripts/measure-zone-reading.ts counts
 *   npx tsx scripts/measure-zone-reading.ts sample Baltic_Main 400
 *   npx tsx scripts/measure-zone-reading.ts analysis          (ce que la page affiche, depuis ZoneReadingMatch)
 */
import 'dotenv/config'

import { Prisma } from '@prisma/client'

import { prisma } from '@/lib/prisma'
import { computeFlightPath, computeFlightPathFromJumps } from '@/lib/pubg-telemetry/flight-path'
import { decodeTelemetryRow } from '@/lib/pubg-telemetry/json-codec'
import { extractInitialJumps } from '@/lib/pubg-telemetry/match-replay'
import { detectZoneClosures } from '@/lib/zone-closure-positions'
import { bandExplanation, bandHeadline, closingVerdict, practicalRule } from '@/lib/zone-reading/zone-reading-analysis'
import { loadZoneReadingAnalysis } from '@/lib/zone-reading/zone-reading-service'

type Point = { x: number; y: number }

function distanceToLine(point: Point, a: Point, b: Point) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const length = Math.hypot(dx, dy)
  if (length === 0) return Math.hypot(point.x - a.x, point.y - a.y)
  return Math.abs(dx * (point.y - a.y) - dy * (point.x - a.x)) / length
}

function projectOnLine(point: Point, a: Point, b: Point): Point {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return a
  const t = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared
  return { x: a.x + t * dx, y: a.y + t * dy }
}

const median = (values: number[]) => {
  if (values.length === 0) return NaN
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}
const meters = (cm: number) => `${Math.round(cm / 100)} m`
const percent = (part: number, total: number) => (total ? `${Math.round((part / total) * 100)} %` : '—')

async function counts() {
  const byMap = await prisma.$queryRaw<Array<{ mapName: string; matches: bigint; first: Date; last: Date }>>(Prisma.sql`
    SELECT sm.mapName, COUNT(*) AS matches, MIN(sm.createdAt) AS first, MAX(sm.createdAt) AS last
    FROM SquadMatch sm INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id
    WHERE t.status = 'success'
    GROUP BY sm.mapName ORDER BY matches DESC
  `)
  console.log('\nParties analysées par carte (télémétrie success, tous clans)')
  for (const row of byMap) {
    console.log(`  ${row.mapName.padEnd(18)} ${String(row.matches).padStart(6)}  ${row.first.toISOString().slice(0, 10)} → ${row.last.toISOString().slice(0, 10)}`)
  }

  const byMode = await prisma.$queryRaw<Array<{ gameMode: string; matchType: string; matches: bigint }>>(Prisma.sql`
    SELECT sm.gameMode, sm.matchType, COUNT(*) AS matches
    FROM SquadMatch sm INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id
    WHERE t.status = 'success'
    GROUP BY sm.gameMode, sm.matchType ORDER BY matches DESC
  `)
  console.log('\nPar mode de jeu / type de partie')
  for (const row of byMode) console.log(`  ${row.gameMode.padEnd(18)} ${row.matchType.padEnd(12)} ${String(row.matches).padStart(6)}`)

  const withCenters = await prisma.$queryRaw<Array<{ matches: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS matches
    FROM SquadMatch sm INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id
    WHERE t.status = 'success' AND sm.createdAt >= '2026-06-13'
      AND (JSON_LENGTH(t.vehicleSamples) > 0 OR t.vehicleSamplesGz IS NOT NULL)
  `)
  console.log(`\nParties depuis le 2026-06-13 avec vehicleSamples (sauts) : ${withCenters[0]?.matches ?? 0}`)
}

async function sample(mapName: string, limit: number) {
  const ids = await prisma.$queryRaw<Array<{ id: string; createdAt: Date; gameMode: string }>>(Prisma.sql`
    SELECT sm.id, sm.createdAt, sm.gameMode
    FROM SquadMatch sm INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id
    WHERE t.status = 'success' AND sm.mapName = ${mapName}
    ORDER BY sm.createdAt DESC
    LIMIT ${limit}
  `)
  const meta = new Map(ids.map((row) => [row.id, row]))

  const finalDistances: number[] = []
  const finalFromLastAnnounced: number[] = []
  const firstCenterDistances: number[] = []
  let crossesFirst = 0
  let withFirst = 0
  let jumpsSource = 0
  let landingsSource = 0
  let noPath = 0
  const closer: Array<{ closer: number; total: number }> = Array.from({ length: 9 }, () => ({ closer: 0, total: 0 }))
  const errorsCenter: number[][] = Array.from({ length: 9 }, () => [])
  const errorsLine: number[][] = Array.from({ length: 9 }, () => [])
  const radii: number[][] = Array.from({ length: 10 }, () => [])
  const circleCounts: number[] = []
  const started = performance.now()

  for (let offset = 0; offset < ids.length; offset += 40) {
    const batch = ids.slice(offset, offset + 40)
    const rows = await prisma.$queryRaw<Array<Record<string, unknown> & { squadMatchId: string }>>(Prisma.sql`
      SELECT t.squadMatchId, t.phaseSnapshots, t.phaseSnapshotsGz, t.vehicleSamples, t.vehicleSamplesGz,
             t.landingSamples, t.landingSamplesGz
      FROM SquadMatchTelemetry t
      WHERE t.squadMatchId IN (${Prisma.join(batch.map((row) => row.id))})
    `)
    for (const raw of rows) {
      const row = decodeTelemetryRow(raw)
      const match = meta.get(row.squadMatchId)
      if (!match) continue
      const jumps = Array.from(extractInitialJumps(row.vehicleSamples, match.createdAt.getTime() / 1000).values())
      const fromJumps = computeFlightPathFromJumps(jumps, mapName)
      const path = fromJumps ?? computeFlightPath(row.landingSamples, mapName)
      if (!path) {
        noPath += 1
        continue
      }
      if (fromJumps) jumpsSource += 1
      else landingsSource += 1

      // C1 = cercle stable atteint à la fermeture de la phase 2, etc.
      const circles = detectZoneClosures(row.phaseSnapshots).map((closure) => ({
        x: closure.centerX,
        y: closure.centerY,
        r: closure.radius,
      }))
      circleCounts.push(circles.length)
      if (circles.length === 0) continue
      circles.forEach((circle, index) => radii[Math.min(index, 9)].push(circle.r))

      const final = circles[circles.length - 1]
      finalDistances.push(distanceToLine(final, path.start, path.end))

      const snapshots = Array.isArray(row.phaseSnapshots) ? (row.phaseSnapshots as Array<Record<string, unknown>>) : []
      const announced = snapshots.filter(
        (snapshot) => typeof snapshot.poisonGasWarningX === 'number' && typeof snapshot.poisonGasWarningRadiusMeters === 'number' && (snapshot.poisonGasWarningRadiusMeters as number) > 0
      )
      const lastAnnounced = announced[announced.length - 1]
      if (lastAnnounced) {
        finalFromLastAnnounced.push(
          distanceToLine({ x: lastAnnounced.poisonGasWarningX as number, y: lastAnnounced.poisonGasWarningY as number }, path.start, path.end)
        )
      }

      const first = circles[0]
      withFirst += 1
      const firstDistance = distanceToLine(first, path.start, path.end)
      firstCenterDistances.push(firstDistance)
      if (firstDistance <= first.r) crossesFirst += 1

      for (let index = 0; index + 1 < circles.length && index < 9; index += 1) {
        const current = distanceToLine(circles[index], path.start, path.end)
        const next = distanceToLine(circles[index + 1], path.start, path.end)
        closer[index].total += 1
        if (next < current) closer[index].closer += 1
      }

      for (let index = 0; index < circles.length - 1 && index < 9; index += 1) {
        const circle = circles[index]
        errorsCenter[index].push(Math.hypot(final.x - circle.x, final.y - circle.y))
        const onLine = projectOnLine(circle, path.start, path.end)
        errorsLine[index].push(Math.hypot(final.x - onLine.x, final.y - onLine.y))
      }
    }
  }

  // Exercice « Sens de fermeture » : le secteur (8) du cercle suivant est-il prévisible par une règle simple ?
  const sectorOf = (from: Point, to: Point) => {
    const heading = ((Math.atan2(to.x - from.x, -(to.y - from.y)) * 180) / Math.PI + 360) % 360
    return Math.round(heading / 45) % 8
  }
  const sectorRules = { towardMapCenter: 0, towardLine: 0, same: 0, total: 0, tiny: 0 }
  const { width } = { width: mapName === 'Savage_Main' ? 409600 : 819200 }
  const sampleIds = ids.slice(0, Math.min(ids.length, 1500))
  for (let offset = 0; offset < sampleIds.length; offset += 40) {
    const batch = sampleIds.slice(offset, offset + 40)
    const rows = await prisma.$queryRaw<Array<Record<string, unknown> & { squadMatchId: string }>>(Prisma.sql`
      SELECT t.squadMatchId, t.phaseSnapshots, t.phaseSnapshotsGz, t.vehicleSamples, t.vehicleSamplesGz
      FROM SquadMatchTelemetry t
      WHERE t.squadMatchId IN (${Prisma.join(batch.map((row) => row.id))})
    `)
    for (const raw of rows) {
      const row = decodeTelemetryRow(raw)
      const match = meta.get(row.squadMatchId)
      if (!match) continue
      const jumps = Array.from(extractInitialJumps(row.vehicleSamples, match.createdAt.getTime() / 1000).values())
      const path = computeFlightPathFromJumps(jumps, mapName)
      if (!path) continue
      const circles = detectZoneClosures(row.phaseSnapshots).map((closure) => ({ x: closure.centerX, y: closure.centerY, r: closure.radius }))
      for (let index = 0; index + 1 < circles.length && index < 6; index += 1) {
        const current = circles[index]
        const next = circles[index + 1]
        const shift = Math.hypot(next.x - current.x, next.y - current.y)
        if (shift < current.r * 0.1) {
          sectorRules.tiny += 1
          continue
        }
        const answer = sectorOf(current, next)
        sectorRules.total += 1
        if (sectorOf(current, { x: width / 2, y: width / 2 }) === answer) sectorRules.towardMapCenter += 1
        const foot = projectOnLine(current, path.start, path.end)
        if (Math.hypot(foot.x - current.x, foot.y - current.y) > 1 && sectorOf(current, foot) === answer) sectorRules.towardLine += 1
      }
    }
  }

  // Barre « C1 » : le premier cercle est-il plus près de la ligne que le centre de la carte (cercle « 0 ») ?
  // Bande au hasard : zone finale d'une partie confrontée à la ligne de la partie suivante.
  // Repère « ligne » ramené dans le cercle quand la ligne le manque.
  let firstCloserThanMapCenter = 0
  let firstTotal = 0
  let bandRandom = 0
  let bandRandomTotal = 0
  const clampedLine: number[][] = Array.from({ length: 9 }, () => [])
  const collected: Array<{ start: Point; end: Point; final: Point; first: Point & { r: number } }> = []
  for (let offset = 0; offset < sampleIds.length; offset += 40) {
    const batch = sampleIds.slice(offset, offset + 40)
    const rows = await prisma.$queryRaw<Array<Record<string, unknown> & { squadMatchId: string }>>(Prisma.sql`
      SELECT t.squadMatchId, t.phaseSnapshots, t.phaseSnapshotsGz, t.vehicleSamples, t.vehicleSamplesGz
      FROM SquadMatchTelemetry t
      WHERE t.squadMatchId IN (${Prisma.join(batch.map((row) => row.id))})
    `)
    for (const raw of rows) {
      const row = decodeTelemetryRow(raw)
      const match = meta.get(row.squadMatchId)
      if (!match) continue
      const jumps = Array.from(extractInitialJumps(row.vehicleSamples, match.createdAt.getTime() / 1000).values())
      const path = computeFlightPathFromJumps(jumps, mapName)
      if (!path) continue
      const circles = detectZoneClosures(row.phaseSnapshots).map((closure) => ({ x: closure.centerX, y: closure.centerY, r: closure.radius }))
      if (circles.length === 0) continue
      const final = circles[circles.length - 1]
      collected.push({ start: path.start, end: path.end, final, first: circles[0] })
      firstTotal += 1
      if (distanceToLine(circles[0], path.start, path.end) < distanceToLine({ x: width / 2, y: width / 2 }, path.start, path.end)) firstCloserThanMapCenter += 1
      for (let index = 0; index < circles.length - 1 && index < 9; index += 1) {
        const circle = circles[index]
        let target = projectOnLine(circle, path.start, path.end)
        const gap = Math.hypot(target.x - circle.x, target.y - circle.y)
        if (gap > circle.r) target = { x: circle.x + ((target.x - circle.x) / gap) * circle.r, y: circle.y + ((target.y - circle.y) / gap) * circle.r }
        clampedLine[index].push(Math.hypot(final.x - target.x, final.y - target.y))
      }
    }
  }
  const firstOwn: number[] = []
  const firstOther: number[] = []
  let crossesOther = 0
  collected.forEach((entry, index) => {
    const other = collected[(index + 1) % collected.length]
    if (other === entry) return
    bandRandomTotal += 1
    if (distanceToLine(entry.final, other.start, other.end) <= 20000) bandRandom += 1
    firstOwn.push(distanceToLine(entry.first, entry.start, entry.end))
    const otherDistance = distanceToLine(entry.first, other.start, other.end)
    firstOther.push(otherDistance)
    if (otherDistance <= entry.first.r) crossesOther += 1
  })
  console.log(
    `Centre C1 → sa ligne : ${meters(median(firstOwn))} · → ligne d'une autre partie : ${meters(median(firstOther))} · ` +
      `une autre ligne traverse C1 : ${percent(crossesOther, bandRandomTotal)}`
  )
  console.log(`C1 plus près de la ligne que le centre de la carte : ${percent(firstCloserThanMapCenter, firstTotal)} · bande ±200 m au hasard : ${percent(bandRandom, bandRandomTotal)}`)
  console.log('Repère ligne ramené dans le cercle : ' + clampedLine.map((list, index) => (list.length ? `C${index + 1} ${meters(median(list))}` : null)).filter(Boolean).join(' · '))

  const ms = Math.round(performance.now() - started)
  console.log(
    `Secteur du cercle suivant (C1→C7, ${sectorRules.total} transitions, ${sectorRules.tiny} quasi immobiles) : ` +
      `vers le centre de la carte ${percent(sectorRules.towardMapCenter, sectorRules.total)} · vers la ligne ${percent(sectorRules.towardLine, sectorRules.total)} · hasard 13 %`
  )
  console.log(`\n${mapName} · ${ids.length} parties lues en ${ms} ms · axe : ${jumpsSource} sauts, ${landingsSource} atterrissages, ${noPath} sans axe`)
  console.log(`Cercles par partie (médiane) : ${median(circleCounts)} · max ${Math.max(...circleCounts)}`)
  console.log(`Zone finale (dernier cercle stable) → ligne : médiane ${meters(median(finalDistances))} · ≤ 200 m : ${percent(finalDistances.filter((d) => d <= 20000).length, finalDistances.length)} (${finalDistances.length} parties)`)
  console.log(`Dernier cercle annoncé → ligne : médiane ${meters(median(finalFromLastAnnounced))} · ≤ 200 m : ${percent(finalFromLastAnnounced.filter((d) => d <= 20000).length, finalFromLastAnnounced.length)} (${finalFromLastAnnounced.length} parties)`)
  console.log(`Ligne traverse C1 : ${percent(crossesFirst, withFirst)} · centre C1 → ligne : médiane ${meters(median(firstCenterDistances))}`)
  console.log('Rayon médian par cercle : ' + radii.map((list, index) => (list.length ? `C${index + 1} ${meters(median(list))}` : null)).filter(Boolean).join(' · '))
  console.log('Cercle suivant plus proche de la ligne : ' + closer.map((entry, index) => (entry.total ? `C${index + 1} ${percent(entry.closer, entry.total)} (${entry.total})` : null)).filter(Boolean).join(' · '))
  console.log('Erreur médiane sur la zone finale (centre / ligne) :')
  for (let index = 0; index < 9; index += 1) {
    if (errorsCenter[index].length === 0) continue
    console.log(`  C${index + 1}  centre ${meters(median(errorsCenter[index])).padStart(7)}  ligne ${meters(median(errorsLine[index])).padStart(7)}  (${errorsCenter[index].length})`)
  }
}

/** Contrôle d'un match : alignement des sauts sur l'axe, centres des cercles, unités. */
async function detail(mapName: string, count: number) {
  const ids = await prisma.$queryRaw<Array<{ id: string; createdAt: Date }>>(Prisma.sql`
    SELECT sm.id, sm.createdAt
    FROM SquadMatch sm INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id
    WHERE t.status = 'success' AND sm.mapName = ${mapName}
    ORDER BY sm.createdAt DESC
    LIMIT ${count}
  `)
  for (const match of ids) {
    const [raw] = await prisma.$queryRaw<Array<Record<string, unknown> & { squadMatchId: string }>>(Prisma.sql`
      SELECT t.squadMatchId, t.phaseSnapshots, t.phaseSnapshotsGz, t.vehicleSamples, t.vehicleSamplesGz
      FROM SquadMatchTelemetry t WHERE t.squadMatchId = ${match.id}
    `)
    const row = decodeTelemetryRow(raw)
    const jumps = Array.from(extractInitialJumps(row.vehicleSamples, match.createdAt.getTime() / 1000).values())
    const path = computeFlightPathFromJumps(jumps, mapName)
    if (!path) continue
    const offsets = jumps.map((jump) => distanceToLine(jump, path.dropStart, path.dropEnd))
    const circles = detectZoneClosures(row.phaseSnapshots)
    console.log(`\n${match.id} · ${jumps.length} sauts · angle ${path.angleDeg}° · start (${path.start.x}, ${path.start.y}) → end (${path.end.x}, ${path.end.y})`)
    console.log(`  écart des sauts à l'axe : médiane ${meters(median(offsets))}, max ${meters(Math.max(...offsets))}`)
    for (const circle of circles) {
      console.log(
        `  phase ${circle.phase} (C${circle.phase - 1}) centre (${Math.round(circle.centerX)}, ${Math.round(circle.centerY)}) r ${meters(circle.radius)} · à ${meters(distanceToLine({ x: circle.centerX, y: circle.centerY }, path.start, path.end))} de la ligne`
      )
    }
  }
}

/** Ce que la page affiche réellement : le service de la route `GET /api/zone-reading`, carte par carte. */
async function analysis(mode: 'squad' | 'duo', period: 'days-30' | 'days-90' | 'all') {
  const first = await loadZoneReadingAnalysis({ mapName: null, mode, period })
  console.log(`\n${mode} · ${period} · ${first.mapOptions.map((option) => `${option.mapName} ${option.matches}`).join(' · ')}`)
  for (const option of first.mapOptions) {
    const started = performance.now()
    const payload = await loadZoneReadingAnalysis({ mapName: option.mapName, mode, period })
    const ms = Math.round(performance.now() - started)
    const stats = payload.stats
    if (!stats) {
      console.log(`  ${option.mapName.padEnd(16)} ${payload.matchCount} parties — sous le seuil (${ms} ms)`)
      continue
    }
    console.log(`  ${option.mapName.padEnd(16)} ${payload.matchCount} parties depuis ${payload.since?.slice(0, 10)} · ${ms} ms · ${Math.round(JSON.stringify(payload).length / 1024)} Ko`)
    console.log(`    ${bandHeadline(stats)} — ${bandExplanation(stats)}`)
    console.log(`    ${closingVerdict(stats)} | ${practicalRule(stats.rule.filter((row) => row.total > 0))}`)
    console.log(`    médiane ${meters(stats.finalLineMedian * 100)} · C1 traversé ${percent(stats.crossesFirstShare * 1000, 1000)} · centre C1 ${meters(stats.firstCenterLineMedian * 100)}`)
  }
}

async function main() {
  const [command = 'counts', mapName = 'Baltic_Main', limit = '400'] = process.argv.slice(2)
  if (command === 'sample') await sample(mapName, Number(limit))
  else if (command === 'detail') await detail(mapName, Number(limit))
  else if (command === 'analysis') {
    await analysis('squad', 'all')
    await analysis('duo', 'days-30')
  } else await counts()
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
