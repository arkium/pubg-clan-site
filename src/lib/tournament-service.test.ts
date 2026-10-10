import { describe, expect, it } from 'vitest'

import {
  computeTournamentModeStandings,
  computeTournamentRoundScores,
  computeTournamentStandings,
  groupMatchByMode,
  groupMatchIntoTeams,
  normalizeTournamentRules,
} from '@/lib/tournament-service'

// Comme dans PUBG, les joueurs d'une même escouade partagent le même placement : c'est lui qui identifie l'équipe.

/**
 * Manche d'une partie personnalisée : tout le lobby suivi tient dans une seule ligne (incident du 2026-10-10, tournoi
 * [FR], 71 joueurs). Clan 1 : deux escouades (#1 et #7). Escouade #2 mixte : 3 joueurs du clan 2, 1 du clan 3. Clan 3 :
 * aussi sa propre escouade (#4).
 */
const LOBBY_MATCH = {
  id: 'lobby',
  createdAt: new Date('2026-10-10T19:26:05Z'),
  mapName: 'Neon_Main',
  gameMode: 'normal-squad',
  members: [
    ...[3, 2, 1, 0].map((kills, index) => ({ memberId: 10 + index, member: { clanId: 1 }, kills, placement: 1 })),
    ...[2, 1, 0].map((kills, index) => ({ memberId: 20 + index, member: { clanId: 2 }, kills, placement: 2 })),
    { memberId: 30, member: { clanId: 3 }, kills: 1, placement: 2 },
    ...[1, 1, 0, 0].map((kills, index) => ({ memberId: 31 + index, member: { clanId: 3 }, kills, placement: 4 })),
    ...[1, 0, 0, 0].map((kills, index) => ({ memberId: 40 + index, member: { clanId: 1 }, kills, placement: 7 })),
  ],
}
const LOBBY_RULES = normalizeTournamentRules({
  mode: 'inter_clan',
  mixedSquadRule: 'prorata',
  placementPoints: { 1: 15, 2: 12, 3: 10, 4: 8, 5: 6, 6: 4, 7: 2 },
  killPoints: 1,
  winBonus: 5,
})

describe('partie personnalisée : un lobby entier dans une seule ligne', () => {
  it('sépare les escouades par leur placement, le prorata se calcule dans chaque escouade', () => {
    const teams = groupMatchIntoTeams(LOBBY_MATCH, [1, 2, 3])
    expect(teams.map((team) => [team.clanId, team.bestPlacement, team.placementShare])).toEqual([
      [1, 1, 1],
      [2, 2, 0.75],
      [3, 2, 0.25],
      [3, 4, 1],
      [1, 7, 1],
    ])
  })

  it('un clan cumule ses escouades ; une escouade mixte partage son placement, sans décimales à rallonge', () => {
    const scores = computeTournamentRoundScores(LOBBY_MATCH, [1, 2, 3], LOBBY_RULES)
    expect(scores).toEqual([
      // #1 (15 + 5 de victoire) et #7 (2), plus 7 kills.
      { clanId: 1, bestPlacement: 1, totalKills: 7, placementScore: 17, killScore: 7, winBonus: 5, points: 29 },
      // 1/4 de la 2e place (3) et sa propre 4e place (8), plus 3 kills.
      { clanId: 3, bestPlacement: 2, totalKills: 3, placementScore: 11, killScore: 3, winBonus: 0, points: 14 },
      // 3/4 de la 2e place, plus 3 kills.
      { clanId: 2, bestPlacement: 2, totalKills: 3, placementScore: 9, killScore: 3, winBonus: 0, points: 12 },
    ])
  })

  it('une seule manche jouée par clan, même avec deux escouades ; même total dans les deux classements', () => {
    const byMode = computeTournamentModeStandings([LOBBY_MATCH], [1, 2, 3], LOBBY_RULES)
    expect(byMode.map((standing) => [standing.key, standing.totalPoints, standing.matchesPlayed])).toEqual([
      ['clan:1', 29, 1],
      ['clan:3', 14, 1],
      ['clan:2', 12, 1],
    ])
    const byClan = computeTournamentStandings([LOBBY_MATCH], [1, 2, 3], LOBBY_RULES)
    expect(byClan.map((standing) => standing.totalPoints)).toEqual([29, 14, 12])
  })

  it('détail par escouade et intra-clan : une entrée par escouade PUBG, jamais tout le lobby', () => {
    const squads = groupMatchByMode(LOBBY_MATCH, [1, 2, 3], { ...LOBBY_RULES, mode: 'custom_teams' })
    expect(squads.map((entry) => [entry.bestPlacement, entry.participant])).toEqual([
      [1, { kind: 'team', memberIds: [10, 11, 12, 13], clanIds: [1] }],
      [2, { kind: 'team', memberIds: [20, 21, 22, 30], clanIds: [2, 3] }],
      [4, { kind: 'team', memberIds: [31, 32, 33, 34], clanIds: [3] }],
      [7, { kind: 'team', memberIds: [40, 41, 42, 43], clanIds: [1] }],
    ])
    const scrims = groupMatchByMode(LOBBY_MATCH, [1, 2, 3], { ...LOBBY_RULES, mode: 'intra_clan' }, 1)
    expect(scrims.map((entry) => entry.bestPlacement)).toEqual([1, 7])
  })
})

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
          { memberId: 12, member: { clanId: 5, displayName: 'Bob' }, kills: 1, placement: 3 },
          { memberId: 20, member: { clanId: 7, displayName: 'Cara' }, kills: 4, placement: 1 },
          { memberId: 22, member: { clanId: 7, displayName: 'Dan' }, kills: 3, placement: 1 },
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
            { memberId: 12, member: { clanId: 5, displayName: 'Bob' }, kills: 1, placement: 3 },
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
            { memberId: 22, member: { clanId: 7, displayName: 'Dan' }, kills: 3, placement: 1 },
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
            { memberId: 22, member: { clanId: 7, displayName: 'Dan' }, kills: 0, placement: 8 },
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
            { memberId: 12, member: { clanId: 5, displayName: 'Bob' }, kills: 1, placement: 3 },
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

