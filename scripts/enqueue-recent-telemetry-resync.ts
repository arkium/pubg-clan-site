/**
 * Remet en file (`telemetry_live_sync`, traitée par `telemetry-resync-worker`) les matchs récents analysés avant le
 * déploiement du 2026-09-16 : sans zones de tirs ni de dégâts, sans cellules de positions, et avec un lobby réduit pour
 * ceux passés par l'ancien « Resync ce match ». Le worker les re-télécharge depuis le CDN PUBG, qui ne garde la
 * télémétrie que ~14 jours : les plus anciens passent en premier.
 *
 * Usage :
 *   npx tsx scripts/enqueue-recent-telemetry-resync.ts                 # simulation : volume, durée, stockage
 *   npx tsx scripts/enqueue-recent-telemetry-resync.ts --yes           # met en file
 *   npx tsx scripts/enqueue-recent-telemetry-resync.ts --report        # avancement + matchs dégradés en « failed »
 *   npx tsx scripts/enqueue-recent-telemetry-resync.ts --restore-downgraded --since 2026-09-16T20:00:00Z [--yes]
 *
 * Options : --days 14 · --parsed-before 2026-09-16T19:10:00Z · --clan <id> · --limit <n>
 *
 * Risque connu : un échec de synchronisation (télémétrie expirée entre-temps, erreur réseau) repasse un match
 * `success` en `failed` sans effacer son JSON (`upsertFailedTelemetrySnapshot`). `--report` les liste,
 * `--restore-downgraded` leur rend le statut `success`.
 */
import 'dotenv/config'

import { Prisma } from '@prisma/client'

import { TELEMETRY_LIVE_SYNC_QUEUE_ACTION } from '@/lib/pubg-telemetry/live-sync-queue'
import { prisma } from '@/lib/prisma'

// Premier parsing de production qui écrit des `PositionMetricCell` après le 31/07 : le nouveau code tourne depuis.
const DEFAULT_PARSED_BEFORE = '2026-09-16T19:10:00Z'
// Mesures du 2026-09-16 : ~6,5 s par match côté worker, ~117 cellules × 614 octets par match.
const SECONDS_PER_MATCH = 6.5
const CELL_BYTES_PER_MATCH = 117 * 614

