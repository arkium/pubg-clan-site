export type DownloadTelemetryOptions = {
  timeoutMs: number
  maxAssetSizeBytes: number
}

export type DownloadTelemetryResult = {
  stream: ReadableStream<Uint8Array>
  contentLength: number | null
  contentType: string | null
}

export async function readTelemetryStreamAsText(
  stream: ReadableStream<Uint8Array>,
  maxBytes: number
): Promise<{ text: string; bytesRead: number }> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let bytesRead = 0
  let text = ''

  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) {
        break
      }

      bytesRead += chunk.value.byteLength
      if (bytesRead > maxBytes) {
        throw new Error(`Telemetry asset exceeded max size while streaming (${bytesRead} bytes)`)
      }

      text += decoder.decode(chunk.value, { stream: true })
    }

    text += decoder.decode()
    return { text, bytesRead }
  } finally {
    reader.releaseLock()
  }
}

function parseContentLength(headerValue: string | null) {
  if (!headerValue) {
    return null
  }

  const parsed = Number(headerValue)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null
  }

  return parsed
}

export async function downloadTelemetryFromAsset(
  url: string,
  options: DownloadTelemetryOptions
): Promise<DownloadTelemetryResult> {
  if (!url || typeof url !== 'string') {
    throw new Error('Telemetry asset URL is required')
  }

  const normalizedUrl = url.trim()

  if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
    throw new Error('Telemetry asset URL must be absolute')
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error('Telemetry timeout must be greater than 0')
  }

  if (!Number.isFinite(options.maxAssetSizeBytes) || options.maxAssetSizeBytes <= 0) {
    throw new Error('Telemetry max asset size must be greater than 0')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs)

  try {
    const response = await fetch(normalizedUrl, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'follow',
    })

    if (!response.ok) {
      throw new Error(`Telemetry asset download failed (${response.status})`)
    }

    const contentLength = parseContentLength(response.headers.get('content-length'))

    if (contentLength !== null && contentLength > options.maxAssetSizeBytes) {
      throw new Error(`Telemetry asset too large (${contentLength} bytes)`)
    }

    if (!response.body) {
      throw new Error('Telemetry asset has no body stream')
    }

    return {
      stream: response.body,
      contentLength,
      contentType: response.headers.get('content-type'),
    }
  } finally {
    clearTimeout(timeout)
  }
}
