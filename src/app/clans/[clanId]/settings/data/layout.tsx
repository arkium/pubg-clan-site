import DataSectionTabs from '@/components/clan-settings/DataSectionTabs'
import AdminAccessGate from '@/components/settings/AdminAccessGate'
import { decideClanFeature } from '@/lib/auth/admin-guards'
import { getServerComponentSession } from '@/lib/auth-session'

// « Données » d'un clan (docs/TODO/administration.md Q17, Q20) : santé des données (`clan-data-health`, ouverte aux
// Owners par défaut) et, en onglets, les outils de télémétrie (`clan-telemetry-tools`, gardés aussi par leur dossier).
export default async function ClanDataLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ clanId: string }>
}) {
  const { clanId } = await params
  const numericClanId = Number(clanId)
  const session = await getServerComponentSession()
  const toolsAllowed =
    Number.isInteger(numericClanId) && numericClanId > 0
      ? (await decideClanFeature(session, numericClanId, 'clan-telemetry-tools')).allowed
      : false

  const base = `/clans/${clanId}/settings/data`
  const tabs = [
    { href: base, label: 'Santé des données' },
    ...(toolsAllowed
      ? [
          { href: `${base}/state`, label: 'État de la télémétrie' },
          { href: `${base}/errors`, label: 'Erreurs' },
          { href: `${base}/sync`, label: 'Synchronisation manuelle' },
          { href: `${base}/recoveries`, label: 'Récupérations' },
        ]
      : []),
  ]

  return (
    <AdminAccessGate requirement={{ kind: 'clan-feature', clanId, feature: 'clan-data-health' }}>
      <DataSectionTabs tabs={tabs} />
      {children}
    </AdminAccessGate>
  )
}
