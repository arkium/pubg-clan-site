import { getSessionFromRequest, type AuthSessionContext } from '@/lib/auth-session'
import { prisma } from '@/lib/prisma'

/**
 * Garde des données personnelles d'un membre (notifications et leurs préférences) : seul le compte auquel le membre est
 * lié (`MemberIdentity`) y accède, plus le SuperUser. Un coéquipier du même clan est refusé — contrairement à
 * `requireSameClanAsMember`, faite pour les statistiques, que tout le clan consulte.
 *
 * Conventions de `admin-guards.ts` : jamais ouverte par le mode visiteur, 401 seulement sans session (une session valide
 * refusée reçoit 403, pour ne pas déclencher la déconnexion automatique des hooks client sur 401). Tous les membres liés
 * au compte passent, pas seulement le membre actif : `/account` mène aux notifications de chacun.
 */

export type OwnMemberDecision =
  | { allowed: true; isSuperUser: boolean }
  | { allowed: false; status: 401 | 403; error: 'Unauthorized' | 'Forbidden' }

export async function decideOwnMember(session: AuthSessionContext | null, memberId: number): Promise<OwnMemberDecision> {
  if (!session) return { allowed: false, status: 401, error: 'Unauthorized' }
  if (session.isSuperUser) return { allowed: true, isSuperUser: true }

  const identity = await prisma.memberIdentity.findUnique({
    where: { userId_memberId: { userId: session.userId, memberId } },
    select: { id: true },
  })
  return identity ? { allowed: true, isSuperUser: false } : { allowed: false, status: 403, error: 'Forbidden' }
}

export async function requireOwnMember(memberId: number, request: Request): Promise<Response | null> {
  const decision = await decideOwnMember(await getSessionFromRequest(request), memberId)
  return decision.allowed ? null : Response.json({ error: decision.error }, { status: decision.status })
}
