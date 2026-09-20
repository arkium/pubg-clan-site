import { prisma } from '@/lib/prisma'
import type { LifecycleMode } from '@/lib/clan-lifecycle/safety'

/**
 * Réglages du cycle de vie de clan — tous dans `AppConfig`, donc éditables depuis
 * l'onglet « Paramètres » de la page SuperUser (chantier 5) sans redéploiement.
 * Même mécanique que `pubg-rate-limit-config-service.ts`.
 */

export const CLAN_LIFECYCLE_CONFIG_KEYS = {
  mode: 'clan_lifecycle_mode',
  maxMovesRatio: 'clan_lifecycle_max_moves_ratio',
  confirmationsRequired: 'clan_lifecycle_confirmations_required',
  discordWebhookUrl: 'clan_lifecycle_discord_webhook_url',
  discordMention: 'clan_lifecycle_discord_mention',
  ungroupedArchiveAfterDays: 'ungrouped_archive_after_days',
  ungroupedAutoArchive: 'ungrouped_auto_archive',
  ungroupedAutoPromote: 'ungrouped_auto_promote',
} as const

export const CLAN_LIFECYCLE_DEFAULTS = {
  /** Observation par défaut : passer en `apply` est une décision explicite. */
  mode: 'observe' as LifecycleMode,
  maxMovesRatio: 10,
  /** Mesuré le 2026-09-20 : N=2 aurait déclenché à tort sur un compte en transition. */
  confirmationsRequired: 3,
  ungroupedArchiveAfterDays: 90,
  ungroupedAutoArchive: false,
  ungroupedAutoPromote: true,
} as const

const CACHE_TTL_MS = 30_000

type CacheEntry = { value: string | null; expiresAt: number }
const cache = new Map<string, CacheEntry>()

/** Vide le cache — utilisé par les tests et après une écriture depuis l'UI. */
export function resetClanLifecycleConfigCache() {
  cache.clear()
}

async function readKey(key: string) {
  const now = Date.now()
  const cached = cache.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.value
  }

  try {
    const record = await prisma.appConfig.findUnique({ where: { key }, select: { value: true } })
    const value = record?.value ?? null
    cache.set(key, { value, expiresAt: now + CACHE_TTL_MS })
    return value
  } catch {
    // Une base indisponible ne doit pas faire basculer le cron en mode `apply` :
    // toutes les valeurs par défaut sont les plus prudentes.
    cache.set(key, { value: null, expiresAt: now + CACHE_TTL_MS })
    return null
  }
}

async function writeKey(key: string, value: string) {
  await prisma.appConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  })
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
}

