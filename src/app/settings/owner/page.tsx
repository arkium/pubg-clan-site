import { redirect } from 'next/navigation'

import { getActiveMemberClanId } from '@/lib/auth/admin-guards'
import { getServerComponentSession } from '@/lib/auth-session'

// Q11 (docs/TODO/administration.md) : l'ancien accueil « Paramètres du clan » ne portait pas le clan dans son adresse.
// Il mène à l'accueil « Mon clan » du clan du membre actif, sinon à la Plateforme (SuperUser) ou à la liste des clans.
export default async function OwnerHubRedirect() {
  const session = await getServerComponentSession()
  const clanId = await getActiveMemberClanId(session)
  redirect(clanId ? `/clans/${clanId}/settings` : session?.isSuperUser ? '/settings' : '/clans')
}
