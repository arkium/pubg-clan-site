/**
 * Pages légales (docs/features/pages-legales.md) : coordonnées et textes partagés par les quatre pages, le footer du
 * site et celui de la vitrine. Module pur, sans Prisma : le proxy (edge) l'importe pour ouvrir ces pages sans session.
 */

/** Date affichée en tête des mentions légales et de la confidentialité : à changer à chaque modification du texte. */
export const LEGAL_UPDATED_AT = '10 octobre 2026'

export const SITE_DOMAIN = 'chickendinner.fr'
export const PUBLISHER_NAME = 'Arkium'
export const PUBLISHER_URL = 'https://arkium.eu'
export const CONTACT_EMAIL = 'contact@chickendinner.fr'

// Serveur de production 217.182.143.43 (docs/TODO/chickendinnerfr.md), plage OVH.
export const HOSTING = {
  name: 'OVH SAS',
  address: '2 rue Kellermann, 59100 Roubaix, France',
  url: 'https://www.ovhcloud.com',
  label: 'ovhcloud.com',
} as const

// Exploitation depuis la Belgique (docs/TODO/CU_todo.md) : autorité de contrôle belge, pas la CNIL.
export const DATA_PROTECTION_AUTHORITY = {
  name: 'Autorité de protection des données (APD)',
  url: 'https://www.autoriteprotectiondonnees.be',
} as const

export const PUBG_RULES_URL = 'https://pubg.com/fr/clause/rules_of_conduct/label_steam/latest'
export const PUBG_API_TERMS_URL = 'https://developer.pubg.com/tos'

/** Mention d'affiliation recommandée par docs/TODO/CU.md §4.1, au mot près. */
export const KRAFTON_DISCLAIMER =
  'PUBG: BATTLEGROUNDS est une marque déposée de KRAFTON, Inc. Ce site est un projet communautaire non officiel et n’est ni affilié à, ni sponsorisé, ni approuvé par KRAFTON, Inc.'

/** Liens du footer, dans l'ordre d'affichage. « Retirer mes données » n'y figure pas : la page Confidentialité y mène. */
export const LEGAL_LINKS = [
  { href: '/mentions-legales', label: 'Mentions légales' },
  { href: '/confidentialite', label: 'Confidentialité' },
  { href: '/a-propos', label: 'À propos' },
] as const

export const PRIVACY_REQUEST_PATH = '/confidentialite/demande'

/** Chemins ouverts sans session, même hors mode visiteur (src/proxy.ts). */
export const LEGAL_PATHS: readonly string[] = [...LEGAL_LINKS.map((link) => link.href), PRIVACY_REQUEST_PATH]
