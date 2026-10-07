import AdminAccessGate from '@/components/settings/AdminAccessGate'
import PlatformHub from '@/components/settings/PlatformHub'

// Accueil Plateforme (docs/TODO/administration.md, lot 3) : remplace /settings/superuser. Garde posée dans la page,
// pas dans un `src/app/settings/layout.tsx` qui s'appliquerait aussi à l'accueil du clan (/settings/owner).
export default function PlatformHomePage() {
  return (
    <AdminAccessGate requirement={{ kind: 'platform' }}>
      <PlatformHub />
    </AdminAccessGate>
  )
}
