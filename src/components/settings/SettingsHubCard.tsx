'use client'

import Link from 'next/link'
import {
  Users,
  Monitor,
  Map,
  Swords,
  ListPlus,
  Activity,
  UserPlus,
  Trophy,
  LayoutDashboard,
  History,
  AlertTriangle,
  RefreshCw,
  Mail,
  Globe,
  ShieldAlert,
  Crosshair,
  Wrench,
  Clock,
  Download,
  Target,
  Database,
  Search,
  Settings,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { SettingsHubItem } from '@/hooks/useSettingsHubItems'

function getCardVisual(navKey: string): {
  Icon: ComponentType<{ className?: string }>
  color: string
} {
  switch (navKey) {
    case 'admin.players-roles':
    case 'clan.members':
      return { Icon: Users, color: 'text-blue-500' }
    case 'admin.login-welcome':
      return { Icon: Monitor, color: 'text-emerald-500' }
    case 'admin.map-labels':
      return { Icon: Map, color: 'text-amber-500' }
    case 'admin.weapon-labels':
      return { Icon: Swords, color: 'text-red-500' }
    case 'admin.weapon-categories':
    case 'clan.stats-weapons-categories':
      return { Icon: ListPlus, color: 'text-purple-500' }
    case 'admin.phase-labels':
      return { Icon: Activity, color: 'text-sky-500' }
    case 'admin.add-player':
      return { Icon: UserPlus, color: 'text-indigo-500' }
    case 'clan.tournaments':
      return { Icon: Trophy, color: 'text-amber-500' }
    case 'owner.telemetry-dashboard':
      return { Icon: LayoutDashboard, color: 'text-blue-500' }
    case 'owner.telemetry-matches':
      return { Icon: History, color: 'text-indigo-500' }
    case 'owner.telemetry-errors':
      return { Icon: AlertTriangle, color: 'text-red-500' }
    case 'owner.telemetry-sync-batch':
      return { Icon: RefreshCw, color: 'text-emerald-500' }
    case 'owner.email-delivery':
      return { Icon: Mail, color: 'text-purple-500' }
    case 'owner.pubg-api':
      return { Icon: Globe, color: 'text-sky-500' }
    case 'owner.nav-permissions':
    case 'superuser.platform-settings':
      return { Icon: ShieldAlert, color: 'text-violet-500' }
    case 'owner.encountered-opponents':
      return { Icon: Crosshair, color: 'text-orange-500' }
    case 'owner.telemetry-recoveries':
      return { Icon: Wrench, color: 'text-teal-500' }
    case 'owner.switch-clan':
    case 'superuser.switch-clan':
      return { Icon: Search, color: 'text-slate-500' }
    case 'superuser.cron':
      return { Icon: Clock, color: 'text-rose-500' }
    case 'superuser.match-import':
      return { Icon: Download, color: 'text-blue-500' }
    case 'superuser.opponents':
      return { Icon: Target, color: 'text-amber-500' }
    case 'superuser.telemetry-recoveries':
      return { Icon: RefreshCw, color: 'text-emerald-500' }
    case 'superuser.database':
      return { Icon: Database, color: 'text-cyan-500' }
    default:
      return { Icon: Settings, color: 'text-blue-500' }
  }
}

type SettingsHubCardProps = {
  item: SettingsHubItem
}

export default function SettingsHubCard({ item }: SettingsHubCardProps) {
  const { Icon, color } = getCardVisual(item.navKey)

  return (
    <Link
      href={item.href}
      className="flex flex-col items-center justify-center rounded-xl border border-gray-100 bg-gray-50 p-6 text-center shadow-xs transition-colors hover:bg-gray-100 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:bg-slate-900"
    >
      <Icon className={`mb-3 h-8 w-8 ${color}`} />
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{item.label}</h3>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{item.description}</p>
    </Link>
  )
}
