'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import MemberPageHeader from '@/components/member/MemberPageHeader'
import MemberSectionNav from '@/components/MemberSectionNav'
import MobileDropdownNav, { type MobileDropdownNavItem } from '@/components/ui/MobileDropdownNav'
import type { NotificationItem, NotificationType } from '@/types/notifications'
import { NOTIFICATION_TYPES } from '@/types/notifications'

type ReadFilter = 'all' | 'read' | 'unread'

type NotificationPayload = {
  notifications: NotificationItem[]
  unreadCount: number
}

function parseMemberId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function formatTypeLabel(type: string) {
  return type.replaceAll('_', ' ')
}

export default function NotificationsPage() {
  const params = useParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])

  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [readFilter, setReadFilter] = useState<ReadFilter>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | NotificationType>('all')
  const [offset, setOffset] = useState(0)

  const limit = 20

  useEffect(() => {
    if (!memberId) {
      return
    }

    let cancelled = false

    async function loadNotifications() {
      try {
        setLoading(true)
        setError('')

        const params = new URLSearchParams({
          limit: String(limit),
          offset: String(offset),
        })

        if (readFilter === 'read') {
          params.set('read', 'true')
        }

        if (readFilter === 'unread') {
          params.set('read', 'false')
        }

        if (typeFilter !== 'all') {
          params.set('type', typeFilter)
        }

        const response = await fetch(`/api/members/${memberId}/notifications?${params.toString()}`)
        const data = (await response.json()) as NotificationPayload | { error?: string }

        if (!response.ok) {
          throw new Error('error' in data ? data.error : 'Failed to fetch notifications')
        }

        if (!cancelled) {
          const payload = data as NotificationPayload
          setNotifications(payload.notifications)
          setUnreadCount(payload.unreadCount)
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to fetch notifications')
          setNotifications([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadNotifications()

    return () => {
      cancelled = true
    }
  }, [limit, memberId, offset, readFilter, typeFilter])

  if (!memberId) {
    return (
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
        <p className="text-sm text-red-600">Invalid member id.</p>
      </main>
    )
  }

  async function markAsRead(notificationId: string) {
    await fetch(`/api/members/${memberId}/notifications/${notificationId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ read: true }),
    })

    setNotifications((current) =>
      current.map((notification) =>
        notification.id === notificationId
          ? { ...notification, read: true, readAt: new Date().toISOString() }
          : notification
      )
    )
    setUnreadCount((current) => Math.max(0, current - 1))
  }

  async function markAllAsRead() {
    const response = await fetch(`/api/members/${memberId}/notifications`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ read: true, all: true }),
    })

    if (!response.ok) {
      return
    }

    setNotifications((current) =>
      current.map((notification) => ({
        ...notification,
        read: true,
        readAt: notification.readAt ?? new Date().toISOString(),
      }))
    )
    setUnreadCount(0)
  }

  async function deleteNotification(notificationId: string) {
    const response = await fetch(`/api/members/${memberId}/notifications/${notificationId}`, {
      method: 'DELETE',
    })

    if (!response.ok) {
      return
    }

    setNotifications((current) => current.filter((notification) => notification.id !== notificationId))
  }

  const readFilterLabelMap: Record<ReadFilter, string> = {
    all: 'Toutes',
    unread: 'Non lues',
    read: 'Lues',
  }

  const readFilterItems: MobileDropdownNavItem[] = [
    {
      key: 'all',
      label: 'Toutes',
      active: readFilter === 'all',
      onSelect: () => {
        setOffset(0)
        setReadFilter('all')
      },
    },
    {
      key: 'unread',
      label: 'Non lues',
      active: readFilter === 'unread',
      onSelect: () => {
        setOffset(0)
        setReadFilter('unread')
      },
    },
    {
      key: 'read',
      label: 'Lues',
      active: readFilter === 'read',
      onSelect: () => {
        setOffset(0)
        setReadFilter('read')
      },
    },
  ]

  const typeFilterLabelMap: Record<'all' | NotificationType, string> = {
    all: 'Tous',
    squad_detected: formatTypeLabel('squad_detected'),
    top_performance: formatTypeLabel('top_performance'),
    challenge_started: formatTypeLabel('challenge_started'),
    report_ready: formatTypeLabel('report_ready'),
    invite_reminder: formatTypeLabel('invite_reminder'),
  }

  const typeFilterItems: MobileDropdownNavItem[] = [
    {
      key: 'all',
      label: 'Tous',
      active: typeFilter === 'all',
      onSelect: () => {
        setOffset(0)
        setTypeFilter('all')
      },
    },
    ...NOTIFICATION_TYPES.map((type) => ({
      key: type,
      label: formatTypeLabel(type),
      active: typeFilter === type,
      onSelect: () => {
        setOffset(0)
        setTypeFilter(type)
      },
    })),
  ]

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <section className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <MemberPageHeader
          title="Notifications"
          subtitle={`${unreadCount} non lue${unreadCount > 1 ? 's' : ''}`}
          showBackButton={false}
          framed={false}
        />
        <MemberSectionNav memberId={memberId} framed={false} showMemberIdentity={false} />
      </section>

      <div className="mb-4 rounded border border-gray-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="grid gap-3 md:grid-cols-2">
            <MobileDropdownNav
              id={`notifications-status-${memberId}`}
              label="Statut"
              currentLabel={readFilterLabelMap[readFilter]}
              items={readFilterItems}
              variant="compact"
              visibilityClass="block"
              leftIcon={(
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                  <path
                    d="M4 5.5h12M6.5 10h7M8.5 14.5h3"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            />

            <MobileDropdownNav
              id={`notifications-type-${memberId}`}
              label="Type"
              currentLabel={typeFilterLabelMap[typeFilter]}
              items={typeFilterItems}
              variant="compact"
              visibilityClass="block"
              leftIcon={(
                <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                  <path
                    d="M4.5 6h11M4.5 10h11M4.5 14h11"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                  />
                </svg>
              )}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <Link
              href={`/members/${memberId}/notification-preferences`}
              className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Préférences
            </Link>
            <button
              type="button"
              onClick={() => void markAllAsRead()}
              className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Marquer toutes lues
            </button>
          </div>
        </div>
      </div>

      {loading ? <p className="text-sm text-gray-600">Chargement...</p> : null}
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {!loading && notifications.length === 0 ? (
        <p className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-600">
          Aucune notification pour ce filtre.
        </p>
      ) : null}

      {!loading && notifications.length > 0 ? (
        <ul className="space-y-3">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className={`rounded border p-4 ${notification.read ? 'border-gray-200 bg-white' : 'border-blue-100 bg-blue-50'}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{notification.title}</p>
                  <p className="text-sm text-gray-700">{notification.message}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {formatTypeLabel(notification.type)} · {new Date(notification.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!notification.read ? (
                    <button
                      type="button"
                      onClick={() => void markAsRead(notification.id)}
                      className="rounded border border-blue-200 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                    >
                      Marquer lue
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void deleteNotification(notification.id)}
                    className="rounded border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setOffset((current) => Math.max(0, current - limit))}
          disabled={offset === 0}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-50"
        >
          Aller a la page precedente
        </button>
        <button
          type="button"
          onClick={() => setOffset((current) => current + limit)}
          disabled={notifications.length < limit}
          className="rounded border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-50"
        >
          Aller a la page suivante
        </button>
      </div>
    </main>
  )
}
