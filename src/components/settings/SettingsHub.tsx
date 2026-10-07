'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import SettingsHubCard from '@/components/settings/SettingsHubCard'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { useSettingsHubItems } from '@/hooks/useSettingsHubItems'
import type { NavSection } from '@/lib/nav-permissions-registry'

type HubGroup = { title: string; missingClanHint?: string }

/** Répartition des cartes globales en thèmes ; une entrée absente de la liste tombe dans « Autres ». */
export type HubThemes = Array<{ title: string; navKeys: string[] }>

/**
 * Accueil d'administration construit depuis les entrées de menu (`NavItem`) d'une section : cartes du clan
 * sélectionné et cartes globales, réparties par thème. Sert l'accueil Plateforme (`/settings`) ; l'accueil « Mon clan »
 * est une page serveur à part (`/clans/[clanId]/settings`). La garde serveur est dans la page ; la condition
 * ci-dessous ne fait que renvoyer ailleurs un visiteur sans session.
 */
export default function SettingsHub({
  section,
  trailLabel,
  trailHref,
  title,
  subtitle,
  clanGroup,
  globalGroup,
  globalFirst = false,
  themes,
  emptyMessage,
}: {
  section: NavSection
  trailLabel: string
  trailHref: string
  title: string
  subtitle: string
  clanGroup: HubGroup
  globalGroup: HubGroup
  globalFirst?: boolean
  /** Présent : les cartes globales sont réparties par thème, dans cet ordre, au lieu d'une seule grille. */
  themes?: HubThemes
  emptyMessage: string
}) {
  const router = useRouter()
  const { clanId } = useSelectedClan()
  const { loading: sessionLoading, authenticated, isSuperUser } = useAuthSession()
  const canSee = isSuperUser

  const { clanItems, globalItems } = useSettingsHubItems(section, clanId)

  useEffect(() => {
    if (sessionLoading) return
    if (!authenticated || !canSee) {
      router.replace(clanId ? `/clans/${clanId}/overview` : '/clans')
    }
  }, [authenticated, canSee, clanId, router, sessionLoading])

  if (sessionLoading || !authenticated || !canSee) return null

  const clanBlock =
    clanItems.length > 0 ? (
      <div key="clan" className="mt-8">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">
          {clanGroup.title} {clanId ? '' : '(aucun clan sélectionné)'}
        </h2>
        {clanId ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clanItems.map((item) => (
              <SettingsHubCard key={item.navKey} item={item} />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900 dark:bg-amber-900/20">
            <p className="mb-3 text-amber-800 dark:text-amber-200">
              {clanGroup.missingClanHint} ({clanItems.map((item) => item.label).join(', ')}).
            </p>
            <Link href="/clans" className="app-btn app-btn--sm app-btn--primary">
              Sélectionner un clan
            </Link>
          </div>
        )}
      </div>
    ) : null

  const globalGroups = themes
    ? [
        ...themes.map((theme) => ({
          title: theme.title,
          items: globalItems.filter((item) => theme.navKeys.includes(item.navKey)),
        })),
        {
          title: 'Autres',
          items: globalItems.filter((item) => !themes.some((theme) => theme.navKeys.includes(item.navKey))),
        },
      ]
    : [{ title: globalGroup.title, items: globalItems }]

  const globalBlock = globalGroups
    .filter((group) => group.items.length > 0)
    .map((group) => (
      <div key={`global-${group.title}`} className="mt-8">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-slate-500">{group.title}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {group.items.map((item) => (
            <SettingsHubCard key={item.navKey} item={item} />
          ))}
        </div>
      </div>
    ))

  return (
    <main className="app-container app-main flex-1 space-y-6">
      <NavigationTrail
        currentLabel={trailLabel}
        currentHref={trailHref}
        fallbackParent={{ href: clanId ? `/clans/${clanId}/overview` : '/clans', label: clanId ? "Vue d'ensemble" : 'Les clans' }}
        hidden
      />

      <section className="app-panel p-6">
        <SettingsPageHeader title={title} subtitle={subtitle} />

        {globalFirst ? [globalBlock, clanBlock] : [clanBlock, globalBlock]}

        {clanItems.length === 0 && globalItems.length === 0 ? (
          <div className="mt-8 rounded-xl border border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-800">
            {emptyMessage}
          </div>
        ) : null}
      </section>
    </main>
  )
}
