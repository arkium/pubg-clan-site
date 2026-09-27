'use client'

import { useAuthSession } from '@/hooks/useAuthSession'

/**
 * Le lecteur peut-il rafraîchir les données PUBG d'un joueur ? Même règle que les routes POST (`requireSameClanAsMember`
 * sans `readOnly`) : un SuperUser, ou un membre connecté du clan du joueur. Un visiteur, jamais.
 */
export function useCanRefreshMember(memberClanId: number | null | undefined) {
  const session = useAuthSession()
  const activeClanId = session.members.find((member) => member.memberId === session.activeMemberId)?.clanId ?? null
  return session.authenticated && (session.isSuperUser || (activeClanId !== null && activeClanId === memberClanId))
}
