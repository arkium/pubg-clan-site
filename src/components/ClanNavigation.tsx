'use client'

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { useNavPermissions } from '@/hooks/useNavPermissions'
import { NAV_REGISTRY, getItemRole } from '@/lib/nav-permissions-registry'
import { NAV_DEFAULT_TARGETS } from '@/lib/nav-permissions-service'

type ClanSummary = {
  id: number
  name: string
  tag: string
}

type WelcomeSettingsPayload = {
  settings?: {
    imageUrl?: string | null
  }
}

type NavItem = {
  navKey: string
  label: string
  href: string
  tone: 'neutral' | 'brand' | 'sky' | 'blue' | 'emerald'
}

type SubmenuItem = {
  navKey: string
  label: string
  href: string
  tone: NavItem['tone']
  highlightWhenActive?: boolean
  role?: 'admin' | 'owner'
}

type CronAction = 'sync_matches' | 'sync_stats' | 'generate_weekly_report' | 'generate_monthly_report'
type AppTheme = 'light' | 'dark'

type ClanNavigationProps = {
  children: React.ReactNode
}

const APP_THEME_STORAGE_KEY = 'pubg_app_theme'
const APP_THEME_OPTIONS: Array<{ value: AppTheme; label: string }> = [
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
]

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function getRoleBorderClass(role: 'admin' | 'owner' | undefined, darkMode: boolean): string {
  if (role === 'owner') {
    return darkMode ? 'border border-amber-500/60' : 'border border-amber-400'
  }
  if (role === 'admin') {
    return darkMode ? 'border border-red-500/60' : 'border border-red-400'
  }
  return ''
}

function getToneClasses(tone: NavItem['tone'], active: boolean, darkMode: boolean) {
  if (!darkMode) {
    if (active) {
      if (tone === 'brand') {
        return 'bg-indigo-100 text-indigo-800 ring-1 ring-inset ring-indigo-200'
      }

      if (tone === 'sky') {
        return 'bg-sky-100 text-sky-800 ring-1 ring-inset ring-sky-200'
      }

      if (tone === 'blue') {
        return 'bg-blue-100 text-blue-800 ring-1 ring-inset ring-blue-200'
      }

      if (tone === 'emerald') {
        return 'bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200'
      }

      return 'bg-slate-100 text-slate-900 ring-1 ring-inset ring-slate-300'
    }

    if (tone === 'brand') {
      return 'text-indigo-700 hover:bg-indigo-50 hover:text-indigo-800'
    }

    if (tone === 'sky') {
      return 'text-sky-700 hover:bg-sky-50 hover:text-sky-800'
    }

    if (tone === 'blue') {
      return 'text-blue-700 hover:bg-blue-50 hover:text-blue-800'
    }

    if (tone === 'emerald') {
      return 'text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800'
    }

    return 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
  }

  if (active) {
    if (tone === 'brand') {
      return 'bg-indigo-500/20 text-indigo-100 ring-1 ring-inset ring-indigo-300/30'
    }

    if (tone === 'sky') {
      return 'bg-sky-500/20 text-sky-100 ring-1 ring-inset ring-sky-300/30'
    }

    if (tone === 'blue') {
      return 'bg-blue-500/20 text-blue-100 ring-1 ring-inset ring-blue-300/30'
    }

    if (tone === 'emerald') {
      return 'bg-emerald-500/20 text-emerald-100 ring-1 ring-inset ring-emerald-300/30'
    }

    return 'bg-white/10 text-white ring-1 ring-inset ring-white/20'
  }

  if (tone === 'brand') {
    return 'text-indigo-200 hover:bg-indigo-500/10 hover:text-indigo-100'
  }

  if (tone === 'sky') {
    return 'text-sky-200 hover:bg-sky-500/10 hover:text-sky-100'
  }

  if (tone === 'blue') {
    return 'text-blue-200 hover:bg-blue-500/10 hover:text-blue-100'
  }

  if (tone === 'emerald') {
    return 'text-emerald-200 hover:bg-emerald-500/10 hover:text-emerald-100'
  }

  return 'text-slate-300 hover:bg-white/5 hover:text-white'

  /*
  if (tone === 'brand') {
    return active
      ? 'border-indigo-300 bg-indigo-100 text-indigo-800'
      : 'border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50'
  }

  if (tone === 'sky') {
    return active
      ? 'border-sky-300 bg-sky-100 text-sky-800'
      : 'border-sky-200 bg-white text-sky-700 hover:bg-sky-50'
  }

  if (tone === 'blue') {
    return active
      ? 'border-blue-300 bg-blue-100 text-blue-800'
      : 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50'
  }

  if (tone === 'emerald') {
    return active
      ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
      : 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50'
  }

  return active
    ? 'border-slate-300 bg-slate-100 text-slate-900'
    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
  */
}

