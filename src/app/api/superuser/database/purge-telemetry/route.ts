import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionFromRequest } from '@/lib/auth-session'

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req)
    
    if (!session || !session.isSuperUser) {
      return Response.json({ error: 'Unauthorized' }, { status: 403 })
    }

    // Set JSON columns to MySQL JSON null or empty object/array depending on prisma type. 
    // Usually setting them to DbNull works for Json? 
    // Or we can literally execute raw SQL to make them NULL.
    let affected = 1
    while (affected > 0) {
      const res = await prisma.$executeRaw`UPDATE SquadMatchTelemetry SET positionSamples = NULL, trajectorySegments = NULL WHERE positionSamples IS NOT NULL LIMIT 100`
      affected = res
    }

    return Response.json({ ok: true })
  } catch (err: any) {
    console.error('Error purging telemetry:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
