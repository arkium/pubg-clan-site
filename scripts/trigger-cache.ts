import { precomputeClanMatchesStats } from '../src/lib/matches-cache-service'
import { prisma } from '../src/lib/prisma'

async function run() {
  const activeClans = await prisma.clan.findMany({
    where: { isActive: true },
    select: { id: true, name: true }
  })

  for (const clan of activeClans) {
    console.log(`Pré-calcul des statistiques pour le clan ${clan.name} (${clan.id})...`)
    await precomputeClanMatchesStats(clan.id)
    console.log(`Cache généré avec succès pour le clan ${clan.name} (${clan.id}).`)
  }
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err)
    process.exit(1)
  })
