'use client'

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { Suspense, type FormEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, ArrowRight, Crosshair, LogIn, MapPin, ShieldCheck, Users } from 'lucide-react'

import pubgLogo from '@/assets/pubg-logo-official.webp'
import { AuthAlert, AuthCard, AuthGuide, AuthHighlights, AuthPage, AuthVisual, FieldLabel, type AuthHighlight } from '@/components/auth/AuthLayout'
import FirstRunSetup from '@/components/FirstRunSetup'
import PendingActivation from '@/components/PendingActivation'
import { ButtonSpinner, ListSkeleton } from '@/components/ui/CharteKit'
import { useImageFallback } from '@/hooks/useImageFallback'

/**
 * Connexion — page plein écran, sans le shell. Selon la charte UI (docs/ui/index.html, « Modales » et « Contrôles ») et
 * la mise en page des pages d'accès (`AuthLayout`) : visuel sur photo à gauche — l'accueil configuré par le clan
 * (paramètres du clan › Accueil login) quand la connexion vient d'une page de clan —, formulaire à droite.
 * Les textes ne promettent que ce que le compte apporte vraiment (2026-10-09) : statistiques, classements et tournois sont
 * ouverts à tous sans compte ; le compte sert aux entraînements enregistrés, à la carte des ressources et, pour l'Owner, à
 * la gestion de son clan. Il se crée sur invitation, ou à l'acceptation d'une demande envoyée de /join.
 */

type WelcomeSettings = {
  badge: string
  title: string
  message: string
  imageUrl: string | null
}

const DEFAULT_GLOBAL_WELCOME: WelcomeSettings = {
  badge: 'Portail PUBG',
  title: 'Votre espace membre',
  message:
    'Statistiques, classements et tournois sont ouverts à tous, sans compte. Le compte sert aux membres des clans suivis : enregistrer ses entraînements, participer à la carte des ressources et, pour l’Owner, gérer son clan.',
  imageUrl: '/squad.jpg',
}

const HIGHLIGHTS: AuthHighlight[] = [
  { icon: Crosshair, tone: 'pos', title: 'Entraînements enregistrés', text: 'séries au mortier et à la lecture de zone, classements du clan.' },
  { icon: MapPin, tone: 'sky', title: 'Communauté', text: 'carte des ressources, mouvements entre clans, adversaires rencontrés par votre clan.' },
  { icon: Users, tone: 'warn', title: 'Gestion du clan (Owner)', text: 'membres, invitations, demandes d’accès, notifications Discord, tournois.' },
]

const GUIDE = [
  { tone: 'pos' as const, title: 'Membre actif', body: 'saisir ses identifiants pour retrouver son espace et son clan.' },
  {
    tone: 'sky' as const,
    title: 'Invitation reçue',
    body: (
      <>
        un clan vous a invité ?{' '}
        <Link href="/activate" className="app-link font-semibold">
          Activer son compte
        </Link>
        .
      </>
    ),
  },
  {
    tone: 'warn' as const,
    title: 'Pas encore de compte',
    body: (
      <>
        donner son pseudo PUBG pour{' '}
        <Link href="/join" className="app-link font-semibold">
          demander l’accès à son clan ou l’inscrire
        </Link>{' '}
        : le compte se crée à l’acceptation.
      </>
    ),
  },
]

function LoginPageContent() {
  const searchParams = useSearchParams()

  const redirectTo = useMemo(() => searchParams.get('redirect'), [searchParams])

  const welcomeClanId = useMemo(() => {
    if (!redirectTo) return null
    const match = /^\/clans\/(\d+)\//.exec(redirectTo)
    return match ? match[1] : null
  }, [redirectTo])

  const [setupState, setSetupState] = useState<'completed' | 'pending_activation' | 'first_run' | 'loading'>('loading')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [welcome, setWelcome] = useState<WelcomeSettings>(DEFAULT_GLOBAL_WELCOME)
  const [clanLabel, setClanLabel] = useState<string | null>(null)
  // Image absente ou qui ne se charge plus (fichier téléversé disparu) : visuel par défaut, jamais un cadre vide.
  const heroImage = useImageFallback(welcome.imageUrl, '/squad.jpg')
  const heroImageUrl = heroImage.src
  const isGlobalPortal = welcome.badge === 'Portail PUBG'

  useEffect(() => {
    let cancelled = false

    async function loadSetupState() {
      try {
        const setupResponse = await fetch('/api/setup/status', { cache: 'no-store' })
        const setupPayload = (await setupResponse.json().catch(() => null)) as
          | { setupState?: 'completed' | 'pending_activation' | 'first_run' }
          | null

        if (!cancelled) {
          setSetupState(setupResponse.ok ? (setupPayload?.setupState ?? 'completed') : 'completed')
        }

        if (welcomeClanId) {
          const welcomeResponse = await fetch(`/api/clans/${welcomeClanId}/settings/login-welcome`, { cache: 'no-store' })
          const welcomePayload = (await welcomeResponse.json().catch(() => null)) as
            | { settings?: WelcomeSettings; clanLabel?: string | null }
            | null

          if (!cancelled && welcomeResponse.ok) {
            setWelcome(welcomePayload?.settings ?? DEFAULT_GLOBAL_WELCOME)
            setClanLabel(welcomePayload?.clanLabel ?? null)
          }
        }
      } catch {
        if (!cancelled) {
          setSetupState('completed')
        }
      }
    }

    void loadSetupState()

    return () => {
      cancelled = true
    }
  }, [welcomeClanId])

  if (setupState === 'first_run') {
    return <FirstRunSetup />
  }

  if (setupState === 'pending_activation') {
    return <PendingActivation />
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setSubmitting(true)
      setError('')

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const payload = (await response.json()) as {
        error?: string
        activeMemberId?: number | null
        defaultClanId?: number | null
        canSwitchClan?: boolean
      }
      if (!response.ok) {
        throw new Error(payload.error ?? 'Identifiants invalides ou connexion impossible')
      }

      if (typeof window !== 'undefined') {
        const defaultClanId = payload.defaultClanId
        if (Number.isInteger(defaultClanId) && (defaultClanId as number) > 0) {
          window.localStorage.setItem('selectedClanId', String(defaultClanId))
        }

        window.localStorage.setItem('canSwitchClan', payload.canSwitchClan ? '1' : '0')
      }
      // Rechargement complet : tout l'état du shell repart de la nouvelle session.
      if (redirectTo) {
        window.location.href = redirectTo
      } else {
        const memberId = payload.activeMemberId
        window.location.href = memberId ? `/members/${memberId}/dashboard` : '/members'
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Identifiants invalides ou connexion impossible')
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
        <Link href="/join" className="app-link inline-flex items-center gap-1 text-xs font-semibold">
          Pas encore de compte ?
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
              isGlobalPortal ? (
                <img src={pubgLogo.src} alt="PUBG Battlegrounds" className="h-10 w-auto self-start object-contain" />
              ) : (
                <img
                  src={heroImageUrl}
                  onError={heroImage.onError}
                  alt="Logo du clan"
                  className="h-14 w-14 rounded-[10px] border border-white/30 object-cover lg:hidden"
                />
              )
            }
            kicker={isGlobalPortal ? 'Espace membres' : welcome.badge}
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
            <LogIn className="h-5 w-5 text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
            Se connecter
          </h2>
          <p className="t-meta m-0">Votre espace de membre et, pour l’Owner, la gestion de son clan.</p>
        </div>

        <AuthGuide icon={ShieldCheck} title="Première visite ?" items={GUIDE} />

        <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)}>
          {error ? (
            <AuthAlert tone="neg" title={error}>
              Vérifier ses identifiants, ou utiliser « Mot de passe oublié ».
            </AuthAlert>
          ) : null}

          <label className="flex flex-col gap-1">
            <FieldLabel required>E-mail</FieldLabel>
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nom@exemple.com"
              className="app-input"
              autoComplete="email"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="flex items-center justify-between gap-2">
              <FieldLabel required>Mot de passe</FieldLabel>
              <Link
                href={email.trim() ? `/reset-password?email=${encodeURIComponent(email.trim())}` : '/reset-password'}
                className="app-link text-xs font-semibold"
              >
                Mot de passe oublié ?
              </Link>
            </span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="••••••••"
              className="app-input"
              autoComplete="current-password"
            />
          </label>

          <button type="submit" disabled={submitting} className="app-btn app-btn--md app-btn--primary mt-1 w-full gap-2">
            {submitting ? <ButtonSpinner /> : <LogIn className="h-4 w-4" aria-hidden="true" />}
            {submitting ? 'Connexion en cours…' : 'Se connecter'}
          </button>
        </form>

        <div className="flex flex-col gap-3 border-t border-gray-200 pt-5">
          <Link href="/clans" className="app-btn app-btn--md app-btn--secondary w-full gap-2">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Retour à la page principale
          </Link>
          <p className="t-meta m-0 text-center">
            Pas encore de compte ?{' '}
            <Link href="/join" className="app-link font-semibold">
              Demander l’accès à son clan ou l’inscrire
            </Link>
          </p>
        </div>
      </AuthCard>
    </AuthPage>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="charte game-ui mx-auto flex min-h-screen w-full max-w-md flex-1 items-center px-4 py-10">
          <ListSkeleton rows={3} />
        </main>
      }
    >
      <LoginPageContent />
    </Suspense>
  )
}
