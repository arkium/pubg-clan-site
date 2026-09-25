/**
 * État de la table après le rattrapage de compression — lecture seule.
 *
 * Contrôle trois choses : qu'il ne reste plus de géolocalisation en clair, ce que la table pèse
 * désormais, et surtout le temps que met le comptage de la purge — il coûtait 247 s parce qu'il
 * lisait les blobs, il devait tomber sous la minute une fois ceux-ci compressés.
 *
 * Usage : npx tsx scripts/check-compression-outcome.ts
 */
import 'dotenv/config'

import { prisma } from '../src/lib/prisma'

const n = (v: unknown) => Number(v ?? 0)
const go = (mo: number) => `${(mo / 1024).toFixed(2)} Go`

async function main() {
  console.log('=== Répartition des formats de stockage ===')
  const t0 = Date.now()
  const [formats] = await prisma.$queryRaw<
    Array<{ total: bigint; clair: bigint; compresse: bigint; aucun: bigint }>
  >`
    SELECT COUNT(*) AS total,
           SUM(positionSamples IS NOT NULL OR trajectorySegments IS NOT NULL) AS clair,
           SUM(positionSamplesGz IS NOT NULL OR trajectorySegmentsGz IS NOT NULL) AS compresse,
           SUM(positionSamples IS NULL AND trajectorySegments IS NULL
               AND positionSamplesGz IS NULL AND trajectorySegmentsGz IS NULL) AS aucun
    FROM SquadMatchTelemetry
  `
  const dureeScan = (Date.now() - t0) / 1000

  console.log(`Lignes totales            : ${n(formats?.total).toLocaleString()}`)
  console.log(`Géoloc en clair (à migrer): ${n(formats?.clair).toLocaleString()}`)
  console.log(`Géoloc compressée         : ${n(formats?.compresse).toLocaleString()}`)
  console.log(`Sans géoloc               : ${n(formats?.aucun).toLocaleString()}`)
  console.log(`\nDurée du parcours complet : ${dureeScan.toFixed(1)}s  (247 s avant compression)`)

  const [taille] = await prisma.$queryRaw<
    Array<{ dataMb: number; indexMb: number; freeMb: number; lignes: bigint }>
  >`
    SELECT ROUND(DATA_LENGTH/1024/1024, 1) AS dataMb,
           ROUND(INDEX_LENGTH/1024/1024, 1) AS indexMb,
           ROUND(DATA_FREE/1024/1024, 1) AS freeMb,
           TABLE_ROWS AS lignes
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SquadMatchTelemetry'
  `
  console.log('\n=== Taille de SquadMatchTelemetry ===')
  console.log(`Données  : ${go(n(taille?.dataMb))}`)
  console.log(`Index    : ${go(n(taille?.indexMb))}`)
  console.log(`Libre à l'intérieur du fichier : ${go(n(taille?.freeMb))}`)
  console.log('(le fichier .ibd ne rétrécit pas : cet espace est réutilisé par les écritures suivantes)')

  const [poids] = await prisma.$queryRaw<Array<{ moyKo: number; maxKo: number; n: bigint }>>`
    SELECT ROUND(AVG(o)/1024, 0) AS moyKo, ROUND(MAX(o)/1024, 0) AS maxKo, COUNT(*) AS n FROM (
      SELECT OCTET_LENGTH(positionSamplesGz) + COALESCE(OCTET_LENGTH(trajectorySegmentsGz), 0) AS o
      FROM SquadMatchTelemetry
      WHERE positionSamplesGz IS NOT NULL
      ORDER BY id DESC LIMIT 40
    ) x
  `
  console.log(
    `\nPoids compressé par match (échantillon de ${n(poids?.n)}) : moyenne ${n(poids?.moyKo)} Ko, max ${n(poids?.maxKo)} Ko`
  )
  console.log('(avant compression : ~1 900 Ko en moyenne)')

  // Une purge a-t-elle tourné ? Elle expliquerait les lignes ayant perdu leur géolocalisation.
  const purge = await prisma.appConfig.findUnique({ where: { key: 'telemetry_geo_purge_run' } })
  console.log('\n=== Dernière purge enregistrée ===')
  console.log(purge?.value ?? 'aucune')
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
