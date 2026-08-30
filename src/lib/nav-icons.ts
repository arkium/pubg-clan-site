import {
  Users,
  Swords,
  BarChart2,
  Trophy,
  Medal,
  Target,
  MapPin,
  Crosshair,
  Flame,
  Map,
  Skull,
  Calendar,
  Link as LinkIcon,
  type LucideIcon
} from 'lucide-react'

export type NavIconDef = {
  icon: LucideIcon
  colorClass: string
}

export const NAV_ICONS: Record<string, NavIconDef> = {
  // Clan section
  'clan.members': { icon: Users, colorClass: 'text-blue-500' },
  'clan.matches': { icon: Swords, colorClass: 'text-red-500' },
  'clan.stats': { icon: BarChart2, colorClass: 'text-purple-500' },
  'clan.leaderboard': { icon: Trophy, colorClass: 'text-yellow-500' },
  'clan.awards': { icon: Medal, colorClass: 'text-amber-500' },
  'clan.tournaments': { icon: Trophy, colorClass: 'text-violet-500' },
  'clan.challenges': { icon: Target, colorClass: 'text-green-500' },
  'clan.drop-zones': { icon: MapPin, colorClass: 'text-orange-500' },
  'clan.stats-weapons': { icon: Crosshair, colorClass: 'text-blue-500' },
  'clan.heatmap-kills': { icon: Flame, colorClass: 'text-rose-500' },
  'clan.positions': { icon: Map, colorClass: 'text-emerald-500' },
  
  // Member section
  'member.matches': { icon: Swords, colorClass: 'text-red-500' },
  'member.stats': { icon: BarChart2, colorClass: 'text-purple-500' },
  'member.weapons': { icon: Crosshair, colorClass: 'text-blue-500' },
  'member.nemesis': { icon: Skull, colorClass: 'text-slate-800' },
  'member.map-stats': { icon: Map, colorClass: 'text-emerald-500' },
  'member.drop-zones': { icon: MapPin, colorClass: 'text-orange-500' },
  'member.heatmap': { icon: Calendar, colorClass: 'text-rose-500' }, // Calendar is a better fit for the activity heatmap
  'member.rewards': { icon: Medal, colorClass: 'text-amber-500' },
}

export const FALLBACK_NAV_ICON: NavIconDef = {
  icon: LinkIcon,
  colorClass: 'text-slate-400',
}

export function getNavIcon(navKey: string): NavIconDef {
  return NAV_ICONS[navKey] || FALLBACK_NAV_ICON
}
