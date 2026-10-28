import type { Page } from '@playwright/test'

import { expect } from './api'

/**
 * Barre « Comment c'est calculé ? » (`CalculationHelp`, décision du 2026-10-28) : même forme sur les sept pages de
 * classement et d'analyse — repliée au chargement, son texte déjà dans le HTML (lu par les robots), « Afficher » la
 * déplie, « Masquer » la replie, lien vers la Méthodologie.
 */
export async function expectCalculationHelp(page: Page, testId: string, text: string | RegExp) {
  const help = page.getByTestId(testId)
  const summary = help.locator('summary')
  await expect(help).toHaveCount(1)
  await expect(summary).toContainText('Comment c’est calculé ?')
  await expect(help).toHaveJSProperty('open', false)
  // Replié mais dans le HTML : le texte est là, invisible.
  await expect(help).toContainText(text)
  await expect(help.getByRole('link', { name: /Méthodologie/ })).toBeHidden()

  await summary.click()
  await expect(help).toHaveJSProperty('open', true)
  await expect(summary).toContainText('Masquer')
  await expect(help.getByRole('link', { name: /Méthodologie/ })).toHaveAttribute('href', /^\/a-propos\/methodologie/)

  await summary.click()
  await expect(help).toHaveJSProperty('open', false)
  return help
}
