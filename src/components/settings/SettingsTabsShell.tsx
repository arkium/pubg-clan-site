'use client'

import { ShieldAlert, ShieldHalf, Users, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect } from 'react'

import AdminPageBanner from '@/components/settings/AdminPageBanner'
import { EmptyState, ListSkeleton } from '@/components/ui/CharteKit'
import MobileDropdownNav from '@/components/ui/MobileDropdownNav'
import { useAuthSession } from '@/hooks/useAuthSession'

export type SettingsTab = { name: string; href: string; description: string }

/** Icônes des en-têtes, nommées : un `layout.tsx` serveur ne peut pas passer un composant à ce composant client. */
const ICONS = { clans: ShieldHalf, players: Users } satisfies Record<string, LucideIcon>

/**
 * En-tête à onglets des pages Plateforme regroupées (`/settings/clans`, `/settings/players`) — lot 3 de
 * docs/TODO/administration.md —, selon la charte UI (docs/ui/index.html) : bandeau photo, onglets soulignés à l'accent
 * dès 768 px, menu déroulant en dessous (jamais de défilement horizontal). La garde serveur est dans le `layout.tsx` ;
 * ici, seulement le renvoi vers la connexion quand la session manque (la garde serveur laisse alors passer, Q21) et le
 * refus d'un non-SuperUser.
 */
export default function SettingsTabsShell({
  title,
  subtitle,
  icon,
  image,
  imagePosition,
  trailHref,
  tabs,
  children,
}: {
  title: string
  subtitle: string
  icon: keyof typeof ICONS
  image: string
  imagePosition?: string
  trailHref: string
  tabs: SettingsTab[]
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { loading, authenticated, isSuperUser } = useAuthSession()

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace(`/login?redirect=${encodeURIComponent(pathname)}`)
    }
  }, [authenticated, loading, pathname, router])

  if (loading) {
    return (
      <div className="app-container app-main game-ui charte flex flex-1 flex-col">
        <ListSkeleton rows={4} />
      </div>
    )
  }

  if (!authenticated) {
    return null
  }

  if (!isSuperUser) {
    return (
      <div className="app-container app-main game-ui charte flex flex-1 flex-col">
        <EmptyState
          icon={ShieldAlert}
          title="Accès restreint"
          text={
            <>
              Cette page est réservée au SuperUser.{' '}
              <Link href="/" className="app-link font-semibold">
                Retour à l’accueil
              </Link>
            </>
          }
        />
      </div>
    )
  }

  const active = tabs.find((tab) => tab.href === pathname) ?? tabs[0]

  return (
    // `.charte` : page écrite selon la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-5">
      <div className="flex flex-col gap-3">
        <AdminPageBanner
          title={title}
          subtitle={subtitle}
          icon={ICONS[icon]}
          image={image}
          imagePosition={imagePosition}
          currentHref={trailHref}
          parent={{ href: '/settings', label: 'Plateforme' }}
          pills={['Réservé au SuperUser']}
        />
        <nav aria-label={`Onglets — ${title}`}>
          <MobileDropdownNav
            id="settings-tabs-nav"
            label={title}
            currentLabel={active.name}
            items={tabs.map((tab) => ({ key: tab.href, label: tab.name, href: tab.href, active: tab.href === active.href }))}
            visibilityClass="md:hidden"
          />
          <div className="hidden gap-6 border-b border-gray-200 md:flex">
            {tabs.map((tab) => {
              const current = tab.href === active.href
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={current ? 'page' : undefined}
                  title={tab.description}
                  className={`-mb-px whitespace-nowrap border-b-2 px-1 py-3 text-sm font-semibold transition-colors ${
                    current
                      ? 'border-[var(--theme-ui-accent)] text-[var(--theme-ui-accent-text)]'
                      : 'border-transparent text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {tab.name}
                </Link>
              )
            })}
          </div>
        </nav>
      </div>

      {children}
    </div>
  )
}
