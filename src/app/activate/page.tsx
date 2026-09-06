'use client'

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { Suspense, type FormEvent, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  KeyRound,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserCheck,
  Users,
} from 'lucide-react'

import pubgLogo from '@/assets/pubg-logo-official.webp'

type WelcomeSettings = {
  badge: string
  title: string
  message: string
  imageUrl: string | null
}

const DEFAULT_WELCOME: WelcomeSettings = {
  badge: 'Portail Membres & Clans',
  title: 'Activation du compte',
  message:
    'Finalisez votre activation pour accéder aux statistiques, rapports et outils de coordination de votre clan.',
  imageUrl: '/squad.jpg',
}

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
  const heroImageUrl = welcome.imageUrl?.trim() ? welcome.imageUrl : '/squad.jpg'

  useEffect(() => {
    let cancelled = false

    async function loadWelcome() {
      try {
        const response = await fetch('/api/settings/login-welcome', { cache: 'no-store' })
        const payload = (await response.json().catch(() => null)) as
          | { settings?: WelcomeSettings; clanLabel?: string | null }
          | null

        if (!cancelled && response.ok) {
          setWelcome(payload?.settings ?? DEFAULT_WELCOME)
          setClanLabel(payload?.clanLabel ?? null)
        }
      } catch {
        // Keep default welcome content silently.
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
        const response = await fetch(
          `/api/auth/activate/context?token=${encodeURIComponent(trimmedToken)}`,
          {
            cache: 'no-store',
          }
        )

        const payload = (await response.json().catch(() => null)) as
          | { requiresLoginEmail?: boolean }
          | null

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
      setError('Saisissez votre email de connexion')
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
        throw new Error(payload.error ?? 'Échec de l\'activation du compte')
      }

      router.replace('/')
      router.refresh()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Échec de l\'activation du compte')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="relative flex min-h-screen flex-1 flex-col items-center justify-center overflow-hidden px-4 py-8 sm:px-6">
      {/* Arrière-plan subtilement illuminé */}
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
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 transition hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400"
        >
          <span>Espace connexion</span>
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
              <img
                src={pubgLogo.src}
                alt="PUBG Battlegrounds"
                className="h-10 w-auto object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]"
              />

              {welcome.badge && welcome.badge !== 'Portail Membres & Clans' && (
                <div className="shrink-0 pt-1 lg:hidden">
                  <img
                    src={heroImageUrl}
                    alt="Logo du clan"
                    className="h-14 w-14 rounded-xl border border-white/30 object-cover shadow"
                  />
                </div>
              )}
            </div>

            <p className="inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
              {welcome.badge}
            </p>

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
                <strong className="text-white">Rattachement immédiat :</strong> Votre profil joueur et vos rôles au sein du clan sont configurés dès validation.
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
                <Users className="h-4 w-4" />
              </span>
              <div>
                <strong className="text-white">Statistiques & Télémétrie :</strong> Synchronisation automatique de vos matches, frags et performances.
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Trophy className="h-4 w-4" />
              </span>
              <div>
                <strong className="text-white">Vie du clan :</strong> Participez aux défis communautaires, aux débriefs tactiques et aux classements.
              </div>
            </div>
          </div>
        </div>

        {/* Colonne droite : Formulaire et messages explicatifs */}
        <div className="flex flex-col justify-between p-7 sm:p-10">
          <div>
            <div className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">
                Activation du compte
              </h2>
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Définissez votre mot de passe pour sécuriser votre accès et finaliser votre intégration.
            </p>

            {/* Guide d'activation & première visite */}
            <div className="mt-5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 text-xs text-slate-600 dark:border-slate-800/80 dark:bg-slate-800/40 dark:text-slate-300">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <span>Guide d&apos;activation de compte</span>
              </div>
              <ul className="mt-2.5 space-y-2 text-slate-600 dark:text-slate-400">
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  <span>
                    <strong className="text-slate-800 dark:text-slate-200">Jeton d&apos;invitation :</strong> Ce jeton unique a été émis lors de votre invitation par l&apos;administrateur.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                  <span>
                    <strong className="text-slate-800 dark:text-slate-200">Mot de passe :</strong> Choisissez au moins 8 caractères pour sécuriser vos prochaines connexions.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span>
                    <strong className="text-slate-800 dark:text-slate-200">Déjà activé ?</strong> Vous pouvez directement{' '}
                    <Link href="/login" className="font-semibold text-emerald-600 underline underline-offset-2 hover:text-emerald-500 dark:text-emerald-400">
                      vous connecter ici
                    </Link>.
                  </span>
                </li>
              </ul>
            </div>

            {requiresLoginEmail && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
                <div className="flex items-center gap-2 font-semibold">
                  <KeyRound className="h-4 w-4 text-amber-600" />
                  <span>Invitation Discord détectée</span>
                </div>
                <p className="mt-1 text-[11px] text-amber-800 dark:text-amber-300">
                  Veuillez saisir votre adresse email de connexion pour finaliser l&apos;association de votre profil.
                </p>
              </div>
            )}

            <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
              {error && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                    <div className="space-y-1">
                      <p className="font-semibold text-rose-950 dark:text-rose-100">{error}</p>
                      <p className="text-rose-700 dark:text-rose-300">
                        Vérifiez la validité de votre jeton d&apos;invitation ou contactez l&apos;administrateur de votre clan.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-900 dark:text-white">
                  Jeton d&apos;activation (Token) <span className="text-rose-600">*</span>
                </label>
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
                  placeholder="Collez votre jeton ici"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 font-mono text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  autoComplete="off"
                />
              </div>

              {requiresLoginEmail && (
                <div>
                  <label className="block text-sm font-semibold text-slate-900 dark:text-white">
                    Email de connexion <span className="text-rose-600">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(event) => setLoginEmail(event.target.value)}
                    placeholder="joueur@exemple.com"
                    className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    autoComplete="email"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Utilisez l&apos;adresse email que vous souhaitez utiliser pour vos futures connexions.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-900 dark:text-white">
                  Nom affiché <span className="text-xs font-normal text-slate-500">(optionnel)</span>
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="ex: Balthazar"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  autoComplete="nickname"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-900 dark:text-white">
                  Nouveau mot de passe <span className="text-rose-600">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Minimum 8 caractères"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  autoComplete="new-password"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-900 dark:text-white">
                  Confirmer le mot de passe <span className="text-rose-600">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Répétez votre mot de passe"
                  className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  autoComplete="new-password"
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
                      <span>Activation en cours...</span>
                    </>
                  ) : (
                    <>
                      <UserCheck className="h-4 w-4" />
                      <span>Activer mon compte</span>
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
                Vous avez déjà activé votre compte ?{' '}
                <Link
                  href="/login"
                  className="font-bold text-slate-900 underline underline-offset-2 hover:text-emerald-600 dark:text-white dark:hover:text-emerald-400"
                >
                  Se connecter
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default function ActivatePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen w-full max-w-md flex-1 items-center px-4 py-10">
          <p className="text-sm text-gray-600">Chargement...</p>
        </main>
      }
    >
      <ActivatePageContent />
    </Suspense>
  )
}

