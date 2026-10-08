import DataSectionTabs from '@/components/clan-settings/DataSectionTabs'
import AdminAccessGate from '@/components/settings/AdminAccessGate'

// « Données » d'un clan (docs/TODO/administration.md Q17, Q20) : santé des données et, en onglets, les outils de
// télémétrie. Réservées au SuperUser depuis le 2026-10-08, jamais délégables aux Owners. Toutes les pages du dossier
// demandent la même garde : celle-ci suffit, même quand on navigue d'un onglet à l'autre sans ré-exécuter ce layout.
export default async function ClanDataLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ clanId: string }>
}) {
  const { clanId } = await params
  const base = `/clans/${clanId}/settings/data`
  const tabs = [
    { href: base, label: 'Santé des données' },
    { href: `${base}/state`, label: 'État de la télémétrie' },
    { href: `${base}/sessions`, label: 'Soirées' },
    { href: `${base}/errors`, label: 'Erreurs' },
    { href: `${base}/sync`, label: 'Synchronisation manuelle' },
    { href: `${base}/recoveries`, label: 'Récupérations' },
  ]

  return (
    <AdminAccessGate requirement={{ kind: 'platform' }}>
      <DataSectionTabs tabs={tabs} />
      {children}
    </AdminAccessGate>
  )
}
