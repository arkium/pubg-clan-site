'use client'

import { useParams } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Bell, BellOff, BellRing, Info, Mail, MailWarning, Send, Settings2, type LucideIcon } from 'lucide-react'

import MemberPageHeader from '@/components/member/MemberPageHeader'
import { NotificationAccessState, type NotificationAccess } from '@/components/notifications/NotificationAccessState'
import { NotificationEmailPreview, type NotificationEmailPreviewData } from '@/components/notifications/NotificationEmailPreview'
import { NotificationTypeTile } from '@/components/notifications/NotificationTypeTile'
import {
  ButtonSpinner,
  Callout,
  ErrorState,
  IconTile,
  ListSkeleton,
  SectionCard,
  Switch,
  ToastStack,
  type Toast,
} from '@/components/ui/CharteKit'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import ShowMoreToggle from '@/components/ui/ShowMoreToggle'
import type { NotificationPreferenceField, NotificationPreferenceValues } from '@/lib/notification-preferences'
import { NOTIFICATION_TYPE_LABELS, type NotificationType } from '@/types/notifications'

/**
 * Préférences de notifications d'un joueur — ce qui le prévient, et par quel canal. Personnelles : seul le compte lié
 * au membre (et le SuperUser) y accède (`requireOwnMember`).
 *
 * Charte UI (docs/ui/index.html, 10/10/2026) : bannière des pages joueur à titre Teko, deux panneaux de section,
 * interrupteurs de la charte enregistrés à chaque bascule (toast), tuiles de type partagées avec la page des
 * notifications. Le canal « push », branché sur aucun service, n'est pas proposé.
 *
 * Canal e-mail : l'aperçu dépliable montre un vrai e-mail (texte construit par le serveur avec `buildNotificationEmail`,
 * liens compris), et la page dit ce qui empêcherait l'envoi — compte non vérifié, envoi non configuré sur le serveur.
 */

const TYPE_ROWS: { field: NotificationPreferenceField; type: NotificationType; hint: string }[] = [
  { field: 'squadDetected', type: 'squad_detected', hint: 'Quand le site détecte une partie jouée avec des membres de ton clan.' },
  { field: 'topPerformance', type: 'top_performance', hint: 'Quand tu finis en tête du clan en kills, dégâts ou win rate sur la période.' },
  { field: 'challengeStarted', type: 'challenge_started', hint: 'Quand un défi démarre dans ton clan.' },
  { field: 'inviteReminder', type: 'invite_reminder', hint: 'En soirée, quand ton clan est en ligne, pour inviter tes amis (une fois par 12 h au plus).' },
]

const CHANNEL_ROWS: { field: NotificationPreferenceField; icon: LucideIcon; label: string; hint: string }[] = [
  { field: 'inAppNotifications', icon: Bell, label: 'Sur le site', hint: 'Dans ta page Notifications.' },
  { field: 'emailNotifications', icon: Mail, label: 'Par e-mail', hint: 'À l’adresse de ton compte.' },
]

/** Canal e-mail tel que le serveur le voit (route GET) : adresse, envoi possible, aperçu d'un vrai e-mail. */
type EmailChannel = {
  address: string | null
  deliverable: boolean
  senderReady: boolean
  preview: NotificationEmailPreviewData
}

type PreferencesResponse = { preferences?: NotificationPreferenceValues; email?: EmailChannel }

function parseMemberId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function PreferenceRow({
  field,
  tile,
  label,
  hint,
  checked,
  saving,
  onChange,
}: {
  field: NotificationPreferenceField
  tile: ReactNode
  label: string
  hint: string
  checked: boolean
  saving: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <li className="flex items-center gap-3 border-t border-gray-200 py-3 first:border-t-0 first:pt-0 last:pb-0">
      {tile}
      <div className="min-w-0 flex-1">
        <p id={`pref-${field}`} className="t-card-title">
          {label}
        </p>
        <p id={`pref-${field}-hint`} className="t-meta">
          {hint}
        </p>
      </div>
      {saving ? <ButtonSpinner /> : null}
      <Switch
        checked={checked}
        onChange={onChange}
        disabled={saving}
        labelledBy={`pref-${field}`}
        describedBy={`pref-${field}-hint`}
        testId={`pref-${field}`}
      />
    </li>
  )
}

