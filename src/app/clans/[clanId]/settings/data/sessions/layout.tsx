import AdminAccessGate from '@/components/settings/AdminAccessGate'

// Soirées de télémétrie et leur panneau d'exploitation (liste et soirée) : SuperUser, ou Owner du clan si « Outils de
// télémétrie » lui est ouvert. Une seule garde pour les deux pages, qui demandent la même fonctionnalité.
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
