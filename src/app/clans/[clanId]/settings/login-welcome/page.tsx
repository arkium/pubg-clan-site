'use client'

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ImageIcon, Lock, Monitor, RotateCcw, Save, Upload } from 'lucide-react'

import { useAuthSession } from '@/hooks/useAuthSession'
import { useImageFallback } from '@/hooks/useImageFallback'
import { DEFAULT_CLAN_IMAGE } from '@/lib/clan-image'
import { AuthVisual } from '@/components/auth/AuthLayout'
import ClanSettingsBanner from '@/components/clan-settings/ClanSettingsBanner'
import { ClanShowcaseHero } from '@/components/clan-overview/ClanOverviewSections'
import { ActiveClanCard, type DirectoryClan } from '@/components/clans/ClanDirectorySections'
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
    'Connecte-toi pour retrouver tes statistiques, ta progression et les outils de coordination du clan.',
  imageUrl: null,
}

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function extractFileName(url: string): string {
  const clean = url.split('?')[0]?.split('#')[0] ?? url
  const segments = clean.split('/').filter(Boolean)
  return segments[segments.length - 1] || url
}

type ClanIdentity = { name: string; tag: string }

/**
 * Carte de l'annuaire en aperçu : vrais nom, tag et image du clan, chiffres d'exemple (la carte n'affiche son palmarès
 * qu'avec des parties). Même composant que l'annuaire (`ActiveClanCard`), pour que l'aperçu ne s'en écarte jamais.
 */
function previewDirectoryClan(clanId: number, clan: ClanIdentity | null, imageUrl: string | null, lastMatchAt: string): DirectoryClan {
  return {
    id: clanId,
    name: clan?.name ?? 'Nom du clan',
    tag: clan?.tag ?? 'TAG',
    imageUrl,
    isSystem: false,
    membersCount: 12,
    games7: 18,
    wins7: 3,
    playedTonight: 4,
    lastMatchAt,
    leagueRank: 2,
    style: { id: 'ghost', score: 72, aggression: 48, support: 55, zoneDiscipline: 72, members: 8, matches: 140 },
  }
}

