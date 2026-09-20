import { z } from 'zod'

import { getSessionFromRequest } from '@/lib/auth-session'
import {
  getClanLifecycleSettings,
  resetClanLifecycleConfigCache,
  setClanLifecycleDiscordWebhookUrl,
  setClanLifecycleMode,
  setConfirmationsRequired,
  setMaxMovesRatioPercent,
  setUngroupedArchiveAfterDays,
  setUngroupedAutoArchive,
  setUngroupedAutoPromote,
} from '@/lib/clan-lifecycle/config'
import { listArchiveCandidates } from '@/lib/clan-lifecycle/ungrouped-archive'
import { prisma } from '@/lib/prisma'
import { PLAYER_CLAN_CHANGE_STATUSES } from '@/lib/player-clan-change'
import { requireSuperUser } from '@/middleware/auth-permission'

/**
 * Page SuperUser unique « Cycle de vie des clans » — chantier 5.
 *
 * `GET` renvoie tout ce dont la page a besoin en une fois : réglages, santé du
 * dernier passage et compteurs des onglets. Une seule requête plutôt que cinq, parce
 * que la page affiche les pastilles de tous les onglets dès le premier rendu.
 */

const SettingsPatchSchema = z.object({
  mode: z.enum(['observe', 'apply']).optional(),
  confirmationsRequired: z.number().int().min(1).max(10).optional(),
  maxMovesRatioPercent: z.number().int().min(1).max(100).optional(),
  archiveAfterDays: z.number().int().min(1).max(3650).optional(),
  autoArchive: z.boolean().optional(),
  autoPromote: z.boolean().optional(),
  webhookUrl: z.string().optional(),
})

/** Le webhook ne sort jamais en clair : la page n'a besoin que de savoir s'il existe. */
function maskWebhook(url: string | null) {
  if (!url) return null
  const parts = url.split('/')
  const id = parts[parts.length - 2] ?? '?'
  return `https://discord.com/api/webhooks/${id}/••••`
}

export async function GET(request: Request) {
  try {
    const permissionError = await requireSuperUser(request)
    if (permissionError) return permissionError

    const [settings, lastRun, recentRuns, candidates, counts] = await Promise.all([
      getClanLifecycleSettings(),
      prisma.clanLifecycleRun.findFirst({ orderBy: { startedAt: 'desc' } }),
      prisma.clanLifecycleRun.findMany({ orderBy: { startedAt: 'desc' }, take: 10 }),
      listArchiveCandidates(),
      Promise.all([
        prisma.playerClanChange.count({
          where: { status: PLAYER_CLAN_CHANGE_STATUSES.applied, acknowledgedAt: null },
        }),
        prisma.playerClanChange.count({ where: { status: PLAYER_CLAN_CHANGE_STATUSES.observed } }),
        prisma.playerClanChange.count({ where: { status: PLAYER_CLAN_CHANGE_STATUSES.pending } }),
        prisma.clan.count({ where: { isActive: false } }),
        prisma.clanMember.count({
          where: { isActive: true, joinStatus: 'active', clan: { is: { isSystem: true } } },
        }),
      ]),
    ])

    const [unacknowledged, observed, pending, pendingClans, ungroupedMembers] = counts

    return Response.json({
      settings: { ...settings, webhookUrl: maskWebhook(settings.webhookUrl) },
      health: {
        lastRun,
        recentRuns,
        // Coût quotidien du parking : un appel de promotion par membre et par jour.
        ungroupedDailyApiCalls: ungroupedMembers,
      },
      counters: {
        unacknowledged,
        observed,
        pending,
        pendingClans,
        ungroupedMembers,
        archiveCandidates: candidates.candidates.length,
      },
    })
  } catch (error) {
    console.error('Error loading clan lifecycle settings:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const permissionError = await requireSuperUser(request)
    if (permissionError) return permissionError

    const session = await getSessionFromRequest(request)
    const body = await request.json()
    const input = SettingsPatchSchema.parse(body)

    if (input.mode !== undefined) {
      await setClanLifecycleMode(input.mode)
      // Trace explicite : c'est la decision qui engage le plus.
      console.info(
        `[ClanLifecycle] Mode passe a "${input.mode}" par l'utilisateur ${session?.userId ?? '?'}`
      )
    }
    if (input.confirmationsRequired !== undefined) {
      await setConfirmationsRequired(input.confirmationsRequired)
    }
    if (input.maxMovesRatioPercent !== undefined) {
      await setMaxMovesRatioPercent(input.maxMovesRatioPercent)
    }
    if (input.archiveAfterDays !== undefined) {
      await setUngroupedArchiveAfterDays(input.archiveAfterDays)
    }
    if (input.autoArchive !== undefined) {
      await setUngroupedAutoArchive(input.autoArchive)
    }
    if (input.autoPromote !== undefined) {
      await setUngroupedAutoPromote(input.autoPromote)
    }
    if (input.webhookUrl !== undefined) {
      await setClanLifecycleDiscordWebhookUrl(input.webhookUrl)
    }

    resetClanLifecycleConfigCache()
    const settings = await getClanLifecycleSettings()

    return Response.json({
      success: true,
      settings: { ...settings, webhookUrl: maskWebhook(settings.webhookUrl) },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: 'Réglage invalide', details: error.issues }, { status: 400 })
    }
    if (error instanceof Error && error.message.includes('webhook')) {
      return Response.json({ error: error.message }, { status: 400 })
    }
    console.error('Error updating clan lifecycle settings:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
