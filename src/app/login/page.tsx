'use client'

/* eslint-disable @next/next/no-img-element */

import { Suspense, type FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import FirstRunSetup from '@/components/FirstRunSetup'
import PendingActivation from '@/components/PendingActivation'

type WelcomeSettings = {
  badge: string
  title: string
  message: string
  imageUrl: string | null
}

const DEFAULT_WELCOME: WelcomeSettings = {
  badge: 'Bienvenue au clan',
  title: 'Connexion escouade',
  message:
    'Connectez-vous pour retrouver vos statistiques, votre progression et les outils de coordination du clan.',
  imageUrl: null,
}

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const redirectTo = useMemo(() => searchParams.get('redirect'), [searchParams])
  const [setupState, setSetupState] = useState<
    'completed' | 'pending_activation' | 'first_run' | 'loading'
  >('loading')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [welcome, setWelcome] = useState<WelcomeSettings>(DEFAULT_WELCOME)
  const [clanLabel, setClanLabel] = useState<string | null>(null)
  const heroImageUrl = welcome.imageUrl?.trim() ? welcome.imageUrl : '/pubg.png'

  useEffect(() => {
    let cancelled = false

    async function loadSetupState() {
      try {
        const [setupResponse, welcomeResponse] = await Promise.all([
          fetch('/api/setup/status', { cache: 'no-store' }),
          fetch('/api/settings/login-welcome', { cache: 'no-store' }),
        ])

        const setupPayload = (await setupResponse.json().catch(() => null)) as
          | { setupState?: 'completed' | 'pending_activation' | 'first_run' }
          | null
        const welcomePayload = (await welcomeResponse.json().catch(() => null)) as
          | { settings?: WelcomeSettings; clanLabel?: string | null }
          | null

        if (!cancelled) {
          setSetupState(setupResponse.ok ? (setupPayload?.setupState ?? 'completed') : 'completed')
          if (welcomeResponse.ok) {
            setWelcome(welcomePayload?.settings ?? DEFAULT_WELCOME)
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
  }, [])

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
        throw new Error(payload.error ?? 'Login failed')
      }

      if (typeof window !== 'undefined') {
        const defaultClanId = payload.defaultClanId
        if (Number.isInteger(defaultClanId) && (defaultClanId as number) > 0) {
          window.localStorage.setItem('selectedClanId', String(defaultClanId))
        }

        window.localStorage.setItem('canSwitchClan', payload.canSwitchClan ? '1' : '0')
      }
      // Si pas de redirect explicite, on va sur le dashboard du membre actif
      if (redirectTo) {
        router.replace(redirectTo)
      } else {
        // On récupère l'ID du membre actif depuis la réponse ou on fallback sur /members
        const memberId = payload.activeMemberId
        router.replace(memberId ? `/members/${memberId}/dashboard` : '/members')
      }
      router.refresh()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="relative flex flex-1 items-center overflow-hidden px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_44%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.14),_transparent_40%)]" />

      <section className="relative mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl lg:grid-cols-[1.1fr_0.9fr]">
        <div className="relative bg-slate-900 p-7 text-white sm:p-10">
          <img
            src={heroImageUrl}
            alt="Visuel du clan"
            className="absolute inset-0 hidden h-full w-full object-cover opacity-35 lg:block"
          />
          <div className="absolute inset-0 bg-slate-900/72" />
          <div className="pointer-events-none absolute -left-10 top-14 h-40 w-40 rounded-full bg-emerald-400/30 blur-2xl" />
          <div className="pointer-events-none absolute -right-14 bottom-8 h-52 w-52 rounded-full bg-sky-500/30 blur-2xl" />

          <div className="relative z-10 flex items-start justify-between gap-4">
            <div>
              <p className="inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]">
                {welcome.badge}
              </p>
              <h1 className="mt-4 text-3xl font-black leading-tight sm:text-4xl">{welcome.title}</h1>
              <p className="mt-4 max-w-md text-sm text-slate-200">{welcome.message}</p>

              {clanLabel ? (
                <p className="mt-6 inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
                  {clanLabel}
                </p>
              ) : null}
            </div>

            <div className="shrink-0 lg:hidden">
              <img
                src={heroImageUrl}
                alt="Logo du clan"
                className="h-16 w-16 rounded-xl border border-white/30 object-cover shadow"
              />
            </div>
          </div>
        </div>

        <div className="p-7 sm:p-10">
          <h2 className="text-2xl font-black text-slate-900">Se connecter</h2>
          <p className="mt-2 text-sm text-slate-600">
            Entrez vos identifiants. Si l&apos;initialisation est en attente, activez d&apos;abord le compte
            Owner via le lien d&apos;activation.
          </p>

          <form className="mt-7 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
            <label className="block text-sm font-medium text-slate-700">
              Email
              <input
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                autoComplete="email"
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              Mot de passe
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                autoComplete="current-password"
              />
            </label>

            {error ? <p className="text-sm text-rose-700">{error}</p> : null}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            >
              {submitting ? 'Connexion...' : 'Se connecter'}
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-md flex-1 items-center px-4 py-10">
          <p className="text-sm text-gray-600">Chargement...</p>
        </main>
      }
    >
      <LoginPageContent />
    </Suspense>
  )
}
