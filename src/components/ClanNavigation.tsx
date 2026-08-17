'use client'

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

import NavIcon from '@/components/ui/NavIcon'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { useNavPermissions } from '@/hooks/useNavPermissions'
import { getItemRole, type NavRole, type NavSection } from '@/lib/nav-permissions-registry'

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
  tone: NavItem['tone'] | 'violet'
  highlightWhenActive?: boolean
  role?: 'admin' | 'owner' | 'superuser'
}

type CronAction = 'sync_matches' | 'sync_stats' | 'generate_weekly_report' | 'generate_monthly_report'
type AppTheme = 'light' | 'dark'

type ClanNavigationProps = {
  children: React.ReactNode
}

const APP_THEME_STORAGE_KEY = 'pubg_app_theme'
const VIEWED_MEMBER_STORAGE_KEY = 'pubg_viewed_member_id'
const APP_THEME_OPTIONS: Array<{ value: AppTheme; label: string }> = [
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
]

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function getRoleBorderClass(role: 'admin' | 'owner' | 'superuser' | undefined, darkMode: boolean): string {
  if (role === 'superuser') {
    return darkMode ? 'border border-violet-500/60' : 'border border-violet-400'
  }
  if (role === 'owner') {
    return darkMode ? 'border border-amber-500/60' : 'border border-amber-400'
  }
  if (role === 'admin') {
    return darkMode ? 'border border-red-500/60' : 'border border-red-400'
  }
  return ''
}

