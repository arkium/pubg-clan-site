/**
 * Coût réel de l'étape d'écriture d'une purge — SANS RIEN SUPPRIMER.
 *
 * L'UPDATE est exécuté dans une transaction volontairement annulée (ROLLBACK) : la durée est
 * mesurée, les données sont intégralement restaurées. Aucune ligne n'est modifiée durablement.
 *
 * Usage : npx tsx scripts/check-purge-update-cost.ts [taille=50]
 */
import { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/prisma'

class Rollback extends Error {}

async function main() {
  const taille = Number(process.argv[2]) || 50
  const cutoff = new Date(Date.now() - 14 * 24 * 3600 * 1000)

  const tSel = Date.now()
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM SquadMatchTelemetry
    WHERE (positionSamples IS NOT NULL OR trajectorySegments IS NOT NULL)
      AND COALESCE(sourceGeneratedAt, parsedAt, createdAt) < ${cutoff}
    LIMIT ${taille}`
  const selSec = (Date.now() - tSel) / 1000
  console.log(`Sélection de ${rows.length} identifiants : ${selSec.toFixed(1)}s`)

  if (rows.length === 0) {
    console.log('Aucun candidat : rien à mesurer.')
    return
  }
  const ids = rows.map((r) => r.id)

  let updSec = 0
  const tTx = Date.now()
  try {
    await prisma.$transaction(
      async (tx) => {
        const tUpd = Date.now()
        const n = await tx.$executeRaw`
          UPDATE SquadMatchTelemetry
          SET positionSamples = NULL, trajectorySegments = NULL
          WHERE id IN (${Prisma.join(ids)})`
        updSec = (Date.now() - tUpd) / 1000
        console.log(`UPDATE de ${n} lignes : ${updSec.toFixed(1)}s`)
        throw new Rollback('annulation volontaire')
      },
      { timeout: 300_000, maxWait: 15_000 }
    )
  } catch (err) {
    if (!(err instanceof Rollback)) throw err
  }
  console.log(`Transaction annulée (UPDATE + ROLLBACK) : ${((Date.now() - tTx) / 1000).toFixed(1)}s`)

  const [ctrl] = await prisma.$queryRaw<Array<{ restants: bigint }>>`
    SELECT COUNT(*) AS restants FROM SquadMatchTelemetry
    WHERE id IN (${Prisma.join(ids)}) AND positionSamples IS NOT NULL`
  console.log(`Contrôle de restauration : ${Number(ctrl?.restants)} / ${ids.length} lignes ont toujours leur géoloc`)

  const parLot = selSec * (250 / taille) + updSec * (250 / taille)
  console.log(`\nExtrapolation pour un lot de 250 : ~${parLot.toFixed(0)}s`)
  console.log(`13 lots (3 103 matchs > 14 j) : ~${((parLot * 13) / 60).toFixed(1)} min, hors dernier lot (scan complet).`)
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
