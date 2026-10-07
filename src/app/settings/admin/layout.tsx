import AdminAccessGate from '@/components/settings/AdminAccessGate'

// Accueil d'administration sans clan dans l'adresse : SuperUser, ou Owner du clan de son membre actif.
export default function ClanAdminHubLayout({ children }: { children: React.ReactNode }) {
  return <AdminAccessGate requirement={{ kind: 'active-clan-owner' }}>{children}</AdminAccessGate>
}
