/**
 * Qui voit les actions d'organisateur d'un tournoi (synchroniser, diffuser, paramètres) — docs/features/tournois.md.
 *
 * Même règle que le serveur, pour ne jamais montrer un bouton qui répondrait « Forbidden » : les trois actions passent
 * par `requireClanFeature(organisateur, 'clan-competition')` — le SuperUser, quel que soit son clan, ou l'Owner du clan
 * organisateur (joueur ACTIF de la session) tant que la compétition est ouverte aux Owners. Depuis le 2026-10-24, la
 * synchronisation lit les parties de tout le clan organisateur, pas celles de qui clique : le SuperUser d'un autre clan
 * synchronise donc aussi.
 *
 * Module pur, lisible côté navigateur.
 */
import { isNavKeyClosedToOwners, type OwnerFeatureAccess } from '@/lib/auth/owner-feature-catalog'

export type TournamentManagerSession = {
  isSuperUser: boolean
  activeMemberId: number | null
  /** Permissions du joueur actif (celles de son clan). */
  permissions: string[]
  members: Array<{ memberId: number; clanId: number | null }>
  ownerFeatures: Partial<Record<string, OwnerFeatureAccess>> | null
}

export type TournamentOrganizer = { id: number; name: string; tag: string | null }

export type TournamentManageAccess = {
  /** Synchroniser PUBG, Diffuser, Paramètres. */
  canManage: boolean
}

export function tournamentManageAccess(
  session: TournamentManagerSession,
  organizer: TournamentOrganizer | null
): TournamentManageAccess {
  if (!organizer) return { canManage: false }

  const activeClanId = session.members.find((member) => member.memberId === session.activeMemberId)?.clanId ?? null
  return {
    canManage:
      session.isSuperUser ||
      (activeClanId === organizer.id &&
        session.permissions.includes('*') &&
        !isNavKeyClosedToOwners('clan.tournaments', session.ownerFeatures)),
  }
}
