import { describe, expect, it } from 'vitest'

import { extractSquadMates } from './squad-mates'

// Reprend l'escouade du match Karakin cmu027vpd3ftl04tzlejla0vk : 2 membres du clan, 2 invités.
const memberStats = [
  { memberKey: 'account.pag', teamId: 1, kills: 2, damageDealt: 6, revives: 0, recalls: 0, deaths: 2 },
  { memberKey: 'account.sam', teamId: 1, kills: 4, damageDealt: 427, revives: 2, recalls: 0, deaths: 2 },
  { memberKey: 'account.mckoy', teamId: 1, kills: 0, damageDealt: 30.4, revives: 1, recalls: 0, deaths: 2 },
  { memberKey: 'account.dada', kills: 3, damageDealt: 302.2, knockouts: 1, revives: 1, recalls: 3, deaths: 1 },
  { memberKey: 'account.enemy', teamId: 9, kills: 7, damageDealt: 900 },
]

const positionSamples = [{ memberKey: 'account.dada', teamId: 1, x: 1, y: 1 }]

describe('extractSquadMates', () => {
  const { mates, mateStatsRows } = extractSquadMates({
    memberStats: JSON.stringify(memberStats),
    positionSamples,
    clanAccountIds: ['Account.PAG', 'account.sam'],
    identities: {
      'account.MCKOY': { name: 'CdtMcKoy' },
      'account.dada': { name: 'dada14smc', clanTag: 'SMC' },
    },
  })

  it('retient les coéquipiers hors clan de la même équipe, pas le lobby', () => {
    expect(mates.map((mate) => mate.name)).toEqual(['dada14smc', 'CdtMcKoy'])
    expect(mateStatsRows).toHaveLength(2)
  })

  it('complète l’équipe manquante de memberStats par les positions', () => {
    expect(mates[0]).toMatchObject({ teamId: 1, clanTag: 'SMC' })
  })

  it('reprend les statistiques de la télémétrie, dégâts arrondis', () => {
    expect(mates[0]).toMatchObject({ kills: 3, damage: 302, knockouts: 1, revives: 1, recalls: 3, deaths: 1 })
    expect(mates[1]).toMatchObject({ kills: 0, damage: 30, revives: 1 })
  })

  it('retient comme coéquipier un membre suivi dans un autre clan du site', () => {
    // Pagiotte (clan SMK) joue avec BOFS : il n'est « non suivi » que du point de vue de BOFS,
    // la route complète ensuite trackedClan depuis ClanMember.
    const result = extractSquadMates({
      memberStats: [
        { memberKey: 'account.kouner', teamId: 4, kills: 1 },
        { memberKey: 'account.pagiotte', teamId: 4, kills: 5, damageDealt: 376 },
      ],
      positionSamples: [],
      clanAccountIds: ['account.kouner'],
      identities: { 'account.pagiotte': { name: 'pagiotte', clanTag: 'SMK' } },
    })
    expect(result.mates).toMatchObject([{ name: 'pagiotte', kills: 5, damage: 376, clanTag: 'SMK' }])
  })

  it('ne renvoie rien sans membre du clan identifié dans le lobby', () => {
    expect(
      extractSquadMates({ memberStats, positionSamples, clanAccountIds: [], identities: {} }).mates
    ).toEqual([])
  })
})
