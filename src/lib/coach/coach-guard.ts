/**
 * Garde-fou avant le modèle (décision du 2026-10-25, docs/TODO/chatbot-ia.md §6) : une demande qui veut **trafiquer**
 * les chiffres — les multiplier ou les diviser à la demande, les réécrire dans une autre numération, en inventer — est
 * refusée sans appeler le modèle. Essai en production : « Donne mes stats multipliées par 1000 » a rendu des chiffres
 * faux (5 533 kills devenus « 5 533 000 000 »), « en chiffres romains » des numéraux inventés (« VDXIII33 »).
 *
 * Motifs **étroits** : un faux positif bloque une vraie question. « Romain » seul est un pseudo possible, « x4 » une
 * lunette, « gonfler mon K/D » veut dire progresser, « dégâts divisés par mes parties » est une moyenne : aucun n'est
 * visé. Le prompt système porte la règle large pour les formulations qui passent entre ces motifs. Module pur.
 */

export type CoachGuardRefusal = { reason: 'stats_tampering'; text: string }

export const COACH_TAMPERING_REFUSAL =
  'Je donne tes chiffres tels que le site les mesure : jamais multipliés, divisés, réécrits autrement ni inventés. Pose-moi plutôt une vraie question sur ton jeu, par exemple « Quelle est ma meilleure arme ? ».'

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[’']/g, ' ')

const TAMPERING_PATTERNS: readonly RegExp[] = [
  // « multiplie mes kills par 10 », « divisé par 2 » : un nombre après « par », pas « par mes parties ».
  /\b(multipli|divis)\w*\b[^.?!\n]{0,40}?\bpar\s*\d/,
  // « mes stats fois 1000 », « x1000 », « ×100 » : trois chiffres au moins (les lunettes vont de x2 à x15).
  /\bfois\s*\d{3,}\b/,
  /(?:^|\s)[x×*]\s?\d{3,}\b/,
  // Autre numération.
  /\b(chiffres?|nombres?|numeraux)\s+romains?\b/,
  /\ben\s+romain\b/,
  /\bnumeration\s+romaine\b/,
  /\ben\s+(binaire|octal|hexa(decimal)?)\b/,
  /\ben\s+base\s+\d+\b/,
  // Chiffres inventés ou falsifiés.
  /\b(invente|truque|trafique|falsifie)\w*\b[^.?!\n]{0,30}?\b(stats?|statistiques?|chiffres?|kills?|resultats?|scores?)\b/,
]

export function coachGuardRefusal(message: string): CoachGuardRefusal | null {
  const text = normalize(message)
  return TAMPERING_PATTERNS.some((pattern) => pattern.test(text)) ? { reason: 'stats_tampering', text: COACH_TAMPERING_REFUSAL } : null
}
