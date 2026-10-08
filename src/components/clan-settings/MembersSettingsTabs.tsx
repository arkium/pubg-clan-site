'use client'

import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import ClanSettingsBanner from '@/components/clan-settings/ClanSettingsBanner'
import MobileDropdownNav from '@/components/ui/MobileDropdownNav'

export type MembersSettingsTab = 'membres' | 'demandes' | 'ajout'

const TABS: Array<{ key: MembersSettingsTab; label: string; query: string }> = [
  { key: 'membres', label: 'Membres et invitations', query: '' },
  { key: 'demandes', label: 'Demandes d’adhésion', query: '?tab=demandes' },
  { key: 'ajout', label: 'Ajouter un joueur', query: '?tab=ajout' },
]

/**
 * Onglets de `/clans/[clanId]/settings/members` (docs/TODO/administration.md, lot 3b) : une seule adresse pour la gestion
 * des membres, au lieu de trois pages (`members/pending` et `/members/add` y redirigent). Soulignement accent dès
 * 768 px, menu déroulant en dessous (charte : jamais de défilement horizontal).
 */
export default function MembersSettingsTabs({ clanId, active }: { clanId: number; active: MembersSettingsTab }) {
  const href = (query: string) => `/clans/${clanId}/settings/members${query}`
  const current = TABS.find((tab) => tab.key === active) ?? TABS[0]
  return (
    <nav aria-label="Gestion des membres">
      <MobileDropdownNav
        id="members-settings-nav"
        label="Gestion des membres"
        currentLabel={current.label}
        items={TABS.map((tab) => ({ key: tab.key, label: tab.label, href: href(tab.query), active: tab.key === active }))}
        visibilityClass="md:hidden"
      />
      <div className="hidden gap-6 border-b border-gray-200 md:flex">
        {TABS.map((tab) => {
          const isActive = tab.key === active
          return (
            <Link
              key={tab.key}
              href={href(tab.query)}
              aria-current={isActive ? 'page' : undefined}
              className={`-mb-px whitespace-nowrap border-b-2 px-1 py-3 text-sm font-semibold transition-colors ${
                isActive
                  ? 'border-[var(--theme-ui-accent)] text-[var(--theme-ui-accent-text)]'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

/**
 * En-tête des onglets de gestion des membres selon la charte (docs/ui/index.html, En-têtes de page) : fil d'Ariane,
 * bandeau photo commun aux trois onglets, puis les onglets.
 */
export function MembersSectionHeader({
  clanId,
  active,
  title,
  subtitle,
  icon,
  pills = [],
  action,
}: {
  clanId: number
  active: MembersSettingsTab
  title: string
  subtitle: string
  icon: LucideIcon
  pills?: ReactNode[]
  action?: ReactNode
}) {
  const query = TABS.find((tab) => tab.key === active)?.query ?? ''
  return (
    <>
      <ClanSettingsBanner
        clanId={clanId}
        title={title}
        subtitle={subtitle}
        icon={icon}
        image="/banner-members.jpg"
        currentHref={`/clans/${clanId}/settings/members${query}`}
        pills={pills}
        action={action}
      />
      <MembersSettingsTabs clanId={clanId} active={active} />
    </>
  )
}
