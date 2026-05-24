import { NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { initializeDefaultRoles } from '@/lib/role-service'
import { requirePermission } from '@/middleware/auth-permission'

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
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const permissionError = await requirePermission('manage_roles')(request, {
      clanId: parsedClanId,
    })
    if (permissionError) {
      return permissionError
    }

    const clan = await prisma.clan.findUnique({
      where: { id: parsedClanId },
      select: { id: true },
    })

    if (!clan) {
      return NextResponse.json({ error: 'Clan not found' }, { status: 404 })
    }

    const roles = await initializeDefaultRoles(parsedClanId)
    const permissions = await prisma.permission.findMany({
      orderBy: [{ category: 'asc' }, { key: 'asc' }],
    })

    return NextResponse.json({ roles, permissions })
  } catch (error) {
    console.error('Error fetching clan roles:', error)
    return NextResponse.json({ error: 'Failed to fetch clan roles' }, { status: 500 })
  }
}
