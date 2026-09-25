import { defineConfig, devices } from '@playwright/test'

/**
 * Tests de rendu (bandeaux collants, période) — docs/ops/tests-e2e.md, docs/TODO/sticky.md §7.C.
 *
 * Aucune base de test : le serveur local tourne tel que le configure `.env` (mode visiteur, crons
 * coupés). Chaque test intercepte tous les appels `/api/**` du navigateur (e2e/support/api.ts) : aucun
 * test ne peut écrire en base, et un appel imprévu fait échouer le test.
 *
 * Les tests sont dans `e2e/`, que Vitest ne collecte pas (`src/lib/**` seulement), et inversement.
 */
const PORT = 3000

export default defineConfig({
  testDir: './e2e',
  // Le serveur de développement compile chaque route à la demande : un seul test à la fois.
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
    // Tolérance des captures : l'anticrénelage varie légèrement d'une exécution à l'autre.
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' },
  },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // Dates et nombres identiques d'une machine à l'autre.
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'chromium-tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'], viewport: { width: 375, height: 740 } } },
    // Approximation de Safari sur iPhone (éléments collants, flou d'arrière-plan), pas un iPhone réel.
    { name: 'webkit-iphone', use: { ...devices['iPhone 13'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 300_000,
  },
})
