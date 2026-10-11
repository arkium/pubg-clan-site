import { describe, expect, it } from 'vitest'

import {
  TOURNAMENT_AWARDS,
  buildClanAverages,
  buildTournamentLeaders,
  computeTournamentAwards,
  computeTournamentFacts,
  computeTournamentWeapons,
  type TournamentRoundStatRow,
  type TournamentTelemetryRound,
} from './tournament-stats'

const LABELS: Record<number, string> = {
  1: '[FUN] Botro45',
  2: '[FUN] L0RD19',
  3: '[OCD] Luckini',
  4: '[BEE] Serejaah',
  5: '[LTF] P0mpoko',
}
const memberLabel = (memberId: number) => LABELS[memberId] ?? `Joueur ${memberId}`
const clanLabel = (clanId: number) => ({ 1: '[FUN] FunsNRoses', 2: '[OCD] OCD', 3: '[BEE] Bee' })[clanId] ?? `Clan ${clanId}`

function player(memberId: number, clanId: number | null, totalPoints: number, totalKills = 0, rank = 1, totalDamage = 0) {
  return {
    key: `player:${memberId}`,
    participant: { kind: 'player' as const, memberId, clanId },
    totalPoints,
    totalKills,
    totalDamage,
    rank,
    label: memberLabel(memberId),
  }
}

function statRow(round: number, memberId: number, values: Partial<TournamentRoundStatRow> = {}): TournamentRoundStatRow {
  return {
    round,
    memberId,
    kills: 0,
    damage: 0,
    assists: 0,
    revives: 0,
    knockouts: 0,
    headshotKills: 0,
    timeSurvived: 0,
    rideDistance: 0,
    walkDistance: 0,
    swimDistance: 0,
    boosts: 0,
    heals: 0,
    vehicleDestroys: 0,
    roadKills: 0,
    longestKill: 0,
    weaponsAcquired: 0,
    ...values,
  }
}

function telemetryMember(memberId: number, values: Partial<TournamentTelemetryRound['members'][number]> = {}) {
  return { memberId, damageTaken: 0, circleDelaySeconds: 0, weapons: [], ...values }
}

describe('buildClanAverages — moyenne par player, formule du tableur', () => {
  it('somme des points des players du clan ÷ nombre de players, classée par moyenne', () => {
    const averages = buildClanAverages(
      [player(1, 1, 75, 22), player(2, 1, 69, 16), player(3, 2, 59, 12), player(4, 3, 38, 9), player(9, 1, 6, 0)],
      clanLabel
    )
    expect(averages.map((entry) => [entry.label, entry.players, entry.points, entry.rank])).toEqual([
      ['[OCD] OCD', 1, 59, 1],
      ['[FUN] FunsNRoses', 3, 150, 2],
      ['[BEE] Bee', 1, 38, 3],
    ])
    expect(averages[1].average).toBe(50)
    expect(averages[1].kills).toBe(38)
    // Clé et participant d'un clan : le lecteur est repéré comme dans le cumul par clan.
    expect(averages[1].key).toBe('clan:1')
    expect(averages[1].participant).toEqual({ kind: 'clan', clanId: 1 })
  })

  it('tout clan est classé, même à un seul player ; un joueur sans clan ne compte pour aucun', () => {
    const averages = buildClanAverages([player(4, 3, 38), player(7, null, 90)], clanLabel)
    expect(averages).toHaveLength(1)
    expect(averages[0]).toMatchObject({ label: '[BEE] Bee', players: 1, average: 38 })
  })

  it('à moyenne égale, le plus de points passe devant', () => {
    const averages = buildClanAverages([player(1, 1, 20), player(2, 1, 20), player(3, 2, 20)], clanLabel)
    expect(averages.map((entry) => entry.label)).toEqual(['[FUN] FunsNRoses', '[OCD] OCD'])
  })
})

describe('buildTournamentLeaders — top killers et top scorers', () => {
  const players = [player(2, 1, 69, 16, 1), player(1, 1, 60, 22, 2), player(3, 2, 59, 12, 3)]
  const matches = [
    { members: [{ memberId: 1, kills: 12, damage: 1500 }, { memberId: 2, kills: 8, damage: 900 }, { memberId: 99, kills: 30, damage: 3000 }] },
    { members: [{ memberId: 1, kills: 10, damage: 1177 }, { memberId: 2, kills: 8, damage: 911 }, { memberId: 3, kills: 12, damage: 2028 }] },
  ]

  it('killers : toutes les manches, kills puis dégâts (la règle du MVP), sans les joueurs hors classement', () => {
    const { killers } = buildTournamentLeaders(matches, players, memberLabel)
    expect(killers.map((entry) => [entry.label, entry.kills, entry.damage, entry.rank])).toEqual([
      ['[FUN] Botro45', 22, 2677, 1],
      ['[FUN] L0RD19', 16, 1811, 2],
      ['[OCD] Luckini', 12, 2028, 3],
    ])
    expect(killers[0].points).toBe(60)
  })

  it('à kills égaux, les dégâts départagent', () => {
    const { killers } = buildTournamentLeaders(
      [{ members: [{ memberId: 2, kills: 5, damage: 400 }, { memberId: 3, kills: 5, damage: 900 }] }],
      players,
      memberLabel
    )
    expect(killers.map((entry) => entry.memberId)).toEqual([3, 2])
  })

  it('scorers : le détail par player, dans son ordre et avec ses rangs', () => {
    const { scorers } = buildTournamentLeaders(matches, players, memberLabel)
    expect(scorers.map((entry) => [entry.memberId, entry.points, entry.rank])).toEqual([
      [2, 69, 1],
      [1, 60, 2],
      [3, 59, 3],
    ])
  })
})

