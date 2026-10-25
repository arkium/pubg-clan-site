/**
 * Règles apprises du Coach IA (docs/TODO/coach-ia-pistes.md §6.3, lot 10) — partie pure. Une règle est une phrase
 * écrite à la main par le SuperUser après relecture d'une réponse votée « Inexact » ; elle entre dans le prompt système
 * (bloc « Règles du site ») quand `coach_rules_enabled` est ouvert. Jamais écrite par le modèle, jamais reprise d'une
 * note de joueur : une phrase qui entre dans le prompt est une consigne, elle ne vient que d'une main de confiance.
 * Borne : 20 règles actives (≈ 800 tokens au pire, +16 % par question) — une règle de plus = une à retirer.
 */

export const COACH_RULE_MAX_ACTIVE = 20
export const COACH_RULE_TEXT_MAX = 200
export const COACH_RULE_TEXT_MIN = 8

export type CoachRuleView = {
  id: number
  text: string
  enabled: boolean
  /** Vote « Inexact » d'origine, pour l'historique ; null si la règle a été écrite sans vote (ou le message purgé). */
  fromMessageId: number | null
  createdAt: string
  updatedAt: string
  /** Tokens estimés de cette règle dans le prompt. */
  tokens: number
}

export type CoachRulesReport = {
  /** Interrupteur `coach_rules_enabled` : fermé, les règles sont gardées mais n'entrent pas dans le prompt. */
  enabled: boolean
  rules: CoachRuleView[]
  activeCount: number
  maxActive: number
  /** Tokens estimés du bloc complet (règles actives), ajoutés à chaque question. */
  promptTokens: number
}

/** Ordre de grandeur en tokens d'un texte français : 4 caractères par token, arrondi au-dessus. */
export function estimateCoachTokens(text: string): number {
  return Math.ceil(text.trim().length / 4)
}

/** Texte d'une règle : espaces et sauts de ligne réduits à un espace, entre 8 et 200 caractères. */
export function normalizeCoachRuleText(raw: unknown): { text: string } | { error: string } {
  if (typeof raw !== 'string') return { error: 'Texte de règle attendu.' }
  const text = raw.replace(/\s+/g, ' ').trim()
  if (text.length < COACH_RULE_TEXT_MIN) return { error: `Une règle fait au moins ${COACH_RULE_TEXT_MIN} caractères.` }
  if (text.length > COACH_RULE_TEXT_MAX) return { error: `Une règle fait au plus ${COACH_RULE_TEXT_MAX} caractères.` }
  return { text }
}

/** Bloc « Règles du site » du prompt système ; vide sans règle active. */
export function coachRulesPromptBlock(texts: readonly string[]): string {
  const rules = texts.map((text) => text.trim()).filter((text) => text.length > 0)
  if (rules.length === 0) return ''
  return ['Règles du site, écrites par l’administrateur après relecture des réponses — à suivre, elles priment sur tes habitudes :', ...rules.map((text) => `- ${text}`)].join('\n')
}

/** Tokens estimés du bloc complet pour ces règles. */
export function coachRulesPromptTokens(texts: readonly string[]): number {
  const block = coachRulesPromptBlock(texts)
  return block ? estimateCoachTokens(block) : 0
}
