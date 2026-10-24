import { gameModeDisplayName } from '@/lib/game-mode-label-service'
import { getMapLabels, mapDisplayName } from '@/lib/map-label-service'
import { prisma } from '@/lib/prisma'
import {
  computeTournamentModeStandings,
  getTournamentForClan,
  getTournamentMatches,
  getTrackedTournamentClanIds,
  normalizeTournamentRules,
} from '@/lib/tournament-service'
import { TOURNAMENT_MODE_DESCRIPTIONS } from '@/lib/tournament-guide'
import { participantForm, resolveTournamentPhase } from '@/lib/tournament-mode-display'
import { formatTournamentPeriod } from '@/lib/tournament-schedule'
import {
  buildRoundViews,
  buildSquadBreakdown,
  buildSquadRounds,
  buildStandingViews,
  clanLabel as standingClanLabel,
  pickMvp,
  type ClanDirectory,
  type MemberDirectory,
} from '@/lib/tournament-standings-view'

import { sendDiscordWebhook, type DiscordWebhookPayload } from '@/lib/discord/discord-client'
import { isValidDiscordWebhookUrl, renderDiscordMention } from '@/lib/discord/discord-config'
import { getDiscordSettings } from '@/lib/discord/discord-config-service'
import { getPublicSiteBaseUrl } from '@/lib/public-base-url'
import {
  buildTournamentRoundWebhookPayload,
  buildTournamentSquadStandingsWebhookPayload,
  buildTournamentSummaryWebhookPayload,
  type TournamentRoundMvp,
} from '@/lib/discord/discord-tournament-embed'

const TOURNAMENT_ROUND_KIND = 'tournament_round'
/** Classement par escouade d'un tournoi : une entrée par tournoi (`refId` = identifiant du tournoi). */
const TOURNAMENT_SQUADS_KIND = 'tournament_squads'
/** Résumé du tournoi (2026-10-24) : une entrée par tournoi (`refId` = identifiant du tournoi). */
const TOURNAMENT_SUMMARY_KIND = 'tournament_summary'

const NO_WEBHOOK_MESSAGE =
  'Aucun webhook Discord valide pour les tournois : renseigne-le dans les paramètres Discord du clan ou sur ce tournoi.'

export class DiscordTournamentError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.status = status
  }
}

export type TournamentRoundBroadcast = {
  payload: DiscordWebhookPayload
  /**
   * `null` sans webhook valide : l'aperçu reste servi, pour que l'organisateur copie le message et le colle lui-même
   * dans Discord (2026-10-24) ; seul l'envoi est refusé.
   */
  webhookUrl: string | null
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
  eligibleClanIds: number[],
  labels: Map<number, string>
): TournamentRoundMvp | null {
  const allowed = new Set(eligibleClanIds)
  const candidates = match.members.filter(
    (member) => member.member.clanId !== null && allowed.has(member.member.clanId)
  )

  if (candidates.length === 0) return null

  const best = candidates.reduce((leader, member) => {
    if (member.damage !== leader.damage) return member.damage > leader.damage ? member : leader
    return member.kills > leader.kills ? member : leader
  })

  return {
    memberId: best.member.id,
    displayName: best.member.displayName,
    clanLabel: labels.get(best.member.clanId as number) ?? 'Clan inconnu',
    kills: best.kills,
    damage: best.damage,
  }
}

function resolveWebhookUrl(
  tournamentWebhookUrl: string | null,
  clanWebhookUrl: string
): { webhookUrl: string | null; usesTournamentOverride: boolean } {
  const override = (tournamentWebhookUrl ?? '').trim()

  if (isValidDiscordWebhookUrl(override)) {
    return { webhookUrl: override, usesTournamentOverride: true }
  }

  return { webhookUrl: isValidDiscordWebhookUrl(clanWebhookUrl) ? clanWebhookUrl : null, usesTournamentOverride: false }
}

/**
 * Envoie un message préparé puis note sa diffusion. Une rediffusion volontaire est autorisée : la date est mise à jour
 * au lieu de bloquer sur l'unique.
 */
