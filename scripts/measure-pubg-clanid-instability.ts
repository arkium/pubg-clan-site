/**
 * Rang 0 bis — Mesure de l'instabilité de `attributes.clanId` à grande échelle.
 *
 * Objectif : calibrer le nombre N d'observations concordantes exigées par le
 * garde-fou anti-clignotement (risque K, docs/TODO/todo.md section P2).
 *
 * Deux tests :
 *   1. ÉCHELLE  — N passages sur ~40 comptes, pour mesurer le taux de clignotement réel.
 *   2. POSITION — mêmes comptes, ordres de requête différents, pour savoir si la
 *                 valeur suit le COMPTE ou sa POSITION dans le lot. Si elle suit la
 *                 position, c'est un défaut d'alignement de l'API et l'approche
 *                 joueur-par-joueur doit être abandonnée.
 *
 * Les observations sont accumulées en NDJSON dans `.telemetry-captured/clanid-stability/`
 * (dossier gitignoré) pour permettre de relancer le script sur plusieurs jours et
 * d'agréger les passages.
 *
 * LECTURE SEULE côté métier (seules des lignes `PubgApiCallLog` sont écrites).
 * Usage : npx tsx scripts/measure-pubg-clanid-instability.ts [nbPassages]
 */

import { mkdirSync, appendFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { enqueuePubgApiRequestWithMetadata } from '@/lib/api-throttle'
import { prisma } from '@/lib/prisma'
import { pubgApi } from '@/lib/pubg'

const SHARD = 'steam'
const BATCH_SIZE = 10 // plafond dur mesuré le 2026-09-20 : au-delà, l'API tronque en silence
const SAMPLE_SIZE = 40
const DEFAULT_PASSES = 6

const OUT_DIR = join(process.cwd(), '.telemetry-captured', 'clanid-stability')
const OUT_FILE = join(OUT_DIR, 'observations.ndjson')

type Observation = {
  at: string
  runId: string
  pass: number
  test: 'scale' | 'position'
  orderLabel: string
  accountId: string
  playerName: string
  requestIndex: number
  clanIdState: string
  siteClanTag: string | null
}

let apiCalls = 0

function clanIdState(attributes: Record<string, unknown> | undefined): string {
  if (!attributes) return 'NO_ATTRIBUTES'
  if (!Object.prototype.hasOwnProperty.call(attributes, 'clanId')) return 'ABSENT'
  const raw = attributes.clanId
  if (raw === null) return 'NULL'
  if (raw === '') return 'EMPTY'
  return String(raw)
}

function shortClan(value: string) {
  if (value === 'EMPTY') return '""'
  if (value.startsWith('clan.')) return value.slice(5, 13)
  return value
}

async function queryBatch(ids: string[]) {
  apiCalls += 1
  const url = `/shards/${SHARD}/players`
  const res = await enqueuePubgApiRequestWithMetadata(
    () =>
      pubgApi.get<{ data?: Array<{ id?: string; attributes?: Record<string, unknown> }> }>(url, {
        params: { 'filter[playerIds]': ids.join(',') },
      }),
    { source: 'spike-clanid-instability', method: 'GET', endpoint: url, shard: SHARD, clanId: null, memberId: null }
  )
  const map = new Map<string, string>()
  for (const p of res.data.data ?? []) {
    if (p.id) map.set(p.id, clanIdState(p.attributes))
  }
  return map
}

function persist(rows: Observation[]) {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true })
  appendFileSync(OUT_FILE, rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
}

