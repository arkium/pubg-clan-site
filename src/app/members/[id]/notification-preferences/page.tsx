'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import type { NotificationPreferenceItem } from '@/types/notifications'
import { NavigationTrail } from '@/components/ui/NavigationTrail'

function parseMemberId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

type PreferencesResponse = {
  preferences: NotificationPreferenceItem
}

export default function NotificationPreferencesPage() {
  const params = useParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])

  const [preferences, setPreferences] = useState<NotificationPreferenceItem | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (!memberId) {
      return
    }

    let cancelled = false

    async function loadPreferences() {
      try {
        setLoading(true)
        setError('')

        const response = await fetch(`/api/members/${memberId}/notification-preferences`)
        const data = (await response.json()) as PreferencesResponse | { error?: string }

        if (!response.ok) {
          throw new Error('error' in data ? data.error : 'Failed to load preferences')
        }

        if (!cancelled) {
          setPreferences((data as PreferencesResponse).preferences)
        }
      } catch (fetchError) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : 'Failed to load preferences')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadPreferences()

    return () => {
      cancelled = true
    }
  }, [memberId])

  if (!memberId) {
    return (
      <main className="app-container app-main space-y-4">
        <NavigationTrail
          currentLabel="Préférences"
          currentHref={`/members`}
          fallbackParent={{ href: `/members`, label: 'Membres' }}
        />
        <p className="text-sm text-red-600">Invalid member id.</p>
      </main>
    )
  }

  async function savePreferences() {
    if (!preferences) {
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const response = await fetch(`/api/members/${memberId}/notification-preferences`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(preferences),
      })
      const data = (await response.json()) as PreferencesResponse | { error?: string }

      if (!response.ok) {
        throw new Error('error' in data ? data.error : 'Failed to save preferences')
      }

      setPreferences((data as PreferencesResponse).preferences)
      setSuccess('Préférences enregistrées')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save preferences')
    } finally {
      setSaving(false)
    }
  }

  function togglePreference(key: keyof NotificationPreferenceItem) {
    setPreferences((current) => {
      if (!current || typeof current[key] !== 'boolean') {
        return current
      }

      return {
        ...current,
        [key]: !current[key],
      }
    })
  }

  return (
    <main className="app-container app-main space-y-4">
      <NavigationTrail
        currentLabel="Préférences"
        currentHref={`/members/${memberId}/notification-preferences`}
        fallbackParent={{ href: `/members/${memberId}/notifications`, label: 'Notifications', altHref: '/members' }}
      />
      <div className="mb-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-gray-900">Préférences notifications</h1>
          <p className="text-sm text-gray-600">Configure tes alertes in-app, push et email.</p>
        </div>
      </div>


      {loading ? <p className="text-sm text-gray-600">Chargement...</p> : null}
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      {success ? <p className="mb-4 text-sm text-green-600">{success}</p> : null}

      {preferences ? (
        <div className="space-y-4 rounded border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Types de notifications
          </h2>

          {[
            ['squadDetected', 'Soirée de clan détectée'],
            ['topPerformance', 'Top performance'],
            ['challengeStarted', 'Challenge démarré'],
            ['reportReady', 'Rapport prêt'],
            ['inviteReminder', 'Rappels invite amis'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-4 text-sm text-gray-700">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={Boolean(preferences[key as keyof NotificationPreferenceItem])}
                onChange={() => togglePreference(key as keyof NotificationPreferenceItem)}
                className="h-4 w-4"
              />
            </label>
          ))}

          <h2 className="pt-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Canaux
          </h2>

          {[
            ['inAppNotifications', 'In-app'],
            ['pushNotifications', 'Push'],
            ['emailNotifications', 'Email'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center justify-between gap-4 text-sm text-gray-700">
              <span>{label}</span>
              <input
                type="checkbox"
                checked={Boolean(preferences[key as keyof NotificationPreferenceItem])}
                onChange={() => togglePreference(key as keyof NotificationPreferenceItem)}
                className="h-4 w-4"
              />
            </label>
          ))}

          <button
            type="button"
            onClick={() => void savePreferences()}
            disabled={saving}
            className="mt-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? 'Sauvegarde...' : 'Enregistrer'}
          </button>
        </div>
      ) : null}
    </main>
  )
}
