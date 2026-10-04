import type { ApiMock } from './api'
import { CLAN_ID, PLAYERS, clanMatchesStats } from './data'
import type { LeaderboardPeriod } from '@/types/leaderboard'

/**
 * Awards du clan (e2e/awards.spec.ts) : trois awards, dont un sans lauréat, et le podium des performances (même
 * réponse que la vue d'ensemble). Le nombre de matchs suit le type de match, pour vérifier le rechargement.
 */
function periodOf(url: URL): LeaderboardPeriod {
  const value = url.searchParams.get('period')
  return value === 'month' || value === 'all' ? value : 'week'
}

export function awardsResponse(period: LeaderboardPeriod, scope: string) {
  const winners = (values: number[]) =>
    values.map((value, index) => ({ memberId: PLAYERS[index].memberId, memberName: PLAYERS[index].displayName, value }))
  return {
    clanId: CLAN_ID,
    period,
    scope,
    periodKey: `${period}-2026-40`,
    matchCount: scope === 'all' ? 31 : 24,
    awards: [
      { key: 'top_killer', label: 'Le croc mort', description: 'Plus de kills sur la période', unit: 'kills', top3: winners([34, 21, 9]) },
      { key: 'jacky_tuning', label: 'JACKY TUNING', description: 'Plus de distance parcourue en véhicule', unit: 'm', top3: winners([12_400, 8_250, 990]) },
      { key: 'destructeur', label: 'Le destructeur', description: 'Plus de véhicules détruits', unit: 'véhicules', top3: [] },
    ],
  }
}

export function mockClanAwards(api: ApiMock) {
  api
    .on('GET', `/api/clans/${CLAN_ID}/awards`, (url) => ({
      body: awardsResponse(periodOf(url), url.searchParams.get('scope') ?? 'normal'),
    }))
    .on('GET', `/api/clans/${CLAN_ID}/overview/matches-stats`, (url) => ({ body: clanMatchesStats(periodOf(url)) }))
}