function renderNavIcon(label: string) {
  const iconClass = 'h-4 w-4 shrink-0'

  if (label === 'Dashboard') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M3 11h6V3H3v8Zm8 6h6V9h-6v8ZM3 17h6v-4H3v4Zm8-10h6V3h-6v4Z" />
      </svg>
    )
  }

  if (label === 'Mon clan') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path
          fill="currentColor"
          d="M10 2.5 3.5 5v4.8c0 3.4 2.5 6.2 6.5 7.7 4-1.5 6.5-4.3 6.5-7.7V5L10 2.5Zm0 2.1 4.5 1.7v3.5c0 2.4-1.7 4.5-4.5 5.7-2.8-1.2-4.5-3.3-4.5-5.7V6.3L10 4.6Zm-2.2 5.2h4.4v1.4H7.8V9.8Zm0-2.3h4.4v1.4H7.8V7.5Z"
        />
      </svg>
    )
  }

  if (label === 'Mon compte') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path
          fill="currentColor"
          d="M10 3.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm0 9.2c-3.6 0-6.5 1.9-6.5 4.3 0 .6.4 1 1 1h11c.6 0 1-.4 1-1 0-2.4-2.9-4.3-6.5-4.3Zm-4.2 3.3c.5-1 2.2-1.9 4.2-1.9s3.7.9 4.2 1.9H5.8Z"
        />
      </svg>
    )
  }

  if (label === 'Ajouter un joueur') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M10 3.3a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Zm0 8.2c-3 0-5.4 1.5-5.4 3.5 0 .6.4 1 1 1h9c.6 0 1-.4 1-1 0-2-2.4-3.5-5.4-3.5Zm.8 1.2h1.4v1.5h1.5v1.4h-1.5v1.5h-1.4v-1.5H9.3v-1.4h1.5v-1.5Z" />
      </svg>
    )
  }

  if (label === 'Joueurs et rôles') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M7 4.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6Zm6 0a2.3 2.3 0 1 0 0 4.6 2.3 2.3 0 0 0 0-4.6ZM3.9 14.7c0-1.8 1.9-3.2 4.1-3.2s4.1 1.4 4.1 3.2v.8h-8.2v-.8Zm9.5.8v-.8c0-.8-.3-1.6-.8-2.2 1.7.1 3.1 1.1 3.1 2.4v.6h-2.3Z" />
      </svg>
    )
  }

  if (label === 'Alias cartes PUBG') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M4.5 3.5A1.5 1.5 0 0 0 3 5v10a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 17 15V5a1.5 1.5 0 0 0-1.5-1.5h-11ZM6 7h8v1.4H6V7Zm0 2.9h5.5v1.4H6V9.9Zm0 2.9h8v1.4H6v-1.4Z" />
      </svg>
    )
  }

  if (label === 'Accueil login') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M10 3.2 3.4 8.3v8.5h4.3v-5.1h4.6v5.1h4.3V8.3L10 3.2Zm0 1.9 5.1 4v6.2h-1.5v-5.1a1 1 0 0 0-1-1H7.4a1 1 0 0 0-1 1v5.1H4.9V9.1l5.1-4Z" />
      </svg>
    )
  }

  if (label === 'Dashboard télémétrie') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M3 3h6v6H3V3Zm0 8h6v6H3v-6Zm8-8h6v6h-6V3Zm0 8h6v6h-6v-6Z" />
      </svg>
    )
  }

  if (label === 'Erreurs télémétrie') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2Zm0 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm-.75 3.25v5h1.5v-5h-1.5Zm0 6.5v1.5h1.5v-1.5h-1.5Z" />
      </svg>
    )
  }

  if (label === 'Sync batch manuel') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M10 3.2a6.8 6.8 0 1 0 6.8 6.8h-1.6A5.2 5.2 0 1 1 10 4.8V3.2Zm1.5 0v4.3l3.5-2-3.5-2.3Z" />
      </svg>
    )
  }

  if (label === 'Ouvrir Ops Cron') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M10 4.1a5.9 5.9 0 1 0 0 11.8 5.9 5.9 0 0 0 0-11.8Zm0 1.5a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8Zm-.7 1.7v3.4c0 .2.1.4.3.6l2.3 1.8.9-1.1-2-1.5V7.3H9.3Z" />
      </svg>
    )
  }

  if (label === 'Test email') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M4.5 4A1.5 1.5 0 0 0 3 5.5v9A1.5 1.5 0 0 0 4.5 16h11a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 15.5 4h-11Zm0 1.5h11v.4L10 9.8 4.5 5.9v-.4Zm0 2.2 5 3.5a1 1 0 0 0 1 0l5-3.5v6.8h-11V7.7Z" />
      </svg>
    )
  }

  if (label === 'Monitoring PUBG API') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M3.5 4.5h13v11h-13v-11Zm1.5 1.5V14h10V6h-10Zm1.2 6.7 1.8-2.2 1.8 1.4 2.5-3.1 1.2 1-3.4 4.2-2.1-1.6-1.2 1.5-0.6-.6Z" />
      </svg>
    )
  }

  if (label === 'Recoveries telemetry') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M10 3.2a6.8 6.8 0 1 0 6.8 6.8h-1.6A5.2 5.2 0 1 1 10 4.8V3.2Zm.8 3H9.2v4.6l3.8 2.3.8-1.3-3-1.8V6.2Zm4.7-1 .9.9-2.1 2.1-.9-.9 2.1-2.1Z" />
      </svg>
    )
  }

  if (label === 'Télémétrie matchs') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2Zm0 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13Zm0 2.25a.75.75 0 0 0-.75.75v4.19l-2.72 2.72a.75.75 0 1 0 1.06 1.06l3-3A.75.75 0 0 0 10.75 11V6.5A.75.75 0 0 0 10 5.75Z" />
      </svg>
    )
  }

  if (label === 'Permissions nav') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" />
      </svg>
    )
  }

  if (label === 'Changer de clan') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M6.2 3.8H4v12.4h2.2V3.8Zm9.8 0H7.8v5h8.2l-1.6-2.5L16 3.8Zm0 7.4H7.8v5H16l-1.6-2.5 1.6-2.5Z" />
      </svg>
    )
  }

  if (label === 'Matchs') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path
          fill="currentColor"
          d="M4.5 3A1.5 1.5 0 0 0 3 4.5v11A1.5 1.5 0 0 0 4.5 17h11a1.5 1.5 0 0 0 1.5-1.5v-11A1.5 1.5 0 0 0 15.5 3h-11Zm.5 3h10v2H5V6Zm0 4h4v4H5v-4Zm6 0h4v4h-4v-4Z"
        />
      </svg>
    )
  }

  if (label === 'Rapports') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M5 3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10V7.8L12.2 5H5Zm7 1.7L14.3 7H12V4.7ZM6 10h8v1.5H6V10Zm0 3h8v1.5H6V13Z" />
      </svg>
    )
  }

  if (label === 'Joueurs') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M10 3.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7ZM4 16a6 6 0 1 1 12 0H4Z" />
      </svg>
    )
  }

  if (label === 'Classement') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M4 16h3V9H4v7Zm4 0h4V5H8v11Zm5 0h3v-3h-3v3Z" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
      <path fill="currentColor" d="M3 5.5A2.5 2.5 0 0 1 5.5 3h9A2.5 2.5 0 0 1 17 5.5v9a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 3 14.5v-9Z" />
    </svg>
  )
}

