// @ts-nocheck
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting backfill of lastMatchAt for ClanMember and Clan...')

  // 1. Get max match pubgCreatedAt per member
  const memberMatches = await prisma.match.groupBy({
    by: ['memberId'],
    _max: {
      pubgCreatedAt: true,
    },
  })

  console.log(`Found match records for ${memberMatches.length} members.`)

  let membersUpdated = 0
  for (const record of memberMatches) {
    if (record._max.pubgCreatedAt) {
      await prisma.clanMember.update({
        where: { id: record.memberId },
        data: { lastMatchAt: record._max.pubgCreatedAt },
      })
      membersUpdated++
    }
  }

  console.log(`Updated lastMatchAt for ${membersUpdated} members.`)

  // 2. Update clans with the latest lastMatchAt among their members
  const clans = await prisma.clan.findMany({
    select: { id: true, name: true },
  })

  let clansUpdated = 0
  for (const clan of clans) {
    const latestMemberMatch = await prisma.clanMember.findFirst({
      where: {
        clanId: clan.id,
        lastMatchAt: { not: null },
      },
      orderBy: {
        lastMatchAt: 'desc',
      },
      select: {
        lastMatchAt: true,
      },
    })

    if (latestMemberMatch?.lastMatchAt) {
      await prisma.clan.update({
        where: { id: clan.id },
        data: { lastMatchAt: latestMemberMatch.lastMatchAt },
      })
      clansUpdated++
      console.log(`Clan ${clan.name} (id: ${clan.id}) lastMatchAt set to ${latestMemberMatch.lastMatchAt.toISOString()}`)
    }
  }

  console.log(`Updated lastMatchAt for ${clansUpdated} clans. Backfill complete!`)
}

main()
  .catch((e) => {
    console.error('Error during lastMatchAt backfill:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
