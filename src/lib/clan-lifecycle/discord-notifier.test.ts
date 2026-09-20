import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Notification Discord des mouvements automatiques (chantier 1).
 *
 * Le point sensible : un webhook non configuré est un cas **normal**, pas une
 * erreur. L'onglet « Paramètres » le laisse vide par défaut, et le cron ne doit ni
 * lever, ni polluer les journaux pour autant.
 */

const mocks = vi.hoisted(() => ({
  sendWebhook: vi.fn(),
  getWebhookUrl: vi.fn(),
}))

vi.mock('@/lib/discord/discord-client', () => ({
  sendDiscordWebhook: mocks.sendWebhook,
}))

vi.mock('@/lib/clan-lifecycle/config', () => ({
  getClanLifecycleDiscordWebhookUrl: mocks.getWebhookUrl,
}))

import { notifyLifecyclePass } from '@/lib/clan-lifecycle/discord-notifier'
import type { MembershipSyncSummary, PlannedMovement } from '@/lib/clan-lifecycle/membership-sync'

function summary(overrides: Partial<MembershipSyncSummary> = {}): MembershipSyncSummary {
  return {
    runId: 'run_1',
    status: 'success',
    mode: 'apply',
    membersScanned: 40,
    apiCalls: 4,
    statesHasClan: 38,
    statesNoClan: 2,
    statesUnknown: 0,
    discrepanciesFound: 1,
    awaitingConfirmation: 0,
    movementsPlanned: 1,
    movementsApplied: 1,
    circuitBreakerTripped: false,
    movesRatioPercent: 2.5,
    movements: [],
    ...overrides,
  }
}

function movement(overrides: Partial<PlannedMovement> = {}): PlannedMovement {
  return {
    memberId: 11,
    memberName: 'Vvila',
    pubgAccountId: 'account.vvila',
    platformShard: 'steam',
    previousClanId: 1,
    previousClanTag: 'SMK',
    previousPubgClanId: 'clan.smk',
    targetClanId: 201,
    targetClanTag: 'UNG',
    targetPubgClanId: null,
    source: 'auto_demotion',
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getWebhookUrl.mockResolvedValue('https://discord.com/api/webhooks/xxx')
  mocks.sendWebhook.mockResolvedValue({ ok: true, status: 204 })
})

describe('Webhook non configuré', () => {
  it('ne notifie pas et ne lève pas', async () => {
    mocks.getWebhookUrl.mockResolvedValue(null)

    const result = await notifyLifecyclePass(summary(), [movement()])

    expect(result).toEqual({ sent: false, reason: 'no_webhook' })
    expect(mocks.sendWebhook).not.toHaveBeenCalled()
  })
})

describe('Passage sans rien à signaler', () => {
  it("n'appelle même pas la configuration quand aucun mouvement et aucun incident", async () => {
    const result = await notifyLifecyclePass(
      summary({ discrepanciesFound: 0, movementsPlanned: 0, movementsApplied: 0 }),
      []
    )

    expect(result).toEqual({ sent: false, reason: 'nothing_to_report' })
    expect(mocks.sendWebhook).not.toHaveBeenCalled()
  })

  it('notifie quand même si le coupe-circuit a sauté, même sans mouvement appliqué', async () => {
    const result = await notifyLifecyclePass(
      summary({ circuitBreakerTripped: true, movementsApplied: 0, movements: [] }),
      []
    )

    expect(result).toMatchObject({ sent: true })
    const payload = mocks.sendWebhook.mock.calls[0][1]
    expect(payload.embeds[0].title).toMatch(/abandonné/i)
  })
})

describe("Contenu de l'embed", () => {
  it('décrit le mouvement avec les tags de départ et d’arrivée', async () => {
    await notifyLifecyclePass(summary(), [movement()])

    const payload = mocks.sendWebhook.mock.calls[0][1]
    expect(payload.embeds[0].description).toContain('**Vvila**')
    expect(payload.embeds[0].description).toContain('[SMK]')
    expect(payload.embeds[0].description).toContain('[UNG]')
    expect(payload.embeds[0].description).toContain('basculé')
  })

  it('distingue un transfert d’une bascule', async () => {
    await notifyLifecyclePass(summary(), [
      movement({ source: 'auto_transfer', targetClanTag: 'KMS', targetClanId: 180 }),
    ])

    expect(mocks.sendWebhook.mock.calls[0][1].embeds[0].description).toContain('transféré')
  })

  it('annonce le mode observation plutôt qu’une application', async () => {
    await notifyLifecyclePass(summary({ mode: 'observe', movementsApplied: 0 }), [movement()])

    expect(mocks.sendWebhook.mock.calls[0][1].embeds[0].title).toMatch(/observation/i)
  })

  it('signale les états indéterminés sans les confondre avec des mouvements', async () => {
    await notifyLifecyclePass(summary({ statesUnknown: 3 }), [movement()])

    const fields = mocks.sendWebhook.mock.calls[0][1].embeds[0].fields
    const unknownField = fields.find((f: { name: string }) => f.name.includes('indéterminés'))
    expect(unknownField.value).toMatch(/aucun mouvement/i)
  })

  it('borne la liste et annonce le reste, pour ne pas dépasser la limite Discord', async () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      movement({ memberId: i, memberName: `Joueur${i}` })
    )

    await notifyLifecyclePass(summary({ movementsPlanned: 20, movementsApplied: 20 }), many)

    const description = mocks.sendWebhook.mock.calls[0][1].embeds[0].description
    expect(description).toContain('et 5 autre(s)')
    expect(description).not.toContain('Joueur15')
  })
})

describe('Échec de la notification', () => {
  it('remonte l’échec sans lever', async () => {
    mocks.sendWebhook.mockResolvedValue({ ok: false, status: 500, error: 'boom' })

    const result = await notifyLifecyclePass(summary(), [movement()])

    expect(result).toEqual({ sent: false, reason: 'failed', error: 'boom' })
  })
})
