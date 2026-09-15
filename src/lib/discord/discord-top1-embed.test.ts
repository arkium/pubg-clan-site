import { describe, expect, it } from 'vitest'

import {
  buildTop1WebhookPayload,
  CHICKEN_DINNER_COLOR,
  type Top1EmbedInput,
} from '@/lib/discord/discord-top1-embed'

function makeInput(overrides: Partial<Top1EmbedInput> = {}): Top1EmbedInput {
  return {
    clanId: 7,
    clanName: 'Les Poulets',
    clanTag: 'PLT',
    squadMatchId: 'squad-match-1',
    mapKey: 'Baltic_Main',
    mapLabel: 'Erangel',
    gameModeLabel: 'Squad FPP',
    matchTypeLabel: 'Match officiel',
    playedAt: new Date('2026-09-13T20:15:00.000Z'),
    members: [
      { displayName: 'Alpha', kills: 7, damage: 820.4, assists: 2, revives: 0, timeSurvived: 1834 },
      { displayName: 'Bravo', kills: 4, damage: 410.6, assists: 0, revives: 1, timeSurvived: 1834 },
    ],
    mention: '',
    siteUrl: 'https://clan.example.com',
    ...overrides,
  }
}

describe('buildTop1WebhookPayload', () => {
  it('produit un embed conforme aux limites Discord', () => {
    const payload = buildTop1WebhookPayload(makeInput())
    const [embed] = payload.embeds

    expect(payload.embeds).toHaveLength(1)
    expect(embed.title!.length).toBeLessThanOrEqual(256)
    expect(embed.fields!.length).toBeLessThanOrEqual(25)
    expect(embed.color).toBe(CHICKEN_DINNER_COLOR)

    for (const field of embed.fields!) {
      expect(field.name.length).toBeLessThanOrEqual(256)
      expect(field.value.length).toBeLessThanOrEqual(1024)
    }
  })

  it('tronque un titre trop long a 256 caracteres', () => {
    const payload = buildTop1WebhookPayload(makeInput({ clanName: 'A'.repeat(400) }))

    expect(payload.embeds[0].title).toHaveLength(256)
    expect(payload.embeds[0].title!.endsWith('…')).toBe(true)
  })

  it('reprend le tag et le nom du clan dans le titre', () => {
    const payload = buildTop1WebhookPayload(makeInput())

    expect(payload.embeds[0].title).toBe('🍗 CHICKEN DINNER ! Top 1 pour [PLT] Les Poulets')
  })

  it('arrondit les degats et agrege les totaux de l escouade', () => {
    const payload = buildTop1WebhookPayload(makeInput())
    const fields = payload.embeds[0].fields!

    expect(fields[0].value).toContain('**Alpha** — 7 kills · 820 dégâts · 2 assists')
    expect(fields[0].value).toContain('**Bravo** — 4 kills · 411 dégâts · 1 revives')
    expect(fields.find((field) => field.name === 'Kills totaux')?.value).toBe('11')
    expect(fields.find((field) => field.name === 'Dégâts cumulés')?.value).toBe('1231')
    expect(fields.find((field) => field.name === 'Survie')?.value).toBe('30m 34s')
  })

  it('inclut le lien du match et la vignette de carte quand le site est configure', () => {
    const payload = buildTop1WebhookPayload(makeInput())
    const [embed] = payload.embeds

    expect(embed.url).toBe('https://clan.example.com/clans/7/telemetry/matches/squad-match-1/debrief')
    expect(embed.thumbnail?.url).toBe('https://clan.example.com/maps/pubg/Baltic_Main.webp')
  })

  it('omet lien et vignette quand aucune URL de site n est configuree', () => {
    const payload = buildTop1WebhookPayload(makeInput({ siteUrl: '' }))
    const [embed] = payload.embeds

    expect(embed.url).toBeUndefined()
    expect(embed.thumbnail).toBeUndefined()
  })

  it('place la mention dans le content et jamais dans l embed', () => {
    const withMention = buildTop1WebhookPayload(makeInput({ mention: '<@&12345>' }))
    const withoutMention = buildTop1WebhookPayload(makeInput())

    expect(withMention.content).toBe('<@&12345>')
    expect(withoutMention.content).toBeUndefined()
  })

  it('borne le champ escouade a 1024 caracteres sur une composition anormale', () => {
    const members = Array.from({ length: 40 }, (_, index) => ({
      displayName: `Joueur-${'x'.repeat(30)}-${index}`,
      kills: 3,
      damage: 250,
      assists: 1,
      revives: 1,
      timeSurvived: 900,
    }))

    const field = buildTop1WebhookPayload(makeInput({ members })).embeds[0].fields![0]

    expect(field.value.length).toBeLessThanOrEqual(1024)
    expect(field.value).toContain('autre(s)')
  })
})
