'use client'

import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import MobileDropdownNav from '@/components/ui/MobileDropdownNav'
import { NavigationTrail } from '@/components/ui/NavigationTrail'

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
 * bandeau photo (titre Teko, sous-titre, pastilles, action en verre dépoli), puis les onglets.
 */
export function MembersSectionHeader({
  clanId,
  active,
  title,
  subtitle,
  icon: Icon,
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
      <NavigationTrail
        currentLabel={title}
        currentHref={`/clans/${clanId}/settings/members${query}`}
        fallbackParent={{ href: `/clans/${clanId}/settings`, label: 'Paramètres du clan', altHref: '/clans' }}
      />
      <header
        className="app-on-photo bg-hero-fallback relative min-h-[10rem] overflow-hidden rounded-[14px] bg-cover bg-no-repeat sm:min-h-[13rem]"
        style={{ backgroundImage: `url('/banner-members.jpg')`, backgroundPosition: 'center 35%' }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        {action ? <div className="absolute right-2 top-2 z-10 sm:right-4 sm:top-4">{action}</div> : null}
        <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 px-3.5 py-3 sm:px-5 sm:py-4">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />
            <h1 className="t-banner-title text-white drop-shadow-md">{title}</h1>
          </div>
          <p className="text-[13px] text-white/80 drop-shadow-md">{subtitle}</p>
          {pills.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 text-xs font-semibold text-white">
              {pills.map((pill, index) => (
                <span key={index} className="rounded-full border border-white/25 bg-white/15 px-2.5 py-0.5">
                  {pill}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </header>
      <MembersSettingsTabs clanId={clanId} active={active} />
    </>
  )
}
