export type NavRole = 'none' | 'member' | 'admin' | 'owner' | 'superuser' | 'hidden'

export type NavSection =
  | 'nav-primary'
  | 'clan-section'
  | 'member-section'
  | 'admin-menu'
  | 'owner-menu'
  | 'superuser-menu'

export type NavItemDef = {
  navKey: string
  section: NavSection
  label: string
  hrefTemplate: string
  defaultRole: NavRole
  description: string
}

export const NAV_SECTION_LABELS: Record<NavSection, string> = {
  'nav-primary': 'Navigation principale (sidebar)',
  'clan-section': 'Navigation clan',
  'member-section': 'Navigation membre',
  'admin-menu': 'Menu Admin (sidebar)',
  'owner-menu': 'Menu Owner (sidebar)',
  'superuser-menu': 'Menu SuperUser (sidebar)',
}

export const NAV_ROLE_LABELS: Record<NavRole, string> = {
  none: 'Tous',
  member: 'Membre',
  admin: 'Admin',
  owner: 'Owner',
  superuser: 'SuperUser',
  hidden: 'Masqué',
}

/** @deprecated Source de vérité migrée vers la table NavItem en DB. Utilisé uniquement comme fallback initial dans useNavPermissions. */
export const NAV_REGISTRY: NavItemDef[] = [
  // --- Navigation principale (sidebar) ---
  {
    navKey: 'primary.dashboard',
    section: 'nav-primary',
    label: 'Dashboard',
    hrefTemplate: '/members/:memberId/dashboard',
    defaultRole: 'none',
    description: 'Tableau de bord personnel du joueur connecté.',
  },
  {
    navKey: 'primary.mon-clan',
    section: 'nav-primary',
    label: 'Mon clan',
    hrefTemplate: '/clans/:clanId/members',
    defaultRole: 'none',
    description: 'Accès rapide à la page membres du clan actif.',
  },
  {
    navKey: 'primary.mon-compte',
    section: 'nav-primary',
    label: 'Mon compte',
    hrefTemplate: '/account',
    defaultRole: 'none',
    description: 'Paramètres du compte joueur.',
  },
  {
    navKey: 'primary.ligue',
    section: 'nav-primary',
    label: 'Ligue',
    hrefTemplate: '/clans-leaderboard',
    defaultRole: 'none',
    description: 'Classement public de tous les clans actifs.',
  },
  {
    navKey: 'primary.comparator',
    section: 'nav-primary',
    label: 'Comparateur',
    hrefTemplate: '/clans/comparator',
    defaultRole: 'none',
    description: 'Comparateur de clans (méta-dashboard) : pouls, style de jeu et performances transverses.',
  },

  // --- Clan section nav ---
  {
    navKey: 'clan.challenges',
    section: 'clan-section',
    label: 'Challenges',
    hrefTemplate: '/clans/:clanId/challenges',
    defaultRole: 'none',
    description: 'Défis et challenges du clan.',
  },
  {
    navKey: 'clan.stats-weapons-categories',
    section: 'clan-section',
    label: 'Catégories armes',
    hrefTemplate: '/clans/:clanId/stats/weapons/categories',
    defaultRole: 'owner',
    description: 'Stats télémétrie par catégorie d\'arme.',
  },
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
    navKey: 'clan.members-pending',
    section: 'clan-section',
    label: 'Demandes en attente',
    hrefTemplate: '/clans/:clanId/members/pending',
    defaultRole: 'admin',
    description: 'Approuver les demandes d\'adhésion en attente.',
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
    label: 'Cartographie tactique',
    hrefTemplate: '/clans/:clanId/stats/positions',
    defaultRole: 'owner',
    description: 'Cartographie des événements de combat et d’équipe via télémétrie — API /telemetry/positions.',
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
    navKey: 'member.rewards',
    section: 'member-section',
    label: 'Récompenses',
    hrefTemplate: '/members/:memberId/rewards',
    defaultRole: 'none',
    description: 'Récompenses et succès du joueur.',
  },
  {
    navKey: 'member.notification-preferences',
    section: 'member-section',
    label: 'Préférences notifs',
    hrefTemplate: '/members/:memberId/notification-preferences',
    defaultRole: 'none',
    description: 'Configuration des préférences de notifications.',
  },
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
    navKey: 'member.nemesis',
    section: 'member-section',
    label: 'Némésis',
    hrefTemplate: '/members/:memberId/nemesis',
    defaultRole: 'none',
    description: 'Qui a le plus tué le joueur, et qui il a le plus tué.',
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
    hrefTemplate: '/clans/:clanId/settings/login-welcome',
    defaultRole: 'admin',
    description: "Page d'accueil de connexion — configurable par clan.",
  },

  // --- Owner menu (sidebar) ---
  {
    navKey: 'owner.telemetry-dashboard',
    section: 'owner-menu',
    label: 'Dashboard télémétrie',
    hrefTemplate: '/clans/:clanId/telemetry/dashboard',
    defaultRole: 'owner',
    description: 'Tableau de bord de monitoring de la télémétrie.',
  },
  {
    navKey: 'owner.telemetry-errors',
    section: 'owner-menu',
    label: 'Erreurs télémétrie',
    hrefTemplate: '/clans/:clanId/telemetry/errors',
    defaultRole: 'owner',
    description: 'Erreurs et jobs bloqués de la télémétrie.',
  },
  {
    navKey: 'owner.telemetry-sync-batch',
    section: 'owner-menu',
    label: 'Sync batch manuel',
    hrefTemplate: '/clans/:clanId/telemetry/sync-batch-manual',
    defaultRole: 'owner',
    description: 'Déclenchement manuel d\'un batch de synchronisation télémétrie.',
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
    navKey: 'owner.encountered-opponents',
    section: 'owner-menu',
    label: 'Adversaires rencontrés',
    hrefTemplate: '/clans/:clanId/telemetry/opponents',
    defaultRole: 'owner',
    description: 'Joueurs et clans adverses croisés en match, non trackés.',
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

  // --- SuperUser menu (sidebar) ---
  {
    navKey: 'superuser.cron',
    section: 'superuser-menu',
    label: 'Ops Cron',
    hrefTemplate: '/settings/cron',
    defaultRole: 'superuser',
    description: 'Pilotage global des tâches cron et statut des workers télémétrie.',
  },
  {
    navKey: 'superuser.switch-clan',
    section: 'superuser-menu',
    label: 'Tous les clans',
    hrefTemplate: '/clans',
    defaultRole: 'superuser',
    description: 'Changer de clan actif — réservé au SuperUser (accès cross-clan).',
  },
  {
    navKey: 'superuser.platform-settings',
    section: 'superuser-menu',
    label: 'Config plateforme',
    hrefTemplate: '/settings/nav-permissions',
    defaultRole: 'superuser',
    description: 'Permissions et ordre de navigation (accès SuperUser et Owner).',
  },
  {
    navKey: 'superuser.telemetry-recoveries',
    section: 'superuser-menu',
    label: 'Telemetrie cross-clans',
    hrefTemplate: '/settings/telemetry-recoveries',
    defaultRole: 'superuser',
    description: 'Comparaison de la sante du pipeline télémétrie entre tous les clans suivis.',
  },
  {
    navKey: 'superuser.opponents',
    section: 'superuser-menu',
    label: 'Adversaires',
    hrefTemplate: '/settings/opponents',
    defaultRole: 'superuser',
    description: 'Vue transverse des clans suivis et des clans adverses croisés, tous clans confondus.',
  },
  {
    navKey: 'superuser.match-import',
    section: 'superuser-menu',
    label: 'Import de matchs PUBG',
    hrefTemplate: '/settings/match-import',
    defaultRole: 'superuser',
    description: "Vérification et import manuel des derniers matchs PUBG d'un membre, tous clans confondus.",
  },
]

/** @deprecated Avec navPerms.roles chargé depuis la DB, le fallback NAV_REGISTRY n'est plus atteint. */
export function getItemRole(navKey: string, overrides: Record<string, NavRole>): NavRole {
  if (navKey in overrides) return overrides[navKey]
  return NAV_REGISTRY.find((item) => item.navKey === navKey)?.defaultRole ?? 'none'
}

export function getRoleLinkClass(role: NavRole, active: boolean, variant: 'section' | 'submenu' = 'section'): string {
  const prefix = variant === 'submenu' ? 'clan-submenu-link' : 'clan-section-nav-link'
  if (role === 'superuser') return active ? `${prefix}--superuser-active` : `${prefix}--superuser`
  if (role === 'owner') return active ? `${prefix}--owner-active` : `${prefix}--owner`
  if (role === 'admin') return active ? `${prefix}--admin-active` : `${prefix}--admin`
  return active ? `${prefix}--active` : ''
}
