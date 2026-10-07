
import { getOwnerFeatureAccessMap } from '@/lib/auth/owner-features'
import { listLinkedMembers } from '@/lib/auth-service'
import { getSessionFromRequest } from '@/lib/auth-session'
import { getMemberPermissionKeys } from '@/lib/role-service'

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return Response.json({ authenticated: false }, { status: 401 })
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
