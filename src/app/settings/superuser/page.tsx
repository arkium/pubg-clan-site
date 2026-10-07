'use client'

import SettingsHub from '@/components/settings/SettingsHub'

export default function SuperUserHubPage() {
  return (
    <SettingsHub
      section="superuser-menu"
      audience="superuser"
      trailLabel="Plateforme"
      trailHref="/settings/superuser"
      title="Plateforme"
      subtitle="Gérez l’ensemble de la plateforme, les tâches planifiées et le dépannage avancé."
      clanGroup={{
        title: 'Dépannage du clan sélectionné',
        missingClanHint: 'Sélectionnez un clan pour voir les outils de dépannage liés au clan',
      }}
      globalGroup={{ title: 'Toute la plateforme' }}
      globalFirst
      emptyMessage="Aucun outil de la plateforme n’est actuellement visible."
    />
  )
}
