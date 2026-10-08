'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock, KeyRound, Mail, MailCheck, MailWarning, RefreshCw, Send, ShieldOff, XCircle } from 'lucide-react'

import { KpiGrid, type Kpi } from '@/components/matches/MatchesUi'
import AdminPageBanner, { BANNER_GLASS_BUTTON } from '@/components/settings/AdminPageBanner'
import { ADMIN_PAGE_CLASS, AdminPageLoading, AdminPageRestricted, FormFeedback } from '@/components/settings/AdminPageStates'
import { Callout, ConfirmDialog, SectionCard } from '@/components/ui/CharteKit'
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

/**
 * Envoi d'e-mails de la plateforme (SuperUser), selon la charte UI (docs/ui/index.html) : état de la configuration
 * SMTP, variables `.env` attendues, e-mail de test. Un test réussi affiche les invitations par e-mail dans la gestion
 * des membres ; la révocation les masque à nouveau.
 */
export default function EmailDeliverySettingsPage() {
  const router = useRouter()
  const { loading, authenticated, isSuperUser, email } = useAuthSession()

  const [status, setStatus] = useState<EmailDeliveryStatus>(INITIAL_STATUS)
  const [statusLoaded, setStatusLoaded] = useState(false)
  const [testing, setTesting] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [testEmail, setTestEmail] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [lastDelivery, setLastDelivery] = useState<EmailDeliveryMeta | null>(null)

  // Configuration SMTP de toute la plateforme : SuperUser seulement, comme l'API
  const canManageEmail = isSuperUser

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace('/login?redirect=/settings/email-delivery')
    }
  }, [authenticated, loading, router])

  async function loadStatus() {
    const response = await fetch('/api/settings/email-delivery', { cache: 'no-store' })
    const payload = (await response.json().catch(() => null)) as EmailDeliveryStatus | null

    if (!response.ok) {
      throw new Error('Impossible de charger l’état de l’envoi d’e-mails')
    }

    setStatus(payload ?? INITIAL_STATUS)
  }

  useEffect(() => {
    if (loading) {
      return
    }

    if (!authenticated || !canManageEmail) {
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
          setError(loadError instanceof Error ? loadError.message : 'Impossible de charger l’état de l’envoi d’e-mails')
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
  }, [authenticated, canManageEmail, loading])

  const loadingData = authenticated && canManageEmail && !statusLoaded

  async function handleRefreshStatus() {
    try {
      setRefreshing(true)
      setError('')
      setSuccess('')
      await loadStatus()
      setSuccess('État rechargé depuis la configuration actuelle.')
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Impossible de recharger l’état')
    } finally {
      setRefreshing(false)
    }
  }

  async function handleRunTest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const recipient = (testEmail || email || '').trim()
    if (!recipient) {
      setError('Renseigner une adresse pour l’e-mail de test.')
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
        throw new Error(payload?.error ?? 'Échec de l’e-mail de test')
      }

      setStatus({
        ready: Boolean(payload?.ready),
        lastSuccessAt: payload?.lastSuccessAt ?? null,
        lastTestRecipient: payload?.lastTestRecipient ?? null,
        lastError: payload?.lastError ?? null,
        env: payload?.env ?? INITIAL_STATUS.env,
      })
      setLastDelivery(payload?.delivery ?? null)
      setSuccess(payload?.message ?? 'E-mail de test envoyé.')
    } catch (testError) {
      setError(testError instanceof Error ? testError.message : 'Échec de l’e-mail de test')
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
        throw new Error(payload?.error ?? 'Échec de la révocation')
      }

      setStatus({
        ready: Boolean(payload?.ready),
        lastSuccessAt: payload?.lastSuccessAt ?? null,
        lastTestRecipient: payload?.lastTestRecipient ?? null,
        lastError: payload?.lastError ?? null,
        env: payload?.env ?? INITIAL_STATUS.env,
      })
      setSuccess(payload?.message ?? 'Validation révoquée.')
      setRevokeDialogOpen(false)
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : 'Échec de la révocation')
    } finally {
      setRevoking(false)
    }
  }

  if (loading || loadingData) {
    return <AdminPageLoading />
  }

  if (!authenticated) {
    return null
  }

  if (!canManageEmail) {
    return <AdminPageRestricted />
  }

  const kpis: Kpi[] = [
    {
      label: 'État',
      value: status.ready ? 'Opérationnel' : 'Non validé',
      detail: status.ready ? 'invitations par e-mail affichées' : 'aucun test réussi en cours de validité',
      icon: status.ready ? MailCheck : MailWarning,
      color: status.ready ? 'var(--game-pos)' : 'var(--game-warn)',
    },
    {
      label: 'Dernier succès',
      value: formatDateTime(status.lastSuccessAt),
      detail: status.lastTestRecipient ?? 'aucun envoi réussi',
      icon: Clock,
      color: 'var(--game-sky)',
    },
    {
      label: 'Dernière erreur',
      value: status.lastError ? 'Oui' : 'Aucune',
      detail: status.lastError ?? 'rien à signaler',
      icon: AlertTriangle,
      color: status.lastError ? 'var(--game-neg)' : 'var(--theme-ui-text-muted)',
    },
  ]

  return (
    <div className={ADMIN_PAGE_CLASS}>
      <AdminPageBanner
        title="Envoi d’e-mails"
        subtitle="Un e-mail de test réussi affiche les invitations par e-mail dans la gestion des membres."
        icon={Mail}
        image="/recall%202.jpg"
        currentHref="/settings/email-delivery"
        parent={{ href: '/settings', label: 'Plateforme' }}
        pills={[
          <span key="state" className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: status.ready ? 'var(--game-pos)' : 'var(--game-warn)' }}
              aria-hidden="true"
            />
            {status.ready ? 'Configuration validée' : 'Configuration non validée'}
          </span>,
          'Réservé au SuperUser',
        ]}
        action={
          <button type="button" onClick={() => void handleRefreshStatus()} disabled={refreshing} className={BANNER_GLASS_BUTTON}>
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Recharger l’état
          </button>
        }
      />

      <KpiGrid items={kpis} className="grid-cols-1 sm:grid-cols-3" />

      <SectionCard
        id="email-env-title"
        icon={KeyRound}
        title="Variables .env requises"
        meta="Lues au démarrage du serveur ; les valeurs sensibles sont masquées."
      >
        <ul className="m-0 flex list-none flex-col p-0">
          {status.env.items.map((item, index) => (
            <li
              key={item.key}
              className={`flex items-center justify-between gap-3 py-2 ${index > 0 ? 'border-t border-gray-200' : ''}`}
            >
              <span className="flex min-w-0 items-center gap-2">
                {item.isSet ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: 'var(--game-pos)' }} aria-label="Renseignée" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0" style={{ color: 'var(--game-neg)' }} aria-label="Manquante" />
                )}
                <span className="truncate font-mono text-xs text-gray-700">{item.key}</span>
              </span>
              <span className={`t-meta truncate ${item.isSet ? '' : 't-neg font-semibold'}`}>{item.value ?? '(vide)'}</span>
            </li>
          ))}
        </ul>

        {!status.env.allRequiredSet ? (
          <Callout tone="warn" icon={AlertTriangle} title="Configuration incomplète">
            Compléter le fichier .env, redémarrer le serveur puis recharger l’état.
            <pre className="app-panel-muted mt-2 whitespace-pre-wrap break-all p-3 font-mono text-xs text-gray-700">{status.env.example}</pre>
          </Callout>
        ) : null}
      </SectionCard>

      <form onSubmit={handleRunTest}>
        <SectionCard id="email-test-title" icon={Send} title="E-mail de test" meta="Sans adresse saisie, le test part vers l’adresse de votre compte.">
          <label className="flex flex-col gap-1 sm:max-w-md">
            <span className="t-label">Adresse de test</span>
            <span className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden="true" />
              <input
                type="email"
                value={testEmail}
                onChange={(event) => setTestEmail(event.target.value)}
                className="app-input pl-9"
                placeholder={email || 'admin@exemple.com'}
                disabled={testing}
              />
            </span>
          </label>

          {lastDelivery ? (
            <div className="app-panel-muted flex flex-col gap-1.5 px-3.5 py-3">
              <span className="t-label">Dernier envoi</span>
              <dl className="t-body m-0 grid gap-x-3 gap-y-1 text-gray-700 sm:grid-cols-[max-content_minmax(0,1fr)]">
                <dt className="text-gray-500">Mode</dt>
                <dd className="m-0 font-semibold text-gray-900">
                  {lastDelivery.mode === 'smtp' ? 'SMTP réel' : 'Simulation locale (aucun e-mail sortant)'}
                </dd>
                <dt className="text-gray-500">Destinataire</dt>
                <dd className="m-0 break-all font-semibold text-gray-900">{lastDelivery.to}</dd>
                {lastDelivery.messageId ? (
                  <>
                    <dt className="text-gray-500">Identifiant</dt>
                    <dd className="m-0 break-all font-mono text-xs">{lastDelivery.messageId}</dd>
                  </>
                ) : null}
                {lastDelivery.accepted && lastDelivery.accepted.length > 0 ? (
                  <>
                    <dt className="text-gray-500">Acceptés</dt>
                    <dd className="m-0 break-all">{lastDelivery.accepted.join(', ')}</dd>
                  </>
                ) : null}
                {lastDelivery.rejected && lastDelivery.rejected.length > 0 ? (
                  <>
                    <dt className="text-gray-500">Rejetés</dt>
                    <dd className="t-neg m-0 break-all">{lastDelivery.rejected.join(', ')}</dd>
                  </>
                ) : null}
                {lastDelivery.reason ? (
                  <>
                    <dt className="text-gray-500">Détail</dt>
                    <dd className="m-0">{lastDelivery.reason}</dd>
                  </>
                ) : null}
              </dl>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {status.env.allRequiredSet ? (
              <button type="submit" disabled={testing} className="app-btn app-btn--md app-btn--primary gap-1.5">
                <Send className="h-4 w-4" aria-hidden="true" />
                {testing ? 'Envoi en cours…' : 'Envoyer l’e-mail de test'}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setRevokeDialogOpen(true)}
              disabled={revoking || !status.ready}
              className="app-btn app-btn--md app-btn--danger gap-1.5"
              title={status.ready ? 'Masquer à nouveau les invitations par e-mail' : 'Aucune validation à révoquer'}
            >
              <ShieldOff className="h-4 w-4" aria-hidden="true" />
              Révoquer la validation
            </button>
            <FormFeedback error={error} success={success} />
          </div>
        </SectionCard>
      </form>

      {revokeDialogOpen ? (
        <ConfirmDialog
          icon={ShieldOff}
          title="Révoquer la validation ?"
          confirmLabel="Révoquer"
          tone="danger"
          busy={revoking}
          onCancel={() => setRevokeDialogOpen(false)}
          onConfirm={() => void handleRevoke()}
        >
          Les invitations par e-mail disparaîtront de la gestion des membres jusqu’au prochain e-mail de test réussi.
        </ConfirmDialog>
      ) : null}
    </div>
  )
}
