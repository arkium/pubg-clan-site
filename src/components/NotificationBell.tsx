'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import type { NotificationItem } from '@/types/notifications'

type NotificationResponse = {
  notifications: NotificationItem[]
  unreadCount: number
}

export default function NotificationBell({ memberId }: { memberId: number }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  const hasUnread = useMemo(() => unreadCount > 0, [unreadCount])

  useEffect(() => {
    let cancelled = false

    async function loadNotifications() {
      try {
        setLoading(true)
        const response = await fetch(`/api/members/${memberId}/notifications?limit=8&offset=0`)
        const data = (await response.json()) as NotificationResponse | { error?: string }

        if (!response.ok) {
          throw new Error('error' in data ? data.error : 'Failed to load notifications')
        }

        if (!cancelled) {
          const payload = data as NotificationResponse
          setNotifications(payload.notifications)
          setUnreadCount(payload.unreadCount)
        }
      } catch {
        if (!cancelled) {
          setNotifications([])
          setUnreadCount(0)
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
  }, [memberId])

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

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative rounded border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        🔔 Notifications
        {hasUnread ? (
          <span className="ml-2 inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
            {unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-96 rounded border border-gray-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-900">Dernières notifications</p>
            <Link
              href={`/members/${memberId}/notifications`}
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Voir toutes
            </Link>
          </div>

          {loading ? <p className="text-sm text-gray-500">Chargement...</p> : null}

          {!loading && notifications.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune notification</p>
          ) : null}

          {!loading && notifications.length > 0 ? (
            <ul className="max-h-80 space-y-2 overflow-auto">
              {notifications.map((notification) => (
                <li
                  key={notification.id}
                  className={`rounded border p-2 ${notification.read ? 'border-gray-200 bg-gray-50' : 'border-blue-100 bg-blue-50'}`}
                >
                  <p className="text-sm font-semibold text-gray-900">{notification.title}</p>
                  <p className="text-xs text-gray-700">{notification.message}</p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-500">
                      {new Date(notification.createdAt).toLocaleString()}
                    </span>
                    {!notification.read ? (
                      <button
                        type="button"
                        onClick={() => void markAsRead(notification.id)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        Marquer lue
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
