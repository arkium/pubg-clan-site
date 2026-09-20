/**
 * Complément du spike `filter[playerIds]` : les deux endpoints PUBG donnent-ils
 * la même information de clan ?
 *
 * Compare, pour les mêmes comptes et au même instant :
 *   - GET /players/{id}            → attributes.clanId ET relationships
 *   - GET /players?filter[playerIds] → attributes seulement
 *
 * LECTURE SEULE (hors PubgApiCallLog).
 * Usage : npx tsx scripts/check-pubg-endpoints-disagreement.ts
 */

import { enqueuePubgApiRequestWithMetadata } from '@/lib/api-throttle'
import { prisma } from '@/lib/prisma'
import { pubgApi } from '@/lib/pubg'

const SHARD = 'steam'

const SUBJECTS: Array<{ label: string; id: string }> = [
  { label: 'Vvila', id: 'account.4878a647b0974b0eb2f53e58aae53623' },
  { label: 'pagiotte', id: 'account.06a8fbda55254295ad3bac2ee8b7a2f7' },
  { label: 'Viande_Hachee', id: 'account.ef9c1887fdd249928da08770a48640aa' },
  { label: 'TigrOo-SmK', id: 'account.501d2a56e5fd44fa9c72e1e73b25586f' },
]

function meta(endpoint: string) {
  return {
    source: 'spike-endpoints-disagreement',
    method: 'GET',
    endpoint,
    shard: SHARD,
    clanId: null,
    memberId: null,
  }
}

function fieldState(attributes: Record<string, unknown> | undefined, key = 'clanId') {
  if (!attributes) return 'pas d attributes'
  if (!Object.prototype.hasOwnProperty.call(attributes, key)) return 'ABSENT'
  const raw = attributes[key]
  if (raw === null) return 'null'
  if (raw === '') return '"" (vide)'
  return String(raw)
}

async function unitary(id: string) {
  const url = `/shards/${SHARD}/players/${id}`
  const res = await enqueuePubgApiRequestWithMetadata(
    () => pubgApi.get<{ data?: { attributes?: Record<string, unknown>; relationships?: Record<string, unknown> } }>(url),
    meta(url)
  )
  const data = res.data.data
  const rel = data?.relationships as
    | { clan?: { data?: { id?: string } | null } }
    | undefined
  return {
    attrClanId: fieldState(data?.attributes),
    relClanId: rel?.clan?.data?.id ?? (rel && 'clan' in rel ? 'clan présent mais data vide' : 'pas de relationships.clan'),
    relationshipsKeys: rel ? Object.keys(rel).join(', ') : '—',
  }
}

async function batch(ids: string[]) {
  const url = `/shards/${SHARD}/players`
  const res = await enqueuePubgApiRequestWithMetadata(
    () =>
      pubgApi.get<{ data?: Array<{ id?: string; attributes?: Record<string, unknown>; relationships?: unknown }> }>(url, {
        params: { 'filter[playerIds]': ids.join(',') },
      }),
    meta(url)
  )
  const map = new Map<string, { attr: string; hasRelationships: boolean }>()
  for (const p of res.data.data ?? []) {
    if (!p.id) continue
    map.set(p.id, {
      attr: fieldState(p.attributes),
      hasRelationships: Boolean(p.relationships),
    })
  }
  return map
}

async function main() {
  console.log('='.repeat(100))
  console.log('COMPARAISON DES DEUX ENDPOINTS — même instant, mêmes comptes |', new Date().toISOString())
  console.log('='.repeat(100))

  const batchMap = await batch(SUBJECTS.map((s) => s.id))

  console.log()
  console.log(
    '  ' +
      'Joueur'.padEnd(16) +
      'LOT attributes.clanId'.padEnd(40) +
      'UNITAIRE attributes.clanId'.padEnd(40) +
      'UNITAIRE relationships.clan'
  )
  console.log('  ' + '-'.repeat(96))

  for (const subject of SUBJECTS) {
    const uni = await unitary(subject.id)
    const b = batchMap.get(subject.id)
    console.log(
      '  ' +
        subject.label.padEnd(16) +
        String(b?.attr ?? 'ABSENT DU LOT').padEnd(40) +
        uni.attrClanId.padEnd(40) +
        uni.relClanId
    )
  }

  console.log()
  const anyRel = [...batchMap.values()].some((v) => v.hasRelationships)
  console.log(`  Le lot expose-t-il un bloc "relationships" ? ${anyRel ? 'OUI' : 'NON'}`)

  // Rappel de ce que la base connaît des clans cités.
  const clans = await prisma.clan.findMany({
    where: { platformShard: SHARD, pubgClanId: { not: null } },
    select: { id: true, name: true, tag: true, pubgClanId: true },
  })
  console.log('\n  Clans suivis par le site (rappel pour interpréter les IDs ci-dessus) :')
  for (const c of clans) {
    console.log(`    #${String(c.id).padStart(3)}  [${(c.tag ?? '').padEnd(5)}] ${(c.name ?? '').padEnd(22)} ${c.pubgClanId}`)
  }
}

main()
  .catch((e) => {
    console.error('Interrompu :', e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
