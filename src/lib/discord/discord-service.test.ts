import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clanConfig: { findUnique: vi.fn() },
    clan: { findUnique: vi.fn() },
    squadMatch: { findUnique: vi.fn() },
    discordNotificationLog: { create: vi.fn(), deleteMany: vi.fn() },
  },
}))

vi.mock('@/lib/discord/discord-client', () => ({
  sendDiscordWebhook: vi.fn(),
}))

vi.mock('@/lib/map-label-service', () => ({
  getMapLabels: vi.fn(async () => ({ Baltic_Main: 'Erangel' })),
  mapDisplayName: (mapName: string, labels: Record<string, string>) => labels[mapName] ?? mapName,
}))

import { sendDiscordWebhook } from '@/lib/discord/discord-client'
import { DEFAULT_DISCORD_SETTINGS, type DiscordSettings } from '@/lib/discord/discord-config'
import { notifyTop1IfEligible } from '@/lib/discord/discord-service'
import { prisma } from '@/lib/prisma'

const CLAN_ID = 7
const SQUAD_MATCH_ID = 'squad-match-1'
const WEBHOOK_URL = 'https://discord.com/api/webhooks/123456789/token-abc'

function settings(overrides: Partial<DiscordSettings['top1']> = {}) {
  return {
    top1: {
      ...DEFAULT_DISCORD_SETTINGS.top1,
      enabled: true,
      webhookUrl: WEBHOOK_URL,
      ...overrides,
    },
  }
}

/** Un membre de la partie : la place est celle de son équipe (`SquadMember.placement`). */
function squadMember(displayName: string, placement: number, overrides: { id?: number; clanId?: number; kills?: number } = {}) {
  return {
    kills: overrides.kills ?? 4,
    damage: 410,
    assists: 0,
    revives: 1,
    timeSurvived: 1834,
    placement,
    member: { id: overrides.id, displayName, clanId: overrides.clanId ?? CLAN_ID, isActive: true, joinStatus: 'active' },
  }
}

function squadMatch(overrides: Record<string, unknown> = {}) {
  return {
    id: SQUAD_MATCH_ID,
    matchType: 'official',
    gameMode: 'squad-fpp',
    mapName: 'Baltic_Main',
    createdAt: new Date('2026-09-13T20:15:00.000Z'),
    members: [
      { ...squadMember('Alpha', 1, { kills: 7 }), damage: 820, assists: 2, revives: 0 },
      squadMember('Bravo', 1),
    ],
    ...overrides,
  }
}

function arrange(options: {
  settings?: DiscordSettings
  match?: Record<string, unknown> | null
} = {}) {
  vi.mocked(prisma.clanConfig.findUnique).mockResolvedValue({
    value: JSON.stringify(options.settings ?? settings()),
  } as never)
  vi.mocked(prisma.squadMatch.findUnique).mockResolvedValue(
    (options.match === undefined ? squadMatch() : options.match) as never
  )
  vi.mocked(prisma.clan.findUnique).mockResolvedValue({ name: 'Les Poulets', tag: 'PLT' } as never)
  vi.mocked(prisma.discordNotificationLog.create).mockResolvedValue({} as never)
  vi.mocked(prisma.discordNotificationLog.deleteMany).mockResolvedValue({ count: 1 } as never)
  vi.mocked(sendDiscordWebhook).mockResolvedValue({ ok: true, status: 204 })
}

