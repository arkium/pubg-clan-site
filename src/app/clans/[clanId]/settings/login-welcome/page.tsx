'use client'

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Monitor } from 'lucide-react'

import { useAuthSession } from '@/hooks/useAuthSession'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { NavigationTrail } from '@/components/ui/NavigationTrail'

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

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export default function ClanLoginWelcomeSettingsPage() {
  const router = useRouter()
  const params = useParams()
  const clanId = parseClanId(params.clanId)

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
      router.replace(`/login?redirect=/clans/${clanId ?? ''}/settings/login-welcome`)
    }
  }, [authenticated, loading, router, clanId])

  useEffect(() => {
    if (loading || !authenticated || !canManageSettings || !clanId) {
      return
    }

    let cancelled = false

    async function loadData() {
      try {
        const response = await fetch(`/api/clans/${clanId}/settings/login-welcome`, {
          cache: 'no-store',
        })
        const payload = (await response.json().catch(() => null)) as
          | { settings?: WelcomeSettings; clanLabel?: string | null }
          | null

        if (!response.ok) {
          throw new Error("Impossible de charger la configuration d'accueil")
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
              : "Impossible de charger la configuration d'accueil"
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
  }, [authenticated, canManageSettings, loading, clanId])

  const loadingData = authenticated && canManageSettings && !dataLoaded

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setSaving(true)
      setError('')
      setSuccess('')

      const response = await fetch(`/api/clans/${clanId}/settings/login-welcome`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(settings),
      })

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; settings?: WelcomeSettings }
        | null

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Échec de la sauvegarde')
      }

      setSettings(payload?.settings ?? settings)
      setSuccess("Message d'accueil enregistré.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Échec de la sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  if (loading || loadingData) {
    return (
      <main className="app-container app-main flex flex-1 items-center justify-center">
      <NavigationTrail
        currentLabel="Accueil login"
        currentHref={`/clans/${clanId}/settings/login-welcome`}
        fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
      />
        <p className="text-sm text-gray-600">Chargement de la configuration...</p>
      </main>
    )
  }

  if (!authenticated) {
    return null
  }

  if (!clanId) {
    return (
      <main className="app-container app-main flex-1">
        <section className="app-panel p-6">
          <p className="text-sm text-rose-700">Identifiant de clan invalide.</p>
        </section>
      </main>
    )
  }

  if (!canManageSettings) {
    return (
      <main className="app-container app-main flex-1">
        <section className="app-panel p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-600">
            Permissions
          </p>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">Accès restreint</h1>
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-800">
              Cette page est réservée au Owner ou aux admins disposant de la permission
              manage_settings.
            </p>
          </div>
          <Link href="/" className="mt-5 app-btn app-btn--md app-btn--secondary">
            Retour à l&apos;accueil
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="app-container app-main flex-1">
      <NavigationTrail
        currentLabel="Accueil login"
        currentHref={`/clans/${clanId}/settings/login-welcome`}
        fallbackParent={{ href: `/clans/${clanId}/settings`, label: 'Paramètres', altHref: '/clans' }}
      />
      <header
        className="relative mb-6 min-h-[10rem] overflow-hidden rounded-2xl bg-cover bg-no-repeat sm:min-h-[13rem]"
        style={{ backgroundImage: `url('/login-welcome.jpg')`, backgroundPosition: 'center 35%' }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 z-10 px-3 py-2.5 sm:px-5 sm:py-4">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Monitor className="h-4 w-4 text-emerald-400 sm:h-6 sm:w-6" aria-hidden="true" />
            <h1 className="text-sm font-bold tracking-tight text-white drop-shadow-md sm:text-xl md:text-2xl">
              Message de bienvenue
            </h1>
          </div>
          <p className="mt-0.5 text-[11px] font-medium text-gray-200 drop-shadow-md sm:mt-1 sm:text-sm">
            {clanLabel
              ? `Personnalisez le texte affiché sur la page de connexion pour ${clanLabel}.`
              : "Personnalisez le texte affiché sur la page de connexion de ce clan."}
          </p>
        </div>
      </header>

      <section className="app-panel p-5 sm:p-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <form className="app-panel-muted space-y-4 p-4 sm:p-5" onSubmit={handleSave}>
            <label className="block text-sm font-medium text-gray-700">
              Badge court
              <input
                type="text"
                value={settings.badge}
                maxLength={60}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, badge: event.target.value }))
                }
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="Bienvenue au clan"
              />
            </label>

            <label className="block text-sm font-medium text-gray-700">
              Titre principal
              <input
                type="text"
                value={settings.title}
                maxLength={100}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, title: event.target.value }))
                }
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="Connexion escouade"
              />
            </label>

            <label className="block text-sm font-medium text-gray-700">
              Message
              <textarea
                value={settings.message}
                maxLength={260}
                onChange={(event) =>
                  setSettings((current) => ({ ...current, message: event.target.value }))
                }
                className="mt-1 min-h-28 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="Décrivez l'ambiance ou les attentes du clan"
              />
            </label>

            <div className="space-y-1 text-sm font-medium text-gray-700">
              <label htmlFor="imageUrl">Image du clan (URL ou chemin local, optionnel)</label>
              <input
                id="imageUrl"
                type="text"
                value={settings.imageUrl ?? ''}
                maxLength={500}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    imageUrl: event.target.value.trim() ? event.target.value : null,
                  }))
                }
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="Ex: /clans/d32.jpg ou https://..."
              />
              <p className="text-xs font-normal text-gray-500">
                Format recommandé : 1024x434 px (JPG, PNG ou WEBP).
              </p>
            </div>

            {error ? <p className="text-sm text-rose-700">{error}</p> : null}
            {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

            <button
              type="submit"
              disabled={saving}
              className="app-btn app-btn--md app-btn--primary"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </form>

          <section className="app-panel-muted overflow-hidden">
            <div className="relative h-full p-6">
              {settings.imageUrl ? (
                <img
                  src={settings.imageUrl}
                  alt="Aperçu clan"
                  className="absolute inset-0 h-full w-full object-cover opacity-35"
                />
              ) : null}
              <div className="absolute inset-0 bg-slate-900/70" />

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
