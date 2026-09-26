import { PrismaClient } from '@prisma/client'

/**
 * Entrée « Accueil » du menu latéral (`primary.home` → `/`) dans la table NavItem — docs/features/accueil.md.
 *
 * Sans cette ligne, l'entrée s'affiche déjà (ClanNavigation) ; la ligne sert à la masquer ou la renommer depuis
 * /settings/nav-permissions. Simulation par défaut ; `--apply` pour écrire.
 *
 *   npx tsx scripts/seed-home-nav.ts           # affiche l'état et ce qui serait écrit
 *   npx tsx scripts/seed-home-nav.ts --apply   # écrit (upsert, sans toucher aux autres entrées)
 */

const prisma = new PrismaClient()

const ITEM = {
  navKey: 'primary.home',
  section: 'nav-primary',
  label: 'Accueil',
  hrefTemplate: '/',
  defaultRole: 'none',
  description: 'Vitrine publique du site : compteurs, kill feed et derniers Top 1 (plein écran, hors shell).',
}

async function main() {
  const apply = process.argv.includes('--apply')
  const existing = await prisma.navItem.findUnique({ where: { navKey: ITEM.navKey } })
  console.log(existing ? `Existant : ${JSON.stringify(existing)}` : 'Aucune ligne primary.home en base.')

  if (!apply) {
    console.log(`Simulation — serait écrit : ${JSON.stringify(ITEM)} (sortOrder 0 à la création). Relancer avec --apply.`)
    return
  }

  await prisma.navItem.upsert({
    where: { navKey: ITEM.navKey },
    update: { section: ITEM.section, hrefTemplate: ITEM.hrefTemplate, description: ITEM.description },
    create: { ...ITEM, sortOrder: 0 },
  })
  console.log('Entrée primary.home écrite.')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })
