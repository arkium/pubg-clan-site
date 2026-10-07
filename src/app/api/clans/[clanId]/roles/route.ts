import { NextRequest } from 'next/server'

import { requireClanFeature } from '@/lib/auth/admin-guards'
import { prisma } from '@/lib/prisma'
import { initializeDefaultRoles } from '@/lib/role-service'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return Response.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    // Lu par la page des membres : même fonctionnalité qu'elle
    const permissionError = await requireClanFeature(request, parsedClanId, 'clan-members')
    if (permissionError) {
      return permissionError
    }

    const clan = await prisma.clan.findUnique({
      where: { id: parsedClanId },
      select: { id: true },
    })

    if (!clan) {
      return Response.json({ error: 'Clan not found' }, { status: 404 })
    }

    const roles = await initializeDefaultRoles(parsedClanId)
    const permissions = await prisma.permission.findMany({
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    })

    return Response.json({ roles, permissions })
  } catch (error) {
    console.error('Error fetching clan roles:', error)
    return Response.json({ error: 'Failed to fetch clan roles' }, { status: 500 })
  }
}
