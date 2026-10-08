'use client'

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Lock, Monitor, Save, Upload } from 'lucide-react'

import { useAuthSession } from '@/hooks/useAuthSession'
import ClanSettingsBanner from '@/components/clan-settings/ClanSettingsBanner'
import { ButtonSpinner, Callout, ErrorState, ListSkeleton } from '@/components/ui/CharteKit'

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

  const { loading, authenticated, permissions, isSuperUser } = useAuthSession()

  const [settings, setSettings] = useState<WelcomeSettings>(DEFAULT_SETTINGS)
  const [clanLabel, setClanLabel] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const canManageSettings = isSuperUser || permissions.includes('*') || permissions.includes('manage_settings')

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

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    if (!clanId) return

    // Pré-vérification de la taille côté client (5 Mo max)
    if (file.size > 5 * 1024 * 1024) {
      const sizeMo = (file.size / (1024 * 1024)).toFixed(1)
      setError(`Le fichier est trop volumineux (${sizeMo} Mo). La taille maximale autorisée est de 5 Mo.`)
      event.target.value = ''
      return
    }

    try {
      setUploading(true)
      setError('')
      setSuccess('')

      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`/api/clans/${clanId}/settings/login-welcome/upload`, {
        method: 'POST',
        body: formData,
      })

      const payload = await response.json().catch(() => null)

      if (!response.ok) {
        if (response.status === 413) {
          throw new Error("Le fichier dépasse la taille maximale acceptée par le serveur web (Erreur 413). Veuillez réduire la taille de l'image (max 5 Mo).")
        }
        throw new Error(payload?.error ?? "Échec de l'upload de l'image")
      }

      if (payload?.imageUrl) {
        setSettings((current) => ({ ...current, imageUrl: payload.imageUrl }))
        setSuccess("Image téléchargée avec succès ! N'oubliez pas de cliquer sur « Enregistrer » ci-dessous pour valider la modification.")
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Échec de l'upload")
    } finally {
      setUploading(false)
      // Reset input value to allow selecting the same file again if needed
      event.target.value = ''
    }
  }

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
      <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
        <ListSkeleton rows={3} />
      </div>
    )
  }

  if (!authenticated) {
    return null
  }

  if (!clanId) {
    return (
      <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
        <section className="app-panel">
          <ErrorState message="Identifiant de clan invalide." />
        </section>
      </div>
    )
  }

  if (!canManageSettings) {
    return (
      <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
        <Callout tone="warn" icon={Lock} title="Accès réservé">
          Cette page est réservée à l’Owner du clan et au SuperUser.{' '}
          <Link href="/" className="app-link font-semibold">
            Retour à l’accueil
          </Link>
        </Callout>
      </div>
    )
  }

  return (
    // `.charte` : page écrite selon la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
      <ClanSettingsBanner
        clanId={clanId}
        title="Accueil login"
        subtitle={
          clanLabel
            ? `Le message affiché sur la page de connexion pour ${clanLabel}.`
            : 'Le message affiché sur la page de connexion de ce clan.'
        }
        icon={Monitor}
        image="/login-welcome.jpg"
        currentHref={`/clans/${clanId}/settings/login-welcome`}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <form className="app-panel flex flex-col gap-4 p-4 sm:p-5" onSubmit={handleSave} aria-labelledby="welcome-form-title">
          <div className="flex flex-col gap-0.5">
            <h2 id="welcome-form-title" className="t-section-title m-0">
              Message de bienvenue
            </h2>
            <p className="t-meta m-0">L’aperçu à côté se met à jour pendant la saisie.</p>
          </div>

          <label className="flex flex-col gap-1">
            <span className="t-label">Badge court</span>
            <input
              type="text"
              value={settings.badge}
              maxLength={60}
              onChange={(event) => setSettings((current) => ({ ...current, badge: event.target.value }))}
              className="app-input"
              placeholder="Bienvenue au clan"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="t-label">Titre principal</span>
            <input
              type="text"
              value={settings.title}
              maxLength={100}
              onChange={(event) => setSettings((current) => ({ ...current, title: event.target.value }))}
              className="app-input"
              placeholder="Connexion escouade"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex items-center justify-between gap-2">
              <span className="t-label">Message</span>
              <span className="t-meta t-num">{settings.message.length}/260</span>
            </span>
            <textarea
              value={settings.message}
              maxLength={260}
              onChange={(event) => setSettings((current) => ({ ...current, message: event.target.value }))}
              className="app-input min-h-28"
              placeholder="L’ambiance du clan, ce qu’il attend de ses joueurs…"
            />
          </label>

          <div className="flex flex-col gap-1">
            <label htmlFor="imageUrl" className="flex items-center justify-between gap-2">
              <span className="t-label">Image du clan</span>
              <span className="t-meta">Facultatif</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
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
                className="app-input min-w-0 flex-1 basis-[200px]"
                placeholder="/clans/d32.jpg ou https://…"
              />
              <label className={`app-btn app-btn--md app-btn--secondary cursor-pointer gap-1.5 whitespace-nowrap ${uploading ? 'opacity-45' : ''}`}>
                {uploading ? <ButtonSpinner /> : <Upload className="h-4 w-4" aria-hidden="true" />}
                {uploading ? 'Téléversement…' : 'Téléverser'}
                <input
                  type="file"
                  className="hidden"
                  accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp,image/*"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>
            </div>
            <span className="t-meta">JPG, PNG ou WEBP, 5 Mo au plus. Format conseillé : 1024 × 434 px.</span>
          </div>

          {error ? (
            <p className="t-body t-neg m-0" role="alert">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="t-body t-pos m-0" role="status">
              {success}
            </p>
          ) : null}

          <div>
            <button type="submit" disabled={saving} className="app-btn app-btn--md app-btn--primary gap-2">
              {saving ? <ButtonSpinner /> : <Save className="h-4 w-4" aria-hidden="true" />}
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>

        <section className="flex flex-col gap-2" aria-labelledby="welcome-preview-title">
          <h2 id="welcome-preview-title" className="t-label m-0">
            Aperçu de la page de connexion
          </h2>
          <div className="app-on-photo bg-hero-fallback relative min-h-[16rem] flex-1 overflow-hidden rounded-[14px] text-white">
            {settings.imageUrl ? (
              <img src={settings.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />
            ) : null}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/50 to-black/30" aria-hidden="true" />
            <div className="relative z-10 flex h-full flex-col justify-end gap-3 p-5 sm:p-6">
              <span className="inline-flex self-start rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em]">
                {settings.badge || 'Bienvenue au clan'}
              </span>
              <p className="t-banner-title m-0 text-white">{settings.title || 'Connexion escouade'}</p>
              <p className="m-0 max-w-md text-[13px] text-white/80">
                {settings.message ||
                  'Connectez-vous pour retrouver vos statistiques, votre progression et les outils de coordination du clan.'}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
