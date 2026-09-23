/**
 * Diagnostic lecture seule de la purge « historique de géolocalisation »
 * (page /settings/superuser/database — API src/app/api/superuser/database/purge-telemetry/route.ts).
 *
 * Répond à deux questions :
 *  1. combien de matchs portent encore positionSamples / trajectorySegments, par ancienneté ;
 *  2. combien de temps coûte le comptage que l'API exécute à chaque affichage de la page.
 *
 * ⚠️ Un scan complet de SquadMatchTelemetry coûte ~4 min et lit ~22 Go : `positionSamples IS NOT NULL`
 * met la colonne dans le read set, donc InnoDB va chercher les pages externes du blob. Tout est
 * regroupé en UNE passe — ne jamais boucler ce scan par seuil.
 *
 * Usage : npx tsx scripts/check-purge-telemetry-status.ts
 */
import { prisma } from '../src/lib/prisma'

const SEUILS = [7, 14, 30, 60, 90] as const
const n = (v: unknown) => Number(v ?? 0)
const fmtDate = (d: unknown) => (d instanceof Date ? d.toISOString().slice(0, 16).replace('T', ' ') : String(d))

async function main() {
  const t0 = Date.now()
  const [r] = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT
      COUNT(*)                         AS totalGeo,
      SUM(t.sourceGeneratedAt IS NULL) AS srcNull,
      MIN(COALESCE(t.sourceGeneratedAt, t.parsedAt, t.createdAt)) AS minFiltre,
      MAX(COALESCE(t.sourceGeneratedAt, t.parsedAt, t.createdAt)) AS maxFiltre,
      MIN(m.createdAt) AS minMatch,
      MAX(m.createdAt) AS maxMatch,
      MAX(ABS(TIMESTAMPDIFF(MINUTE, COALESCE(t.sourceGeneratedAt, t.parsedAt, t.createdAt), m.createdAt))) AS ecartMaxMin,
      SUM(COALESCE(t.sourceGeneratedAt, t.parsedAt, t.createdAt) < NOW() - INTERVAL  7 DAY) AS api7,
      SUM(COALESCE(t.sourceGeneratedAt, t.parsedAt, t.createdAt) < NOW() - INTERVAL 14 DAY) AS api14,
      SUM(COALESCE(t.sourceGeneratedAt, t.parsedAt, t.createdAt) < NOW() - INTERVAL 30 DAY) AS api30,
      SUM(COALESCE(t.sourceGeneratedAt, t.parsedAt, t.createdAt) < NOW() - INTERVAL 60 DAY) AS api60,
      SUM(COALESCE(t.sourceGeneratedAt, t.parsedAt, t.createdAt) < NOW() - INTERVAL 90 DAY) AS api90,
      SUM(m.createdAt < NOW() - INTERVAL  7 DAY) AS match7,
      SUM(m.createdAt < NOW() - INTERVAL 14 DAY) AS match14,
      SUM(m.createdAt < NOW() - INTERVAL 30 DAY) AS match30,
      SUM(m.createdAt < NOW() - INTERVAL 60 DAY) AS match60,
      SUM(m.createdAt < NOW() - INTERVAL 90 DAY) AS match90
    FROM SquadMatchTelemetry t
    JOIN SquadMatch m ON m.id = t.squadMatchId
    WHERE t.positionSamples IS NOT NULL OR t.trajectorySegments IS NOT NULL`
  const scanSec = (Date.now() - t0) / 1000

  const [tot] = await prisma.$queryRaw<Array<{ c: bigint }>>`SELECT COUNT(*) AS c FROM SquadMatchTelemetry`
  const totalGeo = n(r.totalGeo)

  console.log('=== Volumétrie ===')
  console.log('Lignes SquadMatchTelemetry     :', n(tot?.c).toLocaleString())
  console.log('Porteuses de géoloc            :', totalGeo.toLocaleString())
  console.log('sourceGeneratedAt NULL         :', n(r.srcNull).toLocaleString())

  console.log('\n=== Dates ===')
  console.log('Filtre API COALESCE(src,parsed,created) :', fmtDate(r.minFiltre), '->', fmtDate(r.maxFiltre))
  console.log('Date de match (SquadMatch.createdAt)    :', fmtDate(r.minMatch), '->', fmtDate(r.maxMatch))
  console.log('Écart max filtre / date de match        :', n(r.ecartMaxMin), 'minutes')

  console.log('\n=== Matchs ciblés par seuil ===')
  console.log('seuil | filtre API | date de match | conservés')
  for (const d of SEUILS) {
    const api = n(r[`api${d}`])
    console.log(
      `> ${String(d).padStart(2)}j | ${String(api).padStart(10)} | ${String(n(r[`match${d}`])).padStart(13)} | ${String(totalGeo - api).padStart(9)}`
    )
  }
  console.log('\nMoins de 7 jours avec géoloc   :', (totalGeo - n(r.api7)).toLocaleString())

  const [s] = await prisma.$queryRaw<Array<{ avgKb: number; maxKb: number; seen: bigint }>>`
    SELECT ROUND(AVG(o)/1024, 0) AS avgKb, ROUND(MAX(o)/1024, 0) AS maxKb, COUNT(*) AS seen FROM (
      SELECT OCTET_LENGTH(positionSamples) + COALESCE(OCTET_LENGTH(trajectorySegments), 0) AS o
      FROM SquadMatchTelemetry WHERE positionSamples IS NOT NULL ORDER BY id LIMIT 40
    ) x`
  console.log(`Poids géoloc par match (n=${n(s?.seen)}) : moyenne ${n(s?.avgKb).toLocaleString()} Ko, max ${n(s?.maxKb).toLocaleString()} Ko`)

  const taille = await prisma.$queryRaw<Array<Record<string, unknown>>>`
    SELECT ROW_FORMAT AS rowFormat,
           ROUND(DATA_LENGTH/1024/1024/1024, 2) AS dataGb,
           ROUND(INDEX_LENGTH/1024/1024, 1) AS indexMb,
           ROUND(DATA_FREE/1024/1024, 1) AS freeMb
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SquadMatchTelemetry'`
  console.log('Table :', JSON.stringify(taille, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)))

  console.log(`\n=== Coût du comptage exécuté par GET /api/superuser/database/purge-telemetry ===`)
  console.log(`Scan complet mesuré : ${scanSec.toFixed(1)} s`)
  if (scanSec > 60) {
    console.log('⚠️  > 60 s : Nginx (proxy_read_timeout par défaut) coupe la réponse en 504 ;')
    console.log('    la page laisse alors purgeStatus à null et le bouton annonce « Aucun match ».')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
