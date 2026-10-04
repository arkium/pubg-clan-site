import { DEFAULT_LEAGUE_SETTINGS, type LeagueSettings } from '@/lib/clan-league'
import { mergeStoredLeagueSettings, sameLeagueSettings } from '@/lib/league-settings'
import { prisma } from '@/lib/prisma'

/**
 * Réglages de la Ligue Inter-Clans enregistrés par le SuperUser (/settings/league, docs/features/ligue-clans.md §5) :
 * une ligne `AppConfig` (clé `league_settings`, JSON), lue avec un cache de 30 s comme le débit de l'API PUBG. Sans
 * ligne, ou si la base ne répond pas : valeurs par défaut de `DEFAULT_LEAGUE_SETTINGS`. Aucune migration.
 */

export const LEAGUE_SETTINGS_KEY = 'league_settings'
const CACHE_TTL_MS = 30_000

export type LeagueSettingsState = {
  settings: LeagueSettings
  /** Dernier enregistrement ; `null` : jamais réglé (valeurs par défaut). */
  updatedAt: string | null
  updatedBy: string | null
  /** Les réglages en vigueur sont ceux par défaut. */
  isDefault: boolean
}

type StoredValue = { settings?: unknown; updatedAt?: unknown; updatedBy?: unknown }

let cached: { expiresAt: number; state: LeagueSettingsState } | null = null

function stateOf(raw: string | null | undefined): LeagueSettingsState {
  if (!raw) return { settings: mergeStoredLeagueSettings(null), updatedAt: null, updatedBy: null, isDefault: true }
  let stored: StoredValue = {}
  try {
    stored = JSON.parse(raw) as StoredValue
  } catch {
    stored = {}
  }
  const settings = mergeStoredLeagueSettings(stored.settings)
  return {
    settings,
    updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : null,
    updatedBy: typeof stored.updatedBy === 'string' ? stored.updatedBy : null,
    isDefault: sameLeagueSettings(settings, DEFAULT_LEAGUE_SETTINGS),
  }
}

export async function getLeagueSettingsState(): Promise<LeagueSettingsState> {
  const now = Date.now()
  if (cached && cached.expiresAt > now) return cached.state
  let state: LeagueSettingsState
  try {
    const record = await prisma.appConfig.findUnique({ where: { key: LEAGUE_SETTINGS_KEY }, select: { value: true } })
    state = stateOf(record?.value)
  } catch (error) {
    // La ligue publique ne tombe pas avec la table de réglages : valeurs par défaut.
    console.error('League settings: lecture impossible, valeurs par défaut', error)
    state = stateOf(null)
  }
  cached = { expiresAt: now + CACHE_TTL_MS, state }
  return state
}

export async function getLeagueSettings(): Promise<LeagueSettings> {
  return (await getLeagueSettingsState()).settings
}

/** Enregistre des réglages déjà validés (`validateLeagueSettings`) ; la ligue est recalculée au prochain appel. */
export async function saveLeagueSettings(settings: LeagueSettings, updatedBy: string | null, now = new Date()): Promise<LeagueSettingsState> {
  const value = JSON.stringify({ settings, updatedAt: now.toISOString(), updatedBy })
  await prisma.appConfig.upsert({
    where: { key: LEAGUE_SETTINGS_KEY },
    update: { value },
    create: { key: LEAGUE_SETTINGS_KEY, value },
  })
  const state = stateOf(value)
  cached = { expiresAt: Date.now() + CACHE_TTL_MS, state }
  return state
}

export function invalidateLeagueSettingsCache() {
  cached = null
}
