import { syncTrackedClanStats } from '@/lib/clan-service'

export async function GET() {
  try {
    await syncTrackedClanStats(7)
    return Response.json({ success: true })
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}