export default function NotificationPreferencesPage() {
  const params = useParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])

  const [preferences, setPreferences] = useState<NotificationPreferenceValues | null>(null)
  const [emailChannel, setEmailChannel] = useState<EmailChannel | null>(null)
  const [showEmailPreview, setShowEmailPreview] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [access, setAccess] = useState<NotificationAccess>('ok')
  const [savingField, setSavingField] = useState<NotificationPreferenceField | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [retryToken, setRetryToken] = useState(0)
  const toastId = useRef(0)

  // Patron de chargement du dépôt (cf. /clans/mutations) : fonction async déclarée dans l'effet, réessai par jeton.
  useEffect(() => {
    if (!memberId) return
    let cancelled = false
    const controller = new AbortController()

    async function loadPreferences() {
      try {
        setLoading(true)
        setError(null)

        const res = await fetch(`/api/members/${memberId}/notification-preferences`, {
          cache: 'no-store',
          signal: controller.signal,
        })

        if (res.status === 401 || res.status === 403) {
          if (!cancelled) setAccess(res.status === 401 ? 'signed-out' : 'forbidden')
          return
        }
        if (res.status === 404) throw new Error('Joueur introuvable.')
        if (!res.ok) throw new Error('Impossible de charger tes préférences.')

        const data = (await res.json()) as PreferencesResponse
        if (!cancelled) {
          setAccess('ok')
          setPreferences(data.preferences ?? null)
          setEmailChannel(data.email ?? null)
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur inconnue')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadPreferences()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [memberId, retryToken])

  if (!memberId) {
    return (
      <div className="app-container app-main flex-1">
        <p className="text-sm text-[var(--theme-ui-negative)]">Identifiant de joueur invalide.</p>
      </div>
    )
  }

  function notify(text: string, tone: Toast['tone']) {
    const id = ++toastId.current
    setToasts((current) => [...current.slice(-2), { id, text, tone }])
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 5000)
  }

  // Chaque bascule est enregistrée aussitôt : affichée tout de suite, rétablie si l'enregistrement échoue.
  async function updatePreference(field: NotificationPreferenceField, value: boolean) {
    if (!preferences) return
    const previous = preferences
    setPreferences({ ...previous, [field]: value })
    setSavingField(field)
    try {
      const res = await fetch(`/api/members/${memberId}/notification-preferences`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      const data = (await res.json().catch(() => null)) as PreferencesResponse | null
      if (!res.ok || !data?.preferences) throw new Error()
      setPreferences(data.preferences)
      notify('Préférence enregistrée', 'success')
    } catch {
      setPreferences(previous)
      notify('La préférence n’a pas pu être enregistrée.', 'error')
    } finally {
      setSavingField(null)
    }
  }

  const noChannel = preferences ? !preferences.inAppNotifications && !preferences.emailNotifications : false

  return (
    // `.charte` : page migrée vers la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    // `.game-ui` : jetons --game-* (tuiles des types de notification).
    <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
      <NavigationTrail
        currentLabel="Préférences"
        currentHref={`/members/${memberId}/notification-preferences`}
        fallbackParent={{ href: `/members/${memberId}/notifications`, label: 'Notifications', altHref: '/members' }}
      />
      <MemberPageHeader
        title="Préférences"
        subtitle="Notifications : ce qui te prévient, et comment. Chaque changement est enregistré aussitôt."
        showBackButton={false}
        backgroundImage="/duo.jpg"
        backgroundPosition="center 30%"
        icon={<Settings2 className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />}
      />

      {access !== 'ok' ? (
        <NotificationAccessState access={access} memberId={memberId} section="notification-preferences" />
      ) : loading && !preferences ? (
        <section className="app-panel p-4 sm:p-5">
          <ListSkeleton rows={4} />
        </section>
      ) : error || !preferences ? (
        <section className="app-panel">
          <ErrorState message={error ?? 'Impossible de charger tes préférences.'} onRetry={() => setRetryToken((token) => token + 1)} />
        </section>
      ) : (
        <>
          {noChannel ? (
            <Callout tone="warn" icon={BellOff} title="Aucun canal actif" testId="pref-no-channel">
              Tu ne recevras plus aucune notification, demandes à traiter comprises. Réactive au moins un canal ci-dessous.
            </Callout>
          ) : null}

          <SectionCard
            id="pref-types"
            icon={BellRing}
            title="Ce qui te prévient"
            meta="Coupe un type pour ne plus le recevoir, sur aucun canal."
          >
            <ul className="flex flex-col">
              {TYPE_ROWS.map((row) => (
                <PreferenceRow
                  key={row.field}
                  field={row.field}
                  tile={<NotificationTypeTile type={row.type} />}
                  label={NOTIFICATION_TYPE_LABELS[row.type]}
                  hint={row.hint}
                  checked={preferences[row.field]}
                  saving={savingField === row.field}
                  onChange={(value) => void updatePreference(row.field, value)}
                />
              ))}
            </ul>
            <p className="t-meta">
              Les demandes à traiter — adhésion au clan, création de clan, demande sur les données — ne se coupent pas :
              elles arrivent aux Owners et au SuperUser tant qu’un canal est actif.
            </p>
          </SectionCard>

          <SectionCard id="pref-channels" icon={Send} title="Comment les recevoir" meta="Un canal coupé vaut pour tous les types.">
            <ul className="flex flex-col">
              {CHANNEL_ROWS.map((row) => (
                <PreferenceRow
                  key={row.field}
                  field={row.field}
                  tile={<IconTile icon={row.icon} tone="neutral" />}
                  label={row.label}
                  hint={row.field === 'emailNotifications' && emailChannel?.address ? `À ${emailChannel.address}.` : row.hint}
                  checked={preferences[row.field]}
                  saving={savingField === row.field}
                  onChange={(value) => void updatePreference(row.field, value)}
                />
              ))}
            </ul>

            {/* Ce qui empêcherait réellement un e-mail de partir, dit seulement quand le canal est actif. */}
            {preferences.emailNotifications && emailChannel && !emailChannel.deliverable ? (
              <Callout tone="warn" icon={MailWarning} title="Aucun e-mail ne peut partir" testId="pref-email-undeliverable">
                {emailChannel.address
                  ? 'Ton compte n’est pas actif ou son adresse n’est pas vérifiée.'
                  : 'Aucune adresse e-mail réelle n’est rattachée à ce joueur.'}
              </Callout>
            ) : null}
            {preferences.emailNotifications && emailChannel && !emailChannel.senderReady ? (
              <Callout tone="sky" icon={Info} title="Envoi pas encore activé" testId="pref-email-sender-off">
                Le site n’envoie pas encore d’e-mails : ta préférence est gardée, rien ne part pour l’instant.
              </Callout>
            ) : null}

            {emailChannel ? (
              <div className="flex flex-col gap-2">
                <ShowMoreToggle
                  expanded={showEmailPreview}
                  onToggle={() => setShowEmailPreview((shown) => !shown)}
                  moreLabel="Voir un exemple d’e-mail"
                  lessLabel="Masquer l’exemple"
                />
                {showEmailPreview ? (
                  <>
                    <NotificationEmailPreview preview={emailChannel.preview} to={emailChannel.address} />
                    <p className="t-meta">
                      Exemple d’une partie en escouade : chaque e-mail reprend le titre et le message de la notification.
                      {emailChannel.preview.oneClickUnsubscribe
                        ? ' Le dernier lien coupe tous les e-mails de notification, sans avoir à se connecter ; ta messagerie peut aussi proposer « Se désabonner ».'
                        : ' Le lien de désabonnement direct n’est pas configuré sur ce serveur : le pied de l’e-mail renvoie vers cette page.'}
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}
          </SectionCard>
        </>
      )}

      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
    </div>
  )
}
