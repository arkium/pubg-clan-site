/**
 * Spike de vérification de `filter[playerIds]` — prérequis n°1 du chantier
 * « Cycle de vie du clan d'un joueur » (docs/TODO/todo.md, section P2).
 *
 * Répond aux cinq questions de la section :
 *   1. L'endpoint accepte-t-il plusieurs playerIds ?
 *   2. Quelle taille de lot maximale avant 4xx ?
 *   3. `attributes.clanId` a-t-il la même sémantique que GET /players/{id} ?
 *   4. Un joueur sans clan : `null`, `""`, ou champ absent ?
 *   5. Un playerId invalide fait-il échouer tout le lot ?
 *
 * LECTURE SEULE côté métier : aucune écriture applicative. Seul effet de bord,
 * les lignes de `PubgApiCallLog` que la file d'appels écrit pour tout appel PUBG.
 *
 * Usage : npx tsx scripts/check-pubg-player-ids-filter.ts
 */

import { enqueuePubgApiRequestWithMetadata } from '@/lib/api-throttle'
import { prisma } from '@/lib/prisma'
import { fetchPlayerClan, pubgApi } from '@/lib/pubg'

const SHARD = 'steam'

// Témoin à clan nul, mesuré le 2026-09-20 : fetchPlayerClan renvoie null.
// Sans lui, impossible de distinguer « pas de clan » de « champ absent ».
const VVILA_ACCOUNT_ID = 'account.4878a647b0974b0eb2f53e58aae53623'
const INVALID_ACCOUNT_ID = 'account.00000000000000000000000000000000'

const BATCH_SIZES = [1, 5, 10, 20, 50]

type RawPlayer = {
  id?: string
  type?: string
  attributes?: Record<string, unknown>
}

type RawResponse = { data?: RawPlayer[] }

let apiCallCount = 0

async function queryPlayerIds(ids: string[]) {
  apiCallCount += 1
  return enqueuePubgApiRequestWithMetadata(
    () =>
      pubgApi.get<RawResponse>(`/shards/${SHARD}/players`, {
        params: { 'filter[playerIds]': ids.join(',') },
      }),
    {
      source: 'spike-player-ids-filter',
      method: 'GET',
      endpoint: `/shards/${SHARD}/players`,
      shard: SHARD,
      clanId: null,
      memberId: null,
    }
  )
}

/** Distingue « champ absent » de « valeur nulle » — c'est tout l'enjeu du risque A. */
function describeClanIdField(attributes: Record<string, unknown> | undefined) {
  if (!attributes) return { state: 'no-attributes', raw: undefined as unknown }

  for (const key of ['clanId', 'clanID', 'clan_id']) {
    if (Object.prototype.hasOwnProperty.call(attributes, key)) {
      const raw = attributes[key]
      if (raw === null) return { state: `${key}=null`, raw }
      if (raw === '') return { state: `${key}=""`, raw }
      if (typeof raw === 'string') return { state: `${key}=<string>`, raw }
      return { state: `${key}=<${typeof raw}>`, raw }
    }
  }

  return { state: 'champ ABSENT', raw: undefined as unknown }
}

function errorStatus(error: unknown) {
  if (error && typeof error === 'object') {
    const withStatus = error as { status?: unknown; response?: { status?: unknown } }
    if (typeof withStatus.status === 'number') return withStatus.status
    if (typeof withStatus.response?.status === 'number') return withStatus.response.status
  }
  return null
}

async function collectAccountIds() {
  // Membres actifs de clans suivis ayant un pubgClanId : clan attendu NON nul.
  const withClan = await prisma.clanMember.findMany({
    where: {
      isActive: true,
      joinStatus: 'active',
      platformShard: SHARD,
      pubgAccountId: { not: null },
      clan: { is: { pubgClanId: { not: null } } },
    },
    select: { id: true, pubgPlayerName: true, pubgAccountId: true, clan: { select: { tag: true } } },
    orderBy: { id: 'asc' },
    take: 60,
  })

  const ids = withClan
    .map((m) => m.pubgAccountId)
    .filter((id): id is string => typeof id === 'string' && id !== VVILA_ACCOUNT_ID)

  return { withClan, ids }
}

