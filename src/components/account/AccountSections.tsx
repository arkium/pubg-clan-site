'use client'

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { AlertTriangle, Bell, CheckCircle2, KeyRound, LayoutDashboard, RefreshCw, UserCircle, UserRound, X, type LucideIcon } from 'lucide-react'
import { useId, type ReactNode } from 'react'

/**
 * Blocs de la page « Mon compte » (/account), selon la charte UI (docs/ui/index.html) : bandeau photo à titre Teko,
 * panneaux `app-panel`, champs de formulaire de la charte, tuiles d'avatar teintées à l'accent, couleurs par jetons.
 * Composants de présentation seulement : l'état, la validation et les appels API restent dans la page.
 */

/** Champ texte de la charte — même gabarit que `NumberField` des réglages de la ligue : 36 px, focus accent. */
const INPUT =
  'h-9 w-full min-w-0 rounded-[10px] border border-gray-200 bg-white px-3 text-[13px] font-medium text-gray-900 outline-none transition focus:border-[var(--theme-ui-accent-ring)] focus:ring-2 focus:ring-[var(--theme-ui-accent-soft)] aria-[invalid=true]:border-[var(--theme-ui-negative)]'

export type AvatarSuggestion = {
  id: string
  label: string
  url: string
  fallbackUrl: string
}

export type LinkedMember = {
  memberId: number
  displayName: string
  pubgPlayerName: string
  platformShard: string
}

/** Tuile lucide teintée à l'accent (au lieu d'un emoji), comme les cartes des awards. */
function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span
      className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-[var(--theme-ui-accent-soft)] shadow-[inset_0_0_0_1px_var(--theme-ui-accent-ring)]"
      aria-hidden="true"
    >
      <Icon className="h-[18px] w-[18px] text-[var(--theme-ui-accent-text)]" />
    </span>
  )
}

export function AccountBanner({ dashboardHref }: { dashboardHref: string }) {
  return (
    // Hauteur du bandeau inchangée : seul son contenu suit la charte (titre Teko, icône à l'accent sur la photo).
    <header
      className="app-on-photo bg-hero-fallback relative min-h-[10rem] overflow-hidden rounded-[14px] bg-cover bg-no-repeat sm:min-h-[13rem]"
      style={{ backgroundImage: `url('/account.jpg')`, backgroundPosition: 'center top' }}
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
      <Link
        href={dashboardHref}
        className="absolute right-2 top-2 z-10 inline-flex items-center gap-1.5 rounded-lg border border-white/30 bg-black/50 px-2.5 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur-md transition-colors hover:bg-black/70 sm:right-4 sm:top-4 sm:px-3 sm:py-1.5 sm:text-sm"
      >
        <LayoutDashboard className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Tableau de bord
      </Link>
      <div className="absolute inset-x-0 bottom-0 z-10 px-3 py-2.5 sm:px-5 sm:py-4">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <UserCircle className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />
          <h1 className="t-banner-title text-white drop-shadow-md">Mon compte</h1>
        </div>
        <p className="mt-1 text-[11px] font-medium text-slate-200 drop-shadow-md sm:mt-2 sm:text-[13px]">
          Modifie ton email, ton pseudo d’affichage, ton avatar et ton mot de passe.
        </p>
      </div>
    </header>
  )
}

/** Panneau de section : tuile, titre de section et méta, puis le contenu. */
export function AccountCard({
  id,
  icon,
  title,
  meta,
  testId,
  children,
}: {
  id: string
  icon: LucideIcon
  title: string
  meta: string
  testId?: string
  children: ReactNode
}) {
  return (
    <section className="app-panel flex flex-col gap-4 p-4 sm:p-5" aria-labelledby={id} data-testid={testId}>
      <div className="flex items-start gap-3">
        <IconTile icon={icon} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={id} className="t-section-title">
            {title}
          </h2>
          <p className="t-meta">{meta}</p>
        </div>
      </div>
      {children}
    </section>
  )
}

/** Champ de formulaire de la charte : intitulé au-dessus, champ de 36 px pleine largeur. */
export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  required,
  minLength,
  maxLength,
  placeholder,
  autoComplete,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'email' | 'url' | 'password'
  required?: boolean
  minLength?: number
  maxLength?: number
  placeholder?: string
  autoComplete?: string
}) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-1">
      <span className="text-[13px] font-semibold text-gray-700">{label}</span>
      <input
        id={id}
        type={type}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={INPUT}
      />
    </label>
  )
}

/** Retour d'un formulaire, à côté de son bouton : erreur au jeton négatif, succès en `t-pos`. */
export function FormStatus({ error, success }: { error: string; success: string }) {
  return (
    <>
      {error ? (
        <p role="alert" className="flex items-start gap-1.5 text-[13px] font-semibold text-[var(--theme-ui-negative)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="t-pos flex items-start gap-1.5 text-[13px] font-semibold">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {success}
        </p>
      ) : null}
    </>
  )
}

