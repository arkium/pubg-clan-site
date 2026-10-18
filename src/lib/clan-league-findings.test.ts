import { describe, expect, it } from 'vitest'

import { DEFAULT_LEAGUE_SETTINGS, type LeagueStanding } from './clan-league'
import { leagueFindings } from './clan-league-findings'
import type { ClanLeaguePayload } from './clan-league-service'

const standing = (rank: number, name: string, tag: string, powerScore: number, matches: number) =>
  ({ clanId: rank * 10, name, tag, imageUrl: null, rank, powerScore, matches }) as unknown as LeagueStanding

const PAYLOAD = {
  period: 'week',
  matchType: 'official',
  generatedAt: '2026-10-18T10:00:00.000Z',
  lastMatchAt: null,
  standings: [
    standing(1, 'Les-Ratz', 'RATZ', 3912.4, 41),
    standing(2, 'La Meute', 'LMT', 3650.6, 18),
    standing(3, 'D32', 'SMK', 3400, 12),
    standing(4, 'Quatre', 'QTR', 3100, 9),
  ],
  qualifying: [{ clanId: 50, name: 'Petit', tag: 'PTT', imageUrl: null, matches: 2, required: 5 }],
  withoutMatch: [],
  feed: [],
  titles: [],
  scoring: { minMatches: 5, settings: DEFAULT_LEAGUE_SETTINGS, league: { rawScore: 3200 } },
} as unknown as ClanLeaguePayload

const NOW = new Date('2026-10-18T10:00:00Z')
const plain = (text: string) => text.replace(/ | /g, ' ')

describe('leagueFindings', () => {
  const result = leagueFindings(PAYLOAD, NOW)

  it('titre et périmètre : période, type de partie et date des chiffres', () => {
    expect(result.title).toBe('En bref : la Ligue des clans cette semaine')
    expect(result.scope).toBe('Parties officielles (matchmaking normal) · chiffres du 18 octobre 2026')
  })

  it('podium : les trois premiers, Power score arrondi comme dans le classement', () => {
    expect(result.podium.map((line) => [line.rank, line.label, plain(line.powerScore), line.matches])).toEqual([
      [1, 'Les-Ratz [RATZ]', '3 912', 41],
      [2, 'La Meute [LMT]', '3 651', 18],
      [3, 'D32 [SMK]', '3 400', 12],
    ])
  })

  it('compte les classés, ceux en qualification et ceux sans partie', () => {
    expect(result.summary).toBe('4 clans classés, 1 en qualification (moins de 5 parties) et 0 sans partie normale cette semaine.')
  })

  it('donne la formule avec les réglages en vigueur', () => {
    const formula = plain(result.formula.join(' '))
    expect(formula).toContain('points de placement × 250 + dégâts + kills × 10 + knocks × 5')
    expect(formula).toContain('1re place 10, 2e place 6')
    expect(formula).toContain('au-delà de la 8e place, 0')
    expect(formula).toContain('20 parties fictives au niveau moyen de la ligue')
    expect(formula).toContain('classé à partir de 5 parties')
  })

  it('suit les réglages : un coefficient de dégâts différent de 1 est écrit', () => {
    const settings = { ...DEFAULT_LEAGUE_SETTINGS, damageWeight: 1.5 }
    const formula = leagueFindings({ ...PAYLOAD, scoring: { ...PAYLOAD.scoring, settings } }, NOW).formula[0]
    expect(plain(formula)).toContain('dégâts × 1,5')
  })

  it('sans clan classé, le dit au lieu d’un podium vide', () => {
    const empty = leagueFindings({ ...PAYLOAD, standings: [], qualifying: [] }, NOW)
    expect(empty.podium).toEqual([])
    expect(empty.summary).toBe('Aucun clan n’a encore joué 5 parties cette semaine : le classement commence à 5 parties.')
  })
})
