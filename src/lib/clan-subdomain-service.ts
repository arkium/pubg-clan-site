import { Prisma } from '@prisma/client'

import {
  SUBDOMAIN_ERROR_MESSAGES,
  normalizeSubdomain,
  pickClanSubdomain,
  validateSubdomain,
  type SubdomainValidationError,
} from '@/lib/clan-subdomain'
import { prisma } from '@/lib/prisma'

/**
 * Attribution et lecture des sous-domaines de clan — docs/TODO/chickendinnerfr.md §4.B.
 */

export class ClanSubdomainError extends Error {
  constructor(
    readonly code: SubdomainValidationError | 'taken' | 'system' | 'not_found',
    readonly status: number,
    message: string
  ) {
    super(message)
  }
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
}

/** Sous-domaines attribués, et tags (en minuscules) des clans actifs non système, hors `excludeClanId`. */
async function loadAttributionContext(excludeClanId: number) {
  const clans = await prisma.clan.findMany({
    where: { id: { not: excludeClanId } },
    select: { tag: true, subdomain: true, isActive: true, isSystem: true },
  })
  const taken = new Set(clans.map((clan) => clan.subdomain).filter((value): value is string => Boolean(value)))
  const activeTags = new Set(
    clans.filter((clan) => clan.isActive && !clan.isSystem).map((clan) => clan.tag.trim().toLowerCase())
  )
  return { taken, activeTags }
}

/**
 * Attribue un sous-domaine à un clan actif qui n'en a pas encore (idempotent). Un clan inactif ou système
 * n'en reçoit pas ; un clan qui en a déjà un le garde, même si son tag a changé.
 */
export async function ensureClanSubdomain(clanId: number): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const clan = await prisma.clan.findUnique({
      where: { id: clanId },
      select: { id: true, tag: true, name: true, isActive: true, isSystem: true, subdomain: true },
    })
    if (!clan) return null
    if (clan.subdomain || clan.isSystem || !clan.isActive) return clan.subdomain

    const { taken, activeTags } = await loadAttributionContext(clan.id)
    const subdomain = pickClanSubdomain({
      clanId: clan.id,
      tag: clan.tag,
      name: clan.name,
      tagShared: activeTags.has(clan.tag.trim().toLowerCase()),
      taken,
    })

    try {
      const { count } = await prisma.clan.updateMany({
        where: { id: clan.id, subdomain: null },
        data: { subdomain },
      })
      if (count > 0) return subdomain
      // Attribué entre-temps par un autre process : relire.
    } catch (error) {
      // Même sous-domaine choisi au même instant pour un autre clan : recalculer.
      if (!isUniqueViolation(error)) throw error
    }
  }
  return null
}

/**
 * À appeler après l'activation d'un clan. Ne fait jamais échouer l'opération qui active le clan :
 * un sous-domaine manquant sera attribué par `scripts/backfill-clan-subdomains.ts`.
 */
export async function assignClanSubdomainSafely(clanId: number, context: string) {
  try {
    return await ensureClanSubdomain(clanId)
  } catch (error) {
    console.error(`[clan-subdomain] Attribution impossible (clan ${clanId}, ${context}) :`, error)
    return null
  }
}

/** Table `sous-domaine → clan` des clans actifs non système (route interne du proxy). */
export async function listActiveClanSubdomains(): Promise<Record<string, number>> {
  const clans = await prisma.clan.findMany({
    where: { isActive: true, isSystem: false, subdomain: { not: null } },
    select: { id: true, subdomain: true },
    orderBy: { id: 'asc' },
  })
  return Object.fromEntries(clans.map((clan) => [clan.subdomain as string, clan.id]))
}

/** Modification par un SuperUser. L'ancien sous-domaine est libéré immédiatement. */
export async function setClanSubdomain(clanId: number, rawValue: string): Promise<string> {
  const clan = await prisma.clan.findUnique({ where: { id: clanId }, select: { id: true, isSystem: true } })
  if (!clan) throw new ClanSubdomainError('not_found', 404, 'Clan introuvable.')
  if (clan.isSystem) throw new ClanSubdomainError('system', 409, SUBDOMAIN_ERROR_MESSAGES.system)

  const value = rawValue.trim().toLowerCase()
  const invalid = validateSubdomain(value)
  if (invalid) throw new ClanSubdomainError(invalid, 400, SUBDOMAIN_ERROR_MESSAGES[invalid])

  try {
    await prisma.clan.update({ where: { id: clanId }, data: { subdomain: value } })
  } catch (error) {
    if (isUniqueViolation(error)) throw new ClanSubdomainError('taken', 409, SUBDOMAIN_ERROR_MESSAGES.taken)
    throw error
  }
  return value
}

/** Sous-domaine d'un clan et suggestion normalisée de son nom (écran SuperUser). */
export async function getClanSubdomainSummary(clanId: number) {
  const clan = await prisma.clan.findUnique({
    where: { id: clanId },
    select: { id: true, name: true, tag: true, isActive: true, isSystem: true, subdomain: true },
  })
  if (!clan) return null
  return { ...clan, suggestion: normalizeSubdomain(clan.name) }
}
