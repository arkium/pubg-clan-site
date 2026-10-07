'use client'

import SettingsHub from '@/components/settings/SettingsHub'

export default function OwnerHubPage() {
  return (
    <SettingsHub
      section="owner-menu"
      audience="owner"
      trailLabel="Paramètres du clan"
      trailHref="/settings/owner"
      title="Paramètres du clan"
      subtitle="Membres, annonces, tournois et outils de votre clan."
      clanGroup={{
        title: 'Clan sélectionné',
        missingClanHint: 'Sélectionnez un clan pour voir ses outils',
      }}
      globalGroup={{ title: 'Autres outils' }}
      emptyMessage="Aucun outil n’est actuellement ouvert à votre profil."
    />
  )
}
