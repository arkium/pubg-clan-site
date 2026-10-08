'use client'

/* eslint-disable @next/next/no-img-element */

import { AlertCircle, CheckCircle2, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

import { toneStyle, type Tone } from '@/components/ui/CharteKit'

/**
 * Pages d'accès (connexion, adhésion, mot de passe oublié, activation) selon la charte UI (docs/ui/index.html,
 * « Modales » et « Contrôles ») : page plein écran sans le shell, carte en deux colonnes — visuel sombre sur photo à
 * gauche, formulaire à droite (champs `app-input`, intitulés `t-label`, un seul bouton principal).
 */

export function AuthPage({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <main className={`charte game-ui relative flex min-h-screen flex-1 flex-col items-center justify-center px-4 py-8 sm:px-6 ${className}`.trim()}>
      {children}
    </main>
  )
}

export function AuthCard({ visual, children, wide = false }: { visual: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <section
      className={`app-panel relative mx-auto grid w-full overflow-hidden p-0 ${wide ? 'max-w-6xl lg:grid-cols-[0.9fr_1.1fr]' : 'max-w-5xl lg:grid-cols-[1.1fr_0.9fr]'}`}
    >
      {visual}
      <div className="flex flex-col gap-6 p-6 sm:p-10">{children}</div>
    </section>
  )
}

/**
 * Colonne visuelle : photo assombrie (image de repli par `onImageError`), en-tête libre (logo), sur-titre en pastille,
 * titre Teko, texte, pastille facultative (clan), puis un contenu libre en bas.
 */
export function AuthVisual({
  image,
  imagePosition = 'center 35%',
  onImageError,
  header,
  kicker,
  title,
  text,
  pill,
  children,
}: {
  image: string
  imagePosition?: string
  onImageError?: () => void
  header?: ReactNode
  kicker?: ReactNode
  title: ReactNode
  text: ReactNode
  pill?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="app-on-photo relative flex flex-col justify-between gap-8 overflow-hidden bg-slate-950 p-7 text-white sm:p-10">
      <img
        src={image}
        onError={onImageError}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-60"
        style={{ objectPosition: imagePosition }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/65 to-black/30" aria-hidden="true" />
      <div className="relative z-10 flex flex-col gap-3">
        {header}
        {kicker ? (
          <span className="max-w-full self-start rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[var(--theme-ui-accent)] sm:tracking-[0.18em]">
            {kicker}
          </span>
        ) : null}
        <h1 className="t-banner-title m-0 text-white drop-shadow-md">{title}</h1>
        <p className="m-0 max-w-md text-sm text-white/85">{text}</p>
        {pill ? <span className="self-start rounded-full border border-white/25 bg-white/15 px-3 py-1 text-xs font-semibold text-white">{pill}</span> : null}
      </div>
      {children ? <div className="relative z-10">{children}</div> : null}
    </div>
  )
}

export type AuthHighlight = { icon: LucideIcon; tone: Tone; title: string; text: string }

/** Atouts du site en bas du visuel : tuile d'icône aux jetons de jeu, intitulé, phrase. */
export function AuthHighlights({ items }: { items: AuthHighlight[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-3 border-t border-white/15 p-0 pt-6 text-xs text-white/85">
      {items.map((item) => {
        const Icon = item.icon
        return (
          <li key={item.title} className="flex items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] border" style={toneStyle(item.tone)} aria-hidden="true">
              <Icon className="h-4 w-4" />
            </span>
            <span>
              <b className="text-white">{item.title} :</b> {item.text}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/** Petit guide « première visite » d'une page d'accès : points colorés aux jetons de jeu. */
export function AuthGuide({ icon: Icon, title, items }: { icon: LucideIcon; title: string; items: Array<{ tone: Tone; title: string; body: ReactNode }> }) {
  return (
    <div className="app-panel-muted flex flex-col gap-2 px-3.5 py-3">
      <span className="t-body flex items-center gap-2 font-semibold text-gray-900">
        <Icon className="h-4 w-4" style={{ color: 'var(--game-pos)' }} aria-hidden="true" />
        {title}
      </span>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {items.map((item) => (
          <li key={item.title} className="t-meta flex items-start gap-2">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: `var(--game-${item.tone})` }} aria-hidden="true" />
            <span>
              <b className="text-gray-900">{item.title} :</b> {item.body}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Message d'un formulaire d'accès : erreur (jeton négatif) ou succès (jeton positif), avec un détail facultatif. */
export function AuthAlert({ tone, title, children }: { tone: 'neg' | 'pos'; title: ReactNode; children?: ReactNode }) {
  const Icon = tone === 'neg' ? AlertCircle : CheckCircle2
  return (
    <div
      className="app-panel-muted flex items-start gap-2.5 px-3.5 py-3"
      style={{ borderColor: `color-mix(in srgb, var(--game-${tone}) 45%, transparent)`, backgroundColor: `var(--game-${tone}-soft)` }}
      role={tone === 'neg' ? 'alert' : 'status'}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: `var(--game-${tone})` }} aria-hidden="true" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <b className="t-body" style={{ color: `var(--game-${tone})` }}>
          {title}
        </b>
        {children ? <span className="t-meta">{children}</span> : null}
      </span>
    </div>
  )
}

/** Intitulé d'un champ, astérisque au jeton négatif pour un champ obligatoire. */
export function FieldLabel({ children, required = false }: { children: ReactNode; required?: boolean }) {
  return (
    <span className="t-label">
      {children}
      {required ? <span style={{ color: 'var(--game-neg)' }}> *</span> : null}
    </span>
  )
}
