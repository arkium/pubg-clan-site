/**
 * Règles de zoom communes à toutes les cartes interactives du site
 * (drop zones, positions, replay 2D…). Voir `docs/ui/index.html#zoom-carte`.
 *
 * Le zoom progresse par paliers additifs de ×0,5, à la molette comme aux
 * boutons : un cran de molette et un clic produisent exactement le même effet.
 * Au doigt, le pincement zoome en continu puis se cale, au lâcher, sur le
 * palier le plus proche.
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

/**
 * Zoom pendant un pincement à deux doigts : zoom de départ × rapport entre l'écart actuel des doigts et l'écart de
 * départ, borné. Un écart de départ nul ou invalide laisse le zoom inchangé.
 */
export function pinchMapZoom(startZoom: number, startDistance: number, distance: number, max: number = MAP_ZOOM_DEFAULT_MAX): number {
  if (!(startDistance > 0) || !Number.isFinite(distance) || distance <= 0) return clampMapZoom(startZoom, max)
  return clampMapZoom(startZoom * (distance / startDistance), max)
}

/** Fin d'un pincement : le palier de ×0,5 le plus proche, borné (mêmes paliers que la molette et les boutons). */
export function snapMapZoom(zoom: number, max: number = MAP_ZOOM_DEFAULT_MAX): number {
  if (!Number.isFinite(zoom)) return MAP_ZOOM_MIN
  return clampMapZoom(Math.round(zoom / MAP_ZOOM_STEP) * MAP_ZOOM_STEP, max)
}
