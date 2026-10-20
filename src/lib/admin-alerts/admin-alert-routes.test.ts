import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Contrats des routes du salon Discord d'administration (src/lib/admin-alerts/) : réglages (`PATCH`
 * /api/settings/clan-lifecycle), « Envoyer un test », et alertes de `/api/join`. Convention du dépôt : les tests vivent
 * dans `src/lib/` et importent les handlers depuis `src/app/`. Le contenu et l'envoi sont couverts par
 * admin-alerts.test.ts.
 */

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  requireSuperUser: vi.fn(),
  getSessionFromRequest: vi.fn(),
  getSettings: vi.fn(),
  setMention: vi.fn(),
  setEvents: vi.fn(),
  setMode: vi.fn(),
  getWebhookUrl: vi.fn(),
  getEvents: vi.fn(),
  getMention: vi.fn(),
  sendWebhook: vi.fn(),
  fireAdminAlert: vi.fn(),
  searchPlayerByName: vi.fn(),
  fetchPlayerClan: vi.fn(),
  memberFindFirst: vi.fn(),
  memberCount: vi.fn(),
  memberCreate: vi.fn(),
  clanFindFirst: vi.fn(),
  clanCreate: vi.fn(),
  roleFindFirst: vi.fn(),
  notifyJoinRequest: vi.fn(),
  notifyClanCreationRequest: vi.fn(),
}))

vi.mock('@/middleware/auth-permission', () => ({ requireSuperUser: mocks.requireSuperUser }))
vi.mock('@/lib/auth-session', () => ({ getSessionFromRequest: mocks.getSessionFromRequest }))
vi.mock('@/lib/clan-lifecycle/config', () => ({
  getClanLifecycleSettings: mocks.getSettings,
  resetClanLifecycleConfigCache: vi.fn(),
  setAdminAlertEvents: mocks.setEvents,
  setAdminAlertMention: mocks.setMention,
  setClanLifecycleDiscordWebhookUrl: vi.fn(),
  setClanLifecycleMode: mocks.setMode,
  setConfirmationsRequired: vi.fn(),
  setMaxMovesRatioPercent: vi.fn(),
  setUngroupedArchiveAfterDays: vi.fn(),
  setUngroupedAutoArchive: vi.fn(),
  setUngroupedAutoPromote: vi.fn(),
  getClanLifecycleDiscordWebhookUrl: mocks.getWebhookUrl,
  getAdminAlertEvents: mocks.getEvents,
  getAdminAlertMention: mocks.getMention,
}))
vi.mock('@/lib/discord/discord-client', () => ({ sendDiscordWebhook: mocks.sendWebhook }))
vi.mock('@/lib/admin-alerts/send', () => ({ ADMIN_ALERT_USERNAME: 'Administration', fireAdminAlert: mocks.fireAdminAlert }))
vi.mock('@/lib/pubg', () => ({ searchPlayerByName: mocks.searchPlayerByName, fetchPlayerClan: mocks.fetchPlayerClan }))
vi.mock('@/lib/role-service', () => ({ initializeDefaultRoles: vi.fn(async () => undefined) }))
vi.mock('@/lib/member-player-link', () => ({ ensurePlayerLinkForMember: vi.fn(async () => undefined) }))
vi.mock('@/lib/clan-archive', () => ({ reopenRejectedClan: vi.fn(async () => true) }))
vi.mock('@/lib/notification-service', () => ({
  notifyJoinRequest: mocks.notifyJoinRequest,
  notifyClanCreationRequest: mocks.notifyClanCreationRequest,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    // Journal des actions d'administration (Q10) : hors du sujet de ces contrats, absorbé.
    adminActionLog: { create: async () => ({}) },
    clan: { findFirst: mocks.clanFindFirst, create: mocks.clanCreate },
    clanMember: { findFirst: mocks.memberFindFirst, count: mocks.memberCount, create: mocks.memberCreate },
    clanRole: { findFirst: mocks.roleFindFirst },
  },
}))

import { DEFAULT_ADMIN_ALERT_EVENTS } from '@/lib/admin-alerts/catalog'
import { POST as joinRoute } from '@/app/api/join/route'
import { PATCH as patchLifecycleSettings } from '@/app/api/settings/clan-lifecycle/route'
import { POST as webhookTestRoute } from '@/app/api/settings/clan-lifecycle/webhook-test/route'