async function main() {
  const passes = Number(process.argv[2]) || DEFAULT_PASSES
  const runId = new Date().toISOString().replace(/[:.]/g, '-')

  const members = await prisma.clanMember.findMany({
    where: {
      isActive: true,
      joinStatus: 'active',
      platformShard: SHARD,
      pubgAccountId: { not: null },
      clan: { is: { pubgClanId: { not: null } } },
    },
    select: { pubgPlayerName: true, pubgAccountId: true, clan: { select: { tag: true } } },
    orderBy: { id: 'asc' },
    take: SAMPLE_SIZE,
  })

  const sample = members
    .filter((m): m is typeof m & { pubgAccountId: string } => typeof m.pubgAccountId === 'string')
    .map((m) => ({ id: m.pubgAccountId, name: m.pubgPlayerName, siteTag: m.clan?.tag ?? null }))

  console.log('='.repeat(100))
  console.log(`MESURE D'INSTABILITÉ clanId — ${sample.length} comptes × ${passes} passages | run ${runId}`)
  console.log('='.repeat(100))

  const byId = new Map(sample.map((s) => [s.id, s]))
  const observations: Observation[] = []

  // ------------------------------------------------------------- TEST 1 : ÉCHELLE
  console.log(`\n[1/2] ÉCHELLE — ${passes} passages, lots de ${BATCH_SIZE}\n`)
  const history = new Map<string, string[]>()

  for (let pass = 1; pass <= passes; pass += 1) {
    for (let offset = 0; offset < sample.length; offset += BATCH_SIZE) {
      const chunk = sample.slice(offset, offset + BATCH_SIZE)
      const result = await queryBatch(chunk.map((c) => c.id))

      chunk.forEach((entry, indexInBatch) => {
        const state = result.get(entry.id) ?? 'MISSING_FROM_RESPONSE'
        if (!history.has(entry.id)) history.set(entry.id, [])
        history.get(entry.id)!.push(state)
        observations.push({
          at: new Date().toISOString(),
          runId,
          pass,
          test: 'scale',
          orderLabel: 'natural',
          accountId: entry.id,
          playerName: entry.name,
          requestIndex: indexInBatch,
          clanIdState: state,
          siteClanTag: entry.siteTag,
        })
      })
    }
    process.stdout.write(`   passage ${pass}/${passes} terminé (${apiCalls} appels cumulés)\n`)
  }

  const unstable: Array<{ name: string; values: string[]; distinct: Set<string>; siteTag: string | null }> = []
  for (const entry of sample) {
    const values = history.get(entry.id) ?? []
    const distinct = new Set(values)
    if (distinct.size > 1) unstable.push({ name: entry.name, values, distinct, siteTag: entry.siteTag })
  }

  console.log(`\n   Comptes instables : ${unstable.length}/${sample.length} (${((unstable.length / sample.length) * 100).toFixed(1)} %)`)
  if (unstable.length > 0) {
    console.log('\n   ' + 'Joueur'.padEnd(20) + 'Clan site'.padEnd(10) + 'Séquence observée')
    console.log('   ' + '-'.repeat(88))
    for (const u of unstable) {
      console.log('   ' + u.name.slice(0, 19).padEnd(20) + String(u.siteTag ?? '—').padEnd(10) + u.values.map(shortClan).join(' → '))
    }

    const allValues = new Set<string>()
    for (const u of unstable) for (const v of u.distinct) allValues.add(v)
    console.log('\n   Valeurs distinctes impliquées dans les clignotements :')
    for (const v of allValues) console.log(`     ${shortClan(v)}  (${v})`)
  }

  // ------------------------------------------------------------ TEST 2 : POSITION
  console.log(`\n[2/2] POSITION — même lot de ${BATCH_SIZE}, trois ordres différents\n`)
  const probe = sample.slice(0, BATCH_SIZE)
  const orders: Array<{ label: string; ids: string[] }> = [
    { label: 'naturel', ids: probe.map((p) => p.id) },
    { label: 'inversé', ids: [...probe].reverse().map((p) => p.id) },
    { label: 'rotation', ids: [...probe.slice(3), ...probe.slice(0, 3)].map((p) => p.id) },
  ]

  const positional = new Map<string, Record<string, string>>()
  for (const order of orders) {
    const result = await queryBatch(order.ids)
    order.ids.forEach((id, indexInBatch) => {
      const state = result.get(id) ?? 'MISSING_FROM_RESPONSE'
      if (!positional.has(id)) positional.set(id, {})
      positional.get(id)![order.label] = state
      observations.push({
        at: new Date().toISOString(),
        runId,
        pass: 0,
        test: 'position',
        orderLabel: order.label,
        accountId: id,
        playerName: byId.get(id)?.name ?? '?',
        requestIndex: indexInBatch,
        clanIdState: state,
        siteClanTag: byId.get(id)?.siteTag ?? null,
      })
    })
    console.log(`   ordre « ${order.label} » interrogé`)
  }

  console.log('\n   ' + 'Joueur'.padEnd(20) + 'naturel'.padEnd(12) + 'inversé'.padEnd(12) + 'rotation'.padEnd(12) + 'suit le compte ?')
  console.log('   ' + '-'.repeat(80))
  let followsAccount = 0
  for (const entry of probe) {
    const row = positional.get(entry.id) ?? {}
    const values = [row.naturel, row['inversé'], row.rotation].map((v) => shortClan(v ?? '?'))
    const same = new Set(values).size === 1
    if (same) followsAccount += 1
    console.log(
      '   ' + entry.name.slice(0, 19).padEnd(20) + values[0].padEnd(12) + values[1].padEnd(12) + values[2].padEnd(12) + (same ? 'oui' : 'NON')
    )
  }

  persist(observations)

  // ------------------------------------------------------------------- SYNTHÈSE
  console.log('\n' + '='.repeat(100))
  console.log('SYNTHÈSE')
  console.log('='.repeat(100))
  console.log(`  Échantillon                  : ${sample.length} comptes`)
  console.log(`  Passages                     : ${passes}`)
  console.log(`  Comptes instables            : ${unstable.length}/${sample.length} (${((unstable.length / sample.length) * 100).toFixed(1)} %)`)
  console.log(`  Test position — stables      : ${followsAccount}/${probe.length}`)
  console.log(`  Appels PUBG consommés        : ${apiCalls}`)
  console.log(`  Observations accumulées      : ${OUT_FILE}`)

  if (existsSync(OUT_FILE)) {
    const total = readFileSync(OUT_FILE, 'utf8').trim().split('\n').filter(Boolean).length
    console.log(`  Total historique du fichier  : ${total} observations`)
  }

  console.log('\n  Lecture :')
  console.log('    - "suit le compte = NON" sur plusieurs lignes → l\'API désaligne attributs et identifiants.')
  console.log('    - Sinon, le clignotement est une incohérence de cache : N observations concordantes le filtrent.')
  console.log('\n  Relancer ce script à plusieurs heures d\'intervalle pour mesurer le clignotement sur la durée.')
}

main()
  .catch((e) => {
    console.error('Interrompu :', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
