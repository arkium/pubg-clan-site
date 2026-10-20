/**
 * Liens courts envoyés hors du site (Discord, e-mails) — docs/TODO/url-masking.md. Seul point de fabrication des liens
 * externes vers un match, un tournoi ou un joueur ; les pages qui les résolvent sont `src/app/{m,t,j}`.
 *
 * Module pur, sans Prisma ni lecture de l'environnement : les générateurs d'embed l'emploient aussi dans l'aperçu
 * côté client. Le service appelant fournit la base publique (`getPublicSiteBaseUrl()`) et la racine des
 * sous-domaines (`readSubdomainRoot()`).
 */

/** Identifiant cuid d'un `SquadMatch` ou d'un `Tournament`, vérifié avant toute lecture en base. */
export const SHORT_LINK_CUID = /^c[a-z0-9]{20,32}$/
/** Identifiant `ClanMember` d'un joueur. */
export const SHORT_LINK_MEMBER_ID = /^[1-9][0-9]{0,9}$/

export type ShortLinkContext = {
  /** Base publique du site ; vide, aucun lien n'est fabriqué (configuration absente). */
  siteUrl: string
  /** `CLAN_SUBDOMAIN_ROOT` ; absente, un lien de match passe par le domaine principal. */
  subdomainRoot?: string | null
}

function baseOf(context: ShortLinkContext) {
  return context.siteUrl.trim().replace(/\/+$/, '')
}

/**
 * Débriefing d'un match : `https://<sous-domaine>.<racine>/m/<match>` quand le clan a un sous-domaine et que la racine
 * est configurée (le clan est alors connu sans page de choix), sinon `<base>/m/<match>`.
 */
export function matchShortUrl(context: ShortLinkContext, squadMatchId: string, clanSubdomain?: string | null) {
  const base = baseOf(context)
  if (!base || !SHORT_LINK_CUID.test(squadMatchId)) return null
  const root = context.subdomainRoot?.trim()
  const subdomain = clanSubdomain?.trim().toLowerCase()
  return root && subdomain ? `https://${subdomain}.${root}/m/${squadMatchId}` : `${base}/m/${squadMatchId}`
}

/** Tournoi, ou une de ses manches ; `replay` ouvre directement le Replay 2D de la manche. */
export function tournamentShortUrl(
  context: ShortLinkContext,
  tournamentId: string,
  round?: { squadMatchId: string; replay?: boolean }
) {
  const base = baseOf(context)
  if (!base || !SHORT_LINK_CUID.test(tournamentId)) return null
  if (!round) return `${base}/t/${tournamentId}`
  if (!SHORT_LINK_CUID.test(round.squadMatchId)) return null
  return `${base}/t/${tournamentId}/${round.squadMatchId}${round.replay ? '?tab=replay' : ''}`
}

/** Tableau de bord d'un joueur. */
export function playerShortUrl(context: ShortLinkContext, memberId: number | null | undefined) {
  const base = baseOf(context)
  if (!base || memberId == null || !SHORT_LINK_MEMBER_ID.test(String(memberId))) return null
  return `${base}/j/${memberId}`
}