const SETTINGS = {
  mode: 'apply',
  confirmationsRequired: 3,
  maxMovesRatioPercent: 10,
  archiveAfterDays: 90,
  autoArchive: false,
  autoPromote: true,
  webhookUrl: 'https://discord.com/api/webhooks/123/secret',
  mention: { type: 'none', roleId: '' },
  alertEvents: DEFAULT_ADMIN_ALERT_EVENTS,
}

function jsonRequest(url: string, body: unknown, method = 'POST') {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const patch = (body: unknown) => patchLifecycleSettings(jsonRequest('/api/settings/clan-lifecycle', body, 'PATCH'), undefined)

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.requireSuperUser.mockResolvedValue(null)
  mocks.getSessionFromRequest.mockResolvedValue(null)
  mocks.getSettings.mockResolvedValue(SETTINGS)
  mocks.getWebhookUrl.mockResolvedValue('https://discord.com/api/webhooks/123/secret')
  mocks.getEvents.mockResolvedValue({ ...DEFAULT_ADMIN_ALERT_EVENTS })
  mocks.getMention.mockResolvedValue({ type: 'role', roleId: '987654321' })
  mocks.sendWebhook.mockResolvedValue({ ok: true, status: 204 })
  mocks.notifyJoinRequest.mockResolvedValue(0)
  mocks.notifyClanCreationRequest.mockResolvedValue(undefined)
})

describe('PATCH /api/settings/clan-lifecycle — salon d’administration', () => {
  it('enregistre la mention et ne renvoie jamais le webhook en clair', async () => {
    const response = await patch({ mention: { type: 'role', roleId: '987654321' } })

    expect(response.status).toBe(200)
    expect(mocks.setMention).toHaveBeenCalledWith({ type: 'role', roleId: '987654321' })
    const body = await response.json()
    expect(body.settings.webhookUrl).toBe('https://discord.com/api/webhooks/123/••••')
    expect(body.settings.alertEvents).toEqual(DEFAULT_ADMIN_ALERT_EVENTS)
  })

  it.each([
    ['rôle sans identifiant', { mention: { type: 'role', roleId: '' } }],
    ['identifiant qui n’est pas un nombre', { mention: { type: 'role', roleId: 'abc' } }],
    ['type de mention inconnu', { mention: { type: 'all' } }],
    ['interrupteur non booléen', { alertEvents: { clan_request: 'oui' } }],
  ])('%s → 400, rien n’est écrit', async (_label, body) => {
    const response = await patch(body)

    expect(response.status).toBe(400)
    expect(mocks.setMention).not.toHaveBeenCalled()
    expect(mocks.setEvents).not.toHaveBeenCalled()
  })

  it('n’écrit que les interrupteurs connus, et refuse un corps qui n’en contient aucun avant toute écriture', async () => {
    expect((await patch({ alertEvents: { privacy_request: false, inconnu: true } })).status).toBe(200)
    expect(mocks.setEvents).toHaveBeenCalledWith({ privacy_request: false })

    mocks.setEvents.mockReset()
    const refused = await patch({ mode: 'observe', alertEvents: { inconnu: true } })
    expect(refused.status).toBe(400)
    expect(mocks.setMode).not.toHaveBeenCalled()
    expect(mocks.setEvents).not.toHaveBeenCalled()
  })

  it('refuse sans être SuperUser', async () => {
    mocks.requireSuperUser.mockResolvedValue(Response.json({ error: 'Forbidden' }, { status: 403 }))

    expect((await patch({ alertEvents: { clan_request: false } })).status).toBe(403)
    expect(mocks.setEvents).not.toHaveBeenCalled()
  })
})

