import { COACH_DEFAULT_MODEL_ID, isCoachModelId } from '@/lib/coach/coach-models'
import { prisma } from '@/lib/prisma'

/**
 * Réglages du Coach IA (docs/TODO/chatbot-ia.md §4.2) : valeur dans `AppConfig`, repli sur l'environnement puis sur
 * la valeur par défaut, cache de 30 s — même mécanique que `pubg-rate-limit-config-service.ts`. Le Coach est **fermé
 * par défaut** : le SuperUser l'ouvre depuis `/settings/coach` (lot 7). La clé d'API, elle, ne vient que du `.env`
 * (`GEMINI_API_KEY`) et ne sort jamais de ce module.
 */

export type CoachSettings = {
  /** Interrupteur général : fermé = aucun appel au modèle, tiroir en « pause ». */
  enabled: boolean
  /** Règles apprises (lot 10) : bloc « Règles du site » du prompt, écrit par le SuperUser. Fermé par défaut. */
  rulesEnabled: boolean
  /** Mémoire personnelle (lot 11) : outil `rememberAboutMe` et bloc « Ce que tu sais de ce joueur ». Fermée par défaut. */
  memoryEnabled: boolean
  /** Identifiant du catalogue `coach-models.ts`. */
  model: string
  /** Budget mensuel par compte, en euros (mois calendaire de Paris). */
  budgetPerAccountEur: number
  /** Plafond mensuel de tout le site, en euros : atteint, le Coach se ferme jusqu'au 1er du mois. */
  globalBudgetEur: number
  /** Euros pour un dollar, pour convertir les coûts facturés en dollars. */
  usdEurRate: number
  /** Questions par compte et par heure glissante. */
  hourlyLimit: number
  /** Délai minimal entre deux questions d'un même compte, en secondes. */
  minIntervalSeconds: number
  /** Longueur maximale d'une question. */
  maxInputChars: number
  /** Messages du fil renvoyés au modèle avec la question. */
  historyMessages: number
  /** Tours d'appels d'outils par question, au plus. */
  maxToolRounds: number
}

export type CoachBooleanSetting = 'enabled' | 'rulesEnabled' | 'memoryEnabled'
export type CoachNumericSetting = Exclude<keyof CoachSettings, CoachBooleanSetting | 'model'>

export const COACH_BOOLEAN_SETTINGS: CoachBooleanSetting[] = ['enabled', 'rulesEnabled', 'memoryEnabled']

export const COACH_SETTING_DEFAULTS: CoachSettings = {
  enabled: false,
  rulesEnabled: false,
  memoryEnabled: false,
  model: COACH_DEFAULT_MODEL_ID,
  budgetPerAccountEur: 2,
  globalBudgetEur: 50,
  usdEurRate: 0.86,
  hourlyLimit: 20,
  minIntervalSeconds: 4,
  maxInputChars: 400,
  historyMessages: 10,
  maxToolRounds: 4,
}

/** Bornes de chaque réglage numérique ; `decimals` = 0 pour un entier. */
export const COACH_SETTING_BOUNDS: Record<CoachNumericSetting, { min: number; max: number; decimals: number }> = {
  budgetPerAccountEur: { min: 0, max: 100, decimals: 2 },
  globalBudgetEur: { min: 0, max: 1000, decimals: 2 },
  usdEurRate: { min: 0.5, max: 2, decimals: 4 },
  hourlyLimit: { min: 1, max: 200, decimals: 0 },
  minIntervalSeconds: { min: 0, max: 60, decimals: 0 },
  maxInputChars: { min: 50, max: 2000, decimals: 0 },
  historyMessages: { min: 0, max: 50, decimals: 0 },
  maxToolRounds: { min: 1, max: 8, decimals: 0 },
}

/** Clés `AppConfig`, une par réglage. */
export const COACH_SETTING_KEYS: Record<keyof CoachSettings, string> = {
  enabled: 'coach_enabled',
  rulesEnabled: 'coach_rules_enabled',
  memoryEnabled: 'coach_memory_enabled',
  model: 'coach_model',
  budgetPerAccountEur: 'coach_budget_per_account_eur',
  globalBudgetEur: 'coach_global_budget_eur',
  usdEurRate: 'coach_usd_eur_rate',
  hourlyLimit: 'coach_hourly_limit',
  minIntervalSeconds: 'coach_min_interval_seconds',
  maxInputChars: 'coach_max_input_chars',
  historyMessages: 'coach_history_messages',
  maxToolRounds: 'coach_max_tool_rounds',
}

const NUMERIC_SETTINGS = Object.keys(COACH_SETTING_BOUNDS) as CoachNumericSetting[]
const CACHE_TTL_MS = 30_000

