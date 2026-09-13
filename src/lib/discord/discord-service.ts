import { prisma } from '@/lib/prisma'
import { gameModeDisplayName } from '@/lib/game-mode-label-service'
import { getMapLabels, mapDisplayName } from '@/lib/map-label-service'
import { teamModeFromMemberCount } from '@/lib/team-mode'

import { sendDiscordWebhook, type DiscordSendResult } from '@/lib/discord/discord-client'
import {
  isDiscordMatchType,
  isValidDiscordWebhookUrl,
  renderDiscordMention,
} from '@/lib/discord/discord-config'
import { getDiscordSettings } from '@/lib/discord/discord-config-service'
import { buildTop1WebhookPayload } from '@/lib/discord/discord-top1-embed'

const TOP1_KIND = 'top1'

const MATCH_TYPE_LABELS: Record<string, string> = {
  official: 'Match officiel',
  casual: 'Match casual',
  airoyale: 'Match IA',
  custom: 'Partie personnalisée',
}

export type DiscordNotifyResult =
  | { sent: true }
  | { sent: false; reason: string }

export function getSiteBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? '').trim().replace(/\/+$/, '')
}

function isUniqueConstraintError(error: unknown) {
  return (error as { code?: string } | null)?.code === 'P2002'
}

/**
 * Pose le verrou de dedoublonnage. La contrainte unique
 * (clanId, kind, refId) garantit qu'un seul appelant peut le poser, meme si
 * une re-synchronisation repasse sur le meme match.
 */
async function claimNotification(clanId: number, kind: string, refId: string) {
  try {
    await prisma.discordNotificationLog.create({ data: { clanId, kind, refId } })
    return true
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      return false
    }
    throw error
  }
}

async function releaseNotification(clanId: number, kind: string, refId: string) {
  await prisma.discordNotificationLog
    .deleteMany({ where: { clanId, kind, refId } })
    .catch(() => undefined)
}

async function loadTop1Context(clanId: number, squadMatchId: string) {
  const [squadMatch, clan] = await Promise.all([
    prisma.squadMatch.findUnique({
      where: { id: squadMatchId },
      select: {
        id: true,
        placement: true,
        matchType: true,
        gameMode: true,
        mapName: true,
        createdAt: true,
        members: {
          where: { member: { clanId } },
          select: {
            kills: true,
            damage: true,
            assists: true,
            revives: true,
            timeSurvived: true,
            member: { select: { displayName: true } },
          },
          orderBy: { kills: 'desc' },
        },
      },
    }),
    prisma.clan.findUnique({ where: { id: clanId }, select: { name: true, tag: true } }),
  ])

  return { squadMatch, clan }
}

/**
 * Publie l'alerte Chicken Dinner si le match remplit les criteres configures
 * par le clan. Ne leve jamais : un echec Discord ne doit jamais faire echouer
 * la synchronisation PUBG appelante.
 */
export async function notifyTop1IfEligible(
  clanId: number,
  squadMatchId: string
): Promise<DiscordNotifyResult> {
  try {
    const { top1 } = await getDiscordSettings(clanId)

    if (!top1.enabled) return { sent: false, reason: 'disabled' }
    if (!isValidDiscordWebhookUrl(top1.webhookUrl)) return { sent: false, reason: 'no-webhook' }

    const { squadMatch, clan } = await loadTop1Context(clanId, squadMatchId)

    if (!squadMatch || !clan) return { sent: false, reason: 'not-found' }
    if (squadMatch.placement !== 1) return { sent: false, reason: 'not-a-win' }

    if (!isDiscordMatchType(squadMatch.matchType) || !top1.matchTypes[squadMatch.matchType]) {
      return { sent: false, reason: 'match-type-filtered' }
    }

    const memberCount = squadMatch.members.length
    if (memberCount < top1.minClanMembers) {
      return { sent: false, reason: 'below-member-threshold' }
    }

    if (!top1.teamModes[teamModeFromMemberCount(memberCount)]) {
      return { sent: false, reason: 'team-mode-filtered' }
    }

    if (!(await claimNotification(clanId, TOP1_KIND, squadMatchId))) {
      return { sent: false, reason: 'already-sent' }
    }

    const mapLabels = await getMapLabels()
    const payload = buildTop1WebhookPayload({
      clanId,
      clanName: clan.name,
      clanTag: clan.tag,
      squadMatchId: squadMatch.id,
      mapKey: squadMatch.mapName,
      mapLabel: mapDisplayName(squadMatch.mapName, mapLabels),
      gameModeLabel: gameModeDisplayName(squadMatch.gameMode),
      matchTypeLabel: MATCH_TYPE_LABELS[squadMatch.matchType] ?? squadMatch.matchType,
      playedAt: squadMatch.createdAt,
      members: squadMatch.members.map((member) => ({
        displayName: member.member.displayName,
        kills: member.kills,
        damage: member.damage,
        assists: member.assists,
        revives: member.revives,
        timeSurvived: member.timeSurvived,
      })),
      mention: renderDiscordMention(top1.mention),
      siteUrl: getSiteBaseUrl(),
    })

    const result = await sendDiscordWebhook(top1.webhookUrl, payload)

    if (!result.ok) {
      // Le verrou est relache pour qu'une re-synchronisation ulterieure puisse
      // retenter l'envoi apres une panne reseau ou un rate limit.
      await releaseNotification(clanId, TOP1_KIND, squadMatchId)
      console.error(`[discord] Envoi Top 1 echoue (clan ${clanId}, match ${squadMatchId}):`, result.error)
      return { sent: false, reason: 'send-failed' }
    }

    return { sent: true }
  } catch (error) {
    console.error(`[discord] Notification Top 1 interrompue (clan ${clanId}, match ${squadMatchId}):`, error)
    return { sent: false, reason: 'unexpected-error' }
  }
}

export async function sendDiscordTop1TestMessage(
  clanId: number,
  webhookUrl: string
): Promise<DiscordSendResult> {
  const [clan, { top1 }] = await Promise.all([
    prisma.clan.findUnique({ where: { id: clanId }, select: { name: true, tag: true } }),
    getDiscordSettings(clanId),
  ])

  const payload = buildTop1WebhookPayload({
    clanId,
    clanName: clan?.name ?? 'Clan',
    clanTag: clan?.tag ?? '???',
    squadMatchId: 'test',
    mapKey: 'Baltic_Main',
    mapLabel: 'Erangel',
    gameModeLabel: 'Squad FPP',
    matchTypeLabel: 'Message de test',
    playedAt: new Date(),
    members: [
      { displayName: 'Joueur1', kills: 7, damage: 820, assists: 2, revives: 0, timeSurvived: 1834 },
      { displayName: 'Joueur2', kills: 4, damage: 410, assists: 1, revives: 1, timeSurvived: 1834 },
    ],
    mention: renderDiscordMention(top1.mention),
    siteUrl: getSiteBaseUrl(),
  })

  return sendDiscordWebhook(webhookUrl, payload)
}
