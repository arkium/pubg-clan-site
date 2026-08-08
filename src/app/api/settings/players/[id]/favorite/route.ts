import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSuperUser } from '@/middleware/auth-permission'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const permissionError = await requireSuperUser(req)
    if (permissionError) return permissionError

    const { id } = await params
    const { isFavorite } = await req.json()

    if (typeof isFavorite !== 'boolean') {
      return Response.json({ error: 'Invalid input' }, { status: 400 })
    }

    const updated = await prisma.player.update({
      where: { id },
      data: { isFavorite },
    })

    return Response.json(updated)
  } catch (error: any) {
    console.error('Failed to update favorite:', error)
    if (error.message === 'Forbidden') {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
