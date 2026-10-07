import { redirect } from 'next/navigation'

import { getActiveMemberClanId } from '@/lib/auth/admin-guards'
import { getServerComponentSession } from '@/lib/auth-session'

// Q11 (docs/TODO/administration.md) : l'ajout d'un joueur est un onglet de la gestion des membres du clan de l'adresse.
// Cette ancienne adresse sans clan mène à celle du clan du membre actif.
export default async function AddMemberRedirect() {
  const session = await getServerComponentSession()
  const clanId = await getActiveMemberClanId(session)
  redirect(clanId ? `/clans/${clanId}/settings/members?tab=ajout` : '/clans')
}
