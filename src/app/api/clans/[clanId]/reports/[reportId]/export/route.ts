import { NextRequest, NextResponse } from 'next/server'

import { requireNavPermission } from '@/middleware/auth-permission'
import {
  formatReportAsHTML,
  generateReportPdf,
  getReportDetail,
} from '@/lib/report-generator'
import type { ReportExportFormat } from '@/types/reports'

function parseClanId(clanId: string) {
  const parsed = Number(clanId)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function parseFormat(value: string | null): ReportExportFormat {
  if (value === 'json' || value === 'pdf') {
    return value
  }

  return 'html'
}

function buildFilename(reportId: string, format: ReportExportFormat) {
  return `report-${reportId}.${format === 'json' ? 'json' : format}`
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clanId: string; reportId: string }> }
) {
  try {
    const { clanId, reportId } = await params
    const parsedClanId = parseClanId(clanId)

    if (!parsedClanId) {
      return NextResponse.json({ error: 'Invalid clan id' }, { status: 400 })
    }

    const roleError = await requireNavPermission('clan.reports')(request, { clanId: parsedClanId })
    if (roleError) return roleError

    const detail = await getReportDetail(parsedClanId, reportId)

    if (!detail) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 })
    }

    const format = parseFormat(request.nextUrl.searchParams.get('format'))
    const filename = buildFilename(reportId, format)

    if (format === 'json') {
      return new NextResponse(JSON.stringify(detail, null, 2), {
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'content-disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    if (format === 'pdf') {
      const pdf = generateReportPdf(detail)
      return new NextResponse(pdf, {
        headers: {
          'content-type': 'application/pdf',
          'content-disposition': `attachment; filename="${filename}"`,
        },
      })
    }

    const html = formatReportAsHTML(detail)
    return new NextResponse(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (error) {
    console.error('Error exporting report:', error)
    return NextResponse.json({ error: 'Failed to export report' }, { status: 500 })
  }
}
