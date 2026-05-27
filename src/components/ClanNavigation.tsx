'use client'

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'

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
  label: string
  href: string
  tone: 'neutral' | 'brand' | 'sky' | 'blue' | 'emerald'
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
  const { clanId, clearClanId, setClanId } = useSelectedClan()
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
  const [setupState, setSetupState] = useState<'first_run' | 'pending_activation' | 'completed'>('first_run')
  const [clanImageUrl, setClanImageUrl] = useState('/pubg.png')
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
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, appTheme)

    document.documentElement.setAttribute('data-app-theme', appTheme)
    document.body.setAttribute('data-app-theme', appTheme)
  }, [appTheme])

  const permissionSet = useMemo(() => new Set(permissions), [permissions])
  const hasWildcard = permissionSet.has('*')

  const canManageMembers = hasWildcard || permissionSet.has('manage_members')
  const canViewLeaderboard =
    hasWildcard || permissionSet.has('view_leaderboard') || permissionSet.has('view_reports')
  const canViewReports = hasWildcard || permissionSet.has('view_reports')
  const canManageRoles = hasWildcard || permissionSet.has('manage_roles')
  const canManageSettings = hasWildcard || permissionSet.has('manage_settings')
  const canClearClan = hasWildcard || permissionSet.has('manage_settings') || permissionSet.has('manage_roles')
  const isOwner = hasWildcard
  const canSwitchClan = isOwner

  const dashboardHref = activeMemberId ? `/members/${activeMemberId}/dashboard` : '/members'

  const primaryLinks: NavItem[] = [
    { label: 'Dashboard', href: dashboardHref, tone: 'blue' },
    {
      label: 'Mon clan',
      href: clanId ? `/clans/${clanId}/members` : '/members',
      tone: 'sky',
    },
    { label: 'Mon compte', href: '/account', tone: 'neutral' },
  ]

  const adminLinks: NavItem[] = [
    ...(canManageMembers
      ? [
          {
            label: 'Ajouter un joueur',
            href: '/members/add',
            tone: 'brand' as const,
          },
        ]
      : []),
    ...((clanId && (canManageMembers || canManageRoles))
      ? [
          {
            label: 'Joueurs et rôles',
            href: `/clans/${clanId}/settings/members`,
            tone: 'brand' as const,
          },
        ]
      : []),
    ...(canManageSettings
      ? [
          {
            label: 'Alias cartes PUBG',
            href: '/settings/map-labels',
            tone: 'neutral' as const,
          },
          {
            label: 'Accueil login',
            href: '/settings/login-welcome',
            tone: 'neutral' as const,
          },
        ]
      : []),
  ]

  const showAdminMenu = adminLinks.length > 0 || Boolean(clanId && canClearClan)
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

  async function handleSwitchMember(memberId: number) {
    const response = await fetch('/api/auth/switch-member', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({ memberId }),
    })

    if (!response.ok) {
      return
    }

    const selected = members.find((entry) => entry.memberId === memberId)
    if (selected?.clanId) {
      setClanId(selected.clanId)
    }

    await refresh()
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
          <span className="truncate">{item.label}</span>
        </span>
      </Link>
    )
  }

  function renderSubmenuLink(item: NavItem, mobile = false) {
    const active = isActiveLink(item.href)
    const darkMode = appTheme === 'dark'

    return (
      <Link
        key={`submenu-${item.href}`}
        href={item.href}
        onClick={mobile ? closeMobileDrawer : undefined}
        aria-current={active ? 'page' : undefined}
        className={cx(
          'rounded-lg px-3 py-2 text-sm font-medium transition',
          darkMode
            ? active
              ? 'bg-white/10 text-white ring-1 ring-inset ring-white/20'
              : 'text-slate-300 hover:bg-white/5 hover:text-white'
            : active
              ? 'bg-slate-100 text-slate-900 ring-1 ring-inset ring-slate-300'
              : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
        )}
      >
        {item.label}
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

  if (pathname.startsWith('/activate') || pathname.startsWith('/login')) {
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
                <div className="grid grid-cols-1 gap-2">{adminLinks.map((item) => renderSubmenuLink(item))}</div>
              </section>
            ) : null}

            {showOwnerMenu ? (
              <section>
                <p className={cx('mb-2 text-xs font-semibold uppercase tracking-[0.16em]', appTheme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                  Owner
                </p>
                <Link
                  href="/settings/cron"
                  className={cx(
                    'mb-2 block rounded-lg border px-3 py-2 text-xs font-semibold transition',
                    appTheme === 'dark'
                      ? 'border-amber-300/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20'
                      : 'border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200'
                  )}
                >
                  Ouvrir Ops Cron
                </Link>
                <Link
                  href="/settings/email-delivery"
                  className={cx(
                    'block rounded-lg border px-3 py-2 text-xs font-semibold transition',
                    appTheme === 'dark'
                      ? 'border-amber-300/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20'
                      : 'border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200'
                  )}
                >
                  Test email
                </Link>
                <Link
                  href="/settings/pubg-api"
                  className={cx(
                    'mt-2 block rounded-lg border px-3 py-2 text-xs font-semibold transition',
                    appTheme === 'dark'
                      ? 'border-amber-300/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20'
                      : 'border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200'
                  )}
                >
                  Monitoring PUBG API
                </Link>
                <Link
                  href="/clans"
                  className={cx(
                    'mt-2 block rounded-lg border px-3 py-2 text-xs font-semibold transition',
                    appTheme === 'dark'
                      ? 'border-amber-300/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20'
                      : 'border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200'
                  )}
                >
                  Changer de clan
                </Link>
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
                    className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 lg:hidden"
                    aria-expanded={mobileOpen}
                    aria-controls="mobile-clan-nav"
                  >
                    Menu
                  </button>
                  <div className="flex min-w-0 items-center gap-2 md:hidden">
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
                  <select
                    value={activeMemberId ?? ''}
                    onChange={(event) => {
                      const memberId = Number(event.target.value)
                      if (Number.isInteger(memberId) && memberId > 0) {
                        void handleSwitchMember(memberId)
                      }
                    }}
                    className="min-h-10 min-w-32 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700"
                  >
                    <option value="" disabled>
                      Membre actif
                    </option>
                    {members.map((member) => (
                      <option key={member.memberId} value={member.memberId}>
                        {member.displayName}
                      </option>
                    ))}
                  </select>

                  <div className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5">
                    <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                      {playerInitial}
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-white bg-emerald-400" />
                    </span>
                    <span className="hidden text-left sm:block">
                      <span className="block max-w-36 truncate text-xs font-semibold text-emerald-900">{playerName}</span>
                      <span className="block text-[11px] font-medium text-emerald-700">Connecte</span>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    Se deconnecter
                  </button>
                </div>
              </div>

            </div>
          </header>

          <main className="flex-1">{children}</main>
        </div>
      </div>

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
              <div className="min-w-0">
                <p className={cx('truncate text-sm font-semibold', appTheme === 'dark' ? 'text-slate-100' : 'text-slate-900')}>Navigation clan</p>
                <p className={cx('text-xs', appTheme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>Tous les acces depuis mobile</p>
              </div>
              <div className="flex items-center gap-2">
                {renderThemeToggle()}
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={closeMobileDrawer}
                  className={cx(
                    'inline-flex min-h-9 items-center justify-center rounded-lg border px-2 py-1 text-sm font-semibold',
                    appTheme === 'dark'
                      ? 'border-slate-700 bg-slate-900 text-slate-100'
                      : 'border-slate-300 bg-white text-slate-700'
                  )}
                >
                  Fermer
                </button>
              </div>
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
                <div className="grid grid-cols-1 gap-2">{adminLinks.map((item) => renderSubmenuLink(item, true))}</div>
              </section>
            ) : null}

            {showOwnerMenu ? (
              <section className="mt-5">
                <p className={cx('mb-2 text-xs font-semibold uppercase tracking-[0.16em]', appTheme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                  Owner
                </p>
                <Link
                  href="/settings/cron"
                  onClick={closeMobileDrawer}
                  className={cx(
                    'mb-2 block rounded-lg border px-3 py-2 text-xs font-semibold transition',
                    appTheme === 'dark'
                      ? 'border-amber-300/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20'
                      : 'border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200'
                  )}
                >
                  Ouvrir Ops Cron
                </Link>
                <Link
                  href="/settings/email-delivery"
                  onClick={closeMobileDrawer}
                  className={cx(
                    'mt-2 block rounded-lg border px-3 py-2 text-xs font-semibold transition',
                    appTheme === 'dark'
                      ? 'border-amber-300/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20'
                      : 'border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200'
                  )}
                >
                  Test email
                </Link>
                <Link
                  href="/settings/pubg-api"
                  onClick={closeMobileDrawer}
                  className={cx(
                    'mt-2 block rounded-lg border px-3 py-2 text-xs font-semibold transition',
                    appTheme === 'dark'
                      ? 'border-amber-300/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20'
                      : 'border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200'
                  )}
                >
                  Monitoring PUBG API
                </Link>
                <Link
                  href="/clans"
                  onClick={closeMobileDrawer}
                  className={cx(
                    'mt-2 block rounded-lg border px-3 py-2 text-xs font-semibold transition',
                    appTheme === 'dark'
                      ? 'border-amber-300/30 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20'
                      : 'border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200'
                  )}
                >
                  Changer de clan
                </Link>
              </section>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  )
}
