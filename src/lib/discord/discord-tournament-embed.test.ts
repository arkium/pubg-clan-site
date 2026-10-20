import { describe, expect, it } from 'vitest'

import {
  buildTournamentRoundWebhookPayload,
  buildTournamentSquadStandingsWebhookPayload,
  formatPlacement,
  formatPoints,
  TOURNAMENT_COLOR,
  type TournamentRoundEmbedInput,
} from '@/lib/discord/discord-tournament-embed'

// Identifiants au format cuid, seul accepté par les liens courts.
const TOURNAMENT_ID = 'ctour00000000000000000001'
const MATCH_ID = 'cmatch0000000000000000001'

function makeInput(overrides: Partial<TournamentRoundEmbedInput> = {}): TournamentRoundEmbedInput {
  return {
    tournamentId: TOURNAMENT_ID,
    tournamentTitle: 'Coupe inter-clans',
    roundNumber: 2,
    totalRounds: 3,
    squadMatchId: MATCH_ID,
    telemetryClanId: 5,
    mapLabel: 'Miramar',
    gameModeLabel: 'Squad FPP',
    playedAt: new Date('2026-09-13T18:00:00.000Z'),
    mode: 'inter_clan',
    mixedSquadRule: 'full_share',
    results: [
      {
        label: '[ALP] Clan Alpha',
        bestPlacement: 1,
        totalKills: 8,
        placementScore: 10,
        killScore: 8,
        winBonus: 0,
        points: 18,
      },
      {
        label: '[BRV] Clan Bravo',
        bestPlacement: 2,
        totalKills: 5,
        placementScore: 6,
        killScore: 5,
        winBonus: 0,
        points: 11,
      },
      {
        label: '[CHR] Clan Charlie',
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
      { label: '[ALP] Clan Alpha', totalPoints: 45, totalKills: 14 },
      { label: '[BRV] Clan Bravo', totalPoints: 31, totalKills: 11 },
    ],
    mention: '',
    siteUrl: 'https://clan.example.com',
    ...overrides,
  }
}

describe('embed selon le mode du tournoi', () => {
  it('adapte les intitulés et le décompte du pied de page', () => {
    const wording = {
      inter_clan: ['Scores de la manche', 'clan(s) classé(s)', 'Classement général provisoire'],
      custom_teams: ['Scores de la manche (équipes)', 'équipe(s) classée(s)', 'Classement général des équipes'],
      solo_ffa: ['Classement de la manche (joueurs)', 'joueur(s) classé(s)', 'Classement général individuel'],
      intra_clan: [
        'Scores de la manche (squads internes)',
        'squad(s) classée(s)',
        'Classement interne provisoire',
      ],
    } as const

    for (const [mode, [roundField, participants, standingsField]] of Object.entries(wording)) {
      const [embed] = buildTournamentRoundWebhookPayload(
        makeInput({ mode: mode as keyof typeof wording })
      ).embeds

      expect(embed.fields![0].name).toBe(roundField)
      expect(embed.footer?.text).toContain(participants)
      expect(embed.fields!.find((field) => field.name === standingsField)).toBeDefined()
    }
  })

  it('annonce le partage au prorata, qui explique les points décimaux', () => {
    const [prorata] = buildTournamentRoundWebhookPayload(
      makeInput({
        mixedSquadRule: 'prorata',
        results: [{ label: '[ALP] Clan Alpha', bestPlacement: 1, totalKills: 3, placementScore: 7.5, killScore: 3, winBonus: 2.5, points: 13 }],
      })
    ).embeds

    expect(prorata.description).toContain('prorata')
    expect(prorata.fields![0].value).toContain('+7.5 pts')

    const [fullShare] = buildTournamentRoundWebhookPayload(makeInput()).embeds
    expect(fullShare.description).not.toContain('prorata')
  })

  it('ne mentionne jamais le prorata hors du mode inter-clans', () => {
    const [embed] = buildTournamentRoundWebhookPayload(
      makeInput({ mode: 'solo_ffa', mixedSquadRule: 'prorata' })
    ).embeds
    expect(embed.description).not.toContain('prorata')
  })

  it('classe des joueurs en mode solo, avec le même format de ligne', () => {
    const [embed] = buildTournamentRoundWebhookPayload(
      makeInput({
        mode: 'solo_ffa',
        results: [
          { label: '[ALP] Alpha', bestPlacement: 1, totalKills: 6, placementScore: 10, killScore: 6, winBonus: 4, points: 20 },
          { label: '[BRV] Bravo', bestPlacement: 2, totalKills: 2, placementScore: 6, killScore: 2, winBonus: 0, points: 8 },
        ],
      })
    ).embeds

    const lines = embed.fields![0].value.split(String.fromCharCode(10))
    expect(lines[0]).toBe('🥇 **[ALP] Alpha** : 1er (+10 pts) · 6 kills (+6 pts) · bonus +4 = **20 pts**')
    expect(lines[1]).toContain('[BRV] Bravo')
  })
})

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
        label: '[DLT] Clan Delta',
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

  it('fait du nom du MVP un lien court vers son tableau de bord, quand le site est configuré', () => {
    const mvp = { memberId: 42, displayName: 'Alpha', clanLabel: '[ALP] Clan Alpha', kills: 6, damage: 941.6 }
    const linked = buildTournamentRoundWebhookPayload(makeInput({ mvp })).embeds[0]
    const withoutSite = buildTournamentRoundWebhookPayload(makeInput({ mvp, siteUrl: '' })).embeds[0]

    expect(linked.fields!.find((field) => field.name.includes('MVP'))?.value).toBe(
      '[**Alpha**](https://clan.example.com/j/42) ([ALP] Clan Alpha) — 6 kills · 942 dégâts'
    )
    expect(withoutSite.fields!.find((field) => field.name.includes('MVP'))?.value).toBe(
      '**Alpha** ([ALP] Clan Alpha) — 6 kills · 942 dégâts'
    )
  })

  it('identifiants hors format (message de test, données anciennes) : pas de lien plutôt qu’un lien mort', () => {
    const [embed] = buildTournamentRoundWebhookPayload(makeInput({ tournamentId: 'tour-1', squadMatchId: 'test' })).embeds

    expect(embed.url).toBeUndefined()
    expect(embed.description).not.toContain('Replay 2D')
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

  it('ajoute le lien vers le débriefing de manche dès qu’une URL de site est configurée', () => {
    const withLink = buildTournamentRoundWebhookPayload(makeInput()).embeds[0]
    const withoutSite = buildTournamentRoundWebhookPayload(makeInput({ siteUrl: '' })).embeds[0]
    // Vue tournoi : le lien ne dépend plus d'un clan choisi arbitrairement.
    const withoutClan = buildTournamentRoundWebhookPayload(makeInput({ telemetryClanId: null })).embeds[0]

    // Liens courts (docs/TODO/url-masking.md) : la manche s'ouvre sur son Replay 2D, comme l'annonce le libellé.
    expect(withLink.description).toContain(`[▶️ Replay 2D de la manche](https://clan.example.com/t/${TOURNAMENT_ID}/${MATCH_ID}?tab=replay)`)
    expect(withLink.url).toBe(`https://clan.example.com/t/${TOURNAMENT_ID}`)
    expect(withoutSite.description).not.toContain('Replay 2D')
    expect(withoutSite.url).toBeUndefined()
    expect(withoutClan.description).toContain('Replay 2D')
  })

  it('place la mention dans le content', () => {
    const payload = buildTournamentRoundWebhookPayload(makeInput({ mention: '@here' }))

    expect(payload.content).toBe('@here')
    expect(buildTournamentRoundWebhookPayload(makeInput()).content).toBeUndefined()
  })

  it('borne les scores a 1024 caracteres sur un tournoi tres fourni', () => {
    const results = Array.from({ length: 60 }, (_, index) => ({
      label: `[T${index}] Clan au nom particulierement long ${index}`,
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

describe('buildTournamentSquadStandingsWebhookPayload', () => {
  const squadInput = {
    tournamentId: TOURNAMENT_ID,
    tournamentTitle: 'Tournoi [FR] 10/10/26',
    totalRounds: 3,
    killPoints: 1,
    winBonus: 5,
    squads: [
      { memberLabels: ['[FUN] Tie-Poucrav', '[FUN] L0RD19'], totalPoints: 112, totalKills: 59, wins: 2, form: [1, 9, 1] },
      { memberLabels: ['[LTF] P0mpoko', '[OCD] Valino13', '[OCD] ZaPiT'], totalPoints: 93.5, totalKills: 47, wins: 1, form: [2, null, 1] },
    ],
    playedAt: new Date('2026-10-10T21:42:00.000Z'),
    mention: '',
    siteUrl: 'https://chickendinner.fr/',
  }

  it('classe les escouades : joueurs regroupés par clan, points, kills, Top 1 et place à chaque manche', () => {
    const [embed] = buildTournamentSquadStandingsWebhookPayload(squadInput).embeds
    expect(embed.title).toBe('🏆 Tournoi : Tournoi [FR] 10/10/26 — Classement par squad')
    expect(embed.url).toBe(`https://chickendinner.fr/t/${TOURNAMENT_ID}`)
    expect(embed.description).toContain('🥇 **[FUN] Tie-Poucrav, L0RD19**')
    expect(embed.description).toContain('**112 pts** · 59 kills · 2 Top 1 · manches : #1 · 9 · #1')
    expect(embed.description).toContain('🥈 **[LTF] P0mpoko + [OCD] Valino13, ZaPiT**')
    expect(embed.description).toContain('**93.5 pts** · 47 kills · 1 Top 1 · manches : 2 · – · #1')
    expect(embed.description).toContain('1 pt par kill, +5 pour un Top 1')
    expect(embed.description).toContain(`[📊 Classement complet sur le site](https://chickendinner.fr/t/${TOURNAMENT_ID})`)
  })

  it('reste dans les limites Discord avec beaucoup d’escouades', () => {
    const squads = Array.from({ length: 60 }, (_, index) => ({
      memberLabels: Array.from({ length: 6 }, (_, member) => `[CLAN${index}] Joueur-au-pseudo-long-${member}`),
      totalPoints: 100 - index,
      totalKills: 10,
      wins: 0,
      form: [1, 2, 3, 4, 5],
    }))
    const [embed] = buildTournamentSquadStandingsWebhookPayload({ ...squadInput, squads }).embeds
    expect(embed.description!.length).toBeLessThanOrEqual(4096)
    expect(embed.description).toContain('… et ')
    expect(embed.description).toContain('Classement complet sur le site')
  })
})
