'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'
import { CheckCircle2, MailX, TriangleAlert } from 'lucide-react'

import { ButtonSpinner, IconTile, ListSkeleton } from '@/components/ui/CharteKit'

/**
 * « Ne plus recevoir ces e-mails » — page publique (sans session : `PUBLIC_PATHS` de `src/proxy.ts`), ouverte depuis le
 * lien d'un e-mail de notification. Elle demande une confirmation avant de couper le canal : les messageries et les
 * antivirus ouvrent les liens des e-mails avant le destinataire, un simple GET ne doit rien changer. Le désabonnement
 * en un clic depuis la messagerie passe, lui, par `List-Unsubscribe-Post` sur la route API.
 *
 * Charte UI (docs/ui/index.html, 10/10/2026) : panneau centré, tuile d'icône, un seul bouton principal.
 */

type State =
  | { step: 'loading' }
  | { step: 'invalid' }
  | { step: 'error'; message: string }
  | { step: 'confirm' | 'already' | 'done'; memberId: number; displayName: string }

function preferencesHref(memberId: number) {
  return `/members/${memberId}/notification-preferences`
}

function Unsubscribe() {
  const token = useSearchParams().get('t') ?? ''
  const [state, setState] = useState<State>({ step: 'loading' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function loadState() {
      if (!token) {
        setState({ step: 'invalid' })
        return
      }
      try {
        const res = await fetch(`/api/notifications/unsubscribe?t=${encodeURIComponent(token)}`, { cache: 'no-store' })
        if (res.status === 400 || res.status === 404) {
          if (!cancelled) setState({ step: 'invalid' })
          return
        }
        if (!res.ok) throw new Error()
        const data = (await res.json()) as { memberId: number; displayName: string; emailNotifications: boolean }
        if (!cancelled) {
          setState({ step: data.emailNotifications ? 'confirm' : 'already', memberId: data.memberId, displayName: data.displayName })
        }
      } catch {
        if (!cancelled) setState({ step: 'error', message: 'Impossible de lire ce lien pour le moment.' })
      }
    }

    void loadState()
    return () => {
      cancelled = true
    }
  }, [token])

  async function unsubscribe() {
    if (state.step !== 'confirm') return
    setSaving(true)
    try {
      const res = await fetch(`/api/notifications/unsubscribe?t=${encodeURIComponent(token)}`, { method: 'POST' })
      if (!res.ok) throw new Error()
      setState({ ...state, step: 'done' })
    } catch {
      setState({ step: 'error', message: 'Le désabonnement n’a pas pu être enregistré. Réessaie dans un instant.' })
    } finally {
      setSaving(false)
    }
  }

  if (state.step === 'loading') {
    return <ListSkeleton rows={1} />
  }

  if (state.step === 'invalid' || state.step === 'error') {
    return (
      <>
        <TriangleAlert className="h-8 w-8 text-[var(--game-warn)]" aria-hidden="true" />
        <h1 className="t-section-title">{state.step === 'invalid' ? 'Lien invalide ou expiré' : 'Un souci est survenu'}</h1>
        <p className="t-body text-gray-700">
          {state.step === 'invalid'
            ? 'Ce lien ne correspond à aucun abonnement. Tu peux couper les e-mails depuis tes préférences de notifications, une fois connecté.'
            : state.message}
        </p>
        <Link href="/login" className="app-btn app-btn--secondary app-btn--md">
          Se connecter
        </Link>
      </>
    )
  }

  if (state.step === 'confirm') {
    return (
      <>
        <IconTile icon={MailX} />
        <h1 className="t-section-title">Ne plus recevoir ces e-mails ?</h1>
        <p className="t-body text-gray-700">
          Les notifications de <b className="text-gray-900">{state.displayName}</b> ne t’arriveront plus par e-mail. Elles
          restent visibles sur le site, dans ta page Notifications.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={() => void unsubscribe()} disabled={saving} className="app-btn app-btn--primary app-btn--md gap-2">
            {saving ? <ButtonSpinner /> : null}
            Ne plus recevoir ces e-mails
          </button>
          <Link href={preferencesHref(state.memberId)} className="app-btn app-btn--secondary app-btn--md">
            Choisir plutôt ce qui me prévient
          </Link>
        </div>
      </>
    )
  }

  return (
    <>
      <CheckCircle2 className="h-8 w-8 text-[var(--theme-ui-positive)]" aria-hidden="true" />
      <h1 className="t-section-title">{state.step === 'done' ? 'C’est fait' : 'Déjà désabonné'}</h1>
      <p className="t-body text-gray-700">
        {state.step === 'done' ? 'Plus aucun' : 'Tu ne reçois déjà plus aucun'} e-mail de notification pour{' '}
        <b className="text-gray-900">{state.displayName}</b>. Tu peux les réactiver à tout moment dans tes préférences.
      </p>
      <Link href={preferencesHref(state.memberId)} className="app-btn app-btn--secondary app-btn--md">
        Mes préférences de notifications
      </Link>
    </>
  )
}

export default function NotificationUnsubscribePage() {
  return (
    // `.charte` : page créée selon la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-container app-main charte flex flex-1 justify-center">
      <section className="app-panel flex w-full max-w-md flex-col items-center gap-3 p-6 text-center sm:p-8" data-testid="notification-unsubscribe">
        <Suspense fallback={<ListSkeleton rows={1} />}>
          <Unsubscribe />
        </Suspense>
      </section>
    </div>
  )
}
