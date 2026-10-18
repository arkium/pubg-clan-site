import { describe, expect, it } from 'vitest'

import type { ClanActivity, ClanDirectoryPayload } from './clan-directory'
import { clanDirectoryFindings } from './clan-directory-findings'

const clan = (id: number, name: string, tag: string, membersCount: number, matchesCount: number, isSystem = false) => ({
  id,
  name,
  tag,
  membersCount,
  matchesCount,
  isSystem,
})

const CLANS = [
  clan(1, 'Les-Ratz', 'RATZ', 12, 5000),
  clan(2, 'La Meute', 'LMT', 8, 3000),
  clan(3, 'Citrons_Verts', 'CIVE', 6, 2000),
  clan(4, 'Aurore_Funeste', 'AUFU', 5, 100),
  clan(99, 'Ungrouped', 'NONE', 40, 900, true),
]

const activity = (clanId: number, games7: number, wins7: number, style: ClanActivity['style'] = null) =>
  ({ clanId, games7, wins7, playedTonight: 0, lastMatchAt: null, leagueRank: null, style }) as ClanActivity
const style = (id: 'fragger' | 'medic' | 'ghost') => ({ id, score: 60, aggression: 0, support: 0, zoneDiscipline: 0, members: 4, matches: 50 }) as ClanActivity['style']

const DIRECTORY: ClanDirectoryPayload = {
  generatedAt: '2026-10-18T10:00:00.000Z',
  tonight: { date: '2026-10-18', players: 0 },
  leagueSize: 4,
  clanOfMomentId: 1,
  activity: [
    activity(1, 41, 6, style('medic')),
    activity(2, 12, 1, style('fragger')),
    activity(3, 12, 3, style('medic')),
    activity(4, 0, 0),
    activity(99, 80, 2, style('ghost')),
  ],
}

const NOW = new Date('2026-10-18T10:00:00Z')
const plain = (text: string) => text.replace(/ | /g, ' ')

describe('clanDirectoryFindings', () => {
  const result = clanDirectoryFindings(CLANS, DIRECTORY, NOW)

  it('totaux du bandeau : clans hors clan système, joueurs et parties de tous les clans listés', () => {
    expect(result.title).toBe('En bref : 4 clans PUBG suivis')
    expect(plain(result.scope)).toBe('71 joueurs, 11 000 parties importées depuis le début du suivi · chiffres du 18 octobre 2026')
  })

  it('les trois plus actifs sur 7 jours, sans le clan système, départagés aux top 1', () => {
    expect(result.active?.clans.map((entry) => [entry.label, entry.detail])).toEqual([
      ['Les-Ratz [RATZ]', '41 parties, 6 top 1'],
      ['Citrons_Verts [CIVE]', '12 parties, 3 top 1'],
      ['La Meute [LMT]', '12 parties, 1 top 1'],
    ])
  })

  it('compte les styles de jeu des clans suivis et les définit', () => {
    expect(result.styles).toContain('Styles de jeu : 2 Medic, 1 Fragger.')
    expect(result.styles).toContain('agressivité (Fragger), soutien (Medic) ou discipline de zone (Ghost)')
  })

  it('tous les clans suivis, en liens, par ordre alphabétique', () => {
    expect(result.clans).toEqual([
      { id: 4, label: 'Aurore_Funeste [AUFU]' },
      { id: 3, label: 'Citrons_Verts [CIVE]' },
      { id: 2, label: 'La Meute [LMT]' },
      { id: 1, label: 'Les-Ratz [RATZ]' },
    ])
  })

  it('sans activité de l’annuaire : ni plus actifs ni styles, la liste reste', () => {
    const bare = clanDirectoryFindings(CLANS, null, NOW)
    expect(bare.active).toBeNull()
    expect(bare.styles).toBeNull()
    expect(bare.clans).toHaveLength(4)
  })

  it('ne parle jamais de recrutement', () => {
    expect(result.join).toContain('Le site ne recrute pas')
  })
})
