import AdminAccessGate from '@/components/settings/AdminAccessGate'

// Fonctionnalité déléguée aux Owners « Annonces » (src/lib/auth/owner-features.ts).
export default async function ClanLoginWelcomeSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ clanId: string }>
}) {
  const { clanId } = await params
  return <AdminAccessGate requirement={{ kind: 'clan-feature', clanId, feature: 'clan-announcements' }}>{children}</AdminAccessGate>
}
