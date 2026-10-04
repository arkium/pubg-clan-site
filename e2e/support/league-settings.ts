import type { ApiMock } from './api'
import { mockMemberSession } from './session'
import { DEFAULT_LEAGUE_SETTINGS, type LeagueClan, type LeagueMatchRow, type LeagueSettings } from '@/lib/clan-league'
import { LEAGUE_SETTINGS_BOUNDS, leaguePreview } from '@/lib/league-settings'

/**
 * Réglages de la ligue (e2e/league-settings.spec.ts) : session SuperUser, réglages par défaut, aperçu calculé par la
 * vraie fonction `leaguePreview` à partir du brouillon envoyé (six clans, Normal, semaine), enregistrement renvoyé tel
 * quel. Les corps des requêtes sont gardés pour vérifier ce que la page envoie — rien n'atteint la base.
 */

const CLANS: LeagueClan[] = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot'].map((name, index) => ({
  clanId: index + 2,
  name: `Clan ${name}`,
  tag: name.slice(0, 4).toUpperCase(),
  imageUrl: null,
}))

let seq = 0
const many = (clanId: number, count: number, placement: number, damage: number, kills: number, knocks: number): LeagueMatchRow[] =>
  Array.from({ length: count }, (_, index) => {
    seq += 1
    return { clanId, matchId: `e2e-${seq}`, createdAt: new Date(Date.UTC(2026, 8, 28, 18 + index)), placement, damage, kills, knocks }
  })

// Charlie gagne souvent mais joue peu (4 parties : en qualification au seuil de 5) ; Echo finit souvent 2e.
const ROWS: LeagueMatchRow[] = [
  ...many(2, 12, 6, 520, 4, 3),
  ...many(3, 10, 9, 610, 5, 4),
  ...many(4, 4, 1, 700, 6, 5),
  ...many(5, 8, 12, 380, 2, 2),
  ...many(6, 9, 2, 450, 3, 3),
  ...many(7, 6, 15, 300, 1, 1),
]

export type LeagueSettingsCalls = { previews: LeagueSettings[]; saves: LeagueSettings[] }

export { withSessionCookie } from './session'

export function mockLeagueSettings(api: ApiMock, options: { superUser?: boolean } = {}): LeagueSettingsCalls {
  const superUser = options.superUser ?? true
  const calls: LeagueSettingsCalls = { previews: [], saves: [] }
  let saved: { settings: LeagueSettings; updatedAt: string | null; updatedBy: string | null } = {
    settings: DEFAULT_LEAGUE_SETTINGS,
    updatedAt: null,
    updatedBy: null,
  }
  const state = () => ({
    ...saved,
    isDefault: saved.updatedAt === null,
    defaults: DEFAULT_LEAGUE_SETTINGS,
    bounds: LEAGUE_SETTINGS_BOUNDS,
  })
  mockMemberSession(api, { superUser })
  api
    .on('GET', '/api/settings/league', () => (superUser ? { body: state() } : { status: 403, body: { error: 'Forbidden' } }))
    .on('POST', '/api/settings/league/preview', (_url, request) => {
      const body = request.postDataJSON() as { settings: LeagueSettings; period: 'week' | 'month' | 'all'; matchType: 'official' }
      calls.previews.push(body.settings)
      return { body: { period: body.period, matchType: body.matchType, ...leaguePreview(ROWS, CLANS, null, 'official', 'week', saved.settings, body.settings) } }
    })
    .on('PUT', '/api/settings/league', (_url, request) => {
      const body = request.postDataJSON() as { settings: LeagueSettings }
      calls.saves.push(body.settings)
      saved = { settings: body.settings, updatedAt: '2026-10-04T18:30:00.000Z', updatedBy: 'admin@example.com' }
      return { body: state() }
    })
  return calls
}
