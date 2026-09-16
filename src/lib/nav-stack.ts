/**
 * Pile de navigation du fil d'Ariane (`NavigationTrail`), stockée par onglet dans `sessionStorage`.
 * Logique pure, testée ici ; le composant ne fait que lire et écrire le stockage.
 */

export interface NavStackEntry {
  href: string
  label: string
  ts: number
}

export const NAV_STACK_STORAGE_KEY = 'pubg-nav-stack'
export const NAV_STACK_MAX_ENTRIES = 30

function pathnameOf(href: string): string {
  const end = href.search(/[?#]/)
  return end === -1 ? href : href.slice(0, end)
}

export function parseNavStack(raw: string | null): NavStackEntry[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is NavStackEntry =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as NavStackEntry).href === 'string' &&
        typeof (entry as NavStackEntry).label === 'string'
    )
  } catch {
    return []
  }
}

/**
 * Enregistre la page courante et renvoie l'entrée « Retour ».
 *
 * Une page est identifiée par son chemin, sans la query : un rechargement, un changement de filtre
 * gardé dans l'URL (sélection du comparateur, période…) ou un libellé qui s'affine après chargement
 * **met à jour** son entrée au lieu d'en empiler une nouvelle. Le lien retour d'une page
 * suivante ramène ainsi à l'état exact que l'utilisateur a quitté.
 *
 * Revenir sur une page **déjà présente** dans la pile (lien « Retour », ou tout lien qui y ramène) coupe la
 * pile à cette page, comme le bouton retour d'un navigateur. Sans cela, « Retour » empilait la page
 * précédente par-dessus la courante, qui devenait à son tour la cible du retour : aller-retour sans fin
 * entre deux pages (signalé le 2026-09-16 entre un tournoi et le débriefing d'une de ses manches).
 */
export function recordNavigation(
  stack: NavStackEntry[],
  current: { href: string; label: string },
  now: number
): { stack: NavStackEntry[]; previous: NavStackEntry | null } {
  const last = stack[stack.length - 1]
  const currentPath = pathnameOf(current.href)
  // Première occurrence : une pile construite ainsi n'a jamais de doublon ; une pile héritée de l'ancien
  // comportement (allers-retours empilés) est nettoyée d'un coup au lieu d'un clic par boucle.
  const existingIndex = stack.findIndex((entry) => pathnameOf(entry.href) === currentPath)

  if (existingIndex !== -1) {
    const updated = [
      ...stack.slice(0, existingIndex),
      { href: current.href, label: current.label, ts: stack[existingIndex].ts },
    ]
    return { stack: updated, previous: updated.length >= 2 ? updated[updated.length - 2] : null }
  }

  const pushed = [...stack, { href: current.href, label: current.label, ts: now }]
  return {
    stack: pushed.length > NAV_STACK_MAX_ENTRIES ? pushed.slice(pushed.length - NAV_STACK_MAX_ENTRIES) : pushed,
    previous: last ?? null,
  }
}
