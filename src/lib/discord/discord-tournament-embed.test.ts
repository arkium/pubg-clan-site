import { describe, expect, it } from 'vitest'

import {
  buildTournamentRoundWebhookPayload,
  formatPlacement,
  formatPoints,
  TOURNAMENT_COLOR,
  type TournamentRoundEmbedInput,
} from '@/lib/discord/discord-tournament-embed'

function makeInput(overrides: Partial<TournamentRoundEmbedInput> = {}): TournamentRoundEmbedInput {
  return {
    tournamentId: 'tour-1',
    tournamentTitle: 'Coupe inter-clans',
    roundNumber: 2,
    totalRounds: 3,
    squadMatchId: 'match-1',
    telemetryClanId: 5,
    mapLabel: 'Miramar',
    gameModeLabel: 'Squad FPP',
    playedAt: new Date('2026-09-13T18:00:00.000Z'),
    results: [
      {
        clanId: 5,
        clanLabel: '[ALP] Clan Alpha',
        bestPlacement: 1,
        totalKills: 8,
        placementScore: 10,
        killScore: 8,
        winBonus: 0,
        points: 18,
      },
      {
        clanId: 7,
        clanLabel: '[BRV] Clan Bravo',
        bestPlacement: 2,
        totalKills: 5,
        placementScore: 6,
        killScore: 5,
        winBonus: 0,
        points: 11,
      },
      {
        clanId: 9,
        clanLabel: '[CHR] Clan Charlie',
        bestPlacement: 3,
        totalKills: 2,
        placementScore: 5,
        killScore: 2,
        winBonus: 0,
        points: 7,
      },
    ],
    mvp: { displayName: 'Alpha', clanLabel: '[ALP] Clan Alpha', kills: 6, damage: 941.6 },
    standings: [
      { clanLabel: '[ALP] Clan Alpha', totalPoints: 45, totalKills: 14 },
      { clanLabel: '[BRV] Clan Bravo', totalPoints: 31, totalKills: 11 },
    ],
    mention: '',
    siteUrl: 'https://clan.example.com',
    ...overrides,
  }
}

