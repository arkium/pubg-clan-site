import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sendDiscordWebhook, type DiscordWebhookPayload } from '@/lib/discord/discord-client'

const WEBHOOK_URL = 'https://discord.com/api/webhooks/123456789/token-abc'
const PAYLOAD: DiscordWebhookPayload = { embeds: [{ title: 'test' }] }

function jsonResponse(status: number, body: string, headers: Record<string, string> = {}) {
  // 204 est un statut sans corps : le constructeur Response refuse une chaine vide.
  return new Response(body || null, { status, headers })
}

describe('sendDiscordWebhook', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('renvoie ok sur un 204', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(204, ''))

    await expect(sendDiscordWebhook(WEBHOOK_URL, PAYLOAD)).resolves.toEqual({ ok: true, status: 204 })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('ne leve pas sur un 400 et remonte le corps de la reponse', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(400, '{"message":"Invalid Webhook Token"}'))

    const result = await sendDiscordWebhook(WEBHOOK_URL, PAYLOAD)

    expect(result).toMatchObject({ ok: false, status: 400 })
    expect(result.ok === false && result.error).toContain('Invalid Webhook Token')
  })

  it('ne leve pas sur un 404', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(404, '{"message":"Unknown Webhook"}'))

    await expect(sendDiscordWebhook(WEBHOOK_URL, PAYLOAD)).resolves.toMatchObject({
      ok: false,
      status: 404,
    })
  })

  it('respecte retry_after sur un 429 puis reussit', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(429, '{"retry_after":0.25}'))
      .mockResolvedValueOnce(jsonResponse(204, ''))

    const pending = sendDiscordWebhook(WEBHOOK_URL, PAYLOAD)
    await vi.advanceTimersByTimeAsync(250)

    await expect(pending).resolves.toEqual({ ok: true, status: 204 })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('abandonne apres un second 429 sans lever', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, '{"retry_after":0.1}'))

    const pending = sendDiscordWebhook(WEBHOOK_URL, PAYLOAD)
    await vi.advanceTimersByTimeAsync(100)

    await expect(pending).resolves.toMatchObject({ ok: false, status: 429 })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('ne leve pas sur une panne reseau', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fetch failed'))

    await expect(sendDiscordWebhook(WEBHOOK_URL, PAYLOAD)).resolves.toEqual({
      ok: false,
      status: null,
      error: 'fetch failed',
    })
  })
})
