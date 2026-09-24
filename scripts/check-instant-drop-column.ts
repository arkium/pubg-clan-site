/**
 * La suppression d'une colonne est-elle instantanée sous cette version de MariaDB ?
 *
 * Question décisive pour la compression de la télémétrie : si `DROP COLUMN` exigeait une
 * reconstruction, retirer l'ancienne colonne en clair se heurterait au même mur d'espace disque
 * que `OPTIMIZE TABLE`. Le test porte sur une table jetable, créée puis supprimée.
 *
 * Usage : npx tsx scripts/check-instant-drop-column.ts
 */
import 'dotenv/config'

import { prisma } from '../src/lib/prisma'

const TABLE = '_claude_instant_drop_test'

async function main() {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${TABLE}\``)
  await prisma.$executeRawUnsafe(
    `CREATE TABLE \`${TABLE}\` (id INT PRIMARY KEY, ancienne LONGTEXT, nouvelle LONGBLOB) ROW_FORMAT=DYNAMIC`
  )
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE \`${TABLE}\` DROP COLUMN ancienne, ALGORITHM=INSTANT`)
    console.log('✔ DROP COLUMN … ALGORITHM=INSTANT accepté : aucune reconstruction, aucun besoin d’espace disque.')
  } catch (error) {
    console.log(`✘ DROP COLUMN INSTANT refusé : ${error instanceof Error ? error.message.split('\n')[0] : error}`)
    console.log('  → retirer l’ancienne colonne exigerait une reconstruction (même mur que OPTIMIZE).')
  } finally {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${TABLE}\``)
    console.log('Table de test supprimée.')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
