
import { getSetupState } from '@/lib/setup-service'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const setupState = await getSetupState()
    return Response.json({
      setupState,
      firstRun: setupState === 'first_run',
      pendingActivation: setupState === 'pending_activation',
    })
  } catch (error) {
    console.error('Error checking first-run status:', error)
    return Response.json({ error: 'Failed to check setup status' }, { status: 500 })
  }
}
