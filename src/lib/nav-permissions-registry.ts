export type NavRole = 'none' | 'member' | 'admin' | 'owner'

export type NavSection =
  | 'clan-section'
  | 'member-section'
  | 'admin-menu'
  | 'owner-menu'

export type NavItemDef = {
  navKey: string
  section: NavSection
  label: string
  hrefTemplate: string
  defaultRole: NavRole
  description: string
}

export const NAV_SECTION_LABELS: Record<NavSection, string> = {
  'clan-section': 'Navigation clan',
  'member-section': 'Navigation membre',
  'admin-menu': 'Menu Admin (sidebar)',
  'owner-menu': 'Menu Owner (sidebar)',
}

export const NAV_ROLE_LABELS: Record<NavRole, string> = {
  none: 'Tous',
  member: 'Membre',
  admin: 'Admin',
  owner: 'Owner',
}

export const NAV_REGISTRY: NavItemDef[] = [
  // --- Clan section nav ---
  {
    navKey: 'clan.overview',
    section: 'clan-section',
    label: "Vue d'ensemble",
    hrefTemplate: '/clans/:clanId/overview',
    defaultRole: 'admin',
    description: 'Vue synoptique du clan : membres, rôles, état PUBG.',
  },
  {
    navKey: 'clan.members',
    section: 'clan-section',
    label: 'Membres',
    hrefTemplate: '/clans/:clanId/members',
    defaultRole: 'admin',
    description: 'Liste des membres avec gestion des rôles (API requiert manage_members).',
  },
  {
    navKey: 'clan.matches',
    section: 'clan-section',
    label: 'Matchs',
    hrefTemplate: '/clans/:clanId/matches',
    defaultRole: 'none',
    description: 'Historique des parties du clan.',
  },
  {
    navKey: 'clan.stats',
    section: 'clan-section',
    label: 'Stats',
    hrefTemplate: '/clans/:clanId/stats',
    defaultRole: 'none',
    description: 'Statistiques agrégées du clan.',
  },
  {
    navKey: 'clan.stats-weapons',
    section: 'clan-section',
    label: 'Stats armes',
    hrefTemplate: '/clans/:clanId/stats/weapons',
    defaultRole: 'owner',
    description: 'Télémétrie armes — API /telemetry/weapons (Owner uniquement).',
  },
  {
    navKey: 'clan.heatmap-kills',
    section: 'clan-section',
    label: 'Heatmap kills',
    hrefTemplate: '/clans/:clanId/stats/heatmap-kills',
    defaultRole: 'owner',
    description: 'Heatmap des kills via télémétrie — API /telemetry/heatmap.',
  },
  {
    navKey: 'clan.positions',
    section: 'clan-section',
    label: 'Positions',
    hrefTemplate: '/clans/:clanId/stats/positions',
    defaultRole: 'owner',
    description: 'Analyse des positions via télémétrie — API /telemetry/positions.',
  },
  {
    navKey: 'clan.drop-zones',
    section: 'clan-section',
    label: 'Drop zones',
    hrefTemplate: '/clans/:clanId/drop-zones',
    defaultRole: 'owner',
    description: 'Zones de drop préférées — API /telemetry/drop-zones.',
  },
  {
    navKey: 'clan.awards',
    section: 'clan-section',
    label: 'Awards',
    hrefTemplate: '/clans/:clanId/awards',
    defaultRole: 'none',
    description: 'Classement des distinctions (accessible à tous les membres).',
  },
  {
    navKey: 'clan.leaderboard',
    section: 'clan-section',
    label: 'Classement',
    hrefTemplate: '/clans/:clanId/leaderboard',
    defaultRole: 'none',
    description: 'Classement des membres du clan.',
  },
  {
    navKey: 'clan.reports',
    section: 'clan-section',
    label: 'Rapports',
    hrefTemplate: '/clans/:clanId/reports',
    defaultRole: 'none',
    description: 'Rapports hebdomadaires et mensuels — API requiert view_reports.',
  },

  // --- Member section nav ---
  {
    navKey: 'member.dashboard',
    section: 'member-section',
    label: 'Tableau de bord',
    hrefTemplate: '/members/:memberId/dashboard',
    defaultRole: 'none',
    description: 'Dashboard récapitulatif du joueur.',
  },
  {
    navKey: 'member.stats',
    section: 'member-section',
    label: 'Stats globales',
    hrefTemplate: '/members/:memberId/stats',
    defaultRole: 'none',
    description: 'Statistiques globales du joueur.',
  },
  {
    navKey: 'member.weapons',
    section: 'member-section',
    label: 'Armes',
    hrefTemplate: '/members/:memberId/weapons',
    defaultRole: 'none',
    description: "Stats armes du joueur.",
  },
  {
    navKey: 'member.map-stats',
    section: 'member-section',
    label: 'Cartes',
    hrefTemplate: '/members/:memberId/map-stats',
    defaultRole: 'none',
    description: 'Stats par carte.',
  },
  {
    navKey: 'member.drop-zones',
    section: 'member-section',
    label: 'Drop zones',
    hrefTemplate: '/members/:memberId/drop-zones',
    defaultRole: 'none',
    description: 'Zones de drop du joueur.',
  },
  {
    navKey: 'member.heatmap',
    section: 'member-section',
    label: 'Calendrier',
    hrefTemplate: '/members/:memberId/heatmap',
    defaultRole: 'none',
    description: "Calendrier d'activité du joueur.",
  },
  {
    navKey: 'member.matches',
    section: 'member-section',
    label: 'Matchs',
    hrefTemplate: '/members/:memberId/matches',
    defaultRole: 'none',
    description: 'Historique des matchs du joueur.',
  },
  {
    navKey: 'member.notifications',
    section: 'member-section',
    label: 'Notifications',
    hrefTemplate: '/members/:memberId/notifications',
    defaultRole: 'none',
    description: 'Préférences de notifications du joueur.',
  },

  // --- Admin menu (sidebar) ---
  {
    navKey: 'admin.add-player',
    section: 'admin-menu',
    label: 'Ajouter un joueur',
    hrefTemplate: '/members/add',
    defaultRole: 'admin',
    description: 'Formulaire pour ajouter un joueur au clan.',
  },
  {
    navKey: 'admin.players-roles',
    section: 'admin-menu',
    label: 'Joueurs et rôles',
    hrefTemplate: '/clans/:clanId/settings/members',
    defaultRole: 'admin',
    description: 'Gestion des membres et de leurs rôles.',
  },
  {
    navKey: 'admin.map-labels',
    section: 'admin-menu',
    label: 'Alias cartes PUBG',
    hrefTemplate: '/settings/map-labels',
    defaultRole: 'admin',
    description: 'Alias des noms de cartes PUBG.',
  },
  {
    navKey: 'admin.weapon-labels',
    section: 'admin-menu',
    label: 'Alias armes PUBG',
    hrefTemplate: '/settings/weapon-labels',
    defaultRole: 'admin',
    description: 'Alias des noms des armes.',
  },
  {
    navKey: 'admin.weapon-categories',
    section: 'admin-menu',
    label: 'Alias catégories armes',
    hrefTemplate: '/settings/weapon-categories',
    defaultRole: 'admin',
    description: 'Alias des catégories armes.',
  },
  {
    navKey: 'admin.phase-labels',
    section: 'admin-menu',
    label: 'Alias phases PUBG',
    hrefTemplate: '/settings/phase-labels',
    defaultRole: 'admin',
    description: 'Alias des phases de jeu PUBG.',
  },
  {
    navKey: 'admin.login-welcome',
    section: 'admin-menu',
    label: 'Accueil login',
    hrefTemplate: '/settings/login-welcome',
    defaultRole: 'admin',
    description: "Page d'accueil de connexion.",
  },

  // --- Owner menu (sidebar) ---
  {
    navKey: 'owner.cron',
    section: 'owner-menu',
    label: 'Ouvrir Ops Cron',
    hrefTemplate: '/settings/cron',
    defaultRole: 'owner',
    description: 'Interface de gestion des tâches cron.',
  },
  {
    navKey: 'owner.telemetry-recoveries',
    section: 'owner-menu',
    label: 'Recoveries telemetry',
    hrefTemplate: '/clans/:clanId/telemetry/recoveries',
    defaultRole: 'owner',
    description: 'Récupération des jobs de télémétrie bloqués.',
  },
  {
    navKey: 'owner.telemetry-matches',
    section: 'owner-menu',
    label: 'Télémétrie matchs',
    hrefTemplate: '/clans/:clanId/telemetry/matches',
    defaultRole: 'owner',
    description: 'Vue des jobs de télémétrie par match.',
  },
  {
    navKey: 'owner.email-delivery',
    section: 'owner-menu',
    label: 'Test email',
    hrefTemplate: '/settings/email-delivery',
    defaultRole: 'owner',
    description: "Test de l'envoi d'emails.",
  },
  {
    navKey: 'owner.pubg-api',
    section: 'owner-menu',
    label: 'Monitoring PUBG API',
    hrefTemplate: '/settings/pubg-api',
    defaultRole: 'owner',
    description: "Monitoring des appels à l'API PUBG.",
  },
  {
    navKey: 'owner.nav-permissions',
    section: 'owner-menu',
    label: 'Permissions nav',
    hrefTemplate: '/settings/nav-permissions',
    defaultRole: 'owner',
    description: "Gestion des niveaux d'accès de la navigation.",
  },
  {
    navKey: 'owner.switch-clan',
    section: 'owner-menu',
    label: 'Changer de clan',
    hrefTemplate: '/clans',
    defaultRole: 'owner',
    description: 'Changer de clan actif.',
  },
]

export function getItemRole(navKey: string, overrides: Record<string, NavRole>): NavRole {
  if (navKey in overrides) return overrides[navKey]
  return NAV_REGISTRY.find((item) => item.navKey === navKey)?.defaultRole ?? 'none'
}

export function getRoleLinkClass(role: NavRole, active: boolean, variant: 'section' | 'submenu' = 'section'): string {
  const prefix = variant === 'submenu' ? 'clan-submenu-link' : 'clan-section-nav-link'
  if (role === 'owner') return active ? `${prefix}--owner-active` : `${prefix}--owner`
  if (role === 'admin') return active ? `${prefix}--admin-active` : `${prefix}--admin`
  return active ? `${prefix}--active` : ''
}
