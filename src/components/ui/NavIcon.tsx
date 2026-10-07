import type { ReactNode } from 'react'
import {
  LayoutDashboard,
  Users,
  User,
  BarChart2,
  Trophy,
  Swords,
  Crosshair,
  Map,
  MapPinned,
  Shield,
  Crown,
  Star,
  Settings,
  Mail,
  Activity,
  Calendar,
  Award,
  Bell,
  Clock,
  CircleDot,
  FileText,
  Search,
  AlertTriangle,
  History,
  Lock,
  Globe,
  Database,
  Key,
  LogIn,
  Home,
  ScrollText,
} from 'lucide-react'

type Props = {
  label: string
  className?: string
}

export default function NavIcon({ label, className = 'h-4 w-4 shrink-0' }: Props): ReactNode {
  const getIcon = () => {
    switch (label) {
      // ── Navigation principale ──────────────────────────────────────────────
      case 'Accueil': return <Home className={className} />
      case 'Dashboard': return <LayoutDashboard className={className} />
      case 'Les clans':
      case 'Mon clan': return <Users className={className} />
      case 'Mon compte': return <User className={className} />
      case 'Se connecter':
      case 'Connexion':
      case 'Login': return <LogIn className={className} />
      case 'Tournois':
      case 'Gérer les tournois': return <Swords className={className} />
      case 'Comparateur': return <BarChart2 className={className} />
      case 'Ligue': return <Trophy className={className} />
      case 'Mortier': return <Crosshair className={className} />
      case 'Carte des ressources': return <MapPinned className={className} />
      case 'Lecture de zone': return <CircleDot className={className} />

      // ── Clan section ─────────────────────────────────────────────────────────
      case "Vue d'ensemble": return <LayoutDashboard className={className} />
      case 'Stats armes':
      case "L'armurerie du clan": return <Crosshair className={className} />
      case 'Heatmap kills': return <Map className={className} />
      case 'Cartographie tactique': return <Map className={className} />
      case 'Drop zones': return <CircleDot className={className} />
      case 'Membres':
      case 'Joueurs': return <Users className={className} />
      case 'Matchs': return <History className={className} />
      case 'Stats':
      case 'Style de jeu du clan': return <BarChart2 className={className} />
      case 'Carrière PUBG': return <Award className={className} />
      case 'Classement': return <Trophy className={className} />
      case 'Rapports': return <FileText className={className} />
      case 'Challenges': return <Swords className={className} />
      case 'Catégories armes': return <Crosshair className={className} />
      case 'Awards': return <Award className={className} />
      case 'Demandes en attente': return <Bell className={className} />

      // ── Member section ────────────────────────────────────────────────────────
      case 'Tableau de bord': return <LayoutDashboard className={className} />
      case 'Stats globales': return <BarChart2 className={className} />
      case 'Armes': return <Crosshair className={className} />
      case 'Cartes': return <Map className={className} />
      case 'Calendrier': return <Calendar className={className} />
      case 'Récompenses': return <Award className={className} />
      case 'Préférences notifs': return <Bell className={className} />
      case 'Notifications': return <Bell className={className} />

      // ── Admin menu ────────────────────────────────────────────────────────────
      case 'Ajouter un joueur': return <User className={className} />
      case 'Joueurs et rôles': return <Users className={className} />
      case 'Alias cartes PUBG': return <Map className={className} />
      case 'Alias armes PUBG': return <Crosshair className={className} />
      case 'Alias catégories armes': return <Crosshair className={className} />
      case 'Alias phases PUBG': return <Clock className={className} />
      case 'Accueil login': return <Key className={className} />

      // ── Owner menu ────────────────────────────────────────────────────────────
      case 'Paramètres du clan': return <Crown className={className} />
      case 'État de la télémétrie': return <Activity className={className} />
      case 'Données du clan': return <Database className={className} />
      case 'Erreurs télémétrie': return <AlertTriangle className={className} />
      case 'Synchronisation manuelle': return <Database className={className} />
      case 'Récupérations': return <Database className={className} />
      case 'Télémétrie matchs':
      case 'Soirées de télémétrie': return <Calendar className={className} />
      case 'Email d’envoi': return <Mail className={className} />
      case 'API PUBG': return <Globe className={className} />

      // ── SuperUser menu ────────────────────────────────────────────────────────
      case 'Plateforme': return <Star className={className} />
      case 'Menus et navigation': return <Lock className={className} />
      case 'Tâches planifiées': return <Clock className={className} />
      case 'Télémétrie, tous les clans': return <Activity className={className} />
      case 'Clans': return <Shield className={className} />
      case 'Cycle de vie des clans': return <Settings className={className} />
      case 'Import de matchs PUBG': return <Search className={className} />
      case 'Réglages de la ligue': return <Trophy className={className} />
      case 'Base de données': return <Database className={className} />
      case 'Demandes de confidentialité': return <FileText className={className} />
      case 'Délégation aux Owners': return <Key className={className} />
      case 'Journal d’administration': return <ScrollText className={className} />

      default:
        return <CircleDot className={className} />
    }
  }

  return getIcon()
}
