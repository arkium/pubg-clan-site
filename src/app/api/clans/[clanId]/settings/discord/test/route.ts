import { z } from 'zod'

import { isValidDiscordWebhookUrl } from '@/lib/discord/discord-config'
import { sendDiscordTop1TestMessage } from '@/lib/discord/discord-service'
import { sendDiscordTournamentTestMessage } from '@/lib/discord/discord-tournament-service'
import { requirePermission } from '@/middleware/auth-permission'

const TestWebhookSchema = z.object({
  webhookUrl: z.string().trim().max(500),
  kind: z.enum(['top1', 'tournament']).default('top1'),
})

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function POST(request: Request, { params }: { params: Promise<{ clanId: string }> }) {
  const { clanId: clanIdParam } = await params
  const clanId = parseClanId(clanIdParam)

  if (!clanId) {
    return Response.json({ error: 'Invalid clan id' }, { status: 400 })
  }

  const permissionError = await requirePermission('manage_settings')(request, { clanId })
  if (permissionError) return permissionError

  const body = (await request.json().catch(() => null)) as unknown
  const validated = TestWebhookSchema.safeParse(body)

  if (!validated.success || !isValidDiscordWebhookUrl(validated.data.webhookUrl)) {
    return Response.json(
      { error: 'URL de webhook Discord invalide' },
      { status: 400 }
    )
  }

  try {
    const send =
      validated.data.kind === 'tournament'
        ? sendDiscordTournamentTestMessage
        : sendDiscordTop1TestMessage
    const result = await send(clanId, validated.data.webhookUrl)

    if (!result.ok) {
      return Response.json(
        { error: `Discord a refusé l'envoi${result.status ? ` (${result.status})` : ''} : ${result.error}` },
        { status: 502 }
      )
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('[discord] Test du webhook impossible:', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
