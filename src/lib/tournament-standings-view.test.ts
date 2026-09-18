import { describe, expect, it } from 'vitest'

import {
  buildClanTrophy,
  buildRoundViews,
  buildSquadBreakdown,
  buildStandingViews,
  describeParticipant,
  pickMvp,
} from './tournament-standings-view'
import { computeTournamentModeStandings } from './tournament-service'

const CLANS = {
  1: { name: 'D32', tag: 'SMK' },
  2: { name: 'Les-Ratz', tag: 'RATZ' },
  3: { name: 'Sans tag', tag: null },
}

const MEMBERS = {
  10: { displayName: 'Pagiotte', clanId: 1 },
  11: { displayName: 'TigrOo', clanId: 1 },
  20: { displayName: 'Nova', clanId: 2 },
  30: { displayName: 'Anonyme', clanId: 3 },
}

const RULES = { placementPoints: { 1: 10, 2: 6 }, killPoints: 1, winBonus: 4, bestOfRounds: null }

function row(memberId: number, clanId: number, kills: number, placement: number, damage = 0) {
  return { memberId, member: { clanId, displayName: MEMBERS[memberId as 10]?.displayName }, kills, placement, damage }
}

const round1 = {
  id: 'match-1',
  createdAt: '2026-09-17T20:00:00.000Z',
  mapName: 'Baltic_Main',
  gameMode: 'normal-squad',
  members: [row(10, 1, 3, 1, 450), row(11, 1, 1, 1, 120), row(20, 2, 2, 2, 300)],
}

const round2 = {
  id: 'match-2',
  createdAt: '2026-09-17T21:00:00.000Z',
  mapName: 'Desert_Main',
  gameMode: 'normal-squad',
  members: [row(10, 1, 0, 3, 90), row(20, 2, 5, 1, 700)],
}

describe('describeParticipant', () => {
  it('nomme un clan avec son tag, et sans tag quand il n’en a pas', () => {
    expect(describeParticipant({ kind: 'clan', clanId: 1 }, CLANS, MEMBERS).label).toBe('[SMK] D32')
    expect(describeParticipant({ kind: 'clan', clanId: 3 }, CLANS, MEMBERS).label).toBe('Sans tag')
  })

  it('décrit une équipe par sa composition, tags de clan compris', () => {
    const view = describeParticipant({ kind: 'team', memberIds: [10, 20], clanIds: [1, 2] }, CLANS, MEMBERS)
    expect(view.label).toBe('[SMK] Pagiotte, [RATZ] Nova')
    expect(view.clanTags).toEqual(['SMK', 'RATZ'])
    expect(view.memberLabels).toHaveLength(2)
  })

  it('nomme un joueur inconnu sans planter', () => {
    expect(describeParticipant({ kind: 'player', memberId: 99, clanId: null }, CLANS, MEMBERS).label).toBe('Joueur 99')
    expect(describeParticipant({ kind: 'clan', clanId: 42 }, CLANS, MEMBERS).label).toBe('Clan 42')
  })
})

describe('buildStandingViews', () => {
  it('numérote les rangs dans l’ordre du classement', () => {
    const standings = computeTournamentModeStandings([round1, round2], [1, 2], RULES)
    const views = buildStandingViews(standings, CLANS, MEMBERS)
    expect(views.map((view) => [view.rank, view.label])).toEqual([
      [1, '[SMK] D32'],
      [2, '[RATZ] Nova'.replace('Nova', 'Les-Ratz')],
    ])
  })
})

describe('pickMvp', () => {
  it('retient le plus de kills, départagé par les dégâts', () => {
    expect(pickMvp([round1, round2], MEMBERS, CLANS)).toMatchObject({ memberId: 20, kills: 7, damage: 1000 })
  })

  it('ne retourne personne quand il n’y a ni kill ni dégât', () => {
    const empty = { ...round1, members: [row(10, 1, 0, 5, 0)] }
    expect(pickMvp([empty], MEMBERS, CLANS)).toBeNull()
  })
})

describe('buildRoundViews', () => {
  const rounds = buildRoundViews([round2, round1], [1, 2], RULES, CLANS, MEMBERS)

  it('numérote les manches de la plus ancienne à la plus récente', () => {
    expect(rounds.map((round) => [round.index, round.matchId])).toEqual([
      [1, 'match-1'],
      [2, 'match-2'],
    ])
  })

  it('désigne le vainqueur par le placement, pas par les points', () => {
    expect(rounds[0].winnerLabel).toBe('[SMK] D32')
    expect(rounds[1].winnerLabel).toBe('[RATZ] Les-Ratz')
  })

  it('donne le MVP et les scores de chaque manche', () => {
    expect(rounds[0].mvp).toMatchObject({ label: '[SMK] Pagiotte', kills: 3 })
    expect(rounds[0].scores.map((score) => [score.label, score.points])).toEqual([
      ['[SMK] D32', 18],
      ['[RATZ] Les-Ratz', 8],
    ])
  })

  it('suit le mode : une manche de tournoi solo liste des joueurs', () => {
    const solo = buildRoundViews([round1], [1, 2], { ...RULES, mode: 'solo_ffa' }, CLANS, MEMBERS)
    expect(solo[0].scores.map((score) => score.label)).toEqual([
      '[SMK] Pagiotte',
      '[SMK] TigrOo',
      '[RATZ] Nova',
    ])
  })
})

describe('buildClanTrophy', () => {
  it('cumule les points des joueurs par clan en mode solo', () => {
    const standings = computeTournamentModeStandings([round1], [1, 2], { ...RULES, mode: 'solo_ffa' })
    const trophy = buildClanTrophy(standings, CLANS)
    expect(trophy.map((entry) => [entry.label, entry.points, entry.players])).toEqual([
      ['[SMK] D32', 32, 2],
      ['[RATZ] Les-Ratz', 8, 1],
    ])
  })

  it('ignore les classements qui ne sont pas individuels', () => {
    const standings = computeTournamentModeStandings([round1], [1, 2], RULES)
    expect(buildClanTrophy(standings, CLANS)).toEqual([])
  })
})

describe('buildSquadBreakdown', () => {
  it('recalcule le tournoi escouade par escouade, sans toucher au cumul par clan', () => {
    const breakdown = buildSquadBreakdown([round1], [1, 2], RULES, CLANS, MEMBERS)
    expect(breakdown).toHaveLength(1)
    expect(breakdown[0].label).toBe('[SMK] Pagiotte, [SMK] TigrOo, [RATZ] Nova')
    expect(breakdown[0].rank).toBe(1)
  })
})
