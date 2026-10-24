import {
  CoachProviderError,
  type CoachAnswer,
  type CoachModelProvider,
  type CoachStreamRequest,
  type CoachToolCall,
} from '@/lib/coach/coach-provider'

/**
 * Adaptateur Gemini du Coach IA : API REST `streamGenerateContent?alt=sse` appelée directement (pas de SDK — flux et
 * appels d'outils éprouvés par l'essai du lot 0, docs/TODO/chatbot-ia.md §3.4). Côté serveur seulement, la clé ne
 * sort pas d'ici.
 *
 * - Une question = un ou plusieurs tours : tant que le modèle demande des outils (et que `maxToolRounds` le permet),
 *   leurs résultats lui sont renvoyés ; les parts de sa réponse sont réexpédiées telles quelles, signature de
 *   réflexion comprise (les Gemini 3 l'exigent).
 * - `thinkingLevel` vient du catalogue ; refusé (400) par un modèle, l'appel repart une fois sans.
 * - Un délai par tour (`timeoutMs`) et le `signal` du client (tiroir fermé) interrompent l'appel.
 */

const DEFAULT_API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_TIMEOUT_MS = 30_000

type Part = Record<string, unknown>
type Content = { role: 'user' | 'model'; parts: Part[] }

type StreamChunk = {
  candidates?: Array<{ content?: { parts?: Part[] }; finishReason?: string }>
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number }
}

type RoundResult = {
  parts: Part[]
  text: string
  tokensIn: number
  tokensOut: number
  finishReason: string | null
}

export type GeminiProviderOptions = {
  apiKey: string
  fetchImpl?: typeof fetch
  apiBase?: string
  timeoutMs?: number
}

/** Lit un flux SSE ligne par ligne et appelle `onChunk` pour chaque `data: {...}`. */
async function readSse(body: ReadableStream<Uint8Array>, onChunk: (chunk: StreamChunk) => void) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload) continue
      onChunk(JSON.parse(payload) as StreamChunk)
    }
  }
}

function errorFromStatus(status: number, detail: string): CoachProviderError {
  const message = detail.slice(0, 300)
  if (status === 401 || status === 403) return new CoachProviderError('unauthorized', message, status)
  if (status === 429) return new CoachProviderError('rate_limited', message, status)
  if (status >= 500) return new CoachProviderError('unavailable', message, status)
  return new CoachProviderError('bad_request', message, status)
}

function combinedSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

export function createGeminiProvider(options: GeminiProviderOptions): CoachModelProvider {
  const fetchImpl = options.fetchImpl ?? fetch
  const apiBase = options.apiBase ?? DEFAULT_API_BASE
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  async function streamRound(
    request: CoachStreamRequest,
    contents: Content[],
    thinking: boolean
  ): Promise<RoundResult> {
    const { model } = request
    const body = {
      systemInstruction: { parts: [{ text: request.system }] },
      contents,
      tools: request.tools.length > 0 ? [{ functionDeclarations: request.tools }] : undefined,
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: model.maxOutputTokens,
        ...(thinking ? { thinkingConfig: { thinkingLevel: model.thinkingLevel } } : {}),
      },
    }

    let response: Response
    try {
      response = await fetchImpl(`${apiBase}/models/${model.id}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: { 'x-goog-api-key': options.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: combinedSignal(request.signal, timeoutMs),
      })
    } catch (error) {
      if (request.signal?.aborted) throw new CoachProviderError('aborted', 'Appel interrompu par le client.')
      if ((error as Error).name === 'AbortError' || (error as Error).name === 'TimeoutError') {
        throw new CoachProviderError('timeout', `Pas de réponse du modèle en ${timeoutMs} ms.`)
      }
      throw new CoachProviderError('network', (error as Error).message)
    }
    if (!response.ok || !response.body) {
      throw errorFromStatus(response.status, await response.text().catch(() => ''))
    }

    const result: RoundResult = { parts: [], text: '', tokensIn: 0, tokensOut: 0, finishReason: null }
    try {
      await readSse(response.body, (chunk) => {
        const candidate = chunk.candidates?.[0]
        for (const part of candidate?.content?.parts ?? []) {
          if (typeof part.text === 'string' && !part.thought) {
            result.text += part.text
            request.onDelta?.(part.text)
          }
          result.parts.push(part)
        }
        if (candidate?.finishReason) result.finishReason = candidate.finishReason
        if (chunk.usageMetadata) {
          result.tokensIn = chunk.usageMetadata.promptTokenCount ?? result.tokensIn
          result.tokensOut = (chunk.usageMetadata.candidatesTokenCount ?? 0) + (chunk.usageMetadata.thoughtsTokenCount ?? 0)
        }
      })
    } catch (error) {
      if (request.signal?.aborted) throw new CoachProviderError('aborted', 'Appel interrompu par le client.')
      if ((error as Error).name === 'AbortError' || (error as Error).name === 'TimeoutError') {
        throw new CoachProviderError('timeout', `Flux interrompu après ${timeoutMs} ms.`)
      }
      throw new CoachProviderError('network', (error as Error).message)
    }
    return result
  }

  return {
    async streamAnswer(request) {
      const contents: Content[] = request.history.map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      }))
      contents.push({ role: 'user', parts: [{ text: request.question }] })

      const answer: CoachAnswer = { text: '', toolCalls: [], tokensIn: 0, tokensOut: 0, rounds: 0, finishReason: null }
      let thinking = true
      for (let round = 1; round <= request.maxToolRounds + 1; round += 1) {
        let step: RoundResult
        try {
          step = await streamRound(request, contents, thinking)
        } catch (error) {
          // Niveau de réflexion refusé par ce modèle : même tour, sans réglage.
          if (error instanceof CoachProviderError && error.status === 400 && thinking) {
            thinking = false
            round -= 1
            continue
          }
          throw error
        }
        answer.rounds += 1
        answer.tokensIn += step.tokensIn
        answer.tokensOut += step.tokensOut
        answer.finishReason = step.finishReason

        const calls = step.parts
          .filter((part): part is { functionCall: { name: string; args?: Record<string, unknown> } } => Boolean(part.functionCall))
          .map((part) => ({ name: part.functionCall.name, args: part.functionCall.args ?? {} }))
        if (calls.length === 0 || round > request.maxToolRounds) {
          answer.text = step.text
          if (calls.length > 0) answer.finishReason = 'TOOL_LIMIT'
          break
        }

        contents.push({ role: 'model', parts: step.parts })
        const responses: Part[] = []
        for (const call of calls) {
          answer.toolCalls.push(call)
          request.onToolCall?.(call)
          responses.push({ functionResponse: { name: call.name, response: await toolResponse(request, call) } })
        }
        contents.push({ role: 'user', parts: responses })
      }
      return answer
    },
  }
}

/** Un outil qui échoue le dit au modèle (qui le dira au joueur) au lieu de casser la réponse. */
async function toolResponse(request: CoachStreamRequest, call: CoachToolCall): Promise<Record<string, unknown>> {
  try {
    return { result: await request.runTool(call) }
  } catch (error) {
    console.error(`[coach] Outil ${call.name} en échec :`, error)
    return { error: 'Cet outil n’a pas répondu ; dis-le au joueur sans inventer de chiffre.' }
  }
}
