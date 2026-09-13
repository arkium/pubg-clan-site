import { z } from 'zod'

import { isValidDiscordWebhookUrl } from '@/lib/discord/discord-config'
import { getDiscordSettings, updateDiscordSettings } from '@/lib/discord/discord-config-service'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/middleware/auth-permission'

const MentionSchema = z.object({
  type: z.enum(['none', 'here', 'everyone', 'role']),
  roleId: z.string().trim().max(20),
})

const Top1Schema = z.object({
  enabled: z.boolean(),
  webhookUrl: z.string().trim().max(500),
  teamModes: z.object({
    duo: z.boolean(),
    trio: z.boolean(),
    squad: z.boolean(),
  }),
  matchTypes: z.object({
    official: z.boolean(),
    casual: z.boolean(),
    airoyale: z.boolean(),
    custom: z.boolean(),
  }),
  minClanMembers: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  mention: MentionSchema,
})

const TournamentSchema = z.object({
  enabled: z.boolean(),
  webhookUrl: z.string().trim().max(500),
  mention: MentionSchema,
  includeStandings: z.boolean(),
})

const WEBHOOK_FORMAT_MESSAGE =
  'Le webhook doit commencer par https://discord.com/api/webhooks/ ou https://discordapp.com/api/webhooks/'
const ROLE_ID_MESSAGE = 'L’identifiant de rôle Discord doit être numérique'

function hasUsableWebhook(value: string) {
  return value.length === 0 || isValidDiscordWebhookUrl(value)
}

function hasValidMention(mention: { type: string; roleId: string }) {
  return mention.type !== 'role' || /^\d{5,20}$/.test(mention.roleId)
}

const UpdateDiscordSettingsSchema = z
  .object({ top1: Top1Schema, tournament: TournamentSchema })
  .refine(({ top1 }) => hasUsableWebhook(top1.webhookUrl), {
    message: WEBHOOK_FORMAT_MESSAGE,
    path: ['top1', 'webhookUrl'],
  })
  .refine(({ top1 }) => !top1.enabled || top1.webhookUrl.length > 0, {
    message: 'Renseignez une URL de webhook avant d’activer les alertes Top 1',
    path: ['top1', 'webhookUrl'],
  })
  .refine(({ top1 }) => hasValidMention(top1.mention), {
    message: ROLE_ID_MESSAGE,
    path: ['top1', 'mention', 'roleId'],
  })
  .refine(({ tournament }) => hasUsableWebhook(tournament.webhookUrl), {
    message: WEBHOOK_FORMAT_MESSAGE,
    path: ['tournament', 'webhookUrl'],
  })
  .refine(({ tournament }) => !tournament.enabled || tournament.webhookUrl.length > 0, {
    message: 'Renseignez une URL de webhook avant d’activer les annonces de tournoi',
    path: ['tournament', 'webhookUrl'],
  })
  .refine(({ tournament }) => hasValidMention(tournament.mention), {
    message: ROLE_ID_MESSAGE,
    path: ['tournament', 'mention', 'roleId'],
  })

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(request: Request, { params }: { params: Promise<{ clanId: string }> }) {
  const { clanId: clanIdParam } = await params
  const clanId = parseClanId(clanIdParam)

  if (!clanId) {
    return Response.json({ error: 'Invalid clan id' }, { status: 400 })
  }

  const permissionError = await requirePermission('manage_settings')(request, { clanId })
  if (permissionError) return permissionError

  try {
    const [settings, clan] = await Promise.all([
      getDiscordSettings(clanId),
      prisma.clan.findUnique({ where: { id: clanId }, select: { name: true, tag: true } }),
    ])

    return Response.json({
      settings,
      clanLabel: clan ? `[${clan.tag}] ${clan.name}` : null,
    })
  } catch (error) {
    console.error('[discord] Lecture de la configuration impossible:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ clanId: string }> }) {
  const { clanId: clanIdParam } = await params
  const clanId = parseClanId(clanIdParam)

  if (!clanId) {
    return Response.json({ error: 'Invalid clan id' }, { status: 400 })
  }

  const permissionError = await requirePermission('manage_settings')(request, { clanId })
  if (permissionError) return permissionError

  const body = (await request.json().catch(() => null)) as unknown
  const validated = UpdateDiscordSettingsSchema.safeParse(body)

  if (!validated.success) {
    return Response.json(
      { error: validated.error.issues[0]?.message ?? 'Invalid payload' },
      { status: 400 }
    )
  }

  try {
    const settings = await updateDiscordSettings(clanId, validated.data)
    return Response.json({ success: true, settings })
  } catch (error) {
    console.error('[discord] Sauvegarde de la configuration impossible:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
