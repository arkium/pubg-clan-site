/**
 * Adversaires « Joueur inconnu » de la page Némésis — LECTURE SEULE, aucune écriture.
 *
 * Un adversaire du kill feed n'est nommé que s'il figure dans `EncounteredPlayer` du clan du joueur (route
 * `/api/members/[id]/nemesis`). Mesure : combien de comptes restent sans nom, combien la table globale `Player` (comptes
 * vus par n'importe quel clan suivi) nommerait gratuitement, et combien il faudrait demander à l'API PUBG
 * (un appel `/players/{id}` par compte, traité en priorité par le cron de résolution des joueurs croisés).
 *
 * Usage : npx tsx scripts/count-unresolved-opponents.ts
 */
import 'dotenv/config'

import { prisma } from '@/lib/prisma'

const MAX_ROWS = 3_000_000

async function main() {
  const [size] = await prisma.$queryRaw<Array<{ rows: bigint | number | null }>>`
    SELECT TABLE_ROWS AS \`rows\` FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'KillEvent'`
  const rows = Number(size?.rows ?? 0)
  console.info('[Unresolved] KillEvent ≈', rows.toLocaleString('fr-FR'), 'lignes (estimation)')
  if (rows > MAX_ROWS) {
    console.info('[Unresolved] Table trop grosse pour un balayage complet : arrêt.')
    return
  }

  const [result] = await prisma.$queryRaw<Array<Record<string, bigint | number | null>>>`
    WITH opp AS (
      SELECT clanId, killerAccountId AS accountId FROM KillEvent
       WHERE victimMemberId IS NOT NULL AND killerMemberId IS NULL AND killerAccountId IS NOT NULL AND killerAccountId NOT LIKE 'ai.%'
      UNION
      SELECT clanId, victimAccountId AS accountId FROM KillEvent
       WHERE killerMemberId IS NOT NULL AND victimMemberId IS NULL AND victimAccountId IS NOT NULL AND victimAccountId NOT LIKE 'ai.%'
    )
    SELECT
      COUNT(*) AS clanAccountPairs,
      COUNT(DISTINCT opp.accountId) AS distinctAccounts,
      SUM(ep.pubgAccountId IS NULL) AS unnamedPairs,
      COUNT(DISTINCT CASE WHEN ep.pubgAccountId IS NULL THEN opp.accountId END) AS unnamedAccounts,
      COUNT(DISTINCT CASE WHEN ep.pubgAccountId IS NULL AND p.pubgAccountId IS NOT NULL THEN opp.accountId END) AS namedByPlayerTable,
      COUNT(DISTINCT CASE WHEN ep.pubgAccountId IS NULL AND p.pubgAccountId IS NULL AND eo.pubgAccountId IS NOT NULL THEN opp.accountId END) AS namedByOtherClans,
      COUNT(DISTINCT CASE WHEN ep.pubgAccountId IS NULL AND p.pubgAccountId IS NULL AND eo.pubgAccountId IS NULL THEN opp.accountId END) AS needPubgApi
    FROM opp
    LEFT JOIN EncounteredPlayer ep ON ep.clanId = opp.clanId AND ep.pubgAccountId = opp.accountId
    LEFT JOIN (SELECT DISTINCT pubgAccountId FROM Player WHERE pubgPlayerName <> pubgAccountId) p ON p.pubgAccountId = opp.accountId
    LEFT JOIN (SELECT DISTINCT pubgAccountId FROM EncounteredPlayer) eo ON eo.pubgAccountId = opp.accountId`

  const values = Object.fromEntries(Object.entries(result ?? {}).map(([key, value]) => [key, Number(value ?? 0)]))
  console.info('[Unresolved]', values)
  // Le cron de résolution des joueurs croisés les traite en priorité, un appel /players/{id} par compte (nom + clan).
  console.info('[Unresolved] Appels PUBG du cron (un par compte, nom et clan) :', values.needPubgApi ?? 0)
}

main()
  .catch((error) => {
    console.error('[Unresolved] failed', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
