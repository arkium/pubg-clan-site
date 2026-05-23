'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

const RESEND_COOLDOWN_SECONDS = 45

type WelcomeSettings = {
  badge: string
  title: string
  message: string
  imageUrl: string | null
}

type PendingInvite = {
  email: string
  expiresAt: string
  displayName: string
}

const DEFAULT_WELCOME: WelcomeSettings = {
  badge: 'Activation en attente',
  title: 'Finalisez votre acces Owner',
  message:
    'Le clan est initialise. Ouvrez le lien recu par email pour activer le compte Owner avant de vous connecter.',
  imageUrl: null,
}

export default function PendingActivation() {
  const [welcome, setWelcome] = useState<WelcomeSettings>(DEFAULT_WELCOME)
  const [clanLabel, setClanLabel] = useState<string | null>(null)
  const [invite, setInvite] = useState<PendingInvite | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [cooldownRemaining, setCooldownRemaining] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function loadPendingActivation() {
      try {
        setLoading(true)
        const response = await fetch('/api/setup/pending-activation', { cache: 'no-store' })
        const payload = (await response.json().catch(() => null)) as
          | {
              settings?: WelcomeSettings
              clanLabel?: string | null
              invite?: PendingInvite | null
              error?: string
            }
          | null

        if (!response.ok) {
          throw new Error(payload?.error ?? 'Impossible de charger les informations d\'activation')
        }

        if (!cancelled) {
          setWelcome(payload?.settings ?? DEFAULT_WELCOME)
          setClanLabel(payload?.clanLabel ?? null)
          setInvite(payload?.invite ?? null)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les informations d\'activation')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadPendingActivation()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (cooldownRemaining <= 0) {
      return
    }

    const intervalId = window.setInterval(() => {
      setCooldownRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(intervalId)
          return 0
        }

        return current - 1
      })
    }, 1000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [cooldownRemaining])

  async function handleResend() {
    if (cooldownRemaining > 0) {
      return
    }

    try {
      setSubmitting(true)
      setError('')
      setSuccess('')

      const response = await fetch('/api/setup/pending-activation', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
      })

      const payload = (await response.json().catch(() => null)) as
        | { invite?: PendingInvite; error?: string }
        | null

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Impossible de renvoyer l\'email')
      }

      if (payload?.invite) {
        setInvite(payload.invite)
      }

      setSuccess('Email d\'activation renvoye.')
      setCooldownRemaining(RESEND_COOLDOWN_SECONDS)
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : 'Impossible de renvoyer l\'email')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="relative flex flex-1 items-center overflow-hidden px-4 py-10 sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.15),_transparent_42%),radial-gradient(circle_at_bottom_right,_rgba(59,130,246,0.14),_transparent_38%)]" />

      <section className="relative mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-xl lg:grid-cols-[1.1fr_0.9fr]">
        <div className="relative bg-slate-900 p-7 text-white sm:p-10">
          {welcome.imageUrl ? (
            <Image
              src={welcome.imageUrl}
              alt="Visuel du clan"
              fill
              sizes="(min-width: 1024px) 55vw, 100vw"
              unoptimized
              className="absolute inset-0 h-full w-full object-cover opacity-35"
            />
          ) : null}
          <div className="absolute inset-0 bg-slate-900/72" />
          <div className="pointer-events-none absolute -left-10 top-14 h-40 w-40 rounded-full bg-amber-400/30 blur-2xl" />
          <div className="pointer-events-none absolute -right-14 bottom-8 h-52 w-52 rounded-full bg-sky-500/30 blur-2xl" />

          <p className="relative z-10 inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em]">
            {welcome.badge}
          </p>
          <h1 className="relative z-10 mt-4 text-3xl font-black leading-tight sm:text-4xl">{welcome.title}</h1>
          <p className="relative z-10 mt-4 max-w-md text-sm text-slate-200">{welcome.message}</p>

          {clanLabel ? (
            <p className="relative z-10 mt-6 inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold text-slate-100">
              {clanLabel}
            </p>
          ) : null}
        </div>

        <div className="p-7 sm:p-10">
          <h2 className="text-2xl font-black text-slate-900">Activation en attente</h2>
          <p className="mt-2 text-sm text-slate-600">
            Le clan a bien ete initialise. L&apos;Owner doit ouvrir le lien recu par email pour definir son mot de passe et activer son compte.
          </p>

          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Email cible</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {invite?.email ?? 'Adresse email indisponible'}
            </p>
            {invite?.displayName ? (
              <p className="mt-1 text-xs text-slate-600">Compte Owner associe: {invite.displayName}</p>
            ) : null}
            {invite?.expiresAt ? (
              <p className="mt-1 text-xs text-slate-600">
                Lien actif jusqu&apos;au {new Date(invite.expiresAt).toLocaleString('fr-FR')}
              </p>
            ) : null}
          </div>

          {loading ? <p className="mt-4 text-sm text-slate-500">Chargement des informations...</p> : null}
          {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}
          {success ? <p className="mt-4 text-sm text-emerald-700">{success}</p> : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleResend()}
              disabled={submitting || loading || !invite?.email || cooldownRemaining > 0}
              className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting
                ? 'Renvoi...'
                : cooldownRemaining > 0
                  ? `Renvoyer dans ${cooldownRemaining}s`
                  : 'Renvoyer l\'email'}
            </button>
          </div>

          {cooldownRemaining > 0 ? (
            <p className="mt-3 text-xs text-slate-500">
              Un nouvel envoi sera possible dans {cooldownRemaining} seconde{cooldownRemaining > 1 ? 's' : ''}.
            </p>
          ) : null}

          <p className="mt-5 text-xs text-slate-500">
            L&apos;acces a l&apos;application restera bloque tant que le lien d&apos;activation du mail n&apos;aura pas ete utilise.
          </p>
        </div>
      </section>
    </main>
  )
}
