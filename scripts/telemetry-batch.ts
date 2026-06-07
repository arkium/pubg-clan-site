#!/usr/bin/env node

/**
 * CLI pour synchronisation télémétrie en batch
 *
 * Usages:
 *   npm run telemetry:batch -- --clan 1 --all-matches
 *   npm run telemetry:batch -- --all-clans --recalc-aggregates
 *   npm run telemetry:batch -- --clan 1 --recalc-aggregates-only
 *   npm run telemetry:batch -- --check --clan 1
 */

import 'dotenv/config'
import { prisma } from '@/lib/prisma'
import { enqueueTelemetryResyncJobs } from '@/lib/pubg-telemetry/resync-queue'
import { recalculateTelemetryPeriodAggregatesForClan } from '@/lib/pubg-telemetry/period-aggregates'

interface BatchArgs {
  clan?: number
  allClans?: boolean
  allMatches?: boolean
  recalcAggregates?: boolean
  recalcAggregatesOnly?: boolean
  resetBefore?: boolean
  check?: boolean
  verbose?: boolean
}

function parseArgs(): BatchArgs {
  const args: BatchArgs = {}

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i]

    if (arg === '--clan' && process.argv[i + 1]) {
      args.clan = Number(process.argv[++i])
    } else if (arg === '--all-clans') {
      args.allClans = true
    } else if (arg === '--all-matches') {
      args.allMatches = true
    } else if (arg === '--recalc-aggregates') {
      args.recalcAggregates = true
    } else if (arg === '--recalc-aggregates-only') {
      args.recalcAggregatesOnly = true
    } else if (arg === '--reset-before') {
      args.resetBefore = true
    } else if (arg === '--check') {
      args.check = true
    } else if (arg === '--verbose' || arg === '-v') {
      args.verbose = true
    }
  }

  return args
}

function log(message: string, level: 'info' | 'warn' | 'error' | 'debug' = 'info') {
  const timestamp = new Date().toISOString()
  const prefix = {
    info: '✓',
    warn: '⚠',
    error: '✗',
    debug: '→',
  }[level]

  console.log(`[${timestamp}] ${prefix} ${message}`)
}

async function getMatchesToSync(clanId: number, onlyRecent = false): Promise<string[]> {
  // Get all matches for the clan
  const matches = await prisma.squadMatch.findMany({
    where: {
      members: {
        some: {
          member: {
            clanId,
          },
        },
      },
    },
    select: {
      id: true,
      createdAt: true,
      telemetry: {
        select: { status: true, landingSamples: true }
      }
    },
    orderBy: { createdAt: 'desc' },
    take: onlyRecent ? 100 : undefined,
  })

  // Filter to only those needing sync
  const needsSync = matches.filter(m =>
    !m.telemetry ||
    m.telemetry.status !== 'success' ||
    m.telemetry.landingSamples === null
  )

  return needsSync.map((m) => m.id)
}

async function checkStatus(clanId?: number) {
  if (clanId) {
    const queuedCount = await prisma.cronExecution.count({
      where: {
        clanId,
        action: 'telemetry_resync_file',
        status: 'queued',
      },
    })

    const runningCount = await prisma.cronExecution.count({
      where: {
        clanId,
        action: 'telemetry_resync_file',
        status: 'running',
      },
    })

    const successCount = await prisma.cronExecution.count({
      where: {
        clanId,
        action: 'telemetry_resync_file',
        status: 'success',
      },
    })

    const failedCount = await prisma.cronExecution.count({
      where: {
        clanId,
        action: 'telemetry_resync_file',
        status: 'failed',
      },
    })

    log(`Clan ${clanId} queue: ${queuedCount} queued, ${runningCount} running, ${successCount} success, ${failedCount} failed`)
  } else {
    const totalQueued = await prisma.cronExecution.count({
      where: { action: 'telemetry_resync_file', status: 'queued' },
    })

    log(`Global queue: ${totalQueued} jobs pending`)
  }
}

