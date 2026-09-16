import { describe, expect, it } from 'vitest'

import { buildTeamIndex, listMatchTeams, pickFocusTeam } from './match-teams'

const memberStats = [
  { memberKey: 'account.a1', teamId: 3, teamPlacement: 2, kills: 4 },
  { memberKey: 'account.a2', teamId: 3, teamPlacement: 2, kills: 1 },
  { memberKey: 'account.b1', teamId: 7, teamPlacement: 1, kills: 6 },
  { memberKey: 'account.b2', teamId: 7, teamPlacement: 1, kills: 2 },
  { memberKey: 'ai.bot', teamId: 9, kills: 0 },
]

const identities = {
  'account.a1': { name: 'Pagiotte', clanTag: 'SMK', clanId: 1 },
  'account.a2': { name: 'Zimba', clanTag: 'FADA' },
  'account.b1': { name: 'Raf1', clanTag: 'RAF', clanId: 5 },
  'account.b2': { name: 'Raf2', clanTag: 'RAF', clanId: 5 },
}

describe('listMatchTeams', () => {
  it('regroupe le lobby par équipe, trié par classement final', () => {
    const teams = listMatchTeams({ memberStats, positionSamples: [], identities })

    expect(teams.map((team) => team.teamId)).toEqual([7, 3, 9])
    expect(teams[0]).toMatchObject({ placement: 1, kills: 8, trackedClanIds: [5], tag: 'RAF' })
    expect(teams[1].players.map((player) => player.name)).toEqual(['Pagiotte', 'Zimba'])
    expect(teams[2]).toMatchObject({ placement: null, trackedClanIds: [], tag: null })
    expect(teams[2].players[0].name).toBe('Bot')
  })

  it('complète un classement manquant : API PUBG des membres suivis, sinon ordre des éliminations', () => {
    const stats = [
      { memberKey: 'account.win', teamId: 1, teamPlacement: 1, kills: 3 },
      { memberKey: 'account.tracked', teamId: 2, kills: 1 },
      { memberKey: 'account.early', teamId: 3, kills: 0 },
      { memberKey: 'account.late', teamId: 4, kills: 2 },
    ]
    const teams = listMatchTeams({
      memberStats: stats,
      positionSamples: [],
      identities: {},
      trackedPlacements: { 'account.tracked': 6 },
      deathSamples: [
        { memberKey: 'account.early', teamId: 3, timestampSeconds: 100 },
        { memberKey: 'account.late', teamId: 4, timestampSeconds: 900 },
        { memberKey: 'account.tracked', teamId: 2, timestampSeconds: 500 },
      ],
    })

    const byTeam = new Map(teams.map((team) => [team.teamId, team]))
    expect(byTeam.get(1)).toMatchObject({ placement: 1, placementEstimated: false })
    expect(byTeam.get(2)).toMatchObject({ placement: 6, placementEstimated: false })
    // Équipe 4 éliminée après les équipes 2 et 3, avant la gagnante (sans mort) : 2e.
    expect(byTeam.get(4)).toMatchObject({ placement: 2, placementEstimated: true })
    expect(byTeam.get(3)).toMatchObject({ placement: 4, placementEstimated: true })
    expect(teams.map((team) => team.teamId)).toEqual([1, 4, 3, 2])
  })

  it('reprend l’équipe des positions quand memberStats ne la porte pas', () => {
    const index = buildTeamIndex([{ memberKey: 'Account.X' }], [{ memberKey: 'account.x', teamId: 12 }])
    expect(index.get('account.x')).toBe(12)
  })
})

describe('pickFocusTeam', () => {
  const teams = listMatchTeams({ memberStats, positionSamples: [], identities })

  it('retient l’équipe demandée si elle existe', () => {
    expect(pickFocusTeam(teams, { teamId: 3, clanId: 5 })?.teamId).toBe(3)
  })

  it('sinon l’équipe du clan consulté, sinon la mieux classée', () => {
    expect(pickFocusTeam(teams, { teamId: 99, clanId: 1 })?.teamId).toBe(3)
    expect(pickFocusTeam(teams, { clanId: 42 })?.teamId).toBe(7)
    expect(pickFocusTeam([], {})).toBeNull()
  })
})
