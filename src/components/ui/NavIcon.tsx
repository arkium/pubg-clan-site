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
} from 'lucide-react'

type Props = {
  label: string
  className?: string
}

export default function NavIcon({ label, className = 'h-4 w-4 shrink-0' }: Props): ReactNode {
  const getIcon = () => {
    switch (label) {
      // ── Navigation principale ──────────────────────────────────────────────
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

      // ── Clan section ─────────────────────────────────────────────────────────
      case "Vue d'ensemble": return <LayoutDashboard className={className} />
      case 'Stats armes': return <Crosshair className={className} />
      case 'Heatmap kills': return <Map className={className} />
      case 'Cartographie tactique': return <Map className={className} />
      case 'Drop zones': return <CircleDot className={className} />
      case 'Membres':
      case 'Joueurs': return <Users className={className} />
      case 'Matchs': return <History className={className} />
      case 'Stats': return <BarChart2 className={className} />
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
      case 'Paramètres admin': return <Shield className={className} />
      case 'Ajouter un joueur': return <User className={className} />
      case 'Joueurs et rôles': return <Users className={className} />
      case 'Alias cartes PUBG': return <Map className={className} />
      case 'Alias armes PUBG': return <Crosshair className={className} />
      case 'Alias catégories armes': return <Crosshair className={className} />
      case 'Alias phases PUBG': return <Clock className={className} />
      case 'Accueil login': return <Key className={className} />

      // ── Owner menu ────────────────────────────────────────────────────────────
      case 'Paramètres owner': return <Crown className={className} />
      case 'Dashboard télémétrie': return <Activity className={className} />
      case 'Erreurs télémétrie': return <AlertTriangle className={className} />
      case 'Sync batch manuel': return <Database className={className} />
      case 'Ouvrir Ops Cron': return <Clock className={className} />
      case 'Recoveries telemetry': return <Database className={className} />
      case 'Télémétrie matchs': return <Activity className={className} />
      case 'Test email': return <Mail className={className} />
      case 'Monitoring PUBG API': return <Globe className={className} />
      case 'Permissions nav': return <Lock className={className} />
      case 'Changer de clan': return <Search className={className} />

      // ── SuperUser menu ────────────────────────────────────────────────────────
      case 'Paramètres SuperUser': return <Star className={className} />
      case 'Tous les clans': return <Users className={className} />
      case 'Config plateforme': return <Settings className={className} />

      default:
        return <CircleDot className={className} />
    }
  }

  return getIcon()
}
