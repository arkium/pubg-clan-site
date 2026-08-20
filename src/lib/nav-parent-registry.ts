import { NAV_REGISTRY } from './nav-permissions-registry'

type RouteParams = Record<string, string | number>

interface FallbackDef {
  hrefTemplate: string
  labelKey?: string // S'il y a un navKey pour trouver le label
  labelFallback: string
  altHrefTemplate?: string // Si le parent principal est potentiellement inaccessible
}

// Matrice parent de repli (v1) - §13.2
const FALLBACK_MATRIX: Record<string, FallbackDef> = {
  // Hubs
  'clan.overview': {
    hrefTemplate: '/clans',
    labelFallback: 'Liste des clans',
  },
  'clan.members': {
    hrefTemplate: '/clans/:clanId/overview',
    labelKey: 'clan.overview',
    labelFallback: "Vue d'ensemble",
    altHrefTemplate: '/clans',
  },

  // Sous-pages Membre (pointent vers dashboard)
  'member.dashboard': {
    hrefTemplate: '/clans/:clanId/members',
    labelKey: 'clan.members',
    labelFallback: 'Membres',
  },
  'member.stats': {
    hrefTemplate: '/members/:id/dashboard',
    labelKey: 'primary.dashboard',
    labelFallback: 'Dashboard',
  },
  'member.weapons': {
    hrefTemplate: '/members/:id/dashboard',
    labelKey: 'primary.dashboard',
    labelFallback: 'Dashboard',
  },
  'member.matches': {
    hrefTemplate: '/members/:id/dashboard',
    labelKey: 'primary.dashboard',
    labelFallback: 'Dashboard',
  },
  'member.map-stats': {
    hrefTemplate: '/members/:id/dashboard',
    labelKey: 'primary.dashboard',
    labelFallback: 'Dashboard',
  },
  'member.nemesis': {
    hrefTemplate: '/members/:id/dashboard',
    labelKey: 'primary.dashboard',
    labelFallback: 'Dashboard',
  },
  'member.drop-zones': {
    hrefTemplate: '/members/:id/dashboard',
    labelKey: 'primary.dashboard',
    labelFallback: 'Dashboard',
  },
  'member.heatmap': {
    hrefTemplate: '/members/:id/dashboard',
    labelKey: 'primary.dashboard',
    labelFallback: 'Dashboard',
  },
  'member.rewards': {
    hrefTemplate: '/members/:id/dashboard',
    labelKey: 'primary.dashboard',
    labelFallback: 'Dashboard',
  },

  // Sous-pages Clan (détails match, défis)
  'clan.match-detail': {
    hrefTemplate: '/clans/:clanId/matches',
    labelKey: 'clan.matches',
    labelFallback: 'Matchs',
  },
  'clan.match-session': {
    hrefTemplate: '/clans/:clanId/matches',
    labelKey: 'clan.matches',
    labelFallback: 'Matchs',
  },
  'clan.challenge-detail': {
    hrefTemplate: '/clans/:clanId/challenges',
    labelKey: 'clan.challenges',
    labelFallback: 'Challenges',
  },

  // Sous-pages Télémétrie
  'telemetry.match-detail': {
    hrefTemplate: '/clans/:clanId/telemetry/matches',
    labelKey: 'owner.telemetry-matches',
    labelFallback: 'Télémétrie Matchs',
  },
  'telemetry.match-session': {
    hrefTemplate: '/clans/:clanId/telemetry/matches',
    labelKey: 'owner.telemetry-matches',
    labelFallback: 'Télémétrie Matchs',
  },
}

function resolveTemplate(template: string, params: RouteParams): string {
  let resolved = template
  for (const [key, value] of Object.entries(params)) {
    resolved = resolved.replace(`:${key}`, String(value))
  }
  return resolved
}

export function getFallbackParent(
  routeKey: string,
  params: RouteParams
): { href: string; label: string; altHref?: string } | null {
  const def = FALLBACK_MATRIX[routeKey]
  if (!def) return null

  // Tente de récupérer le label exact depuis le registre existant
  let label = def.labelFallback
  if (def.labelKey) {
    const registryItem = NAV_REGISTRY.find((item) => item.navKey === def.labelKey)
    if (registryItem) {
      label = registryItem.label
    }
  }

  const result: { href: string; label: string; altHref?: string } = {
    href: resolveTemplate(def.hrefTemplate, params),
    label,
  }

  if (def.altHrefTemplate) {
    result.altHref = resolveTemplate(def.altHrefTemplate, params)
  }

  return result
}
