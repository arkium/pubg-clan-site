import AdminAccessGate from '@/components/settings/AdminAccessGate'

// Pas de clan dans l'adresse : SuperUser, ou Owner du clan de son membre actif si « Membres » lui est ouvert.
export default function AddMemberLayout({ children }: { children: React.ReactNode }) {
  return <AdminAccessGate requirement={{ kind: 'active-clan-feature', feature: 'clan-members' }}>{children}</AdminAccessGate>
}
