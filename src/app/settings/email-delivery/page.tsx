'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { useAuthSession } from '@/hooks/useAuthSession'

type EmailDeliveryStatus = {
  ready: boolean
  lastSuccessAt: string | null
  lastTestRecipient: string | null
  lastError: string | null
  env: {
    allRequiredSet: boolean
    missingKeys: string[]
    items: Array<{
      key: string
      isSet: boolean
      isSensitive: boolean
      value: string | null
    }>
    example: string
  }
}

type EmailDeliveryMeta = {
  delivered: boolean
  mode: 'smtp' | 'stub'
  to: string
  subject: string
  from: string | null
  messageId?: string
  accepted?: string[]
  rejected?: string[]
  reason?: string
}

const INITIAL_STATUS: EmailDeliveryStatus = {
  ready: false,
  lastSuccessAt: null,
  lastTestRecipient: null,
  lastError: null,
  env: {
    allRequiredSet: false,
    missingKeys: [],
    items: [],
    example: '',
  },
}

export default function EmailDeliverySettingsPage() {
  const router = useRouter()
  const { loading, authenticated, permissions, email } = useAuthSession()

  const [status, setStatus] = useState<EmailDeliveryStatus>(INITIAL_STATUS)
  const [statusLoaded, setStatusLoaded] = useState(false)
  const [testing, setTesting] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [lastDelivery, setLastDelivery] = useState<EmailDeliveryMeta | null>(null)

  const canManageSettings = permissions.includes('*') || permissions.includes('manage_settings')

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/login?redirect=/settings/email-delivery')
    }
  }, [authenticated, loading, router])

  async function loadStatus() {
    const response = await fetch('/api/settings/email-delivery', { cache: 'no-store' })
    const payload = (await response.json().catch(() => null)) as EmailDeliveryStatus | null

    if (!response.ok) {
      throw new Error('Impossible de charger le statut email')
    }

    setStatus(payload ?? INITIAL_STATUS)
  }

  useEffect(() => {
    if (loading) {
      return
    }

    if (!authenticated || !canManageSettings) {
      return
    }

    let cancelled = false

    async function loadInitialStatus() {
      try {
        if (!cancelled) {
          setError('')
        }
        await loadStatus()
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Impossible de charger le statut email')
        }
      } finally {
        if (!cancelled) {
          setStatusLoaded(true)
        }
      }
    }

    void loadInitialStatus()

    return () => {
      cancelled = true
    }
  }, [authenticated, canManageSettings, loading])

  const loadingData = authenticated && canManageSettings && !statusLoaded

  async function handleRefreshStatus() {
    try {
      setRefreshing(true)
      setError('')
      setSuccess('')
      await loadStatus()
      setSuccess('Statut email recharge depuis la configuration actuelle.')
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Impossible de recharger le statut email')
    } finally {
      setRefreshing(false)
    }
  }

  async function handleRunTest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const recipient = (testEmail || email || '').trim()
    if (!recipient) {
      setError('Veuillez renseigner une adresse email de test.')
      return
    }

    try {
      setTesting(true)
      setError('')
      setSuccess('')

      const response = await fetch('/api/settings/email-delivery', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ to: recipient }),
      })

      const payload = (await response.json().catch(() => null)) as
        | (EmailDeliveryStatus & { message?: string; error?: string; delivery?: EmailDeliveryMeta })
        | null

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Echec du test email')
      }

      setStatus({
        ready: Boolean(payload?.ready),
        lastSuccessAt: payload?.lastSuccessAt ?? null,
        lastTestRecipient: payload?.lastTestRecipient ?? null,
        lastError: payload?.lastError ?? null,
        env: payload?.env ?? INITIAL_STATUS.env,
      })
      setLastDelivery(payload?.delivery ?? null)
      setSuccess(payload?.message ?? 'Email de test envoye avec succes.')
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'Echec du test email')
      setStatus((current) => ({
        ...current,
        ready: false,
      }))
    } finally {
      setTesting(false)
    }
  }

  async function handleRevoke() {
    try {
      setRevoking(true)
      setError('')
      setSuccess('')

      const response = await fetch('/api/settings/email-delivery', {
        method: 'DELETE',
      })

      const payload = (await response.json().catch(() => null)) as
        | (EmailDeliveryStatus & { message?: string; error?: string })
        | null

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Echec de la revocation')
      }

      setStatus({
        ready: Boolean(payload?.ready),
        lastSuccessAt: payload?.lastSuccessAt ?? null,
        lastTestRecipient: payload?.lastTestRecipient ?? null,
        lastError: payload?.lastError ?? null,
        env: payload?.env ?? INITIAL_STATUS.env,
      })
      setSuccess(payload?.message ?? 'Validation email revoquee.')
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : 'Echec de la revocation')
    } finally {
      setRevoking(false)
    }
  }

  if (loading || loadingData) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 items-center justify-center px-4 py-12">
        <p className="text-sm text-slate-600">Chargement de la configuration email...</p>
      </main>
    )
  }

  if (!authenticated) {
    return null
  }

  if (!canManageSettings) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-xl font-bold text-amber-900">Acces restreint</h1>
          <p className="mt-2 text-sm text-amber-800">
            Cette page est reservee au Owner ou aux admins disposant de la permission
            manage_settings.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900"
          >
            Retour a l&apos;accueil
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-sky-50 via-white to-emerald-50 p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">Configuration email</p>
        <h1 className="mt-2 text-2xl font-black text-slate-900">Test de livraison email</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Lancez un email de test. Une fois le test reussi, les boutons d&apos;invitation sont affiches
          dans la gestion des membres.
        </p>

        <div
          className={`mt-4 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
            status.ready
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-amber-200 bg-amber-50 text-amber-700'
          }`}
        >
          {status.ready ? 'Configuration validee' : 'Configuration non validee'}
        </div>

        <form className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-5" onSubmit={handleRunTest}>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Parametres .env requis
            </p>
            <div className="mt-2 space-y-1 text-xs">
              {status.env.items.map((item) => (
                <p key={item.key} className={item.isSet ? 'text-emerald-700' : 'text-rose-700'}>
                  {item.key} = {item.value ?? '(vide)'}
                </p>
              ))}
            </div>
          </div>

          {!status.env.allRequiredSet ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <p>
                Configuration email incomplete. Completez votre fichier .env puis rechargez la page.
              </p>
              <p className="mt-2 text-xs font-semibold">Exemple .env :</p>
              <pre className="mt-1 overflow-x-auto rounded border border-amber-200 bg-white p-2 text-xs text-slate-700">
                {status.env.example}
              </pre>
            </div>
          ) : null}

          <label className="block text-sm font-medium text-slate-700">
            Adresse email de test
            <input
              type="email"
              value={testEmail}
              onChange={(event) => setTestEmail(event.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              placeholder="admin@exemple.com"
              disabled={testing}
            />
          </label>

          {status.lastSuccessAt ? (
            <p className="text-xs text-slate-600">
              Dernier succes: {new Date(status.lastSuccessAt).toLocaleString()} {status.lastTestRecipient ? `(${status.lastTestRecipient})` : ''}
            </p>
          ) : null}
          {status.lastError ? <p className="text-xs text-rose-700">Derniere erreur: {status.lastError}</p> : null}

          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          {success ? <p className="text-sm text-emerald-700">{success}</p> : null}
          {lastDelivery ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
              <p>
                Mode d&apos;envoi: {lastDelivery.mode === 'smtp' ? 'SMTP reel' : 'Simulation locale (pas d\'email sortant)'}
              </p>
              <p>Destinataire: {lastDelivery.to}</p>
              {lastDelivery.messageId ? <p>Message ID: {lastDelivery.messageId}</p> : null}
              {lastDelivery.accepted && lastDelivery.accepted.length > 0 ? (
                <p>Acceptes SMTP: {lastDelivery.accepted.join(', ')}</p>
              ) : null}
              {lastDelivery.rejected && lastDelivery.rejected.length > 0 ? (
                <p className="text-rose-700">Rejectes SMTP: {lastDelivery.rejected.join(', ')}</p>
              ) : null}
              {lastDelivery.reason ? <p>Detail: {lastDelivery.reason}</p> : null}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {status.env.allRequiredSet ? (
              <button
                type="submit"
                disabled={testing}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {testing ? 'Envoi en cours...' : 'Envoyer un email test'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void handleRevoke()}
              disabled={revoking}
              className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {revoking ? 'Revocation...' : 'Revoquer la validation'}
            </button>
            <button
              type="button"
              onClick={() => void handleRefreshStatus()}
              disabled={refreshing}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {refreshing ? 'Rechargement...' : 'Recharger le statut'}
            </button>
            <Link href="/clans" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Retour aux clans
            </Link>
          </div>
        </form>
      </section>
    </main>
  )
}