async function sendAndRecord(
  clanId: number,
  kind: string,
  refId: string,
  prepared: { webhookUrl: string | null; payload: DiscordWebhookPayload }
) {
  if (!prepared.webhookUrl) throw new DiscordTournamentError(NO_WEBHOOK_MESSAGE)
  const result = await sendDiscordWebhook(prepared.webhookUrl, prepared.payload)

  if (!result.ok) {
    throw new DiscordTournamentError(
      `Discord a refusé l'envoi${result.status ? ` (${result.status})` : ''} : ${result.error}`,
      502
    )
  }

  await prisma.discordNotificationLog.upsert({
    where: { clanId_kind_refId: { clanId, kind, refId } },
    update: { sentAt: new Date() },
    create: { clanId, kind, refId },
  })
}

/** Manches du tournoi dans l'ordre chronologique : la manche #1 est la plus ancienne. */
async function chronologicalMatches(tournamentId: string) {
  return [...(await getTournamentMatches(tournamentId))].sort(
    (left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
  )
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

  const matches = await chronologicalMatches(tournamentId)
  const roundIndex = matches.findIndex((match) => match.id === squadMatchId)

  if (roundIndex === -1) {
    throw new DiscordTournamentError('Cette manche ne fait pas partie du tournoi.', 404)
  }

  const match = matches[roundIndex]
  const participatingClanIds = getTrackedTournamentClanIds(matches)
  const rules = normalizeTournamentRules(tournament.rules as Record<string, unknown>)
  const memberIds = [...new Set(matches.flatMap((entry) => entry.members.map((row) => row.memberId)))]

  const [clans, clanMembers, mapLabels, sentLog] = await Promise.all([
    prisma.clan.findMany({
      where: { id: { in: [...new Set([...participatingClanIds, tournament.organizerClanId])] } },
      select: { id: true, name: true, tag: true },
    }),
    memberIds.length > 0
      ? prisma.clanMember.findMany({
          where: { id: { in: memberIds } },
          select: { id: true, displayName: true, clanId: true },
        })
      : Promise.resolve([]),
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
  const labels = new Map(clans.map((clan) => [clan.id, clanLabel(clansById.get(clan.id), clan.id)]))

  const clanDirectory: ClanDirectory = Object.fromEntries(
    clans.map((clan) => [clan.id, { name: clan.name, tag: clan.tag }])
  )
  const memberDirectory: MemberDirectory = Object.fromEntries(
    clanMembers.map((member) => [member.id, { displayName: member.displayName, clanId: member.clanId }])
  )

  // Même découpage que la page de détail : le participant est un clan, une équipe ou un joueur selon le mode.
  const round = buildRoundViews(
    [match],
    participatingClanIds,
    rules,
    clanDirectory,
    memberDirectory,
    tournament.organizerClanId
  )[0]

  if (!round || round.scores.length === 0) {
    throw new DiscordTournamentError('Aucun participant suivi n’est classé sur cette manche.')
  }

  const standings = tournamentSettings.includeStandings
    ? buildStandingViews(
        computeTournamentModeStandings(matches, participatingClanIds, rules, tournament.organizerClanId),
        clanDirectory,
        memberDirectory
      ).map((standing) => ({
        label: standing.label,
        totalPoints: standing.totalPoints,
        totalKills: standing.totalKills,
      }))
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
    mode: rules.mode,
    mixedSquadRule: rules.mixedSquadRule,
    results: round.scores.map((score) => ({
      label: score.label,
      bestPlacement: score.bestPlacement,
      totalKills: score.totalKills,
      placementScore: score.placementScore,
      killScore: score.killScore,
      winBonus: score.winBonus,
      points: score.points,
      memberLabels: score.memberLabels,
    })),
    // En scrims internes, le MVP ne peut venir que du clan organisateur.
    mvp: findMvp(
      match,
      rules.mode === 'intra_clan' ? [tournament.organizerClanId] : participatingClanIds,
      labels
    ),
    standings,
    mention: renderDiscordMention(tournamentSettings.mention),
    siteUrl: getPublicSiteBaseUrl(),
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
  const tournament = await getTournamentForClan(clanId, tournamentId)

  const matches = await chronologicalMatches(tournamentId)

  const logs = await prisma.discordNotificationLog.findMany({
    where: {
      clanId,
      OR: [
        { kind: TOURNAMENT_ROUND_KIND, refId: { in: matches.map((match) => `${tournamentId}:${match.id}`) } },
        { kind: { in: [TOURNAMENT_SQUADS_KIND, TOURNAMENT_SUMMARY_KIND] }, refId: tournamentId },
      ],
    },
    select: { kind: true, refId: true, sentAt: true },
  })
  const sentByRefId = new Map(
    logs.filter((log) => log.kind === TOURNAMENT_ROUND_KIND).map((log) => [log.refId, log.sentAt])
  )
  const rules = normalizeTournamentRules(tournament.rules as Record<string, unknown>)

  return {
    rounds: matches.map((match, index) => ({
      squadMatchId: match.id,
      roundNumber: index + 1,
      mapName: match.mapName,
      gameMode: match.gameMode,
      playedAt: match.createdAt,
      sentAt: sentByRefId.get(`${tournamentId}:${match.id}`) ?? null,
    })),
    // Classement par escouade : proposé en inter-clans seulement, où le cumul par clan masque les escouades.
    squadStandings: {
      available: rules.mode === 'inter_clan' && matches.length > 0,
      sentAt: logs.find((log) => log.kind === TOURNAMENT_SQUADS_KIND)?.sentAt ?? null,
    },
    // Résumé du tournoi : provisoire pendant le tournoi, résultat final une fois terminé (proposé par défaut alors).
    summary: {
      available: matches.length > 0,
      final: resolveTournamentPhase(tournament) === 'finished',
      sentAt: logs.find((log) => log.kind === TOURNAMENT_SUMMARY_KIND)?.sentAt ?? null,
    },
  }
}

/**
 * Classement par escouade d'un tournoi inter-clans, prêt à diffuser (demande du 2026-10-11) : mêmes escouades, points et
 * places que le « détail par escouade » de la page, sans rien envoyer.
 */
export async function prepareTournamentSquadStandingsBroadcast(
  clanId: number,
  tournamentId: string
): Promise<Omit<TournamentRoundBroadcast, 'roundNumber'>> {
  const [{ tournament: tournamentSettings }, tournament] = await Promise.all([
    getDiscordSettings(clanId),
    getTournamentForClan(clanId, tournamentId),
  ])

  const { webhookUrl, usesTournamentOverride } = resolveWebhookUrl(
    tournament.discordWebhookUrl,
    tournamentSettings.webhookUrl
  )

  const rules = normalizeTournamentRules(tournament.rules as Record<string, unknown>)
  if (rules.mode !== 'inter_clan') {
    throw new DiscordTournamentError('Le classement par squad n’existe que pour un tournoi inter-clans.')
  }

  const matches = await chronologicalMatches(tournamentId)
  if (matches.length === 0) {
    throw new DiscordTournamentError('Aucune manche comptabilisée : rien à classer pour l’instant.')
  }

  const participatingClanIds = getTrackedTournamentClanIds(matches)
  const memberIds = [...new Set(matches.flatMap((entry) => entry.members.map((row) => row.memberId)))]
  const [clans, clanMembers, sentLog] = await Promise.all([
    prisma.clan.findMany({
      where: { id: { in: participatingClanIds } },
      select: { id: true, name: true, tag: true },
    }),
    prisma.clanMember.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, displayName: true, clanId: true },
    }),
    prisma.discordNotificationLog.findUnique({
      where: { clanId_kind_refId: { clanId, kind: TOURNAMENT_SQUADS_KIND, refId: tournamentId } },
      select: { sentAt: true },
    }),
  ])

  const clanDirectory: ClanDirectory = Object.fromEntries(clans.map((clan) => [clan.id, { name: clan.name, tag: clan.tag }]))
  const memberDirectory: MemberDirectory = Object.fromEntries(
    clanMembers.map((member) => [member.id, { displayName: member.displayName, clanId: member.clanId }])
  )
  const squadRounds = buildSquadRounds(matches, participatingClanIds, rules)
  const squads = buildSquadBreakdown(matches, participatingClanIds, rules, clanDirectory, memberDirectory)

  const payload = buildTournamentSquadStandingsWebhookPayload({
    tournamentId,
    tournamentTitle: tournament.title,
    totalRounds: matches.length,
    killPoints: rules.killPoints,
    winBonus: rules.winBonus,
    squads: squads.map((squad) => ({
      memberLabels: squad.memberLabels,
      totalPoints: squad.totalPoints,
      totalKills: squad.totalKills,
      wins: squad.wins,
      form: participantForm(squad.key, squadRounds).map((entry) => entry.placement),
    })),
    playedAt: new Date(matches[matches.length - 1].createdAt),
    mention: renderDiscordMention(tournamentSettings.mention),
    siteUrl: getPublicSiteBaseUrl(),
  })

  return {
    payload,
    webhookUrl,
    totalRounds: matches.length,
    usesTournamentOverride,
    alreadySentAt: sentLog?.sentAt ?? null,
  }
}

