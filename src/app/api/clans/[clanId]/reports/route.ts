import { NextRequest, NextResponse } from 'next/server'

import { prisma } from '@/lib/prisma'
import { listReportsForClan } from '@/lib/report-generator'
import { requirePermission } from '@/middleware/auth-permission'
import type { ReportFilterType } from '@/types/reports'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parseIntParam(value: string | null, fallback: number) {
  if (!value) return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) return fallback
  return parsed
}

function parseType(value: string | null): ReportFilterType {
  if (value === 'weekly' || value === 'monthly') {
    return value
  }

  return 'all'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clanId: string }> }
) {
  try {
    const { clanId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const permissionError = await requirePermission('view_reports')(request, {
      clanId: parsedClanId,
      allowMissingActor: true,
      readOnly: true,
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

    const type = parseType(request.nextUrl.searchParams.get('type'))
    const limit = Math.min(parseIntParam(request.nextUrl.searchParams.get('limit'), 10), 50)
    const offset = parseIntParam(request.nextUrl.searchParams.get('offset'), 0)

    const payload = await listReportsForClan(parsedClanId, type, limit, offset)

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Error fetching reports:', error)
    return NextResponse.json({ error: 'Failed to fetch reports' }, { status: 500 })
  }
}
