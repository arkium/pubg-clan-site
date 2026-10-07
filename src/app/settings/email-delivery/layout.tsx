import AdminAccessGate from '@/components/settings/AdminAccessGate'

// Page Plateforme : réservée au SuperUser, contrôlé côté serveur avant tout rendu.
export default function PlatformSettingsLayout({ children }: { children: React.ReactNode }) {
  return <AdminAccessGate requirement={{ kind: 'platform' }}>{children}</AdminAccessGate>
}
