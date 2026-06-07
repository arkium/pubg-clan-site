import os from 'node:os'

import { NextResponse } from 'next/server'

import { requireRole } from '@/middleware/auth-permission'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export const dynamic = 'force-dynamic'

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

    const roleError = await requireRole(['Owner'])(request, {
      clanId: parsedClanId,
    })
    if (roleError) {
      return roleError
    }

    return NextResponse.json({
      ok: true,
      clanId: parsedClanId,
      runtime: {
        pid: process.pid,
        nodeVersion: process.version,
        uptimeSec: Math.floor(process.uptime()),
        hostname: os.hostname(),
      },
    })
  } catch (error) {
    console.error('Runtime status failed:', error)
    return NextResponse.json({ error: 'Failed to read runtime status' }, { status: 500 })
  }
}