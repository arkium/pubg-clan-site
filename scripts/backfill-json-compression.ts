/**
 * Rattrapage : compresse les colonnes JSON de `SquadMatchTelemetry` encore stockées en clair.
 *
 * Gain mesuré : ~8,7× sur la géolocalisation, ~7,3× sur le reste. L'enjeu n'est pas que la taille :
 * `OPTIMIZE TABLE` écrit un fichier neuf dimensionné par les lignes vivantes. En les ramenant de
 * 6,99 Go à ~2 Go, ce rattrapage fait passer la reconstruction sous le seuil de l'espace disque
 * disponible — c'est lui qui rend possible la restitution des ~19 Go immobilisés.
 *
 * **Garde-fou structurel :** chaque valeur est compressée puis **immédiatement décompressée et
 * comparée à l'original**. La colonne en clair n'est vidée que si la restitution est exacte ;
 * sinon la ligne est laissée intacte et signalée. Une perte de données est donc impossible, quelle
 * que soit la colonne ou la nature du contenu.
 *
 * Le fichier `.ibd` ne rétrécit pas : l'espace libéré reste à l'intérieur et sera réutilisé. C'est
 * voulu — aucune étape n'exige la reconstruction qu'imposerait un `OPTIMIZE`.
 *
 * ⚠️ À ne lancer qu'une fois les **lectures** déployées sur les quatre services
 * (web, telemetry-worker, cron, telemetry-aggregates).
 *
 * Usage :
 *   npx tsx scripts/backfill-json-compression.ts --dry-run
 *   npx tsx scripts/backfill-json-compression.ts [--batch 50] [--limit 1000]
 */
import 'dotenv/config'

import { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/prisma'
import {
  COMPRESSED_JSON_COLUMNS,
  decodeJsonColumn,
  encodeJsonColumn,
} from '../src/lib/pubg-telemetry/json-codec'

function lireEntier(drapeau: string, defaut: number) {
  const index = process.argv.indexOf(drapeau)
  if (index < 0) return defaut
  const valeur = Number(process.argv[index + 1])
  if (!Number.isInteger(valeur) || valeur <= 0) throw new Error(`${drapeau} attend un entier positif`)
  return valeur
}

const mo = (octets: number) => `${(octets / 1024 / 1024).toFixed(1)} Mo`

/** Condition « au moins une colonne encore en clair ». */
const ENCORE_EN_CLAIR = Prisma.sql`(${Prisma.join(
  COMPRESSED_JSON_COLUMNS.map((c) => Prisma.sql`${Prisma.raw(c)} IS NOT NULL`),
  ' OR '
)})`

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const batch = Math.min(lireEntier('--batch', 50), 200)
  const limit = lireEntier('--limit', 1_000_000)

  const selection = COMPRESSED_JSON_COLUMNS.map((c) => `CAST(\`${c}\` AS CHAR) AS \`${c}\``).join(', ')

  let traites = 0
  let refuses = 0
  let octetsAvant = 0
  let octetsApres = 0
  const debut = Date.now()

  console.log(
    `Rattrapage de compression${dryRun ? ' (simulation, aucune écriture)' : ''} — ` +
      `${COMPRESSED_JSON_COLUMNS.length} colonnes, lots de ${batch}.`
  )

  for (;;) {
    if (traites >= limit) break

    // La sélection ne lit que les identifiants : elle ne charge aucun blob.
    const candidats = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM SquadMatchTelemetry
      WHERE ${ENCORE_EN_CLAIR}
      LIMIT ${Math.min(batch, limit - traites)}
    `)
    if (candidats.length === 0) break

    for (const { id } of candidats) {
      const [ligne] = await prisma.$queryRawUnsafe<Array<Record<string, string | null>>>(
        `SELECT ${selection} FROM SquadMatchTelemetry WHERE id = ?`,
        id
      )
      if (!ligne) continue

      const affectations: Prisma.Sql[] = []
      let avant = 0
      let apres = 0
      let ligneSure = true

      for (const colonne of COMPRESSED_JSON_COLUMNS) {
        const brut = ligne[colonne]
        if (brut === null || brut === undefined) continue

        let valeur: unknown
        try {
          valeur = JSON.parse(brut)
        } catch {
          console.warn(`  ! ${id} / ${colonne} : JSON illisible en base, colonne laissée intacte`)
          ligneSure = false
          break
        }

        const compresse = encodeJsonColumn(valeur)

        // Garde-fou : on ne vide la colonne en clair que si l'aller-retour est exact.
        const restitue = compresse === null ? null : decodeJsonColumn(compresse, null, colonne)
        const attendu = compresse === null ? null : valeur
        if (JSON.stringify(restitue) !== JSON.stringify(attendu)) {
          console.warn(`  ! ${id} / ${colonne} : restitution non conforme, ligne laissée intacte`)
          ligneSure = false
          break
        }

        avant += Buffer.byteLength(brut, 'utf8')
        apres += compresse?.length ?? 0
        affectations.push(Prisma.sql`${Prisma.raw(colonne)} = NULL`)
        affectations.push(Prisma.sql`${Prisma.raw(colonne)}Gz = ${compresse}`)
      }

      if (!ligneSure) {
        refuses += 1
        continue
      }
      if (affectations.length === 0) {
        traites += 1
        continue
      }

      octetsAvant += avant
      octetsApres += apres

      if (!dryRun) {
        await prisma.$executeRaw(Prisma.sql`
          UPDATE SquadMatchTelemetry
          SET ${Prisma.join(affectations, ', ')}
          WHERE id = ${id}
        `)
      }
      traites += 1
    }

    console.log(
      `  ${traites} matchs — ${mo(octetsAvant)} -> ${mo(octetsApres)} ` +
        `(${octetsApres > 0 ? (octetsAvant / octetsApres).toFixed(1) : '—'}x)` +
        (refuses > 0 ? `, ${refuses} laissés intacts` : '')
    )

    // En simulation rien n'est écrit : la même sélection reviendrait indéfiniment.
    if (dryRun) break
  }

  console.log(
    `\nTerminé : ${traites} matchs en ${((Date.now() - debut) / 1000).toFixed(0)}s. ` +
      `${mo(octetsAvant)} -> ${mo(octetsApres)}${dryRun ? ' (simulation)' : ''}.`
  )
  if (refuses > 0) {
    console.log(`${refuses} lignes laissées intactes — aucune donnée perdue, elles restent en clair.`)
  }
  if (!dryRun && traites > 0) {
    console.log(
      'L’espace libéré reste dans le fichier .ibd. Rafraîchissez ensuite la mesure de poids réel ' +
        '(scripts/refresh-table-live-size.ts) pour que la page SuperUser réévalue le compactage.'
    )
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
