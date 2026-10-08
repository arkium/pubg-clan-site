'use client'

import type { LucideIcon } from 'lucide-react'
import { Info, LayoutGrid } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import AdminPageBanner from '@/components/settings/AdminPageBanner'
import SettingsHubCard from '@/components/settings/SettingsHubCard'
import { Callout, EmptyState } from '@/components/ui/CharteKit'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { useSettingsHubItems, type SettingsHubItem } from '@/hooks/useSettingsHubItems'
import type { NavSection } from '@/lib/nav-permissions-registry'

type HubGroup = { title: string; missingClanHint?: string }

/** Répartition des cartes globales en thèmes ; une entrée absente de la liste tombe dans « Autres ». */
export type HubThemes = Array<{ title: string; navKeys: string[] }>

function CardGrid({ items }: { items: SettingsHubItem[] }) {
  return (
    <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <SettingsHubCard key={item.navKey} item={item} />
      ))}
    </div>
  )
}

/**
 * Accueil d'administration construit depuis les entrées de menu (`NavItem`) d'une section, selon la charte UI
 * (docs/ui/index.html) : bandeau photo, cartes globales réparties par thème, cartes du clan sélectionné. Sert l'accueil
 * Plateforme (`/settings`) ; l'accueil « Mon clan » est une page serveur à part (`/clans/[clanId]/settings`). La garde
 * serveur est dans la page ; la condition ci-dessous ne fait que renvoyer ailleurs un visiteur sans session.
 */
export default function SettingsHub({
  section,
  trailHref,
  title,
  subtitle,
  icon,
  image,
  clanGroup,
  globalGroup,
  globalFirst = false,
  themes,
  emptyMessage,
}: {
  section: NavSection
  trailHref: string
  title: string
  subtitle: string
  icon: LucideIcon
  image: string
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
      <section key="clan" className="flex flex-col gap-2.5" aria-labelledby="hub-clan-title">
        <h2 id="hub-clan-title" className="t-section-title m-0">
          {clanGroup.title}
        </h2>
        {clanId ? (
          <CardGrid items={clanItems} />
        ) : (
          <Callout tone="sky" icon={Info} title="Aucun clan sélectionné">
            {clanGroup.missingClanHint} ({clanItems.map((item) => item.label).join(', ')}).{' '}
            <Link href="/clans" className="app-link font-semibold">
              Choisir un clan
            </Link>
          </Callout>
        )}
      </section>
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
      <section key={`global-${group.title}`} className="flex flex-col gap-2.5" aria-label={group.title}>
        <h2 className="t-section-title m-0">{group.title}</h2>
        <CardGrid items={group.items} />
      </section>
    ))

  const toolCount = globalItems.length + (clanId ? clanItems.length : 0)

  return (
    // `.charte` : page écrite selon la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-5">
      <AdminPageBanner
        title={title}
        subtitle={subtitle}
        icon={icon}
        image={image}
        currentHref={trailHref}
        parent={{ href: clanId ? `/clans/${clanId}/overview` : '/clans', label: clanId ? "Vue d'ensemble" : 'Les clans' }}
        hideTrail
        pills={toolCount > 0 ? [<><span className="t-num">{toolCount}</span> outils</>, 'Réservé au SuperUser'] : ['Réservé au SuperUser']}
      />

      {globalFirst ? [globalBlock, clanBlock] : [clanBlock, globalBlock]}

      {clanItems.length === 0 && globalItems.length === 0 ? (
        <EmptyState icon={LayoutGrid} title={emptyMessage} />
      ) : null}
    </div>
  )
}
