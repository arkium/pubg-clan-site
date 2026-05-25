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

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ')
}

function getToneClasses(tone: NavItem['tone'], active: boolean) {
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
}

export default function ClanNavigation() {
  const pathname = usePathname()
  const router = useRouter()
  const { clanId, clearClanId, setClanId } = useSelectedClan()
  const { loading, authenticated, activeMemberId, permissions, members, refresh } = useAuthSession()
  const [clan, setClan] = useState<ClanSummary | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [cronPending, setCronPending] = useState<CronAction | null>(null)
  const [cronMessage, setCronMessage] = useState<string | null>(null)
  const [setupState, setSetupState] = useState<'first_run' | 'pending_activation' | 'completed'>('completed')
  const [clanImageUrl, setClanImageUrl] = useState('/pubg.png')
  const navRootRef = useRef<HTMLElement | null>(null)

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
  const canSwitchClan = canManageMembers || canManageRoles || canManageSettings || isOwner

  const dashboardHref = activeMemberId ? `/members/${activeMemberId}/dashboard` : '/members'

  const primaryLinks: NavItem[] = [
    { label: 'Dashboard', href: dashboardHref, tone: 'blue' },
    ...(clanId
      ? [
          {
            label: 'Matchs',
            href: `/clans/${clanId}/matches`,
            tone: 'brand' as const,
          },
          {
            label: 'Clan',
            href: `/clans/${clanId}/stats`,
            tone: 'sky' as const,
          },
          ...(canViewLeaderboard
            ? [
                {
                  label: 'Classement',
                  href: `/clans/${clanId}/leaderboard`,
                  tone: 'blue' as const,
                },
              ]
            : []),
          { label: 'Joueurs', href: '/members', tone: 'sky' as const },
          ...(canViewReports
            ? [
                {
                  label: 'Rapports',
                  href: `/clans/${clanId}/reports`,
                  tone: 'emerald' as const,
                },
              ]
            : []),
        ]
      : []),
    ...(!clanId ? [{ label: 'Joueurs', href: '/members', tone: 'sky' as const }] : []),
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
          {
            label: 'Gérer les joueurs',
            href: '/members/manage',
            tone: 'neutral' as const,
          },
        ]
      : []),
    ...(clanId && canManageRoles
      ? [
          {
            label: 'Paramètres rôles',
            href: `/clans/${clanId}/settings/members`,
            tone: 'neutral' as const,
          },
        ]
      : []),
    ...(canManageSettings
      ? [
          {
            label: 'Monitoring PUBG API',
            href: '/settings/pubg-api',
            tone: 'neutral' as const,
          },
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
          {
            label: 'Test email',
            href: '/settings/email-delivery',
            tone: 'neutral' as const,
          },
        ]
      : []),
    ...(canSwitchClan
      ? [
          {
            label: 'Changer de clan',
            href: '/clans',
            tone: 'neutral' as const,
          },
        ]
      : []),
  ]

  const showAdminMenu = adminLinks.length > 0 || Boolean(clanId && canClearClan)
  const showOwnerMenu = Boolean(isOwner && clanId)

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
    closeDropdownMenus()
  }, [pathname])

  async function handleLogout() {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
    })

    if (!response.ok) {
      return
    }

    await refresh()
    router.replace('/login')
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
        | null
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

      const parts = [payload.message ?? 'Action cron lancée']
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

  function closeDropdownMenus() {
    const root = navRootRef.current
    if (!root) {
      return
    }

    root.querySelectorAll('details[open]').forEach((detailsElement) => {
      detailsElement.removeAttribute('open')
    })
  }

  function renderLink(item: NavItem, mobile = false) {
    const active = isActiveLink(item.href)

    return (
      <Link
        key={`${mobile ? 'm' : 'd'}-${item.href}`}
        href={item.href}
        onClick={mobile ? () => setMobileOpen(false) : undefined}
        className={cx(
          'rounded-xl border px-3 py-2 text-sm font-semibold transition',
          mobile && 'block w-full text-center',
          getToneClasses(item.tone, active)
        )}
      >
        {item.label}
      </Link>
    )
  }

  function renderSubmenuLink(item: NavItem, mobile = false) {
    const active = isActiveLink(item.href)

    return (
      <Link
        key={`submenu-${item.href}`}
        href={item.href}
        onClick={() => {
          closeDropdownMenus()
          if (mobile) {
            setMobileOpen(false)
          }
        }}
        className={cx(
          'rounded-lg border px-3 py-2 text-sm font-medium transition',
          active
            ? 'border-slate-300 bg-slate-100 text-slate-900'
            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
        )}
      >
        {item.label}
      </Link>
    )
  }

  if (setupState !== 'completed' || !authenticated) {
    return null
  }

  if (pathname.startsWith('/activate') || pathname.startsWith('/login')) {
    return null
  }

  return (
    <header ref={navRootRef} className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/85 backdrop-blur">
      <div className="mx-auto w-full max-w-7xl px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:justify-between">
          <div className="flex items-start justify-between gap-3 md:min-w-0 md:flex-1">
            <div className="flex min-w-0 flex-1 items-center gap-3" aria-live="polite">
              <img
                src={clanImageUrl}
                alt="Image du clan"
                className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 object-cover sm:h-11 sm:w-11 md:h-12 md:w-12"
                onError={(event) => {
                  const target = event.currentTarget
                  if (target.src.endsWith('/pubg.png')) {
                    return
                  }
                  target.src = '/pubg.png'
                }}
              />

              <div className="min-w-0 flex-1 space-y-1">
                <div className="truncate text-sm font-semibold text-slate-800">
                  {clanId && clan ? (
                    <span>
                      <strong>{clan.name}</strong> [{clan.tag}]
                    </span>
                  ) : (
                    <span>Aucun clan sélectionné</span>
                  )}
                </div>

                {loading ? (
                  <p className="text-xs text-slate-500">Vérification de session...</p>
                ) : authenticated ? (
                  <p className="text-xs text-emerald-700">Connecté</p>
                ) : (
                  <p className="text-xs text-amber-700">Session non connectée</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileOpen((current) => !current)}
              className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 md:hidden"
              aria-expanded={mobileOpen}
              aria-controls="mobile-clan-nav"
            >
              Menu
            </button>
          </div>

          <div className="flex w-full items-center gap-2 md:w-auto md:justify-end">
            {authenticated ? (
              <select
                value={activeMemberId ?? ''}
                onChange={(event) => {
                  const memberId = Number(event.target.value)
                  if (Number.isInteger(memberId) && memberId > 0) {
                    void handleSwitchMember(memberId)
                  }
                }}
                className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 md:min-w-36 md:flex-none"
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
            ) : null}

            {authenticated ? (
              <button
                type="button"
                onClick={() => void handleLogout()}
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Se déconnecter
              </button>
            ) : (
              <Link
                href="/login"
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Connexion
              </Link>
            )}
          </div>
        </div>

        <nav className="mt-3 hidden flex-wrap items-center gap-2 md:flex">
          {primaryLinks.map((item) => renderLink(item))}

          {showAdminMenu ? (
            <details className="group relative">
              <summary className="cursor-pointer list-none rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                Admin
              </summary>
              <div className="absolute left-0 top-11 z-50 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg">
                <div className="grid grid-cols-1 gap-2">{adminLinks.map((item) => renderSubmenuLink(item))}</div>
                {clanId && canClearClan ? (
                  <button
                    type="button"
                      onClick={() => {
                        closeDropdownMenus()
                        clearClanId()
                      }}
                    className="mt-2 w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                  >
                    Effacer clan
                  </button>
                ) : null}
              </div>
            </details>
          ) : null}

          {showOwnerMenu ? (
            <details className="group relative">
              <summary className="cursor-pointer list-none rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-100">
                Owner
              </summary>
              <div className="absolute left-0 top-11 z-50 w-64 rounded-2xl border border-amber-200 bg-white p-3 shadow-lg">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-700">Cron</p>
                <Link
                  href={`/clans/${clanId}/settings/cron`}
                  onClick={closeDropdownMenus}
                  className="mb-2 block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
                >
                  Ouvrir Ops Cron
                </Link>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCronAction('sync_matches')}
                    disabled={cronPending !== null}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Sync matchs
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCronAction('sync_stats')}
                    disabled={cronPending !== null}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Sync stats
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCronAction('generate_weekly_report')}
                    disabled={cronPending !== null}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Rapport hebdo
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCronAction('generate_monthly_report')}
                    disabled={cronPending !== null}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Rapport mensuel
                  </button>
                </div>
              </div>
            </details>
          ) : null}

          {cronMessage ? <p className="text-xs text-slate-600">{cronMessage}</p> : null}
        </nav>

        <div id="mobile-clan-nav" className={cx('mt-3 md:hidden', !mobileOpen && 'hidden')}>
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-3 shadow-sm">
            <nav className="grid grid-cols-1 gap-2">{primaryLinks.map((item) => renderLink(item, true))}</nav>

            {showAdminMenu ? (
              <details className="mt-3 rounded-xl border border-slate-200 bg-white p-2">
                <summary className="cursor-pointer list-none px-2 py-1 text-sm font-semibold text-slate-700">Admin</summary>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  {adminLinks.map((item) => renderSubmenuLink(item, true))}
                  {clanId && canClearClan ? (
                    <button
                      type="button"
                      onClick={() => {
                        clearClanId()
                        setMobileOpen(false)
                      }}
                      className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
                    >
                      Effacer clan
                    </button>
                  ) : null}
                </div>
              </details>
            ) : null}

            {showOwnerMenu ? (
              <details className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 p-2">
                <summary className="cursor-pointer list-none px-2 py-1 text-sm font-semibold text-amber-800">Owner</summary>
                <Link
                  href={`/clans/${clanId}/settings/cron`}
                  onClick={() => setMobileOpen(false)}
                  className="mt-2 block rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
                >
                  Ouvrir Ops Cron
                </Link>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCronAction('sync_matches')}
                    disabled={cronPending !== null}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Sync matchs
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCronAction('sync_stats')}
                    disabled={cronPending !== null}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Sync stats
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCronAction('generate_weekly_report')}
                    disabled={cronPending !== null}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Rapport hebdo
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCronAction('generate_monthly_report')}
                    disabled={cronPending !== null}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Rapport mensuel
                  </button>
                  {cronMessage ? <p className="text-xs text-slate-600">{cronMessage}</p> : null}
                </div>
              </details>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  )
}
