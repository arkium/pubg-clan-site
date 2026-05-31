'use client'

import Link from 'next/link'
import { Suspense, type FormEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'

function ResetPasswordPageContent() {
  const searchParams = useSearchParams()
  const tokenFromUrl = useMemo(() => searchParams.get('token')?.trim() ?? '', [searchParams])
  const emailFromUrl = useMemo(() => searchParams.get('email')?.trim() ?? '', [searchParams])

  const [email, setEmail] = useState(emailFromUrl)
  const [requesting, setRequesting] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [requestSuccess, setRequestSuccess] = useState('')

  const [token, setToken] = useState(tokenFromUrl)
  const [tokenChecking, setTokenChecking] = useState(Boolean(tokenFromUrl))
  const [tokenValid, setTokenValid] = useState(!tokenFromUrl)
  const [tokenError, setTokenError] = useState('')

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resetting, setResetting] = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetSuccess, setResetSuccess] = useState('')

  const hasToken = token.trim().length > 0

  useEffect(() => {
    if (!hasToken) {
      setTokenValid(true)
      setTokenError('')
      setTokenChecking(false)
      return
    }

    let cancelled = false

    async function checkToken() {
      try {
        setTokenChecking(true)
        setTokenError('')
        setTokenValid(false)

        const response = await fetch(
          `/api/auth/password/reset/context?token=${encodeURIComponent(token.trim())}`,
          {
            cache: 'no-store',
          }
        )

        if (!response.ok) {
          setTokenValid(false)
          setTokenError('Ce lien de réinitialisation est invalide ou expiré.')
          return
        }

        if (!cancelled) {
          setTokenValid(true)
        }
      } catch {
        if (!cancelled) {
          setTokenValid(false)
          setTokenError('Impossible de vérifier ce lien de réinitialisation.')
        }
      } finally {
        if (!cancelled) {
          setTokenChecking(false)
        }
      }
    }

    void checkToken()

    return () => {
      cancelled = true
    }
  }, [hasToken, token])

  async function handleRequestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setRequesting(true)
      setRequestError('')
      setRequestSuccess('')

      const response = await fetch('/api/auth/password/forgot', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email,
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | { message?: string; error?: string }
        | null

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Échec de la demande de réinitialisation')
      }

      setRequestSuccess(
        payload?.message ?? 'Si un compte correspond, un email de réinitialisation vient d\'être envoyé.'
      )
    } catch (error) {
      setRequestError(
        error instanceof Error ? error.message : 'Échec de la demande de réinitialisation'
      )
    } finally {
      setRequesting(false)
    }
  }

  async function handleResetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (newPassword.length < 8) {
      setResetError('Le nouveau mot de passe doit contenir au moins 8 caractères.')
      setResetSuccess('')
      return
    }

    if (newPassword !== confirmPassword) {
      setResetError('Les mots de passe ne correspondent pas.')
      setResetSuccess('')
      return
    }

    try {
      setResetting(true)
      setResetError('')
      setResetSuccess('')

      const response = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          token: token.trim(),
          newPassword,
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | { message?: string; error?: string }
        | null

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Échec de la réinitialisation du mot de passe')
      }

      setNewPassword('')
      setConfirmPassword('')
      setResetSuccess(payload?.message ?? 'Mot de passe réinitialisé avec succès.')
    } catch (error) {
      setResetError(
        error instanceof Error ? error.message : 'Échec de la réinitialisation du mot de passe'
      )
    } finally {
      setResetting(false)
    }
  }

  return (
    <main className="relative flex flex-1 items-center overflow-hidden px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_44%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.14),_transparent_40%)]" />

      <section className="relative mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl lg:grid-cols-[1.1fr_0.9fr]">
        <div className="relative bg-slate-900 p-7 text-white sm:p-10">
          <div className="pointer-events-none absolute -left-10 top-14 h-40 w-40 rounded-full bg-emerald-400/30 blur-2xl" />
          <div className="pointer-events-none absolute -right-14 bottom-8 h-52 w-52 rounded-full bg-sky-500/30 blur-2xl" />

          <div className="relative z-10">
            <p className="inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]">
              Assistance connexion
            </p>
            <h1 className="mt-4 text-3xl font-black leading-tight sm:text-4xl">Mot de passe oublié</h1>
            <p className="mt-4 max-w-md text-sm text-slate-200">
              Demande un lien de réinitialisation ou définis ton nouveau mot de passe avec le lien reçu par email.
            </p>
          </div>
        </div>

        <div className="p-7 sm:p-10">
          {!hasToken ? (
            <>
              <h2 className="text-2xl font-black text-slate-900">Demander un lien</h2>
              <p className="mt-2 text-sm text-slate-600">
                Saisis ton email de connexion pour recevoir un lien de réinitialisation.
              </p>

              <form className="mt-7 space-y-4" onSubmit={(event) => void handleRequestReset(event)}>
                <label className="block text-sm font-medium text-slate-700">
                  Email
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                    autoComplete="email"
                    placeholder="joueur@exemple.com"
                  />
                </label>

                {requestError ? <p className="text-sm text-rose-700">{requestError}</p> : null}
                {requestSuccess ? <p className="text-sm text-emerald-700">{requestSuccess}</p> : null}

                <button
                  type="submit"
                  disabled={requesting}
                  className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {requesting ? 'Envoi...' : 'Envoyer le lien de réinitialisation'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-black text-slate-900">Définir un nouveau mot de passe</h2>
              <p className="mt-2 text-sm text-slate-600">
                Saisis ton nouveau mot de passe puis confirme la réinitialisation.
              </p>

              {tokenChecking ? <p className="mt-5 text-sm text-slate-600">Vérification du lien...</p> : null}
              {tokenError ? <p className="mt-5 text-sm text-rose-700">{tokenError}</p> : null}

              {tokenValid ? (
                <form className="mt-7 space-y-4" onSubmit={(event) => void handleResetPassword(event)}>
                  <label className="block text-sm font-medium text-slate-700">
                    Nouveau mot de passe
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      autoComplete="new-password"
                    />
                  </label>

                  <label className="block text-sm font-medium text-slate-700">
                    Confirmer le mot de passe
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
                      autoComplete="new-password"
                    />
                  </label>

                  {resetError ? <p className="text-sm text-rose-700">{resetError}</p> : null}
                  {resetSuccess ? <p className="text-sm text-emerald-700">{resetSuccess}</p> : null}

                  <button
                    type="submit"
                    disabled={resetting}
                    className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {resetting ? 'Mise à jour...' : 'Réinitialiser le mot de passe'}
                  </button>
                </form>
              ) : null}
            </>
          )}

          <Link
            href="/login"
            className="mt-6 inline-flex text-sm font-semibold text-slate-700 underline underline-offset-2 transition hover:text-slate-900"
          >
            Retour à la connexion
          </Link>
        </div>
      </section>
    </main>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-md flex-1 items-center px-4 py-10">
          <p className="text-sm text-gray-600">Chargement...</p>
        </main>
      }
    >
      <ResetPasswordPageContent />
    </Suspense>
  )
}
