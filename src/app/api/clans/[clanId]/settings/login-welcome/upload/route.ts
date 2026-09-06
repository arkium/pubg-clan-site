import { promises as fs } from 'node:fs'
import path from 'node:path'

import { getActorMemberId, requirePermission } from '@/middleware/auth-permission'
import { resolveUploadDirectories, validateImageUpload } from '@/lib/upload-image-validator'

function parseClanId(value: string) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  const { clanId: clanIdParam } = await params
  const clanId = parseClanId(clanIdParam)

  if (!clanId) {
    return Response.json({ error: 'Identifiant de clan invalide' }, { status: 400 })
  }

  const memberId = await getActorMemberId(request)
  if (!memberId) {
    return Response.json({ error: 'Non autorisé' }, { status: 401 })
  }

  const checkPermission = requirePermission('manage_settings')
  const permissionError = await checkPermission(request, { clanId })
  if (permissionError) {
    return permissionError
  }

  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!file || typeof file === 'string' || !(file instanceof Blob)) {
      return Response.json({ error: 'Aucun fichier sélectionné' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const fileName = (file as { name?: string }).name || `upload-${Date.now()}`

    const validation = validateImageUpload(fileName, buffer)
    if (!validation.valid) {
      return Response.json({ error: validation.error }, { status: 400 })
    }

    const savedFileName = `clan-${clanId}-${Date.now()}.${validation.format.ext}`
    const { primaryDir, mirrorDir } = resolveUploadDirectories('clans')

    // 1. Sauvegarde dans le dossier racine persistant
    await fs.mkdir(primaryDir, { recursive: true })
    await fs.writeFile(path.join(primaryDir, savedFileName), buffer)

    // 2. Sauvegarde miroir dans .next/standalone si applicable (pour service immédiat sans restart)
    if (mirrorDir && mirrorDir !== primaryDir) {
      try {
        await fs.mkdir(mirrorDir, { recursive: true })
        await fs.writeFile(path.join(mirrorDir, savedFileName), buffer)
      } catch (mirrorError) {
        console.warn('[upload] Impossible d’écrire dans le dossier miroir standalone (non bloquant):', mirrorError)
      }
    }

    const imageUrl = `/uploads/clans/${savedFileName}`

    return Response.json({ imageUrl, success: true })
  } catch (error) {
    console.error('Upload error:', error)
    return Response.json({ error: "Erreur lors de l'upload de l'image sur le serveur" }, { status: 500 })
  }
}