describe('buildTournamentRoundWebhookPayload', () => {
  it('produit un embed conforme aux limites Discord', () => {
    const [embed] = buildTournamentRoundWebhookPayload(makeInput()).embeds

    expect(embed.title!.length).toBeLessThanOrEqual(256)
    expect(embed.description!.length).toBeLessThanOrEqual(4096)
    expect(embed.fields!.length).toBeLessThanOrEqual(25)
    expect(embed.color).toBe(TOURNAMENT_COLOR)

    for (const field of embed.fields!) {
      expect(field.name.length).toBeLessThanOrEqual(256)
      expect(field.value.length).toBeLessThanOrEqual(1024)
    }
  })

  it('titre le message avec le tournoi et le numero de manche', () => {
    const [embed] = buildTournamentRoundWebhookPayload(makeInput()).embeds

    expect(embed.title).toBe('🏆 Tournoi : Coupe inter-clans — Résultats Manche #2')
    expect(embed.footer?.text).toBe('Manche 2/3 · 3 clan(s) classé(s)')
  })

  it('formate chaque clan avec sa medaille et le detail des points', () => {
    const [embed] = buildTournamentRoundWebhookPayload(makeInput()).embeds
    const lines = embed.fields![0].value.split('\n')

    expect(lines[0]).toBe('🥇 **[ALP] Clan Alpha** : 1er (+10 pts) · 8 kills (+8 pts) = **18 pts**')
    expect(lines[1]).toBe('🥈 **[BRV] Clan Bravo** : 2e (+6 pts) · 5 kills (+5 pts) = **11 pts**')
    expect(lines[2]).toBe('🥉 **[CHR] Clan Charlie** : 3e (+5 pts) · 2 kills (+2 pts) = **7 pts**')
  })

  it('affiche le bonus de victoire seulement quand il est accorde', () => {
    const results = makeInput().results
    results[0] = { ...results[0], winBonus: 5, points: 23 }

    const [embed] = buildTournamentRoundWebhookPayload(makeInput({ results })).embeds

    expect(embed.fields![0].value).toContain('bonus +5')
    expect(embed.fields![0].value.split('\n')[1]).not.toContain('bonus')
  })

  it('numerote au-dela du podium', () => {
    const results = [
      ...makeInput().results,
      {
        clanId: 11,
        clanLabel: '[DLT] Clan Delta',
        bestPlacement: 8,
        totalKills: 0,
        placementScore: 1,
        killScore: 0,
        winBonus: 0,
        points: 1,
      },
    ]

    const [embed] = buildTournamentRoundWebhookPayload(makeInput({ results })).embeds

    expect(embed.fields![0].value).toContain('#4 **[DLT] Clan Delta**')
  })

  it('ajoute le MVP avec des degats arrondis', () => {
    const [embed] = buildTournamentRoundWebhookPayload(makeInput()).embeds
    const mvpField = embed.fields!.find((field) => field.name.includes('MVP'))

    expect(mvpField?.value).toBe('**Alpha** ([ALP] Clan Alpha) — 6 kills · 942 dégâts')
  })

  it('omet le MVP quand aucun joueur suivi n’est present', () => {
    const [embed] = buildTournamentRoundWebhookPayload(makeInput({ mvp: null })).embeds

    expect(embed.fields!.some((field) => field.name.includes('MVP'))).toBe(false)
  })

  it('ajoute le classement general quand il est demande, et l’omet sinon', () => {
    const withStandings = buildTournamentRoundWebhookPayload(makeInput()).embeds[0]
    const withoutStandings = buildTournamentRoundWebhookPayload(makeInput({ standings: null })).embeds[0]

    const field = withStandings.fields!.find((entry) => entry.name === 'Classement général provisoire')
    expect(field?.value).toContain('🥇 **[ALP] Clan Alpha** — 45 pts · 14 kills')
    expect(
      withoutStandings.fields!.some((entry) => entry.name === 'Classement général provisoire')
    ).toBe(false)
  })

  it('ajoute le lien de replay uniquement avec une URL de site et un clan de telemetrie', () => {
    const withLink = buildTournamentRoundWebhookPayload(makeInput()).embeds[0]
    const withoutSite = buildTournamentRoundWebhookPayload(makeInput({ siteUrl: '' })).embeds[0]
    const withoutClan = buildTournamentRoundWebhookPayload(makeInput({ telemetryClanId: null })).embeds[0]

    expect(withLink.description).toContain(
      '(https://clan.example.com/tournaments/tour-1/matches/match-1/telemetry?clanId=5)'
    )
    expect(withLink.url).toBe('https://clan.example.com/tournaments/tour-1')
    expect(withoutSite.description).not.toContain('Replay 2D')
    expect(withoutSite.url).toBeUndefined()
    expect(withoutClan.description).not.toContain('Replay 2D')
  })

  it('place la mention dans le content', () => {
    const payload = buildTournamentRoundWebhookPayload(makeInput({ mention: '@here' }))

    expect(payload.content).toBe('@here')
    expect(buildTournamentRoundWebhookPayload(makeInput()).content).toBeUndefined()
  })

  it('borne les scores a 1024 caracteres sur un tournoi tres fourni', () => {
    const results = Array.from({ length: 60 }, (_, index) => ({
      clanId: index,
      clanLabel: `[T${index}] Clan au nom particulierement long ${index}`,
      bestPlacement: index + 1,
      totalKills: 3,
      placementScore: 1,
      killScore: 3,
      winBonus: 0,
      points: 4,
    }))

    const [embed] = buildTournamentRoundWebhookPayload(makeInput({ results })).embeds

    expect(embed.fields![0].value.length).toBeLessThanOrEqual(1024)
    expect(embed.fields![0].value).toContain('autre(s)')
  })
})

describe('formatPoints / formatPlacement', () => {
  it('n’affiche une decimale que si le bareme en produit', () => {
    expect(formatPoints(18)).toBe('18')
    expect(formatPoints(7.5)).toBe('7.5')
  })

  it('utilise l’ordinal francais', () => {
    expect(formatPlacement(1)).toBe('1er')
    expect(formatPlacement(2)).toBe('2e')
    expect(formatPlacement(12)).toBe('12e')
  })
})
