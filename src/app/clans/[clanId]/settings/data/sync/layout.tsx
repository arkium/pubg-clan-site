import AdminAccessGate from '@/components/settings/AdminAccessGate'

// Outil de télémétrie : SuperUser, ou Owner du clan si « Outils de télémétrie » lui est ouvert. Garde posée dans ce dossier, pas dans telemetry/ (le débriefing y reste public).
export default async function TelemetryToolLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ clanId: string }>
}) {
  const { clanId } = await params
  return <AdminAccessGate requirement={{ kind: 'clan-feature', clanId, feature: 'clan-telemetry-tools' }}>{children}</AdminAccessGate>
}
