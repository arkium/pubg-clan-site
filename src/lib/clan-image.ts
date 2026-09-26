/**
 * Image d'un clan (réglage `login_welcome_image_url`, « Accueil login ») et son repli. Une image téléversée peut
 * disparaître du serveur (dossier `public/uploads` hors git) : le lien reste en base mais ne répond plus. On affiche
 * alors l'image par défaut, jamais un cadre vide.
 */

/** Image d'un clan sans image propre, ou dont l'image ne se charge plus. */
export const DEFAULT_CLAN_IMAGE = '/clans/default_clan.jpg'

/** Échappe une URL pour `url('…')` en CSS. */
function cssUrl(url: string): string {
  return `url('${url.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')`
}

/**
 * `background-image` d'un fond de carte : l'image du clan par-dessus l'image par défaut. Si la première ne se charge
 * pas, le navigateur affiche la seconde. À utiliser avec `background-size: cover`, qui fait couvrir la seconde.
 */
export function clanBackgroundImage(imageUrl: string | null | undefined, fallback: string = DEFAULT_CLAN_IMAGE): string {
  const url = imageUrl?.trim()
  return url && url !== fallback ? `${cssUrl(url)}, ${cssUrl(fallback)}` : cssUrl(fallback)
}
