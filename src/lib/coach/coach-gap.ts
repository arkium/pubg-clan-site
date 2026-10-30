import { redactCoachText } from '@/lib/coach/coach-guard'
import type { CoachToolCall, CoachToolDeclaration } from '@/lib/coach/coach-provider'

/**
 * Lacune déclarée par le Coach IA (2026-10-30) — partie pure. Quand aucun outil ne donne ce que le joueur demande, ou
 * seulement en partie, le modèle appelle `reportMissingData` avec le sujet en quelques mots. Rien n'est lu ni renvoyé :
 * l'appel reste dans le journal d'outils de la réponse (`CoachMessage.toolCalls`), d'où l'administration tire la liste
 * des outils manquants. Ni migration ni texte dans la réponse du joueur. Une lacune ne compte jamais comme un outil qui
 * a répondu (marque « chiffres sans outil » inchangée).
 */

export const COACH_GAP_TOOL_NAME = 'reportMissingData'
export const COACH_GAP_TOPIC_MAX = 60

export const COACH_GAP_TOOL_DECLARATION: CoachToolDeclaration = {
  name: COACH_GAP_TOOL_NAME,
  description:
    "Signale à l'équipe du site une donnée que tes outils ne donnent pas : à appeler quand aucun outil ne couvre la demande du joueur, ou seulement en partie (une donnée que le site ne lit pas, un filtre qu'aucun outil n'a). `topic` : le sujet manquant en 2 à 6 mots (« coéquipiers par partie », « dégâts subis par arme »), sans pseudo. Pas pour une question hors sujet, ni pour un outil en erreur. Ne renvoie aucune donnée : réponds ensuite en disant au joueur ce que tu ne peux pas lire.",
  parameters: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'Sujet manquant, 2 à 6 mots, sans pseudo.' },
    },
    required: ['topic'],
  },
}

/** Sujet d'une lacune, nettoyé : espaces resserrés, adresses et liens masqués, 60 caractères au plus ; `null` si vide. */
export function normalizeCoachGapTopic(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const topic = redactCoachText(value).replace(/\s+/g, ' ').trim()
  if (!topic) return null
  return topic.length > COACH_GAP_TOPIC_MAX ? `${topic.slice(0, COACH_GAP_TOPIC_MAX - 1).trimEnd()}…` : topic
}

/** Exécution de l'outil : rien à lire, seulement un accusé de réception (ou `empty_topic`, rangé en échec dans l'audit). */
export function runCoachGapTool(call: CoachToolCall): { recorded: true; topic: string } | { error: 'empty_topic' } {
  const topic = normalizeCoachGapTopic(call.args.topic)
  return topic ? { recorded: true, topic } : { error: 'empty_topic' }
}

/** Sujets de lacune d'une colonne `toolCalls` (appels réussis seulement). */
export function coachGapTopics(toolCalls: unknown): string[] {
  if (!Array.isArray(toolCalls)) return []
  const topics: string[] = []
  for (const call of toolCalls) {
    if (!call || typeof call !== 'object') continue
    const entry = call as { name?: unknown; args?: { topic?: unknown }; failed?: unknown }
    if (entry.name !== COACH_GAP_TOOL_NAME || entry.failed) continue
    const topic = normalizeCoachGapTopic(entry.args?.topic)
    if (topic) topics.push(topic)
  }
  return topics
}
