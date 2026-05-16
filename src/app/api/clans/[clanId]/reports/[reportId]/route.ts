import { NextResponse } from 'next/server'

import { getReportDetail } from '@/lib/report-generator'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ clanId: string; reportId: string }> }
) {
  try {
    const { clanId, reportId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    if (!reportId) {
      return NextResponse.json({ error: 'Invalid report id' }, { status: 400 })
    }

    const payload = await getReportDetail(parsedClanId, reportId)

    if (!payload) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Error fetching report detail:', error)
    return NextResponse.json({ error: 'Failed to fetch report detail' }, { status: 500 })
  }
}
