'use client'

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { useAuthSession } from '@/hooks/useAuthSession'

type WelcomeSettings = {
  badge: string
  title: string
  message: string
  imageUrl: string | null
}

const DEFAULT_SETTINGS: WelcomeSettings = {
  badge: 'Bienvenue au clan',
  title: 'Connexion escouade',
  message:
    'Connectez-vous pour retrouver vos statistiques, votre progression et les outils de coordination du clan.',
  imageUrl: null,
}

export default function LoginWelcomeSettingsPage() {
  const router = useRouter()
  const { loading, authenticated, permissions } = useAuthSession()

  const [settings, setSettings] = useState<WelcomeSettings>(DEFAULT_SETTINGS)
  const [clanLabel, setClanLabel] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const canManageSettings = permissions.includes('*') || permissions.includes('manage_settings')

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/login?redirect=/settings/login-welcome')
    }
  }, [authenticated, loading, router])

  useEffect(() => {
    if (loading) {
      return
    }

    if (!authenticated || !canManageSettings) {
      return
    }

    let cancelled = false

    async function loadData() {
      try {
        const response = await fetch('/api/settings/login-welcome', { cache: 'no-store' })
        const payload = (await response.json().catch(() => null)) as
          | {
              settings?: WelcomeSettings
              clanLabel?: string | null
            }
          | null

        if (!response.ok) {
          throw new Error('Impossible de charger la configuration d\'accueil')
        }

        if (!cancelled) {
          setSettings(payload?.settings ?? DEFAULT_SETTINGS)
          setClanLabel(payload?.clanLabel ?? null)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Impossible de charger la configuration d\'accueil'
          )
        }
      } finally {
        if (!cancelled) {
          setDataLoaded(true)
        }
      }
    }

    void loadData()

    return () => {
      cancelled = true
    }
  }, [authenticated, canManageSettings, loading])

  const loadingData = authenticated && canManageSettings && !dataLoaded

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setSaving(true)
      setError('')
      setSuccess('')

      const response = await fetch('/api/settings/login-welcome', {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(settings),
      })

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; settings?: WelcomeSettings }
        | null

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Échec de la sauvegarde')
      }

      setSettings(payload?.settings ?? settings)
      setSuccess('Message d\'accueil enregistré.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Échec de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  if (loading || loadingData) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center px-4 py-12">
        <p className="text-sm text-slate-600">Chargement de la configuration...</p>
      </main>
    )
  }

  if (!authenticated) {
    return null
  }

  if (!canManageSettings) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-xl font-bold text-amber-900">Accès restreint</h1>
          <p className="mt-2 text-sm text-amber-800">
            Cette page est réservée au Owner ou aux admins disposant de la permission
            manage_settings.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900"
          >
            Retour à l&apos;accueil
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
          Paramétrage accueil
        </p>
        <h1 className="mt-2 text-2xl font-black text-slate-900">Message de bienvenue login</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Personnalisez le texte affiché sur la page de connexion, sans image de clan. Ce contenu
          aide à poser l&apos;identité du clan dès l&apos;arrivée.
        </p>

        {clanLabel ? (
          <p className="mt-3 inline-flex rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
            Clan détecté: {clanLabel}
          </p>
        ) : null}

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <form className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5" onSubmit={handleSave}>
            <label className="block text-sm font-medium text-slate-700">
              Badge court
              <input
                type="text"
                value={settings.badge}
                maxLength={60}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    badge: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                placeholder="Bienvenue au clan"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Titre principal
              <input
                type="text"
                value={settings.title}
                maxLength={100}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                placeholder="Connexion escouade"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Message
              <textarea
                value={settings.message}
                maxLength={260}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    message: event.target.value,
                  }))
                }
                className="mt-1 min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                placeholder="Décrivez l'ambiance ou les attentes du clan"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Image du clan (URL, optionnel)
              <input
                type="url"
                value={settings.imageUrl ?? ''}
                maxLength={500}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    imageUrl: event.target.value.trim() ? event.target.value : null,
                  }))
                }
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                placeholder="https://..."
              />
            </label>

            {error ? <p className="text-sm text-rose-700">{error}</p> : null}
            {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </form>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 text-white">
            <div className="relative h-full p-6">
              {settings.imageUrl ? (
                <img
                  src={settings.imageUrl}
                  alt="Aperçu clan"
                  className="absolute inset-0 h-full w-full object-cover opacity-35"
                />
              ) : null}
              <div className="absolute inset-0 bg-slate-900/70" />
              <div className="pointer-events-none absolute -left-12 top-10 h-44 w-44 rounded-full bg-emerald-400/30 blur-2xl" />
              <div className="pointer-events-none absolute -right-16 bottom-4 h-56 w-56 rounded-full bg-sky-500/25 blur-2xl" />

              <p className="relative z-10 inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]">
                {settings.badge || 'Bienvenue au clan'}
              </p>
              <h2 className="relative z-10 mt-4 text-3xl font-black leading-tight">
                {settings.title || 'Connexion escouade'}
              </h2>
              <p className="relative z-10 mt-4 max-w-md text-sm text-slate-200">
                {settings.message ||
                  'Connectez-vous pour retrouver vos statistiques, votre progression et les outils de coordination du clan.'}
              </p>
            </div>
          </section>
        </div>
      </section>
    </main>
  )
}