async function main() {
  const args = parseArgs()

  if (args.verbose) {
    log('Arguments: ' + JSON.stringify(args), 'debug')
  }

  if (args.check) {
    log('Checking queue status...')
    await checkStatus(args.clan)
    return
  }

  if (args.recalcAggregatesOnly) {
    if (!args.clan && !args.allClans) {
      log('Error: --recalc-aggregates-only requires --clan or --all-clans', 'error')
      process.exit(1)
    }

    log('Recalculating aggregates...')

    if (args.clan) {
      const startTime = Date.now()
      const result = await recalculateTelemetryPeriodAggregatesForClan(args.clan)
      const duration = Date.now() - startTime

      log(`Recalculated ${result.summaries.length} periods in ${(duration / 1000).toFixed(2)}s`)
    } else if (args.allClans) {
      const clans = await prisma.clan.findMany({ select: { id: true } })
      const startTime = Date.now()
      let successCount = 0
      let errorCount = 0

      for (const clan of clans) {
        try {
          await recalculateTelemetryPeriodAggregatesForClan(clan.id)
          successCount++
        } catch (error) {
          log(`Clan ${clan.id}: ${error instanceof Error ? error.message : String(error)}`, 'warn')
          errorCount++
        }
      }

      const duration = Date.now() - startTime
      log(`Recalculated ${clans.length} clans (${successCount} success, ${errorCount} errors) in ${(duration / 1000).toFixed(2)}s`)
    }

    return
  }

  if (!args.clan && !args.allClans) {
    log('Error: --clan or --all-clans required', 'error')
    console.log(`
Usage:
  npm run telemetry:batch -- --clan 1 --all-matches
  npm run telemetry:batch -- --clan 1 [--recalc-aggregates] [--reset-before]
  npm run telemetry:batch -- --all-clans --recalc-aggregates-only
  npm run telemetry:batch -- --check [--clan 1]
    `)
    process.exit(1)
  }

  const resetBefore = args.resetBefore === true
  const recalcAggregates = args.recalcAggregates !== false

  if (args.clan) {
    log(`Syncing clan ${args.clan}...`)

    let matchIds: string[]

    if (args.allMatches) {
      matchIds = await getMatchesToSync(args.clan, false)
      log(`Found ${matchIds.length} matches needing sync`)
    } else {
      matchIds = await getMatchesToSync(args.clan, true)
      log(`Found ${matchIds.length} recent matches needing sync (sample)`)
    }

    if (matchIds.length === 0) {
      log('No matches to sync')
      return
    }

    const startTime = Date.now()
    const result = await enqueueTelemetryResyncJobs({
      clanId: args.clan,
      squadMatchIds: matchIds,
      resetBeforeSync: resetBefore,
      recalculateAggregates: recalcAggregates,
    })

    log(`Queued: ${result.queuedCount}, Already queued: ${result.alreadyQueuedCount}`)

    if (recalcAggregates && result.queuedCount > 0) {
      log('Recalculate aggregates is enabled - will run after resync completes')
    }

    const duration = Date.now() - startTime
    log(`Batch enqueued in ${(duration / 1000).toFixed(2)}s`)
  } else if (args.allClans) {
    log('Syncing all clans...')

    const clans = await prisma.clan.findMany({
      select: { id: true },
      where: { members: { some: {} } },
    })

    log(`Processing ${clans.length} clans`)

    let totalQueued = 0
    let totalErrors = 0

    for (const clan of clans) {
      try {
        const matchIds = await getMatchesToSync(clan.id, true)

        if (matchIds.length === 0) {
          if (args.verbose) {
            log(`Clan ${clan.id}: no matches to sync`, 'debug')
          }
          continue
        }

        const result = await enqueueTelemetryResyncJobs({
          clanId: clan.id,
          squadMatchIds: matchIds,
          resetBeforeSync: resetBefore,
          recalculateAggregates: recalcAggregates,
        })

        totalQueued += result.queuedCount

        if (result.queuedCount > 0) {
          log(`Clan ${clan.id}: queued ${result.queuedCount}`)
        }
      } catch (error) {
        totalErrors++
        log(`Clan ${clan.id}: ${error instanceof Error ? error.message : String(error)}`, 'error')
      }
    }

    log(`Total queued: ${totalQueued} matches across ${clans.length} clans (${totalErrors} errors)`)
  }

  log('Batch processing started. Monitor with: npm run telemetry:worker')
}

main()
  .catch((error) => {
    log(error instanceof Error ? error.message : String(error), 'error')
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