describe('computeTournamentAwards — awards du tournoi', () => {
  const rows = [
    statRow(1, 1, { kills: 8, damage: 1200, longestKill: 120.4, rideDistance: 3000, heals: 3 }),
    statRow(2, 1, { kills: 3, damage: 500, longestKill: 412.7, heals: 2 }),
    statRow(1, 2, { kills: 5, damage: 1900, knockouts: 6, rideDistance: 2500 }),
    statRow(3, 2, { kills: 9, damage: 300, heals: 1 }),
    statRow(2, 3, { kills: 1, revives: 4, timeSurvived: 1500 }),
  ]

  it('total sur le tournoi (dégâts) ou meilleure manche (carton, sniper) avec son numéro', () => {
    const { awards } = computeTournamentAwards({ rows, telemetry: [], rounds: 3, memberLabel })
    const byKey = Object.fromEntries(awards.map((award) => [award.key, award]))
    expect(byKey.top_damage.winners.map((winner) => [winner.memberId, winner.value, winner.round])).toEqual([
      [2, 2200, null],
      [1, 1700, null],
    ])
    expect(byKey.best_round.winners[0]).toMatchObject({ memberId: 2, value: 9, round: 3 })
    expect(byKey.best_round.winners[1]).toMatchObject({ memberId: 1, value: 8, round: 1 })
    expect(byKey.sniper.winners[0]).toMatchObject({ memberId: 1, value: 412.7, round: 2 })
    expect(byKey.heals.winners.map((winner) => winner.value)).toEqual([5, 1])
  })

  it('un award sans valeur positive n’apparaît pas ; sans télémétrie, ni ceux de la télémétrie ni le premier sang', () => {
    const { awards, telemetryRounds } = computeTournamentAwards({ rows, telemetry: [], rounds: 3, memberLabel })
    const keys = awards.map((award) => award.key)
    expect(keys).not.toContain('swimmer')
    expect(keys).not.toContain('damage_taken')
    expect(keys).not.toContain('first_blood')
    expect(telemetryRounds).toBe(0)
    // Ordre d'affichage : celui du catalogue.
    const order = TOURNAMENT_AWARDS.map((award) => award.key)
    expect(keys).toEqual([...keys].sort((left, right) => order.indexOf(left) - order.indexOf(right)))
  })

  it('trois lauréats au plus, égalité départagée par l’ordre alphabétique', () => {
    const tied = [1, 2, 3, 4, 5].map((memberId) => statRow(1, memberId, { boosts: 4 }))
    const award = computeTournamentAwards({ rows: tied, telemetry: [], rounds: 1, memberLabel }).awards.find((entry) => entry.key === 'boosts')
    expect(award?.winners.map((winner) => winner.label)).toEqual(['[BEE] Serejaah', '[FUN] Botro45', '[FUN] L0RD19'])
  })

  it('télémétrie : dégâts encaissés, temps hors zone, premier sang et premier éliminé (manche gardée si unique)', () => {
    const telemetry: TournamentTelemetryRound[] = [
      { round: 1, members: [telemetryMember(1, { damageTaken: 300, circleDelaySeconds: 40 }), telemetryMember(2, { damageTaken: 500 })], firstKill: { killerId: 1, victimId: 3 } },
      { round: 2, members: [telemetryMember(1, { damageTaken: 250, circleDelaySeconds: 25.5 })], firstKill: { killerId: 1, victimId: null } },
      // Premier kill fait par un joueur hors classement : personne n'est sacré pour cette manche.
      { round: 3, members: [], firstKill: { killerId: null, victimId: 2 } },
    ]
    const { awards, telemetryRounds } = computeTournamentAwards({ rows, telemetry, rounds: 3, memberLabel })
    const byKey = Object.fromEntries(awards.map((award) => [award.key, award]))
    expect(telemetryRounds).toBe(3)
    expect(byKey.damage_taken.winners.map((winner) => [winner.memberId, winner.value])).toEqual([[1, 550], [2, 500]])
    expect(byKey.blue_zone.winners).toEqual([{ memberId: 1, label: '[FUN] Botro45', value: 65.5, round: null }])
    // Deux premiers sangs : un total, sans manche. Un seul premier éliminé chacun : sa manche, la plus ancienne d'abord.
    expect(byKey.first_blood.winners).toEqual([{ memberId: 1, label: '[FUN] Botro45', value: 2, round: null }])
    expect(byKey.first_out.winners.map((winner) => [winner.memberId, winner.value, winner.round])).toEqual([[3, 1, 1], [2, 1, 3]])
  })
})

