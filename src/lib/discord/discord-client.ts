export type DiscordEmbedField = {
  name: string
  value: string
  inline?: boolean
}

export type DiscordEmbed = {
  title?: string
  description?: string
  url?: string
  color?: number
  timestamp?: string
  fields?: DiscordEmbedField[]
  footer?: { text: string }
  thumbnail?: { url: string }
  image?: { url: string }
}

export type DiscordWebhookPayload = {
  content?: string
  username?: string
  embeds: DiscordEmbed[]
}

export type DiscordSendResult =
  | { ok: true; status: number }
  | { ok: false; status: number | null; error: string }

const REQUEST_TIMEOUT_MS = 5_000
const MAX_RATE_LIMIT_WAIT_MS = 5_000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseRetryAfterMs(body: string, headerValue: string | null) {
  try {
    const parsed = JSON.parse(body) as { retry_after?: unknown }
    if (typeof parsed.retry_after === 'number' && Number.isFinite(parsed.retry_after)) {
      return Math.min(parsed.retry_after * 1000, MAX_RATE_LIMIT_WAIT_MS)
    }
  } catch {
    // corps non JSON : on retombe sur l'en-tete
  }

  const fromHeader = Number(headerValue)
  if (Number.isFinite(fromHeader) && fromHeader > 0) {
    return Math.min(fromHeader * 1000, MAX_RATE_LIMIT_WAIT_MS)
  }

  return 1_000
}

async function postOnce(url: string, payload: DiscordWebhookPayload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  return { response, body: await response.text().catch(() => '') }
}

/**
 * Poste un payload sur un webhook Discord. Ne leve jamais : toute erreur reseau
 * ou HTTP est renvoyee dans le resultat, pour qu'un echec Discord ne fasse
 * jamais echouer la synchronisation PUBG appelante.
 */
export async function sendDiscordWebhook(
  url: string,
  payload: DiscordWebhookPayload
): Promise<DiscordSendResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { response, body } = await postOnce(url, payload)

      if (response.ok) {
        return { ok: true, status: response.status }
      }

      if (response.status === 429 && attempt === 0) {
        await sleep(parseRetryAfterMs(body, response.headers.get('retry-after')))
        continue
      }

      return {
        ok: false,
        status: response.status,
        error: body.slice(0, 500) || `Discord a repondu ${response.status}`,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return {
        ok: false,
        status: null,
        error: message.includes('timed out') || message.includes('abort')
          ? `Discord n'a pas repondu en moins de ${REQUEST_TIMEOUT_MS / 1000}s`
          : message,
      }
    }
  }

  return { ok: false, status: 429, error: 'Discord a limite le debit (429) apres une nouvelle tentative' }
}
