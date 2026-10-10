/**
 * Qui voit les actions d'organisateur d'un tournoi (synchroniser, diffuser, paramètres) — docs/features/tournois.md.
 *
 * Même règle que le serveur, pour ne jamais montrer un bouton qui répondrait « Forbidden » :
 * - les trois actions passent par `requireClanFeature(organisateur, 'clan-competition')` : le SuperUser, ou l'Owner du
 *   clan organisateur (joueur ACTIF de la session) tant que la compétition est ouverte aux Owners ;
 * - la synchronisation part en plus des propres parties PUBG du joueur actif (`sync-matches` avec son `memberId`) : il
 *   doit être membre du clan organisateur, SuperUser compris. Un SuperUser hors du clan voit le bouton désactivé, avec
 *   la raison, plutôt qu'une erreur au clic.
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
  /** Diffuser, Paramètres. */
  canManage: boolean
  /** Synchroniser PUBG. */
  canSync: boolean
  /** Pourquoi la synchronisation est refusée à qui gère le tournoi ; `null` quand elle est permise ou sans objet. */
  syncBlockedReason: string | null
}

const NO_ACCESS: TournamentManageAccess = { canManage: false, canSync: false, syncBlockedReason: null }

export function tournamentManageAccess(
  session: TournamentManagerSession,
  organizer: TournamentOrganizer | null
): TournamentManageAccess {
  if (!organizer) return NO_ACCESS

  const activeClanId = session.members.find((member) => member.memberId === session.activeMemberId)?.clanId ?? null
  const activeInOrganizerClan = activeClanId === organizer.id
  const canManage =
    session.isSuperUser ||
    (activeInOrganizerClan && session.permissions.includes('*') && !isNavKeyClosedToOwners('clan.tournaments', session.ownerFeatures))

  if (!canManage) return NO_ACCESS
  if (activeInOrganizerClan) return { canManage: true, canSync: true, syncBlockedReason: null }

  const clanLabel = organizer.tag ? `[${organizer.tag}]` : organizer.name
  const hasOrganizerPlayer = session.members.some((member) => member.clanId === organizer.id)
  return {
    canManage: true,
    canSync: false,
    syncBlockedReason: hasOrganizerPlayer
      ? `Pour synchroniser, passez sur votre joueur de ${clanLabel} : la synchronisation part de ses propres parties PUBG.`
      : `Synchroniser est réservé à un joueur de ${clanLabel} qui a joué la manche : la synchronisation part de ses propres parties PUBG.`,
  }
}
