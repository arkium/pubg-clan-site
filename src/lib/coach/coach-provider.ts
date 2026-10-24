import type { CoachModelDefinition } from '@/lib/coach/coach-models'

/**
 * Interface du fournisseur de modèle du Coach IA (docs/TODO/chatbot-ia.md §3.3) : la route et les outils ne
 * connaissent que ceci. Changer de modèle Gemini = changer d'identifiant ; un autre fournisseur plus tard = un nouvel
 * adaptateur (`coach-provider-gemini.ts` est le seul en V1).
 */

/** Déclaration d'un outil, au format JSON Schema (sous-ensemble compris par Gemini). */
export type CoachToolDeclaration = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type CoachToolCall = { name: string; args: Record<string, unknown> }

export type CoachHistoryMessage = { role: 'user' | 'assistant'; content: string }

export type CoachStreamRequest = {
  model: CoachModelDefinition
  system: string
  history: readonly CoachHistoryMessage[]
  question: string
  tools: readonly CoachToolDeclaration[]
  /** Exécute un outil demandé par le modèle ; le clan et le compte sont liés dans la fermeture, jamais passés par lui. */
  runTool: (call: CoachToolCall) => Promise<unknown>
  /** Tours d'appels d'outils au plus ; au-delà, le modèle doit conclure avec ce qu'il a. */
  maxToolRounds: number
  signal?: AbortSignal
  onDelta?: (text: string) => void
  onToolCall?: (call: CoachToolCall) => void
}

export type CoachAnswer = {
  text: string
  toolCalls: CoachToolCall[]
  tokensIn: number
  /** Réflexion comprise : elle est facturée au tarif de sortie. */
  tokensOut: number
  rounds: number
  finishReason: string | null
}

export type CoachProviderErrorCode = 'unauthorized' | 'rate_limited' | 'unavailable' | 'bad_request' | 'timeout' | 'aborted' | 'network'

export class CoachProviderError extends Error {
  readonly code: CoachProviderErrorCode
  readonly status: number | null

  constructor(code: CoachProviderErrorCode, message: string, status: number | null = null) {
    super(message)
    this.name = 'CoachProviderError'
    this.code = code
    this.status = status
  }
}

export interface CoachModelProvider {
  streamAnswer(request: CoachStreamRequest): Promise<CoachAnswer>
}
