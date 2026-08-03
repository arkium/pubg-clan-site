'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  KeyRound,
  Mail,
  MailCheck,
  MailWarning,
  RefreshCw,
  Send,
  ShieldOff,
  XCircle,
} from 'lucide-react'

import { useAuthSession } from '@/hooks/useAuthSession'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'

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

function formatDateTime(value: string | null) {
  if (!value) {
    return '—'
  }

  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function StatTile({
  icon: Icon,
  tone,
  label,
  value,
  sub,
}: {
  icon: typeof Mail
  tone: string
  label: string
  value: string
  sub?: string | null
}) {
  return (
    <div className="app-panel-muted min-w-0 rounded-2xl px-4 py-3">
      <div className={`mb-2 inline-flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="truncate text-lg font-black leading-tight text-gray-900">{value}</p>
      <p className="mt-1 text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      {sub ? <p className="mt-1 truncate text-xs text-gray-500">{sub}</p> : null}
    </div>
  )
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

  const isOwner = permissions.includes('*')

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

    if (!authenticated || !isOwner) {
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
  }, [authenticated, isOwner, loading])

  const loadingData = authenticated && isOwner && !statusLoaded

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
        <p className="text-sm text-gray-600">Chargement de la configuration email...</p>
      </main>
    )
  }

  if (!authenticated) {
    return null
  }

  if (!isOwner) {
    return (
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-center gap-2">
            <ShieldOff className="h-5 w-5 text-amber-700" aria-hidden="true" />
            <h1 className="text-xl font-bold text-amber-900">Acces restreint</h1>
          </div>
          <p className="mt-2 text-sm text-amber-800">
            Cette page est reservee au Owner.
          </p>
          <Link href="/" className="mt-5 app-btn app-btn--md app-btn--secondary">
            Retour a l&apos;accueil
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="app-container app-main flex-1 space-y-4">
      <section className="app-panel p-4">
        <SettingsPageHeader
          title="Test de livraison email"
          subtitle="Lancez un email de test. Une fois le test réussi, les boutons d'invitation sont affichés dans la gestion des membres."
          actions={
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${
                status.ready
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-amber-200 bg-amber-50 text-amber-700'
              }`}
            >
              {status.ready ? (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {status.ready ? 'Configuration validée' : 'Configuration non validée'}
            </span>
          }
        />
      </section>

      <section className="app-panel p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            icon={status.ready ? MailCheck : MailWarning}
            tone={status.ready ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-500'}
            label="Statut"
            value={status.ready ? 'Opérationnel' : 'Non validé'}
          />
          <StatTile
            icon={Clock}
            tone="bg-blue-500/15 text-blue-500"
            label="Dernier succès"
            value={formatDateTime(status.lastSuccessAt)}
            sub={status.lastTestRecipient}
          />
          <StatTile
            icon={AlertTriangle}
            tone={status.lastError ? 'bg-rose-500/15 text-rose-500' : 'bg-gray-400/15 text-gray-400'}
            label="Dernière erreur"
            value={status.lastError ? 'Oui' : 'Aucune'}
            sub={status.lastError}
          />
        </div>
      </section>

      <section className="app-panel overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-4">
          <KeyRound className="h-5 w-5 text-gray-500" aria-hidden="true" />
          <h2 className="text-base font-semibold text-gray-900">Paramètres .env requis</h2>
        </div>

        <div className="px-5">
          {status.env.items.map((item, index) => (
            <div
              key={item.key}
              className={[
                'flex items-center justify-between gap-3 py-2.5',
                index > 0 ? 'border-t border-gray-200' : '',
              ].join(' ')}
            >
              <div className="flex min-w-0 items-center gap-2">
                {item.isSet ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" aria-hidden="true" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0 text-rose-500" aria-hidden="true" />
                )}
                <span className="truncate font-mono text-xs text-gray-700">{item.key}</span>
              </div>
              <span className={`truncate text-xs ${item.isSet ? 'text-gray-500' : 'font-medium text-rose-600'}`}>
                {item.value ?? '(vide)'}
              </span>
            </div>
          ))}
        </div>

        {!status.env.allRequiredSet ? (
          <div className="m-5 mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              Configuration incomplète
            </div>
            <p className="mt-1 text-sm text-amber-800">
              Complétez votre fichier .env puis rechargez la page.
            </p>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-amber-800">Exemple .env</p>
            <pre className="mt-1 overflow-x-auto rounded-lg border border-amber-200 bg-white p-3 text-xs text-gray-700">
              {status.env.example}
            </pre>
          </div>
        ) : null}
      </section>

      <section className="app-panel overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-4">
          <Send className="h-5 w-5 text-blue-500" aria-hidden="true" />
          <h2 className="text-base font-semibold text-gray-900">Envoyer un email de test</h2>
        </div>

        <form className="space-y-4 p-5" onSubmit={handleRunTest}>
          <label className="block text-sm font-medium text-gray-700">
            Adresse email de test
            <div className="relative mt-1">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input
                type="email"
                value={testEmail}
                onChange={(event) => setTestEmail(event.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900"
                placeholder="admin@exemple.com"
                disabled={testing}
              />
            </div>
          </label>

          {error ? (
            <p className="flex items-center gap-1.5 text-sm text-rose-700">
              <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="flex items-center gap-1.5 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              {success}
            </p>
          ) : null}

          {lastDelivery ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-xs text-gray-700">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Dernier envoi</p>
              <div className="space-y-1">
                <p>
                  Mode d&apos;envoi :{' '}
                  <span className="font-medium text-gray-900">
                    {lastDelivery.mode === 'smtp' ? 'SMTP réel' : "Simulation locale (pas d'email sortant)"}
                  </span>
                </p>
                <p>
                  Destinataire : <span className="font-medium text-gray-900">{lastDelivery.to}</span>
                </p>
                {lastDelivery.messageId ? <p>Message ID : {lastDelivery.messageId}</p> : null}
                {lastDelivery.accepted && lastDelivery.accepted.length > 0 ? (
                  <p>Acceptés SMTP : {lastDelivery.accepted.join(', ')}</p>
                ) : null}
                {lastDelivery.rejected && lastDelivery.rejected.length > 0 ? (
                  <p className="text-rose-700">Rejetés SMTP : {lastDelivery.rejected.join(', ')}</p>
                ) : null}
                {lastDelivery.reason ? <p>Détail : {lastDelivery.reason}</p> : null}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
            {status.env.allRequiredSet ? (
              <button type="submit" disabled={testing} className="app-btn app-btn--md app-btn--primary gap-1.5">
                <Send className="h-4 w-4" aria-hidden="true" />
                {testing ? 'Envoi en cours...' : 'Envoyer un email test'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void handleRevoke()}
              disabled={revoking}
              className="app-btn app-btn--md app-btn--danger gap-1.5"
            >
              <ShieldOff className="h-4 w-4" aria-hidden="true" />
              {revoking ? 'Revocation...' : 'Revoquer la validation'}
            </button>
            <button
              type="button"
              onClick={() => void handleRefreshStatus()}
              disabled={refreshing}
              className="app-btn app-btn--md app-btn--secondary gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
              {refreshing ? 'Rechargement...' : 'Recharger le statut'}
            </button>
            <Link href="/clans" className="text-sm font-medium text-gray-600 hover:text-gray-900">
              Retour aux clans
            </Link>
          </div>
        </form>
      </section>
    </main>
  )
}
