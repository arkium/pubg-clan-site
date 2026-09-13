import { beforeEach, describe, expect, it, vi } from 'vitest'

// Vitest ne collecte que `src/lib/**` (voir vitest.config.ts) : comme
// route-contracts.test.ts et drop-pressure-route-contracts.test.ts, ce fichier
// vit dans src/lib et importe les handlers depuis src/app.
const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  permissionGuard: vi.fn(),
  getDiscordSettings: vi.fn(),
  updateDiscordSettings: vi.fn(),
  clanFindUnique: vi.fn(),
  sendTop1Test: vi.fn(),
  sendTournamentTest: vi.fn(),
}))

vi.mock('@/middleware/auth-permission', () => ({
  requirePermission: mocks.requirePermission,
}))

vi.mock('@/lib/discord/discord-config-service', () => ({
  getDiscordSettings: mocks.getDiscordSettings,
  updateDiscordSettings: mocks.updateDiscordSettings,
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { clan: { findUnique: mocks.clanFindUnique } },
}))

vi.mock('@/lib/discord/discord-service', () => ({
  sendDiscordTop1TestMessage: mocks.sendTop1Test,
}))

vi.mock('@/lib/discord/discord-tournament-service', () => ({
  sendDiscordTournamentTestMessage: mocks.sendTournamentTest,
}))

import {
  GET as getDiscordSettingsRoute,
  PUT as putDiscordSettingsRoute,
} from '@/app/api/clans/[clanId]/settings/discord/route'
import { POST as postDiscordTestRoute } from '@/app/api/clans/[clanId]/settings/discord/test/route'
import { DEFAULT_DISCORD_SETTINGS, type DiscordSettings } from '@/lib/discord/discord-config'

const WEBHOOK = 'https://discord.com/api/webhooks/123456789/token-abc'
const params = (clanId: string) => ({ params: Promise.resolve({ clanId }) })

