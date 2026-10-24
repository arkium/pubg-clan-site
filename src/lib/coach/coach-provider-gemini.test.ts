import { describe, expect, it, vi } from 'vitest'

import { getCoachModel } from '@/lib/coach/coach-models'
import { CoachProviderError, type CoachStreamRequest } from '@/lib/coach/coach-provider'
import { createGeminiProvider } from '@/lib/coach/coach-provider-gemini'

/**
 * Adaptateur Gemini : `fetch` est simulé par des flux SSE écrits à la main, dans la forme observée à l'essai du lot 0.
 * Aucun appel réseau.
 */

const model = getCoachModel('gemini-3.5-flash-lite')!

type Chunk = Record<string, unknown>

function sse(chunks: Chunk[], status = 200) {
  const text = chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('')
  return new Response(text, { status, headers: { 'content-type': 'text/event-stream' } })
}

const textChunk = (text: string, extra: Chunk = {}) => ({ candidates: [{ content: { parts: [{ text }] } }], ...extra })
const usage = (promptTokenCount: number, candidatesTokenCount: number, thoughtsTokenCount = 0) => ({
  candidates: [{ content: { parts: [] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount, candidatesTokenCount, thoughtsTokenCount },
})
const callChunk = (name: string, args: Record<string, unknown>) => ({
  candidates: [{ content: { parts: [{ functionCall: { name, args }, thoughtSignature: 'sig-1' }] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 20, thoughtsTokenCount: 0 },
})

function request(overrides: Partial<CoachStreamRequest> = {}): CoachStreamRequest {
  return {
    model,
    system: 'Tu es le Coach.',
    history: [{ role: 'user', content: 'Salut' }, { role: 'assistant', content: 'Salut NovakTV !' }],
    question: 'Pourquoi on a perdu ?',
    tools: [{ name: 'getMatchDebrief', description: 'Débriefing', parameters: { type: 'object', properties: {} } }],
    runTool: vi.fn(async () => ({ placement: 3 })),
    maxToolRounds: 2,
    ...overrides,
  }
}

function bodyOf(fetchMock: ReturnType<typeof vi.fn>, callIndex: number) {
  return JSON.parse(fetchMock.mock.calls[callIndex][1].body as string)
}

describe('adaptateur Gemini', () => {
  it('envoie l’historique, lit le flux mot à mot et somme les tokens', async () => {
    const fetchMock = vi.fn(async () => sse([textChunk('Phase 5 '), textChunk('· 18:42'), usage(1400, 150)]))
    const deltas: string[] = []
    const provider = createGeminiProvider({ apiKey: 'k', fetchImpl: fetchMock as unknown as typeof fetch })

    const answer = await provider.streamAnswer(request({ onDelta: (text) => deltas.push(text) }))

    expect(answer).toEqual({ text: 'Phase 5 · 18:42', toolCalls: [], tokensIn: 1400, tokensOut: 150, rounds: 1, finishReason: 'STOP' })
    expect(deltas).toEqual(['Phase 5 ', '· 18:42'])
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:streamGenerateContent?alt=sse')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('k')
    const body = bodyOf(fetchMock, 0)
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'Salut' }] },
      { role: 'model', parts: [{ text: 'Salut NovakTV !' }] },
      { role: 'user', parts: [{ text: 'Pourquoi on a perdu ?' }] },
    ])
    expect(body.generationConfig).toEqual({ temperature: 0.4, maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: 'minimal' } })
    expect(body.tools[0].functionDeclarations[0].name).toBe('getMatchDebrief')
  })

  it('exécute un tour d’outil et renvoie les parts du modèle telles quelles', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sse([callChunk('getMatchDebrief', { matchId: 'm1' })]))
      .mockResolvedValueOnce(sse([textChunk('Top 3.'), usage(2000, 100, 5)]))
    const runTool = vi.fn(async () => ({ placement: 3 }))
    const onToolCall = vi.fn()
    const provider = createGeminiProvider({ apiKey: 'k', fetchImpl: fetchMock as unknown as typeof fetch })

    const answer = await provider.streamAnswer(request({ runTool, onToolCall }))

    expect(runTool).toHaveBeenCalledWith({ name: 'getMatchDebrief', args: { matchId: 'm1' } })
    expect(onToolCall).toHaveBeenCalledTimes(1)
    expect(answer).toMatchObject({ text: 'Top 3.', rounds: 2, tokensIn: 3000, tokensOut: 125, finishReason: 'STOP' })
    expect(answer.toolCalls).toEqual([{ name: 'getMatchDebrief', args: { matchId: 'm1' } }])
    const second = bodyOf(fetchMock, 1)
    expect(second.contents.slice(-2)).toEqual([
      { role: 'model', parts: [{ functionCall: { name: 'getMatchDebrief', args: { matchId: 'm1' } }, thoughtSignature: 'sig-1' }] },
      { role: 'user', parts: [{ functionResponse: { name: 'getMatchDebrief', response: { result: { placement: 3 } } } }] },
    ])
  })

  it('arrête les outils au-delà de la limite de tours', async () => {
    const fetchMock = vi.fn(async () => sse([callChunk('getMatchDebrief', { matchId: 'm1' })]))
    const provider = createGeminiProvider({ apiKey: 'k', fetchImpl: fetchMock as unknown as typeof fetch })
    const answer = await provider.streamAnswer(request({ maxToolRounds: 2 }))
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(answer.toolCalls).toHaveLength(2)
    expect(answer.finishReason).toBe('TOOL_LIMIT')
    expect(answer.text).toBe('')
  })

  it('transmet l’échec d’un outil au modèle sans casser la réponse', async () => {
    const silence = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sse([callChunk('getMatchDebrief', { matchId: 'm1' })]))
      .mockResolvedValueOnce(sse([textChunk('Pas de donnée.'), usage(10, 5)]))
    const provider = createGeminiProvider({ apiKey: 'k', fetchImpl: fetchMock as unknown as typeof fetch })
    const answer = await provider.streamAnswer(request({ runTool: vi.fn(async () => { throw new Error('boom') }) }))
    expect(answer.text).toBe('Pas de donnée.')
    expect(bodyOf(fetchMock, 1).contents.at(-1).parts[0].functionResponse.response).toHaveProperty('error')
    silence.mockRestore()
  })

  it('réessaie sans réglage de réflexion quand le modèle le refuse', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('thinkingLevel not supported', { status: 400 }))
      .mockResolvedValueOnce(sse([textChunk('OK'), usage(10, 2)]))
    const provider = createGeminiProvider({ apiKey: 'k', fetchImpl: fetchMock as unknown as typeof fetch })
    const answer = await provider.streamAnswer(request())
    expect(answer).toMatchObject({ text: 'OK', rounds: 1 })
    expect(bodyOf(fetchMock, 0).generationConfig.thinkingConfig).toBeDefined()
    expect(bodyOf(fetchMock, 1).generationConfig.thinkingConfig).toBeUndefined()
  })

  it('classe les erreurs du fournisseur', async () => {
    const provider = (status: number) =>
      createGeminiProvider({ apiKey: 'k', fetchImpl: (async () => new Response('{"error":"x"}', { status })) as unknown as typeof fetch })
    await expect(provider(429).streamAnswer(request())).rejects.toMatchObject({ code: 'rate_limited', status: 429 })
    await expect(provider(503).streamAnswer(request())).rejects.toMatchObject({ code: 'unavailable', status: 503 })
    await expect(provider(403).streamAnswer(request())).rejects.toMatchObject({ code: 'unauthorized' })
    await expect(provider(404).streamAnswer(request())).rejects.toMatchObject({ code: 'bad_request' })
    const network = createGeminiProvider({ apiKey: 'k', fetchImpl: (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch })
    await expect(network.streamAnswer(request())).rejects.toBeInstanceOf(CoachProviderError)
    await expect(network.streamAnswer(request())).rejects.toMatchObject({ code: 'network' })
  })

  it('signale un abandon du client', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      if (init.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' })
      return sse([])
    })
    const provider = createGeminiProvider({ apiKey: 'k', fetchImpl: fetchMock as unknown as typeof fetch })
    await expect(provider.streamAnswer(request({ signal: controller.signal }))).rejects.toMatchObject({ code: 'aborted' })
  })
})
