/**
 * Une seule adresse pour le site (docs/TODO/geo-seo-propositions.md, lot 0.3) : `www.chickendinner.fr` servait tout le
 * site en double (constaté le 2026-10-18). Le proxy renvoie `www.` vers le domaine sans `www`, chemin et requête
 * conservés, en redirection permanente. Module pur, sans Prisma : importé par le proxy.
 */
export function wwwRedirectLocation(input: {
  host: string | null
  pathname: string
  search: string
  /** `X-Forwarded-Proto` de nginx ; HTTPS par défaut. */
  forwardedProto: string | null
}): string | null {
  const host = input.host?.trim().toLowerCase()
  if (!host?.startsWith('www.')) return null
  const apex = host.slice(4)
  // Un nom sans point (`www.localhost`) n'est pas un domaine public : rien à rediriger.
  if (!apex.split(':')[0].includes('.')) return null
  const protocol = input.forwardedProto?.split(',')[0].trim() === 'http' ? 'http' : 'https'
  return `${protocol}://${apex}${input.pathname}${input.search}`
}
