import Link from 'next/link'

export type MembersSettingsTab = 'membres' | 'demandes' | 'ajout'

const TABS: Array<{ key: MembersSettingsTab; label: string; query: string }> = [
  { key: 'membres', label: 'Membres et invitations', query: '' },
  { key: 'demandes', label: 'Demandes d’adhésion', query: '?tab=demandes' },
  { key: 'ajout', label: 'Ajouter un joueur', query: '?tab=ajout' },
]

/**
 * Onglets de `/clans/[clanId]/settings/members` (docs/TODO/administration.md, lot 3b) : une seule adresse pour la gestion
 * des membres, au lieu de trois pages (`members/pending` et `/members/add` y redirigent).
 */
export default function MembersSettingsTabs({ clanId, active }: { clanId: number; active: MembersSettingsTab }) {
  return (
    <nav className="mb-6 border-b border-slate-200 dark:border-slate-800" aria-label="Gestion des membres">
      <div className="-mb-px flex gap-6 overflow-x-auto">
        {TABS.map((tab) => {
          const isActive = tab.key === active
          return (
            <Link
              key={tab.key}
              href={`/clans/${clanId}/settings/members${tab.query}`}
              aria-current={isActive ? 'page' : undefined}
              className={`whitespace-nowrap border-b-2 px-1 py-3 text-sm font-semibold transition-colors ${
                isActive
                  ? 'border-[var(--theme-ui-accent)] text-[var(--theme-ui-accent-text)]'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
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
