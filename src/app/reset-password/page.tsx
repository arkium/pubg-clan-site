'use client'

import Link from 'next/link'
import { Suspense, type FormEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, KeyRound, Mail } from 'lucide-react'

import { AuthAlert, AuthCard, AuthPage, AuthVisual, FieldLabel } from '@/components/auth/AuthLayout'
import { ButtonSpinner, ListSkeleton } from '@/components/ui/CharteKit'

/**
 * Mot de passe oublié : demande d'un lien par e-mail, puis nouveau mot de passe avec le lien reçu (`?token=`). Selon la
 * charte UI (docs/ui/index.html) : mise en page des pages d'accès (`AuthLayout`).
 */
function ResetPasswordPageContent() {
  const searchParams = useSearchParams()
  const tokenFromUrl = useMemo(() => searchParams.get('token')?.trim() ?? '', [searchParams])
  const emailFromUrl = useMemo(() => searchParams.get('email')?.trim() ?? '', [searchParams])

  const [email, setEmail] = useState(emailFromUrl)
  const [requesting, setRequesting] = useState(false)
  const [requestError, setRequestError] = useState('')
  const [requestSuccess, setRequestSuccess] = useState('')

  const [token] = useState(tokenFromUrl)
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
    if (!hasToken) return

    let cancelled = false

    async function checkToken() {
      try {
        const response = await fetch(`/api/auth/password/reset/context?token=${encodeURIComponent(token.trim())}`, {
          cache: 'no-store',
        })

        if (!response.ok) {
          if (!cancelled) {
            setTokenValid(false)
            setTokenError('Ce lien de réinitialisation est invalide ou expiré.')
          }
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

      const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Échec de la demande de réinitialisation')
      }

      setRequestSuccess(payload?.message ?? 'Si un compte correspond, un e-mail de réinitialisation vient d’être envoyé.')
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Échec de la demande de réinitialisation')
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

      const payload = (await response.json().catch(() => null)) as { message?: string; error?: string } | null

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Échec de la réinitialisation du mot de passe')
      }

      setNewPassword('')
      setConfirmPassword('')
      setResetSuccess(payload?.message ?? 'Mot de passe réinitialisé.')
    } catch (error) {
      setResetError(error instanceof Error ? error.message : 'Échec de la réinitialisation du mot de passe')
    } finally {
      setResetting(false)
    }
  }

  return (
    <AuthPage>
      <AuthCard
        visual={
          <AuthVisual
            image="/sauvetage.jpg"
            kicker="Assistance connexion"
            title="Mot de passe oublié"
            text="Demander un lien de réinitialisation, puis choisir un nouveau mot de passe avec le lien reçu par e-mail."
          />
        }
      >
        {!hasToken ? (
          <>
            <div className="flex flex-col gap-1">
              <h2 className="t-section-title m-0 flex items-center gap-2">
                <Mail className="h-5 w-5 text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
                Demander un lien
              </h2>
              <p className="t-meta m-0">Saisir son e-mail de connexion pour recevoir un lien de réinitialisation.</p>
            </div>

            <form className="flex flex-col gap-4" onSubmit={(event) => void handleRequestReset(event)}>
              <label className="flex flex-col gap-1">
                <FieldLabel required>E-mail</FieldLabel>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="app-input"
                  autoComplete="email"
                  placeholder="joueur@exemple.com"
                />
              </label>

              {requestError ? <AuthAlert tone="neg" title={requestError} /> : null}
              {requestSuccess ? <AuthAlert tone="pos" title={requestSuccess} /> : null}

              <button type="submit" disabled={requesting} className="app-btn app-btn--md app-btn--primary w-full gap-2">
                {requesting ? <ButtonSpinner /> : <Mail className="h-4 w-4" aria-hidden="true" />}
                {requesting ? 'Envoi…' : 'Envoyer le lien de réinitialisation'}
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <h2 className="t-section-title m-0 flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
                Nouveau mot de passe
              </h2>
              <p className="t-meta m-0">Saisir le nouveau mot de passe, puis confirmer la réinitialisation.</p>
            </div>

            {tokenChecking ? <ListSkeleton rows={1} /> : null}
            {tokenError ? (
              <AuthAlert tone="neg" title={tokenError}>
                Demander un nouveau lien depuis cette page, sans paramètre.
              </AuthAlert>
            ) : null}

            {tokenValid && !tokenChecking ? (
              <form className="flex flex-col gap-4" onSubmit={(event) => void handleResetPassword(event)}>
                <label className="flex flex-col gap-1">
                  <FieldLabel required>Nouveau mot de passe</FieldLabel>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="app-input"
                    autoComplete="new-password"
                  />
                  <span className="t-meta">8 caractères au moins.</span>
                </label>

                <label className="flex flex-col gap-1">
                  <FieldLabel required>Confirmer le mot de passe</FieldLabel>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="app-input"
                    autoComplete="new-password"
                  />
                </label>

                {resetError ? <AuthAlert tone="neg" title={resetError} /> : null}
                {resetSuccess ? (
                  <AuthAlert tone="pos" title={resetSuccess}>
                    <Link href="/login" className="app-link font-semibold">
                      Se connecter
                    </Link>
                  </AuthAlert>
                ) : null}

                <button type="submit" disabled={resetting} className="app-btn app-btn--md app-btn--primary w-full gap-2">
                  {resetting ? <ButtonSpinner /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
                  {resetting ? 'Mise à jour…' : 'Réinitialiser le mot de passe'}
                </button>
              </form>
            ) : null}
          </>
        )}

        <Link href="/login" className="app-link inline-flex items-center gap-1.5 self-start text-sm font-semibold">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Retour à la connexion
        </Link>
      </AuthCard>
    </AuthPage>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="charte game-ui mx-auto flex min-h-screen w-full max-w-md flex-1 items-center px-4 py-10">
          <ListSkeleton rows={3} />
        </main>
      }
    >
      <ResetPasswordPageContent />
    </Suspense>
  )
}
