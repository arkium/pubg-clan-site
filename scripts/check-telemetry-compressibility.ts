/**
 * Que gagnerait-on à compresser la télémétrie ? — lecture seule.
 *
 * Mesure, sur un échantillon de matchs récents, le poids réel des colonnes JSON et ce qu'elles
 * donnent une fois compressées (gzip et brotli), plus la part des échantillons de position qui
 * concerne les membres suivis par rapport au reste du lobby.
 *
 * Usage : npx tsx scripts/check-telemetry-compressibility.ts [nbMatchs=5]
 */
import 'dotenv/config'

import { brotliCompressSync, gzipSync, constants } from 'node:zlib'
import { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/prisma'

const mo = (octets: number) => `${(octets / 1024 / 1024).toFixed(2)} Mo`

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[]
  if (typeof value !== 'string') return []
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

const norm = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().toLowerCase() : null)

async function main() {
  const nb = Number(process.argv[2]) || 5

  const matchs = await prisma.$queryRaw<Array<{ squadMatchId: string }>>(Prisma.sql`
    SELECT t.squadMatchId
    FROM SquadMatchTelemetry t
    WHERE t.positionSamples IS NOT NULL
    ORDER BY t.parsedAt DESC
    LIMIT ${nb}
  `)

  let brut = 0
  let gz = 0
  let br = 0
  let echTotal = 0
  let echSuivis = 0

  for (const { squadMatchId } of matchs) {
    const [row] = await prisma.$queryRaw<Array<{ positionSamples: string; trajectorySegments: string | null }>>(
      Prisma.sql`
        SELECT CAST(positionSamples AS CHAR) AS positionSamples,
               CAST(trajectorySegments AS CHAR) AS trajectorySegments
        FROM SquadMatchTelemetry WHERE squadMatchId = ${squadMatchId}
      `
    )
    if (!row?.positionSamples) continue

    const charge = row.positionSamples + (row.trajectorySegments ?? '')
    const octets = Buffer.byteLength(charge, 'utf8')
    brut += octets
    gz += gzipSync(Buffer.from(charge), { level: 6 }).length
    br += brotliCompressSync(Buffer.from(charge), {
      params: { [constants.BROTLI_PARAM_QUALITY]: 5 },
    }).length

    const membres = await prisma.squadMember.findMany({
      where: { squadMatchId },
      select: { member: { select: { pubgAccountId: true, pubgPlayerName: true } } },
    })
    const cles = new Set<string>()
    for (const m of membres) {
      const a = norm(m.member.pubgAccountId)
      const n = norm(m.member.pubgPlayerName)
      if (a) cles.add(a)
      if (n) cles.add(n)
    }
    const samples = asArray<{ memberKey?: unknown }>(row.positionSamples)
    echTotal += samples.length
    echSuivis += samples.filter((s) => {
      const k = norm(s.memberKey)
      return k !== null && cles.has(k)
    }).length
  }

  console.log(`=== ${matchs.length} matchs récents : positionSamples + trajectorySegments ===`)
  console.log(`Brut (tel que stocké) : ${mo(brut)}`)
  console.log(`gzip niveau 6         : ${mo(gz)}  (${(brut / gz).toFixed(1)}x, -${Math.round((1 - gz / brut) * 100)} %)`)
  console.log(`brotli qualité 5      : ${mo(br)}  (${(brut / br).toFixed(1)}x, -${Math.round((1 - br / brut) * 100)} %)`)

  console.log(`\n=== Part utile des échantillons de position ===`)
  console.log(`Échantillons totaux            : ${echTotal.toLocaleString()}`)
  console.log(`Appartenant aux membres suivis : ${echSuivis.toLocaleString()} (${echTotal > 0 ? ((echSuivis / echTotal) * 100).toFixed(1) : 0} %)`)
  console.log(`Reste du lobby                 : ${(echTotal - echSuivis).toLocaleString()}`)

  const [taille] = await prisma.$queryRaw<Array<{ dataGb: number }>>`
    SELECT ROUND(DATA_LENGTH/1024/1024/1024, 2) AS dataGb
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'SquadMatchTelemetry'
  `
  const tailleGo = Number(taille?.dataGb ?? 0)
  console.log(`\n=== Projection sur la table (${tailleGo} Go, ~94 % de géoloc) ===`)
  const geoGo = tailleGo * 0.94
  console.log(`gzip   : ${geoGo.toFixed(1)} Go -> ${(geoGo * (gz / brut)).toFixed(1)} Go`)
  console.log(`brotli : ${geoGo.toFixed(1)} Go -> ${(geoGo * (br / brut)).toFixed(1)} Go`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
