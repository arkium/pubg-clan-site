import AdminAccessGate from '@/components/settings/AdminAccessGate'

// Page Plateforme : réservée au SuperUser, contrôlé côté serveur avant tout rendu. Layout propre au dossier : celui
// du parent ne se ré-exécute pas en naviguant entre ses pages enfants (CLAUDE.md, Administration).
export default function ClanOnboardingLayout({ children }: { children: React.ReactNode }) {
  return <AdminAccessGate requirement={{ kind: 'platform' }}>{children}</AdminAccessGate>
}
