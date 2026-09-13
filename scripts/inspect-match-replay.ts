/**
 * Construit le payload replay 2D hors HTTP pour valider la volumétrie et la
 * cohérence des données sur un match réel.
 * Usage: npx tsx scripts/inspect-match-replay.ts <squadMatchId> [clanId]
 */
import { gzipSync } from 'node:zlib'

import { prisma } from '../src/lib/prisma'
import { mapAssetUrl, resolveGameMode, resolveMapAssetKey, resolveMapName } from '../src/lib/pubg-assets'
import { computeFlightPath, computeFlightPathFromJumps } from '../src/lib/pubg-telemetry/flight-path'
import {
  buildMatchReplayPayload,
  extractInitialJumps,
  normalizeReplayKey,
  type ReplayIdentity,
  type ReplayKillEventInput,
} from '../src/lib/pubg-telemetry/match-replay'
import { getMapBounds } from '../src/lib/pubg-telemetry/position-heatmap'

function collectMemberKeys(...sources: unknown[]) {
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
      if (key) keys.add(key)
    }
  }
  return keys
}

async function main() {
  const squadMatchId = process.argv[2]
  const clanId = Number(process.argv[3] ?? 1)

  if (!squadMatchId) {
    console.error('squadMatchId requis')
    process.exit(1)
  }

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      squadMatchId: string
      pubgMatchId: string
      gameMode: string
      mapName: string
      placement: number
      createdAt: Date
      positionSamples: unknown
      deathSamples: unknown
      landingSamples: unknown
      knockoutSamples: unknown
      reviveSamples: unknown
      phaseSnapshots: unknown
      vehicleSamples: unknown
      summary: unknown
    }>
  >(
    `SELECT sm.id AS squadMatchId, sm.pubgMatchId, sm.gameMode, sm.mapName, sm.placement, sm.createdAt,
            t.positionSamples, t.deathSamples, t.landingSamples, t.knockoutSamples, t.reviveSamples,
            t.phaseSnapshots, t.vehicleSamples, t.summary
     FROM SquadMatch sm
     INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id
     WHERE sm.id = ? AND t.status = 'success'
     LIMIT 1`,
    squadMatchId
  )

  const row = rows[0]
  if (!row) {
    console.error('Aucune télémétrie exploitable')
    process.exit(1)
  }

  const memberKeys = Array.from(
    collectMemberKeys(
      row.positionSamples,
      row.landingSamples,
      row.deathSamples,
      row.knockoutSamples,
      row.reviveSamples
    )
  )

  const [clan, clanMembers, globalPlayers, encounteredPlayers, killEvents] = await Promise.all([
    prisma.clan.findUnique({ where: { id: clanId }, select: { tag: true } }),
    prisma.clanMember.findMany({
      where: { pubgAccountId: { in: memberKeys } },
      select: {
        displayName: true,
        pubgPlayerName: true,
        pubgAccountId: true,
        clanId: true,
        clan: { select: { tag: true } },
      },
    }),
    prisma.player.findMany({
      where: { pubgAccountId: { in: memberKeys } },
      select: {
        pubgAccountId: true,
        pubgPlayerName: true,
        opponentClan: { select: { tag: true } },
      },
    }),
    prisma.encounteredPlayer.findMany({
      where: { pubgAccountId: { in: memberKeys } },
      select: { pubgAccountId: true, pubgPlayerName: true, pubgClanTag: true },
    }),
    prisma.killEvent.findMany({
      where: { squadMatchId: row.squadMatchId },
      select: {
        id: true,
        killerAccountId: true,
        killerRawKey: true,
        victimAccountId: true,
        victimRawKey: true,
        weaponName: true,
        distance: true,
        headshot: true,
        timestampSeconds: true,
      },
      orderBy: { timestampSeconds: 'asc' },
    }),
  ])

  const identities = new Map<string, ReplayIdentity>()
  for (const player of encounteredPlayers) {
    const key = normalizeReplayKey(player.pubgAccountId)
    if (key) identities.set(key, { name: player.pubgPlayerName, clanTag: player.pubgClanTag, clanId: null })
  }
  for (const player of globalPlayers) {
    const key = normalizeReplayKey(player.pubgAccountId)
    if (key) {
      identities.set(key, {
        name: player.pubgPlayerName,
        clanTag: player.opponentClan?.tag ?? identities.get(key)?.clanTag ?? null,
        clanId: null,
      })
    }
  }
  for (const member of clanMembers) {
    const key = normalizeReplayKey(member.pubgAccountId)
    if (key) {
      identities.set(key, {
        name: member.displayName || member.pubgPlayerName,
        clanTag: member.clan?.tag ?? null,
        clanId: member.clanId,
      })
    }
  }

  const bounds = getMapBounds(row.mapName)
  const payload = buildMatchReplayPayload({
    match: {
      squadMatchId: row.squadMatchId,
      pubgMatchId: row.pubgMatchId,
      mapName: row.mapName,
      mapAssetKey: resolveMapAssetKey(row.mapName),
      mapLabel: resolveMapName(row.mapName),
      mapWidth: bounds.width,
      mapHeight: bounds.height,
      gameMode: resolveGameMode(row.gameMode),
      placement: row.placement,
      createdAt: row.createdAt,
    },
    matchStartEpochSeconds: row.createdAt.getTime() / 1000,
    currentClanId: clanId,
    currentClanTag: clan?.tag ?? null,
    identities,
    positionSamples: row.positionSamples,
    deathSamples: row.deathSamples,
    landingSamples: row.landingSamples,
    knockoutSamples: row.knockoutSamples,
    reviveSamples: row.reviveSamples,
    phaseSnapshots: row.phaseSnapshots,
    vehicleSamples: row.vehicleSamples,
    summary: row.summary,
    killEvents: killEvents as ReplayKillEventInput[],
    flightPath:
      computeFlightPathFromJumps(
        Array.from(
          extractInitialJumps(row.vehicleSamples, row.createdAt.getTime() / 1000).values()
        ),
        row.mapName
      ) ?? computeFlightPath(row.landingSamples, row.mapName),
  })

  const json = JSON.stringify({ ok: true, data: { ...payload, match: { ...payload.match, mapAssetUrl: mapAssetUrl(row.mapName) } } })

  const unnamed = payload.players.filter((p) => /^[0-9a-f]{8}$/i.test(p.n) || p.n === 'Bot')
  const byAff = { clan: 0, tracked: 0, external: 0 }
  for (const player of payload.players) {
    if (player.aff === 2) byAff.clan += 1
    else if (player.aff === 1) byAff.tracked += 1
    else byAff.external += 1
  }

  console.log('=== MATCH ===')
  console.log(payload.match)

  console.log('\n=== JOUEURS ===')
  console.log({
    total: payload.players.length,
    parAffiliation: byAff,
    sansNomResolu: unnamed.length,
    tauxResolution: `${Math.round(((payload.players.length - unnamed.length) / payload.players.length) * 100)}%`,
  })
  console.log(
    'escouade (clan + coéquipiers):',
    payload.players
      .filter((p) => p.sq)
      .map((p) => `${p.n}${p.aff === 2 ? '' : ' [hors clan]'} (team ${p.team}) vies ${JSON.stringify(p.l)}`)
  )
  const squadIndices = new Set(payload.players.filter((p) => p.sq).map((p) => p.i))
  const nameOf = (index: number | null) => (index === null ? '—' : payload.players[index]?.n ?? '?')
  console.log(
    'événements escouade:',
    payload.events
      .filter((e) => (e.a !== null && squadIndices.has(e.a)) || (e.v !== null && squadIndices.has(e.v)))
      .map((e) => `${e.t}s ${e.k} ${nameOf(e.a)} → ${nameOf(e.v)}`)
  )
  console.log('clans suivis:', payload.players.filter((p) => p.aff === 1).map((p) => `[${p.t}] ${p.n}`))
  console.log('5 externes:', payload.players.filter((p) => p.aff === 0).slice(0, 5).map((p) => `${p.n}${p.t ? ` [${p.t}]` : ''}`))

  console.log('\n=== ZONES ===')
  console.log({
    total: payload.zones.length,
    premiere: payload.zones[0],
    derniere: payload.zones[payload.zones.length - 1],
    avecCentreProchainCercle: payload.zones.filter((z) => z.px !== null).length,
  })

  console.log('\n=== EVENEMENTS ===')
  const counts = payload.events.reduce<Record<string, number>>((acc, e) => {
    acc[e.k] = (acc[e.k] ?? 0) + 1
    return acc
  }, {})
  console.log({
    total: payload.events.length,
    parType: counts,
    acteurNonResolu: payload.events.filter((e) => e.a === null).length,
    cibleNonResolue: payload.events.filter((e) => e.v === null).length,
  })
  console.log('3 premiers:', payload.events.slice(0, 3))

  console.log('\n=== POIDS RESEAU ===')
  console.log({
    jsonBrutKo: Math.round(json.length / 1024),
    gzipKo: Math.round(gzipSync(Buffer.from(json)).length / 1024),
  })

  console.log('\n=== FLIGHT PATH ===')
  console.log(payload.flightPath)

  console.log('\n=== AVIONS DE RAPPEL ===')
  console.log(
    payload.recallFlights.map((flight) => ({
      survol: `${Math.round(flight.timing.startT)}s → ${Math.round(flight.timing.endT)}s`,
      sauts: `${flight.timing.dropStartT.toFixed(1)}s → ${flight.timing.dropEndT.toFixed(1)}s`,
      vitesse: `${flight.timing.speedMetersPerSecond} m/s`,
      angle: flight.angleDeg,
      rappeles: flight.riders,
    }))
  )

  console.log('\n=== CAISSES DE LARGAGE ===')
  console.log({
    total: payload.crates.length,
    parType: payload.crates.reduce<Record<string, number>>((acc, crate) => {
      acc[crate.k] = (acc[crate.k] ?? 0) + 1
      return acc
    }, {}),
    pilleesParEscouade: payload.crates.filter((crate) => crate.sq).length,
  })

  console.log('\n=== ANCRAGE DES PISTES (debut de partie) ===')
  const withJump = payload.players.filter((player) => player.jump !== null)
  const firstPoints = payload.players
    .filter((player) => player.p.length >= 4)
    .map((player) => ({ t: player.p[0], x: player.p[1], y: player.p[2] }))
  console.log({
    joueursAvecSaut: withJump.length,
    joueursTotal: payload.players.length,
    premierEchantillonTMin: Math.min(...firstPoints.map((point) => point.t)),
    premierEchantillonTMax: Math.max(...firstPoints.map((point) => point.t)),
  })
  console.log(
    'Ecart au plan de vol (metres) des 5 premiers ancrages :',
    firstPoints.slice(0, 5).map((point) => {
      const flight = payload.flightPath
      if (!flight) return null
      const dx = flight.end.x - flight.start.x
      const dy = flight.end.y - flight.start.y
      const norm = Math.hypot(dx, dy) || 1
      const distance =
        Math.abs(dy * point.x - dx * point.y + flight.end.x * flight.start.y - flight.end.y * flight.start.x) /
        norm
      return Math.round(distance / 100)
    })
  )

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await prisma.$disconnect()
  process.exit(1)
})
