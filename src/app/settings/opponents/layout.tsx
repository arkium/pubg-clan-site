import AdminAccessGate from '@/components/settings/AdminAccessGate'

import OpponentsShell from './OpponentsShell'

// Page Plateforme : réservée au SuperUser, contrôlé côté serveur avant le rendu des onglets.
export default function OpponentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAccessGate requirement={{ kind: 'platform' }}>
      <OpponentsShell>{children}</OpponentsShell>
    </AdminAccessGate>
  )
}
