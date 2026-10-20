import { expect, test } from './support/api'
import { mockMemberSession, withSessionCookie } from './support/session'

/**
 * Liens courts `/m`, `/t`, `/j` (docs/TODO/url-masking.md). Le rendu serveur lit la base de `.env` : seuls les
 * identifiants hors format sont stables ici — 404 « Hors de la zone » sans aucune lecture en base. Redirections et page
 * de choix : src/lib/short-link-route-contracts.test.ts.
 */

test.beforeEach(async ({ page, baseURL }) => {
  await withSessionCookie(page, baseURL!)
})

for (const path of ['/m/pas-un-cuid', '/t/coupe-automne', '/t/coupe-automne/manche-1', '/j/0', '/j/abc']) {
  test(`${path} : identifiant hors format, page 404 du site`, async ({ api, page }) => {
    mockMemberSession(api)
    const response = await page.goto(path)

    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { level: 1, name: 'Hors de la zone' })).toBeVisible()
  })
}
