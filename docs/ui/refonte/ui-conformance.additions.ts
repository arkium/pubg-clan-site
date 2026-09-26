// À fusionner dans src/lib/ui-conformance.test.ts (Vitest, Node) — docs/TODO/refonte-ui.md §7.
// Réutilise les helpers existants du fichier (lecture des sources des pages). Adapter les noms si besoin.

import { describe, expect, it } from 'vitest'
import { globSync, readFileSync } from 'node:fs' // globSync : Node 22+

const SOURCES = globSync('src/{app,components}/**/*.tsx')
const read = (file: string) => readFileSync(file, 'utf8')

/** Pages pas encore migrées : la liste rétrécit à chaque phase, vide en fin de chantier. */
const EXCEPTIONS = {
  medalEmoji: ['src/components/Leaderboard.tsx'],
  sortSegmented: ['src/components/Leaderboard.tsx'],
  localDistinctions: ['src/components/Leaderboard.tsx', 'src/components/LeaderboardStats.tsx'],
  darkPrefix: ['src/components/ClanNavigation.tsx', 'src/components/ui/DockingToolbar.tsx'],
  hardActive: [] as string[],
  englishHeaders: ['src/components/Leaderboard.tsx', 'src/components/LeaderboardStats.tsx'],
}

const offenders = (test: (src: string) => boolean, allowed: string[]) =>
  SOURCES.filter((f) => !allowed.includes(f) && test(read(f)))

describe('refonte UI — conformité', () => {
  it('aucun emoji de médaille pour un rang', () => {
    expect(offenders((s) => /🥇|🥈|🥉/.test(s), EXCEPTIONS.medalEmoji)).toEqual([])
  })

  it('pas de segmented de tri au-dessus d’un tableau', () => {
    expect(offenders((s) => /SORT_OPTIONS/.test(s) && /<SegmentedControl/.test(s) && /<table/.test(s), EXCEPTIONS.sortSegmented)).toEqual([])
  })

  it('distinctions calculées uniquement par src/lib/distinctions.ts', () => {
    expect(offenders((s) => /topKiller\s*=\s*\w+\.reduce/.test(s), EXCEPTIONS.localDistinctions)).toEqual([])
  })

  it('aucun préfixe dark:', () => {
    expect(offenders((s) => /\bdark:[a-z]/.test(s), EXCEPTIONS.darkPrefix)).toEqual([])
  })

  it('aucun état actif en couleur codée en dur', () => {
    expect(offenders((s) => /--active[^'"]*bg-(blue|slate|indigo)-\d{3}/.test(s), EXCEPTIONS.hardActive)).toEqual([])
  })

  it('libellés de colonnes en français', () => {
    const english = />\s*(Damage|Winner|Top performers|TOP Kills\/Matchs)\s*</
    expect(offenders((s) => english.test(s), EXCEPTIONS.englishHeaders)).toEqual([])
  })

  it('aucun caractère \\u01F8 (coquille « RǸduire »)', () => {
    expect(offenders((s) => s.includes('\\u01F8') || s.includes('Ǹ'), [])).toEqual([])
  })
})
