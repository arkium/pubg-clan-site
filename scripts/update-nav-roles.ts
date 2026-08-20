import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Mise à jour des rôles par défaut de la navigation...')

  const keysToUpdate = [
    'clan.overview',
    'clan.members',
    'clan.stats-weapons',
    'clan.stats-weapons-categories',
    'clan.heatmap-kills',
    'clan.positions',
    'clan.drop-zones'
  ]

  for (const key of keysToUpdate) {
    const updated = await prisma.navItem.updateMany({
      where: { navKey: key },
      data: { defaultRole: 'none' }
    })
    console.log(`- ${key}: ${updated.count > 0 ? 'Mise à jour (none)' : 'Introuvable'}`)
  }

  console.log('Terminé !')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
