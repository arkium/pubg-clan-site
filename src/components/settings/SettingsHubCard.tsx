'use client'

import {
  Activity,
  AlertTriangle,
  ChevronRight,
  Clock,
  Crosshair,
  Database,
  Download,
  Globe,
  History,
  KeyRound,
  LayoutDashboard,
  type LucideIcon,
  Mail,
  Map,
  MessageSquare,
  Monitor,
  RefreshCw,
  ScrollText,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Swords,
  Target,
  Trophy,
  UserPlus,
  Users,
  Wrench,
  SlidersHorizontal,
} from 'lucide-react'
import Link from 'next/link'

import { Tag, toneStyle, type Tone } from '@/components/ui/CharteKit'
import type { SettingsHubItem } from '@/hooks/useSettingsHubItems'

/** Icône et couleur (jetons de jeu de la charte) d'une carte d'accueil d'administration, d'après son entrée de menu. */
const CARD_VISUALS: Record<string, { icon: LucideIcon; tone: Tone }> = {
  'admin.players-roles': { icon: Users, tone: 'pos' },
  'clan.members': { icon: Users, tone: 'pos' },
  'admin.login-welcome': { icon: Monitor, tone: 'sky' },
  'admin.discord-notifications': { icon: MessageSquare, tone: 'sky' },
  'admin.map-labels': { icon: Map, tone: 'warn' },
  'admin.weapon-labels': { icon: Swords, tone: 'neg' },
  'admin.phase-labels': { icon: Activity, tone: 'sky' },
  'admin.add-player': { icon: UserPlus, tone: 'pos' },
  'clan.tournaments': { icon: Trophy, tone: 'warn' },
  'owner.telemetry-dashboard': { icon: LayoutDashboard, tone: 'sky' },
  'owner.telemetry-matches': { icon: History, tone: 'sky' },
  'owner.telemetry-errors': { icon: AlertTriangle, tone: 'neg' },
  'owner.telemetry-sync-batch': { icon: RefreshCw, tone: 'pos' },
  'owner.telemetry-recoveries': { icon: Wrench, tone: 'pos' },
  'owner.email-delivery': { icon: Mail, tone: 'sky' },
  'owner.pubg-api': { icon: Globe, tone: 'sky' },
  'owner.encountered-opponents': { icon: Crosshair, tone: 'warn' },
  'superuser.site-config': { icon: SlidersHorizontal, tone: 'sky' },
  'superuser.platform-settings': { icon: ShieldAlert, tone: 'neutral' },
  'superuser.delegation': { icon: KeyRound, tone: 'warn' },
  'superuser.admin-journal': { icon: ScrollText, tone: 'neutral' },
  'superuser.privacy-requests': { icon: ShieldCheck, tone: 'pos' },
  'superuser.cron': { icon: Clock, tone: 'neg' },
  'superuser.match-import': { icon: Download, tone: 'sky' },
  'superuser.opponents': { icon: Target, tone: 'warn' },
  'superuser.clan-lifecycle': { icon: History, tone: 'warn' },
  'superuser.players': { icon: Users, tone: 'pos' },
  'superuser.telemetry-recoveries': { icon: RefreshCw, tone: 'pos' },
  'superuser.database': { icon: Database, tone: 'sky' },
  'superuser.league-settings': { icon: Trophy, tone: 'warn' },
}

/**
 * Carte d'un outil sur un accueil d'administration, selon la charte (docs/ui/index.html) : tuile d'icône teintée,
 * libellé, description, chevron. Une entrée masquée (`hidden`, Q18) porte la pastille « Masquée » (vue du SuperUser).
 */
export default function SettingsHubCard({ item }: { item: SettingsHubItem }) {
  const visual = CARD_VISUALS[item.navKey] ?? { icon: Settings, tone: 'neutral' as const }
  const Icon = visual.icon
  return (
    <Link href={item.href} className="app-panel flex items-start gap-3 p-3.5 transition-colors hover:bg-gray-50">
      <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px]" style={toneStyle(visual.tone)} aria-hidden="true">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="t-card-title">{item.label}</span>
          {item.role === 'hidden' ? <Tag tone="neutral">Masquée</Tag> : null}
        </span>
        {item.description ? <span className="t-meta">{item.description}</span> : null}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 self-center text-gray-500" aria-hidden="true" />
    </Link>
  )
}
