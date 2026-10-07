import AdminAccessGate from '@/components/settings/AdminAccessGate'

// Demandes d'adhésion : fonctionnalité « Membres » (src/lib/auth/owner-features.ts).
export default async function PendingMembersLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ clanId: string }>
}) {
  const { clanId } = await params
  return <AdminAccessGate requirement={{ kind: 'clan-feature', clanId, feature: 'clan-members' }}>{children}</AdminAccessGate>
}
