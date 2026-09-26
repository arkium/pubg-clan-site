import { describe, expect, it } from 'vitest'

import {
  accuracyOf,
  clampPage,
  countTimelineTypes,
  filterTimeline,
  formatClock,
  formatDistance,
  groupTimelineByPhase,
  hitZoneLabel,
  isHeadshot,
  pageOfIndex,
  parseDebriefTab,
  phaseStartTimes,
  squadTotals,
  throwableSummary,
  survivalPercent,
  weaponDisplayName,
  zoneBars,
  type TimelineEventLike,
} from './debrief-view'

function ev(overrides: Partial<TimelineEventLike> & Pick<TimelineEventLike, 'id' | 'type'>): TimelineEventLike {
  return { timestamp: 100, phaseNumber: 1, actorAffiliation: 'external', targetAffiliation: 'external', ...overrides }
}

const EVENTS: TimelineEventLike[] = [
  ev({ id: 'k1', type: 'kill', timestamp: 300, phaseNumber: 2, isSquadActor: true }),
  ev({ id: 'k2', type: 'kill', timestamp: 120, phaseNumber: 2, isSquadActor: true }),
  ev({ id: 'd1', type: 'kill', timestamp: 900, phaseNumber: 4, isSquadTarget: true }),
  ev({ id: 'n1', type: 'knock', timestamp: 80, phaseNumber: 1, isSquadActor: true }),
  ev({ id: 'r1', type: 'recall', timestamp: 700, phaseNumber: 3, isSquadActor: true }),
  ev({ id: 'x1', type: 'kill', timestamp: 60, phaseNumber: 1 }),
  ev({ id: 't1', type: 'knock', timestamp: 200, phaseNumber: 2, actorAffiliation: 'tracked_clan' }),
  // Ancien payload : pas de drapeau d'escouade, on retombe sur le clan.
  ev({ id: 'old', type: 'revive', timestamp: 400, phaseNumber: 3, actorAffiliation: 'current_clan' }),
]

describe('debrief-view — onglet et temps', () => {
  it('lit l’onglet dans l’URL, Chronologie par défaut', () => {
    expect(parseDebriefTab('duels')).toBe('duels')
    expect(parseDebriefTab('inconnu')).toBe('combat')
    expect(parseDebriefTab(null)).toBe('combat')
  })

  it('formate l’horloge du match', () => {
    expect(formatClock(1110)).toBe('18:30')
    expect(formatClock(65.9)).toBe('1:05')
    expect(formatClock(null)).toBe('—')
    expect(formatClock(-3)).toBe('—')
  })

  it('date le début de chaque phase depuis les instantanés de la télémétrie', () => {
    const starts = phaseStartTimes([
      { isGame: 0.1, timestampSeconds: 10 },
      { isGame: 1, timestampSeconds: 98 },
      { isGame: 1.5, timestampSeconds: 300 },
      { isGame: 2, timestampSeconds: 420 },
      { isGame: 'x', timestampSeconds: 5 },
    ])
    expect(starts).toEqual([
      { phase: 1, t: 98 },
      { phase: 2, t: 420 },
    ])
    expect(phaseStartTimes(null)).toEqual([])
  })
})