async function main() {
  console.log('='.repeat(78))
  console.log('SPIKE filter[playerIds] — shard:', SHARD, '| date:', new Date().toISOString())
  console.log('='.repeat(78))

  const { withClan, ids } = await collectAccountIds()
  console.log(`\nComptes témoins chargés depuis la base : ${ids.length} avec clan attendu non nul`)
  console.log(`Témoin à clan nul : Vvila (${VVILA_ACCOUNT_ID})`)

  if (ids.length < 2) {
    console.error('\nPas assez de comptes témoins en base — spike interrompu.')
    return
  }

  // ---------------------------------------------------------------- Q1 + Q2
  console.log('\n' + '-'.repeat(78))
  console.log('Q1/Q2 — multi-valeurs accepté ? taille de lot maximale ?')
  console.log('-'.repeat(78))

  const batchResults: Array<{ size: number; ok: boolean; returned: number | null; status: number | null }> = []

  for (const size of BATCH_SIZES) {
    if (ids.length < size) {
      console.log(`  lot de ${String(size).padStart(2)} : ignoré (seulement ${ids.length} comptes disponibles)`)
      continue
    }

    const batch = ids.slice(0, size)
    try {
      const res = await queryPlayerIds(batch)
      const returned = res.data.data?.length ?? 0
      batchResults.push({ size, ok: true, returned, status: 200 })
      console.log(`  lot de ${String(size).padStart(2)} : OK   → ${returned} joueur(s) renvoyé(s)`)
    } catch (error) {
      const status = errorStatus(error)
      batchResults.push({ size, ok: false, returned: null, status })
      console.log(`  lot de ${String(size).padStart(2)} : ECHEC (status ${status ?? '?'})`)
    }
  }

  // ---------------------------------------------------------------- Q3 + Q4
  console.log('\n' + '-'.repeat(78))
  console.log('Q3/Q4 — sémantique de clanId, et cas du joueur sans clan')
  console.log('-'.repeat(78))

  const probeIds = [...ids.slice(0, 3), VVILA_ACCOUNT_ID]
  let probeResponse: RawResponse | null = null

  try {
    const res = await queryPlayerIds(probeIds)
    probeResponse = res.data
    const players = res.data.data ?? []
    console.log(`\n  Lot témoin de ${probeIds.length} comptes → ${players.length} renvoyé(s)\n`)

    for (const player of players) {
      const field = describeClanIdField(player.attributes)
      const name = (player.attributes?.name as string) ?? '?'
      const isWitness = player.id === VVILA_ACCOUNT_ID
      console.log(
        `    ${isWitness ? '★' : ' '} ${name.padEnd(20)} ${String(player.id).slice(0, 24).padEnd(26)} clanId → ${field.state}` +
          (field.raw !== undefined ? ` (${JSON.stringify(field.raw)})` : '')
      )
    }

    const missing = probeIds.filter((id) => !players.some((p) => p.id === id))
    if (missing.length > 0) {
      console.log(`\n    ⚠️  ${missing.length} compte(s) demandé(s) mais absent(s) de la réponse :`)
      for (const id of missing) console.log(`        ${id}`)
    }

    // Comparaison avec l'appel unitaire sur les mêmes comptes.
    console.log('\n  Comparaison avec fetchPlayerClan (appel unitaire) :')
    for (const id of [probeIds[0], VVILA_ACCOUNT_ID]) {
      apiCallCount += 1
      const unit = await fetchPlayerClan(id, SHARD, { source: 'spike-player-ids-filter' })
      const fromBatch = players.find((p) => p.id === id)
      const batchField = describeClanIdField(fromBatch?.attributes)
      console.log(
        `    ${id.slice(0, 24)}… unitaire → ${unit ? `clan ${unit.tag ?? unit.id}` : 'null'} | lot → ${batchField.state}`
      )
    }
  } catch (error) {
    console.log(`  ECHEC du lot témoin (status ${errorStatus(error) ?? '?'})`)
  }

  // ---------------------------------------------------------------------- Q5
  console.log('\n' + '-'.repeat(78))
  console.log('Q5 — un playerId invalide fait-il échouer tout le lot ?')
  console.log('-'.repeat(78))

  try {
    const res = await queryPlayerIds([...ids.slice(0, 2), INVALID_ACCOUNT_ID])
    const players = res.data.data ?? []
    console.log(`  Lot de 3 dont 1 invalide → OK, ${players.length} joueur(s) renvoyé(s)`)
    console.log(
      players.length === 2
        ? '  → Les comptes valides sont renvoyés, l\'invalide est simplement omis.'
        : '  → Comportement inattendu, voir la réponse brute ci-dessous.'
    )
  } catch (error) {
    console.log(`  Lot de 3 dont 1 invalide → ECHEC (status ${errorStatus(error) ?? '?'})`)
    console.log('  → Un compte supprimé côté PUBG ferait tomber tout le lot : à gérer.')
  }

  // ------------------------------------------------------------ Réponse brute
  console.log('\n' + '-'.repeat(78))
  console.log('Réponse brute du lot témoin (preuve pour Q3/Q4)')
  console.log('-'.repeat(78))
  if (probeResponse) {
    const trimmed = {
      data: (probeResponse.data ?? []).map((p) => ({
        type: p.type,
        id: p.id,
        attributes: p.attributes,
      })),
    }
    console.log(JSON.stringify(trimmed, null, 2).slice(0, 6000))
  } else {
    console.log('  (aucune réponse exploitable)')
  }

  // ------------------------------------------------------------------ Synthèse
  console.log('\n' + '='.repeat(78))
  console.log('SYNTHÈSE')
  console.log('='.repeat(78))
  const largestOk = batchResults.filter((r) => r.ok).map((r) => r.size).pop() ?? 0
  const firstFail = batchResults.find((r) => !r.ok)
  console.log(`  Plus grand lot accepté      : ${largestOk}`)
  console.log(`  Premier lot en échec        : ${firstFail ? `${firstFail.size} (status ${firstFail.status ?? '?'})` : 'aucun'}`)
  console.log(`  Appels PUBG consommés       : ${apiCallCount}`)
  console.log(`  Membres actifs en base      : ${withClan.length} (échantillon chargé)`)
  console.log('\n  → Reporter ces chiffres dans docs/TODO/todo.md, section « Prérequis n°1 ».')
}

main()
  .catch((error) => {
    console.error('\nSpike interrompu :', error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
