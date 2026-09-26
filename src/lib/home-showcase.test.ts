import { describe, expect, it } from 'vitest'

import {
  buildKillFeed,
  centimetersToMeters,
  dedupeKills,
  formatMatchDuration,
  killScore,
  mapImagePath,
  pickMvpMemberId,
  pickSquadClan,
  teamCountFromPhaseSnapshots,
  teamModeFromGameMode,
  topWeaponsByKiller,
  weaponLabel,
  type FeedKill,
} from '@/lib/home-showcase'

const LABELS = { WeapKar98k_C: 'Kar98k', WeapM416_C: 'M416', WeapPan_C: 'Poêle' }

function kill(overrides: Partial<FeedKill> = {}): FeedKill {
  return {
    id: 'k1',
    squadMatchId: 'm1',
    killerAccountId: 'account.killer',
    victimAccountId: 'account.victim',
    timestampSeconds: 100,
    matchDate: new Date('2026-09-26T20:00:00Z'),
    killer: 'Alpha',
    killerClanTag: 'SMK',
    weaponName: 'WeapM416_C',
    distance: 2500,
    headshot: false,
    victimClanTag: null,
    ...overrides,
  }
}

describe('home-showcase — formatage', () => {
  it('convertit les centimètres de la télémétrie en mètres arrondis', () => {
    expect(centimetersToMeters(31_240)).toBe(312)
    expect(centimetersToMeters(0)).toBeNull()
    expect(centimetersToMeters(null)).toBeNull()
    expect(centimetersToMeters(Number.NaN)).toBeNull()
  })

  it('formate la durée d’une partie', () => {
    expect(formatMatchDuration(1654)).toBe('27 min 34')
    expect(formatMatchDuration(545)).toBe('9 min 05')
    expect(formatMatchDuration(0)).toBeNull()
    expect(formatMatchDuration(null)).toBeNull()
  })

  it('ne propose un fond de carte que s’il existe dans public/maps/pubg', () => {
    expect(mapImagePath('Desert_Main')).toBe('/maps/pubg/Desert_Main.webp')
    expect(mapImagePath('Unknown_Main')).toBeNull()
  })

  it('lit le nombre d’équipes au départ dans les instantanés de phase de la télémétrie', () => {
    expect(
      teamCountFromPhaseSnapshots([
        { isGame: 0, numAliveTeams: 31 }, // salle d'attente : des joueurs peuvent encore partir
        { isGame: 0.1, numAliveTeams: 29 },
        { isGame: 1, numAliveTeams: 27 },
        { isGame: 7, numAliveTeams: 2 },
      ])
    ).toBe(29)
    expect(teamCountFromPhaseSnapshots([{ isGame: 0, numAliveTeams: 30 }])).toBe(30)
    expect(teamCountFromPhaseSnapshots([{ isGame: 1, numAliveTeams: 0 }])).toBeNull()
    expect(teamCountFromPhaseSnapshots(null)).toBeNull()
    expect(teamCountFromPhaseSnapshots('corrompu')).toBeNull()
  })

  it('déduit le mode d’équipe du mode de jeu, sinon du nombre de membres suivis', () => {
    expect(teamModeFromGameMode('squad-fpp', 2)).toBe('squad')
    expect(teamModeFromGameMode('duo', 2)).toBe('duo')
    expect(teamModeFromGameMode('solo-fpp', 1)).toBe('solo')
    expect(teamModeFromGameMode('normal', 3)).toBe('trio')
  })

  it('libelle une arme par le dictionnaire, sinon par sa clé nettoyée', () => {
    expect(weaponLabel('WeapKar98k_C', LABELS)).toBe('Kar98k')
    expect(weaponLabel('WeapNew_Gun_C', LABELS)).toBe('New Gun')
    expect(weaponLabel(null, LABELS)).toBe('Inconnu')
  })
})

describe('home-showcase — équipe', () => {
  it('rattache l’équipe au clan le plus représenté, le premier à égalité', () => {
    const smk = { clanId: 1, clanName: 'Smokers', clanTag: 'SMK' }
    const fun = { clanId: 2, clanName: 'Fun', clanTag: 'FUN' }
    expect(pickSquadClan([fun, smk, smk])).toEqual(smk)
    expect(pickSquadClan([fun, smk])).toEqual(fun)
    expect(pickSquadClan([])).toBeNull()
  })

  it('désigne le MVP par les kills puis les dégâts, et personne sans kill ni dégât', () => {
    expect(
      pickMvpMemberId([
        { memberId: 1, kills: 4, damage: 300 },
        { memberId: 2, kills: 4, damage: 450 },
        { memberId: 3, kills: 2, damage: 900 },
      ])
    ).toBe(2)
    expect(pickMvpMemberId([{ memberId: 1, kills: 0, damage: 0 }])).toBeNull()
  })

  it('retient au plus deux armes par joueur, les plus meurtrières', () => {
    const weapons = topWeaponsByKiller(
      [
        { killerMemberId: 1, weaponName: 'WeapM416_C' },
        { killerMemberId: 1, weaponName: 'WeapKar98k_C' },
        { killerMemberId: 1, weaponName: 'WeapKar98k_C' },
        { killerMemberId: 1, weaponName: 'WeapPan_C' },
        { killerMemberId: null, weaponName: 'WeapM416_C' },
      ],
      LABELS
    )
    expect(weapons.get(1)).toEqual(['Kar98k', 'M416'])
    expect(weapons.size).toBe(1)
  })
})

