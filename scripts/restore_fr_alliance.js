const { PrismaClient } = require('@prisma/client')

// ATTENTION : Si vous exécutez ce script, assurez-vous que la variable d'environnement
// DATABASE_URL pointe bien vers la base de données de production.
const prisma = new PrismaClient()

async function restore() {
  console.log("Recherche du clan écrasé (qui s'appelle actuellement teambaguette)...")
  
  // L'ID pubg de teambaguette
  const teambaguettePubgId = 'clan.4470512d508d4aa59b4277520d4535f1'
  // L'ID pubg original de FR-Alliance-BE
  const frAlliancePubgId = 'clan.a8d9d04240544036938b4f7a5cf74384'

  const clan = await prisma.clan.findFirst({
    where: { pubgClanId: teambaguettePubgId }
  })

  if (!clan) {
    console.log("Aucun clan trouvé avec le pubgClanId de teambaguette. Rien à restaurer.")
    return
  }

  console.log(`Clan trouvé avec l'ID interne ${clan.id}. Restauration des données de FR-Alliance-BE...`)

  await prisma.clan.update({
    where: { id: clan.id },
    data: {
      name: 'FR-Alliance-BE',
      tag: 'FR',
      pubgClanId: frAlliancePubgId
    }
  })

  console.log("Restauration terminée !")
  console.log("Vous pouvez maintenant resynchroniser manuellement ce clan dans l'interface (paramètres du clan -> Forcer la synchro) pour être sûr que tout est à jour.")
}

restore().catch(console.error).finally(() => prisma.$disconnect())
