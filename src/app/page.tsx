import { cookies } from 'next/headers'

import FirstRunSetup from '@/components/FirstRunSetup'
import HomeShowcase from '@/components/home/HomeShowcase'
import PendingActivation from '@/components/PendingActivation'
import { isAuthDisabled } from '@/lib/auth-mode'
import { getSessionFromToken } from '@/lib/auth-session'
import { homeJsonLd, siteUrl } from '@/lib/seo/page-seo'
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

  // La vitrine s'affiche à tous, connectés compris (docs/features/accueil.md) : un membre connecté y trouve
  // « Mon espace » (son tableau de bord, comme après la connexion) au lieu de « Se connecter ».
  // Un cookie expiré ne donne pas de session : la vitrine s'affiche en visiteur, sans redirection vers /login.
  const cookieStore = await cookies()
  const session = await getSessionFromToken(cookieStore.get('pubg_clan_session')?.value ?? null)
  const accountHref = session
    ? session.activeMemberId
      ? `/members/${session.activeMemberId}/dashboard`
      : '/members'
    : null

  // Titre, description et aperçus : layout racine (src/lib/seo/page-seo.ts) ; ici, les données structurées du site.
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: homeJsonLd(siteUrl()) }} />
      <HomeShowcase visitorMode={isAuthDisabled()} accountHref={accountHref} />
    </>
  )
}
