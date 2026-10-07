import AdminAccessGate from '@/components/settings/AdminAccessGate'
import SettingsTabsShell from '@/components/settings/SettingsTabsShell'

// Plateforme › Clans (docs/TODO/administration.md, lot 3) : clans suivis et adverses (ex-/settings/opponents) ;
// le cycle de vie (`/settings/clans/lifecycle`) garde sa propre page à bandeau, hors de ce groupe de routes.
const TABS = [
  { name: 'Clans', href: '/settings/clans', description: 'Suivis & adverses' },
  { name: 'Cycle de vie', href: '/settings/clans/lifecycle', description: 'Demandes, mutations, archivés' },
]

export default function PlatformClansLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAccessGate requirement={{ kind: 'platform' }}>
      <SettingsTabsShell
        title="Clans"
        subtitle="Clans suivis par la plateforme et clans adverses croisés en match."
        trailLabel="Clans"
        trailHref="/settings/clans"
        tabs={TABS}
      >
        {children}
      </SettingsTabsShell>
    </AdminAccessGate>
  )
}
