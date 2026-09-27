import type { ApiMock } from './api'
import { CLAN_ID, MEMBER_ID, PLAYERS } from './data'
import { mockMemberProfile } from './members'

import { dropPressureLevel } from '@/lib/drop-zone-pressure'
import type { LandingPoint } from '@/lib/drop-zones-view'
import type { MapLocation, MapLocations } from '@/lib/map-location-service'

/**
 * Zones de drop du clan et d'un joueur (e2e/drop-zones.spec.ts). Villes et sauts inventés, déterministes : Erangel
 * (6 villes, 6 joueurs), Miramar (2 villes, 2 joueurs). Aucun lien avec la production.
 */

const city = (mapName: string, id: string, name: string, xPct: number, yPct: number, radiusPct: number): MapLocation => ({
  id,
  name,
  mapName,
  xPct,
  yPct,
  radiusPct,
  enabled: true,
})

export const DROP_LOCATIONS: MapLocations = {
  Baltic_Main: [
    city('Baltic_Main', 'pochinki', 'Pochinki', 45, 49, 5),
    city('Baltic_Main', 'georgopol', 'Georgopol', 22, 29, 6),
    city('Baltic_Main', 'rozhok', 'Rozhok', 48, 34, 4),
    city('Baltic_Main', 'school', 'School', 58, 42, 3),
    city('Baltic_Main', 'yasnaya', 'Yasnaya Polyana', 68, 28, 5),
    city('Baltic_Main', 'mylta', 'Mylta', 75, 60, 4),
  ],
  Desert_Main: [city('Desert_Main', 'pecado', 'Pecado', 51, 54, 4), city('Desert_Main', 'leones', 'Los Leones', 62, 77, 6)],
}

// [carte, ville, joueur (index), sauts, adversaires à 250 m]
const JUMPS: Array<[string, string, number, number, number]> = [
  ['Baltic_Main', 'pochinki', 0, 5, 9],
  ['Baltic_Main', 'pochinki', 1, 3, 12],
  ['Baltic_Main', 'georgopol', 1, 3, 1],
  ['Baltic_Main', 'rozhok', 2, 3, 4],
  ['Baltic_Main', 'school', 3, 2, 18],
  ['Baltic_Main', 'yasnaya', 4, 2, 2],
  ['Baltic_Main', 'mylta', 5, 1, 0],
  ['Baltic_Main', 'dehors', 0, 1, 0],
  ['Desert_Main', 'pecado', 0, 3, 14],
  ['Desert_Main', 'leones', 1, 2, 3],
]

export function dropPoints(): LandingPoint[] {
  let match = 0
  return JUMPS.flatMap(([mapName, cityId, playerIndex, count, opponents]) => {
    const location = DROP_LOCATIONS[mapName].find((entry) => entry.id === cityId)
    return Array.from({ length: count }, (_, index) => {
      match += 1
      const angle = (index * 2 * Math.PI) / Math.max(count, 1)
      const xPct = location ? location.xPct + Math.cos(angle) * location.radiusPct * 0.5 : 10 + index
      const yPct = location ? location.yPct + Math.sin(angle) * location.radiusPct * 0.5 : 90
      return {
        memberId: PLAYERS[playerIndex].memberId,
        memberName: PLAYERS[playerIndex].displayName,
        matchId: `dz-${match}`,
        mapName,
        x: xPct * 8160,
        y: yPct * 8160,
        xPct,
        yPct,
        nearbyPlayerCount250m: opponents + 3,
        nearbyOpponentCount250m: opponents,
        pressureLevel: dropPressureLevel(opponents),
      }
    })
  })
}

function dropZonesBody(points: LandingPoint[], extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    meta: { period: 'week', periodKey: 'week-2026-39', count: points.length },
    data: { gridSize: 40, points, heatmap: [], options: { mapLocations: DROP_LOCATIONS }, ...extra },
  }
}

export function mockClanDropZones(api: ApiMock, points: LandingPoint[] = dropPoints()) {
  api.on('GET', `/api/clans/${CLAN_ID}/telemetry/drop-zones`, { body: dropZonesBody(points) })
}

export function mockMemberDropZones(api: ApiMock) {
  mockMemberProfile(api)
  const all = dropPoints()
  api
    .on('GET', `/api/members/${MEMBER_ID}/telemetry/drop-zones`, (url) => {
      const scope = url.searchParams.get('scope') ?? 'self'
      const points = scope === 'clan' ? all : all.filter((point) => point.memberId === MEMBER_ID)
      return {
        body: dropZonesBody(points, {
          member: { id: MEMBER_ID, displayName: PLAYERS[0].displayName, clanId: CLAN_ID },
          options: {
            mapLocations: DROP_LOCATIONS,
            members: PLAYERS.slice(0, 6).map((player) => ({ id: player.memberId, displayName: player.displayName })),
            bestModes: ['duo', 'trio', 'squad'],
          },
        }),
      }
    })
    .on('GET', `/api/members/${MEMBER_ID}/drop-pressure`, { body: { stats: null, ranking: [], timeline: [] } })
    .on('GET', `/api/members/${MEMBER_ID}/city-insights`, { body: { insights: null } })
}
