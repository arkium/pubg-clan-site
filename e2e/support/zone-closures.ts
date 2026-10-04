import type { ApiMock } from './api'
import { CLAN_ID, PLAYERS } from './data'
import { playstyleRows } from './stats'

/**
 * Fin de zone (e2e/zone-closures.spec.ts) : deux cartes, dix joueurs dont sept sous le seuil de dix fermetures (fin de
 * liste : « Qui joue le cercle » tient sur deux pages, 8 puis 2 sur ordinateur, 5 puis 5 sur mobile).
 * Chiffres proches du clan 13 la semaine du 2026-10-04 : le bord domine, un tiers dehors (verdict « la zone vous colle
 * aux talons »). Un joueur filtré ne voit que ses propres bandes ; la liste des joueurs reste complète.
 */

const member = (index: number, positions: number, averageRatio: number, center: number, edge: number, outside: number) => ({
  memberId: PLAYERS[index].memberId,
  displayName: PLAYERS[index].displayName,
  positions,
  averageRatio,
  bands: { center, edge, outside },
})

const MEMBERS = [
  member(0, 81, 1.08, 12, 45, 24),
  member(1, 74, 0.74, 20, 48, 6),
  member(2, 36, 1.52, 2, 18, 16),
  member(3, 6, 0.4, 5, 1, 0),
  // Petits échantillons : fin de liste, sans titre ni profil.
  ...[4, 5, 6, 7, 8, 9].map((index) => member(index, 3, 0.5 + index / 10, 1, 1, 1)),
]

export function zoneClosuresResponse(url: URL) {
  const map = url.searchParams.get('map') || 'Baltic_Main'
  const memberId = Number(url.searchParams.get('memberId')) || null
  const selected = MEMBERS.find((entry) => entry.memberId === memberId)
  const bands = selected?.bands ?? { center: 39, edge: 112, outside: 46 }
  const positions = bands.center + bands.edge + bands.outside
  return {
    selectedMap: map,
    selectedMapLabel: map === 'Baltic_Main' ? 'Erangel' : 'Miramar',
    mapOptions: [
      { mapName: 'Baltic_Main', label: 'Erangel', positions: 197, matches: 24 },
      { mapName: 'Desert_Main', label: 'Miramar', positions: 40, matches: 6 },
    ],
    members: MEMBERS,
    counts: { positions, matches: 24, closures: 61, members: 4, averageSurvivors: 31.4 },
    bands,
    averageRatio: selected?.averageRatio ?? 1.04,
    byPhase: [
      { phase: 2, positions: 80, averageRatio: 0.9, bands: { center: 20, edge: 48, outside: 12 } },
      { phase: 3, positions: 62, averageRatio: 1.1, bands: { center: 11, edge: 35, outside: 16 } },
      { phase: 5, positions: 55, averageRatio: 1.2, bands: { center: 8, edge: 29, outside: 18 } },
    ],
    cells: [
      { xIndex: 18, yIndex: 19, count: 12 },
      { xIndex: 22, yIndex: 16, count: 5 },
      { xIndex: 9, yIndex: 11, count: 2 },
    ],
    topCities: [
      { locationId: 'pochinki', name: 'Pochinki', positions: 12, share: 63.2 },
      { locationId: 'school', name: 'School', positions: 5, share: 26.3 },
      { locationId: 'georgopol', name: 'Georgopol', positions: 2, share: 10.5 },
    ],
    dataStart: '2026-08-01T00:00:00.000Z',
    phase: url.searchParams.get('phase') ?? 'all',
  }
}

export function mockClanZoneClosures(api: ApiMock) {
  api
    .on('GET', `/api/clans/${CLAN_ID}/telemetry/zone-closures`, (url) => ({ body: zoneClosuresResponse(url) }))
    .on('GET', `/api/clans/${CLAN_ID}/telemetry/playstyle`, { body: { ok: true, rows: playstyleRows() } })
}
