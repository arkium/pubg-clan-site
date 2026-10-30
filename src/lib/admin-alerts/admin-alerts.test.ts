import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Alertes du salon Discord d'administration (src/lib/admin-alerts/) : catalogue, envoi et contenu.
 *
 * Trois choses ne doivent jamais casser : un événement coupé ou un webhook vide ne postent rien ; la mention ne sonne
 * que pour ce qui attend une décision ; aucune donnée personnelle (adresse, pseudo d'une demande de retrait) ne part
 * chez Discord.
 */

const mocks = vi.hoisted(() => ({
  sendWebhook: vi.fn(),
  getWebhookUrl: vi.fn(),
  getEvents: vi.fn(),
  getMention: vi.fn(),
}))

vi.mock('@/lib/discord/discord-client', () => ({ sendDiscordWebhook: mocks.sendWebhook }))
vi.mock('@/lib/clan-lifecycle/config', () => ({
  getClanLifecycleDiscordWebhookUrl: mocks.getWebhookUrl,
  getAdminAlertEvents: mocks.getEvents,
  getAdminAlertMention: mocks.getMention,
}))

import {
  ADMIN_ALERT_EVENTS,
  DEFAULT_ADMIN_ALERT_EVENTS,
  normalizeAdminAlertEvents,
  pickAdminAlertEventsPatch,
} from '@/lib/admin-alerts/catalog'
import {
  adminAlertTestMessage,
  clanDiscoveredAlert,
  coachBudgetAlert,
  coachModelNoticeAlert,
  coachProviderErrorsAlert,
  dailyDigestAlert,
  clanRequestAlert,
  lifecycleFailedAlert,
  matchSyncDegradedAlert,
  matchSyncRecoveredAlert,
  orphanJoinRequestAlert,
  privacyRequestAlert,
  resourceQueueAlert,
} from '@/lib/admin-alerts/messages'
import { fireAdminAlert, sendAdminAlert } from '@/lib/admin-alerts/send'

const WEBHOOK = 'https://discord.com/api/webhooks/1/secret'
const EMBED = { title: 'Alerte' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://chickendinner.fr/')
  vi.stubEnv('APP_URL', '')
  mocks.getWebhookUrl.mockResolvedValue(WEBHOOK)
  mocks.getEvents.mockResolvedValue({ ...DEFAULT_ADMIN_ALERT_EVENTS })
  mocks.getMention.mockResolvedValue({ type: 'none', roleId: '' })
  mocks.sendWebhook.mockResolvedValue({ ok: true, status: 204 })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('catalogue', () => {
  it('a des clés uniques, et tout ce qui attend une décision est activé par défaut', () => {
    const keys = ADMIN_ALERT_EVENTS.map((definition) => definition.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const definition of ADMIN_ALERT_EVENTS.filter((entry) => entry.toAct)) {
      expect(DEFAULT_ADMIN_ALERT_EVENTS[definition.key], definition.key).toBe(true)
    }
  })

  it('garde la valeur par défaut d’un événement absent ou mal formé', () => {
    const events = normalizeAdminAlertEvents({ clan_request: false, resource_queue: 'non', inconnu: true })
    expect(events.clan_request).toBe(false)
    expect(events.resource_queue).toBe(DEFAULT_ADMIN_ALERT_EVENTS.resource_queue)
    expect(events).not.toHaveProperty('inconnu')
    expect(normalizeAdminAlertEvents(null)).toEqual(DEFAULT_ADMIN_ALERT_EVENTS)
    expect(normalizeAdminAlertEvents(['clan_request'])).toEqual(DEFAULT_ADMIN_ALERT_EVENTS)
  })

  it('ne retient d’un corps de requête que les interrupteurs connus et booléens', () => {
    expect(pickAdminAlertEventsPatch({ privacy_request: false, inconnu: false, clan_request: 'oui' })).toEqual({ privacy_request: false })
    expect(pickAdminAlertEventsPatch('clan_request')).toEqual({})
  })
})

describe('sendAdminAlert', () => {
  it('ne poste rien quand l’événement est coupé', async () => {
    mocks.getEvents.mockResolvedValue({ ...DEFAULT_ADMIN_ALERT_EVENTS, clan_request: false })

    expect(await sendAdminAlert('clan_request', EMBED)).toEqual({ sent: false, reason: 'disabled' })
    expect(mocks.getWebhookUrl).not.toHaveBeenCalled()
    expect(mocks.sendWebhook).not.toHaveBeenCalled()
  })

  it('ne poste rien sans webhook, sans que ce soit une erreur', async () => {
    mocks.getWebhookUrl.mockResolvedValue(null)

    expect(await sendAdminAlert('clan_request', EMBED)).toEqual({ sent: false, reason: 'no_webhook' })
    expect(mocks.sendWebhook).not.toHaveBeenCalled()
  })

  it('mentionne le rôle réglé pour une alerte à traiter, et horodate le message', async () => {
    mocks.getMention.mockResolvedValue({ type: 'role', roleId: '123456789' })

    expect(await sendAdminAlert('clan_request', EMBED)).toEqual({ sent: true, status: 204 })
    const [url, payload] = mocks.sendWebhook.mock.calls[0]
    expect(url).toBe(WEBHOOK)
    expect(payload.content).toBe('<@&123456789>')
    expect(payload.username).toBe('Administration')
    expect(payload.embeds[0]).toMatchObject({ title: 'Alerte', timestamp: expect.any(String) })
  })

  it('ne mentionne personne pour un retour à la normale, même d’une alerte à traiter', async () => {
    mocks.getMention.mockResolvedValue({ type: 'everyone', roleId: '' })

    await sendAdminAlert('match_sync_degraded', EMBED, { withoutMention: true })
    expect(mocks.sendWebhook.mock.calls[0][1]).not.toHaveProperty('content')
    await sendAdminAlert('match_sync_degraded', EMBED)
    expect(mocks.sendWebhook.mock.calls[1][1].content).toBe('@everyone')
  })

  it('ne mentionne personne pour une alerte d’information', async () => {
    mocks.getMention.mockResolvedValue({ type: 'everyone', roleId: '' })

    await sendAdminAlert('resource_queue', EMBED)
    expect(mocks.sendWebhook.mock.calls[0][1]).not.toHaveProperty('content')
  })

  it('remonte un refus de Discord ou une panne de la base sans jamais lever', async () => {
    mocks.sendWebhook.mockResolvedValue({ ok: false, status: 404, error: 'Unknown Webhook' })
    expect(await sendAdminAlert('privacy_request', EMBED)).toEqual({ sent: false, reason: 'failed', error: 'Unknown Webhook' })

    mocks.getEvents.mockRejectedValue(new Error('base indisponible'))
    expect(await sendAdminAlert('privacy_request', EMBED)).toEqual({ sent: false, reason: 'failed', error: 'base indisponible' })
  })

  it('fireAdminAlert construit puis envoie sans faire attendre l’appelant, et absorbe une construction en échec', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    fireAdminAlert('clan_request', () => EMBED)
    fireAdminAlert('clan_request', () => {
      throw new Error('boom')
    })
    expect(mocks.sendWebhook).not.toHaveBeenCalled()

    await vi.waitFor(() => expect(mocks.sendWebhook).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(warn).toHaveBeenCalledWith('[admin-alert] clan_request non construite :', expect.any(Error)))
    warn.mockRestore()
  })
})

describe('contenu des alertes', () => {
  it('demande d’inscription : lien vers les clans en attente, avertissement sans clan PUBG', () => {
    const embed = clanRequestAlert({
      clanId: 431,
      clanName: 'Les Ratz',
      clanTag: 'RATZ',
      platformShard: 'steam',
      playerName: 'Vvila',
      reopened: false,
      hasPubgClan: false,
    })
    expect(embed.title).toBe('🆕 Demande d’inscription — [RATZ] Les Ratz')
    expect(embed.url).toBe('https://chickendinner.fr/settings/clans/lifecycle?tab=pending')
    expect(embed.description).toContain('**Vvila** demande l’inscription')
    expect(embed.description).toContain('aucun clan PUBG')
    expect(embed.footer?.text).toBe('Clan n° 431')

    const reopened = clanRequestAlert({ clanId: 1, clanName: 'X', clanTag: 'X', platformShard: 'steam', playerName: 'P', reopened: true, hasPubgClan: true })
    expect(reopened.description).toContain('refusé auparavant')
    expect(reopened.description).not.toContain('aucun clan PUBG')
  })

  it('part sans lien quand l’adresse du site n’est pas configurée', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '')
    expect(clanDiscoveredAlert({ clanId: 2, clanName: 'Y', clanTag: 'Y', waitingPlayers: 3 }).url).toBeUndefined()
  })

  it('clan découvert et adhésion sans Owner : le nombre de joueurs, la bonne page', () => {
    expect(clanDiscoveredAlert({ clanId: 2, clanName: 'Y', clanTag: 'YY', waitingPlayers: 3 }).description).toContain('3 joueurs du parking')
    expect(clanDiscoveredAlert({ clanId: 2, clanName: 'Y', clanTag: 'YY', waitingPlayers: 1 }).description).toContain('Un joueur du parking')
    expect(orphanJoinRequestAlert({ clanId: 7, clanName: 'Z', clanTag: 'ZZ', playerName: 'Kilo' }).url).toBe(
      'https://chickendinner.fr/clans/7/settings/members?tab=demandes'
    )
  })

  it('demande « Retirer mes données » : type et échéance seulement', () => {
    const embed = privacyRequestAlert({ id: 9, kind: 'purge', deadline: new Date('2026-11-19T10:00:00.000Z') })
    expect(embed.fields).toEqual([
      { name: 'Type', value: 'Purger mon historique', inline: true },
      { name: 'Réponse avant le', value: '19 novembre 2026', inline: true },
    ])
    expect(JSON.stringify(embed)).not.toMatch(/@/)
    expect(embed.url).toBe('https://chickendinner.fr/settings/privacy-requests')
  })

  it('carte des ressources : carte, type et taille de la file', () => {
    const proposal = resourceQueueAlert({ submission: 'proposal', mapKey: 'Baltic_Main', pointKind: 'garage', queueSize: 4 })
    expect(proposal.description).toBe('Nouveau point proposé : **Garage** sur Erangel.')
    expect(proposal.fields?.[0].value).toBe('4 éléments')

    const report = resourceQueueAlert({ submission: 'report', mapKey: 'Savage_Main', pointKind: 'dock', reportKind: 'missing', queueSize: 1 })
    expect(report.description).toBe('Signalement « N’existe plus » sur un point **Ponton** de Sanhok.')
    expect(report.fields?.[0].value).toBe('1 élément')
  })

  it('synchronisation des parties : raisons et délai, vers la fraîcheur des parties ; retour à la normale', () => {
    const degraded = matchSyncDegradedAlert({
      urgent: true,
      reasons: ['1 échec PUBG à traiter en 24 h (clé refusée ou appel mal formé)', '2 tours sautés en 24 h'],
      delayMedianMinutes: 15,
      delayP90Minutes: 27,
      matches: 1221,
    })
    expect(degraded.title).toContain('en difficulté')
    expect(degraded.description).toBe('• 1 échec PUBG à traiter en 24 h (clé refusée ou appel mal formé)\n• 2 tours sautés en 24 h')
    expect(degraded.fields?.[0].value).toBe('médiane 15 min, 90 % sous 27 min (1221 parties en 24 h)')
    expect(degraded.url).toBe('https://chickendinner.fr/settings/cron#fraicheur')
    expect(matchSyncDegradedAlert({ urgent: false, reasons: ['x'], delayMedianMinutes: null, delayP90Minutes: null, matches: 0 })).toMatchObject({
      title: expect.stringContaining('à surveiller'),
      fields: [{ value: 'pas encore mesuré' }, expect.anything()],
    })
    expect(matchSyncRecoveredAlert({ delayMedianMinutes: 14, matches: 900 }).description).toBe('Délai médian 14 min sur 900 parties en 24 h.')
  })

  it('Coach IA : plafond à 80 % puis atteint, erreurs du fournisseur, échéance du modèle — vers la page du Coach', () => {
    const periodEnd = new Date('2026-10-31T23:00:00.000Z')
    const warning = coachBudgetAlert({ level: 80, spentEur: 41.2, budgetEur: 50, periodEnd })
    expect(warning.title).toContain('80 %')
    // Intl sépare le nombre du symbole par une espace fine insécable.
    expect(warning.description).toMatch(/41,20\s€ dépensés sur 50,00\s€/)
    expect(warning.description).toContain('1 novembre 2026')
    expect(warning.url).toBe('https://chickendinner.fr/settings/coach/usage')

    const reached = coachBudgetAlert({ level: 100, spentEur: 50, budgetEur: 50, periodEnd })
    expect(reached.title).toContain('pause')
    expect(reached.description).toContain('sauf pour toi')

    const errors = coachProviderErrorsAlert({ errors: 6, windowMinutes: 15, lastMessage: 'unauthorized — API key not valid' })
    expect(errors.description).toContain('**6** réponses en erreur en 15 minutes')
    expect(errors.fields?.[0]).toEqual({ name: 'Dernière erreur', value: 'unauthorized — API key not valid', inline: false })
    expect(coachProviderErrorsAlert({ errors: 5, windowMinutes: 15, lastMessage: null }).fields?.[0].value).toBe('non précisée')

    const model = { id: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite' }
    const shutdown = coachModelNoticeAlert({ model, notice: { kind: 'shutdown', date: '2027-05-07' }, now: new Date('2027-04-20T07:00:00.000Z') })
    expect(shutdown.title).toBe('📅 Coach IA — arrêt annoncé de Gemini 3.1 Flash-Lite')
    expect(shutdown.description).toContain('7 mai 2027')
    expect(shutdown.url).toBe('https://chickendinner.fr/settings/coach')
    const price = coachModelNoticeAlert({ model: { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' }, notice: { kind: 'price', date: '2027-01-01' }, now: new Date('2026-12-05T07:00:00.000Z') })
    expect(price.title).toContain('nouveau prix')
    expect(price.description).toContain('1 janvier 2027')
  })

  it('veille du matin : décisions et incidents listés, « à relire » en pied, rouge s’il y a un urgent', () => {
    const embed = dailyDigestAlert({
      generatedAt: '2026-10-19T07:00:00.000Z',
      unavailable: ['télémétrie'],
      items: [
        { key: 'cron_failures', tone: 'urgent', count: 2, label: 'Tâches planifiées en échec (24 h)', detail: 'Sync quotidien clans : [GFG]', href: '/settings/cron' },
        { key: 'pending_clans', tone: 'todo', count: 1, label: 'Clans en attente de ta décision', detail: null, href: '/settings/clans/lifecycle?tab=pending' },
        { key: 'unacknowledged_moves', tone: 'info', count: 45, label: 'Mouvements automatiques à relire', detail: null, href: '/settings/clans/lifecycle?tab=mutations' },
      ],
    })
    expect(embed.title).toBe('📋 À traiter ce matin — 2 sujets')
    expect(embed.description?.split('\n')).toEqual([
      '🔴 **2** Tâches planifiées en échec (24 h) — Sync quotidien clans : [GFG]',
      '🟠 **1** Clans en attente de ta décision',
    ])
    expect(embed.footer?.text).toBe('Aussi : Mouvements automatiques à relire (45) · Non lu : télémétrie')
    expect(embed.color).toBe(0xdc2626)
    expect(embed.url).toBe('https://chickendinner.fr/settings')

    const many = dailyDigestAlert({
      generatedAt: '2026-10-19T07:00:00.000Z',
      unavailable: [],
      items: Array.from({ length: 14 }, (_, index) => ({ key: `k${index}`, tone: 'todo' as const, count: 1, label: `Sujet ${index}`, detail: null, href: '/settings' })),
    })
    expect(many.description?.split('\n')).toHaveLength(13)
    expect(many.description).toContain('… et 2 autre(s)')
    expect(many.footer).toBeUndefined()
  })

  it('passage en échec et message de test', () => {
    expect(lifecycleFailedAlert({ runId: 'run_9', message: 'Timeout PUBG' }).description).toContain('Timeout PUBG')
    expect(lifecycleFailedAlert({ runId: null }).footer?.text).toBe('Passage sans identifiant')

    const test = adminAlertTestMessage({ ...DEFAULT_ADMIN_ALERT_EVENTS, resource_queue: false })
    expect(test.description).toContain('Demande d’inscription d’un clan — avec mention')
    expect(test.description).not.toContain('Carte des ressources')

    const none = adminAlertTestMessage(normalizeAdminAlertEvents(Object.fromEntries(ADMIN_ALERT_EVENTS.map((entry) => [entry.key, false]))))
    expect(none.description).toContain('Aucune alerte n’est activée')
  })
})
