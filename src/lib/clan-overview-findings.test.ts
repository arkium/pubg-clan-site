import { describe, expect, it } from 'vitest'

import type { ClanActivity } from './clan-directory'
import { clanOverviewFindings } from './clan-overview-findings'
import { CLAN_PAGES } from './seo/page-seo'

const CLAN = { id: 7, name: 'D32', tag: 'SMK', membersCount: 12, matchesCount: 5000, winsCount: 310, killsCount: 21000, lastMatchAt: '2026-10-10T20:00:00.000Z' }
const ACTIVITY = {
  clanId: 7,
  games7: 41,
  wins7: 6,
  playedTonight: 0,
  lastMatchAt: '2026-10-17T21:00:00.000Z',
  leagueRank: 3,
  style: { id: 'medic', score: 62.4, aggression: 50, support: 62.4, zoneDiscipline: 30, members: 9, matches: 400 },
} as ClanActivity
const NOW = new Date('2026-10-18T10:00:00Z')
const plain = (text: string) => text.replace(/ | /g, ' ')

describe('clanOverviewFindings', () => {
  const result = clanOverviewFindings(CLAN, ACTIVITY, 29, NOW)

  it('titre et chiffres du clan, sans aucun pseudo', () => {
    expect(result.title).toBe('En bref : D32 [SMK], clan PUBG suivi sur chickendinner.fr')
    expect(result.facts.map(plain)).toEqual([
      '12 membres actifs, 5 000 parties importées, 310 top 1 et 21 000 kills depuis le début du suivi.',
      'Ces 7 derniers jours : 41 parties importées et 6 top 1.',
      'Ligue des clans : 3e sur 29 ce mois-ci, au Power score.',
      'Style de jeu : Medic (soutien), score de 62 sur 100 — moyenne de ses membres, sur 400 parties.',
      'Chiffres du 18 octobre 2026.',
    ])
  })

  it('un lien vers chaque autre page publique du clan', () => {
    expect(result.links).toHaveLength(CLAN_PAGES.filter((page) => !page.noindex).length - 1)
    expect(result.links.map((link) => link.href)).not.toContain('/clans/7/coach')
    expect(result.links[0]).toEqual({ href: '/clans/7/leaderboard', label: 'Classement' })
    expect(result.links.map((link) => link.href)).not.toContain('/clans/7/overview')
  })

  it('clan au repos depuis plus de 7 jours : la date de sa dernière partie, ni rang ni style inventés', () => {
    const quiet = clanOverviewFindings(CLAN, { ...ACTIVITY, games7: 0, wins7: 0, lastMatchAt: '2026-10-02T21:00:00.000Z', leagueRank: null, style: null }, 29, NOW)
    expect(quiet.facts).toContain('Aucune partie ces 7 derniers jours ; dernière partie le 2 octobre 2026.')
    expect(quiet.facts.join(' ')).not.toContain('Ligue')
    expect(quiet.facts.join(' ')).not.toContain('Style')
  })

  it('dernière partie récente mais pas encore importée : jamais « aucune partie » démenti par la date', () => {
    const lagging = clanOverviewFindings(CLAN, { ...ACTIVITY, games7: 0, wins7: 0, lastMatchAt: '2026-10-18T08:00:00.000Z' }, 29, NOW)
    expect(lagging.facts[1]).toBe('Aucune partie importée ces 7 derniers jours.')
  })

  it('sans activité de l’annuaire : la dernière partie des statistiques du clan', () => {
    expect(clanOverviewFindings({ ...CLAN, lastMatchAt: '2026-09-30T20:00:00.000Z' }, null, 29, NOW).facts[1]).toBe(
      'Aucune partie ces 7 derniers jours ; dernière partie le 30 septembre 2026.'
    )
    expect(clanOverviewFindings({ ...CLAN, matchesCount: 0, lastMatchAt: null }, null, 29, NOW).facts[1]).toBe('Aucune partie importée pour l’instant.')
  })
})
