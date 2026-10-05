'use client'

import Link from 'next/link'
import { Check, CircleCheck, EyeOff, LoaderCircle, MessageSquare, Pencil, Send, Trash2, type LucideIcon } from 'lucide-react'
import { useId, useRef, useState, type FormEvent } from 'react'

import {
  PRIVACY_REQUEST_HONEYPOT,
  PRIVACY_REQUEST_KIND_LABELS,
  PRIVACY_REQUEST_LIMITS,
  validatePrivacyRequest,
  type PrivacyRequestField,
  type PrivacyRequestFieldErrors,
  type PrivacyRequestKind,
} from '@/lib/legal/privacy-request'

/**
 * Formulaire « Retirer mes données » (maquette « Pages légales », 1a) — docs/features/pages-legales.md. Même validation
 * que la route (`validatePrivacyRequest`) ; la demande est enregistrée puis traitée à la main par un SuperUser.
 */

const KINDS: Array<{ value: PrivacyRequestKind; icon: LucideIcon; text: string }> = [
  { value: 'hide', icon: EyeOff, text: 'Ton pseudo disparaît des classements et pages publiques.' },
  { value: 'purge', icon: Trash2, text: 'Matchs, stats et télémétrie supprimés de la base.' },
  { value: 'correct', icon: Pencil, text: 'Pseudo, clan ou rattachement erroné.' },
  { value: 'other', icon: MessageSquare, text: 'Accès à tes données, question.' },
]

const ERROR = 'm-0 text-[12px] font-semibold text-[var(--theme-ui-negative)]'
const FOCUS_RING =
  'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--theme-ui-accent-ring)]'
// Ordre du formulaire : le focus va au premier champ en erreur.
const FIELD_ORDER: PrivacyRequestField[] = ['pubgName', 'kind', 'reason', 'email', 'confirmOwner']

type Status =
  | { state: 'idle' }
  | { state: 'sending' }
  | { state: 'sent'; id: number | null; email: string }
  | { state: 'failed'; message: string }