function jsonRequest(body: unknown, method = 'PUT') {
  return new Request('http://localhost:3000/api/clans/7/settings/discord', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function validPayload(overrides: Partial<DiscordSettings> = {}): DiscordSettings {
  return {
    top1: { ...DEFAULT_DISCORD_SETTINGS.top1, webhookUrl: WEBHOOK },
    tournament: { ...DEFAULT_DISCORD_SETTINGS.tournament },
    ...overrides,
  }
}

describe('discord settings route contracts', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.requirePermission.mockReturnValue(mocks.permissionGuard)
    mocks.permissionGuard.mockResolvedValue(null)
    mocks.getDiscordSettings.mockResolvedValue(DEFAULT_DISCORD_SETTINGS)
    mocks.updateDiscordSettings.mockImplementation(async (_clanId, input) => input)
    mocks.clanFindUnique.mockResolvedValue({ name: 'Les Poulets', tag: 'PLT' })
    mocks.sendTop1Test.mockResolvedValue({ ok: true, status: 204 })
    mocks.sendTournamentTest.mockResolvedValue({ ok: true, status: 204 })
  })

  describe('GET', () => {
    it('rejette un identifiant de clan invalide avant toute autorisation', async () => {
      const response = await getDiscordSettingsRoute(
        new Request('http://localhost:3000/api/clans/nope/settings/discord'),
        params('nope')
      )

      expect(response.status).toBe(400)
      expect(mocks.requirePermission).not.toHaveBeenCalled()
      expect(mocks.getDiscordSettings).not.toHaveBeenCalled()
    })

    it('exige manage_settings sur le clan visé et propage le refus', async () => {
      mocks.permissionGuard.mockResolvedValue(Response.json({ error: 'Forbidden' }, { status: 403 }))

      const response = await getDiscordSettingsRoute(
        new Request('http://localhost:3000/api/clans/7/settings/discord'),
        params('7')
      )

      expect(response.status).toBe(403)
      expect(mocks.requirePermission).toHaveBeenCalledWith('manage_settings')
      expect(mocks.permissionGuard).toHaveBeenCalledWith(expect.any(Request), { clanId: 7 })
      expect(mocks.getDiscordSettings).not.toHaveBeenCalled()
    })

    it('renvoie 401 quand la session est absente', async () => {
      mocks.permissionGuard.mockResolvedValue(Response.json({ error: 'Unauthorized' }, { status: 401 }))

      const response = await getDiscordSettingsRoute(
        new Request('http://localhost:3000/api/clans/7/settings/discord'),
        params('7')
      )

      expect(response.status).toBe(401)
    })

    it('renvoie la configuration et le libellé du clan', async () => {
      const response = await getDiscordSettingsRoute(
        new Request('http://localhost:3000/api/clans/7/settings/discord'),
        params('7')
      )

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({
        settings: DEFAULT_DISCORD_SETTINGS,
        clanLabel: '[PLT] Les Poulets',
      })
      expect(mocks.getDiscordSettings).toHaveBeenCalledWith(7)
    })

    it('renvoie un libellé nul pour un clan introuvable', async () => {
      mocks.clanFindUnique.mockResolvedValue(null)

      const response = await getDiscordSettingsRoute(
        new Request('http://localhost:3000/api/clans/7/settings/discord'),
        params('7')
      )

      await expect(response.json()).resolves.toMatchObject({ clanLabel: null })
    })
  })

  describe('PUT', () => {
    it('propage le refus de permission sans rien enregistrer', async () => {
      mocks.permissionGuard.mockResolvedValue(Response.json({ error: 'Forbidden' }, { status: 403 }))

      const response = await putDiscordSettingsRoute(jsonRequest(validPayload()), params('7'))

      expect(response.status).toBe(403)
      expect(mocks.updateDiscordSettings).not.toHaveBeenCalled()
    })

    it('enregistre une configuration valide', async () => {
      const payload = validPayload()
      const response = await putDiscordSettingsRoute(jsonRequest(payload), params('7'))

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ success: true, settings: payload })
      expect(mocks.updateDiscordSettings).toHaveBeenCalledWith(7, payload)
    })

    it('accepte un webhook vide tant que le flux est désactivé', async () => {
      const payload = validPayload()
      payload.top1 = { ...payload.top1, enabled: false, webhookUrl: '' }

      const response = await putDiscordSettingsRoute(jsonRequest(payload), params('7'))

      expect(response.status).toBe(200)
    })

    it.each([
      ['un domaine tiers', 'https://evil.example.com/api/webhooks/123/abc'],
      ['du HTTP simple', 'http://discord.com/api/webhooks/123/abc'],
      ['un chemin incomplet', 'https://discord.com/api/webhooks/123'],
    ])('refuse %s comme webhook Top 1', async (_label, webhookUrl) => {
      const payload = validPayload()
      payload.top1 = { ...payload.top1, webhookUrl }

      const response = await putDiscordSettingsRoute(jsonRequest(payload), params('7'))

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringContaining('discord.com/api/webhooks/'),
      })
      expect(mocks.updateDiscordSettings).not.toHaveBeenCalled()
    })

    it('accepte le domaine historique discordapp.com', async () => {
      const payload = validPayload()
      payload.top1 = {
        ...payload.top1,
        webhookUrl: 'https://discordapp.com/api/webhooks/123456789/token-abc',
      }

      const response = await putDiscordSettingsRoute(jsonRequest(payload), params('7'))

      expect(response.status).toBe(200)
    })

    it('refuse d’activer un flux sans webhook', async () => {
      const payload = validPayload()
      payload.tournament = { ...payload.tournament, enabled: true, webhookUrl: '' }

      const response = await putDiscordSettingsRoute(jsonRequest(payload), params('7'))

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringContaining('avant d’activer les annonces de tournoi'),
      })
    })

    it('refuse un identifiant de rôle non numérique', async () => {
      const payload = validPayload()
      payload.top1 = { ...payload.top1, mention: { type: 'role', roleId: 'abc' } }

      const response = await putDiscordSettingsRoute(jsonRequest(payload), params('7'))

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toMatchObject({
        error: expect.stringContaining('num'),
      })
    })

    it('refuse un seuil de membres hors des valeurs autorisées', async () => {
      const payload = validPayload()
      payload.top1 = { ...payload.top1, minClanMembers: 1 }

      const response = await putDiscordSettingsRoute(jsonRequest(payload), params('7'))

      expect(response.status).toBe(400)
      expect(mocks.updateDiscordSettings).not.toHaveBeenCalled()
    })

    it('refuse un bloc tournoi manquant', async () => {
      const response = await putDiscordSettingsRoute(
        jsonRequest({ top1: validPayload().top1 }),
        params('7')
      )

      expect(response.status).toBe(400)
      expect(mocks.updateDiscordSettings).not.toHaveBeenCalled()
    })

    it('refuse un corps de requête illisible', async () => {
      const response = await putDiscordSettingsRoute(
        new Request('http://localhost:3000/api/clans/7/settings/discord', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: 'pas du json',
        }),
        params('7')
      )

      expect(response.status).toBe(400)
    })

    it('renvoie 500 quand la persistance échoue', async () => {
      mocks.updateDiscordSettings.mockRejectedValue(new Error('DB down'))

      const response = await putDiscordSettingsRoute(jsonRequest(validPayload()), params('7'))

      expect(response.status).toBe(500)
    })
  })

  describe('POST /test', () => {
    it('propage le refus de permission sans contacter Discord', async () => {
      mocks.permissionGuard.mockResolvedValue(Response.json({ error: 'Forbidden' }, { status: 403 }))

      const response = await postDiscordTestRoute(
        jsonRequest({ webhookUrl: WEBHOOK }, 'POST'),
        params('7')
      )

      expect(response.status).toBe(403)
      expect(mocks.sendTop1Test).not.toHaveBeenCalled()
    })

    it('refuse une URL qui n’est pas un webhook Discord', async () => {
      const response = await postDiscordTestRoute(
        jsonRequest({ webhookUrl: 'https://evil.example.com/hook' }, 'POST'),
        params('7')
      )

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ error: 'URL de webhook Discord invalide' })
      expect(mocks.sendTop1Test).not.toHaveBeenCalled()
    })

    it('envoie le message Top 1 par défaut', async () => {
      const response = await postDiscordTestRoute(
        jsonRequest({ webhookUrl: WEBHOOK }, 'POST'),
        params('7')
      )

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ success: true })
      expect(mocks.sendTop1Test).toHaveBeenCalledWith(7, WEBHOOK)
      expect(mocks.sendTournamentTest).not.toHaveBeenCalled()
    })

    it('route vers le message tournoi quand kind vaut tournament', async () => {
      const response = await postDiscordTestRoute(
        jsonRequest({ webhookUrl: WEBHOOK, kind: 'tournament' }, 'POST'),
        params('7')
      )

      expect(response.status).toBe(200)
      expect(mocks.sendTournamentTest).toHaveBeenCalledWith(7, WEBHOOK)
      expect(mocks.sendTop1Test).not.toHaveBeenCalled()
    })

    it('renvoie 502 et le message exact de Discord en cas de refus', async () => {
      mocks.sendTop1Test.mockResolvedValue({ ok: false, status: 404, error: 'Unknown Webhook' })

      const response = await postDiscordTestRoute(
        jsonRequest({ webhookUrl: WEBHOOK }, 'POST'),
        params('7')
      )

      expect(response.status).toBe(502)
      await expect(response.json()).resolves.toEqual({
        error: "Discord a refusé l'envoi (404) : Unknown Webhook",
      })
    })

    it('renvoie 500 quand l’envoi lève une exception inattendue', async () => {
      mocks.sendTop1Test.mockRejectedValue(new Error('boom'))

      const response = await postDiscordTestRoute(
        jsonRequest({ webhookUrl: WEBHOOK }, 'POST'),
        params('7')
      )

      expect(response.status).toBe(500)
    })
  })
})
