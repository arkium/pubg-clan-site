/**
 * Quelle taille ferait `SquadMatchTelemetry` si elle était reconstruite maintenant ? — lecture seule.
 *
 * `DATA_LENGTH` mesure ce que le fichier `.ibd` occupe (20,57 Go), pas ce que les données pèsent
 * réellement. Après la compression de la géolocalisation, l'écart est énorme — et c'est lui qui
 * détermine l'espace disque qu'exigerait un `OPTIMIZE TABLE` : InnoDB écrit un fichier neuf
 * dimensionné par les **lignes vivantes**, pas par l'ancien fichier.
 *
 * Usage : npx tsx scripts/check-real-data-size.ts
 */
import 'dotenv/config'

import { prisma } from '../src/lib/prisma'

const n = (v: unknown) => Number(v ?? 0)
const go = (octets: number) => `${(octets / 1024 / 1024 / 1024).toFixed(2)} Go`

async function main() {
  console.log('Mesure du poids réel des colonnes (un parcours complet)…')
  const t0 = Date.now()
  const [poids] = await prisma.$queryRaw<Array<Record<string, bigint | null>>>`
    SELECT
      SUM(COALESCE(OCTET_LENGTH(positionSamplesGz), 0) + COALESCE(OCTET_LENGTH(trajectorySegmentsGz), 0)) AS geoCompressee,
      SUM(COALESCE(OCTET_LENGTH(positionSamples), 0) + COALESCE(OCTET_LENGTH(trajectorySegments), 0)) AS geoClaire,
      SUM(COALESCE(OCTET_LENGTH(summary), 0)) AS summary,
      SUM(COALESCE(OCTET_LENGTH(weaponStats), 0) + COALESCE(OCTET_LENGTH(memberStats), 0)) AS stats,
      SUM(COALESCE(OCTET_LENGTH(deathSamples), 0) + COALESCE(OCTET_LENGTH(landingSamples), 0)
          + COALESCE(OCTET_LENGTH(phaseSnapshots), 0) + COALESCE(OCTET_LENGTH(killSamples), 0)
          + COALESCE(OCTET_LENGTH(shotSamples), 0) + COALESCE(OCTET_LENGTH(damageSamples), 0)
          + COALESCE(OCTET_LENGTH(knockoutSamples), 0) + COALESCE(OCTET_LENGTH(reviveSamples), 0)
          + COALESCE(OCTET_LENGTH(vehicleSamples), 0) + COALESCE(OCTET_LENGTH(killFeedSamples), 0)
          + COALESCE(OCTET_LENGTH(carePackageSamples), 0)) AS autresEvenements
    FROM SquadMatchTelemetry
  `
  console.log(`(parcours : ${((Date.now() - t0) / 1000).toFixed(1)}s)\n`)

  const geoCompressee = n(poids?.geoCompressee)
  const geoClaire = n(poids?.geoClaire)
  const summary = n(poids?.summary)
  const stats = n(poids?.stats)
  const autres = n(poids?.autresEvenements)
  const total = geoCompressee + geoClaire + summary + stats + autres

  console.log('=== Poids réel des données ===')
  console.log(`Géolocalisation compressée : ${go(geoCompressee)}`)
  console.log(`Géolocalisation en clair   : ${go(geoClaire)}`)
  console.log(`summary                    : ${go(summary)}`)
  console.log(`weaponStats + memberStats  : ${go(stats)}`)
  console.log(`Autres événements          : ${go(autres)}`)
  console.log(`TOTAL                      : ${go(total)}`)

  const [table] = await prisma.$queryRaw<Array<{ dataMb: number; freeMb: number }>>`
    SELECT ROUND(DATA_LENGTH/1024/1024, 1) AS dataMb, ROUND(DATA_FREE/1024/1024, 1) AS freeMb
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SquadMatchTelemetry'
  `
  const fichier = n(table?.dataMb) * 1024 * 1024

  console.log('\n=== Fichier contre données ===')
  console.log(`Le fichier .ibd occupe     : ${go(fichier)}`)
  console.log(`Les données pèsent         : ${go(total)}`)
  console.log(`Écart (espace réutilisable): ${go(fichier - total)}`)

  console.log('\n=== Conséquence pour un OPTIMIZE TABLE ===')
  console.log(`Taille du fichier reconstruit ≈ ${go(total * 1.15)} (marge de 15 % pour la structure)`)
  console.log(`Espace disque libre nécessaire ≈ autant, le temps de la bascule`)
  console.log(`Espace restitué au système de fichiers ≈ ${go(fichier - total * 1.15)}`)
  console.log(
    '\nÀ comparer à l’avant-compression, où la reconstruction exigeait ~22,6 Go : le besoin suit la\n' +
      'taille des données vivantes, pas celle de l’ancien fichier.'
  )
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
