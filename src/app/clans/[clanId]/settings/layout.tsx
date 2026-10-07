import AdminAccessGate from '@/components/settings/AdminAccessGate'

// Accueil « Mon clan » : Owner du clan de l'adresse (SuperUser toujours accepté).
export default async function ClanSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ clanId: string }>
}) {
  const { clanId } = await params
  return <AdminAccessGate requirement={{ kind: 'clan-owner', clanId }}>{children}</AdminAccessGate>
}
