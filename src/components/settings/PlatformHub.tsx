'use client'

import SettingsHub, { type HubThemes } from '@/components/settings/SettingsHub'

/** Thèmes de l'accueil Plateforme (docs/TODO/administration.md §5.2) : Clans, Joueurs, Données, Référentiels, Site. */
const PLATFORM_THEMES: HubThemes = [
  { title: 'Clans', navKeys: ['superuser.opponents', 'superuser.clan-lifecycle'] },
  { title: 'Joueurs', navKeys: ['superuser.players'] },
  {
    title: 'Données',
    navKeys: [
      'superuser.telemetry-recoveries',
      'superuser.cron',
      'superuser.match-import',
      'owner.pubg-api',
      'superuser.database',
    ],
  },
  {
    title: 'Référentiels',
    navKeys: ['admin.map-labels', 'admin.weapon-labels', 'admin.phase-labels', 'superuser.league-settings'],
  },
  {
    title: 'Site',
    navKeys: ['superuser.platform-settings', 'superuser.delegation', 'owner.email-delivery', 'superuser.privacy-requests'],
  },
]

export default function PlatformHub() {
  return (
    <SettingsHub
      section="superuser-menu"
      trailLabel="Plateforme"
      trailHref="/settings"
      title="Plateforme"
      subtitle="Gérez l’ensemble de la plateforme : clans, joueurs, données, référentiels et réglages du site."
      clanGroup={{
        title: 'Dépannage du clan sélectionné',
        missingClanHint: 'Sélectionnez un clan pour voir les outils de dépannage liés au clan',
      }}
      globalGroup={{ title: 'Toute la plateforme' }}
      globalFirst
      themes={PLATFORM_THEMES}
      emptyMessage="Aucun outil de la plateforme n’est actuellement visible."
    />
  )
}
