import { gameModeDisplayName } from '@/lib/game-mode-label-service'
import { getMapLabels, mapDisplayName } from '@/lib/map-label-service'
import { prisma } from '@/lib/prisma'
import {
  computeTournamentRoundScores,
  computeTournamentStandings,
  getTournamentForClan,
  getTournamentMatches,
  getTrackedTournamentClanIds,
} from '@/lib/tournament-service'

import { sendDiscordWebhook, type DiscordWebhookPayload } from '@/lib/discord/discord-client'
import { isValidDiscordWebhookUrl, renderDiscordMention } from '@/lib/discord/discord-config'
import { getDiscordSettings } from '@/lib/discord/discord-config-service'
import { getSiteBaseUrl } from '@/lib/discord/discord-service'
import {
  buildTournamentRoundWebhookPayload,
  type TournamentRoundMvp,
} from '@/lib/discord/discord-tournament-embed'

const TOURNAMENT_ROUND_KIND = 'tournament_round'

export class DiscordTournamentError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export type TournamentRoundBroadcast = {
  payload: DiscordWebhookPayload
  webhookUrl: string
  roundNumber: number
  totalRounds: number
  usesTournamentOverride: boolean
  alreadySentAt: Date | null
}

type TournamentMatch = Awaited<ReturnType<typeof getTournamentMatches>>[number]

function clanLabel(clan: { name: string; tag: string } | undefined, clanId: number) {
  return clan ? `[${clan.tag}] ${clan.name}` : `Clan #${clanId}`
}

function findMvp(
  match: TournamentMatch,
  participatingClanIds: number[],
  labels: Map<number, string>
): TournamentRoundMvp | null {
  const allowed = new Set(participatingClanIds)
  const candidates = match.members.filter(
    (member) => member.member.clanId !== null && allowed.has(member.member.clanId)
  )

  if (candidates.length === 0) return null

  const best = candidates.reduce((leader, member) => {
    if (member.damage !== leader.damage) return member.damage > leader.damage ? member : leader
    return member.kills > leader.kills ? member : leader
  })

  return {
    displayName: best.member.displayName,
    clanLabel: labels.get(best.member.clanId as number) ?? 'Clan inconnu',
    kills: best.kills,
    damage: best.damage,
  }
}

function resolveWebhookUrl(
  tournamentWebhookUrl: string | null,
  clanWebhookUrl: string
): { webhookUrl: string; usesTournamentOverride: boolean } {
  const override = (tournamentWebhookUrl ?? '').trim()

  if (isValidDiscordWebhookUrl(override)) {
    return { webhookUrl: override, usesTournamentOverride: true }
  }

  return { webhookUrl: clanWebhookUrl, usesTournamentOverride: false }
}

/**
 * Assemble le message de resultats d'une manche sans rien envoyer : sert a la
 * fois a la modale de previsualisation et a la diffusion confirmee, pour que
 * l'owner valide exactement ce qui partira sur Discord.
 */
export async function prepareTournamentRoundBroadcast(
  clanId: number,
  tournamentId: string,
  squadMatchId: string
): Promise<TournamentRoundBroadcast> {
  const [{ tournament: tournamentSettings }, tournament] = await Promise.all([
    getDiscordSettings(clanId),
    getTournamentForClan(clanId, tournamentId),
  ])

  const { webhookUrl, usesTournamentOverride } = resolveWebhookUrl(
    tournament.discordWebhookUrl,
    tournamentSettings.webhookUrl
  )

  if (!isValidDiscordWebhookUrl(webhookUrl)) {
    throw new DiscordTournamentError(
      'Aucun webhook Discord valide pour les tournois : renseignez-le dans les paramètres Discord du clan ou sur ce tournoi.'
    )
  }

  // Ordre chronologique : la manche #1 est la plus ancienne du tournoi.
  const matches = [...(await getTournamentMatches(tournamentId))].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  )
  const roundIndex = matches.findIndex((match) => match.id === squadMatchId)

  if (roundIndex === -1) {
    throw new DiscordTournamentError('Cette manche ne fait pas partie du tournoi.', 404)
  }

  const match = matches[roundIndex]
  const participatingClanIds = getTrackedTournamentClanIds(matches)
  const roundScores = computeTournamentRoundScores(match, participatingClanIds, tournament.rules as Record<string, unknown>)

  if (roundScores.length === 0) {
    throw new DiscordTournamentError('Aucun clan suivi n’est classé sur cette manche.')
  }

  const [clans, mapLabels, sentLog] = await Promise.all([
    prisma.clan.findMany({
      where: { id: { in: participatingClanIds } },
      select: { id: true, name: true, tag: true },
    }),
    getMapLabels(),
    prisma.discordNotificationLog.findUnique({
      where: {
        clanId_kind_refId: {
          clanId,
          kind: TOURNAMENT_ROUND_KIND,
          refId: `${tournamentId}:${squadMatchId}`,
        },
      },
      select: { sentAt: true },
    }),
  ])

  const clansById = new Map(clans.map((clan) => [clan.id, clan]))
  const labels = new Map(
    participatingClanIds.map((id) => [id, clanLabel(clansById.get(id), id)])
  )

  const standings = tournamentSettings.includeStandings
    ? computeTournamentStandings(matches, participatingClanIds, tournament.rules as Record<string, unknown>).map(
        (standing) => ({
          clanLabel: labels.get(standing.clanId) ?? `Clan #${standing.clanId}`,
          totalPoints: standing.totalPoints,
          totalKills: standing.totalKills,
        })
      )
    : null

  const payload = buildTournamentRoundWebhookPayload({
    tournamentId,
    tournamentTitle: tournament.title,
    roundNumber: roundIndex + 1,
    totalRounds: matches.length,
    squadMatchId,
    telemetryClanId: match.members[0]?.member.clanId ?? null,
    mapLabel: match.mapName ? mapDisplayName(match.mapName, mapLabels) : 'Carte inconnue',
    gameModeLabel: match.gameMode ? gameModeDisplayName(match.gameMode) : 'Mode inconnu',
    playedAt: new Date(match.createdAt),
    results: roundScores.map((score) => ({
      ...score,
      clanLabel: labels.get(score.clanId) ?? `Clan #${score.clanId}`,
    })),
    mvp: findMvp(match, participatingClanIds, labels),
    standings,
    mention: renderDiscordMention(tournamentSettings.mention),
    siteUrl: getSiteBaseUrl(),
  })

  return {
    payload,
    webhookUrl,
    roundNumber: roundIndex + 1,
    totalRounds: matches.length,
    usesTournamentOverride,
    alreadySentAt: sentLog?.sentAt ?? null,
  }
}

