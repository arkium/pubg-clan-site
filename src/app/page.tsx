import FirstRunSetup from '@/components/FirstRunSetup'
import HomeRedirect from '@/components/HomeRedirect'
import PendingActivation from '@/components/PendingActivation'
import { getSetupState } from '@/lib/setup-service'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const setupState = await getSetupState()

  if (setupState === 'first_run') {
    return <FirstRunSetup />
  }

  if (setupState === 'pending_activation') {
    return <PendingActivation />
  }

  return <HomeRedirect />
}
