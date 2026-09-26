import type { Metadata } from 'next'
import { cookies } from 'next/headers'

import FirstRunSetup from '@/components/FirstRunSetup'
import HomeShowcase from '@/components/home/HomeShowcase'
import PendingActivation from '@/components/PendingActivation'
import { isAuthDisabled } from '@/lib/auth-mode'
import { getSessionFromToken } from '@/lib/auth-session'
import { getSetupState } from '@/lib/setup-service'

export const dynamic = 'force-dynamic'

const SITE_NAME = 'chickendinner.fr'
const TITLE = 'chickendinner.fr — stats, classements et Top 1 des clans PUBG'
const DESCRIPTION =
  'Le QG des clans PUBG : chaque partie importée, chaque kill compté, chaque top 1 fêté. Classement des clans, ' +
  'comparateur, tournois et débriefs de parties, au même endroit.'
const SHARE_IMAGE = { url: '/5ec73c01-216b-4991-99cf-5ac7fdbaff30.jpg', width: 1024, height: 434, alt: 'Squad PUBG face au désert' }

/**
 * Métadonnées de la vitrine (docs/features/accueil.md) : titre, description, aperçu de partage (Open Graph, carte
 * large). L'adresse publique vient de `NEXT_PUBLIC_APP_URL` (liens Discord et e-mails) ; sans elle, chickendinner.fr.
 */
export async function generateMetadata(): Promise<Metadata> {
  let base: URL
  try {
    base = new URL(process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://chickendinner.fr')
  } catch {
    base = new URL('https://chickendinner.fr')
  }
  return {
    metadataBase: base,
    title: TITLE,
    description: DESCRIPTION,
    applicationName: SITE_NAME,
    alternates: { canonical: '/' },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'fr_FR',
      url: '/',
      title: TITLE,
      description: DESCRIPTION,
      images: [SHARE_IMAGE],
    },
    twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [SHARE_IMAGE.url] },
  }
}

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

  return <HomeShowcase visitorMode={isAuthDisabled()} accountHref={accountHref} />
}
