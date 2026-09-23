/**
 * Rejoue `buildZoneClosurePositionRows` sur un match, en comptant chaque motif de rejet.
 * Lecture seule, accès par clé.
 *
 * Usage : npx tsx scripts/check-zone-closure-rejects.ts <squadMatchId>
 */
import 'dotenv/config'

import { Prisma } from '@prisma/client'
import { prisma } from '../src/lib/prisma'
import { MAX_POSITION_AGE_SECONDS, detectZoneClosures } from '../src/lib/zone-closure-positions'

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
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

async function main() {
  const id = process.argv[2]
  if (!id) throw new Error('squadMatchId attendu')

  const [row] = await prisma.$queryRaw<
    Array<{ positionSamples: unknown; deathSamples: unknown; phaseSnapshots: unknown }>
  >(Prisma.sql`
    SELECT positionSamples, deathSamples, phaseSnapshots
    FROM SquadMatchTelemetry WHERE squadMatchId = ${id}
  `)
  const match = await prisma.squadMatch.findUnique({
    where: { id },
    select: {
      id: true,
      members: {
        select: {
          memberId: true,
          member: { select: { clanId: true, pubgAccountId: true, pubgPlayerName: true } },
        },
      },
    },
  })
  if (!row || !match) throw new Error('match introuvable')

  const closures = detectZoneClosures(asArray(row.phaseSnapshots))
  const positions = asArray<{ memberKey?: unknown; x?: unknown; y?: unknown; timestampSeconds?: unknown }>(row.positionSamples)
  const deaths = asArray<{ memberKey?: unknown; phase?: unknown }>(row.deathSamples)

  const memberByKey = new Map<string, number>()
  for (const m of match.members) {
    if (!m.member.clanId) continue
    const a = norm(m.member.pubgAccountId)
    const n = norm(m.member.pubgPlayerName)
    if (a) memberByKey.set(a, m.memberId)
    if (n) memberByKey.set(n, m.memberId)
  }

  const samplesByMember = new Map<number, Array<{ t: number; key: string }>>()
  for (const s of positions) {
    const key = norm(s.memberKey)
    const memberId = key ? memberByKey.get(key) : undefined
    if (!key || memberId === undefined || !isNum(s.x) || !isNum(s.y) || !isNum(s.timestampSeconds)) continue
    const list = samplesByMember.get(memberId) ?? []
    list.push({ t: s.timestampSeconds, key })
    samplesByMember.set(memberId, list)
  }
  for (const list of samplesByMember.values()) list.sort((l, r) => l.t - r.t)

  console.log(`fermetures : ${closures.length}, membres suivis avec échantillons : ${samplesByMember.size}`)
  for (const [memberId, list] of samplesByMember) {
    console.log(`  membre ${memberId} : ${list.length} échantillons, t de ${list[0]?.t} à ${list[list.length - 1]?.t}`)
  }

  const deathPhase = new Map<string, number>()
  const sansPhase: string[] = []
  for (const d of deaths) {
    const key = norm(d.memberKey)
    if (!key) continue
    if (!isNum(d.phase)) {
      if (memberByKey.has(key)) sansPhase.push(key)
      continue
    }
    const current = deathPhase.get(key)
    if (current === undefined || d.phase < current) deathPhase.set(key, d.phase)
  }
  console.log(`\ndeathSamples : ${deaths.length}`)
  for (const key of memberByKey.keys()) {
    if (deathPhase.has(key)) console.log(`  ${key} -> phase de mort ${deathPhase.get(key)}`)
  }
  if (sansPhase.length > 0) console.log(`  clés suivies sans phase exploitable : ${sansPhase.length}`)

  let retenues = 0
  const rejets = { pasDEchantillonAvant: 0, tropAncien: 0, mortAvant: 0 }
  for (const c of closures) {
    for (const [, list] of samplesByMember) {
      let last: { t: number; key: string } | null = null
      for (const s of list) {
        if (s.t > c.timestampSeconds) break
        last = s
      }
      if (!last) {
        rejets.pasDEchantillonAvant += 1
        continue
      }
      if (c.timestampSeconds - last.t > MAX_POSITION_AGE_SECONDS) {
        rejets.tropAncien += 1
        continue
      }
      const died = deathPhase.get(last.key)
      if (died !== undefined && died < c.phase) {
        rejets.mortAvant += 1
        continue
      }
      retenues += 1
    }
  }

  console.log(`\n=== Sur ${closures.length} fermetures x ${samplesByMember.size} membres ===`)
  console.log(`Lignes retenues                    : ${retenues}`)
  console.log(`Rejet — aucun échantillon antérieur: ${rejets.pasDEchantillonAvant}`)
  console.log(`Rejet — position trop ancienne     : ${rejets.tropAncien} (seuil ${MAX_POSITION_AGE_SECONDS}s)`)
  console.log(`Rejet — mort avant la fermeture    : ${rejets.mortAvant}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
