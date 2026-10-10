'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, BellOff, Check, CheckCheck, Settings2, Trash2 } from 'lucide-react'

import MemberPageHeader from '@/components/member/MemberPageHeader'
import { NotificationAccessState, type NotificationAccess } from '@/components/notifications/NotificationAccessState'
import { NotificationTypeTile, notificationTypeColors, notificationTypeLabel } from '@/components/notifications/NotificationTypeTile'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import MobileDropdownNav from '@/components/ui/MobileDropdownNav'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import Pagination from '@/components/ui/Pagination'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import type { NotificationItem, NotificationType } from '@/types/notifications'
import { NOTIFICATION_TYPE_LABELS, NOTIFICATION_TYPES } from '@/types/notifications'

/**
 * Notifications d'un joueur — matchs détectés, performances, défis, demandes à traiter.
 *
 * Charte UI (docs/ui/index.html, 10/10/2026) : bannière des pages joueur à titre Teko, bandeau à une seule hauteur
 * (statut en segmented, type en menu compact, actions en `app-toolbar-btn`), notifications groupées par jour dans des
 * panneaux, nature en tuile d'icône aux couleurs de jeu, pagination numérotée. Pendant un changement de filtre ou de
 * page, la liste précédente reste affichée, estompée.
 */

const PAGE_SIZE = 20

type ReadFilter = 'all' | 'unread' | 'read'
type TypeFilter = 'all' | NotificationType

type NotificationPayload = {
  notifications?: NotificationItem[]
  total?: number
  unreadCount?: number
}

const READ_OPTIONS: { value: ReadFilter; label: string }[] = [
  { value: 'all', label: 'Toutes' },
  { value: 'unread', label: 'Non lues' },
  { value: 'read', label: 'Lues' },
]

const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
const DAY_LABEL = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const TIME_LABEL = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })

/** Jours calendaires de Paris, dans l'ordre de la liste (la plus récente d'abord). */
function groupByDay(notifications: NotificationItem[]) {
  const days: { day: string; label: string; notifications: NotificationItem[] }[] = []
  for (const notification of notifications) {
    const date = new Date(notification.createdAt)
    const day = DAY_KEY.format(date)
    const last = days.at(-1)
    if (last?.day === day) {
      last.notifications.push(notification)
    } else {
      days.push({ day, label: DAY_LABEL.format(date), notifications: [notification] })
    }
  }
  return days
}

function parseMemberId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function NotificationRow({
  notification,
  onMarkRead,
  onDelete,
}: {
  notification: NotificationItem
  onMarkRead: () => void
  onDelete: () => void
}) {
  return (
    <li
      className="flex items-start gap-3 border-t border-gray-200 px-3.5 py-3 first:border-t-0 sm:px-4"
      data-testid="notification"
      data-read={notification.read}
    >
      <span className="mt-0.5">
        <NotificationTypeTile type={notification.type} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2">
            {!notification.read ? (
              <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--theme-ui-accent)]" title="Non lue" aria-hidden="true" />
            ) : null}
            <span className={`t-card-title break-words ${notification.read ? 'text-gray-700' : ''}`}>
              {notification.read ? null : <span className="sr-only">Non lue : </span>}
              {notification.title}
            </span>
          </span>
          <time className="t-meta shrink-0 tabular-nums" dateTime={notification.createdAt}>
            {TIME_LABEL.format(new Date(notification.createdAt))}
          </time>
        </div>
        <p className="t-body mt-1 break-words text-gray-700">{notification.message}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span
            className="rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wide"
            style={notificationTypeColors(notification.type)}
          >
            {notificationTypeLabel(notification.type)}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            {!notification.read ? (
              <button
                type="button"
                onClick={onMarkRead}
                className="app-btn app-btn--sm app-btn--secondary gap-1.5"
                aria-label={`Marquer comme lue : ${notification.title}`}
              >
                <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">Marquer comme lue</span>
              </button>
            ) : null}
            {/* Icône seule : un libellé rouge par ligne alourdirait la liste ; le nom accessible garde « Supprimer ». */}
            <button
              type="button"
              onClick={onDelete}
              className="app-btn app-btn--sm app-btn--danger"
              aria-label={`Supprimer : ${notification.title}`}
              title="Supprimer"
            >
              <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </button>
          </span>
        </div>
      </div>
    </li>
  )
}

