import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clanConfig: { findUnique: vi.fn() },
    clan: { findUnique: vi.fn(), findMany: vi.fn() },
    discordNotificationLog: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
  },
}))

vi.mock('@/lib/pubg', () => ({ fetchMatchDetails: vi.fn() }))

vi.mock('@/lib/discord/discord-client', () => ({ sendDiscordWebhook: vi.fn() }))

vi.mock('@/lib/map-label-service', () => ({
  getMapLabels: vi.fn(async () => ({ Desert_Main: 'Miramar' })),
  mapDisplayName: (mapName: string, labels: Record<string, string>) => labels[mapName] ?? mapName,
}))

// Seuls les acces base sont simules : le bareme et le classement restent la
// vraie implementation, c'est precisement ce que la diffusion doit refleter.
vi.mock('@/lib/tournament-service', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/tournament-service')>()),
  getTournamentForClan: vi.fn(),
  getTournamentMatches: vi.fn(),
}))

import { sendDiscordWebhook } from '@/lib/discord/discord-client'
import { DEFAULT_DISCORD_SETTINGS } from '@/lib/discord/discord-config'
import {
  broadcastTournamentRound,
  DiscordTournamentError,
  prepareTournamentRoundBroadcast,
} from '@/lib/discord/discord-tournament-service'
import { prisma } from '@/lib/prisma'
import { getTournamentForClan, getTournamentMatches } from '@/lib/tournament-service'

const CLAN_ID = 5
const TOURNAMENT_ID = 'tour-1'
const CLAN_WEBHOOK = 'https://discord.com/api/webhooks/111111111/clan-token'
const TOURNAMENT_WEBHOOK = 'https://discord.com/api/webhooks/222222222/tournament-token'

function member(memberId: number, clanId: number, kills: number, placement: number, damage: number) {
  return {
    memberId,
    kills,
    placement,
    damage,
    member: { id: memberId, clanId, displayName: `Joueur${memberId}` },
  }
}

const ROUND_ONE = {
  id: 'match-old',
  createdAt: new Date('2026-09-10T18:00:00Z'),
  mapName: 'Desert_Main',
  gameMode: 'squad-fpp',
  placement: 2,
  members: [member(1, 5, 3, 2, 400), member(2, 7, 5, 1, 900)],
}

const ROUND_TWO = {
  id: 'match-recent',
  createdAt: new Date('2026-09-13T18:00:00Z'),
  mapName: 'Desert_Main',
  gameMode: 'squad-fpp',
  placement: 1,
  members: [member(1, 5, 6, 1, 950), member(2, 7, 2, 4, 310)],
}

function arrange(options: { tournamentWebhookUrl?: string | null; clanWebhookUrl?: string } = {}) {
  vi.mocked(prisma.clanConfig.findUnique).mockResolvedValue({
    value: JSON.stringify({
      ...DEFAULT_DISCORD_SETTINGS,
      tournament: {
        ...DEFAULT_DISCORD_SETTINGS.tournament,
        enabled: true,
        webhookUrl: options.clanWebhookUrl ?? CLAN_WEBHOOK,
      },
    }),
  } as never)

  vi.mocked(getTournamentForClan).mockResolvedValue({
    id: TOURNAMENT_ID,
    title: 'Coupe inter-clans',
    organizerClanId: CLAN_ID,
    discordWebhookUrl: options.tournamentWebhookUrl ?? null,
    rules: { placementPoints: { 1: 10, 2: 6 }, killPoints: 1, winBonus: 0, bestOfRounds: null },
  } as never)

  vi.mocked(getTournamentMatches).mockResolvedValue([ROUND_TWO, ROUND_ONE] as never)

  vi.mocked(prisma.clan.findMany).mockResolvedValue([
    { id: 5, name: 'Alpha', tag: 'ALP' },
    { id: 7, name: 'Bravo', tag: 'BRV' },
  ] as never)
  vi.mocked(prisma.discordNotificationLog.findUnique).mockResolvedValue(null as never)
  vi.mocked(prisma.discordNotificationLog.upsert).mockResolvedValue({} as never)
  vi.mocked(sendDiscordWebhook).mockResolvedValue({ ok: true, status: 204 })
}