function renderThemeIcon(theme: AppTheme) {
  const iconClass = 'h-4 w-4 shrink-0'

  if (theme === 'light') {
    return (
      <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
        <path
          fill="currentColor"
          d="M10 4.25a5.75 5.75 0 1 0 0 11.5 5.75 5.75 0 0 0 0-11.5ZM9.25 1.5h1.5v2.25h-1.5V1.5Zm0 14.75h1.5V18.5h-1.5v-2.25ZM1.5 9.25h2.25v1.5H1.5v-1.5Zm14.75 0h2.25v1.5h-2.25v-1.5Zm-11.5-6.1 1.06-1.06 1.59 1.59-1.06 1.06-1.59-1.59Zm9.1 9.1 1.06-1.06 1.59 1.59-1.06 1.06-1.59-1.59Zm-9.1 1.59 1.59-1.59 1.06 1.06-1.59 1.59-1.06-1.06Zm9.1-9.1 1.59-1.59 1.06 1.06-1.59 1.59-1.06-1.06Z"
        />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 20 20" className={iconClass} aria-hidden="true">
      <path
        fill="currentColor"
        d="M13.8 3.2a7.25 7.25 0 1 0 3 13.7 7.6 7.6 0 0 1-3-13.7ZM10 15.5A5.5 5.5 0 1 1 10 4.5a6.75 6.75 0 0 0 0 11Z"
      />
    </svg>
  )
}

function isAppTheme(value: string): value is AppTheme {
  return value === 'light' || value === 'dark'
}

export default function ClanNavigation({ children }: ClanNavigationProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { clanId, clearClanId } = useSelectedClan()
  const { loading, authenticated, email, activeMemberId, permissions, members, refresh } = useAuthSession()
  const [clan, setClan] = useState<ClanSummary | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [mobilePanelVisible, setMobilePanelVisible] = useState(false)
  const [appTheme, setAppTheme] = useState<AppTheme>(() => {
    if (typeof window === 'undefined') {
      return 'light'
    }

    const storedTheme = window.localStorage.getItem(APP_THEME_STORAGE_KEY)
    if (storedTheme && isAppTheme(storedTheme)) {
      return storedTheme
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [cronPending, setCronPending] = useState<CronAction | null>(null)
  const [cronMessage, setCronMessage] = useState<string | null>(null)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [setupState, setSetupState] = useState<'first_run' | 'pending_activation' | 'completed'>('first_run')
  const [clanImageUrl, setClanImageUrl] = useState('/pubg.png')
  const [playerAvatarUrl, setPlayerAvatarUrl] = useState<string | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const mobileDrawerRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadSetupStatus() {
      try {
        const response = await fetch('/api/setup/status', { cache: 'no-store' })
        const payload = (await response.json().catch(() => null)) as
          | { setupState?: 'first_run' | 'pending_activation' | 'completed' }
          | null

        if (!cancelled) {
          const nextState = payload?.setupState ?? 'completed'
          setSetupState(response.ok ? nextState : 'completed')
        }
      } catch {
        if (!cancelled) {
          setSetupState('completed')
        }
      }
    }

    void loadSetupStatus()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadClanImage() {
      try {
        const response = await fetch('/api/settings/login-welcome', { cache: 'no-store' })
        const payload = (await response.json().catch(() => null)) as WelcomeSettingsPayload | null
        const nextImage = payload?.settings?.imageUrl?.trim() || '/pubg.png'

        if (!cancelled) {
          setClanImageUrl(nextImage)
        }
      } catch {
        if (!cancelled) {
          setClanImageUrl('/pubg.png')
        }
      }
    }

    void loadClanImage()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!activeMemberId) {
      setPlayerAvatarUrl(null)
      return
    }

    let cancelled = false

    async function loadPlayerAvatar() {
      try {
        const response = await fetch(`/api/members/${activeMemberId}`, { cache: 'no-store' })
        const payload = (await response.json().catch(() => null)) as { avatarUrl?: string | null } | null

        if (!cancelled) {
          setPlayerAvatarUrl(response.ok ? payload?.avatarUrl ?? null : null)
        }
      } catch {
        if (!cancelled) {
          setPlayerAvatarUrl(null)
        }
      }
    }

    void loadPlayerAvatar()

    return () => {
      cancelled = true
    }
  }, [activeMemberId])

  useEffect(() => {
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, appTheme)

    document.documentElement.setAttribute('data-app-theme', appTheme)
    document.body.setAttribute('data-app-theme', appTheme)
  }, [appTheme])

  const navPerms = useNavPermissions()
  const navLabels = navPerms.labels
  const navTargets = navPerms.targets

  function isNavHidden(navKey: string): boolean {
    const role = navPerms.roles[navKey]
    if (role !== undefined) return role === 'hidden'
    return NAV_REGISTRY.find((i) => i.navKey === navKey)?.defaultRole === 'hidden'
  }

  function resolveHref(template: string): string {
    return template
      .replace(':clanId', clanId ? String(clanId) : '')
      .replace(':memberId', activeMemberId ? String(activeMemberId) : '')
      .replace(/\/:[^/]+/g, '')
      || '/'
  }

  function resolveTargetHref(navKey: string, fallback: string): string {
    const targetKey = navTargets[navKey] ?? NAV_DEFAULT_TARGETS[navKey]
    if (!targetKey) return fallback
    const targetItem = NAV_REGISTRY.find((i) => i.navKey === targetKey)
    return targetItem ? resolveHref(targetItem.hrefTemplate) : fallback
  }

  const permissionSet = useMemo(() => new Set(permissions), [permissions])
  const hasWildcard = permissionSet.has('*')

  const canManageMembers = hasWildcard || permissionSet.has('manage_members')
  const canViewLeaderboard =
    hasWildcard || permissionSet.has('view_leaderboard') || permissionSet.has('view_reports')
  const canViewReports = hasWildcard || permissionSet.has('view_reports')
  const canManageRoles = hasWildcard || permissionSet.has('manage_roles')
  const canManageSettings = hasWildcard || permissionSet.has('manage_settings')
  const isOwner = hasWildcard
  const isAdmin = canManageMembers || canManageRoles || canManageSettings
  const canSwitchClan = isOwner

  const dashboardHref = activeMemberId ? `/members/${activeMemberId}/dashboard` : '/members'

  const primaryLinks: NavItem[] = ([
    {
      navKey: 'primary.dashboard',
      label: 'Dashboard',
      href: resolveTargetHref('primary.dashboard', dashboardHref),
      tone: 'blue',
    },
    {
      navKey: 'primary.mon-clan',
      label: 'Mon clan',
      href: resolveTargetHref('primary.mon-clan', clanId ? `/clans/${clanId}/members` : '/members'),
      tone: 'sky',
    },
    { navKey: 'primary.mon-compte', label: 'Mon compte', href: '/account', tone: 'neutral' },
  ] as NavItem[]).filter((item) => !isNavHidden(item.navKey))

  function getFirstSectionHref(section: 'admin-menu' | 'owner-menu', fallback: string): string {
    const items = NAV_REGISTRY.filter(
      (i) => i.section === section && i.navKey !== 'owner.switch-clan'
    )
    const posOrder = navPerms.positions[section] as string[] | undefined
    const ordered = posOrder
      ? [...items].sort((a, b) => {
          const ai = posOrder.indexOf(a.navKey)
          const bi = posOrder.indexOf(b.navKey)
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
        })
      : items
    const first = ordered.find((i) => {
      if (isNavHidden(i.navKey)) return false
      const role = getItemRole(i.navKey, navPerms.roles)
      if (role === 'hidden') return false
      if (role === 'owner') return isOwner
      if (role === 'admin') return isAdmin
      return true
    })
    return first ? resolveHref(first.hrefTemplate) : fallback
  }

  const adminEntryHref = getFirstSectionHref(
    'admin-menu',
    clanId ? `/clans/${clanId}/settings/members` : '/settings/map-labels'
  )
  const ownerEntryHref = getFirstSectionHref(
    'owner-menu',
    clanId ? `/clans/${clanId}/telemetry/dashboard` : '/settings/nav-permissions'
  )

  const showAdminMenu = isAdmin
  const showOwnerMenu = Boolean(isOwner && clanId)

  const activeMember = members.find((member) => member.memberId === activeMemberId) ?? null
  const playerName = activeMember?.displayName ?? email ?? 'Joueur'
  const playerInitial = playerName.trim().charAt(0).toUpperCase() || 'J'

  useEffect(() => {
    let cancelled = false

    async function loadClan() {
      if (!clanId) {
        setClan(null)
        return
      }

      try {
        const response = await fetch('/api/clans')
        const data = (await response.json()) as ClanSummary[]

        if (!response.ok) {
          throw new Error('Failed to load clans')
        }

        if (!cancelled) {
          setClan(data.find((item) => item.id === clanId) ?? null)
        }
      } catch {
        if (!cancelled) {
          setClan(null)
        }
      }
    }

    void loadClan()

    return () => {
      cancelled = true
    }
  }, [clanId])

  useEffect(() => {
    if (!loading && setupState === 'completed' && !authenticated) {
      router.replace('/login')
    }
  }, [authenticated, loading, router, setupState])

  useEffect(() => {
    if (!mobileOpen) {
      return
    }

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const fallbackButton = menuButtonRef.current
    const focusDelay = window.setTimeout(() => {
      closeButtonRef.current?.focus()
    }, 0)

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeMobileDrawer()
        return
      }

      if (event.key !== 'Tab') {
        return
      }

      const drawer = mobileDrawerRef.current
      if (!drawer) {
        return
      }

      const focusable = Array.from(
        drawer.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null)

      if (focusable.length === 0) {
        event.preventDefault()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const activeElement = document.activeElement as HTMLElement | null

      if (event.shiftKey && activeElement === first) {
        event.preventDefault()
        last.focus()
      }

      if (!event.shiftKey && activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      window.clearTimeout(focusDelay)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow

      const previousFocus = previouslyFocusedRef.current
      if (previousFocus?.isConnected) {
        previousFocus.focus()
      } else if (fallbackButton?.isConnected) {
        fallbackButton.focus()
      }
    }
  }, [mobileOpen])

  function openMobileDrawer() {
    if (mobileOpen || mobilePanelVisible) {
      return
    }

    setMobilePanelVisible(true)
    window.requestAnimationFrame(() => {
      setMobileOpen(true)
    })
  }

  function closeMobileDrawer() {
    setMobileOpen(false)
  }

  function onMobileDrawerTransitionEnd() {
    if (!mobileOpen) {
      setMobilePanelVisible(false)
    }
  }

  async function handleLogout() {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
      })

      if (!response.ok) {
        return
      }

      await refresh()
      router.replace('/login')
    } catch {
      router.replace('/login')
    }
  }

  async function confirmLogout() {
    setShowLogoutConfirm(false)
    await handleLogout()
  }

  async function handleCronAction(action: CronAction) {
    if (!clanId || cronPending) {
      return
    }

    setCronPending(action)
    setCronMessage(null)

    try {
      const response = await fetch(`/api/clans/${clanId}/cron-control`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ action }),
      })

      let payload = null as
        | {
          ok?: boolean
          partial?: boolean
          message?: string
          warning?: string
          error?: string
        }
        | null;
      let rawResponseText = ''

      try {
        payload = (await response.clone().json()) as {
          ok?: boolean
          partial?: boolean
          message?: string
          warning?: string
          error?: string
        }
      } catch {
        rawResponseText = (await response.text().catch(() => '')).trim()
      }

      if (!response.ok || !payload?.ok) {
        const fallback = rawResponseText
          ? `HTTP ${response.status}: ${rawResponseText.slice(0, 140)}`
          : `HTTP ${response.status}: reponse invalide du serveur`
        setCronMessage(
          payload?.error ??
            payload?.message ??
            `${fallback}. L action a peut-etre ete lancee, verifie la page Ops Cron.`
        )
        return
      }

      const parts = [payload.message ?? 'Action cron lancee']
      if (payload.warning) {
        parts.push(payload.warning)
      }

      setCronMessage(parts.join(' '))
    } catch {
      setCronMessage('Reponse non recue. L action a peut-etre ete lancee, verifie Ops Cron.')
    } finally {
      setCronPending(null)
    }
  }

  function isActiveLink(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  function renderLink(item: NavItem, mobile = false) {
    const active = isActiveLink(item.href)
    const darkMode = appTheme === 'dark'
    const displayLabel = navLabels[item.navKey] ?? item.label

    return (
      <Link
        key={`${mobile ? 'm' : 'd'}-${item.href}`}
        href={item.href}
        onClick={mobile ? closeMobileDrawer : undefined}
        aria-current={active ? 'page' : undefined}
        className={cx(
          'group relative rounded-lg px-3 py-2 text-sm font-semibold transition duration-200',
          mobile && 'block w-full text-left',
          getToneClasses(item.tone, active, darkMode)
        )}
      >
        <span className="flex items-center gap-2">
          <span className={cx('transition-transform duration-200 group-hover:scale-110', active && 'scale-110')}>
            {renderNavIcon(item.label)}
          </span>
          <span className="truncate">{displayLabel}</span>
        </span>
      </Link>
    )
  }

  function renderSubmenuLink(item: SubmenuItem, mobile = false) {
    const shouldHighlight = item.highlightWhenActive ?? true
    const active = shouldHighlight && isActiveLink(item.href)
    const darkMode = appTheme === 'dark'
    const displayLabel = navLabels[item.navKey] ?? item.label

    return (
      <Link
        key={`submenu-${item.href}`}
        href={item.href}
        onClick={mobile ? closeMobileDrawer : undefined}
        aria-current={active ? 'page' : undefined}
        className={cx(
          'group relative rounded-lg px-3 py-2 text-sm font-semibold transition duration-200',
          mobile && 'block w-full text-left',
          getToneClasses(item.tone, active, darkMode),
          getRoleBorderClass(item.role, darkMode)
        )}
      >
        <span className="flex items-center gap-2">
          <span className={cx('transition-transform duration-200 group-hover:scale-110', active && 'scale-110')}>
            {renderNavIcon(item.label)}
          </span>
          <span className="truncate">{displayLabel}</span>
        </span>
      </Link>
    )
  }

  function renderThemeToggle() {
    return (
      <div
        className={cx(
          'inline-flex items-center gap-1 rounded-full border p-1',
          appTheme === 'dark'
            ? 'border-slate-700 bg-slate-950/80 shadow-inner shadow-black/10'
            : 'border-slate-200 bg-white/90 shadow-sm'
        )}
        role="group"
        aria-label="Sélecteur de thème"
      >
        {(['light', 'dark'] as const).map((option) => {
          const active = appTheme === option

          return (
            <button
              key={option}
              type="button"
              onClick={() => setAppTheme(option)}
              aria-pressed={active}
              aria-label={option === 'light' ? 'Passer au thème clair' : 'Passer au thème sombre'}
              className={cx(
                'inline-flex h-9 w-9 items-center justify-center rounded-full transition',
                active
                  ? option === 'light'
                    ? 'bg-sky-100 text-sky-700 shadow-sm'
                    : 'bg-slate-800 text-amber-300 shadow-sm'
                  : appTheme === 'dark'
                    ? 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              )}
            >
              {renderThemeIcon(option)}
            </button>
          )
        })}
      </div>
    )
  }

  if (setupState !== 'completed' || !authenticated) {
    return null
  }

  if (pathname.startsWith('/activate') || pathname.startsWith('/login') || pathname.startsWith('/reset-password')) {
    return null
  }

  return (
    <div className="shell-app-bg min-h-screen" data-app-theme={appTheme}>
      <div className="flex min-h-screen">
        <aside
          className={cx(
            'hidden h-screen w-72 shrink-0 border-r lg:sticky lg:top-0 lg:flex lg:flex-col',
            appTheme === 'dark' ? 'border-slate-800/80 bg-slate-950' : 'border-slate-200 bg-white/95'
          )}
        >
          <div className={cx('border-b p-4', appTheme === 'dark' ? 'border-slate-800/80' : 'border-slate-200')}>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <img
                  src={clanImageUrl}
                  alt="Image du clan"
                  className={cx('h-12 w-12 shrink-0 rounded-2xl border object-cover', appTheme === 'dark' ? 'border-slate-700' : 'border-slate-300')}
                  onError={(event) => {
                    const target = event.currentTarget
                    if (target.src.endsWith('/pubg.png')) {
                      return
                    }
                    target.src = '/pubg.png'
                  }}
                />
                <div className="min-w-0">
                  <p className={cx('truncate text-sm font-semibold', appTheme === 'dark' ? 'text-slate-100' : 'text-slate-900')}>
                    {clanId && clan ? `${clan.name} [${clan.tag}]` : 'Aucun clan selectionne'}
                  </p>
                  <p className={cx('text-xs', appTheme === 'dark' ? 'text-emerald-300' : 'text-emerald-700')}>Connecte</p>
                </div>
              </div>
              {renderThemeToggle()}
            </div>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-4">
            <section>
              <p className={cx('mb-2 text-xs font-semibold uppercase tracking-[0.16em]', appTheme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                Navigation
              </p>
              <nav className="grid grid-cols-1 gap-2">{primaryLinks.map((item) => renderLink(item))}</nav>
            </section>

            {showAdminMenu ? (
              <section>
                <p className={cx('mb-2 text-xs font-semibold uppercase tracking-[0.16em]', appTheme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                  Admin
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {renderSubmenuLink({ navKey: 'admin.entry', label: 'Paramètres admin', href: adminEntryHref, tone: 'brand', role: 'admin' })}
                </div>
              </section>
            ) : null}

            {showOwnerMenu ? (
              <section>
                <p className={cx('mb-2 text-xs font-semibold uppercase tracking-[0.16em]', appTheme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                  Owner
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {renderSubmenuLink({ navKey: 'owner.entry', label: 'Paramètres owner', href: ownerEntryHref, tone: 'emerald', role: 'owner' })}
                  {canSwitchClan && renderSubmenuLink({ navKey: 'owner.switch-clan', label: 'Changer de clan', href: '/clans', tone: 'sky', highlightWhenActive: false, role: 'owner' })}
                </div>
              </section>
            ) : null}
          </div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
            <div className="w-full px-4 py-3 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    ref={menuButtonRef}
                    type="button"
                    onClick={openMobileDrawer}
                    className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900 lg:hidden"
                    aria-expanded={mobileOpen}
                    aria-controls="mobile-clan-nav"
                    aria-label="Ouvrir la navigation"
                    title="Ouvrir la navigation"
                  >
                    <svg viewBox="0 0 20 20" className="h-6 w-6" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M3 5.5A1.5 1.5 0 0 1 4.5 4h11A1.5 1.5 0 0 1 17 5.5v1A1.5 1.5 0 0 1 15.5 8h-11A1.5 1.5 0 0 1 3 6.5v-1Zm0 4A1.5 1.5 0 0 1 4.5 8h11A1.5 1.5 0 0 1 17 9.5v1A1.5 1.5 0 0 1 15.5 12h-11A1.5 1.5 0 0 1 3 10.5v-1Zm0 4A1.5 1.5 0 0 1 4.5 12h11A1.5 1.5 0 0 1 17 13.5v1A1.5 1.5 0 0 1 15.5 16h-11A1.5 1.5 0 0 1 3 14.5v-1Z"
                      />
                    </svg>
                  </button>
                  <div className="flex min-w-0 items-center gap-2 lg:hidden">
                    <img
                      src={clanImageUrl}
                      alt="Logo du clan"
                      className="h-8 w-8 rounded-lg border border-slate-200 object-cover"
                      onError={(event) => {
                        ;(event.currentTarget as HTMLImageElement).src = '/pubg.png'
                      }}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {clanId && clan ? `${clan.name} [${clan.tag}]` : 'Aucun clan selectionne'}
                      </p>
                      {loading ? (
                        <p className="text-xs text-slate-500">Verification de session...</p>
                      ) : authenticated ? (
                        <p className="text-xs text-emerald-700">Session active</p>
                      ) : (
                        <p className="text-xs text-amber-700">Session non connectee</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5">
                    <span className="relative inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-emerald-600 text-xs font-bold text-white">
                      {playerAvatarUrl ? (
                        <img
                          src={playerAvatarUrl}
                          alt={`${playerName} avatar`}
                          className="h-full w-full object-cover"
                          onError={(event) => {
                            event.currentTarget.style.display = 'none'
                          }}
                        />
                      ) : (
                        <span>{playerInitial}</span>
                      )}
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-white bg-emerald-400" />
                    </span>
                    <span className="hidden text-left sm:block">
                      <span className="block max-w-36 truncate text-xs font-semibold text-emerald-900">{playerName}</span>
                      <span className="block text-[11px] font-medium text-emerald-700">Connecte</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowLogoutConfirm(true)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-emerald-200 bg-white text-emerald-700 transition hover:bg-emerald-100 hover:text-emerald-800"
                      aria-label="Se deconnecter"
                      title="Se deconnecter"
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4" aria-hidden="true">
                        <path
                          fill="currentColor"
                          d="M8.5 3.5A1.5 1.5 0 0 0 7 5v2h1.5V5h6v10h-6v-2H7v2a1.5 1.5 0 0 0 1.5 1.5h6A1.5 1.5 0 0 0 16 15V5a1.5 1.5 0 0 0-1.5-1.5h-6Zm-1.97 4.53-2 2a.75.75 0 0 0 0 1.06l2 2 1.06-1.06L6.89 11H12V9.5H6.89l1.7-1.69-1.06-1.06Z"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </header>

          <main className="flex-1">{children}</main>
        </div>
      </div>

      {showLogoutConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900">Confirmer la déconnexion</h2>
            <p className="mt-2 text-sm text-slate-600">
              Voulez-vous vraiment déconnecter le joueur {playerName} ?
            </p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="app-btn app-btn--md app-btn--secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void confirmLogout()}
                className="app-btn app-btn--md app-btn--danger-solid"
              >
                Se déconnecter
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {mobilePanelVisible ? (
        <div
          id="mobile-clan-nav"
          role="dialog"
          aria-modal="true"
          aria-hidden={!mobileOpen}
          onTransitionEnd={onMobileDrawerTransitionEnd}
          className={cx(
            'fixed inset-0 z-50 transition-opacity duration-200 lg:hidden',
            mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
          )}
        >
          <button
            type="button"
            aria-label="Fermer le menu"
            className="mobile-drawer-overlay absolute inset-0 bg-slate-900/50"
            onClick={closeMobileDrawer}
          />
          <aside
            ref={mobileDrawerRef}
            className={cx(
              'mobile-drawer-panel relative z-10 h-full w-80 max-w-[85vw] overflow-y-auto border-r p-4 shadow-2xl transition-all duration-300',
              appTheme === 'dark' ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white',
              mobileOpen ? 'translate-x-0 opacity-100' : '-translate-x-8 opacity-0'
            )}
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <button
                ref={closeButtonRef}
                type="button"
                onClick={closeMobileDrawer}
                className={cx(
                  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition',
                  appTheme === 'dark'
                    ? 'bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200 hover:text-slate-900'
                )}
                aria-label="Fermer le menu"
                title="Fermer le menu"
              >
                <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M5.22 4.28a.75.75 0 0 0-1.06 1.06L8.94 10l-4.78 4.66a.75.75 0 1 0 1.06 1.06L10 11.06l4.66 4.66a.75.75 0 0 0 1.06-1.06L11.06 10l4.66-4.66a.75.75 0 0 0-1.06-1.06L10 8.94 5.22 4.28Z"
                  />
                </svg>
              </button>

              <div className="flex min-w-0 items-center justify-end gap-2">{renderThemeToggle()}</div>
            </div>

            <section>
              <p className={cx('mb-2 text-xs font-semibold uppercase tracking-[0.16em]', appTheme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                Navigation
              </p>
              <nav className="grid grid-cols-1 gap-2">{primaryLinks.map((item) => renderLink(item, true))}</nav>
            </section>

            {showAdminMenu ? (
              <section className="mt-5">
                <p className={cx('mb-2 text-xs font-semibold uppercase tracking-[0.16em]', appTheme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                  Admin
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {renderSubmenuLink({ navKey: 'admin.entry', label: 'Paramètres admin', href: adminEntryHref, tone: 'brand', role: 'admin' }, true)}
                </div>
              </section>
            ) : null}

            {showOwnerMenu ? (
              <section className="mt-5">
                <p className={cx('mb-2 text-xs font-semibold uppercase tracking-[0.16em]', appTheme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                  Owner
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {renderSubmenuLink({ navKey: 'owner.entry', label: 'Paramètres owner', href: ownerEntryHref, tone: 'emerald', role: 'owner' }, true)}
                  {canSwitchClan && renderSubmenuLink({ navKey: 'owner.switch-clan', label: 'Changer de clan', href: '/clans', tone: 'sky', highlightWhenActive: false, role: 'owner' }, true)}
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  )
}
