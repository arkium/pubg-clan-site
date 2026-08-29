const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function cleanup() {
  console.log("Recherche du clan FR-Alliance-BE...")
  
  const frAlliancePubgId = 'clan.a8d9d04240544036938b4f7a5cf74384'

  const clan = await prisma.clan.findFirst({
    where: { pubgClanId: frAlliancePubgId }
  })

  if (!clan) {
    console.log("Clan FR-Alliance-BE introuvable.")
    return
  }

  // Tous les membres qui ont été ajoutés APRÈS le 28 Août 2026 
  // (c'est-à-dire les membres de teambaguette importés par erreur aujourd'hui)
  const today = new Date('2026-08-29T00:00:00Z')

  console.log(`Désactivation des membres ajoutés par erreur au clan ${clan.id} depuis le ${today.toISOString()}...`)

  const result = await prisma.clanMember.updateMany({
    where: {
      clanId: clan.id,
      isActive: true,
      createdAt: {
        gte: today
      }
    },
    data: {
      isActive: false,
      joinStatus: 'left' // on les marque comme partis
    }
  })

  console.log(`${result.count} joueurs (incluant Roland-CLR) ont été retirés de FR-Alliance-BE avec succès !`)
  console.log("Ils n'apparaîtront plus avec le badge 'Membre de FR'.")
}

cleanup().catch(console.error).finally(() => prisma.$disconnect())