describe('computeTournamentFacts — fun facts', () => {
  it('kills (dont à la tête), manche la plus sanglante, dégâts, distance en véhicule', () => {
    const facts = computeTournamentFacts([
      statRow(1, 1, { kills: 8, headshotKills: 2, damage: 1200.4, rideDistance: 3000 }),
      statRow(2, 1, { kills: 3, damage: 500 }),
      statRow(2, 2, { kills: 5, headshotKills: 1, damage: 300, rideDistance: 1500.6 }),
    ])
    expect(facts.map((fact) => [fact.key, fact.value, fact.detail])).toEqual([
      ['kills', 16, 'dont 3 à la tête'],
      ['bloodiest_round', 8, 'Manche 1'],
      ['damage', 2000, null],
      ['vehicle_distance', 4501, null],
    ])
  })

  it('à égalité, la manche la plus sanglante est la première jouée ; aucune ligne, aucun fait', () => {
    const facts = computeTournamentFacts([statRow(2, 1, { kills: 4 }), statRow(1, 2, { kills: 4 })])
    expect(facts.find((fact) => fact.key === 'bloodiest_round')?.detail).toBe('Manche 1')
    expect(computeTournamentFacts([])).toEqual([])
  })
})

describe('computeTournamentWeapons — armes du tournoi', () => {
  const weapon = (weaponName: string, kills: number, damageDealt = kills * 100, headshots = 0) => ({ weaponName, kills, headshots, damageDealt })
  const telemetry: TournamentTelemetryRound[] = [
    {
      round: 1,
      firstKill: null,
      members: [
        telemetryMember(1, { weapons: [weapon('WeapMP5K_C', 4), weapon('WeapUMP_C', 7), weapon('BP_Motorbike_04_C', 3)] }),
        telemetryMember(5, { weapons: [weapon('WeapUMP_C', 13, 1500, 2)] }),
        telemetryMember(2, { weapons: [weapon('WeapM24_C', 9), weapon('ProjGrenade_C', 1)] }),
      ],
    },
    {
      round: 2,
      firstKill: null,
      members: [
        telemetryMember(1, { weapons: [weapon('WeapMP5K_C', 1), weapon('WeapM24_C', 5)] }),
        telemetryMember(3, { weapons: [weapon('WeapMP5K_C', 5, 400), weapon('WeapUMP_C', 0, 300)] }),
        telemetryMember(4, { weapons: [weapon('WeapMP5K_C', 5, 600)] }),
      ],
    },
  ]
  const weaponLabel = (id: string) => ({ WeapMP5K_C: 'MP5K', WeapUMP_C: 'UMP45', WeapM24_C: 'M24', ProjGrenade_C: 'Grenade' })[id] ?? id

  it('classe les armes par kills des players et garde leurs trois meilleurs tireurs (dégâts pour départager)', () => {
    const weapons = computeTournamentWeapons(telemetry, memberLabel, weaponLabel)
    expect(weapons.map((entry) => [entry.name, entry.kills])).toEqual([
      ['UMP45', 20],
      ['MP5K', 15],
      ['M24', 14],
      ['Grenade', 1],
    ])
    expect(weapons[0].headshots).toBe(2)
    expect(weapons[0].shooters.map((shooter) => [shooter.label, shooter.kills])).toEqual([
      ['[LTF] P0mpoko', 13],
      ['[FUN] Botro45', 7],
    ])
    // MP5K : 5 kills chacun pour Serejaah (600 dégâts) et Luckini (400), puis Botro45 (5 kills sur deux manches, 500).
    expect(weapons[1].shooters.map((shooter) => shooter.label)).toEqual(['[BEE] Serejaah', '[FUN] Botro45', '[OCD] Luckini'])
  })

  it('ni véhicule ni arme sans kill ; huit armes au plus', () => {
    const weapons = computeTournamentWeapons(telemetry, memberLabel, weaponLabel)
    expect(weapons.map((entry) => entry.iconId)).not.toContain('BP_Motorbike_04_C')
    expect(computeTournamentWeapons(telemetry, memberLabel, weaponLabel, 2)).toHaveLength(2)
  })
})
