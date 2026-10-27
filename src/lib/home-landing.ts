/**
 * Arrivée d'un membre connecté sur `/` (décision du 2026-10-27, docs/features/accueil.md) : il atterrit sur son
 * profil (`/members/<id>/dashboard`), pas sur la vitrine, dont l'appel principal « Inscrire mon clan » ne le concerne
 * pas. La vitrine reste ouverte par l'entrée « Accueil » du menu, qui porte `?vitrine` : elle y affiche alors « Mon
 * espace » et « Mon clan ». Un connecté sans membre actif (SuperUser seul) garde la vitrine. Module pur.
 */

/** Paramètre d'adresse qui montre la vitrine à un connecté (entrée « Accueil » du menu). */
export const HOME_SHOWCASE_PARAM = 'vitrine'
export const HOME_SHOWCASE_HREF = `/?${HOME_SHOWCASE_PARAM}`

export function memberProfileHref(memberId: number) {
  return `/members/${memberId}/dashboard`
}

/** Adresse où envoyer un connecté qui ouvre `/`, ou `null` pour lui montrer la vitrine. */
export function homeLandingRedirect(
  session: { activeMemberId: number | null } | null,
  searchParams: Record<string, string | string[] | undefined>
): string | null {
  if (!session?.activeMemberId) return null
  if (searchParams[HOME_SHOWCASE_PARAM] !== undefined) return null
  return memberProfileHref(session.activeMemberId)
}
