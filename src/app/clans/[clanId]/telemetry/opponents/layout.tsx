import AdminAccessGate from '@/components/settings/AdminAccessGate'

// Noms de joueurs extérieurs au site : Owner du clan (SuperUser toujours accepté), en attendant Q5.
export default async function EncounteredOpponentsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ clanId: string }>
}) {
  const { clanId } = await params
  return <AdminAccessGate requirement={{ kind: 'clan-owner', clanId }}>{children}</AdminAccessGate>
}
