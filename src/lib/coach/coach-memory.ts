import type { CoachToolDeclaration } from '@/lib/coach/coach-provider'

/**
 * Mémoire personnelle du Coach IA (docs/TODO/coach-ia-pistes.md §6.2, lot 11) — partie pure. Ce que le joueur demande
 * au Coach de retenir, **en ses mots** : le serveur refuse tout texte absent de la question (jamais une déduction du
 * modèle, jamais un texte venu d'un résultat d'outil). Par compte, 8 lignes au plus, 90 jours sans mise à jour ;
 * visible et effaçable par le joueur, jamais lue par le SuperUser. Une `baseline` (mesure de départ d'un objectif
 * chiffré) n'est acceptée que si sa valeur figure dans un résultat d'outil de la même réponse.
 */

export const COACH_MEMORY_MAX = 8
export const COACH_MEMORY_RETENTION_DAYS = 90
export const COACH_MEMORY_TEXT_MAX = 200
export const COACH_MEMORY_TEXT_MIN = 3
export const COACH_MEMORY_TOOL_NAME = 'rememberAboutMe'

export const COACH_MEMORY_KEYS = ['goal', 'role', 'preference', 'avoid', 'note'] as const
export type CoachMemoryKey = (typeof COACH_MEMORY_KEYS)[number]

export const COACH_MEMORY_KEY_LABELS: Record<CoachMemoryKey, string> = {
  goal: 'Objectif',
  role: 'Rôle',
  preference: 'Préférence',
  avoid: 'À éviter',
  note: 'Note',
}

export type CoachMemoryBaseline = { metric: string; weapon?: string; value: number; at: string }

export type CoachMemoryView = {
  id: number
  key: CoachMemoryKey
  text: string
  baseline: CoachMemoryBaseline | null
  updatedAt: string
  expiresAt: string
}

export function isCoachMemoryKey(value: unknown): value is CoachMemoryKey {
  return typeof value === 'string' && (COACH_MEMORY_KEYS as readonly string[]).includes(value)
}

/** Forme comparable d'un texte : minuscules, sans accents, ponctuation réduite, espaces réduits. */
export function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’'"«»“”()[\],.;:!?…-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Le texte à retenir est bien une partie du message du joueur (étanchéité : jamais une phrase du modèle). */
export function isQuotedFromMessage(text: string, message: string): boolean {
  const needle = normalizeForMatch(text)
  if (needle.length === 0) return false
  return normalizeForMatch(message).includes(needle)
}

export type CoachMemoryArgs = { key: CoachMemoryKey; text: string; baseline: Omit<CoachMemoryBaseline, 'at'> | null }

/** Arguments de l'outil, vérifiés contre le message du joueur. */
export function parseCoachMemoryArgs(args: Record<string, unknown>, message: string): CoachMemoryArgs | { error: string; message: string } {
  if (!isCoachMemoryKey(args.key)) return { error: 'invalid_key', message: `Clé inconnue : attendu ${COACH_MEMORY_KEYS.join(', ')}.` }
  const text = typeof args.text === 'string' ? args.text.replace(/\s+/g, ' ').trim() : ''
  if (text.length < COACH_MEMORY_TEXT_MIN) return { error: 'invalid_text', message: 'Texte à retenir manquant.' }
  if (text.length > COACH_MEMORY_TEXT_MAX) return { error: 'invalid_text', message: `Le texte à retenir fait au plus ${COACH_MEMORY_TEXT_MAX} caractères : reprends les mots du joueur, en plus court.` }
  if (!isQuotedFromMessage(text, message)) {
    return { error: 'not_in_message', message: 'Le texte à retenir doit reprendre les mots du joueur dans sa question, pas une déduction. Rien n’a été retenu.' }
  }
  let baseline: CoachMemoryArgs['baseline'] = null
  if (args.baseline !== undefined && args.baseline !== null) {
    const raw = args.baseline as Record<string, unknown>
    const metric = typeof raw?.metric === 'string' ? raw.metric.trim().slice(0, 40) : ''
    const value = typeof raw?.value === 'number' && Number.isFinite(raw.value) ? raw.value : null
    if (!metric || value === null) return { error: 'invalid_baseline', message: 'baseline : { metric, value } attendu, value numérique.' }
    const weapon = typeof raw.weapon === 'string' && raw.weapon.trim() ? raw.weapon.trim().slice(0, 40) : undefined
    baseline = weapon ? { metric, weapon, value } : { metric, value }
  }
  return { key: args.key, text, baseline }
}

