import { requireSuperUser } from '@/middleware/auth-permission'
import { prisma } from '@/lib/prisma'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const permissionError = await requireSuperUser(request)
  if (permissionError) {
    return permissionError
  }

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const isFavorite = (body as { isFavorite?: unknown })?.isFavorite
  if (typeof isFavorite !== 'boolean') {
    return Response.json({ error: 'isFavorite must be a boolean' }, { status: 400 })
  }

  try {
    const opponentClan = await prisma.opponentClan.update({
      where: { id },
      data: { isFavorite },
      select: { id: true, isFavorite: true },
    })
    return Response.json(opponentClan)
  } catch {
    return Response.json({ error: 'Opponent clan not found' }, { status: 404 })
  }
}
