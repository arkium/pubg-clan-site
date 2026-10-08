import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * « Données » d'un clan (docs/TODO/administration.md Q17, Q20) : réservées au SuperUser depuis le 2026-10-08, jamais
 * déléguées aux Owners. Le layout du dossier pose la garde Plateforme pour toutes ses pages ; aucun sous-dossier ne
 * doit poser une garde différente (un layout parent ne se ré-exécute pas entre ses pages, mais la garde est la même).
 */
const DATA_DIR = path.join(process.cwd(), 'src', 'app', 'clans', '[clanId]', 'settings', 'data')

function listLayouts(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return listLayouts(full)
    return entry.name === 'layout.tsx' ? [full] : []
  })
}

describe('Données du clan', () => {
  it('le layout du dossier réserve toute la section au SuperUser', () => {
    const source = fs.readFileSync(path.join(DATA_DIR, 'layout.tsx'), 'utf8')
    expect(source).toContain("<AdminAccessGate requirement={{ kind: 'platform' }}>")
    expect(source).not.toMatch(/clan-feature|decideClanFeature/)
  })

  it('aucun sous-dossier ne pose une autre garde', () => {
    const nested = listLayouts(DATA_DIR).filter((file) => path.dirname(file) !== DATA_DIR)
    expect(nested.map((file) => path.relative(DATA_DIR, file))).toEqual([])
  })

  it('les outils attendus sont bien dans le dossier', () => {
    const tools = fs
      .readdirSync(DATA_DIR, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort()
    expect(tools).toEqual(['errors', 'recoveries', 'sessions', 'state', 'sync'])
  })
})
