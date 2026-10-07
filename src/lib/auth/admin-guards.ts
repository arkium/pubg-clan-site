import { getSessionFromRequest, type AuthSessionContext } from '@/lib/auth-session'
import { rememberAdminActor } from '@/lib/auth/admin-actor'
import { getOwnerFeatureAccess, type OwnerFeature } from '@/lib/auth/owner-features'
import { prisma } from '@/lib/prisma'
import { hasAnyRole, PREDEFINED_ROLES } from '@/lib/role-service'

/**
 * Gardes d'administration (docs/TODO/administration.md §5.3, §5.4, §6 lot 1).
 *
 * - Jamais ouvertes par le mode visiteur (`DISABLE_AUTH_PERMISSIONS`), contrairement à `requireNavPermission`.
 * - Le SuperUser passe toujours, quel que soit le clan, même sans membre actif.
 * - Sinon, l'accès se juge sur le membre ACTIF de la session (Q14), qui doit appartenir au clan de l'adresse.
 * - 401 seulement sans session : une session valide refusée reçoit 403, pour ne pas déclencher la
 *   déconnexion automatique que les hooks client font sur 401.
 *
 * Les fonctions `decide*` prennent la session déjà lue : les `layout.tsx` serveur les appellent avec la
 * session du cookie, les routes passent par les `require*` qui renvoient une `Response` ou `null`.
 */

export type ClanAccessLevel = 'owner' | 'member'

export type AccessDecision =
  | { allowed: true; isSuperUser: boolean; actorMemberId: number | null }
  | { allowed: false; status: 401 | 403; error: 'Unauthorized' | 'Forbidden' }

const UNAUTHORIZED: AccessDecision = { allowed: false, status: 401, error: 'Unauthorized' }
const FORBIDDEN: AccessDecision = { allowed: false, status: 403, error: 'Forbidden' }

function allowSuperUser(session: AuthSessionContext): AccessDecision {
  return { allowed: true, isSuperUser: true, actorMemberId: session.activeMemberId }
}

export function decidePlatformAdmin(session: AuthSessionContext | null): AccessDecision {
  if (!session) return UNAUTHORIZED
  return session.isSuperUser ? allowSuperUser(session) : FORBIDDEN
}

async function isActiveMemberOfClan(memberId: number, clanId: number) {
  const member = await prisma.clanMember.findUnique({
    where: { id: memberId },
    select: { clanId: true, isActive: true },
  })
  return !!member && member.isActive && member.clanId === clanId
}

export async function decideClanAccess(
  session: AuthSessionContext | null,
  clanId: number,
  level: ClanAccessLevel
): Promise<AccessDecision> {
  if (!session) return UNAUTHORIZED
  if (session.isSuperUser) return allowSuperUser(session)

  const memberId = session.activeMemberId
  if (!memberId) return FORBIDDEN
  if (!(await isActiveMemberOfClan(memberId, clanId))) return FORBIDDEN

  if (level === 'owner' && !(await hasAnyRole(memberId, [PREDEFINED_ROLES.OWNER.name]))) {
    return FORBIDDEN
  }

  return { allowed: true, isSuperUser: false, actorMemberId: memberId }
}

export async function decideClanFeature(
  session: AuthSessionContext | null,
  clanId: number,
  feature: OwnerFeature
): Promise<AccessDecision> {
  const decision = await decideClanAccess(session, clanId, 'owner')
  if (!decision.allowed || decision.isSuperUser) return decision
  return (await getOwnerFeatureAccess(feature)) === 'owner' ? decision : FORBIDDEN
}

/** Clan du membre actif de la session, pour les adresses qui ne portent pas le clan (`/settings/owner`, `/members/add`). */
export async function getActiveMemberClanId(session: AuthSessionContext | null): Promise<number | null> {
  if (!session?.activeMemberId) return null
  const member = await prisma.clanMember.findUnique({
    where: { id: session.activeMemberId },
    select: { clanId: true, isActive: true },
  })
  return member?.isActive ? member.clanId : null
}

export function accessDecisionToResponse(decision: AccessDecision): Response | null {
  if (decision.allowed) return null
  return Response.json({ error: decision.error }, { status: decision.status })
}

/** Lit la session, décide, et note l'acteur admis pour le journal des actions (Q10). */
async function guardRequest(
  request: Request,
  decide: (session: AuthSessionContext | null) => AccessDecision | Promise<AccessDecision>
): Promise<Response | null> {
  const session = await getSessionFromRequest(request)
  const decision = await decide(session)
  if (decision.allowed && session) {
    rememberAdminActor(request, {
      userId: session.userId,
      memberId: decision.actorMemberId,
      isSuperUser: decision.isSuperUser,
    })
  }
  return accessDecisionToResponse(decision)
}

export async function requirePlatformAdmin(request: Request): Promise<Response | null> {
  return guardRequest(request, decidePlatformAdmin)
}

export async function requireClanAccess(
  request: Request,
  clanId: number,
  level: ClanAccessLevel
): Promise<Response | null> {
  return guardRequest(request, (session) => decideClanAccess(session, clanId, level))
}

export async function requireClanFeature(
  request: Request,
  clanId: number,
  feature: OwnerFeature
): Promise<Response | null> {
  return guardRequest(request, (session) => decideClanFeature(session, clanId, feature))
}