export default function ClanLoginWelcomeSettingsPage() {
  const router = useRouter()
  const params = useParams()
  const clanId = parseClanId(params.clanId)

  const { loading, authenticated, permissions, isSuperUser } = useAuthSession()

  const [settings, setSettings] = useState<WelcomeSettings>(DEFAULT_SETTINGS)
  const [clanLabel, setClanLabel] = useState<string | null>(null)
  const [clan, setClan] = useState<ClanIdentity | null>(null)
  // Dernière partie d'exemple de l'aperçu de l'annuaire : il y a deux heures, figée au montage.
  const [previewLastMatchAt] = useState(() => new Date(Date.now() - 2 * 3_600_000).toISOString())
  const [uploadedOriginalName, setUploadedOriginalName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const previewImage = useImageFallback(settings.imageUrl, DEFAULT_CLAN_IMAGE)
  const appliedUrl = settings.imageUrl?.trim() || DEFAULT_CLAN_IMAGE
  const appliedFileName = extractFileName(appliedUrl)
  const isCustomImage = Boolean(settings.imageUrl?.trim())

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
          | { settings?: WelcomeSettings; clanLabel?: string | null; clan?: ClanIdentity | null }
          | null

        if (!response.ok) {
          throw new Error("Impossible de charger la configuration d'accueil")
        }

        if (!cancelled) {
          setSettings(payload?.settings ?? DEFAULT_SETTINGS)
          setClanLabel(payload?.clanLabel ?? null)
          setClan(payload?.clan ?? null)
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
          throw new Error("Le fichier dépasse la taille maximale acceptée par le serveur web (Erreur 413). Réduis la taille de l'image (max 5 Mo).")
        }
        throw new Error(payload?.error ?? "Échec de l'upload de l'image")
      }

      if (payload?.imageUrl) {
        setSettings((current) => ({ ...current, imageUrl: payload.imageUrl }))
        setUploadedOriginalName(file.name)
        setSuccess("Image téléchargée avec succès ! N'oublie pas de cliquer sur « Enregistrer » ci-dessous pour valider la modification.")
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

          <div className="flex flex-col gap-1.5">
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
                onChange={(event) => {
                  setUploadedOriginalName(null)
                  setSettings((current) => ({
                    ...current,
                    imageUrl: event.target.value.trim() ? event.target.value : null,
                  }))
                }}
                className="app-input min-w-0 flex-1 basis-[200px]"
                placeholder={`Par défaut : ${DEFAULT_CLAN_IMAGE}`}
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

            <div className="app-panel-muted flex flex-wrap items-center gap-2.5 px-3 py-2" data-testid="applied-clan-image">
              <img
                src={previewImage.src}
                onError={previewImage.onError}
                alt=""
                className="h-9 w-14 shrink-0 rounded-md border border-gray-200 object-cover"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <ImageIcon className="h-3.5 w-3.5 shrink-0 text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
                  <span className="text-gray-500">Fichier appliqué :</span>
                  <code className="truncate font-mono font-bold text-gray-900" title={appliedUrl}>
                    {uploadedOriginalName ? `${uploadedOriginalName} (${appliedFileName})` : appliedFileName}
                  </code>
                </div>
                <span className="truncate text-[11px] text-gray-500">
                  {!isCustomImage
                    ? `Image par défaut du site (${DEFAULT_CLAN_IMAGE})`
                    : previewImage.broken
                      ? `Fichier introuvable à l’adresse ${settings.imageUrl} — aperçu replié sur ${extractFileName(DEFAULT_CLAN_IMAGE)}`
                      : `Chemin actif : ${settings.imageUrl}`}
                </span>
              </div>
              {isCustomImage ? (
                <button
                  type="button"
                  onClick={() => {
                    setUploadedOriginalName(null)
                    setSettings((current) => ({ ...current, imageUrl: null }))
                  }}
                  className="app-btn app-btn--sm app-btn--ghost gap-1 text-xs"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Par défaut
                </button>
              ) : null}
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
          {/* Même visuel que la page de connexion (`AuthVisual`, voile sombre compris) : l'aperçu ne peut pas s'en écarter. */}
          <div className="flex min-h-[16rem] flex-1 flex-col overflow-hidden rounded-[14px] [&>div]:flex-1" data-testid="login-preview">
            <AuthVisual
              image={previewImage.src}
              imagePosition="center"
              onImageError={previewImage.onError}
              header={
                <img
                  src={previewImage.src}
                  onError={previewImage.onError}
                  alt=""
                  className="h-14 w-14 rounded-[10px] border border-white/30 object-cover lg:hidden"
                />
              }
              kicker={settings.badge || DEFAULT_SETTINGS.badge}
              title={settings.title || DEFAULT_SETTINGS.title}
              titleAs="p"
              text={settings.message || DEFAULT_SETTINGS.message}
              pill={clanLabel}
            />
          </div>
        </section>
      </div>

      <section className="flex flex-col gap-2" aria-labelledby="badge-preview-title" data-testid="clan-badge-preview">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="badge-preview-title" className="t-label m-0">
            Aperçu du badge du clan (Annuaire des clans)
          </h2>
          <Link href="/clans" className="app-link text-xs font-semibold">
            Voir l’annuaire des clans →
          </Link>
        </div>
        <div className="grid gap-2.5 md:grid-cols-2">
          <ActiveClanCard clan={previewDirectoryClan(clanId, clan, settings.imageUrl, previewLastMatchAt)} active />
        </div>
        <p className="t-meta m-0">Vignette carrée de 64 × 64 px, recadrée au centre de l’image. Chiffres d’exemple : seule l’image et le nom sont ceux du clan.</p>
      </section>

      <section className="flex flex-col gap-2" aria-labelledby="header-preview-title" data-testid="clan-header-preview">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="header-preview-title" className="t-label m-0">
            Aperçu de l’en-tête du clan (Vue d’ensemble)
          </h2>
          <Link href={`/clans/${clanId}/overview`} className="app-link text-xs font-semibold">
            Voir la vue d’ensemble du clan →
          </Link>
        </div>
        {/* Même bandeau que la vue d'ensemble (`ClanShowcaseHero`), sans palmarès ni effectifs (chiffres du clan non lus ici). */}
        <ClanShowcaseHero
          image={settings.imageUrl}
          tag={clan?.tag ?? 'TAG'}
          name={clan?.name ?? 'Nom du clan'}
          titleAs="p"
          syncedLabel={null}
          trackedMembers={null}
          showcase={null}
        />
        <p className="t-meta m-0">Cadrage : toute la largeur de l’image, centrée à 35 % de sa hauteur.</p>
      </section>
    </div>
  )
}