describe('home-showcase — kill feed', () => {
  it('note la poêle, la longue distance et le tir à la tête', () => {
    expect(killScore({ weaponName: 'WeapM416_C', distance: 2_000, headshot: false })).toBe(0)
    expect(killScore({ weaponName: 'WeapPan_C', distance: 100, headshot: false })).toBe(3)
    expect(killScore({ weaponName: 'WeapPanProjectile_C', distance: 900, headshot: false })).toBe(3)
    // Panzerfaust n'est pas une poêle.
    expect(killScore({ weaponName: 'WeapPanzerFaust100M1_C', distance: 900, headshot: false })).toBe(0)
    expect(killScore({ weaponName: 'WeapKar98k_C', distance: 31_200, headshot: true })).toBe(3)
  })

  it('ne garde qu’une fois un frag enregistré par deux clans de la même équipe', () => {
    const twice = [kill({ id: 'a' }), kill({ id: 'b' }), kill({ id: 'c', timestampSeconds: 200 })]
    expect(dedupeKills(twice).map((entry) => entry.id)).toEqual(['a', 'c'])
  })

  it('classe les kills remarquables en tête et intercale une victoire toutes les quatre lignes', () => {
    const kills = [
      kill({ id: 'plain', killer: 'A', timestampSeconds: 1 }),
      kill({ id: 'pan', killer: 'B', weaponName: 'WeapPan_C', timestampSeconds: 2 }),
      kill({ id: 'long', killer: 'C', weaponName: 'WeapKar98k_C', distance: 40_000, timestampSeconds: 3 }),
      kill({ id: 'head', killer: 'D', headshot: true, timestampSeconds: 4 }),
      kill({ id: 'plain2', killer: 'E', timestampSeconds: 5 }),
    ]
    const feed = buildKillFeed({ kills, wins: [{ squadMatchId: 'm1', clanTag: 'SMK', mapLabel: 'Miramar' }], labels: LABELS })
    expect(feed.map((entry) => entry.id)).toEqual(['pan', 'long', 'head', 'plain2', 'win-m1', 'plain'])
    expect(feed[1]).toMatchObject({ kind: 'kill', weapon: 'Kar98k', distanceMeters: 400, killerClanTag: 'SMK' })
    expect(feed[4]).toEqual({ id: 'win-m1', kind: 'win', clanTag: 'SMK', mapLabel: 'Miramar' })
  })

  it('plafonne un même tueur tant que d’autres kills restent, puis complète', () => {
    const kills = [
      ...[1, 2, 3, 4].map((t) => kill({ id: `hot-${t}`, killer: 'Hot', headshot: true, timestampSeconds: t })),
      kill({ id: 'other', killer: 'Other', timestampSeconds: 9 }),
    ]
    const ids = buildKillFeed({ kills, wins: [], labels: LABELS, limit: 4 }).map((entry) => entry.id)
    expect(ids).toHaveLength(4)
    expect(ids).toContain('other')
    expect(ids.filter((id) => id.startsWith('hot-'))).toHaveLength(3)
  })

  it('montre les victoires même sans aucun kill', () => {
    const feed = buildKillFeed({
      kills: [],
      wins: [
        { squadMatchId: 'm1', clanTag: 'SMK', mapLabel: 'Erangel' },
        { squadMatchId: 'm2', clanTag: 'FUN', mapLabel: 'Taego' },
      ],
      labels: LABELS,
    })
    expect(feed.map((entry) => entry.kind)).toEqual(['win', 'win'])
  })

  it('ne transmet jamais l’identité de la victime, seulement le tag de son clan', () => {
    const feed = buildKillFeed({ kills: [kill({ victimClanTag: 'ABC' })], wins: [], labels: LABELS })
    expect(feed[0]).toMatchObject({ victimClanTag: 'ABC' })
    expect(JSON.stringify(feed)).not.toContain('account.victim')
  })
})
