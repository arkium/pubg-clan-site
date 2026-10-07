import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * « Données » d'un clan (docs/TODO/administration.md Q17, Q20) : le layout du dossier ne garde que la santé des
 * données, ouverte aux Owners. Chaque outil rangé dessous doit poser sa propre garde `clan-telemetry-tools` — un
 * dossier ajouté sans elle serait ouvert à tout Owner, y compris quand le SuperUser ne lui a pas délégué les outils.
 */
const DATA_DIR = path.join(process.cwd(), 'src', 'app', 'clans', '[clanId]', 'settings', 'data')

describe('outils des Données du clan', () => {
  const tools = fs
    .readdirSync(DATA_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  it('liste les outils attendus', () => {
    expect(tools.sort()).toEqual(['errors', 'recoveries', 'sessions', 'state', 'sync'])
  })

  it.each(tools)('%s porte la garde « Outils de télémétrie » dans son propre layout', (tool) => {
    const layout = path.join(DATA_DIR, tool, 'layout.tsx')
    expect(fs.existsSync(layout)).toBe(true)
    const source = fs.readFileSync(layout, 'utf8')
    expect(source).toContain('<AdminAccessGate')
    expect(source).toMatch(/kind: 'clan-feature', clanId, feature: 'clan-telemetry-tools'/)
  })
})
