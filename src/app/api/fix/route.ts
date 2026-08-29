import { syncTrackedClanStats } from '@/lib/clan-service'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    await syncTrackedClanStats(7)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