export async function listTournamentRounds(clanId: number, tournamentId: string) {
  await getTournamentForClan(clanId, tournamentId)

  const matches = [...(await getTournamentMatches(tournamentId))].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  )

  const logs = await prisma.discordNotificationLog.findMany({
    where: {
      clanId,
      kind: TOURNAMENT_ROUND_KIND,
      refId: { in: matches.map((match) => `${tournamentId}:${match.id}`) },
    },
    select: { refId: true, sentAt: true },
  })
  const sentByRefId = new Map(logs.map((log) => [log.refId, log.sentAt]))

  return matches.map((match, index) => ({
    squadMatchId: match.id,
    roundNumber: index + 1,
    mapName: match.mapName,
    gameMode: match.gameMode,
    playedAt: match.createdAt,
    sentAt: sentByRefId.get(`${tournamentId}:${match.id}`) ?? null,
  }))
}

export async function broadcastTournamentRound(
  clanId: number,
  tournamentId: string,
  squadMatchId: string
) {
  const prepared = await prepareTournamentRoundBroadcast(clanId, tournamentId, squadMatchId)
  const result = await sendDiscordWebhook(prepared.webhookUrl, prepared.payload)

  if (!result.ok) {
    throw new DiscordTournamentError(
      `Discord a refusé l'envoi${result.status ? ` (${result.status})` : ''} : ${result.error}`,
      502
    )
  }

  // Diffusion manuelle et confirmee par l'owner : une rediffusion volontaire
  // est autorisee, on met donc la date a jour au lieu de bloquer sur l'unique.
  const refId = `${tournamentId}:${squadMatchId}`
  await prisma.discordNotificationLog.upsert({
    where: { clanId_kind_refId: { clanId, kind: TOURNAMENT_ROUND_KIND, refId } },
    update: { sentAt: new Date() },
    create: { clanId, kind: TOURNAMENT_ROUND_KIND, refId },
  })

  return { roundNumber: prepared.roundNumber, totalRounds: prepared.totalRounds }
}

export async function sendDiscordTournamentTestMessage(clanId: number, webhookUrl: string) {
  const [{ tournament: tournamentSettings }, clan] = await Promise.all([
    getDiscordSettings(clanId),
    prisma.clan.findUnique({ where: { id: clanId }, select: { name: true, tag: true } }),
  ])

  const label = clanLabel(clan ?? undefined, clanId)

  const payload = buildTournamentRoundWebhookPayload({
    tournamentId: 'test',
    tournamentTitle: 'Tournoi de démonstration',
    roundNumber: 1,
    totalRounds: 3,
    squadMatchId: 'test',
    telemetryClanId: null,
    mapLabel: 'Miramar',
    gameModeLabel: 'Squad FPP',
    playedAt: new Date(),
    results: [
      {
        clanId,
        clanLabel: label,
        bestPlacement: 1,
        totalKills: 8,
        placementScore: 15,
        killScore: 8,
        winBonus: 5,
        points: 28,
      },
      {
        clanId: 0,
        clanLabel: '[BRV] Clan Bravo',
        bestPlacement: 2,
        totalKills: 5,
        placementScore: 12,
        killScore: 5,
        winBonus: 0,
        points: 17,
      },
    ],
    mvp: { displayName: 'Joueur1', clanLabel: label, kills: 6, damage: 940 },
    standings: tournamentSettings.includeStandings
      ? [
          { clanLabel: label, totalPoints: 28, totalKills: 8 },
          { clanLabel: '[BRV] Clan Bravo', totalPoints: 17, totalKills: 5 },
        ]
      : null,
    mention: renderDiscordMention(tournamentSettings.mention),
    siteUrl: getSiteBaseUrl(),
  })

  return sendDiscordWebhook(webhookUrl, payload)
}
