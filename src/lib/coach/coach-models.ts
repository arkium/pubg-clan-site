/**
 * Catalogue des modèles proposés au SuperUser pour le Coach IA (docs/TODO/chatbot-ia.md §3.2). Module pur, lisible
 * côté client (tuiles de la page d'administration). Prix payants relevés le 2026-10-24 sur
 * ai.google.dev/gemini-api/docs/pricing, en dollars par million de tokens ; la sortie comprend la réflexion.
 * Ajouter un modèle = une entrée ici, puis un déploiement.
 *
 * Le choix par défaut vient de l'essai du lot 0 (§3.4) : `gemini-3.5-flash-lite` est le seul à ne jamais inventer de
 * chiffre hors outil ; `3.1-flash-lite` l'a fait deux fois sur deux et `2.5-flash-lite` répond 404 aux nouveaux comptes.
 */

export type CoachThinkingLevel = 'minimal' | 'low'

/** Tarif valable à partir de `from` (date ISO `AAAA-MM-JJ`, incluse). */
export type CoachModelPrice = { from: string; inputUsdPerM: number; outputUsdPerM: number }

export type CoachModelDefinition = {
  id: string
  label: string
  provider: 'gemini'
  /** Tarifs par date croissante ; le premier vaut depuis toujours. */
  prices: readonly CoachModelPrice[]
  /** Recommandé par Google pour un nouveau projet. */
  recommended: boolean
  /** Date d'arrêt « au plus tôt » annoncée, ISO, ou null. */
  shutdownNotBefore: string | null
  /** Niveau de réflexion le plus bas accepté (`minimal` est refusé par les Flash, essai du lot 0). */
  thinkingLevel: CoachThinkingLevel
  /** Plafond de sortie, réflexion comprise : à 1 024, la réponse de 3.8-flash a été coupée. */
  maxOutputTokens: number
  /** Ce que l'essai du lot 0 a montré, pour la tuile d'administration. */
  note: string | null
}

export const COACH_DEFAULT_MODEL_ID = 'gemini-3.5-flash-lite'

export const COACH_MODELS: readonly CoachModelDefinition[] = [
  {
    id: 'gemini-3.5-flash-lite',
    label: 'Gemini 3.5 Flash-Lite',
    provider: 'gemini',
    prices: [{ from: '2026-07-21', inputUsdPerM: 0.3, outputUsdPerM: 2.5 }],
    recommended: true,
    shutdownNotBefore: null,
    thinkingLevel: 'minimal',
    maxOutputTokens: 1024,
    note: 'Essai du 24 octobre 2026 : appels d’outils fiables, aucun chiffre hors outil, réponses courtes.',
  },
  {
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash-Lite',
    provider: 'gemini',
    prices: [{ from: '2026-05-07', inputUsdPerM: 0.25, outputUsdPerM: 1.5 }],
    recommended: false,
    shutdownNotBefore: '2027-05-07',
    thinkingLevel: 'minimal',
    maxOutputTokens: 1024,
    note: 'Essai du 24 octobre 2026 : a inventé des chiffres sans appel d’outil, deux fois sur deux. Secours seulement.',
  },
  {
    id: 'gemini-3.8-flash',
    label: 'Gemini 3.8 Flash',
    provider: 'gemini',
    prices: [
      { from: '2026-09-02', inputUsdPerM: 0.75, outputUsdPerM: 3.75 },
      { from: '2027-01-01', inputUsdPerM: 1.5, outputUsdPerM: 7.5 },
    ],
    recommended: true,
    shutdownNotBefore: null,
    thinkingLevel: 'low',
    maxOutputTokens: 4096,
    note: 'Essai du 24 octobre 2026 : réflexion d’environ 1 100 tokens par réponse, 4 à 5 fois plus cher, 3 à 12 s.',
  },
  {
    id: 'gemini-3.6-flash',
    label: 'Gemini 3.6 Flash',
    provider: 'gemini',
    prices: [
      { from: '2026-07-21', inputUsdPerM: 0.75, outputUsdPerM: 3.75 },
      { from: '2027-01-01', inputUsdPerM: 1.5, outputUsdPerM: 7.5 },
    ],
    recommended: false,
    shutdownNotBefore: null,
    thinkingLevel: 'low',
    maxOutputTokens: 4096,
    note: null,
  },
]

export function getCoachModel(id: string | null | undefined): CoachModelDefinition | null {
  if (!id) return null
  return COACH_MODELS.find((model) => model.id === id) ?? null
}

export function isCoachModelId(id: unknown): id is string {
  return typeof id === 'string' && COACH_MODELS.some((model) => model.id === id)
}

/** Date UTC `AAAA-MM-JJ` d'un instant, pour comparer aux dates de tarif. */
function isoDay(at: Date) {
  return at.toISOString().slice(0, 10)
}

/** Tarif en vigueur à l'instant donné (le premier tarif vaut depuis toujours). */
export function coachModelPriceAt(model: CoachModelDefinition, at: Date = new Date()): CoachModelPrice {
  const day = isoDay(at)
  let current = model.prices[0]
  for (const price of model.prices) {
    if (price.from <= day) current = price
  }
  return current
}

/** Prochain changement de tarif après l'instant donné, ou null. */
export function nextCoachModelPriceChange(model: CoachModelDefinition, at: Date = new Date()): CoachModelPrice | null {
  const day = isoDay(at)
  return model.prices.find((price) => price.from > day) ?? null
}

/** « 1er janvier 2027 », « 7 mai 2027 » — à partir d'une date ISO `AAAA-MM-JJ`. */
export function formatCoachDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  const formatted = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day))
  )
  return day === 1 ? formatted.replace(/^1 /, '1er ') : formatted
}

export type CoachModelBadge = { tone: 'pos' | 'warn' | 'neg'; label: string }

/** Pastilles de statut d'une tuile de modèle : recommandé, changement de prix à venir, arrêt annoncé. */
export function coachModelBadges(model: CoachModelDefinition, at: Date = new Date()): CoachModelBadge[] {
  const badges: CoachModelBadge[] = []
  if (model.recommended) badges.push({ tone: 'pos', label: 'Recommandé' })
  const next = nextCoachModelPriceChange(model, at)
  if (next) {
    const current = coachModelPriceAt(model, at)
    const doubled = next.inputUsdPerM >= current.inputUsdPerM * 2 && next.outputUsdPerM >= current.outputUsdPerM * 2
    badges.push({ tone: 'warn', label: `Prix ${doubled ? 'doublé' : 'modifié'} au ${formatCoachDate(next.from)}` })
  }
  if (model.shutdownNotBefore) badges.push({ tone: 'neg', label: `Arrêt au plus tôt le ${formatCoachDate(model.shutdownNotBefore)}` })
  return badges
}
