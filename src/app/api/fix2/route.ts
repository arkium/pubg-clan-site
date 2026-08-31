import { fetchClanMembers } from '@/lib/pubg'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    console.log("Starting force add...")
    const clan = await prisma.clan.findUnique({ where: { id: 13 } })
    if (!clan || !clan.pubgClanId) throw new Error('Clan introuvable')

    const pubgMembers = await fetchClanMembers(clan.pubgClanId, clan.platformShard, { clanId: clan.id })
    console.log("Found members:", pubgMembers.length)

    let addedCount = 0
    for (const m of pubgMembers) {
      const exists = await prisma.clanMember.findFirst({
        where: { clanId: 13, pubgAccountId: m.accountId }
      })

      if (!exists) {
        await prisma.clanMember.create({
          data: {
            clanId: 13,
            pubgAccountId: m.accountId,
            pubgPlayerName: m.name || m.accountId,
            displayName: m.name || m.accountId,
            platformShard: clan.platformShard,
            isActive: true,
            joinStatus: 'active',
          }
        })
        addedCount++
      }
    }

    console.log("Added", addedCount)
    return Response.json({ success: true, addedCount })
  } catch (error: any) {
    console.error("Error in fix2:", error)
    return Response.json({ error: String(error.message || error) }, { status: 500 })
  }
}
