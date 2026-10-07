import AdminAccessGate from '@/components/settings/AdminAccessGate'

// Q5 (docs/TODO/administration.md) : la page nomme des joueurs extérieurs au site — membres connectés du clan et
// SuperUser seulement, jamais les visiteurs (la garde d'API ne s'ouvre pas en mode visiteur).
export default async function EncounteredOpponentsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ clanId: string }>
}) {
  const { clanId } = await params
  return <AdminAccessGate requirement={{ kind: 'clan-member', clanId }}>{children}</AdminAccessGate>
}