describe('notifyTop1IfEligible', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('publie l alerte pour une victoire eligible', async () => {
    arrange()

    await expect(notifyTop1IfEligible(CLAN_ID, SQUAD_MATCH_ID)).resolves.toEqual({ sent: true })

    expect(sendDiscordWebhook).toHaveBeenCalledTimes(1)
    const [url, payload] = vi.mocked(sendDiscordWebhook).mock.calls[0]
    expect(url).toBe(WEBHOOK_URL)
    expect(payload.embeds[0].title).toContain('CHICKEN DINNER')
  })

  it('porte les liens courts : match par le sous-domaine du clan, noms vers le tableau de bord', async () => {
    const LINKED_MATCH_ID = 'cmatch0000000000000000001'
    arrange({
      match: squadMatch({
        id: LINKED_MATCH_ID,
        members: [squadMember('Alpha', 1, { id: 11, kills: 7 }), squadMember('Bravo', 1, { id: 12 })],
      }),
    })
    vi.mocked(prisma.clan.findUnique).mockResolvedValue({ name: 'Les Poulets', tag: 'PLT', subdomain: 'plt' } as never)
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://chickendinner.fr')
    vi.stubEnv('CLAN_SUBDOMAIN_ROOT', 'chickendinner.fr')

    try {
      await notifyTop1IfEligible(CLAN_ID, LINKED_MATCH_ID)
    } finally {
      vi.unstubAllEnvs()
    }

    const [, payload] = vi.mocked(sendDiscordWebhook).mock.calls[0]
    expect(payload.embeds[0].url).toBe(`https://plt.chickendinner.fr/m/${LINKED_MATCH_ID}`)
    expect(payload.embeds[0].fields![0].value).toContain('[**Alpha**](https://chickendinner.fr/j/11)')
    expect(prisma.clan.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ select: expect.objectContaining({ subdomain: true }) })
    )
  })

  it('ignore un match qui n est pas un top 1', async () => {
    arrange({ match: squadMatch({ members: [squadMember('Alpha', 3), squadMember('Bravo', 3)] }) })

    await expect(notifyTop1IfEligible(CLAN_ID, SQUAD_MATCH_ID)).resolves.toEqual({
      sent: false,
      reason: 'not-a-win',
    })
    expect(sendDiscordWebhook).not.toHaveBeenCalled()
  })

  describe('partie partagée par plusieurs clans (docs/TODO/place-partie-partagee.md)', () => {
    const OTHER_CLAN = 8

    it('le clan qui rejoint une partie gagnée par un autre ne reçoit pas d’alerte', async () => {
      // Ligne créée par le clan gagnant ; ce clan-ci n'y a fini que 12e.
      arrange({
        match: squadMatch({
          placement: 1,
          members: [squadMember('Winner', 1, { clanId: OTHER_CLAN }), squadMember('Alpha', 12), squadMember('Bravo', 12)],
        }),
      })

      await expect(notifyTop1IfEligible(CLAN_ID, SQUAD_MATCH_ID)).resolves.toEqual({ sent: false, reason: 'not-a-win' })
      expect(prisma.discordNotificationLog.create).not.toHaveBeenCalled()
      expect(sendDiscordWebhook).not.toHaveBeenCalled()
    })

    it('le clan qui gagne une partie créée par un autre reçoit l’alerte, avec ses seuls membres', async () => {
      // La ligne porte la place du clan qui l'a créée (24e) : elle ne compte plus.
      arrange({
        match: squadMatch({
          placement: 24,
          members: [squadMember('Creator', 24, { clanId: OTHER_CLAN }), squadMember('Alpha', 1, { kills: 7 }), squadMember('Bravo', 1)],
        }),
      })

      await expect(notifyTop1IfEligible(CLAN_ID, SQUAD_MATCH_ID)).resolves.toEqual({ sent: true })
      const [, payload] = vi.mocked(sendDiscordWebhook).mock.calls[0]
      const roster = JSON.stringify(payload.embeds[0].fields)
      expect(roster).toContain('Alpha')
      expect(roster).not.toContain('Creator')
    })

    it('deux équipes du clan : seule l’équipe gagnante compte (seuil de membres, mode, liste)', async () => {
      arrange({
        settings: settings({ minClanMembers: 2 }),
        match: squadMatch({ members: [squadMember('Alpha', 1), squadMember('Bravo', 1), squadMember('Charlie', 9), squadMember('Delta', 9)] }),
      })

      await expect(notifyTop1IfEligible(CLAN_ID, SQUAD_MATCH_ID)).resolves.toEqual({ sent: true })
      const roster = JSON.stringify(vi.mocked(sendDiscordWebhook).mock.calls[0][1].embeds[0].fields)
      expect(roster).toContain('Bravo')
      expect(roster).not.toContain('Charlie')
    })

    it('pas de doublon : un 2e passage sur la même partie ne renvoie rien', async () => {
      arrange()
      vi.mocked(prisma.discordNotificationLog.create)
        .mockResolvedValueOnce({} as never)
        .mockRejectedValueOnce(Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }))

      await expect(notifyTop1IfEligible(CLAN_ID, SQUAD_MATCH_ID)).resolves.toEqual({ sent: true })
      await expect(notifyTop1IfEligible(CLAN_ID, SQUAD_MATCH_ID)).resolves.toEqual({ sent: false, reason: 'already-sent' })
      expect(sendDiscordWebhook).toHaveBeenCalledTimes(1)
    })

    it('ne lit plus `SquadMatch.placement` et ne sélectionne que les membres actifs du clan', async () => {
      arrange()
      await notifyTop1IfEligible(CLAN_ID, SQUAD_MATCH_ID)
      const query = vi.mocked(prisma.squadMatch.findUnique).mock.calls[0][0] as { select: Record<string, unknown> & { members: { where: unknown } } }
      expect(query.select).not.toHaveProperty('placement')
      expect(query.select.members.where).toEqual({ member: { clanId: CLAN_ID, isActive: true, joinStatus: 'active' } })
    })
  })

  it('ignore quand les alertes sont desactivees', async () => {
    arrange({ settings: settings({ enabled: false }) })

    await expect(notifyTop1IfEligible(CLAN_ID, SQUAD_MATCH_ID)).resolves.toEqual({
      sent: false,
      reason: 'disabled',
    })
    expect(sendDiscordWebhook).not.toHaveBeenCalled()
  })

  it('ignore quand l URL de webhook n est pas une URL Discord', async () => {
    arrange({ settings: settings({ webhookUrl: 'https://evil.example.com/hook' }) })

    await expect(notifyTop1IfEligible(CLAN_ID, SQUAD_MATCH_ID)).resolves.toEqual({
      sent: false,
      reason: 'no-webhook',
    })
    expect(sendDiscordWebhook).not.toHaveBeenCalled()
  })

  it('ignore un type de match desactive', async () => {
    arrange({
      settings: settings({
        matchTypes: { official: true, casual: true, airoyale: false, custom: false },
      }),
      match: squadMatch({ matchType: 'airoyale' }),
    })

    await expect(notifyTop1IfEligible(CLAN_ID, SQUAD_MATCH_ID)).resolves.toEqual({
      sent: false,
      reason: 'match-type-filtered',
    })
    expect(sendDiscordWebhook).not.toHaveBeenCalled()
  })

  it('ignore une escouade sous le seuil de membres du clan', async () => {
    arrange({
      settings: settings({ minClanMembers: 3 }),
      match: squadMatch(),
    })

    await expect(notifyTop1IfEligible(CLAN_ID, SQUAD_MATCH_ID)).resolves.toEqual({
      sent: false,
      reason: 'below-member-threshold',
    })
    expect(sendDiscordWebhook).not.toHaveBeenCalled()
  })

  it('ignore un mode d equipe desactive', async () => {
    arrange({
      settings: settings({ teamModes: { duo: false, trio: true, squad: true } }),
    })

    await expect(notifyTop1IfEligible(CLAN_ID, SQUAD_MATCH_ID)).resolves.toEqual({
      sent: false,
      reason: 'team-mode-filtered',
    })
    expect(sendDiscordWebhook).not.toHaveBeenCalled()
  })

  it('ne renvoie jamais deux fois la meme victoire', async () => {
    arrange()
    vi.mocked(prisma.discordNotificationLog.create).mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    )

    await expect(notifyTop1IfEligible(CLAN_ID, SQUAD_MATCH_ID)).resolves.toEqual({
      sent: false,
      reason: 'already-sent',
    })
    expect(sendDiscordWebhook).not.toHaveBeenCalled()
  })

  it('relache le verrou quand Discord refuse l envoi, sans lever', async () => {
    arrange()
    vi.mocked(sendDiscordWebhook).mockResolvedValue({
      ok: false,
      status: 429,
      error: 'rate limited',
    })

    await expect(notifyTop1IfEligible(CLAN_ID, SQUAD_MATCH_ID)).resolves.toEqual({
      sent: false,
      reason: 'send-failed',
    })
    expect(prisma.discordNotificationLog.deleteMany).toHaveBeenCalledWith({
      where: { clanId: CLAN_ID, kind: 'top1', refId: SQUAD_MATCH_ID },
    })
  })

  it('absorbe une panne base de donnees sans faire echouer la synchronisation', async () => {
    arrange()
    vi.mocked(prisma.squadMatch.findUnique).mockRejectedValue(new Error('DB down'))

    await expect(notifyTop1IfEligible(CLAN_ID, SQUAD_MATCH_ID)).resolves.toEqual({
      sent: false,
      reason: 'unexpected-error',
    })
    expect(sendDiscordWebhook).not.toHaveBeenCalled()
  })
})
