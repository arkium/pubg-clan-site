import { cache } from 'react'

import { prisma } from '@/lib/prisma'
import { pageSeo, seoLookupFor, type ClanRef, type PageSeo, type TournamentRef } from '@/lib/seo/page-seo'

/**
 * Lectures en base du référencement (docs/features/seo.md) : nom du clan ou titre du tournoi d'une page, et liste des
 * pages à mettre dans le sitemap. Un clan n'est indexé que s'il est suivi : actif, non archivé, hors clan système.
 */

const TOURNAMENT_PUBLIC_STATUSES = ['active', 'finished']

const loadClanRef = cache(async (clanId: number): Promise<ClanRef | null> => {
  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    select: { id: true, name: true, tag: true, isActive: true, isSystem: true, archivedAt: true },
  })
  if (!clan) return null
  return { id: clan.id, name: clan.name, tag: clan.tag, indexable: clan.isActive && !clan.isSystem && !clan.archivedAt }
})

const loadTournamentRef = cache(async (tournamentId: string): Promise<TournamentRef | null> => {
  const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId }, select: { id: true, title: true, status: true } })
  if (!tournament) return null
  return { id: tournament.id, title: tournament.title, indexable: TOURNAMENT_PUBLIC_STATUSES.includes(tournament.status) }
})

/** Référencement de la page ; une base indisponible donne la description par défaut, sans indexation (prudence). */
export async function resolvePageSeo(pathname: string): Promise<PageSeo> {
  const lookup = seoLookupFor(pathname)
  if (!lookup) return pageSeo(pathname)
  try {
    if ('clanId' in lookup) return pageSeo(pathname, { clan: await loadClanRef(lookup.clanId) })
    return pageSeo(pathname, { tournament: await loadTournamentRef(lookup.tournamentId) })
  } catch (error) {
    console.error('[seo] Page lookup failed', { pathname, name: error instanceof Error ? error.name : 'UnknownError' })
    return pageSeo(pathname)
  }
}

export async function loadSitemapData() {
  const [clans, tournaments] = await Promise.all([
    prisma.clan.findMany({
      where: { isActive: true, isSystem: false, archivedAt: null },
      select: { id: true, lastMatchAt: true },
      orderBy: { id: 'asc' },
    }),
    prisma.tournament.findMany({
      where: { status: { in: TOURNAMENT_PUBLIC_STATUSES } },
      select: { id: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
  ])
  return { clans, tournaments }
}
