import { prisma } from '@/lib/prisma'

import {
  DEFAULT_DISCORD_SETTINGS,
  normalizeDiscordSettings,
  type DiscordSettings,
} from '@/lib/discord/discord-config'

const DISCORD_SETTINGS_KEY = 'discord_notifications'

export async function getDiscordSettings(clanId: number): Promise<DiscordSettings> {
  const record = await prisma.clanConfig.findUnique({
    where: { clanId_key: { clanId, key: DISCORD_SETTINGS_KEY } },
    select: { value: true },
  })

  if (!record?.value) {
    return DEFAULT_DISCORD_SETTINGS
  }

  try {
    return normalizeDiscordSettings(JSON.parse(record.value))
  } catch {
    return DEFAULT_DISCORD_SETTINGS
  }
}

export async function updateDiscordSettings(clanId: number, input: unknown): Promise<DiscordSettings> {
  const settings = normalizeDiscordSettings(input)
  const value = JSON.stringify(settings)

  await prisma.clanConfig.upsert({
    where: { clanId_key: { clanId, key: DISCORD_SETTINGS_KEY } },
    update: { value },
    create: { clanId, key: DISCORD_SETTINGS_KEY, value },
  })

  return settings
}
