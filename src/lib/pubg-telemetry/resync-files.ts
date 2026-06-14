import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import type { Readable } from 'node:stream'

import { syncTelemetryForSquadMatchFromStream } from '@/lib/pubg-telemetry/manual-sync'

function nodeReadableToWebStream(readable: Readable): ReadableStream<Uint8Array> {
  const toUint8Array = (chunk: unknown): Uint8Array => {
    if (chunk instanceof Uint8Array) return chunk
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(chunk)) {
      return new Uint8Array(chunk)
    }
    if (typeof chunk === 'string') {
      return new TextEncoder().encode(chunk)
    }
    throw new Error(`Unsupported stream chunk type: ${typeof chunk}`)
  }

  let closed = false
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null

  const cleanup = () => {
    readable.off('readable', onReadable)
    readable.off('end', onEnd)
    readable.off('error', onError)
  }

  const onError = (err: unknown) => {
    if (closed) return
    closed = true
    cleanup()
    controllerRef?.error(err)
    controllerRef = null
  }

  const onEnd = () => {
    if (closed) return
    closed = true
    cleanup()
    controllerRef?.close()
    controllerRef = null
  }

  const drain = () => {
    const controller = controllerRef
    if (!controller || closed) return
    try {
      while ((controller.desiredSize ?? 1) > 0) {
        const chunk = readable.read() as unknown
        if (chunk === null) break
        controller.enqueue(toUint8Array(chunk))
      }
    } catch (err) {
      onError(err)
    }
  }

  const onReadable = () => {
    drain()
  }

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller
      readable.on('readable', onReadable)
      readable.on('end', onEnd)
      readable.on('error', onError)
      // Drain immediately when data is already buffered.
      drain()
    },
    pull() {
      // Required when backpressure paused enqueueing while data was still buffered.
      drain()
    },
    cancel() {
      closed = true
      cleanup()
      controllerRef = null
      readable.destroy()
    },
  })
}

function sanitizeFileSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

export function resolveCaptureDirectory() {
  const configuredDir = process.env.TELEMETRY_CAPTURE_FIXTURES_DIR?.trim()
  return configuredDir && configuredDir.length > 0
    ? path.resolve(/*turbopackIgnore: true*/ process.cwd(), configuredDir)
    : path.join(/*turbopackIgnore: true*/ process.cwd(), '.telemetry-captured')
}

export async function findLatestCapturedFileForSquadMatch(
  captureDir: string,
  squadMatchId: string
): Promise<{ filePath: string; size: number } | null> {
  const fileSuffix = `-${sanitizeFileSegment(squadMatchId)}.json`

  let files: string[] = []
  try {
    files = await readdir(captureDir)
  } catch {
    return null
  }

  const candidates = files.filter((fileName) => fileName.endsWith(fileSuffix))
  if (candidates.length === 0) {
    return null
  }

  let bestFile: { filePath: string; size: number; mtimeMs: number } | null = null

  for (const fileName of candidates) {
    const filePath = path.join(/*turbopackIgnore: true*/ captureDir, fileName)
    try {
      const details = await stat(filePath)
      if (!details.isFile()) {
        continue
      }

      if (!bestFile || details.mtimeMs > bestFile.mtimeMs) {
        bestFile = {
          filePath,
          size: details.size,
          mtimeMs: details.mtimeMs,
        }
      }
    } catch {
      // Ignore inaccessible candidate and continue.
    }
  }

  if (!bestFile) {
    return null
  }

  return {
    filePath: bestFile.filePath,
    size: bestFile.size,
  }
}

const MB = 1024 * 1024

// Adaptive position sampling: coarser interval for large files to stay within Prisma's JSON size limits.
// < 5 MB  → 10s  (~1 800 samples max for 100 players / 30 min)
// 5–15 MB → 20s  (~900 samples)
// ≥ 15 MB → 30s  (~600 samples)
function resolvePositionSampleInterval(fileSizeBytes: number): number {
  const envValue = Number(process.env.TELEMETRY_POSITION_SAMPLE_INTERVAL_SECONDS ?? '')
  if (Number.isFinite(envValue) && envValue >= 5 && envValue <= 300) {
    return Math.floor(envValue)
  }
  if (fileSizeBytes >= 15 * MB) return 30
  if (fileSizeBytes >= 5 * MB) return 20
  return 10
}

function resolveShotClusterRadiusMeters(): number {
  const envValue = Number(process.env.TELEMETRY_SHOT_CLUSTER_RADIUS_METERS ?? '')
  if (Number.isFinite(envValue) && envValue >= 1 && envValue <= 1000) {
    return Math.floor(envValue)
  }
  return 50
}

function resolveDamageClusterRadiusMeters(): number {
  const envValue = Number(process.env.TELEMETRY_DAMAGE_CLUSTER_RADIUS_METERS ?? '')
  if (Number.isFinite(envValue) && envValue >= 1 && envValue <= 1000) {
    return Math.floor(envValue)
  }
  return 30
}

export type ResyncFromCapturedFileResult =
  | { status: 'missing' }
  | {
      status: 'oversized'
      size: number
    }
  | {
      status: 'validated'
      size: number
    }
  | {
      status: 'processed'
      size: number
      result: Awaited<ReturnType<typeof syncTelemetryForSquadMatchFromStream>>
    }

export async function resyncTelemetryFromCapturedFile(input: {
  clanId: number
  squadMatchId: string
  captureDir: string
  maxResyncFileBytes: number
  validateOnly?: boolean
}): Promise<ResyncFromCapturedFileResult> {
  const capturedFile = await findLatestCapturedFileForSquadMatch(input.captureDir, input.squadMatchId)
  if (!capturedFile) {
    return { status: 'missing' }
  }

  if (capturedFile.size > input.maxResyncFileBytes) {
    return {
      status: 'oversized',
      size: capturedFile.size,
    }
  }

  if (input.validateOnly) {
    return { status: 'validated', size: capturedFile.size }
  }

  const nodeStream = createReadStream(capturedFile.filePath, { highWaterMark: 64 * 1024 })
  const webStream = nodeReadableToWebStream(nodeStream)
  const result = await syncTelemetryForSquadMatchFromStream({
    clanId: input.clanId,
    squadMatchId: input.squadMatchId,
    stream: webStream,
    contentLength: capturedFile.size,
    minPositionSampleIntervalSeconds: resolvePositionSampleInterval(capturedFile.size),
    shotClusterRadiusMeters: resolveShotClusterRadiusMeters(),
    damageClusterRadiusMeters: resolveDamageClusterRadiusMeters(),
  })

  return {
    status: 'processed',
    size: capturedFile.size,
    result,
  }
}