/** Ramène une valeur dans les bornes du réglage ; une valeur illisible rend la valeur par défaut. */
export function clampCoachNumber(key: CoachNumericSetting, value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value)
  if (!Number.isFinite(parsed)) return COACH_SETTING_DEFAULTS[key]
  const { min, max, decimals } = COACH_SETTING_BOUNDS[key]
  const factor = 10 ** decimals
  const rounded = Math.round(parsed * factor) / factor
  return Math.min(max, Math.max(min, rounded))
}

function parseBoolean(raw: string | undefined): boolean | null {
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  return null
}

/** Réglages à partir des lignes `AppConfig` lues (clé → valeur) et de l'environnement. Pur. */
export function parseCoachSettings(
  stored: Record<string, string | undefined>,
  env: Record<string, string | undefined> = process.env
): CoachSettings {
  const storedModel = stored[COACH_SETTING_KEYS.model]
  const envModel = env.COACH_MODEL?.trim()
  const settings: CoachSettings = {
    ...COACH_SETTING_DEFAULTS,
    model: isCoachModelId(storedModel) ? storedModel : isCoachModelId(envModel) ? envModel : COACH_DEFAULT_MODEL_ID,
  }
  for (const key of COACH_BOOLEAN_SETTINGS) {
    settings[key] = parseBoolean(stored[COACH_SETTING_KEYS[key]]) ?? COACH_SETTING_DEFAULTS[key]
  }
  for (const key of NUMERIC_SETTINGS) {
    const raw = stored[COACH_SETTING_KEYS[key]]
    if (raw !== undefined) settings[key] = clampCoachNumber(key, raw)
  }
  return settings
}

export type CoachSettingsPatch = Partial<Record<keyof CoachSettings, unknown>>

/**
 * Nettoie un patch reçu d'une route : clés inconnues ignorées, nombres bornés, modèle vérifié au catalogue.
 * Renvoie les réglages acceptés et les refus (un modèle inconnu est refusé, pas remplacé).
 */
export function sanitizeCoachSettingsPatch(patch: CoachSettingsPatch): { accepted: Partial<CoachSettings>; errors: string[] } {
  const accepted: Partial<CoachSettings> = {}
  const errors: string[] = []
  for (const key of COACH_BOOLEAN_SETTINGS) {
    const value = patch[key]
    if (value === undefined) continue
    if (typeof value === 'boolean') accepted[key] = value
    else errors.push(`${key} : vrai ou faux attendu.`)
  }
  if (patch.model !== undefined) {
    if (isCoachModelId(patch.model)) accepted.model = patch.model
    else errors.push('model : modèle inconnu du catalogue.')
  }
  for (const key of NUMERIC_SETTINGS) {
    const value = patch[key]
    if (value === undefined) continue
    const parsed = typeof value === 'string' ? Number(value.replace(',', '.')) : Number(value)
    if (!Number.isFinite(parsed)) {
      errors.push(`${key} : nombre attendu.`)
      continue
    }
    accepted[key] = clampCoachNumber(key, parsed)
  }
  return { accepted, errors }
}

type CachedSettings = { value: CoachSettings; expiresAt: number }
let cached: CachedSettings | null = null

export function resetCoachSettingsCache() {
  cached = null
}

/** Réglages courants (cache de 30 s) ; une base injoignable rend l'environnement puis les défauts. */
export async function getCoachSettings(): Promise<CoachSettings> {
  const now = Date.now()
  if (cached && cached.expiresAt > now) return cached.value
  let stored: Record<string, string | undefined> = {}
  try {
    const rows = await prisma.appConfig.findMany({
      where: { key: { in: Object.values(COACH_SETTING_KEYS) } },
      select: { key: true, value: true },
    })
    stored = Object.fromEntries(rows.map((row) => [row.key, row.value]))
  } catch (error) {
    console.error('[coach] Réglages illisibles, valeurs de repli :', error)
  }
  const value = parseCoachSettings(stored)
  cached = { value, expiresAt: now + CACHE_TTL_MS }
  return value
}

/** Enregistre un patch déjà nettoyé (`sanitizeCoachSettingsPatch`) et renvoie les réglages à jour. */
export async function setCoachSettings(patch: Partial<CoachSettings>): Promise<CoachSettings> {
  const writes = (Object.keys(patch) as Array<keyof CoachSettings>)
    .filter((key) => patch[key] !== undefined && key in COACH_SETTING_KEYS)
    .map((key) => {
      const value = String(patch[key])
      return prisma.appConfig.upsert({
        where: { key: COACH_SETTING_KEYS[key] },
        update: { value },
        create: { key: COACH_SETTING_KEYS[key], value },
      })
    })
  if (writes.length > 0) await prisma.$transaction(writes)
  cached = null
  return getCoachSettings()
}

/** La clé d'API est posée (sans jamais la renvoyer) : sans elle, le Coach reste fermé. */
export function hasCoachApiKey(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.GEMINI_API_KEY?.trim())
}
