import AdminAccessGate from '@/components/settings/AdminAccessGate'

// Fonctionnalité déléguée aux Owners « Membres » (src/lib/auth/owner-features.ts).
export default async function ClanMembersSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ clanId: string }>
}) {
  const { clanId } = await params
  return <AdminAccessGate requirement={{ kind: 'clan-feature', clanId, feature: 'clan-members' }}>{children}</AdminAccessGate>
}
