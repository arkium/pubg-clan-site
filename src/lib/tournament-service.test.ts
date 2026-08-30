import { describe, expect, it } from 'vitest'

import { computeTournamentStandings, groupMatchIntoTeams, normalizeTournamentRules } from '@/lib/tournament-service'

describe('tournament-service', () => {
  it('regroupe les membres d’un match par clan pour un tournoi', () => {
    const teams = groupMatchIntoTeams(
      {
        id: 'match-1',
        createdAt: new Date('2026-08-25T18:00:00Z'),
        mapName: 'Deston',
        gameMode: 'squad-fpp',
        placement: 1,
        members: [
          { memberId: 10, member: { clanId: 5, displayName: 'Alice' }, kills: 2, placement: 3 },
          { memberId: 12, member: { clanId: 5, displayName: 'Bob' }, kills: 1, placement: 6 },
          { memberId: 20, member: { clanId: 7, displayName: 'Cara' }, kills: 4, placement: 1 },
          { memberId: 22, member: { clanId: 7, displayName: 'Dan' }, kills: 3, placement: 2 },
        ],
      },
      [5, 7]
    )

    expect(teams).toHaveLength(2)
    expect(teams.map((team) => team.clanId).sort()).toEqual([5, 7])
    expect(teams.find((team) => team.clanId === 5)?.memberIds).toEqual([10, 12])
    expect(teams.find((team) => team.clanId === 7)?.memberIds).toEqual([20, 22])
  })

  it('calcule le classement d’un tournoi avec points par placement et par kill', () => {
    const rules = normalizeTournamentRules({
      placementPoints: { 1: 15, 2: 10, 3: 8 },
      killPoints: 2,
      winBonus: 5,
      bestOfRounds: null,
    })

    const standings = computeTournamentStandings(
      [
        {
          id: 'match-1',
          createdAt: new Date('2026-08-25T18:00:00Z'),
          mapName: 'Deston',
          gameMode: 'squad-fpp',
          placement: 1,
          members: [
            { memberId: 10, member: { clanId: 5, displayName: 'Alice' }, kills: 2, placement: 3 },
            { memberId: 12, member: { clanId: 5, displayName: 'Bob' }, kills: 1, placement: 6 },
          ],
        },
        {
          id: 'match-2',
          createdAt: new Date('2026-08-26T18:00:00Z'),
          mapName: 'Vikendi',
          gameMode: 'squad-fpp',
          placement: 2,
          members: [
            { memberId: 20, member: { clanId: 7, displayName: 'Cara' }, kills: 5, placement: 1 },
            { memberId: 22, member: { clanId: 7, displayName: 'Dan' }, kills: 3, placement: 2 },
          ],
        },
        {
          id: 'match-3',
          createdAt: new Date('2026-08-27T18:00:00Z'),
          mapName: 'Miramar',
          gameMode: 'duo-fpp',
          placement: 1,
          members: [
            { memberId: 10, member: { clanId: 5, displayName: 'Alice' }, kills: 4, placement: 1 },
            { memberId: 12, member: { clanId: 5, displayName: 'Bob' }, kills: 2, placement: 1 },
            { memberId: 20, member: { clanId: 7, displayName: 'Cara' }, kills: 1, placement: 8 },
            { memberId: 22, member: { clanId: 7, displayName: 'Dan' }, kills: 0, placement: 10 },
          ],
        },
      ],
      [5, 7],
      rules
    )

    expect(standings).toEqual([
      expect.objectContaining({ clanId: 5, totalPoints: 46, totalKills: 9, matchesPlayed: 2 }),
      expect.objectContaining({ clanId: 7, totalPoints: 39, totalKills: 9, matchesPlayed: 2 }),
    ])
  })

  it('n’applique bestOfRounds au classement d’une équipe en ne comptant que les meilleures manches', () => {
    const rules = normalizeTournamentRules({
      placementPoints: { 1: 15, 2: 10, 3: 8 },
      killPoints: 2,
      winBonus: 5,
      bestOfRounds: 2,
    })

    const standings = computeTournamentStandings(
      [
        {
          id: 'match-1',
          createdAt: new Date('2026-08-25T18:00:00Z'),
          mapName: 'Deston',
          gameMode: 'squad-fpp',
          members: [
            { memberId: 10, member: { clanId: 5, displayName: 'Alice' }, kills: 2, placement: 3 },
            { memberId: 12, member: { clanId: 5, displayName: 'Bob' }, kills: 1, placement: 6 },
          ],
        },
        {
          id: 'match-2',
          createdAt: new Date('2026-08-26T18:00:00Z'),
          mapName: 'Vikendi',
          gameMode: 'squad-fpp',
          members: [
            { memberId: 10, member: { clanId: 5, displayName: 'Alice' }, kills: 7, placement: 1 },
            { memberId: 12, member: { clanId: 5, displayName: 'Bob' }, kills: 2, placement: 1 },
          ],
        },
        {
          id: 'match-3',
          createdAt: new Date('2026-08-27T18:00:00Z'),
          mapName: 'Miramar',
          gameMode: 'squad-fpp',
          members: [
            { memberId: 10, member: { clanId: 5, displayName: 'Alice' }, kills: 1, placement: 8 },
            { memberId: 12, member: { clanId: 5, displayName: 'Bob' }, kills: 0, placement: 8 },
          ],
        },
      ],
      [5],
      rules
    )

    expect(standings).toEqual([
      expect.objectContaining({ clanId: 5, totalPoints: 52, totalKills: 12, matchesPlayed: 2 }),
    ])
  })
})
