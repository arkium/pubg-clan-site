import { describe, expect, it } from 'vitest'

import {
  DEFAULT_DISCORD_SETTINGS,
  isValidDiscordWebhookUrl,
  normalizeDiscordSettings,
  renderDiscordMention,
} from '@/lib/discord/discord-config'

describe('isValidDiscordWebhookUrl', () => {
  it('accepte les deux domaines officiels', () => {
    expect(isValidDiscordWebhookUrl('https://discord.com/api/webhooks/123456789/abc-DEF_123')).toBe(true)
    expect(isValidDiscordWebhookUrl('https://discordapp.com/api/webhooks/123456789/abc-DEF_123')).toBe(true)
  })

  it('refuse un domaine tiers, le HTTP simple et un chemin incomplet', () => {
    expect(isValidDiscordWebhookUrl('https://evil.example.com/api/webhooks/123/abc')).toBe(false)
    expect(isValidDiscordWebhookUrl('http://discord.com/api/webhooks/123/abc')).toBe(false)
    expect(isValidDiscordWebhookUrl('https://discord.com/api/webhooks/123')).toBe(false)
    expect(isValidDiscordWebhookUrl('')).toBe(false)
  })
})

describe('normalizeDiscordSettings', () => {
  it('retombe sur les valeurs par defaut pour une entree vide', () => {
    expect(normalizeDiscordSettings(null)).toEqual(DEFAULT_DISCORD_SETTINGS)
    expect(normalizeDiscordSettings({ top1: 'nope' })).toEqual(DEFAULT_DISCORD_SETTINGS)
  })

  it('rejette un seuil de membres hors des choix autorises', () => {
    expect(normalizeDiscordSettings({ top1: { minClanMembers: 1 } }).top1.minClanMembers).toBe(2)
    expect(normalizeDiscordSettings({ top1: { minClanMembers: 9 } }).top1.minClanMembers).toBe(2)
    expect(normalizeDiscordSettings({ top1: { minClanMembers: 4 } }).top1.minClanMembers).toBe(4)
  })

  it('nettoie un identifiant de role non numerique', () => {
    const settings = normalizeDiscordSettings({
      top1: { mention: { type: 'role', roleId: '<@&123456>' } },
    })

    expect(settings.top1.mention).toEqual({ type: 'role', roleId: '123456' })
  })

  it('retombe sur aucune mention quand le role est vide', () => {
    const settings = normalizeDiscordSettings({ top1: { mention: { type: 'role', roleId: '' } } })

    expect(settings.top1.mention).toEqual({ type: 'none', roleId: '' })
  })

  it('normalise le bloc tournoi independamment du bloc Top 1', () => {
    const settings = normalizeDiscordSettings({
      tournament: {
        enabled: true,
        webhookUrl: '  https://discord.com/api/webhooks/123/abc  ',
        includeStandings: false,
        mention: { type: 'everyone', roleId: '999' },
      },
    })

    expect(settings.tournament).toEqual({
      enabled: true,
      webhookUrl: 'https://discord.com/api/webhooks/123/abc',
      includeStandings: false,
      mention: { type: 'everyone', roleId: '' },
    })
    expect(settings.top1).toEqual(DEFAULT_DISCORD_SETTINGS.top1)
  })

  it('retombe sur les defauts tournoi quand le bloc est absent', () => {
    expect(normalizeDiscordSettings({ top1: { enabled: true } }).tournament).toEqual(
      DEFAULT_DISCORD_SETTINGS.tournament
    )
  })

  it('conserve uniquement les modes et types connus', () => {
    const settings = normalizeDiscordSettings({
      top1: {
        teamModes: { duo: false, solo: true },
        matchTypes: { airoyale: true, ranked: true },
      },
    })

    expect(settings.top1.teamModes).toEqual({ duo: false, trio: true, squad: true })
    expect(settings.top1.matchTypes).toEqual({
      official: true,
      casual: true,
      airoyale: true,
      custom: false,
    })
  })
})

describe('renderDiscordMention', () => {
  it('rend chaque type de mention', () => {
    expect(renderDiscordMention({ type: 'none', roleId: '' })).toBe('')
    expect(renderDiscordMention({ type: 'here', roleId: '' })).toBe('@here')
    expect(renderDiscordMention({ type: 'everyone', roleId: '' })).toBe('@everyone')
    expect(renderDiscordMention({ type: 'role', roleId: '42' })).toBe('<@&42>')
  })
})
