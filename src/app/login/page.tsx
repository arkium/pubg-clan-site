'use client'

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { Suspense, type FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  LogIn,
  ShieldCheck,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react'

import pubgLogo from '@/assets/pubg-logo-official.webp'
import FirstRunSetup from '@/components/FirstRunSetup'
import PendingActivation from '@/components/PendingActivation'

type WelcomeSettings = {
  badge: string
  title: string
  message: string
  imageUrl: string | null
}

const DEFAULT_GLOBAL_WELCOME: WelcomeSettings = {
  badge: 'Portail PUBG',
  title: 'Connexion globale',
  message:
    'Connectez-vous pour gérer vos clans, synchroniser vos statistiques et accéder à vos tableaux de bord.',
  imageUrl: '/squad.jpg',
}

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const redirectTo = useMemo(() => searchParams.get('redirect'), [searchParams])

  const welcomeClanId = useMemo(() => {
    if (!redirectTo) return null
    const match = /^\/clans\/(\d+)\//.exec(redirectTo)
    return match ? match[1] : null
  }, [redirectTo])

  const [setupState, setSetupState] = useState<
    'completed' | 'pending_activation' | 'first_run' | 'loading'
  >('loading')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [welcome, setWelcome] = useState<WelcomeSettings>(DEFAULT_GLOBAL_WELCOME)
  const [clanLabel, setClanLabel] = useState<string | null>(null)
  const heroImageUrl = welcome.imageUrl?.trim() ? welcome.imageUrl : '/squad.jpg'

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
      // Force a full page reload so all client-side layout states refresh
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
    <main className="relative flex min-h-screen flex-1 flex-col items-center justify-center overflow-hidden px-4 py-8 sm:px-6">
      {/* Arrière-plan illuminé harmonisé avec /join */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_44%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.14),_transparent_40%)]" />

      {/* Barre supérieure d'accès rapide avec retour à l'accueil */}
      <div className="relative z-10 mb-4 flex w-full max-w-5xl items-center justify-between">
        <Link
          href="/clans"
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/85 px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm backdrop-blur-md transition hover:border-emerald-500 hover:bg-white hover:text-slate-950 dark:border-slate-800 dark:bg-slate-900/85 dark:text-slate-300 dark:hover:border-emerald-500 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 text-emerald-500" />
          <span>Retour à l&apos;accueil du site</span>
        </Link>

        <Link
          href="/join"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 transition hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400"
        >
          <span>Rejoindre ou créer un clan</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <section className="relative mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Colonne gauche : Visuel immersif Squad PUBG ou Clan Custom */}
        <div className="relative flex flex-col justify-between overflow-hidden bg-slate-950 p-7 text-white sm:p-10">
          <img
            src={heroImageUrl}
            alt="Visuel PUBG"
            className={`absolute inset-0 h-full w-full object-cover opacity-60 ${
              heroImageUrl === '/squad.jpg' ? 'object-[center_35%] scale-105' : 'object-center'
            }`}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-slate-950/40" />
          <div className="pointer-events-none absolute -left-10 top-14 h-40 w-40 rounded-full bg-emerald-400/25 blur-2xl" />
          <div className="pointer-events-none absolute -right-14 bottom-8 h-52 w-52 rounded-full bg-sky-500/25 blur-2xl" />

          {/* En-tête gauche avec Logo PUBG ou Badge */}
          <div className="relative z-10">
            <div className="mb-5 flex items-center justify-between">
              {welcome.badge === 'Portail PUBG' ? (
                <img
                  src={pubgLogo.src}
                  alt="PUBG Battlegrounds"
                  className="h-10 w-auto object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                />
              ) : (
                <p className="inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
                  {welcome.badge}
                </p>
              )}

              {welcome.badge !== 'Portail PUBG' && (
                <div className="shrink-0 pt-1 lg:hidden">
                  <img
                    src={heroImageUrl}
                    alt="Logo du clan"
                    className="h-14 w-14 rounded-xl border border-white/30 object-cover shadow"
                  />
                </div>
              )}
            </div>

            {welcome.badge === 'Portail PUBG' && (
              <p className="inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
                Portail Membres & Connexion
              </p>
            )}

            <h1 className="mt-4 text-3xl font-black leading-tight sm:text-4xl text-white">
              {welcome.title}
            </h1>
            <p className="mt-3 max-w-md text-sm text-slate-200">
              {welcome.message}
            </p>

            {clanLabel ? (
              <p className="mt-4 inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
                {clanLabel}
              </p>
            ) : null}
          </div>

          {/* Points forts / Avantages gaming */}
          <div className="relative z-10 mt-8 space-y-3 border-t border-white/15 pt-6 text-xs text-slate-200">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <strong className="text-white">Accès centralisé :</strong> Vos droits de gestion, vos rôles et vos clans associés sont synchronisés en temps réel.
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
                <Users className="h-4 w-4" />
              </span>
              <div>
                <strong className="text-white">Statistiques & Télémétrie :</strong> Suivi de vos frags, dégâts, positions de largage et débriefs complets de match.
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Trophy className="h-4 w-4" />
              </span>
              <div>
                <strong className="text-white">Défis & Compétition :</strong> Participez aux classements de clan et mesurez vos performances face aux escouades rivales.
              </div>
            </div>
          </div>
        </div>

        {/* Colonne droite : Formulaire et messages explicatifs */}
        <div className="flex flex-col justify-between p-7 sm:p-10">
          <div>
            <div className="flex items-center gap-2">
              <LogIn className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">
                Se connecter
              </h2>
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Accédez à vos tableaux de bord, vos statistiques de jeu et vos outils d&apos;administration.
            </p>

            {/* Guide d'accès et aide à la connexion */}
            <div className="mt-5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 text-xs text-slate-600 dark:border-slate-800/80 dark:bg-slate-800/40 dark:text-slate-300">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <span>Guide d&apos;accès & première visite</span>
              </div>
              <ul className="mt-2.5 space-y-2 text-slate-600 dark:text-slate-400">
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  <span>
                    <strong className="text-slate-800 dark:text-slate-200">Membre actif :</strong> Saisissez vos identifiants pour accéder directement à vos clans et statistiques.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                  <span>
                    <strong className="text-slate-800 dark:text-slate-200">Invitation reçue :</strong> Vous avez reçu une invitation d&apos;un clan ?{' '}
                    <Link href="/activate" className="font-semibold text-emerald-600 underline underline-offset-2 hover:text-emerald-500 dark:text-emerald-400">
                      Activez votre compte ici
                    </Link>.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span>
                    <strong className="text-slate-800 dark:text-slate-200">Pas encore inscrit ?</strong> Renseignez votre pseudo PUBG officiel pour{' '}
                    <Link href="/join" className="font-semibold text-emerald-600 underline underline-offset-2 hover:text-emerald-500 dark:text-emerald-400">
                      rejoindre ou créer un clan
                    </Link>.
                  </span>
                </li>
              </ul>
            </div>

            <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
              {error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                    <div className="space-y-1">
                      <p className="font-semibold text-rose-950 dark:text-rose-100">{error}</p>
                      <p className="text-rose-700 dark:text-rose-300">
                        Vérifiez vos identifiants ou utilisez le lien « Mot de passe oublié » ci-dessous.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-900 dark:text-white">
                  Email <span className="text-rose-600">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nom@exemple.com"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  autoComplete="email"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-semibold text-slate-900 dark:text-white">
                    Mot de passe <span className="text-rose-600">*</span>
                  </label>
                  <Link
                    href={email.trim() ? `/reset-password?email=${encodeURIComponent(email.trim())}` : '/reset-password'}
                    className="text-xs font-semibold text-slate-500 underline underline-offset-2 transition hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400"
                  >
                    Mot de passe oublié ?
                  </Link>
                </div>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  autoComplete="current-password"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="app-btn app-btn--md app-btn--primary w-full flex items-center justify-center gap-2 text-sm font-semibold"
                >
                  {submitting ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      <span>Connexion en cours...</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="h-4 w-4" />
                      <span>Se connecter</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Pied de carte avec retour à la page principale */}
          <div className="mt-6 border-t border-slate-200 pt-5 space-y-3 dark:border-slate-800">
            <Link
              href="/clans"
              className="app-btn app-btn--md app-btn--secondary w-full flex items-center justify-center gap-2 text-sm font-semibold"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Retour à la page principale</span>
            </Link>

            <div className="text-center text-xs">
              <p className="text-slate-600 dark:text-slate-400">
                Nouveau joueur ou nouveau clan ?{' '}
                <Link
                  href="/join"
                  className="font-bold text-slate-900 underline underline-offset-2 hover:text-emerald-600 dark:text-white dark:hover:text-emerald-400"
                >
                  Rejoindre ou créer un clan
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-1 items-center px-4 py-10">
          <p className="text-sm text-gray-600">Chargement...</p>
        </main>
      }
    >
      <LoginPageContent />
    </Suspense>
  )
}

