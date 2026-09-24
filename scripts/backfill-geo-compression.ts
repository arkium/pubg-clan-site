/**
 * Rattrapage : compresse la géolocalisation des matchs encore stockée en clair.
 *
 * Lit `positionSamples` / `trajectorySegments`, écrit leur version gzip dans `*Gz` et vide les
 * colonnes en clair. Gain mesuré : ~8×, soit ~19 Go de JSON ramenés à ~2 Go de données utiles.
 *
 * Le fichier `.ibd` ne rétrécit pas pour autant — l'espace libéré reste *à l'intérieur* et sera
 * réutilisé par les écritures suivantes. C'est précisément l'intérêt : la base cesse de grossir
 * sans jamais exiger la reconstruction complète qu'imposerait un `OPTIMIZE TABLE` (~22 Go d'espace
 * disque libre, indisponibles).
 *
 * Par lots, interruptible (Ctrl+C entre deux lots), reprenable : un match déjà compressé n'est
 * jamais resélectionné.
 *
 * ⚠️ À ne lancer qu'une fois les **lectures** déployées sur les quatre services
 * (web, telemetry-worker, cron, aggregates). Sinon un service encore à l'ancien code afficherait
 * des cartes vides pour les matchs rattrapés.
 *
 * Usage :
 *   npx tsx scripts/backfill-geo-compression.ts --dry-run
 *   npx tsx scripts/backfill-geo-compression.ts [--batch 50] [--limit 1000]
 */
import 'dotenv/config'

import { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/prisma'
import { encodeGeoColumn } from '../src/lib/pubg-telemetry/geo-codec'

function lireEntier(drapeau: string, defaut: number) {
  const index = process.argv.indexOf(drapeau)
  if (index < 0) return defaut
  const valeur = Number(process.argv[index + 1])
  if (!Number.isInteger(valeur) || valeur <= 0) throw new Error(`${drapeau} attend un entier positif`)
  return valeur
}

const mo = (octets: number) => `${(octets / 1024 / 1024).toFixed(1)} Mo`

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const batch = Math.min(lireEntier('--batch', 50), 200)
  const limit = lireEntier('--limit', 1_000_000)

  let traites = 0
  let octetsAvant = 0
  let octetsApres = 0
  const debut = Date.now()

  console.log(`Rattrapage de compression${dryRun ? ' (simulation, aucune écriture)' : ''} — lots de ${batch}.`)

  for (;;) {
    if (traites >= limit) break

    // La sélection ne lit que les identifiants : elle ne charge pas les blobs.
    const candidats = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM SquadMatchTelemetry
      WHERE (positionSamples IS NOT NULL OR trajectorySegments IS NOT NULL)
      LIMIT ${Math.min(batch, limit - traites)}
    `)
    if (candidats.length === 0) break

    for (const { id } of candidats) {
      const [ligne] = await prisma.$queryRaw<
        Array<{ positionSamples: string | null; trajectorySegments: string | null }>
      >(Prisma.sql`
        SELECT CAST(positionSamples AS CHAR) AS positionSamples,
               CAST(trajectorySegments AS CHAR) AS trajectorySegments
        FROM SquadMatchTelemetry WHERE id = ${id}
      `)
      if (!ligne) continue

      const avant =
        Buffer.byteLength(ligne.positionSamples ?? '', 'utf8') +
        Buffer.byteLength(ligne.trajectorySegments ?? '', 'utf8')

      const positions = ligne.positionSamples ? JSON.parse(ligne.positionSamples) : null
      const trajets = ligne.trajectorySegments ? JSON.parse(ligne.trajectorySegments) : null
      const positionsGz = encodeGeoColumn(positions)
      const trajetsGz = encodeGeoColumn(trajets)

      octetsAvant += avant
      octetsApres += (positionsGz?.length ?? 0) + (trajetsGz?.length ?? 0)

      if (!dryRun) {
        await prisma.$executeRaw(Prisma.sql`
          UPDATE SquadMatchTelemetry
          SET positionSamples = NULL,
              trajectorySegments = NULL,
              positionSamplesGz = ${positionsGz},
              trajectorySegmentsGz = ${trajetsGz}
          WHERE id = ${id}
        `)
      }
      traites += 1
    }

    console.log(
      `  ${traites} matchs — ${mo(octetsAvant)} -> ${mo(octetsApres)} ` +
        `(${octetsApres > 0 ? (octetsAvant / octetsApres).toFixed(1) : '—'}x)`
    )

    // En simulation, rien n'est écrit : la même sélection reviendrait indéfiniment.
    if (dryRun) break
  }

  console.log(
    `\nTerminé : ${traites} matchs en ${((Date.now() - debut) / 1000).toFixed(0)}s. ` +
      `${mo(octetsAvant)} -> ${mo(octetsApres)}${dryRun ? ' (simulation)' : ''}.`
  )
  if (!dryRun && traites > 0) {
    console.log(
      'L’espace libéré reste dans le fichier .ibd et sera réutilisé par les écritures suivantes ; ' +
        'aucun OPTIMIZE n’est nécessaire ni souhaitable.'
    )
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
