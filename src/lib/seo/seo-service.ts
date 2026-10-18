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

export type PageRefs = { clan?: ClanRef | null; tournament?: TournamentRef | null }

/**
 * Référencement de la page et ce qu'il a fallu lire pour l'établir (clan, tournoi) — le layout s'en sert aussi pour les
 * données structurées ; lectures mises en cache le temps de la requête (`cache`). Base indisponible : description par
 * défaut, sans indexation (prudence).
 */
export async function resolvePageSeoWithRefs(pathname: string): Promise<{ seo: PageSeo; refs: PageRefs }> {
  const lookup = seoLookupFor(pathname)
  if (!lookup) return { seo: pageSeo(pathname), refs: {} }
  try {
    const refs: PageRefs =
      'clanId' in lookup ? { clan: await loadClanRef(lookup.clanId) } : { tournament: await loadTournamentRef(lookup.tournamentId) }
    return { seo: pageSeo(pathname, refs), refs }
  } catch (error) {
    console.error('[seo] Page lookup failed', { pathname, name: error instanceof Error ? error.name : 'UnknownError' })
    return { seo: pageSeo(pathname), refs: {} }
  }
}

/** Référencement de la page ; une base indisponible donne la description par défaut, sans indexation (prudence). */
export async function resolvePageSeo(pathname: string): Promise<PageSeo> {
  return (await resolvePageSeoWithRefs(pathname)).seo
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