export async function broadcastTournamentSquadStandings(clanId: number, tournamentId: string) {
  const prepared = await prepareTournamentSquadStandingsBroadcast(clanId, tournamentId)
  await sendAndRecord(clanId, TOURNAMENT_SQUADS_KIND, tournamentId, prepared)
  return { totalRounds: prepared.totalRounds }
}

export async function broadcastTournamentRound(
  clanId: number,
  tournamentId: string,
  squadMatchId: string
) {
  const prepared = await prepareTournamentRoundBroadcast(clanId, tournamentId, squadMatchId)
  // Diffusion manuelle et confirmée par l'organisateur.
  await sendAndRecord(clanId, TOURNAMENT_ROUND_KIND, `${tournamentId}:${squadMatchId}`, prepared)
  return { roundNumber: prepared.roundNumber, totalRounds: prepared.totalRounds }
}

export type TournamentSummaryBroadcast = Omit<TournamentRoundBroadcast, 'roundNumber'> & {
  /** Tournoi terminé : « Résultat final » plutôt que « Résumé provisoire ». */
  final: boolean
}

/**
 * Résumé du tournoi, prêt à diffuser (2026-10-24) : classement selon le mode, MVP, vainqueur de chaque manche. Mêmes
 * chiffres que la page du tournoi (`computeTournamentModeStandings`, `buildRoundViews`, `pickMvp`).
 */