describe('computeTournamentRoundScores', () => {
  const rules = normalizeTournamentRules({
    placementPoints: { 1: 10, 2: 6, 3: 5 },
    killPoints: 1,
    winBonus: 0,
    bestOfRounds: 1,
  })

  function roundMatch(members: Array<{ memberId: number; clanId: number; kills: number; placement: number }>) {
    return {
      id: 'round-1',
      createdAt: new Date('2026-09-13T18:00:00Z'),
      mapName: 'Miramar',
      gameMode: 'squad-fpp',
      members: members.map(({ memberId, clanId, kills, placement }) => ({
        memberId,
        member: { clanId, displayName: `J${memberId}` },
        kills,
        placement,
      })),
    }
  }

  it('detaille les points de placement, de kills et le bonus victoire', () => {
    const scores = computeTournamentRoundScores(
      roundMatch([
        { memberId: 1, clanId: 5, kills: 5, placement: 1 },
        { memberId: 2, clanId: 5, kills: 3, placement: 1 },
      ]),
      [5],
      normalizeTournamentRules({ placementPoints: { 1: 10 }, killPoints: 1, winBonus: 4 })
    )

    expect(scores).toEqual([
      {
        clanId: 5,
        bestPlacement: 1,
        totalKills: 8,
        placementScore: 10,
        killScore: 8,
        winBonus: 4,
        points: 22,
      },
    ])
  })

  it('ignore bestOfRounds, qui n’a de sens que sur le cumul', () => {
    const scores = computeTournamentRoundScores(
      roundMatch([{ memberId: 1, clanId: 5, kills: 2, placement: 2 }]),
      [5],
      rules
    )

    expect(scores).toHaveLength(1)
    expect(scores[0].points).toBe(8)
  })

  it('trie par points decroissants', () => {
    const scores = computeTournamentRoundScores(
      roundMatch([
        { memberId: 1, clanId: 5, kills: 0, placement: 3 },
        { memberId: 2, clanId: 7, kills: 4, placement: 2 },
        { memberId: 3, clanId: 9, kills: 1, placement: 1 },
      ]),
      [5, 7, 9],
      rules
    )

    expect(scores.map((score) => score.clanId)).toEqual([9, 7, 5])
  })

  it('departage une egalite de points par les kills puis par le placement', () => {
    const tieRules = normalizeTournamentRules({
      placementPoints: { 1: 4, 2: 6, 3: 8 },
      killPoints: 1,
      winBonus: 0,
    })

    const scores = computeTournamentRoundScores(
      roundMatch([
        // 8 pts chacun : le clan 7 a plus de kills, le clan 5 un meilleur placement.
        { memberId: 1, clanId: 5, kills: 4, placement: 1 },
        { memberId: 2, clanId: 7, kills: 2, placement: 2 },
        { memberId: 3, clanId: 9, kills: 0, placement: 3 },
      ]),
      [5, 7, 9],
      tieRules
    )

    expect(scores.map((score) => score.points)).toEqual([8, 8, 8])
    expect(scores.map((score) => score.clanId)).toEqual([5, 7, 9])
  })

  it('ecarte les clans non participants', () => {
    const scores = computeTournamentRoundScores(
      roundMatch([
        { memberId: 1, clanId: 5, kills: 3, placement: 1 },
        { memberId: 2, clanId: 99, kills: 9, placement: 1 },
      ]),
      [5],
      rules
    )

    expect(scores.map((score) => score.clanId)).toEqual([5])
  })
})