function parseBoundedInt(raw: string | null, fallback: number, min: number, max: number) {
  if (raw === null) return fallback
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

function parseBoolean(raw: string | null, fallback: boolean) {
  if (raw === null) return fallback
  return raw === 'true' || raw === '1'
}

export async function getClanLifecycleMode(): Promise<LifecycleMode> {
  const raw = await readKey(CLAN_LIFECYCLE_CONFIG_KEYS.mode)
  // Tout ce qui n'est pas explicitement 'apply' reste en observation.
  return raw === 'apply' ? 'apply' : 'observe'
}

export async function setClanLifecycleMode(mode: LifecycleMode) {
  await writeKey(CLAN_LIFECYCLE_CONFIG_KEYS.mode, mode === 'apply' ? 'apply' : 'observe')
  return mode
}

export async function getMaxMovesRatioPercent() {
  return parseBoundedInt(
    await readKey(CLAN_LIFECYCLE_CONFIG_KEYS.maxMovesRatio),
    CLAN_LIFECYCLE_DEFAULTS.maxMovesRatio,
    1,
    100
  )
}

export async function getConfirmationsRequired() {
  return parseBoundedInt(
    await readKey(CLAN_LIFECYCLE_CONFIG_KEYS.confirmationsRequired),
    CLAN_LIFECYCLE_DEFAULTS.confirmationsRequired,
    1,
    10
  )
}

export async function getUngroupedArchiveAfterDays() {
  return parseBoundedInt(
    await readKey(CLAN_LIFECYCLE_CONFIG_KEYS.ungroupedArchiveAfterDays),
    CLAN_LIFECYCLE_DEFAULTS.ungroupedArchiveAfterDays,
    1,
    3650
  )
}

export async function getUngroupedAutoArchive() {
  return parseBoolean(
    await readKey(CLAN_LIFECYCLE_CONFIG_KEYS.ungroupedAutoArchive),
    CLAN_LIFECYCLE_DEFAULTS.ungroupedAutoArchive
  )
}

export async function getUngroupedAutoPromote() {
  return parseBoolean(
    await readKey(CLAN_LIFECYCLE_CONFIG_KEYS.ungroupedAutoPromote),
    CLAN_LIFECYCLE_DEFAULTS.ungroupedAutoPromote
  )
}

/** Webhook d'administration — vide signifie « aucune notification », sans erreur. */
export async function getClanLifecycleDiscordWebhookUrl() {
  const raw = await readKey(CLAN_LIFECYCLE_CONFIG_KEYS.discordWebhookUrl)
  const trimmed = raw?.trim() ?? ''
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Ecritures — utilisees par l'onglet « Parametres » du chantier 5 et par les scripts
 * de mise en service. Chaque setter borne sa valeur comme le getter correspondant,
 * pour qu'une saisie hors plage ne puisse pas s'installer en base.
 */

export async function setMaxMovesRatioPercent(value: number) {
  const bounded = Math.min(100, Math.max(1, Math.floor(value)))
  await writeKey(CLAN_LIFECYCLE_CONFIG_KEYS.maxMovesRatio, String(bounded))
  return bounded
}

export async function setConfirmationsRequired(value: number) {
  const bounded = Math.min(10, Math.max(1, Math.floor(value)))
  await writeKey(CLAN_LIFECYCLE_CONFIG_KEYS.confirmationsRequired, String(bounded))
  return bounded
}

export async function setUngroupedArchiveAfterDays(value: number) {
  const bounded = Math.min(3650, Math.max(1, Math.floor(value)))
  await writeKey(CLAN_LIFECYCLE_CONFIG_KEYS.ungroupedArchiveAfterDays, String(bounded))
  return bounded
}

export async function setUngroupedAutoArchive(value: boolean) {
  await writeKey(CLAN_LIFECYCLE_CONFIG_KEYS.ungroupedAutoArchive, value ? 'true' : 'false')
  return value
}

export async function setUngroupedAutoPromote(value: boolean) {
  await writeKey(CLAN_LIFECYCLE_CONFIG_KEYS.ungroupedAutoPromote, value ? 'true' : 'false')
  return value
}

/**
 * Enregistre le webhook d'administration. Une chaine vide **efface** le reglage :
 * c'est la facon de couper les notifications sans supprimer la ligne de config.
 * L'URL est validee par `isValidDiscordWebhookUrl`, partagee avec la configuration
 * Discord par clan — pas de seconde regle de validation qui pourrait diverger.
 */
export async function setClanLifecycleDiscordWebhookUrl(rawUrl: string) {
  const trimmed = rawUrl.trim()

  if (trimmed.length === 0) {
    await writeKey(CLAN_LIFECYCLE_CONFIG_KEYS.discordWebhookUrl, '')
    return null
  }

  const { isValidDiscordWebhookUrl, normalizeWebhookUrl } = await import('@/lib/discord/discord-config')

  const normalized = normalizeWebhookUrl(trimmed)
  if (typeof normalized !== 'string' || !isValidDiscordWebhookUrl(normalized)) {
    throw new Error("URL de webhook Discord invalide — attendu https://discord.com/api/webhooks/...")
  }

  await writeKey(CLAN_LIFECYCLE_CONFIG_KEYS.discordWebhookUrl, normalized)
  return normalized
}

/** Lit tous les réglages en une fois, pour l'onglet « Paramètres ». */
export async function getClanLifecycleSettings() {
  const [mode, maxMovesRatioPercent, confirmationsRequired, archiveAfterDays, autoArchive, autoPromote, webhookUrl] =
    await Promise.all([
      getClanLifecycleMode(),
      getMaxMovesRatioPercent(),
      getConfirmationsRequired(),
      getUngroupedArchiveAfterDays(),
      getUngroupedAutoArchive(),
      getUngroupedAutoPromote(),
      getClanLifecycleDiscordWebhookUrl(),
    ])

  return {
    mode,
    maxMovesRatioPercent,
    confirmationsRequired,
    archiveAfterDays,
    autoArchive,
    autoPromote,
    webhookUrl,
  }
}
