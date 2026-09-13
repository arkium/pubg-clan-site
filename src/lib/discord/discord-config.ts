export type DiscordMentionType = 'none' | 'here' | 'everyone' | 'role'

export type DiscordMention = {
  type: DiscordMentionType
  roleId: string
}

// Les modes et types de match refletent les valeurs reellement stockees en base
// (SquadMatch.matchType : official | casual | airoyale | custom). Il n'existe
// pas de mode solo cote SquadMatch : le detecteur d'escouade exige au moins
// deux membres du clan pour creer une ligne (voir squad-detector.ts).
export type DiscordTeamMode = 'duo' | 'trio' | 'squad'
export type DiscordMatchType = 'official' | 'casual' | 'airoyale' | 'custom'

export const DISCORD_TEAM_MODES: DiscordTeamMode[] = ['duo', 'trio', 'squad']
export const DISCORD_MATCH_TYPES: DiscordMatchType[] = ['official', 'casual', 'airoyale', 'custom']
export const DISCORD_MIN_CLAN_MEMBERS_CHOICES = [2, 3, 4] as const

export type DiscordTop1Settings = {
  enabled: boolean
  webhookUrl: string
  teamModes: Record<DiscordTeamMode, boolean>
  matchTypes: Record<DiscordMatchType, boolean>
  minClanMembers: number
  mention: DiscordMention
}

export type DiscordTournamentSettings = {
  enabled: boolean
  webhookUrl: string
  mention: DiscordMention
  includeStandings: boolean
}

export type DiscordSettings = {
  top1: DiscordTop1Settings
  tournament: DiscordTournamentSettings
}

export const DEFAULT_DISCORD_SETTINGS: DiscordSettings = {
  top1: {
    enabled: false,
    webhookUrl: '',
    teamModes: { duo: true, trio: true, squad: true },
    matchTypes: { official: true, casual: true, airoyale: false, custom: false },
    minClanMembers: 2,
    mention: { type: 'none', roleId: '' },
  },
  tournament: {
    enabled: false,
    webhookUrl: '',
    mention: { type: 'none', roleId: '' },
    includeStandings: true,
  },
}

const WEBHOOK_URL_PATTERN = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/

export function isValidDiscordWebhookUrl(value: string) {
  return WEBHOOK_URL_PATTERN.test(value.trim())
}

function asBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function normalizeMention(value: unknown): DiscordMention {
  const raw = asRecord(value)
  const type = raw.type
  const roleId = typeof raw.roleId === 'string' ? raw.roleId.replace(/\D/g, '').slice(0, 20) : ''

  if (type === 'here' || type === 'everyone') {
    return { type, roleId: '' }
  }

  if (type === 'role' && roleId) {
    return { type: 'role', roleId }
  }

  return { type: 'none', roleId: '' }
}

function normalizeMinClanMembers(value: unknown) {
  const parsed = Number(value)
  return (DISCORD_MIN_CLAN_MEMBERS_CHOICES as readonly number[]).includes(parsed)
    ? parsed
    : DEFAULT_DISCORD_SETTINGS.top1.minClanMembers
}

export function normalizeWebhookUrl(value: unknown) {
  return typeof value === 'string' ? value.trim().slice(0, 500) : ''
}

export function normalizeDiscordSettings(value: unknown): DiscordSettings {
  const root = asRecord(value)
  const top1Defaults = DEFAULT_DISCORD_SETTINGS.top1
  const tournamentDefaults = DEFAULT_DISCORD_SETTINGS.tournament
  const top1 = asRecord(root.top1)
  const tournament = asRecord(root.tournament)
  const teamModes = asRecord(top1.teamModes)
  const matchTypes = asRecord(top1.matchTypes)

  return {
    top1: {
      enabled: asBoolean(top1.enabled, top1Defaults.enabled),
      webhookUrl: normalizeWebhookUrl(top1.webhookUrl),
      teamModes: Object.fromEntries(
        DISCORD_TEAM_MODES.map((mode) => [mode, asBoolean(teamModes[mode], top1Defaults.teamModes[mode])])
      ) as Record<DiscordTeamMode, boolean>,
      matchTypes: Object.fromEntries(
        DISCORD_MATCH_TYPES.map((type) => [type, asBoolean(matchTypes[type], top1Defaults.matchTypes[type])])
      ) as Record<DiscordMatchType, boolean>,
      minClanMembers: normalizeMinClanMembers(top1.minClanMembers),
      mention: normalizeMention(top1.mention),
    },
    tournament: {
      enabled: asBoolean(tournament.enabled, tournamentDefaults.enabled),
      webhookUrl: normalizeWebhookUrl(tournament.webhookUrl),
      mention: normalizeMention(tournament.mention),
      includeStandings: asBoolean(tournament.includeStandings, tournamentDefaults.includeStandings),
    },
  }
}

export function renderDiscordMention(mention: DiscordMention) {
  if (mention.type === 'here') return '@here'
  if (mention.type === 'everyone') return '@everyone'
  if (mention.type === 'role' && mention.roleId) return `<@&${mention.roleId}>`
  return ''
}

export function isDiscordMatchType(value: string): value is DiscordMatchType {
  return (DISCORD_MATCH_TYPES as string[]).includes(value)
}
