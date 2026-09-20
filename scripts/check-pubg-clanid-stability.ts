/**
 * Le champ `attributes.clanId` de l'API PUBG est-il stable ?
 *
 * Interroge les mêmes comptes plusieurs fois de suite et tabule la valeur
 * renvoyée à chaque passage. Si la valeur varie d'un passage à l'autre pour un
 * même compte, le champ ne peut pas servir de déclencheur d'action automatique.
 *
 * LECTURE SEULE (hors PubgApiCallLog).
 * Usage : npx tsx scripts/check-pubg-clanid-stability.ts
 */

import { enqueuePubgApiRequestWithMetadata } from '@/lib/api-throttle'
import { prisma } from '@/lib/prisma'
import { pubgApi } from '@/lib/pubg'

const SHARD = 'steam'
const PASSES = 4

const SUBJECTS: Array<{ label: string; id: string }> = [
  { label: 'Vvila', id: 'account.4878a647b0974b0eb2f53e58aae53623' },
  { label: 'pagiotte', id: 'account.06a8fbda55254295ad3bac2ee8b7a2f7' },
  { label: 'Viande_Hachee', id: 'account.ef9c1887fdd249928da08770a48640aa' },
  { label: 'TigrOo-SmK', id: 'account.501d2a56e5fd44fa9c72e1e73b25586f' },
]

function short(value: unknown) {
  if (value === undefined) return 'ABSENT'
  if (value === null) return 'null'
  if (value === '') return '""'
  const s = String(value)
  return s.startsWith('clan.') ? s.slice(5, 13) : s
}

async function batchPass(ids: string[]) {
  const url = `/shards/${SHARD}/players`
  const res = await enqueuePubgApiRequestWithMetadata(
    () =>
      pubgApi.get<{ data?: Array<{ id?: string; attributes?: Record<string, unknown> }> }>(url, {
        params: { 'filter[playerIds]': ids.join(',') },
      }),
    { source: 'spike-clanid-stability', method: 'GET', endpoint: url, shard: SHARD, clanId: null, memberId: null }
  )
  const map = new Map<string, unknown>()
  for (const p of res.data.data ?? []) {
    if (!p.id) continue
    const attrs = p.attributes ?? {}
    map.set(p.id, Object.prototype.hasOwnProperty.call(attrs, 'clanId') ? attrs.clanId : undefined)
  }
  return map
}

async function main() {
  console.log('='.repeat(92))
  console.log(`STABILITÉ DE attributes.clanId — ${PASSES} passages sur les mêmes comptes`)
  console.log('Démarré à', new Date().toISOString())
  console.log('='.repeat(92))

  const ids = SUBJECTS.map((s) => s.id)
  const results: Array<Map<string, unknown>> = []

  for (let i = 0; i < PASSES; i += 1) {
    results.push(await batchPass(ids))
    process.stdout.write(`  passage ${i + 1}/${PASSES} fait\n`)
  }

  console.log('\n  ' + 'Joueur'.padEnd(16) + results.map((_, i) => `p${i + 1}`.padEnd(12)).join('') + 'STABLE ?')
  console.log('  ' + '-'.repeat(16 + PASSES * 12 + 10))

  let unstable = 0
  for (const subject of SUBJECTS) {
    const values = results.map((r) => short(r.get(subject.id)))
    const distinct = new Set(values)
    const stable = distinct.size === 1
    if (!stable) unstable += 1
    console.log(
      '  ' +
        subject.label.padEnd(16) +
        values.map((v) => v.padEnd(12)).join('') +
        (stable ? 'oui' : `NON (${distinct.size} valeurs)`)
    )
  }

  console.log('\n' + '='.repeat(92))
  if (unstable > 0) {
    console.log(`  ⚠️  ${unstable}/${SUBJECTS.length} compte(s) INSTABLE(S) sur ${PASSES} passages rapprochés.`)
    console.log('     attributes.clanId ne peut pas déclencher seul une action automatique.')
  } else {
    console.log('  Tous les comptes sont stables sur cette fenêtre.')
  }
  console.log('='.repeat(92))

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error('Interrompu :', e instanceof Error ? e.message : e)
  process.exitCode = 1
})
