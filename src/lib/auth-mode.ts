/**
 * DISABLE_AUTH_PERMISSIONS=true ouvre la consultation (lecture) de toutes les
 * pages/API de données à tout visiteur, sans login ni scoping par clan — un
 * clan peut alors voir les données d'un autre clan. Les actions (écriture) et
 * les routes réservées Owner/Admin/SuperUser restent protégées normalement.
 */
export function isAuthDisabled(): boolean {
  return process.env.DISABLE_AUTH_PERMISSIONS === 'true'
}
