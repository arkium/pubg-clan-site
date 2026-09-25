import { expect, type Locator, type Page } from '@playwright/test'

/** Mesures du bandeau collant — docs/TODO/sticky.md §7.C. */

export const appHeader = (page: Page) => page.locator('[data-app-header]')
export const toolbar = (page: Page) => page.locator('[data-docking-toolbar]')
export const periodFilter = (page: Page) => toolbar(page).locator('[data-period-filter]')

/** Laisse passer deux images : observateurs d'intersection et de taille, effets de mise en page. */
export async function settle(page: Page) {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  )
}

/** Position de la sentinelle dans le document, moins la hauteur du header : le seuil de docking. */
export async function dockingThreshold(page: Page) {
  return page.evaluate(() => {
    const sentinel = document.querySelector('[data-docking-sentinel]')
    const header = document.querySelector('[data-app-header]')
    if (!sentinel || !header) throw new Error('sentinelle ou header introuvable')
    return sentinel.getBoundingClientRect().top + window.scrollY - header.getBoundingClientRect().height
  })
}

export async function scrollToY(page: Page, y: number) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y)
  await settle(page)
}

/** Fait défiler juste au-delà du seuil et attend le docking. */
export async function dock(page: Page, offset = 200) {
  await scrollToY(page, (await dockingThreshold(page)) + offset)
  await expect(toolbar(page)).toHaveAttribute('data-docked', 'true')
  await settle(page)
}

/**
 * Clique comme un joueur, à l'endroit où l'élément est affiché. `locator.click()` fait d'abord
 * défiler jusqu'à la position d'origine d'un élément collant, ce qui dédockerait le bandeau.
 */
export async function clickInPlace(page: Page, locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) throw new Error('élément invisible')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
}

/** Position verticale d'un élément dans le document (indépendante du défilement). */
export async function documentTop(locator: Locator) {
  return locator.evaluate((element) => element.getBoundingClientRect().top + window.scrollY)
}

/** `ok` si l'élément focalisé est visible et non recouvert (test au centre de l'élément). */
export async function focusedElementVisibility(page: Page) {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null
    if (!element || element === document.body) return 'ok'
    const rect = element.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return 'ok'
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    if (y < 0 || y > window.innerHeight || x < 0 || x > window.innerWidth) {
      return `hors écran : ${element.outerHTML.slice(0, 120)}`
    }
    const hit = document.elementFromPoint(x, y)
    if (hit && (hit === element || element.contains(hit))) return 'ok'
    return `recouvert par ${hit?.outerHTML.slice(0, 120)} : ${element.outerHTML.slice(0, 120)}`
  })
}
