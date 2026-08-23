// @ts-nocheck
import { PrismaClient } from '@prisma/client'
import { fetchMatchResponse } from '../lib/pubg'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting matchType backfill for the last 14 days...')

  const fourteenDaysAgo = new Date()
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)

  // 1. Get all distinct match IDs within the last 14 days
  const matchRecords = await prisma.match.findMany({
    where: {
      pubgCreatedAt: { gte: fourteenDaysAgo },
    },
    select: {
      pubgMatchId: true,
      matchType: true,
      member: {
        select: { platformShard: true }
      }
    },
    distinct: ['pubgMatchId'],
  })

  // We only want to process matches that are currently 'official' 
  // (because casual/custom might have been tagged already by today's code)
  const matchesToProcess = matchRecords.filter(m => m.matchType === 'official')

  console.log(`Found ${matchesToProcess.length} unique recent matches to check.`)

  let updatedCount = 0
  let errorCount = 0
  let casualCount = 0
  let customCount = 0

  for (let i = 0; i < matchesToProcess.length; i++) {
    const { pubgMatchId, member } = matchesToProcess[i]
    const shard = member.platformShard

    try {
      // Fetch match details from PUBG API
      // The queuedPubgGet inside fetchMatchResponse will handle rate limits automatically
      const { match } = await fetchMatchResponse(pubgMatchId, shard)

      if (match?.attributes?.matchType) {
        let newType = 'official'
        if (match.attributes.matchType === 'casual') newType = 'casual'
        if (match.attributes.matchType === 'custom') newType = 'custom'

        if (newType !== 'official') {
          // Update both Match and SquadMatch tables
          await prisma.match.updateMany({
            where: { pubgMatchId },
            data: { matchType: newType },
          })
          
          await prisma.squadMatch.updateMany({
            where: { pubgMatchId },
            data: { matchType: newType },
          })
          
          if (newType === 'casual') casualCount++
          if (newType === 'custom') customCount++
          updatedCount++
          console.log(`[${i + 1}/${matchesToProcess.length}] Updated match ${pubgMatchId} to ${newType}`)
        } else {
          console.log(`[${i + 1}/${matchesToProcess.length}] Match ${pubgMatchId} remains official`)
        }
      } else {
         console.log(`[${i + 1}/${matchesToProcess.length}] Warning: Match ${pubgMatchId} missing matchType in API`)
      }
    } catch (err) {
      errorCount++
      console.error(`[${i + 1}/${matchesToProcess.length}] Error fetching match ${pubgMatchId}:`, err instanceof Error ? err.message : err)
    }
  }

  console.log('\n--- BACKFILL COMPLETE ---')
  console.log(`Matches processed: ${matchesToProcess.length}`)
  console.log(`Matches updated: ${updatedCount} (Casual: ${casualCount}, Custom: ${customCount})`)
  console.log(`Errors: ${errorCount}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