/** Avatar : aperçu, URL saisie à la main et série d'avatars proposés (tuile choisie teintée à l'accent). */
export function AvatarPicker({
  avatarUrl,
  onAvatarUrlChange,
  suggestions,
  failedIds,
  onSuggestionError,
  onRegenerate,
}: {
  avatarUrl: string
  onAvatarUrlChange: (url: string) => void
  suggestions: AvatarSuggestion[]
  failedIds: Record<string, boolean>
  onSuggestionError: (id: string) => void
  onRegenerate: () => void
}) {
  const suggestionsLabelId = useId()
  const current = avatarUrl.trim()

  return (
    <div className="app-panel-muted flex flex-col gap-3 p-3" data-testid="account-avatar">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full border border-gray-200 bg-white">
            {current ? (
              <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              <UserRound className="h-6 w-6 text-gray-500" aria-hidden="true" />
            )}
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="t-label">Avatar</span>
            <span className="t-meta">{current ? 'Aperçu de l’avatar choisi.' : 'Aucun avatar choisi.'}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onRegenerate} className="app-btn app-btn--xs app-btn--secondary gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Régénérer la série
          </button>
          <button type="button" onClick={() => onAvatarUrlChange('')} className="app-btn app-btn--xs app-btn--secondary gap-1.5">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Retirer l’avatar
          </button>
        </div>
      </div>

      <TextField label="URL de l’avatar" type="url" value={avatarUrl} onChange={onAvatarUrlChange} placeholder="https://..." autoComplete="url" />

      <div className="flex flex-col gap-2">
        <span id={suggestionsLabelId} className="t-label">
          Avatars proposés
        </span>
        <div role="group" aria-labelledby={suggestionsLabelId} className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {suggestions.map((suggestion) => {
            const resolvedUrl = failedIds[suggestion.id] ? suggestion.fallbackUrl : suggestion.url
            const selected = current === resolvedUrl

            return (
              <button
                key={suggestion.id}
                type="button"
                onClick={() => onAvatarUrlChange(resolvedUrl)}
                aria-pressed={selected}
                title={`Choisir ${suggestion.label}`}
                className={`flex w-full items-center justify-center rounded-[10px] border p-1 outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--theme-ui-accent-ring)] ${
                  selected
                    ? 'border-[var(--theme-ui-accent-ring)] bg-[var(--theme-ui-accent-soft)] shadow-[inset_0_0_0_1px_var(--theme-ui-accent-ring)]'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <img
                  src={resolvedUrl}
                  alt={`Avatar ${suggestion.label}`}
                  className="block h-10 w-10 rounded-[6px] object-cover"
                  onError={() => onSuggestionError(suggestion.id)}
                />
              </button>
            )
          })}
        </div>
        {Object.keys(failedIds).length > 0 ? (
          <p className="t-meta">Certains avatars externes sont indisponibles : un avatar local les remplace automatiquement.</p>
        ) : null}
      </div>
    </div>
  )
}

/** Membres PUBG liés au compte, en lecture seule, avec le lien vers leurs notifications. */
export function LinkedMembersList({ members }: { members: LinkedMember[] }) {
  if (members.length === 0) {
    return <p className="t-body text-gray-500">Aucun membre actif lié.</p>
  }

  return (
    <ul className="flex flex-col gap-2">
      {members.map((member) => (
        <li key={member.memberId} className="app-panel-muted flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-3 py-2.5">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[13px] font-semibold text-gray-900">{member.displayName}</span>
            <span className="t-meta break-words">
              PUBG : {member.pubgPlayerName} ({member.platformShard})
            </span>
          </div>
          <Link href={`/members/${member.memberId}/notifications`} className="app-link inline-flex items-center gap-1 text-[13px] font-semibold">
            <Bell className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Notifications
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Confirmation avant de changer le mot de passe (modale de la charte : voile `app-modal-backdrop`, carte `app-panel`). */
export function PasswordConfirmDialog({
  saving,
  onCancel,
  onConfirm,
}: {
  saving: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="app-modal-backdrop fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-password-confirm-title"
      aria-describedby="account-password-confirm-text"
      data-testid="account-password-confirm"
    >
      <div className="app-panel w-full max-w-md p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <IconTile icon={KeyRound} />
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id="account-password-confirm-title" className="t-section-title">
              Confirmer la mise à jour
            </h2>
            <p id="account-password-confirm-text" className="t-body text-gray-700">
              Veux-tu vraiment changer ton mot de passe maintenant ?
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={saving} className="app-btn app-btn--md app-btn--secondary">
            Annuler
          </button>
          <button type="button" onClick={onConfirm} disabled={saving} className="app-btn app-btn--md app-btn--primary">
            {saving ? 'Mise à jour…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  )
}
