import { promises as fs } from 'node:fs'
import path from 'node:path'

import { detectImageMagicBytes, resolveUploadDirectories } from '@/lib/upload-image-validator'

function sanitizeFileName(input: string): string | null {
  // Empêche toute tentative de path traversal
  const base = path.basename(input)
  if (!base || base.includes('..') || !/^[a-zA-Z0-9_.-]+$/.test(base)) {
    return null
  }
  return base
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ fileName: string }> }
) {
  const { fileName: rawFileName } = await params
  const fileName = sanitizeFileName(rawFileName)

  if (!fileName) {
    return new Response('Not Found', { status: 404 })
  }

  const { primaryDir, mirrorDir } = resolveUploadDirectories('clans')

  let fileBuffer: Buffer | null = null

  // 1. Cherche dans le répertoire principal persistant
  const primaryPath = path.join(primaryDir, fileName)
  try {
    fileBuffer = await fs.readFile(primaryPath)
  } catch {
    // 2. Si introuvable, tente dans le répertoire miroir standalone
    if (mirrorDir) {
      try {
        fileBuffer = await fs.readFile(path.join(mirrorDir, fileName))
      } catch {
        fileBuffer = null
      }
    }
  }

  if (!fileBuffer) {
    return new Response('File Not Found', { status: 404 })
  }

  const detected = detectImageMagicBytes(fileBuffer)
  const contentType = detected?.mime || 'image/jpeg'

  return new Response(new Uint8Array(fileBuffer), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