function getToneClasses(tone: NavItem['tone'] | 'violet', active: boolean, darkMode: boolean) {
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

      if (tone === 'violet') {
        return 'bg-violet-100 text-violet-800 ring-1 ring-inset ring-violet-200'
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

    if (tone === 'violet') {
      return 'text-violet-700 hover:bg-violet-50 hover:text-violet-800'
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

    if (tone === 'violet') {
      return 'bg-violet-500/20 text-violet-100 ring-1 ring-inset ring-violet-300/30'
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

  if (tone === 'violet') {
    return 'text-violet-200 hover:bg-violet-500/10 hover:text-violet-100'
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

// ── Contextual sidebar nav ────────────────────────────────────────────────────

const CTX_EXACT_MATCH_KEYS = new Set(['clan.stats'])

const CTX_ROLE_TO_TARGET: Partial<Record<NavRole, NavSection>> = {
  admin: 'admin-menu',
  owner: 'owner-menu',
  superuser: 'superuser-menu',
}

const CTX_SECTION_LABELS: Partial<Record<NavSection, string>> = {
  'clan-section': 'Mon clan',
  'member-section': 'Mon profil',
  'admin-menu': 'Admin',
  'owner-menu': 'Owner',
  'superuser-menu': '★ SuperUser',
}

// Hrefs that must match exactly (not prefix) for section detection
const CTX_EXACT_HREFS = new Set(['/clans', '/members'])

type CtxItem = {
  navKey: string
  label: string
  displayLabel: string
  href: string
  role: NavRole
}

// ─────────────────────────────────────────────────────────────────────────────

export default function ClanNavigation({ children }: ClanNavigationProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { clanId, clearClanId, setClanId } = useSelectedClan()
  const { loading, authenticated, email, activeMemberId, permissions, members, isSuperUser, authDisabled, refresh } = useAuthSession()
  const isVisitor = !authenticated && authDisabled
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

    return 'dark'
  })
  const [cronPending, setCronPending] = useState<CronAction | null>(null)
  const [cronMessage, setCronMessage] = useState<string | null>(null)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [setupState, setSetupState] = useState<'first_run' | 'pending_activation' | 'completed'>('first_run')
  const [clanImageUrl, setClanImageUrl] = useState('/pubg.png')
  const [playerAvatarUrl, setPlayerAvatarUrl] = useState<string | null>(null)
  const [viewedMemberId, setViewedMemberId] = useState<number | null>(() => {
    if (typeof window === 'undefined') {
      return null
    }

    const stored = Number(window.sessionStorage.getItem(VIEWED_MEMBER_STORAGE_KEY))
    return Number.isInteger(stored) && stored > 0 ? stored : null
  })
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

  function isNavHidden(navKey: string): boolean {
    const role = navPerms.roles[navKey]
    if (role !== undefined) return role === 'hidden'
    return navPerms.items.find((i) => i.navKey === navKey)?.defaultRole === 'hidden'
  }

  // Member id currently in view (admin/owner/superuser may be browsing another
  // member's page); falls back to the logged-in member otherwise.
  const urlMemberId = (() => {
    const match = pathname.match(/^\/members\/(\d+)/)
    return match ? Number(match[1]) : null
  })()

  function resolveHref(template: string): string {
    return template
      .replace(':clanId', clanId ? String(clanId) : '')
      .replace(':memberId', memberIdForCtx ? String(memberIdForCtx) : '')
      .replace(/\/:[^/]+/g, '')
      || '/'
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

  // Member id to use for nav links: admin/owner/superuser browsing another
  // member's page keep pointing at that member (persisted across navigation,
  // e.g. clicking into "Mon clan" and back) instead of snapping back to self.
  const canBrowseOtherMembers = isSuperUser || isOwner || isAdmin
  const memberIdForCtx = canBrowseOtherMembers && viewedMemberId ? viewedMemberId : activeMemberId

  useEffect(() => {
    if (!canBrowseOtherMembers || urlMemberId === null || urlMemberId === viewedMemberId) {
      return
    }

    setViewedMemberId(urlMemberId)
    window.sessionStorage.setItem(VIEWED_MEMBER_STORAGE_KEY, String(urlMemberId))
  }, [canBrowseOtherMembers, urlMemberId, viewedMemberId])

  // Items promoted to another section are no longer visible in their native section
  const ROLE_TO_TARGET: Partial<Record<string, NavSection>> = {
    admin: 'admin-menu',
    owner: 'owner-menu',
    superuser: 'superuser-menu',
  }

  function getFirstSectionHref(section: NavSection, fallback: string): string {
    const items = navPerms.items.filter((i) => {
      if (i.section !== section) return false
      if (i.navKey === 'owner.switch-clan') return false
      const role = getItemRole(i.navKey, navPerms.roles)
      const target = ROLE_TO_TARGET[role]
      return !target || target === section
    })
    const posOrder = navPerms.positions[section] as string[] | undefined
    const ordered = posOrder
      ? [...items].sort((a, b) => {
          const ai = posOrder.indexOf(a.navKey)
          const bi = posOrder.indexOf(b.navKey)
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
        })
      : items
    const first = ordered.find((i) => {
      const role = getItemRole(i.navKey, navPerms.roles)
      if (role === 'hidden') return false
      if (role === 'superuser') return isSuperUser
      if (role === 'owner') return isOwner || isSuperUser
      if (role === 'admin') return isAdmin || isSuperUser
      return true
    })
    return first ? resolveHref(first.hrefTemplate) : fallback
  }

  const dashboardHref = memberIdForCtx ? `/members/${memberIdForCtx}/dashboard` : '/members'

  const primaryLinks: NavItem[] = ([
    {
      navKey: 'primary.dashboard',
      label: 'Dashboard',
      href: getFirstSectionHref('member-section', dashboardHref),
      tone: 'blue',
    },
    {
      navKey: 'primary.mon-clan',
      label: 'Mon clan',
      href: getFirstSectionHref('clan-section', clanId ? `/clans/${clanId}/members` : '/members'),
      tone: 'sky',
    },
    { navKey: 'primary.ligue', label: 'Ligue', href: '/clans-leaderboard', tone: 'brand' },
    { navKey: 'primary.comparator', label: 'Comparateur', href: '/clans/comparator', tone: 'emerald' },
    { navKey: 'primary.mon-compte', label: 'Mon compte', href: '/account', tone: 'neutral' },
  ] as NavItem[]).filter((item) => !isNavHidden(item.navKey))

  const adminEntryHref = getFirstSectionHref(
    'admin-menu',
    clanId ? `/clans/${clanId}/settings/members` : '/settings/map-labels'
  )
  const ownerEntryHref = getFirstSectionHref(
    'owner-menu',
    clanId ? `/clans/${clanId}/telemetry/dashboard` : '/settings/nav-permissions'
  )
  const superuserEntryHref = getFirstSectionHref(
    'superuser-menu',
    '/settings/nav-permissions'
  )

  const showAdminMenu = isAdmin
  const showOwnerMenu = Boolean(isOwner && clanId)
  const showSuperUserMenu = isSuperUser

  // ── Contextual sidebar section ──────────────────────────────────────────

  function resolveCtxHref(template: string, memberId: number | null): string {
    return (
      template
        .replace(':clanId', clanId ? String(clanId) : '___')
        .replace(':memberId', memberId ? String(memberId) : '___')
        .replace(/\/:[^/]+/g, '') || '/'
    )
  }

  function isValidCtxHref(href: string): boolean {
    return !href.includes('___') && href !== '/'
  }

  function ctxHrefMatchesPath(href: string, path: string): boolean {
    if (!isValidCtxHref(href)) return false
    if (CTX_EXACT_HREFS.has(href)) return path === href
    return path === href || path.startsWith(`${href}/`)
  }

  function canAccessRole(role: NavRole): boolean {
    if (role === 'hidden') return false
    if (role === 'superuser') return isSuperUser
    if (role === 'owner') return isOwner || isSuperUser
    if (role === 'admin') return isAdmin || isSuperUser
    return true
  }

  function isCtxActive(navKey: string, href: string): boolean {
    if (CTX_EXACT_MATCH_KEYS.has(navKey)) return pathname === href
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  // Detect which nav section is currently active based on pathname
  const activeSection = ((): NavSection | null => {
    const sectionsToCheck: Array<{ section: NavSection; canSee: boolean }> = [
      { section: 'superuser-menu', canSee: isSuperUser },
      { section: 'owner-menu', canSee: isOwner || isSuperUser },
      { section: 'admin-menu', canSee: isAdmin || isSuperUser },
      { section: 'clan-section', canSee: true },
      { section: 'member-section', canSee: true },
    ]
    for (const { section, canSee } of sectionsToCheck) {
      if (!canSee) continue
      const memberId = section === 'member-section' ? memberIdForCtx : activeMemberId
      if (navPerms.items.some((i) => i.section === section && ctxHrefMatchesPath(resolveCtxHref(i.hrefTemplate, memberId), pathname))) {
        return section
      }
    }
    return null
  })()

  function getCtxSectionItems(section: NavSection): { regularItems: CtxItem[]; roleItems: CtxItem[] } {
    const memberId = section === 'member-section' ? memberIdForCtx : activeMemberId
    const native = navPerms.items.filter((i) => {
      if (i.section !== section) return false
      const role = getItemRole(i.navKey, navPerms.roles)
      const target = CTX_ROLE_TO_TARGET[role]
      return !target || target === section
    })
    const posOrder = navPerms.positions[section] as string[] | undefined
    const orderedNative = posOrder
      ? [...native].sort((a, b) => {
          const ai = posOrder.indexOf(a.navKey)
          const bi = posOrder.indexOf(b.navKey)
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
        })
      : native
    const promoted = navPerms.items.filter((i) => {
      if (i.section === section) return false
      const role = getItemRole(i.navKey, navPerms.roles)
      return CTX_ROLE_TO_TARGET[role] === section
    })
    const promotedOrder = navPerms.promotedPositions[section] as string[] | undefined
    const orderedPromoted = promotedOrder?.length
      ? [...promoted].sort((a, b) => {
          const ai = promotedOrder.indexOf(a.navKey)
          const bi = promotedOrder.indexOf(b.navKey)
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
        })
      : promoted
    const allItems: CtxItem[] = [...orderedNative, ...orderedPromoted]
      .filter((i) => canAccessRole(getItemRole(i.navKey, navPerms.roles)))
      .map((i) => ({
        navKey: i.navKey,
        label: i.label,
        displayLabel: navPerms.labels[i.navKey] ?? i.label,
        href: resolveCtxHref(i.hrefTemplate, memberId),
        role: getItemRole(i.navKey, navPerms.roles),
      }))
      .filter((i) => isValidCtxHref(i.href))
    const regularItems = allItems.filter((i) => i.role === 'none' || i.role === 'member')
    const roleItems = allItems.filter((i) => i.role === 'admin' || i.role === 'owner' || i.role === 'superuser')
    return { regularItems, roleItems }
  }

  const isViewingOtherMember =
    activeSection === 'member-section' &&
    (isSuperUser || isOwner || isAdmin) &&
    urlMemberId !== null &&
    activeMemberId !== null &&
    urlMemberId !== activeMemberId
  const myProfileHref = activeMemberId ? `/members/${activeMemberId}/dashboard` : null
  const myMemberClanId = members.find((m) => m.memberId === activeMemberId)?.clanId ?? null

  function handleGoToMyProfile() {
    if (isSuperUser && myMemberClanId && myMemberClanId !== clanId) {
      setClanId(myMemberClanId)
    }
    router.push(myProfileHref ?? '/members')
  }

  // ── End contextual sidebar section ─────────────────────────────────────

  const activeMember = members.find((member) => member.memberId === activeMemberId) ?? null
  const playerName = activeMember?.displayName ?? email ?? (isVisitor ? 'Visiteur' : 'Joueur')
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
    if (!loading && setupState === 'completed' && !authenticated && !authDisabled) {
      router.replace('/login')
    }
  }, [authDisabled, authenticated, loading, router, setupState])

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

  function renderCtxItem(item: CtxItem, mobile = false) {
    const active = isCtxActive(item.navKey, item.href)
    const roleClass =
      item.role === 'owner'
        ? ' sidebar-ctx-nav-item--owner'
        : item.role === 'admin'
          ? ' sidebar-ctx-nav-item--admin'
          : item.role === 'superuser'
            ? ' sidebar-ctx-nav-item--superuser'
            : ''
    return (
      <Link
        key={item.navKey}
        href={item.href}
        onClick={mobile ? closeMobileDrawer : undefined}
        aria-current={active ? 'page' : undefined}
        className={`sidebar-ctx-nav-item${active ? ' sidebar-ctx-nav-item--active' : ''}${roleClass}`}
      >
        <span className="sidebar-ctx-nav-icon">
          <NavIcon label={item.label} />
        </span>
        {item.displayLabel}
      </Link>
    )
  }

  function renderFullCtxSection(section: NavSection, sectionTitle: string, titleClass: string, mobile = false) {
    const { regularItems, roleItems } = getCtxSectionItems(section)
    if (regularItems.length === 0 && roleItems.length === 0) return null
    return (
      <section className="mt-5">
        <p className={titleClass}>{sectionTitle}</p>
        <div className="sidebar-ctx-nav-list">
          {regularItems.map((item) => renderCtxItem(item, mobile))}
          {roleItems.length > 0 && regularItems.length > 0 && (
            <div className="sidebar-ctx-nav-divider" />
          )}
          {roleItems.map((item) => renderCtxItem(item, mobile))}
          {isViewingOtherMember && myProfileHref && section === activeSection && (
            <>
              <div className="sidebar-ctx-nav-divider" />
              <button
                type="button"
                className="sidebar-ctx-nav-item"
                onClick={() => {
                  if (mobile) closeMobileDrawer()
                  handleGoToMyProfile()
                }}
              >
                <span className="sidebar-ctx-nav-icon">
                  <NavIcon label="Tableau de bord" />
                </span>
                ← Mon profil
              </button>
            </>
          )}
        </div>
      </section>
    )
  }

  function renderCtxSection(mobile = false) {
    if (!activeSection) return null
    const sectionTitle = CTX_SECTION_LABELS[activeSection]
    if (!sectionTitle) return null
    return renderFullCtxSection(activeSection, sectionTitle, 'sidebar-ctx-nav-title', mobile)
  }

  function onMobileDrawerTransitionEnd() {
    if (!mobileOpen) {
      setMobilePanelVisible(false)
    }
  }

  async function handleLogout() {
    window.sessionStorage.removeItem(VIEWED_MEMBER_STORAGE_KEY)

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
            <NavIcon label={item.label} className="h-4 w-4 shrink-0" />
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
            <NavIcon label={item.label} className="h-4 w-4 shrink-0" />
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

  if (setupState !== 'completed' || (!authenticated && !authDisabled)) {
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
                  <p className={cx('text-xs', isVisitor ? (appTheme === 'dark' ? 'text-amber-300' : 'text-amber-700') : (appTheme === 'dark' ? 'text-emerald-300' : 'text-emerald-700'))}>
                    {isVisitor ? 'Visiteur' : 'Connecte'}
                  </p>
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

            {renderCtxSection()}

            {activeSection !== 'admin-menu' && showAdminMenu ? (
              activeSection === 'superuser-menu'
                ? renderFullCtxSection('admin-menu', 'Admin', 'sidebar-ctx-nav-title')
                : (
                  <section>
                    <p className={cx('mb-2 text-xs font-semibold uppercase tracking-[0.16em]', appTheme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                      Admin
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {renderSubmenuLink({ navKey: 'admin.entry', label: 'Paramètres admin', href: adminEntryHref, tone: 'brand', role: 'admin' })}
                    </div>
                  </section>
                )
            ) : null}

            {activeSection !== 'owner-menu' && showOwnerMenu ? (
              activeSection === 'superuser-menu'
                ? renderFullCtxSection('owner-menu', 'Owner', 'sidebar-ctx-nav-title')
                : (
                  <section>
                    <p className={cx('mb-2 text-xs font-semibold uppercase tracking-[0.16em]', appTheme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                      Owner
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {renderSubmenuLink({ navKey: 'owner.entry', label: 'Paramètres owner', href: ownerEntryHref, tone: 'emerald', role: 'owner' })}
                    </div>
                  </section>
                )
            ) : null}

            {activeSection !== 'superuser-menu' && showSuperUserMenu ? (
              <section>
                <p className={cx('mb-2 text-xs font-semibold uppercase tracking-[0.16em]', appTheme === 'dark' ? 'text-violet-400' : 'text-violet-600')}>
                  ★ SuperUser
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {renderSubmenuLink({ navKey: 'superuser.entry', label: 'Paramètres SuperUser', href: superuserEntryHref, tone: 'violet', role: 'superuser' })}
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
                      ) : isVisitor ? (
                        <p className="text-xs text-amber-700">Mode visiteur</p>
                      ) : (
                        <p className="text-xs text-amber-700">Session non connectee</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div
                    className={cx(
                      'inline-flex min-h-10 items-center gap-2 rounded-xl border px-2.5 py-1.5',
                      isVisitor ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'
                    )}
                  >
                    <span
                      className={cx(
                        'relative inline-flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-xs font-bold text-white',
                        isVisitor ? 'bg-amber-500' : 'bg-emerald-600'
                      )}
                    >
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
                      {!isVisitor && (
                        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-white bg-emerald-400" />
                      )}
                    </span>
                    <span className="hidden text-left sm:block">
                      <span className="flex max-w-44 items-center gap-1.5">
                        <span
                          className={cx(
                            'block max-w-36 truncate text-xs font-semibold',
                            isVisitor ? 'text-amber-900' : 'text-emerald-900'
                          )}
                        >
                          {playerName}
                        </span>
                        {isSuperUser ? (
                          <span
                            className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-[9px] font-bold uppercase leading-none text-violet-700"
                            title="Compte SuperUser"
                            aria-label="Compte SuperUser"
                          >
                            S
                          </span>
                        ) : null}
                      </span>
                      <span className={cx('block text-[11px] font-medium', isVisitor ? 'text-amber-700' : 'text-emerald-700')}>
                        {isVisitor ? 'Visiteur' : 'Connecte'}
                      </span>
                    </span>
                    {!isVisitor && (
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
                    )}
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

            {renderCtxSection(true)}

            {activeSection !== 'admin-menu' && showAdminMenu ? (
              activeSection === 'superuser-menu'
                ? renderFullCtxSection('admin-menu', 'Admin', 'sidebar-ctx-nav-title', true)
                : (
                  <section className="mt-5">
                    <p className={cx('mb-2 text-xs font-semibold uppercase tracking-[0.16em]', appTheme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                      Admin
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {renderSubmenuLink({ navKey: 'admin.entry', label: 'Paramètres admin', href: adminEntryHref, tone: 'brand', role: 'admin' }, true)}
                    </div>
                  </section>
                )
            ) : null}

            {activeSection !== 'owner-menu' && showOwnerMenu ? (
              activeSection === 'superuser-menu'
                ? renderFullCtxSection('owner-menu', 'Owner', 'sidebar-ctx-nav-title', true)
                : (
                  <section className="mt-5">
                    <p className={cx('mb-2 text-xs font-semibold uppercase tracking-[0.16em]', appTheme === 'dark' ? 'text-slate-400' : 'text-slate-500')}>
                      Owner
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      {renderSubmenuLink({ navKey: 'owner.entry', label: 'Paramètres owner', href: ownerEntryHref, tone: 'emerald', role: 'owner' }, true)}
                    </div>
                  </section>
                )
            ) : null}

            {activeSection !== 'superuser-menu' && showSuperUserMenu ? (
              <section className="mt-5">
                <p className={cx('mb-2 text-xs font-semibold uppercase tracking-[0.16em]', appTheme === 'dark' ? 'text-violet-400' : 'text-violet-600')}>
                  ★ SuperUser
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {renderSubmenuLink({ navKey: 'superuser.entry', label: 'Paramètres SuperUser', href: superuserEntryHref, tone: 'violet', role: 'superuser' }, true)}
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      ) : null}
    </div>
  )
}
