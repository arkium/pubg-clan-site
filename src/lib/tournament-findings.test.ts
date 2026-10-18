import { describe, expect, it } from 'vitest'

import { tournamentFindings } from './tournament-findings'
import type { TournamentOverview, TournamentStandingSummary } from './tournament-overview'

const leader = (label: string, totalPoints: number, totalKills: number) =>
  ({ key: label, label, totalPoints, totalKills, wins: 0, clanTags: [], memberLabels: [], clanIds: [] }) as unknown as TournamentStandingSummary

// Le tournoi [FR] du 2026-10-10, tel que la liste le résume.
const FINISHED = {
  id: 'cmuyds90z00gw04ao5mauo8ww',
  title: 'Tournoi [FR] 10/10/26',
  description: 'squad6 TPP',
  status: 'finished',
  phase: 'finished',
  mode: 'inter_clan',
  startDate: '2026-10-10T19:00:00.000Z',
  endDate: '2026-10-10T22:00:00.000Z',
  gameMode: null,
  mapName: null,
  mapLabel: null,
  organizerClan: { id: 7, name: 'FR-Alliance-BE', tag: 'FR' },
  roundCount: 5,
  participantCount: 13,
  clanCount: 13,
  playerCount: 81,
  lastRoundAt: '2026-10-10T21:42:20.000Z',
  leaders: [leader('[FUN] FunsNRoses', 152.5, 21), leader('[LMT] La Meute', 120, 15), leader('[SMK] D32', 0, 2)],
  standings: [],
  winner: leader('[FUN] FunsNRoses', 152.5, 21),
} as unknown as TournamentOverview

const plain = (text: string) => text.replace(/ | /g, ' ')

describe('tournamentFindings', () => {
  it('titre, mode, dates à l’heure de Paris et organisateur', () => {
    const findings = tournamentFindings(FINISHED)!
    expect(findings.title).toBe('Tournoi [FR] 10/10/26')
    expect(plain(findings.scope)).toBe('Tournoi PUBG inter-clans · 10 oct. 21:00 → 11 oct. 00:00 · organisé par [FR] FR-Alliance-BE')
  })

  it('terminé en inter-clans : vainqueur nommé, affluence et podium des clans qui ont marqué', () => {
    const findings = tournamentFindings(FINISHED)!
    expect(findings.status).toBe('Terminé. Vainqueur : [FUN] FunsNRoses.')
    expect(findings.attendance).toBe('5 manches, 13 clans, 81 joueurs suivis ; 13 clans au classement.')
    expect(findings.podium.map((line) => [line.rank, line.label, plain(line.points), line.kills])).toEqual([
      [1, '[FUN] FunsNRoses', '152,5', 21],
      [2, '[LMT] La Meute', '120', 15],
    ])
    expect(findings.rule).toContain('Le mode inter-clans classe les clans.')
  })

  it('jamais de pseudo hors inter-clans : ni podium ni vainqueur nommés', () => {
    const findings = tournamentFindings({ ...FINISHED, mode: 'solo_ffa' })!
    expect(findings.podium).toEqual([])
    expect(findings.status).toBe('Terminé : le vainqueur est sur le podium du classement.')
    expect(findings.status + findings.attendance).not.toContain('FunsNRoses')
    expect(findings.attendance).toContain('13 joueurs au classement')
  })

  it('en cours, à venir, sans manche', () => {
    expect(tournamentFindings({ ...FINISHED, phase: 'live' })!.status).toBe('En cours. En tête : [FUN] FunsNRoses.')
    expect(tournamentFindings({ ...FINISHED, phase: 'upcoming' })!.status).toContain('À venir')
    const empty = tournamentFindings({ ...FINISHED, roundCount: 0, winner: null, leaders: [] })!
    expect(empty.attendance).toBe('Aucune manche comptée pour l’instant.')
    expect(empty.status).toBe('Terminé, sans manche comptée.')
  })

  it('rien pour un brouillon', () => {
    expect(tournamentFindings({ ...FINISHED, phase: 'draft' })).toBeNull()
  })
})
