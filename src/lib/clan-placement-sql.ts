import { Prisma } from '@prisma/client'

/**
 * Place d'un clan dans une partie, en SQL : la règle de `clanPlacementOf` (`clan-placement.ts`) — la plus petite place
 * non nulle de ses membres actifs — pour les agrégats (docs/TODO/place-partie-partagee.md). Jamais `SquadMatch.placement`,
 * place du seul clan qui a créé la ligne d'une partie partagée.
 */

/**
 * À placer dans une requête groupée par clan et par partie sur `SquadMember sq` joint à `ClanMember cm`
 * (`GROUP BY cm.clanId, sm.id`, ou une requête filtrée sur `cm.clanId`). NULL sans membre classé : `SUM(placement = 1)`
 * et `AVG(placement)` l'ignorent d'eux-mêmes.
 */
export const CLAN_PLACEMENT_SQL = Prisma.sql`MIN(CASE WHEN cm.isActive = 1 AND cm.joinStatus = 'active' AND sq.placement > 0 THEN sq.placement END)`

/** Place d'un clan dans la partie `matchIdSql` (par défaut `sm.id`), en sous-requête d'une ligne par partie. */
export function clanPlacementSubquery(clanId: number, matchIdSql: Prisma.Sql = Prisma.raw('sm.id')) {
  return Prisma.sql`(SELECT ${CLAN_PLACEMENT_SQL} FROM SquadMember sq INNER JOIN ClanMember cm ON cm.id = sq.memberId
    WHERE sq.squadMatchId = ${matchIdSql} AND cm.clanId = ${clanId})`
}