export default function NotificationsPage() {
  const params = useParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])

  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [total, setTotal] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)
  const [readFilter, setReadFilter] = useState<ReadFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [access, setAccess] = useState<NotificationAccess>('ok')
  const [reloadToken, setReloadToken] = useState(0)
  const listTop = useRef<HTMLDivElement>(null)

  // Patron de chargement du dépôt (cf. /clans/mutations) : fonction async déclarée dans l'effet, rechargement par jeton.
  useEffect(() => {
    if (!memberId) return
    let cancelled = false
    const controller = new AbortController()

    async function loadNotifications() {
      try {
        setLoading(true)
        setError(null)

        const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) })
        if (readFilter !== 'all') query.set('read', readFilter === 'read' ? 'true' : 'false')
        if (typeFilter !== 'all') query.set('type', typeFilter)

        const res = await fetch(`/api/members/${memberId}/notifications?${query.toString()}`, {
          cache: 'no-store',
          signal: controller.signal,
        })

        if (res.status === 401 || res.status === 403) {
          if (!cancelled) setAccess(res.status === 401 ? 'signed-out' : 'forbidden')
          return
        }
        if (!res.ok) {
          throw new Error('Impossible de charger les notifications.')
        }

        const data = (await res.json()) as NotificationPayload
        if (cancelled) return

        const nextTotal = data.total ?? 0
        // Page vidée par des suppressions ou un « tout lire » : on revient à la dernière page qui existe.
        const lastPage = Math.max(1, Math.ceil(nextTotal / PAGE_SIZE))
        if (page > lastPage) {
          setPage(lastPage)
          return
        }

        setAccess('ok')
        setNotifications(data.notifications ?? [])
        setTotal(nextTotal)
        setUnreadCount(data.unreadCount ?? 0)
        setLoaded(true)
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur inconnue')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadNotifications()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [memberId, page, readFilter, typeFilter, reloadToken])

  if (!memberId) {
    return (
      <div className="app-container app-main flex-1">
        <p className="text-sm text-[var(--theme-ui-negative)]">Identifiant de joueur invalide.</p>
      </div>
    )
  }

  const filtersActive = readFilter !== 'all' || typeFilter !== 'all'

  function reload() {
    setReloadToken((token) => token + 1)
  }

  function changeReadFilter(value: ReadFilter) {
    setPage(1)
    setReadFilter(value)
  }

  function changeTypeFilter(value: TypeFilter) {
    setPage(1)
    setTypeFilter(value)
  }

  function resetFilters() {
    setPage(1)
    setReadFilter('all')
    setTypeFilter('all')
  }

  function goToPage(next: number) {
    setPage(next)
    // La page suivante se lit depuis son début, pas depuis la pagination en bas de liste.
    listTop.current?.scrollIntoView({ block: 'start' })
  }

  async function markAsRead(notification: NotificationItem) {
    setActionError(null)
    const res = await fetch(`/api/members/${memberId}/notifications/${notification.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ read: true }),
    }).catch(() => null)
    if (!res?.ok) {
      setActionError('La notification n’a pas pu être marquée comme lue.')
      return
    }
    setNotifications((current) =>
      current.map((item) => (item.id === notification.id ? { ...item, read: true, readAt: new Date().toISOString() } : item))
    )
    setUnreadCount((current) => Math.max(0, current - 1))
    // Filtre « Non lues » : la notification sort de la liste, la page se recharge pour rester complète.
    if (readFilter === 'unread') reload()
  }

  async function markAllAsRead() {
    setActionError(null)
    const res = await fetch(`/api/members/${memberId}/notifications`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ read: true, all: true }),
    }).catch(() => null)
    if (!res?.ok) {
      setActionError('Les notifications n’ont pas pu être marquées comme lues.')
      return
    }
    reload()
  }

  async function deleteNotification(notification: NotificationItem) {
    setActionError(null)
    const res = await fetch(`/api/members/${memberId}/notifications/${notification.id}`, { method: 'DELETE' }).catch(() => null)
    if (!res?.ok) {
      setActionError('La notification n’a pas pu être supprimée.')
      return
    }
    setNotifications((current) => current.filter((item) => item.id !== notification.id))
    setTotal((current) => Math.max(0, current - 1))
    if (!notification.read) setUnreadCount((current) => Math.max(0, current - 1))
    reload()
  }

  const days = groupByDay(notifications)
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const typeItems = [
    { key: 'all', label: 'Tous', active: typeFilter === 'all', onSelect: () => changeTypeFilter('all') },
    ...NOTIFICATION_TYPES.map((type) => ({
      key: type,
      label: NOTIFICATION_TYPE_LABELS[type],
      active: typeFilter === type,
      onSelect: () => changeTypeFilter(type),
    })),
  ]
  const subtitle = !loaded
    ? 'Matchs détectés, performances, défis et demandes à traiter.'
    : unreadCount > 0
      ? `${unreadCount} notification${unreadCount > 1 ? 's' : ''} non lue${unreadCount > 1 ? 's' : ''}.`
      : 'Tout est lu.'

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    // `.charte` : page migrée vers la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    // `.game-ui` : jetons --game-* (nature des notifications).
    <div className="app-main-flush game-ui charte flex-1">
      <div className="app-container app-gutter space-y-4">
        <NavigationTrail
          currentLabel="Notifications"
          currentHref={`/members/${memberId}/notifications`}
          fallbackParent={{ href: `/members/${memberId}/dashboard`, label: 'Tableau de bord', altHref: '/members' }}
        />
        <MemberPageHeader
          title="Notifications"
          subtitle={subtitle}
          showBackButton={false}
          backgroundImage="/duo2.jpg"
          backgroundPosition="center 35%"
          icon={<Bell className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />}
        />
      </div>

      {/*
        Pas de période : le bandeau ne docke pas sur mobile (docs/TODO/sticky.md §2). Une seule hauteur par ligne ; sous
        640 px, les boutons d'action passent en icône seule (nom accessible conservé). Sans accès, rien à filtrer.
      */}
      {access === 'ok' ? (
        <DockingToolbar ariaLabel="Filtres des notifications" dockOnMobile={false}>
          <div className="flex w-full flex-wrap items-center gap-3">
            <div role="group" aria-label="Statut" className="flex self-stretch">
              <SegmentedControl options={READ_OPTIONS} value={readFilter} onChange={changeReadFilter} />
            </div>
            <MobileDropdownNav
              id={`notifications-type-${memberId}`}
              label="Type"
              variant="compact"
              currentLabel={typeFilter === 'all' ? 'Tous' : NOTIFICATION_TYPE_LABELS[typeFilter]}
              items={typeItems}
              visibilityClass="block"
              className="min-w-0 flex-1 sm:min-w-[13rem] sm:flex-none"
            />
            <div className="ml-auto flex items-center gap-2 self-stretch">
              <Link
                href={`/members/${memberId}/notification-preferences`}
                className="app-toolbar-btn self-stretch"
                aria-label="Préférences de notifications"
                title="Préférences de notifications"
              >
                <Settings2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">Préférences</span>
              </Link>
              <button
                type="button"
                onClick={() => void markAllAsRead()}
                disabled={unreadCount === 0}
                className="app-toolbar-btn self-stretch"
                aria-label="Tout marquer comme lu"
                title="Tout marquer comme lu"
              >
                <CheckCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="hidden sm:inline">Tout marquer comme lu</span>
              </button>
            </div>
          </div>
        </DockingToolbar>
      ) : null}

      {/* Sans bandeau, l'écart avec la bannière revient au contenu (gap-4 du rythme de page). */}
      <div ref={listTop} className={`app-container app-gutter scroll-mt-24 pb-8${access === 'ok' ? '' : ' pt-4'}`}>
        {access !== 'ok' ? (
          <NotificationAccessState access={access} memberId={memberId} section="notifications" />
        ) : loading && !loaded ? (
          <CardSkeleton />
        ) : error && !loaded ? (
          <section className="app-panel flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-[var(--theme-ui-negative)]">{error}</p>
            <button type="button" onClick={reload} className="app-btn app-btn--md app-btn--secondary">
              Réessayer
            </button>
          </section>
        ) : (
          // Changement de filtre ou de page : la liste précédente reste affichée, estompée, jusqu'à la suivante.
          <div aria-busy={loading} className={`flex flex-col gap-4 transition-opacity${loading ? ' opacity-60' : ''}`}>
            {error || actionError ? (
              <p className="app-panel p-4 text-sm text-[var(--theme-ui-negative)]" role="alert">
                {actionError ?? error}
              </p>
            ) : null}
            {notifications.length === 0 ? (
              // État vide (charte §2) : bordure pointillée, rayon 14.
              <section className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-gray-200 p-8 text-center">
                <BellOff className="h-8 w-8 text-gray-500" aria-hidden="true" />
                <p className="t-card-title">{filtersActive ? 'Aucune notification pour ces filtres' : 'Aucune notification'}</p>
                <p className="t-meta max-w-md">
                  {filtersActive
                    ? 'Élargis le statut ou le type pour retrouver tes notifications.'
                    : 'Les parties en escouade, performances et défis du clan s’afficheront ici.'}
                </p>
                {filtersActive ? (
                  <button type="button" onClick={resetFilters} className="app-btn app-btn--sm app-btn--secondary mt-1">
                    Réinitialiser les filtres
                  </button>
                ) : null}
              </section>
            ) : (
              <>
                {days.map((day) => (
                  <section key={day.day} aria-labelledby={`notifications-${day.day}`} className="flex flex-col gap-2">
                    <h2 id={`notifications-${day.day}`} className="t-label">
                      {day.label}
                    </h2>
                    <ul className="app-panel overflow-hidden">
                      {day.notifications.map((notification) => (
                        <NotificationRow
                          key={notification.id}
                          notification={notification}
                          onMarkRead={() => void markAsRead(notification)}
                          onDelete={() => void deleteNotification(notification)}
                        />
                      ))}
                    </ul>
                  </section>
                ))}
                <Pagination
                  page={page}
                  pageCount={pageCount}
                  total={total}
                  pageSize={PAGE_SIZE}
                  onPageChange={goToPage}
                  ariaLabel="Pages des notifications"
                  itemLabel="Notifications"
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