function readOption(flag: string) {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

function readPositiveInteger(flag: string) {
  const raw = readOption(flag)
  if (raw === undefined) return undefined
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${flag} attend un entier positif`)
  return value
}

function readDate(flag: string, fallback?: string) {
  const raw = readOption(flag) ?? fallback
  if (!raw) return undefined
  const value = new Date(raw)
  if (Number.isNaN(value.getTime())) throw new Error(`${flag} attend une date ISO`)
  return value
}

type Candidate = { squadMatchId: string; pubgMatchId: string; createdAt: Date }

async function listCandidates(input: { days: number; parsedBefore: Date; clanId?: number; limit?: number }) {
  const clanFilter = input.clanId
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM SquadMember sdm INNER JOIN ClanMember cm ON cm.id = sdm.memberId
        WHERE sdm.squadMatchId = sm.id AND cm.clanId = ${input.clanId})`
    : Prisma.empty
  const limit = input.limit ? Prisma.sql`LIMIT ${input.limit}` : Prisma.empty

  return prisma.$queryRaw<Candidate[]>(Prisma.sql`
    SELECT sm.id AS squadMatchId, sm.pubgMatchId, sm.createdAt
    FROM SquadMatch sm
    INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id
    WHERE sm.createdAt >= NOW() - INTERVAL ${input.days} DAY
      AND sm.matchType <> 'airoyale'
      AND t.status = 'success'
      AND t.parsedAt < ${input.parsedBefore}
      AND NOT EXISTS (
        SELECT 1 FROM CronExecution q
        WHERE q.action = ${TELEMETRY_LIVE_SYNC_QUEUE_ACTION}
          AND q.status IN ('queued', 'running')
          AND JSON_UNQUOTE(JSON_EXTRACT(q.details, '$.squadMatchId')) = sm.id
      )
      ${clanFilter}
    ORDER BY sm.createdAt ASC
    ${limit}
  `)
}

async function resolvePlayers(squadMatchIds: string[], preferredClanId?: number) {
  const players = new Map<string, { clanId: number; anyPlayerId: string; shard: string }>()
  for (let offset = 0; offset < squadMatchIds.length; offset += 1000) {
    const chunk = squadMatchIds.slice(offset, offset + 1000)
    const rows = await prisma.squadMember.findMany({
      where: { squadMatchId: { in: chunk }, member: { pubgAccountId: { not: null } } },
      select: { squadMatchId: true, member: { select: { clanId: true, pubgAccountId: true, platformShard: true } } },
      orderBy: { memberId: 'asc' },
    })
    for (const row of rows) {
      // Membre sans clan : `CronExecution.clanId` est obligatoire.
      if (row.member.clanId === null) continue
      const current = players.get(row.squadMatchId)
      const preferred = preferredClanId !== undefined && row.member.clanId === preferredClanId
      if (current && !(preferred && current.clanId !== preferredClanId)) continue
      players.set(row.squadMatchId, {
        clanId: row.member.clanId,
        anyPlayerId: row.member.pubgAccountId!,
        shard: row.member.platformShard,
      })
    }
  }
  return players
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.round((seconds % 3600) / 60)
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`
}

async function enqueue(write: boolean) {
  const days = readPositiveInteger('--days') ?? 14
  const parsedBefore = readDate('--parsed-before', DEFAULT_PARSED_BEFORE)!
  const clanId = readPositiveInteger('--clan')
  const limit = readPositiveInteger('--limit')

  const candidates = await listCandidates({ days, parsedBefore, clanId, limit })
  const players = await resolvePlayers(candidates.map((candidate) => candidate.squadMatchId), clanId)
  const queueable = candidates.filter((candidate) => players.has(candidate.squadMatchId))

  const perDay = new Map<string, number>()
  const perClan = new Map<number, number>()
  for (const candidate of queueable) {
    const day = candidate.createdAt.toISOString().slice(0, 10)
    perDay.set(day, (perDay.get(day) ?? 0) + 1)
    const owner = players.get(candidate.squadMatchId)!.clanId
    perClan.set(owner, (perClan.get(owner) ?? 0) + 1)
  }

  console.log(`Matchs des ${days} derniers jours analysés avant ${parsedBefore.toISOString()} : ${candidates.length}`)
  console.log(`Sans joueur exploitable (ignorés) : ${candidates.length - queueable.length}`)
  console.log('Par jour de match :', Object.fromEntries(perDay))
  console.log('Par clan porteur du job :', Object.fromEntries([...perClan].sort((a, b) => b[1] - a[1]).map(([id, n]) => [`clan ${id}`, n])))
  console.log(`Durée estimée côté worker : ${formatDuration(queueable.length * SECONDS_PER_MATCH)}`)
  console.log(`Cellules de positions ajoutées : ~${Math.round((queueable.length * CELL_BYTES_PER_MATCH) / 1024 / 1024)} Mo`)

  if (!write) {
    console.log('\nSimulation : rien n’a été mis en file. Relancer avec --yes pour appliquer.')
    return
  }

  // `startedAt` croissant : le worker prend la file par `startedAt` croissant, donc du match le plus ancien au plus récent.
  const base = Date.now()
  let queued = 0
  for (let offset = 0; offset < queueable.length; offset += 500) {
    const chunk = queueable.slice(offset, offset + 500)
    const result = await prisma.cronExecution.createMany({
      data: chunk.map((candidate, index) => {
        const player = players.get(candidate.squadMatchId)!
        return {
          clanId: player.clanId,
          action: TELEMETRY_LIVE_SYNC_QUEUE_ACTION,
          status: 'queued',
          source: 'scheduler',
          message: 'Queued for telemetry live-sync worker (resync récent 2026-09-16)',
          startedAt: new Date(base + offset + index),
          details: {
            squadMatchId: candidate.squadMatchId,
            pubgMatchId: candidate.pubgMatchId,
            anyPlayerId: player.anyPlayerId,
            shard: player.shard,
          },
        }
      }),
    })
    queued += result.count
  }
  console.log(`\n${queued} match(s) mis en file. Suivi : npx tsx scripts/enqueue-recent-telemetry-resync.ts --report`)
}

async function report() {
  const parsedBefore = readDate('--parsed-before', DEFAULT_PARSED_BEFORE)!
  const days = readPositiveInteger('--days') ?? 14

  const queue = await prisma.$queryRaw<Array<{ status: string; n: bigint }>>(Prisma.sql`
    SELECT status, COUNT(*) AS n FROM CronExecution
    WHERE action = ${TELEMETRY_LIVE_SYNC_QUEUE_ACTION} AND startedAt >= NOW() - INTERVAL 2 DAY
    GROUP BY status`)
  console.log('File live-sync (2 derniers jours) :', Object.fromEntries(queue.map((row) => [row.status, Number(row.n)])))

  const [remaining] = await prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
    SELECT COUNT(*) AS n FROM SquadMatch sm INNER JOIN SquadMatchTelemetry t ON t.squadMatchId = sm.id
    WHERE sm.createdAt >= NOW() - INTERVAL ${days} DAY AND sm.matchType <> 'airoyale'
      AND t.status = 'success' AND t.parsedAt < ${parsedBefore}`)
  console.log(`Matchs encore analysés avec l'ancien code : ${Number(remaining.n)}`)

  const downgraded = await prisma.$queryRaw<Array<{ errorCode: string | null; n: bigint }>>(Prisma.sql`
    SELECT t.errorCode, COUNT(*) AS n FROM SquadMatchTelemetry t
    WHERE t.status = 'failed' AND t.lastAttemptAt >= ${parsedBefore}
      AND t.positionSamples IS NOT NULL AND JSON_LENGTH(t.positionSamples) > 0
    GROUP BY t.errorCode`)
  console.log('Matchs repassés en failed avec leurs données intactes :',
    Object.fromEntries(downgraded.map((row) => [row.errorCode ?? 'sans code', Number(row.n)])))
}

async function restoreDowngraded(write: boolean) {
  const since = readDate('--since')
  if (!since) throw new Error('--restore-downgraded exige --since <date ISO du lancement>')

  const where = Prisma.sql`
    WHERE status = 'failed' AND lastAttemptAt >= ${since}
      AND positionSamples IS NOT NULL AND JSON_LENGTH(positionSamples) > 0`
  const [count] = await prisma.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`SELECT COUNT(*) AS n FROM SquadMatchTelemetry ${where}`)
  console.log(`Matchs à remettre en success : ${Number(count.n)}`)
  if (!write) {
    console.log('Simulation : relancer avec --yes pour appliquer.')
    return
  }
  const updated = await prisma.$executeRaw(Prisma.sql`
    UPDATE SquadMatchTelemetry SET status = 'success', nextRetryAt = NULL, errorCode = NULL, errorMessage = NULL ${where}`)
  console.log(`${updated} match(s) remis en success.`)
}

async function main() {
  const write = process.argv.includes('--yes')
  if (process.argv.includes('--report')) return report()
  if (process.argv.includes('--restore-downgraded')) return restoreDowngraded(write)
  return enqueue(write)
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
