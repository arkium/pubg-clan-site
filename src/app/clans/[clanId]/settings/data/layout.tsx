import AdminAccessGate from '@/components/settings/AdminAccessGate'

// « Données » d'un clan (docs/TODO/administration.md Q17, Q20) : santé des données et, en onglets, les outils de
// télémétrie. Réservées au SuperUser depuis le 2026-10-08, jamais délégables aux Owners. Toutes les pages du dossier
// demandent la même garde : celle-ci suffit, même quand on navigue d'un onglet à l'autre sans ré-exécuter ce layout.
// Les onglets (`DataSectionTabs`) sont posés par chaque page, sous son bandeau (charte : bandeau, puis onglets).
export default function ClanDataLayout({ children }: { children: React.ReactNode }) {
  return <AdminAccessGate requirement={{ kind: 'platform' }}>{children}</AdminAccessGate>
}
