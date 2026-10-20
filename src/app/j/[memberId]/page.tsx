import { notFound, redirect } from 'next/navigation'

import { playerShortLinkExists } from '@/lib/short-link-resolution'

/**
 * Lien court d'un joueur, `/j/<joueur>` (docs/TODO/url-masking.md §4.A) : redirection (307) vers son tableau de bord,
 * qui applique ses propres droits. L'identifiant est déjà visible dans les adresses `/members/<id>/…`.
 */
export default async function ShortPlayerLinkPage({ params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params
  if (!(await playerShortLinkExists(memberId))) notFound()
  redirect(`/members/${memberId}/dashboard`)
}
