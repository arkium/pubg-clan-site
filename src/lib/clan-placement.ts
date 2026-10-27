/**
 * Place d'un clan dans une partie (docs/TODO/place-partie-partagee.md).
 *
 * `SquadMatch` est unique par partie PUBG et réunit tous les joueurs suivis du lobby : sa colonne `placement` n'est que
 * la place du clan qui a créé la ligne (`analyzeMatchForSquads`), fausse pour tout autre clan de la même partie. La
 * place d'un clan = la plus petite `SquadMember.placement` de ses **membres actifs** (`clanId`, `isActive`,
 * `joinStatus = 'active'`, la règle de la Ligue, des Cartes et du comparateur) ; une place 0 (inconnue) ne compte pas.
 * Un clan peut aligner deux équipes dans la même partie : la plus petite place est celle de sa meilleure équipe.
 *
 * La place d'un **joueur** reste la sienne (`SquadMember.placement`, ou `Match.placement`) : ni celle de la ligne, ni
 * celle de son clan. Le même critère en SQL : `CLAN_PLACEMENT_SQL` (`clan-placement-sql.ts`). Module pur, importable
 * côté client ; `src/lib/clan-placement-reads.test.ts` interdit toute nouvelle lecture de `SquadMatch.placement`.
 */

/** Filtre Prisma des membres qui portent la place d'un clan (le même critère que `CLAN_PLACEMENT_SQL`). */
export const clanPlacementMemberWhere = (clanId: number) => ({ clanId, isActive: true, joinStatus: 'active' }) as const

/** Champs de `ClanMember` dont `clanPlacementOf` a besoin, à sélectionner sous `member`. */
export const CLAN_PLACEMENT_MEMBER_SELECT = { clanId: true, isActive: true, joinStatus: true } as const

export type ClanPlacementMember = {
  placement: number
  member: { clanId: number | null; isActive: boolean | number; joinStatus: string }
}

/** Le membre compte-t-il pour la place de ce clan ? (`isActive` arrive en 0 / 1 depuis le SQL brut.) */
export function countsForClanPlacement(member: ClanPlacementMember['member'], clanId: number) {
  return member.clanId === clanId && Boolean(member.isActive) && member.joinStatus === 'active'
}

/** Place du clan dans la partie ; `null` quand aucun de ses membres actifs n'y est classé. */
export function clanPlacementOf(match: { members: readonly ClanPlacementMember[] }, clanId: number): number | null {
  let best: number | null = null
  for (const entry of match.members) {
    if (entry.placement > 0 && countsForClanPlacement(entry.member, clanId) && (best === null || entry.placement < best)) {
      best = entry.placement
    }
  }
  return best
}

/**
 * L'équipe d'un joueur dans une partie : lui et les membres classés à sa place (PUBG classe chaque équipe à part). Vide
 * s'il n'est pas dans la liste ; sans place connue (0), lui seul.
 */
export function playerTeamOf<T extends { memberId: number; placement: number }>(members: readonly T[], memberId: number): T[] {
  const own = members.find((entry) => entry.memberId === memberId)
  if (!own) return []
  return members.filter((entry) => entry.memberId === memberId || (own.placement > 0 && entry.placement === own.placement))
}

/** Membres actifs du clan classés à sa place : l'équipe qui l'a obtenue (vide sans place). */
export function clanPlacementTeam<T extends ClanPlacementMember>(members: readonly T[], clanId: number): T[] {
  const placement = clanPlacementOf({ members }, clanId)
  return placement === null ? [] : members.filter((entry) => entry.placement === placement && countsForClanPlacement(entry.member, clanId))
}