export async function prepareTournamentSummaryBroadcast(
  clanId: number,
  tournamentId: string
): Promise<TournamentSummaryBroadcast> {
  const [{ tournament: tournamentSettings }, tournament] = await Promise.all([
    getDiscordSettings(clanId),
    getTournamentForClan(clanId, tournamentId),
  ])
  const { webhookUrl, usesTournamentOverride } = resolveWebhookUrl(
    tournament.discordWebhookUrl,
    tournamentSettings.webhookUrl
  )

  const matches = await chronologicalMatches(tournamentId)
  if (matches.length === 0) {
    throw new DiscordTournamentError('Aucune manche comptabilisée : rien à résumer pour l’instant.')
  }

  const rules = normalizeTournamentRules(tournament.rules as Record<string, unknown>)
  const participatingClanIds = getTrackedTournamentClanIds(matches)
  const memberIds = [...new Set(matches.flatMap((entry) => entry.members.map((row) => row.memberId)))]
  const [clans, clanMembers, mapLabels, sentLog] = await Promise.all([
    prisma.clan.findMany({
      where: { id: { in: [...new Set([...participatingClanIds, tournament.organizerClanId])] } },
      select: { id: true, name: true, tag: true },
    }),
    prisma.clanMember.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, displayName: true, clanId: true },
    }),
    getMapLabels(),
    prisma.discordNotificationLog.findUnique({
      where: { clanId_kind_refId: { clanId, kind: TOURNAMENT_SUMMARY_KIND, refId: tournamentId } },
      select: { sentAt: true },
    }),
  ])

  const clanDirectory: ClanDirectory = Object.fromEntries(clans.map((clan) => [clan.id, { name: clan.name, tag: clan.tag }]))
  const memberDirectory: MemberDirectory = Object.fromEntries(
    clanMembers.map((member) => [member.id, { displayName: member.displayName, clanId: member.clanId }])
  )
  const standings = buildStandingViews(
    computeTournamentModeStandings(matches, participatingClanIds, rules, tournament.organizerClanId),
    clanDirectory,
    memberDirectory
  )
  const rounds = buildRoundViews(matches, participatingClanIds, rules, clanDirectory, memberDirectory, tournament.organizerClanId)
  // En scrims internes, le MVP ne peut venir que du clan organisateur.
  const mvpMatches =
    rules.mode === 'intra_clan'
      ? matches.map((match) => ({
          ...match,
          members: match.members.filter((row) => row.member.clanId === tournament.organizerClanId),
        }))
      : matches
  const final = resolveTournamentPhase(tournament) === 'finished'

  const payload = buildTournamentSummaryWebhookPayload({
    tournamentId,
    tournamentTitle: tournament.title,
    final,
    mode: rules.mode,
    mixedSquadRule: rules.mixedSquadRule,
    modeLabel: TOURNAMENT_MODE_DESCRIPTIONS.find((entry) => entry.value === rules.mode)?.shortLabel ?? rules.mode,
    periodLabel: formatTournamentPeriod(tournament.startDate, tournament.endDate),
    organizerLabel: standingClanLabel(tournament.organizerClanId, clanDirectory),
    standings: standings.map((standing) => ({
      label: standing.label,
      totalPoints: standing.totalPoints,
      totalKills: standing.totalKills,
      wins: standing.wins,
    })),
    mvp: pickMvp(mvpMatches, memberDirectory, clanDirectory),
    rounds: rounds.map((round) => ({
      index: round.index,
      mapLabel: round.mapName ? mapDisplayName(round.mapName, mapLabels) : 'Carte inconnue',
      gameModeLabel: round.gameMode ? gameModeDisplayName(round.gameMode) : 'Mode inconnu',
      winnerLabel: round.winnerLabel,
    })),
    lastPlayedAt: new Date(matches[matches.length - 1].createdAt),
    mention: renderDiscordMention(tournamentSettings.mention),
    siteUrl: getPublicSiteBaseUrl(),
  })

  return {
    payload,
    webhookUrl,
    totalRounds: matches.length,
    usesTournamentOverride,
    alreadySentAt: sentLog?.sentAt ?? null,
    final,
  }
}

export async function broadcastTournamentSummary(clanId: number, tournamentId: string) {
  const prepared = await prepareTournamentSummaryBroadcast(clanId, tournamentId)
  await sendAndRecord(clanId, TOURNAMENT_SUMMARY_KIND, tournamentId, prepared)
  return { final: prepared.final }
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
    mode: 'inter_clan',
    mixedSquadRule: 'full_share',
    results: [
      {
        label,
        bestPlacement: 1,
        totalKills: 8,
        placementScore: 15,
        killScore: 8,
        winBonus: 5,
        points: 28,
      },
      {
        label: '[BRV] Clan Bravo',
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
          { label, totalPoints: 28, totalKills: 8 },
          { label: '[BRV] Clan Bravo', totalPoints: 17, totalKills: 5 },
        ]
      : null,
    mention: renderDiscordMention(tournamentSettings.mention),
    siteUrl: getPublicSiteBaseUrl(),
  })

  return sendDiscordWebhook(webhookUrl, payload)
}
