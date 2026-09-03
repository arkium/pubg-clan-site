import { getSessionFromRequest } from '@/lib/auth-session'
import { prisma } from '@/lib/prisma'

const ALLOWED_TABLES = new Set([
  'SquadMatchTelemetry',
  'EncounteredPlayer',
  'ClanEncounter',
  'Player',
  'PositionMetricCell',
  'PubgApiCallLog',
  'KillEvent',
  'CronExecution',
])

export async function POST(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!session.isSuperUser) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      table?: string
      action?: 'optimize' | 'analyze'
    }

    const table = body?.table || 'SquadMatchTelemetry'
    const action = body?.action === 'analyze' ? 'analyze' : 'optimize'

    if (!ALLOWED_TABLES.has(table)) {
      return Response.json({ error: `Table non autorisée : ${table}` }, { status: 400 })
    }

    const t0 = Date.now()

    if (action === 'analyze') {
      await prisma.$executeRawUnsafe(`ANALYZE TABLE \`${table}\``)
    } else {
      await prisma.$queryRawUnsafe(`OPTIMIZE TABLE \`${table}\``)
    }

    const durationMs = Date.now() - t0

    const [updatedStats] = await prisma.$queryRaw<
      Array<{
        table_name: string
        row_count: number
        data_size_mb: number
        index_size_mb: number
        total_size_mb: number
        data_free_mb: number
      }>
    >`
      SELECT 
        table_name AS table_name,
        table_rows AS row_count,
        ROUND(data_length / 1024 / 1024, 2) AS data_size_mb,
        ROUND(index_length / 1024 / 1024, 2) AS index_size_mb,
        ROUND((data_length + index_length) / 1024 / 1024, 2) AS total_size_mb,
        ROUND(data_free / 1024 / 1024, 2) AS data_free_mb
      FROM information_schema.TABLES
      WHERE table_schema = DATABASE() AND table_name = ${table};
    `

    return Response.json({
      ok: true,
      table,
      action,
      durationMs,
      stats: updatedStats
        ? {
            tableName: String(updatedStats.table_name),
            rowCount: Number(updatedStats.row_count || 0),
            dataSizeMb: Number(updatedStats.data_size_mb || 0),
            indexSizeMb: Number(updatedStats.index_size_mb || 0),
            totalSizeMb: Number(updatedStats.total_size_mb || 0),
            dataFreeMb: Number(updatedStats.data_free_mb || 0),
          }
        : null,
      message:
        action === 'analyze'
          ? `Statistiques de la table ${table} recalculées avec succès.`
          : `Table ${table} compactée avec succès : espace disque restitué.`,
    })
  } catch (error: any) {
    console.error('Erreur lors de l’optimisation de la table:', error)
    return Response.json(
      { error: error?.message || 'Échec de l’optimisation de la table' },
      { status: 500 }
    )
  }
}
