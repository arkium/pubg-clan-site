import AdminAccessGate from '@/components/settings/AdminAccessGate'
import SettingsTabsShell from '@/components/settings/SettingsTabsShell'

// Plateforme › Joueurs (docs/TODO/administration.md, lot 3) : ex-onglets Joueurs, Résolution et Triage de
// /settings/opponents.
const TABS = [
  { name: 'Joueurs', href: '/settings/players', description: 'Annuaire transverse' },
  { name: 'Résolution & Cron', href: '/settings/players/resolution', description: 'Débit API & backlog' },
  { name: 'Triage API', href: '/settings/players/triage', description: 'Comptes en échec' },
]

export default function PlatformPlayersLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAccessGate requirement={{ kind: 'platform' }}>
      <SettingsTabsShell
        title="Joueurs"
        subtitle="Annuaire de tous les joueurs croisés, résolution de leur clan PUBG et comptes en échec."
        trailLabel="Joueurs"
        trailHref="/settings/players"
        tabs={TABS}
      >
        {children}
      </SettingsTabsShell>
    </AdminAccessGate>
  )
}