describe('POST /api/settings/clan-lifecycle/webhook-test', () => {
  const sendTest = () => webhookTestRoute(new Request('http://localhost/api/settings/clan-lifecycle/webhook-test', { method: 'POST' }), undefined)

  it('envoie le message de contrôle avec la mention réglée', async () => {
    const response = await sendTest()

    expect(response.status).toBe(200)
    const [url, payload] = mocks.sendWebhook.mock.calls[0]
    expect(url).toBe('https://discord.com/api/webhooks/123/secret')
    expect(payload.content).toBe('<@&987654321>')
    expect(payload.embeds[0].title).toBe('✅ Salon d’administration relié')
  })

  it('400 sans webhook, 502 si Discord refuse, 401 sans session', async () => {
    mocks.getWebhookUrl.mockResolvedValueOnce(null)
    expect((await sendTest()).status).toBe(400)

    mocks.sendWebhook.mockResolvedValueOnce({ ok: false, status: 404, error: 'Unknown Webhook' })
    const refused = await sendTest()
    expect(refused.status).toBe(502)
    expect((await refused.json()).error).toContain('Unknown Webhook')

    mocks.sendWebhook.mockClear()
    mocks.requireSuperUser.mockResolvedValueOnce(Response.json({ error: 'Unauthorized' }, { status: 401 }))
    expect((await sendTest()).status).toBe(401)
    expect(mocks.sendWebhook).not.toHaveBeenCalled()
  })
})

describe('POST /api/join — alertes du salon d’administration', () => {
  const join = () => joinRoute(jsonRequest('/api/join', { pubgPlayerName: 'Vvila', contactEmail: 'vvila@example.com' }))

  beforeEach(() => {
    mocks.searchPlayerByName.mockResolvedValue({ accountId: 'account.vvila' })
    mocks.memberFindFirst.mockResolvedValue(null)
    mocks.memberCount.mockResolvedValue(0)
    mocks.memberCreate.mockResolvedValue({ id: 55 })
    mocks.roleFindFirst.mockResolvedValue(null)
  })

  it('inscription d’un clan : alerte `clan_request`, sans l’adresse de contact', async () => {
    mocks.fetchPlayerClan.mockResolvedValue({ id: 'clan.ratz', name: 'Les Ratz', tag: 'RATZ' })
    mocks.clanFindFirst.mockResolvedValue(null)
    mocks.clanCreate.mockResolvedValue({ id: 431, name: 'Les Ratz', tag: 'RATZ' })

    expect((await join()).status).toBe(200)

    expect(mocks.fireAdminAlert).toHaveBeenCalledTimes(1)
    const [event, build] = mocks.fireAdminAlert.mock.calls[0]
    expect(event).toBe('clan_request')
    const embed = await build()
    expect(embed.title).toBe('🆕 Demande d’inscription — [RATZ] Les Ratz')
    expect(JSON.stringify(embed)).not.toContain('vvila@example.com')
  })

  it('adhésion à un clan sans Owner actif : alerte `orphan_join_request`', async () => {
    mocks.fetchPlayerClan.mockResolvedValue({ id: 'clan.smk', name: 'Smoke', tag: 'SMK' })
    mocks.clanFindFirst.mockResolvedValue({ id: 7, name: 'Smoke', tag: 'SMK', pubgClanId: 'clan.smk', archivedAt: null, archivedReason: null })
    mocks.notifyJoinRequest.mockResolvedValue(0)
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://chickendinner.fr')

    expect((await join()).status).toBe(200)

    await vi.waitFor(() => expect(mocks.fireAdminAlert).toHaveBeenCalledTimes(1))
    const [event, build] = mocks.fireAdminAlert.mock.calls[0]
    expect(event).toBe('orphan_join_request')
    expect((await build()).url).toBe('https://chickendinner.fr/clans/7/settings/members?tab=demandes')
    vi.unstubAllEnvs()
  })

  it('adhésion à un clan qui a un Owner actif : l’Owner est prévenu, pas le SuperUser', async () => {
    mocks.fetchPlayerClan.mockResolvedValue({ id: 'clan.smk', name: 'Smoke', tag: 'SMK' })
    mocks.clanFindFirst.mockResolvedValue({ id: 7, name: 'Smoke', tag: 'SMK', pubgClanId: 'clan.smk', archivedAt: null, archivedReason: null })
    mocks.notifyJoinRequest.mockResolvedValue(1)

    expect((await join()).status).toBe(200)

    await vi.waitFor(() => expect(mocks.notifyJoinRequest).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(mocks.fireAdminAlert).not.toHaveBeenCalled()
  })
})
