import AdminAccessGate from '@/components/settings/AdminAccessGate'
import SettingsTabsShell from '@/components/settings/SettingsTabsShell'

// Plateforme › Coach IA (docs/TODO/chatbot-ia.md §9) : réglages, consommation du mois, questions à relire. Garde dans
// le layout de ce dossier : un layout parent ne se ré-exécute pas en naviguant entre ses onglets.
const TABS = [
  { name: 'Réglages', href: '/settings/coach', description: 'Interrupteur, modèle, budgets et limites' },
  { name: 'Consommation', href: '/settings/coach/usage', description: 'Coût du mois, par modèle, comptes et erreurs' },
  { name: 'Questions', href: '/settings/coach/questions', description: 'Questions fréquentes et votes « Inexact » à relire' },
]

export default function CoachSettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminAccessGate requirement={{ kind: 'platform' }}>
      <SettingsTabsShell
        title="Coach IA"
        subtitle="Ouverture aux membres, modèle Gemini, budgets et limites ; ce que le Coach coûte et ce qu’on lui demande."
        icon="coach"
        image="/cartographie-tactique.jpg"
        trailHref="/settings/coach"
        tabs={TABS}
      >
        {children}
      </SettingsTabsShell>
    </AdminAccessGate>
  )
}