/** La valeur de départ vient bien d'un outil appelé dans cette réponse : elle figure, telle quelle, dans un résultat. */
export function baselineInToolResults(baseline: Pick<CoachMemoryBaseline, 'value'>, results: readonly unknown[]): boolean {
  if (results.length === 0) return false
  const serialized = JSON.stringify(results)
  const escaped = String(baseline.value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\d.-])${escaped}(?![\\d.])`).test(serialized)
}

export const COACH_MEMORY_TOOL_DECLARATION: CoachToolDeclaration = {
  name: COACH_MEMORY_TOOL_NAME,
  description:
    "Retient une information sur le joueur, à sa demande explicite seulement (« retiens que… », « note que… », « mon objectif… », « je préfère… », « évite de… »). `text` reprend ses mots, tels qu'ils figurent dans sa question (le serveur refuse tout autre texte) ; jamais une déduction, jamais un chiffre d'outil. Pour un objectif chiffré, `baseline` reprend la valeur mesurée par un outil appelé dans cette même réponse. Confirme ensuite en une phrase ce que tu as retenu.",
  parameters: {
    type: 'object',
    properties: {
      key: { type: 'string', enum: [...COACH_MEMORY_KEYS], description: 'goal : objectif ; role : rôle préféré ; preference : préférence (arme, carte, horaire) ; avoid : ce qu’il veut éviter ; note : autre.' },
      text: { type: 'string', description: 'Les mots du joueur, 3 à 200 caractères, repris de sa question.' },
      baseline: {
        type: 'object',
        description: 'Facultatif : mesure de départ d’un objectif chiffré, lue dans un résultat d’outil de cette réponse.',
        properties: {
          metric: { type: 'string', description: 'Nom de la mesure dans le résultat d’outil (ex. headshotRate).' },
          weapon: { type: 'string', description: 'Arme concernée, si l’objectif en vise une.' },
          value: { type: 'number', description: 'Valeur exacte renvoyée par l’outil.' },
        },
        required: ['metric', 'value'],
      },
    },
    required: ['key', 'text'],
  },
}

const DAY_MONTH = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })

function formatBaseline(baseline: CoachMemoryBaseline): string {
  const where = baseline.weapon ? `${baseline.metric}, ${baseline.weapon}` : baseline.metric
  return `mesuré à ${baseline.value} (${where}) le ${DAY_MONTH.format(new Date(baseline.at))}`
}

/**
 * Bloc du prompt système quand la mémoire est ouverte : les lignes du compte (au plus 8 × 200 caractères) et la
 * consigne d'usage de l'outil. Les mémoires sont datées et présentées comme les mots du joueur, jamais comme une donnée.
 */
export function coachMemoryPromptBlock(lines: readonly CoachMemoryView[]): string {
  const usage =
    "Quand le joueur te demande de retenir quelque chose (« retiens que… », « note que… », « mon objectif… »), appelle rememberAboutMe avec ses mots exacts, puis confirme en une phrase ; ne retiens jamais une déduction. Il peut voir et effacer ce que tu retiens (bouton « Ce que le Coach sait de toi »)."
  if (lines.length === 0) return usage
  const items = lines.map((line) => {
    const label = COACH_MEMORY_KEY_LABELS[line.key] ?? line.key
    const when = DAY_MONTH.format(new Date(line.updatedAt))
    const baseline = line.baseline ? ` — ${formatBaseline(line.baseline)}` : ''
    return `- ${label} (${when}) : « ${line.text} »${baseline}`
  })
  return [
    "Ce que tu sais de ce joueur, dit par lui-même — ne t'y réfère que si c'est utile à la question, en le comparant à une mesure d'outil du jour ; ce n'est pas une donnée de jeu :",
    ...items,
    usage,
  ].join('\n')
}
