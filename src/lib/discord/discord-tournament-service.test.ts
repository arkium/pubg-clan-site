import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    clanConfig: { findUnique: vi.fn() },
    clan: { findUnique: vi.fn(), findMany: vi.fn() },
    // Depuis les modes de tournoi, le service résout aussi les pseudos : sans ce modèle, le mock renvoie
    // `undefined` et l'erreur tombe loin de sa cause (gotcha documenté dans CLAUDE.md).
    clanMember: { findMany: vi.fn() },
    discordNotificationLog: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn() },
  },
}))

vi.mock('@/lib/pubg', () => ({ fetchMatchDetails: vi.fn(), fetchMatchOverview: vi.fn() }))

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
  broadcastTournamentSquadStandings,
  broadcastTournamentSummary,
  DiscordTournamentError,
  listTournamentRounds,
  prepareTournamentRoundBroadcast,
  prepareTournamentSquadStandingsBroadcast,
  prepareTournamentSummaryBroadcast,
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

function arrange(
  options: {
    tournamentWebhookUrl?: string | null
    clanWebhookUrl?: string
    rules?: Record<string, unknown>
    /** Statut et dates du tournoi (résumé final ou provisoire). */
    tournament?: Record<string, unknown>
  } = {}
) {
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
    rules: {
      placementPoints: { 1: 10, 2: 6 },
      killPoints: 1,
      winBonus: 0,
      bestOfRounds: null,
      ...(options.rules ?? {}),
    },
    ...(options.tournament ?? {}),
  } as never)

  vi.mocked(getTournamentMatches).mockResolvedValue([ROUND_TWO, ROUND_ONE] as never)

  vi.mocked(prisma.clan.findMany).mockResolvedValue([
    { id: 5, name: 'Alpha', tag: 'ALP' },
    { id: 7, name: 'Bravo', tag: 'BRV' },
  ] as never)
  vi.mocked(prisma.clanMember.findMany).mockResolvedValue([
    { id: 1, displayName: 'Alpha', clanId: 5 },
    { id: 2, displayName: 'Bravo', clanId: 7 },
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

  it('sans webhook exploitable : l’aperçu reste servi (à copier), seul l’envoi est refusé', async () => {
    arrange({ clanWebhookUrl: '' })

    const prepared = await prepareTournamentRoundBroadcast(CLAN_ID, TOURNAMENT_ID, 'match-recent')
    expect(prepared.webhookUrl).toBeNull()
    expect(prepared.payload.embeds[0].title).toContain('Résultats Manche #2')

    await expect(broadcastTournamentRound(CLAN_ID, TOURNAMENT_ID, 'match-recent')).rejects.toBeInstanceOf(
      DiscordTournamentError
    )
    expect(sendDiscordWebhook).not.toHaveBeenCalled()
    expect(prisma.discordNotificationLog.upsert).not.toHaveBeenCalled()
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

describe('diffusion selon le mode du tournoi', () => {
  it('classe les joueurs un par un et adapte les intitulés en mode solo', async () => {
    arrange({ rules: { mode: 'solo_ffa' } })

    const { payload } = await prepareTournamentRoundBroadcast(CLAN_ID, TOURNAMENT_ID, 'match-recent')
    const [embed] = payload.embeds

    expect(embed.fields![0].name).toBe('Classement de la manche (joueurs)')
    expect(embed.fields![0].value).toContain('[ALP] Alpha')
    expect(embed.fields![0].value).toContain('[BRV] Bravo')
    expect(embed.footer?.text).toContain('2 joueur(s) classé(s)')
  })

  it('regroupe l’escouade en une seule ligne en mode équipes libres', async () => {
    arrange({ rules: { mode: 'custom_teams' } })
    // Escouade mixte : ses deux joueurs partagent le même placement, comme dans PUBG.
    const mixedSquad = { ...ROUND_TWO, members: [member(1, 5, 6, 1, 950), member(2, 7, 2, 1, 310)] }
    vi.mocked(getTournamentMatches).mockResolvedValue([mixedSquad, ROUND_ONE] as never)

    const { payload } = await prepareTournamentRoundBroadcast(CLAN_ID, TOURNAMENT_ID, 'match-recent')
    const [embed] = payload.embeds

    expect(embed.fields![0].name).toBe('Scores de la manche (équipes)')
    expect(embed.footer?.text).toContain('1 équipe(s) classée(s)')
    expect(embed.fields![0].value).toContain('[ALP] Alpha, [BRV] Bravo')
  })

  it('ne retient que le clan organisateur, MVP compris, en scrims internes', async () => {
    arrange({ rules: { mode: 'intra_clan' } })

    const { payload } = await prepareTournamentRoundBroadcast(CLAN_ID, TOURNAMENT_ID, 'match-recent')
    const [embed] = payload.embeds
    const mvpField = embed.fields!.find((field) => field.name.includes('MVP'))

    expect(embed.fields![0].name).toBe('Scores de la manche (squads internes)')
    expect(embed.fields![0].value).toContain('[ALP] Alpha')
    expect(embed.fields![0].value).not.toContain('Bravo')
    // Joueur2 (clan 7) fait pourtant plus de dégâts : il ne concourt pas dans un tournoi interne.
    expect(mvpField?.value).toContain('Joueur1')
  })

  it('annonce le partage au prorata dans l’embed', async () => {
    arrange({ rules: { mixedSquadRule: 'prorata' } })

    const { payload } = await prepareTournamentRoundBroadcast(CLAN_ID, TOURNAMENT_ID, 'match-recent')
    expect(payload.embeds[0].description).toContain('prorata')
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

describe('classement par escouade', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('classe chaque escouade sur tout le tournoi, avec sa place à chaque manche', async () => {
    arrange()

    const { payload, totalRounds, alreadySentAt } = await prepareTournamentSquadStandingsBroadcast(CLAN_ID, TOURNAMENT_ID)
    const [embed] = payload.embeds

    expect(totalRounds).toBe(2)
    expect(alreadySentAt).toBeNull()
    expect(embed.title).toContain('Classement par squad')
    // 25 points chacune : départagées par les kills (9 contre 7).
    expect(embed.description).toContain('🥇 **[ALP] Alpha**\n**25 pts** · 9 kills · 1 Top 1 · manches : 2 · #1')
    expect(embed.description).toContain('🥈 **[BRV] Bravo**\n**25 pts** · 7 kills · 1 Top 1 · manches : #1 · 4')
  })

  it('n’existe qu’en inter-clans', async () => {
    arrange({ rules: { mode: 'solo_ffa' } })

    await expect(prepareTournamentSquadStandingsBroadcast(CLAN_ID, TOURNAMENT_ID)).rejects.toMatchObject({ status: 400 })
  })

  it('publie puis enregistre la diffusion, une par tournoi', async () => {
    arrange()

    await expect(broadcastTournamentSquadStandings(CLAN_ID, TOURNAMENT_ID)).resolves.toEqual({ totalRounds: 2 })
    expect(prisma.discordNotificationLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { clanId: CLAN_ID, kind: 'tournament_squads', refId: TOURNAMENT_ID } })
    )
  })
})

describe('résumé du tournoi (2026-10-24)', () => {
  const FINISHED = {
    status: 'finished',
    startDate: new Date('2026-09-10T17:00:00Z'),
    endDate: new Date('2026-09-13T21:00:00Z'),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('tournoi terminé : résultat final, mêmes chiffres que le classement, vainqueur de chaque manche', async () => {
    arrange({ tournament: FINISHED })

    const { payload, final, totalRounds } = await prepareTournamentSummaryBroadcast(CLAN_ID, TOURNAMENT_ID)
    const [embed] = payload.embeds

    expect(final).toBe(true)
    expect(totalRounds).toBe(2)
    expect(embed.title).toBe('🏆 Tournoi : Coupe inter-clans — Résultat final')
    expect(embed.description).toContain('organisé par **[ALP] Alpha**')
    expect(embed.description).toContain('🎮 Inter-clans · 2 manche(s) · 2 clan(s) classé(s)')
    // 25 points chacun : Alpha devant aux kills (9 contre 7), comme sur la page du tournoi.
    expect(embed.fields![0]).toMatchObject({ name: 'Classement final' })
    expect(embed.fields![0].value).toMatch(/^🥇 \*\*\[ALP\] Alpha\*\* — 25 pts · 9 kills · 1 Top 1/)
    // MVP du tournoi : le plus de kills (Alpha 9, Bravo 7).
    expect(embed.fields![1].name).toBe('⭐ MVP du tournoi')
    expect(embed.fields![1].value).toContain('[ALP] Alpha')
    expect(embed.fields![2].value).toBe('M1 · Miramar · Squad FPP — 🐔 [BRV] Bravo\nM2 · Miramar · Squad FPP — 🐔 [ALP] Alpha')
  })

  it('tournoi en cours : résumé provisoire', async () => {
    arrange({ tournament: { ...FINISHED, status: 'active', endDate: new Date(Date.now() + 86_400_000) } })
    const { payload, final } = await prepareTournamentSummaryBroadcast(CLAN_ID, TOURNAMENT_ID)
    expect(final).toBe(false)
    expect(payload.embeds[0].title).toContain('Résumé provisoire')
  })

  it('aucune manche : rien à résumer', async () => {
    arrange({ tournament: FINISHED })
    vi.mocked(getTournamentMatches).mockResolvedValue([] as never)
    await expect(prepareTournamentSummaryBroadcast(CLAN_ID, TOURNAMENT_ID)).rejects.toBeInstanceOf(DiscordTournamentError)
  })

  it('la liste propose le résumé, marqué final quand le tournoi est terminé', async () => {
    arrange({ tournament: FINISHED })
    vi.mocked(prisma.discordNotificationLog.findMany).mockResolvedValue([] as never)
    const list = await listTournamentRounds(CLAN_ID, TOURNAMENT_ID)
    expect(list.summary).toEqual({ available: true, final: true, sentAt: null })
    expect(list.rounds).toHaveLength(2)
  })

  it('publie puis enregistre la diffusion, une par tournoi', async () => {
    arrange({ tournament: FINISHED })
    await expect(broadcastTournamentSummary(CLAN_ID, TOURNAMENT_ID)).resolves.toEqual({ final: true })
    expect(sendDiscordWebhook).toHaveBeenCalledWith(CLAN_WEBHOOK, expect.objectContaining({ embeds: expect.any(Array) }))
    expect(prisma.discordNotificationLog.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { clanId: CLAN_ID, kind: 'tournament_summary', refId: TOURNAMENT_ID } })
    )
  })
})