describe('prepareTournamentRoundBroadcast', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('numerote les manches dans l’ordre chronologique', async () => {
    arrange()

    const first = await prepareTournamentRoundBroadcast(CLAN_ID, TOURNAMENT_ID, 'match-old')
    const second = await prepareTournamentRoundBroadcast(CLAN_ID, TOURNAMENT_ID, 'match-recent')

    expect(first.roundNumber).toBe(1)
    expect(second.roundNumber).toBe(2)
    expect(second.totalRounds).toBe(2)
    expect(second.payload.embeds[0].title).toContain('Manche #2')
  })

  it('applique le bareme du tournoi aux scores de la manche', async () => {
    arrange()

    const prepared = await prepareTournamentRoundBroadcast(CLAN_ID, TOURNAMENT_ID, 'match-recent')

    // Clan Alpha : 1er (10 pts) + 6 kills = 16 pts ; Bravo : 4e (0 pt) + 2 kills = 2 pts.
    expect(prepared.payload.embeds[0].fields![0].value).toContain('**[ALP] Alpha** : 1er (+10 pts) · 6 kills (+6 pts) = **16 pts**')
    expect(prepared.payload.embeds[0].fields![0].value).toContain('**[BRV] Bravo**')
  })

  it('designe le MVP sur les degats infliges', async () => {
    arrange()

    const prepared = await prepareTournamentRoundBroadcast(CLAN_ID, TOURNAMENT_ID, 'match-recent')
    const mvpField = prepared.payload.embeds[0].fields!.find((field) => field.name.includes('MVP'))

    expect(mvpField?.value).toContain('**Joueur1**')
    expect(mvpField?.value).toContain('950 dégâts')
  })

  it('prefere le webhook specifique du tournoi quand il est renseigne', async () => {
    arrange({ tournamentWebhookUrl: TOURNAMENT_WEBHOOK })

    const prepared = await prepareTournamentRoundBroadcast(CLAN_ID, TOURNAMENT_ID, 'match-recent')

    expect(prepared.webhookUrl).toBe(TOURNAMENT_WEBHOOK)
    expect(prepared.usesTournamentOverride).toBe(true)
  })

  it('retombe sur le webhook du clan sans surcharge', async () => {
    arrange()

    const prepared = await prepareTournamentRoundBroadcast(CLAN_ID, TOURNAMENT_ID, 'match-recent')

    expect(prepared.webhookUrl).toBe(CLAN_WEBHOOK)
    expect(prepared.usesTournamentOverride).toBe(false)
  })

  it('refuse la diffusion sans webhook exploitable', async () => {
    arrange({ clanWebhookUrl: '' })

    await expect(
      prepareTournamentRoundBroadcast(CLAN_ID, TOURNAMENT_ID, 'match-recent')
    ).rejects.toBeInstanceOf(DiscordTournamentError)
  })

  it('refuse une manche etrangere au tournoi', async () => {
    arrange()

    await expect(
      prepareTournamentRoundBroadcast(CLAN_ID, TOURNAMENT_ID, 'match-inconnu')
    ).rejects.toMatchObject({ status: 404 })
  })

  it('signale une manche deja diffusee', async () => {
    arrange()
    const sentAt = new Date('2026-09-13T19:00:00Z')
    vi.mocked(prisma.discordNotificationLog.findUnique).mockResolvedValue({ sentAt } as never)

    const prepared = await prepareTournamentRoundBroadcast(CLAN_ID, TOURNAMENT_ID, 'match-recent')

    expect(prepared.alreadySentAt).toEqual(sentAt)
  })

  it('ne poste rien pendant la previsualisation', async () => {
    arrange()

    await prepareTournamentRoundBroadcast(CLAN_ID, TOURNAMENT_ID, 'match-recent')

    expect(sendDiscordWebhook).not.toHaveBeenCalled()
  })
})

describe('broadcastTournamentRound', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('publie puis enregistre la diffusion', async () => {
    arrange()

    await expect(
      broadcastTournamentRound(CLAN_ID, TOURNAMENT_ID, 'match-recent')
    ).resolves.toEqual({ roundNumber: 2, totalRounds: 2 })

    expect(sendDiscordWebhook).toHaveBeenCalledWith(CLAN_WEBHOOK, expect.anything())
    expect(prisma.discordNotificationLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: { clanId: CLAN_ID, kind: 'tournament_round', refId: `${TOURNAMENT_ID}:match-recent` },
      })
    )
  })

  it('n’enregistre aucune diffusion quand Discord refuse', async () => {
    arrange()
    vi.mocked(sendDiscordWebhook).mockResolvedValue({ ok: false, status: 404, error: 'Unknown Webhook' })

    await expect(
      broadcastTournamentRound(CLAN_ID, TOURNAMENT_ID, 'match-recent')
    ).rejects.toMatchObject({ status: 502 })

    expect(prisma.discordNotificationLog.upsert).not.toHaveBeenCalled()
  })
})
