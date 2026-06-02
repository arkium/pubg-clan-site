import { createWriteStream } from 'node:fs'
import { mkdir, unlink } from 'node:fs/promises'
import path from 'node:path'
import { once } from 'node:events'

const DEFAULT_CAPTURE_MAX_BYTES = 10 * 1024 * 1024
const HARD_CAPTURE_MAX_BYTES = 50 * 1024 * 1024

const SENSITIVE_STRING_KEYS = new Set([
  'accountId',
  'playerId',
  'characterId',
  'killerName',
  'victimName',
  'attackerName',
  'reviverName',
  'helperName',
  'targetName',
  'teammateName',
  'playerName',
])

function sanitizeFileSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

function createEventAnonymizer() {
  const playerMap = new Map<string, string>()
  const teamMap = new Map<string, number>()

  function mapPlayer(value: string) {
    const existing = playerMap.get(value)
    if (existing) {
      return existing
    }

    const next = `player_${String(playerMap.size + 1).padStart(3, '0')}`
    playerMap.set(value, next)
    return next
  }

  function mapTeam(value: number) {
    const key = String(value)
    const existing = teamMap.get(key)
    if (existing !== undefined) {
      return existing
    }

    const next = 1000 + teamMap.size + 1
    teamMap.set(key, next)
    return next
  }

  function sanitizeValue(value: unknown, parentKey: string | null): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item, parentKey))
    }

    if (!value || typeof value !== 'object') {
      return value
    }

    const output: Record<string, unknown> = {}

    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (typeof entry === 'string') {
        if (SENSITIVE_STRING_KEYS.has(key) || (parentKey === 'character' && key === 'name')) {
          output[key] = mapPlayer(entry)
          continue
        }

        output[key] = entry
        continue
      }

      if (typeof entry === 'number') {
        if (key === 'teamId') {
          output[key] = mapTeam(entry)
          continue
        }

        output[key] = entry
        continue
      }

      output[key] = sanitizeValue(entry, key)
    }

    return output
  }

  return (event: unknown) => sanitizeValue(event, null)
}

export function getTelemetryFixtureCaptureMaxBytes() {
  const value = Number(process.env.TELEMETRY_CAPTURE_FIXTURE_MAX_BYTES ?? String(DEFAULT_CAPTURE_MAX_BYTES))
  if (!Number.isFinite(value) || value <= 0) {
    return DEFAULT_CAPTURE_MAX_BYTES
  }

  return Math.min(Math.floor(value), HARD_CAPTURE_MAX_BYTES)
}

export function isTelemetryFixtureCaptureEnabled() {
  return process.env.TELEMETRY_CAPTURE_FIXTURES === 'true'
}

export async function captureTelemetryFixtureFromStream(input: {
  stream: ReadableStream<Uint8Array>
  squadMatchId: string
  pubgMatchId: string
}) {
  const captureMaxBytes = getTelemetryFixtureCaptureMaxBytes()
  const reader = input.stream.getReader()
  const decoder = new TextDecoder()
  const anonymizeEvent = createEventAnonymizer()

  const configuredDir = process.env.TELEMETRY_CAPTURE_FIXTURES_DIR?.trim()
  const outputDir = configuredDir && configuredDir.length > 0
    ? path.resolve(/*turbopackIgnore: true*/ process.cwd(), configuredDir)
    : path.join(/*turbopackIgnore: true*/ process.cwd(), '.telemetry-captured')

  await mkdir(outputDir, { recursive: true })

  const now = new Date()
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`

  const fileName = `telemetry-real-${stamp}-${sanitizeFileSegment(input.pubgMatchId)}-${sanitizeFileSegment(input.squadMatchId)}.json`
  const filePath = path.join(outputDir, fileName)

  const writer = createWriteStream(filePath, { encoding: 'utf-8' })

  let bytesRead = 0
  let eventCount = 0
  let wasTruncated = false
  let arrayStarted = false
  let arrayClosed = false
  let objectDepth = 0
  let inString = false
  let escapeNext = false
  let currentObject = ''
  let wroteFirstEvent = false

  try {
    writer.write('[')

  function writeEvent(event: unknown) {
    const sanitized = anonymizeEvent(event)
    const payload = JSON.stringify(sanitized)

    if (wroteFirstEvent) {
      writer.write(',\n')
    } else {
      writer.write('\n')
      wroteFirstEvent = true
    }

    writer.write(`  ${payload}`)
    eventCount += 1
  }

  function consumeText(text: string) {
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index]

      if (!arrayStarted) {
        if (/\s/u.test(character)) {
          continue
        }

        if (character !== '[') {
          throw new Error('Captured telemetry payload must be a JSON array')
        }

        arrayStarted = true
        continue
      }

      if (arrayClosed) {
        if (/\s/u.test(character)) {
          continue
        }

        throw new Error('Captured telemetry stream contains trailing content after JSON array')
      }

      if (objectDepth === 0) {
        if (/\s/u.test(character) || character === ',') {
          continue
        }

        if (character === ']') {
          arrayClosed = true
          continue
        }

        if (character === '{') {
          objectDepth = 1
          currentObject = '{'
          inString = false
          escapeNext = false
          continue
        }

        throw new Error('Captured telemetry array must contain JSON objects')
      }

      currentObject += character

      if (inString) {
        if (escapeNext) {
          escapeNext = false
          continue
        }

        if (character === '\\') {
          escapeNext = true
          continue
        }

        if (character === '"') {
          inString = false
        }

        continue
      }

      if (character === '"') {
        inString = true
        continue
      }

      if (character === '{') {
        objectDepth += 1
        continue
      }

      if (character === '}') {
        objectDepth -= 1

        if (objectDepth === 0) {
          let parsedEvent: unknown
          try {
            parsedEvent = JSON.parse(currentObject)
          } catch {
            throw new Error('Captured telemetry stream contains invalid JSON object event')
          }

          writeEvent(parsedEvent)
          currentObject = ''
          inString = false
          escapeNext = false
        }
      }
    }
  }

    try {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) {
          break
        }

        const chunkBytes = chunk.value.byteLength
        const nextBytesRead = bytesRead + chunkBytes

        if (nextBytesRead <= captureMaxBytes) {
          bytesRead = nextBytesRead
          consumeText(decoder.decode(chunk.value, { stream: true }))
          continue
        }

        const remainingBytes = captureMaxBytes - bytesRead
        if (remainingBytes > 0) {
          const partialChunk = chunk.value.slice(0, remainingBytes)
          bytesRead += partialChunk.byteLength
          consumeText(decoder.decode(partialChunk, { stream: true }))
        }

        wasTruncated = true
        // Do not await cancel on a tee() branch to avoid deadlock while the parser branch is still active.
        void reader.cancel('capture max bytes reached')
        break
      }

      if (!wasTruncated) {
        consumeText(decoder.decode())
      }
    } finally {
      reader.releaseLock()
    }

    writer.write('\n]\n')
    writer.end()
    await once(writer, 'finish')

    if (!arrayStarted) {
      throw new Error('Captured telemetry stream is empty')
    }

    if (!wasTruncated) {
      if (objectDepth !== 0 || inString || escapeNext) {
        throw new Error('Captured telemetry stream ended before JSON object was fully parsed')
      }

      if (!arrayClosed) {
        throw new Error('Captured telemetry stream ended before closing JSON array')
      }
    }

    return {
      filePath,
      eventCount,
      bytesRead,
      wasTruncated,
    }
  } catch (error) {
    writer.destroy()
    try {
      await unlink(filePath)
    } catch {
      // Ignore cleanup failures for partially written capture files.
    }
    throw error
  }
}
