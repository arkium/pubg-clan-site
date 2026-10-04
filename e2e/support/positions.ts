import type { ApiMock } from './api'
import { CLAN_ID, PLAYERS } from './data'
import { playstyleRows } from './stats'

import type { MapLocation } from '@/lib/map-location-service'
import type { MemberBreakdown } from '@/lib/positions-view'

/**
 * Cartographie tactique (e2e/positions.spec.ts). Villes placées au centre de cellules de la grille 40 × 40 (une
 * cellule = 2,5 % de la carte) : les comptes par ville sont exacts. Noms inventés, aucun lien avec la production.
 */

const city = (id: string, name: string, xIndex: number, yIndex: number, radiusPct: number): MapLocation => ({
  id,
  name,
  mapName: 'Baltic_Main',
  xPct: (xIndex + 0.5) * 2.5,
  yPct: (yIndex + 0.5) * 2.5,
  radiusPct,
  enabled: true,
})

export const POSITION_LOCATIONS: MapLocation[] = [
  city('pochinki', 'Pochinki', 18, 19, 4),
  city('school', 'School', 22, 16, 2),
  city('georgopol', 'Georgopol', 9, 11, 4),
  city('rozhok', 'Rozhok', 19, 13, 2),
  city('yasnaya', 'Yasnaya Polyana', 26, 11, 3),
  city('mylta', 'Mylta', 30, 23, 3),
]

const c = (xIndex: number, yIndex: number, count: number) => ({ xIndex, yIndex, count })

/** Clan entier, Erangel, toutes phases : 25 kills (Pochinki 12, School 5, Georgopol 3, Rozhok 2, Yasnaya 1, 2 dehors). */
const CLAN_CELLS = {
  kills: [c(18, 19, 8), c(17, 19, 4), c(22, 16, 5), c(9, 11, 3), c(19, 13, 2), c(26, 11, 1), c(5, 35, 2)],
  deaths: [c(18, 19, 4), c(22, 16, 6), c(9, 11, 1)],
  shots: [c(18, 19, 120), c(22, 16, 60), c(9, 11, 15)],
  damageDealt: [c(18, 19, 40), c(22, 16, 22)],
  damageTaken: [c(22, 16, 35), c(30, 23, 10)],
  knockoutsDealt: [c(18, 19, 6), c(22, 16, 2)],
  knockoutsTaken: [c(22, 16, 4)],
  revivesGiven: [c(18, 19, 3)],
  revivesTaken: [c(18, 19, 2), c(30, 23, 1)],
  // Un par véhicule : 7 pris, 7 laissés — la tuile n'en compte que 7.
  vehicleRides: [c(26, 11, 4), c(5, 35, 3)],
  vehicleLeaves: [c(26, 11, 2), c(9, 11, 5)],
}

const KEYS = PLAYERS.slice(0, 6).map((player, index) => ({ memberKey: `account.${index + 1}`, memberId: player.memberId, memberLabel: player.displayName }))

export function positionBreakdown(): MemberBreakdown[] {
  const kills = [7, 3, 2, 1, 0, 0]
  const deaths = [1, 4, 2, 1, 2, 1]
  return KEYS.map((key, index): MemberBreakdown => {
    const killsByLocation: Record<string, number> =
      index === 0 ? { pochinki: 7 } : index === 1 ? { school: 3 } : index < 4 ? { georgopol: kills[index] } : {}
    const deathsByLocation: Record<string, number> = index === 1 ? { school: 4 } : { pochinki: deaths[index] }
    return {
      ...key,
      totals: { kill: kills[index] + (index === 0 ? 2 : 0), death: deaths[index], shot: 30 - index * 4 },
      byLocation: { kill: killsByLocation, death: deathsByLocation },
    }
  })
}

export function positionsPayload(url: URL) {
  const map = url.searchParams.get('map') ?? 'Baltic_Main'
  const memberKey = url.searchParams.get('memberKey')
  const phase = url.searchParams.get('phase') ?? 'all'
  const empty = Object.fromEntries(Object.keys(CLAN_CELLS).map((key) => [key, []]))
  // Joueur Bravo : 3 kills à School et rien d'autre ; Miramar : 2 kills hors ville.
  const cells =
    map === 'Desert_Main'
      ? { ...empty, kills: [c(20, 20, 2)] }
      : memberKey === 'account.2'
        ? { ...empty, kills: [c(22, 16, 3)], deaths: [c(22, 16, 4)] }
        : CLAN_CELLS
  const data = {
    gridSize: 40,
    selectedMap: map,
    selectedMapLabel: map === 'Desert_Main' ? 'Miramar' : 'Erangel (Remastered)',
    selectedMemberKey: memberKey,
    selectedPhase: phase,
    maps: [
      { mapName: 'Baltic_Main', matches: 20, positionPoints: 900, rotationPoints: 200, deathPoints: 11 },
      { mapName: 'Desert_Main', matches: 8, positionPoints: 300, rotationPoints: 80, deathPoints: 4 },
    ],
    members: KEYS.map((key, index) => ({ ...key, points: 500 - index * 50 })),
    phases: [1, 2, 3, 4, 5, 6, 7, 8],
    positions: [],
    rotations: [],
    ...cells,
    safeZoneOverlay: phase === 'all' ? null : { x: 48, y: 46, r: phase === 'early' ? 30 : phase === 'mid' ? 15 : 6 },
    memberBreakdown: map === 'Desert_Main' ? [] : positionBreakdown(),
    note: '',
    mapLabels: {},
    phaseLabels: {},
    options: { mapLocations: { Baltic_Main: POSITION_LOCATIONS, Desert_Main: [] } },
  }
  return { ok: true, meta: { scope: 'clan', clanId: CLAN_ID }, data }
}

export function mockClanPositions(api: ApiMock) {
  api.on('GET', `/api/clans/${CLAN_ID}/telemetry/positions`, (url) => ({ body: positionsPayload(url) }))
  // Couleur des joueurs : style de jeu du clan sur la période.
  api.on('GET', `/api/clans/${CLAN_ID}/telemetry/playstyle`, { body: { ok: true, rows: playstyleRows() } })
}