describe('debrief-view — chronologie', () => {
  it('filtre par portée et par type', () => {
    expect(filterTimeline(EVENTS, 'squad', 'all').map((e) => e.id)).toEqual(['k1', 'k2', 'd1', 'n1', 'r1', 'old'])
    expect(filterTimeline(EVENTS, 'tracked', 'knock').map((e) => e.id)).toEqual(['n1', 't1'])
    expect(filterTimeline(EVENTS, 'all', 'kill')).toHaveLength(4)
  })

  it('compte chaque type pour la portée choisie', () => {
    expect(countTimelineTypes(EVENTS, 'squad')).toEqual({ all: 6, kill: 3, knock: 1, revive: 1, recall: 1 })
    expect(countTimelineTypes(EVENTS, 'all').all).toBe(EVENTS.length)
  })

  it('fait le bilan de l’escouade', () => {
    expect(squadTotals(EVENTS)).toEqual({ kills: 2, knocks: 1, deaths: 1, recalls: 1 })
  })

  it('groupe par phase, trie dans la phase et résume kills et morts', () => {
    const groups = groupTimelineByPhase(filterTimeline(EVENTS, 'squad', 'all'))
    expect(groups.map((g) => g.phase)).toEqual([1, 2, 3, 4])
    const phase2 = groups.find((g) => g.phase === 2)!
    expect(phase2.events.map((e) => e.id)).toEqual(['k2', 'k1'])
    expect(phase2.start).toBe(120)
    expect(phase2.summary).toBe('+2 kills')
    expect(groups.find((g) => g.phase === 4)!.summary).toBe('−1 mort')
    expect(groups.find((g) => g.phase === 3)!.summary).toBe('')
  })

  it('localise l’impact sans l’inventer', () => {
    expect(hitZoneLabel('HeadShot')).toBe('Tête')
    expect(hitZoneLabel('NonSpecific')).toBe('Non localisée')
    expect(hitZoneLabel(null)).toBe('Non localisée')
    expect(isHeadshot('HeadShot')).toBe(true)
    expect(isHeadshot('TorsoShot')).toBe(false)
  })

  it('libelle les armes par le dictionnaire, sinon par la clé nettoyée', () => {
    expect(weaponDisplayName('WeapHK416_C', { WeapHK416_C: 'M416' })).toBe('M416')
    expect(weaponDisplayName('WeapBerylM762_C')).toBe('BerylM762')
    expect(weaponDisplayName(null)).toBe('Inconnue')
  })
})

describe('debrief-view — équipes, joueurs, duels', () => {
  it('pagine les équipes et retrouve la page de l’escouade analysée', () => {
    expect(clampPage(9, 26, 4)).toBe(6)
    expect(clampPage(-1, 26, 4)).toBe(0)
    expect(clampPage(0, 0, 4)).toBe(0)
    expect(pageOfIndex(9, 4)).toBe(2)
    expect(pageOfIndex(-1, 4)).toBe(0)
  })

  it('mesure la part de partie survécue', () => {
    expect(survivalPercent(null, 1632)).toBe(100)
    expect(survivalPercent(816, 1632)).toBe(50)
    expect(survivalPercent(2000, 1632)).toBe(100)
    expect(survivalPercent(300, null)).toBe(0)
  })

  it('calcule la précision d’un joueur sur toutes ses armes', () => {
    expect(accuracyOf({ weapons: [{ shotsFired: 80, hitsLanded: 20 }, { shotsFired: 20, hitsLanded: 10 }] })).toEqual({
      shots: 100,
      hits: 30,
      percent: 30,
    })
    expect(accuracyOf(undefined).percent).toBeNull()
  })

  it('formate les distances parcourues', () => {
    expect(formatDistance(850.4)).toBe('850 m')
    expect(formatDistance(2410)).toBe('2,4 km')
    expect(formatDistance(undefined)).toBe('0 m')
  })

  it('construit les barres par zone, à l’échelle de la zone la plus touchée', () => {
    const { bars, hits, headPercent, unlocalizedDamage } = zoneBars([
      { zone: 'head', hits: 4, damage: 200 },
      { zone: 'torso', hits: 12, damage: 400 },
      { zone: 'other', hits: 2, damage: 90.4 },
    ])
    expect(bars.map((bar) => bar.zone)).toEqual(['head', 'torso', 'pelvis', 'arms', 'legs'])
    expect(bars[0]).toMatchObject({ label: 'Tête', widthPercent: 50, hits: 4 })
    expect(bars[1].widthPercent).toBe(100)
    expect(bars[2].widthPercent).toBe(0)
    expect(hits).toBe(16)
    expect(headPercent).toBe(25)
    expect(unlocalizedDamage).toBe(90)
    expect(zoneBars(null).headPercent).toBeNull()
  })
})

describe('debrief-view — lancers', () => {
  it('résume les objets de combat lancés, par ligne d’objet (format de l’API)', () => {
    // L'ancienne vue lisait `smokeGrenadeCount`, absent de l'API : les lancers ne s'affichaient jamais.
    expect(
      throwableSummary([
        { itemId: 'Item_Weapon_SmokeBomb_C', count: 2 },
        { itemId: 'Item_Weapon_Grenade_C', count: 1 },
        { itemId: 'Item_Weapon_Juju_C', count: 9 },
        { itemId: 'Item_Weapon_SmokeBomb_C', count: 1 },
      ])
    ).toBe('1 grenade · 3 fumigènes')
    expect(throwableSummary([])).toBe('')
  })
})
