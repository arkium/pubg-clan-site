import { NextResponse } from 'next/server'

import { getSessionFromRequest } from '@/lib/auth-session'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!session.isSuperUser) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const rawTables = await prisma.$queryRaw<
      Array<{
        table_name: string
        row_count: number
        data_size_mb: number
        index_size_mb: number
        total_size_mb: number
      }>
    >`
      SELECT 
        table_name AS table_name,
        table_rows AS row_count,
        ROUND(data_length / 1024 / 1024, 2) AS data_size_mb,
        ROUND(index_length / 1024 / 1024, 2) AS index_size_mb,
        ROUND((data_length + index_length) / 1024 / 1024, 2) AS total_size_mb
      FROM information_schema.TABLES
      WHERE table_schema = DATABASE()
      ORDER BY (data_length + index_length) DESC;
    `

    // Because prisma.$queryRaw returns values exactly as they come from the driver,
    // they might be Decimal/BigInt types depending on the mysql driver.
    // We convert them safely to Number.
    const tables = rawTables.map(t => ({
      tableName: String(t.table_name),
      rowCount: Number(t.row_count || 0),
      dataSizeMb: Number(t.data_size_mb || 0),
      indexSizeMb: Number(t.index_size_mb || 0),
      totalSizeMb: Number(t.total_size_mb || 0),
    }))

    const globalStats = tables.reduce(
      (acc, t) => {
        acc.totalDataMb += t.dataSizeMb
        acc.totalIndexMb += t.indexSizeMb
        acc.totalSizeMb += t.totalSizeMb
        return acc
      },
      { totalDataMb: 0, totalIndexMb: 0, totalSizeMb: 0 }
    )

    return NextResponse.json({
      globalStats,
      tables,
    })
  } catch (error) {
    console.error('Failed to fetch database stats:', error)
    return NextResponse.json({ error: 'Failed to fetch database stats' }, { status: 500 })
  }
}
