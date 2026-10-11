
import { getOwnerFeatureAccessMap } from '@/lib/auth/owner-features'
import { listLinkedMembers } from '@/lib/auth-service'
import { getSessionFromRequest, getSessionTokenFromRequest } from '@/lib/auth-session'
import { getMemberPermissionKeys } from '@/lib/role-service'

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    // Visiteur sans cookie : réponse normale, il n'y a rien à purger (PageSpeed du 2026-10-11 : quatre 401 dans la
    // console de l'accueil, et autant d'appels inutiles à /api/auth/logout). Un cookie présent mais expiré ou révoqué
    // garde son 401 : `useAuthSession` le purge.
    return Response.json({ authenticated: false }, { status: getSessionTokenFromRequest(request) ? 401 : 200 })
  }

  const linkedMembers = await listLinkedMembers(session.userId)
  const [permissions, ownerFeatures] = await Promise.all([
    session.activeMemberId ? getMemberPermissionKeys(session.activeMemberId) : Promise.resolve([] as string[]),
    // Réglage de délégation (commun à tous les Owners) : les menus masquent les outils fermés aux Owners
    getOwnerFeatureAccessMap(),
  ])

  return Response.json({
    authenticated: true,
    user: {
      id: session.userId,
      email: session.email,
      isSuperUser: session.isSuperUser,
    },
    activeMemberId: session.activeMemberId,
    isSuperUser: session.isSuperUser,
    permissions,
    ownerFeatures,
    members: linkedMembers
      .filter((identity) => identity.member.isActive)
      .map((identity) => ({
        memberId: identity.member.id,
        displayName: identity.member.displayName,
        clanId: identity.member.clanId,
        clan: identity.member.clan,
      })),
  })
}
