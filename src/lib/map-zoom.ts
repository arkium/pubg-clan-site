/**
 * Règles de zoom communes à toutes les cartes interactives du site
 * (drop zones, positions, replay 2D…). Voir `docs/ui/index.html#zoom-carte`.
 *
 * Le zoom progresse par paliers additifs de ×0,5, à la molette comme aux
 * boutons : un cran de molette et un clic produisent exactement le même effet.
 */

export const MAP_ZOOM_MIN = 1
export const MAP_ZOOM_STEP = 0.5
export const MAP_ZOOM_DEFAULT_MAX = 4

export function clampMapZoom(value: number, max: number = MAP_ZOOM_DEFAULT_MAX): number {
  if (!Number.isFinite(value)) return MAP_ZOOM_MIN
  return Math.max(MAP_ZOOM_MIN, Math.min(max, value))
}

/** Palier suivant (`direction = 1`) ou précédent (`-1`), borné à `[MIN, max]`. */
export function stepMapZoom(current: number, direction: 1 | -1, max: number = MAP_ZOOM_DEFAULT_MAX): number {
  return clampMapZoom(current + direction * MAP_ZOOM_STEP, max)
}

/** Sens de zoom d'un événement molette : vers le haut = rapprocher. `null` si aucun défilement vertical. */
export function wheelZoomDirection(deltaY: number): 1 | -1 | null {
  if (deltaY === 0 || !Number.isFinite(deltaY)) return null
  return deltaY < 0 ? 1 : -1
}

/** Libellé affiché dans le bouton central : `1×`, `1,5×`, `2×`. */
export function formatMapZoom(zoom: number): string {
  return `${zoom.toLocaleString('fr-FR', { maximumFractionDigits: 1 })}×`
}
