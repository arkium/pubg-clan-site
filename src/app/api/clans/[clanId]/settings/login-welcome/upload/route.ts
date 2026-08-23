import { promises as fs } from 'fs'
import path from 'path'

import { getActorMemberId, requirePermission } from '@/middleware/auth-permission'

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
    return Response.json({ error: 'Invalid clan ID' }, { status: 400 })
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
    const file = formData.get('file') as File | null

    if (!file) {
      return Response.json({ error: 'Aucun fichier sélectionné' }, { status: 400 })
    }

    if (!file.type.startsWith('image/')) {
      return Response.json({ error: 'Le fichier doit être une image (JPG, PNG, WEBP)' }, { status: 400 })
    }

    if (file.size > 5 * 1024 * 1024) {
      return Response.json({ error: 'Le fichier est trop volumineux (max 5 MB)' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    
    const ext = file.name.split('.').pop() || 'jpg'
    const fileName = `clan-${clanId}-${Date.now()}.${ext}`
    
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'clans')
    
    await fs.mkdir(uploadDir, { recursive: true })
    
    const filePath = path.join(uploadDir, fileName)
    await fs.writeFile(filePath, buffer)
    
    const imageUrl = `/uploads/clans/${fileName}`

    return Response.json({ imageUrl })
  } catch (error) {
    console.error('Upload error:', error)
    return Response.json({ error: "Erreur lors de l'upload de l'image" }, { status: 500 })
  }
}
