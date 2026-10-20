import { prisma } from '@/lib/prisma'
import { SHORT_LINK_CUID, SHORT_LINK_MEMBER_ID } from '@/lib/short-links'

/**
 * Résolution des liens courts par les pages `src/app/{m,t,j}` — docs/TODO/url-masking.md §4. Jamais dans le proxy
 * (CLAUDE.md, piège n° 4) : seule une page serveur lit la base. Aucun droit n'est vérifié ici : le lien redirige, la
 * page cible applique ses propres règles.
 */

export type ShortLinkClan = { id: number; name: string; tag: string; subdomain: string | null }

export type MatchShortLinkResolution =
  | { kind: 'not_found' }
  | { kind: 'redirect'; clanId: number }
  | { kind: 'choice'; clans: ShortLinkClan[] }

/**
 * Règles du §4.B : le clan du sous-domaine s'il a joué le match, sinon le seul clan suivi du match, sinon une page de
 * choix — jamais un choix arbitraire. Un match sans clan suivi (tous archivés ou dans le parking) n'a pas de
 * débriefing à ouvrir : 404.
 */
export function chooseMatchClan(clans: ShortLinkClan[], subdomainHint: string | null): MatchShortLinkResolution {
  if (clans.length === 0) return { kind: 'not_found' }
  const hinted = subdomainHint ? clans.find((clan) => clan.subdomain === subdomainHint.toLowerCase()) : undefined
  if (hinted) return { kind: 'redirect', clanId: hinted.id }
  if (clans.length === 1) return { kind: 'redirect', clanId: clans[0].id }
  return { kind: 'choice', clans: [...clans].sort((a, b) => a.name.localeCompare(b.name, 'fr')) }
}

/** Clans suivis dont un membre a joué le match ; `null` si le match est inconnu. Une seule requête. */
async function loadMatchClans(squadMatchId: string): Promise<ShortLinkClan[] | null> {
  const squadMatch = await prisma.squadMatch.findUnique({
    where: { id: squadMatchId },
    select: {
      members: {
        where: { member: { clan: { isActive: true, isSystem: false } } },
        select: { member: { select: { clan: { select: { id: true, name: true, tag: true, subdomain: true } } } } },
      },
    },
  })
  if (!squadMatch) return null

  const byId = new Map<number, ShortLinkClan>()
  for (const { member } of squadMatch.members) {
    if (member.clan) byId.set(member.clan.id, member.clan)
  }
  return [...byId.values()]
}

export async function resolveMatchShortLink(squadMatchId: string, subdomainHint: string | null) {
  if (!SHORT_LINK_CUID.test(squadMatchId)) return { kind: 'not_found' } as const
  const clans = await loadMatchClans(squadMatchId)
  return clans ? chooseMatchClan(clans, subdomainHint) : ({ kind: 'not_found' } as const)
}

export async function tournamentShortLinkExists(tournamentId: string, squadMatchId?: string) {
  if (!SHORT_LINK_CUID.test(tournamentId)) return false
  if (squadMatchId !== undefined && !SHORT_LINK_CUID.test(squadMatchId)) return false
  const [tournament, squadMatch] = await Promise.all([
    prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true } }),
    // La manche elle-même est vérifiée par la page cible : ici, seulement l'existence du match.
    squadMatchId === undefined
      ? Promise.resolve({ id: '' })
      : prisma.squadMatch.findUnique({ where: { id: squadMatchId }, select: { id: true } }),
  ])
  return Boolean(tournament && squadMatch)
}

export async function playerShortLinkExists(memberId: string) {
  if (!SHORT_LINK_MEMBER_ID.test(memberId)) return false
  // Joueur inactif ou parti : redirigé quand même, le tableau de bord gère ces cas (§4.A).
  const member = await prisma.clanMember.findUnique({ where: { id: Number(memberId) }, select: { id: true } })
  return Boolean(member)
}

type SearchParams = Record<string, string | string[] | undefined>

function single(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : undefined
}

/** Paramètres de contexte transmis à la page cible (§4.A), filtrés : un lien court ne relaie rien d'autre. */
export function shortLinkContext(searchParams: SearchParams) {
  const period = single(searchParams.period)
  const fromDate = single(searchParams.fromDate)
  return {
    period: period && /^[a-z0-9-]{1,24}$/i.test(period) ? period : undefined,
    fromDate: fromDate && /^\d{4}-\d{2}-\d{2}$/.test(fromDate) ? fromDate : undefined,
  }
}

/** Sous-domaine relayé par le proxy (`?c=`, src/lib/clan-subdomain-host.ts). */
export function shortLinkSubdomainHint(searchParams: SearchParams) {
  const hint = single(searchParams.c)?.trim().toLowerCase()
  return hint && /^[a-z0-9-]{1,63}$/.test(hint) ? hint : null
}
