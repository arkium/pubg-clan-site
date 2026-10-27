import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

import FirstRunSetup from '@/components/FirstRunSetup'
import HomeShowcase from '@/components/home/HomeShowcase'
import PendingActivation from '@/components/PendingActivation'
import { isAuthDisabled } from '@/lib/auth-mode'
import { getSessionFromToken } from '@/lib/auth-session'
import { getCoachSettings, hasCoachApiKey } from '@/lib/coach/coach-config'
import { homeLandingRedirect, memberProfileHref } from '@/lib/home-landing'
import { getHomeShowcaseIfReady } from '@/lib/home-showcase-service'
import { prisma } from '@/lib/prisma'
import { homeJsonLd, siteUrl } from '@/lib/seo/page-seo'
import { getSetupState } from '@/lib/setup-service'

export const dynamic = 'force-dynamic'

export default async function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const setupState = await getSetupState()

  if (setupState === 'first_run') {
    return <FirstRunSetup />
  }

  if (setupState === 'pending_activation') {
    return <PendingActivation />
  }

  // Un membre connecté atterrit sur son profil (décision du 2026-10-27, docs/features/accueil.md) ; il retrouve la
  // vitrine par l'entrée « Accueil » du menu (`?vitrine`), avec « Mon espace » et « Mon clan » au lieu de
  // « Se connecter » et « Inscrire mon clan ». Un cookie expiré ne donne pas de session : la vitrine s'affiche en
  // visiteur, sans redirection vers /login.
  const cookieStore = await cookies()
  const session = await getSessionFromToken(cookieStore.get('pubg_clan_session')?.value ?? null)
  const landing = homeLandingRedirect(session, await searchParams)
  if (landing) redirect(landing)
  const accountHref = session ? (session.activeMemberId ? memberProfileHref(session.activeMemberId) : '/members') : null
  const activeClanId = session?.activeMemberId
    ? (await prisma.clanMember.findUnique({ where: { id: session.activeMemberId }, select: { clanId: true } }))?.clanId ?? null
    : null
  const clanHref = activeClanId ? `/clans/${activeClanId}/overview` : null

  // Vitrine dans le HTML quand son cache est prêt (docs/TODO/geo-seo-propositions.md, lot 2) ; jamais d'attente d'une
  // lecture à froid : elle continue en arrière-plan et le navigateur charge la vitrine par l'API.
  const initialShowcase = await getHomeShowcaseIfReady()
  // Carte « Coach IA » seulement quand il est ouvert aux membres (docs/TODO/chatbot-ia.md §8.7) : réglage en cache 30 s.
  const coachOpen = hasCoachApiKey() && (await getCoachSettings()).enabled

  // Titre, description et aperçus : layout racine (src/lib/seo/page-seo.ts) ; ici, les données structurées du site.
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: homeJsonLd(siteUrl()) }} />
      <HomeShowcase visitorMode={isAuthDisabled()} accountHref={accountHref} clanHref={clanHref} initialShowcase={initialShowcase} coachOpen={coachOpen} />
    </>
  )
}