export default function PrivacyRequestForm() {
  const [pubgName, setPubgName] = useState('')
  const [kind, setKind] = useState<PrivacyRequestKind>('hide')
  const [reason, setReason] = useState('')
  const [email, setEmail] = useState('')
  const [confirmOwner, setConfirmOwner] = useState(false)
  const [errors, setErrors] = useState<PrivacyRequestFieldErrors>({})
  const [status, setStatus] = useState<Status>({ state: 'idle' })
  const formRef = useRef<HTMLFormElement>(null)
  const id = useId()

  function clearError(field: PrivacyRequestField) {
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
  }

  function showErrors(fieldErrors: PrivacyRequestFieldErrors) {
    setErrors(fieldErrors)
    const first = FIELD_ORDER.find((field) => fieldErrors[field])
    if (first) formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus()
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (status.state === 'sending') return

    const trap = new FormData(event.currentTarget).get(PRIVACY_REQUEST_HONEYPOT)
    const payload = { pubgName, kind, reason, email, confirmOwner, [PRIVACY_REQUEST_HONEYPOT]: typeof trap === 'string' ? trap : '' }
    const validation = validatePrivacyRequest(payload)
    if (!validation.ok) {
      showErrors(validation.fieldErrors)
      return
    }

    setErrors({})
    setStatus({ state: 'sending' })
    try {
      const response = await fetch('/api/privacy-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = (await response.json().catch(() => ({}))) as { id?: number | null; error?: string; fieldErrors?: PrivacyRequestFieldErrors }
      if (response.ok) {
        setStatus({ state: 'sent', id: body.id ?? null, email: validation.data.email })
        return
      }
      if (body.fieldErrors) showErrors(body.fieldErrors)
      setStatus({ state: 'failed', message: body.error ?? 'La demande n’a pas pu être envoyée. Réessaie plus tard.' })
    } catch {
      setStatus({ state: 'failed', message: 'Connexion impossible. Vérifie ton réseau et réessaie.' })
    }
  }

  if (status.state === 'sent') {
    return (
      <div role="status" className="app-panel flex flex-col items-start gap-3 p-4 sm:p-5" data-testid="privacy-request-sent">
        <div className="flex items-center gap-2">
          <CircleCheck className="h-5 w-5 shrink-0 text-[var(--theme-ui-positive)]" aria-hidden="true" />
          <h2 className="t-section-title m-0">Demande envoyée{status.id ? ` · n° ${status.id}` : ''}</h2>
        </div>
        <p className="t-body m-0 max-w-[42rem] text-gray-700">
          On te répond à <b className="text-gray-900">{status.email}</b> sous un mois au plus. Garde ce numéro pour toute
          question sur ta demande.
        </p>
        <Link href="/confidentialite" className="app-link t-body">
          Retour à la confidentialité
        </Link>
      </div>
    )
  }

  const describedBy = (field: PrivacyRequestField, hint?: string) =>
    [hint, errors[field] ? `${id}-${field}-error` : null].filter(Boolean).join(' ') || undefined
  const sending = status.state === 'sending'

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="app-panel flex flex-col gap-4 p-4 sm:p-5" aria-busy={sending}>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-pubgName`} className="t-label">
          Pseudo PUBG (IGN)
        </label>
        <input
          id={`${id}-pubgName`}
          data-field="pubgName"
          className="app-input"
          value={pubgName}
          onChange={(event) => {
            setPubgName(event.target.value)
            clearError('pubgName')
          }}
          maxLength={PRIVACY_REQUEST_LIMITS.pubgName}
          autoComplete="off"
          spellCheck={false}
          placeholder="ex. Arkium_FR"
          aria-invalid={errors.pubgName ? true : undefined}
          aria-describedby={describedBy('pubgName', `${id}-pubgName-hint`)}
        />
        <p id={`${id}-pubgName-hint`} className="t-meta m-0">
          Tel qu’il apparaît en jeu, sensible à la casse.
        </p>
        {errors.pubgName ? (
          <p id={`${id}-pubgName-error`} className={ERROR}>
            {errors.pubgName}
          </p>
        ) : null}
      </div>

      <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
        <legend className="t-label mb-1.5 p-0">Type de demande</legend>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {KINDS.map(({ value, icon: Icon, text }) => {
            const checked = kind === value
            return (
              <label
                key={value}
                className={`flex cursor-pointer items-start gap-2.5 rounded-[10px] border px-3 py-2.5 transition-colors ${FOCUS_RING} ${
                  checked
                    ? 'border-[var(--theme-ui-accent-ring)] bg-[var(--theme-ui-accent-soft)] shadow-[inset_0_0_0_1px_var(--theme-ui-accent-ring)]'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="kind"
                  value={value}
                  checked={checked}
                  onChange={() => {
                    setKind(value)
                    clearError('kind')
                  }}
                  className="sr-only"
                  data-field={value === kind ? 'kind' : undefined}
                />
                <Icon
                  className={`mt-0.5 h-4 w-4 shrink-0 ${checked ? 'text-[var(--theme-ui-accent-text)]' : 'text-gray-500'}`}
                  aria-hidden="true"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className={`t-body font-bold ${checked ? 'text-[var(--theme-ui-accent-text)]' : 'text-gray-900'}`}>
                    {PRIVACY_REQUEST_KIND_LABELS[value]}
                  </span>
                  <span className="t-meta">{text}</span>
                </span>
              </label>
            )
          })}
        </div>
        {errors.kind ? <p className={ERROR}>{errors.kind}</p> : null}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-reason`} className="t-label">
          Motif <span className="normal-case tracking-normal">(facultatif)</span>
        </label>
        <textarea
          id={`${id}-reason`}
          data-field="reason"
          className="app-input min-h-24 resize-y"
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
            clearError('reason')
          }}
          maxLength={PRIVACY_REQUEST_LIMITS.reason}
          placeholder="Précise ce que tu veux masquer ou corriger."
          aria-invalid={errors.reason ? true : undefined}
          aria-describedby={describedBy('reason')}
        />
        {errors.reason ? (
          <p id={`${id}-reason-error`} className={ERROR}>
            {errors.reason}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-email`} className="t-label">
          E-mail de contact
        </label>
        <input
          id={`${id}-email`}
          data-field="email"
          type="email"
          className="app-input"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            clearError('email')
          }}
          maxLength={PRIVACY_REQUEST_LIMITS.email}
          autoComplete="email"
          placeholder="toi@exemple.fr"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={describedBy('email', `${id}-email-hint`)}
        />
        <p id={`${id}-email-hint`} className="t-meta m-0">
          Utilisée uniquement pour te répondre.
        </p>
        {errors.email ? (
          <p id={`${id}-email-error`} className={ERROR}>
            {errors.email}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className={`flex min-h-9 cursor-pointer items-center gap-2.5 self-start rounded-[8px] pr-1.5 ${FOCUS_RING}`}>
          <input
            type="checkbox"
            data-field="confirmOwner"
            checked={confirmOwner}
            onChange={(event) => {
              setConfirmOwner(event.target.checked)
              clearError('confirmOwner')
            }}
            className="sr-only"
            aria-invalid={errors.confirmOwner ? true : undefined}
            aria-describedby={describedBy('confirmOwner')}
          />
          <span
            className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] ${
              confirmOwner
                ? 'bg-[var(--theme-ui-accent)] text-[#1c1003]'
                : errors.confirmOwner
                  ? 'border-[1.5px] border-[var(--theme-ui-negative)] bg-white'
                  : 'border-[1.5px] border-gray-300 bg-white'
            }`}
            aria-hidden="true"
          >
            {confirmOwner ? <Check className="h-3 w-3" strokeWidth={3.5} /> : null}
          </span>
          <span className="t-body text-gray-900">Je confirme être le titulaire de ce compte PUBG.</span>
        </label>
        {errors.confirmOwner ? (
          <p id={`${id}-confirmOwner-error`} className={ERROR}>
            {errors.confirmOwner}
          </p>
        ) : null}
      </div>

      {/* Champ piège : invisible et hors tabulation, seul un robot le remplit. */}
      <div aria-hidden="true" className="pointer-events-none absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor={`${id}-trap`}>Ne pas remplir</label>
        <input id={`${id}-trap`} name={PRIVACY_REQUEST_HONEYPOT} type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-200 pt-4">
        <button type="submit" className="app-btn app-btn--primary app-btn--md gap-1.5" disabled={sending}>
          {sending ? (
            <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
          Envoyer la demande
        </button>
        <span className="t-meta">Réponse sous un mois au plus.</span>
      </div>
      {status.state === 'failed' ? (
        <p role="alert" className={ERROR}>
          {status.message}
        </p>
      ) : null}
    </form>
  )
}
