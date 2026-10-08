'use client'

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { Suspense, type FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight, KeyRound, ShieldCheck, Sparkles, Trophy, UserCheck, Users } from 'lucide-react'

import pubgLogo from '@/assets/pubg-logo-official.webp'
import { AuthAlert, AuthCard, AuthGuide, AuthHighlights, AuthPage, AuthVisual, FieldLabel, type AuthHighlight } from '@/components/auth/AuthLayout'
import { ButtonSpinner, Callout, ListSkeleton } from '@/components/ui/CharteKit'
import { useImageFallback } from '@/hooks/useImageFallback'

/**
 * Activation d'un compte invité (jeton reçu par e-mail ou par Discord) — page plein écran, sans le shell. Selon la
 * charte UI (docs/ui/index.html) et la mise en page des pages d'accès (`AuthLayout`).
 */

type WelcomeSettings = {
  badge: string
  title: string
  message: string
  imageUrl: string | null
}

const DEFAULT_WELCOME: WelcomeSettings = {
  badge: 'Portail Membres & Clans',
  title: 'Activation du compte',
  message: 'Finalisez votre activation pour accéder aux statistiques, rapports et outils de coordination de votre clan.',
  imageUrl: '/squad.jpg',
}

const HIGHLIGHTS: AuthHighlight[] = [
  { icon: Sparkles, tone: 'pos', title: 'Rattachement immédiat', text: 'profil joueur et rôles dans le clan configurés dès la validation.' },
  { icon: Users, tone: 'sky', title: 'Statistiques et télémétrie', text: 'parties, frags et performances synchronisés automatiquement.' },
  { icon: Trophy, tone: 'warn', title: 'Vie du clan', text: 'défis, débriefings tactiques et classements.' },
]

const GUIDE = [
  { tone: 'pos' as const, title: 'Jeton d’invitation', body: 'jeton unique émis à l’invitation par un administrateur du clan.' },
  { tone: 'sky' as const, title: 'Mot de passe', body: '8 caractères au moins, pour les prochaines connexions.' },
  {
    tone: 'warn' as const,
    title: 'Déjà activé',
    body: (
      <>
        il suffit de{' '}
        <Link href="/login" className="app-link font-semibold">
          se connecter
        </Link>
        .
      </>
    ),
  },
]

function ActivatePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tokenFromUrl = useMemo(() => searchParams.get('token') ?? '', [searchParams])

  const [token, setToken] = useState(tokenFromUrl)
  const [loginEmail, setLoginEmail] = useState('')
  const [requiresLoginEmail, setRequiresLoginEmail] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [welcome, setWelcome] = useState<WelcomeSettings>(DEFAULT_WELCOME)
  const [clanLabel, setClanLabel] = useState<string | null>(null)
  // Image absente ou qui ne se charge plus (fichier téléversé disparu) : visuel par défaut, jamais un cadre vide.
  const heroImage = useImageFallback(welcome.imageUrl, '/squad.jpg')
  const heroImageUrl = heroImage.src
  const isClanWelcome = Boolean(welcome.badge && welcome.badge !== DEFAULT_WELCOME.badge)

  useEffect(() => {
    let cancelled = false

    async function loadWelcome() {
      try {
        const response = await fetch('/api/settings/login-welcome', { cache: 'no-store' })
        const payload = (await response.json().catch(() => null)) as { settings?: WelcomeSettings; clanLabel?: string | null } | null

        if (!cancelled && response.ok) {
          setWelcome(payload?.settings ?? DEFAULT_WELCOME)
          setClanLabel(payload?.clanLabel ?? null)
        }
      } catch {
        // Accueil par défaut, sans bruit.
      }
    }

    void loadWelcome()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const trimmedToken = token.trim()
    if (!trimmedToken) {
      return
    }

    let cancelled = false

    async function loadActivationContext() {
      try {
        const response = await fetch(`/api/auth/activate/context?token=${encodeURIComponent(trimmedToken)}`, {
          cache: 'no-store',
        })

        const payload = (await response.json().catch(() => null)) as { requiresLoginEmail?: boolean } | null

        if (cancelled) {
          return
        }

        if (!response.ok) {
          setRequiresLoginEmail(false)
          return
        }

        setRequiresLoginEmail(Boolean(payload?.requiresLoginEmail))
      } catch {
        if (!cancelled) {
          setRequiresLoginEmail(false)
        }
      }
    }

    void loadActivationContext()

    return () => {
      cancelled = true
    }
  }, [token])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (requiresLoginEmail && !loginEmail.trim()) {
      setError('Saisissez votre e-mail de connexion')
      return
    }

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas')
      return
    }

    try {
      setSubmitting(true)
      setError('')

      const response = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          token: token.trim(),
          loginEmail: requiresLoginEmail ? loginEmail.trim() || undefined : undefined,
          password,
          displayName: displayName.trim() || undefined,
        }),
      })

      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(payload.error ?? 'Échec de l’activation du compte')
      }

      router.replace('/')
      router.refresh()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Échec de l’activation du compte')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthPage>
      <div className="relative z-10 mb-4 flex w-full max-w-5xl flex-wrap items-center justify-between gap-2">
        <Link href="/clans" className="app-btn app-btn--sm app-btn--secondary gap-1.5">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Retour à l’accueil du site
        </Link>
        <Link href="/login" className="app-link inline-flex items-center gap-1 text-xs font-semibold">
          Espace connexion
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <AuthCard
        visual={
          <AuthVisual
            image={heroImageUrl}
            imagePosition={heroImageUrl === '/squad.jpg' ? 'center 35%' : 'center'}
            onImageError={heroImage.onError}
            header={
              <span className="flex items-center justify-between gap-3">
                <img src={pubgLogo.src} alt="PUBG Battlegrounds" className="h-10 w-auto object-contain" />
                {isClanWelcome ? (
                  <img
                    src={heroImageUrl}
                    onError={heroImage.onError}
                    alt="Logo du clan"
                    className="h-14 w-14 rounded-[10px] border border-white/30 object-cover lg:hidden"
                  />
                ) : null}
              </span>
            }
            kicker={welcome.badge}
            title={welcome.title}
            text={welcome.message}
            pill={clanLabel}
          >
            <AuthHighlights items={HIGHLIGHTS} />
          </AuthVisual>
        }
      >
        <div className="flex flex-col gap-1">
          <h2 className="t-section-title m-0 flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
            Activation du compte
          </h2>
          <p className="t-meta m-0">Choisir son mot de passe pour sécuriser son accès et finaliser son arrivée dans le clan.</p>
        </div>

        <AuthGuide icon={ShieldCheck} title="Activer son compte" items={GUIDE} />

        {requiresLoginEmail ? (
          <Callout tone="warn" icon={KeyRound} title="Invitation Discord détectée">
            Saisir l’adresse e-mail de connexion pour finaliser l’association du profil.
          </Callout>
        ) : null}

        <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
          {error ? (
            <AuthAlert tone="neg" title={error}>
              Vérifier la validité du jeton d’invitation, ou contacter un administrateur du clan.
            </AuthAlert>
          ) : null}

          <label className="flex flex-col gap-1">
            <FieldLabel required>Jeton d’activation</FieldLabel>
            <input
              type="text"
              required
              value={token}
              onChange={(event) => {
                const nextToken = event.target.value
                setToken(nextToken)
                if (!nextToken.trim()) {
                  setRequiresLoginEmail(false)
                }
              }}
              placeholder="Coller le jeton ici"
              className="app-input font-mono"
              autoComplete="off"
            />
          </label>

          {requiresLoginEmail ? (
            <label className="flex flex-col gap-1">
              <FieldLabel required>E-mail de connexion</FieldLabel>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                placeholder="joueur@exemple.com"
                className="app-input"
                autoComplete="email"
              />
              <span className="t-meta">L’adresse à utiliser pour les prochaines connexions.</span>
            </label>
          ) : null}

          <label className="flex flex-col gap-1">
            <FieldLabel>Nom affiché (facultatif)</FieldLabel>
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Balthazar"
              className="app-input"
              autoComplete="nickname"
            />
          </label>

          <label className="flex flex-col gap-1">
            <FieldLabel required>Nouveau mot de passe</FieldLabel>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8 caractères au moins"
              className="app-input"
              autoComplete="new-password"
            />
          </label>

          <label className="flex flex-col gap-1">
            <FieldLabel required>Confirmer le mot de passe</FieldLabel>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="Répéter le mot de passe"
              className="app-input"
              autoComplete="new-password"
            />
          </label>

          <button type="submit" disabled={submitting} className="app-btn app-btn--md app-btn--primary mt-1 w-full gap-2">
            {submitting ? <ButtonSpinner /> : <UserCheck className="h-4 w-4" aria-hidden="true" />}
            {submitting ? 'Activation en cours…' : 'Activer mon compte'}
          </button>
        </form>

        <div className="flex flex-col gap-3 border-t border-gray-200 pt-5">
          <Link href="/clans" className="app-btn app-btn--md app-btn--secondary w-full gap-2">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Retour à la page principale
          </Link>
          <p className="t-meta m-0 text-center">
            Compte déjà activé ?{' '}
            <Link href="/login" className="app-link font-semibold">
              Se connecter
            </Link>
          </p>
        </div>
      </AuthCard>
    </AuthPage>
  )
}

export default function ActivatePage() {
  return (
    <Suspense
      fallback={
        <main className="charte game-ui mx-auto flex min-h-screen w-full max-w-md flex-1 items-center px-4 py-10">
          <ListSkeleton rows={3} />
        </main>
      }
    >
      <ActivatePageContent />
    </Suspense>
  )
}
