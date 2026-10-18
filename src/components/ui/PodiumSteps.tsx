import { Crown, Trophy } from 'lucide-react'
import type { ReactNode } from 'react'

import { clanBackgroundImage } from '@/lib/clan-image'

/**
 * Podium en marches 2-1-3 (signature §0b de la charte, toujours sur fond sombre `.app-on-photo`) : couronne en or de jeu
 * sur le premier, tampon « Winner winner chicken dinner », chiffres des marches en Teko. Né dans la Ligue inter-clans
 * (docs/features/ligue-clans.md), partagé avec la page d'un tournoi depuis le 2026-10-11 (docs/features/tournois.md).
 * Le contenu de chaque marche (logo, nom, lien) vient de la page ; le composant ne fait que la mise en scène.
 */

/** Marches argent / or / bronze, dans l'ordre d'affichage (2e, 1er, 3e) : couleurs fixes, comme sur une photo. */
const STEPS = [
  { ring: 'rgba(203,213,225,.55)', gradient: 'linear-gradient(180deg, rgba(148,163,184,.25), rgba(148,163,184,.75))', height: 'h-[70px] sm:h-[110px]', number: 'rgba(255,255,255,.55)' },
  { ring: 'rgba(251,191,36,.7)', gradient: 'linear-gradient(180deg, rgba(146,64,14,.35), #d97706)', height: 'h-[100px] sm:h-[150px]', number: 'rgba(28,16,3,.45)' },
  { ring: 'rgba(234,88,12,.55)', gradient: 'linear-gradient(180deg, rgba(124,45,18,.3), #9a3412)', height: 'h-[52px] sm:h-[80px]', number: 'rgba(255,255,255,.55)' },
]

/** Métal de la plaque de score, dans l'ordre d'affichage des marches (2e, 1er, 3e). */
const PLATES = ['podium-plate--silver', 'podium-plate--gold podium-plate--lead', 'podium-plate--bronze']

export type PodiumStepEntry = {
  key: string
  /** Rang affiché sur la marche (1 à 3 ; deux ex æquo peuvent partager un rang). */
  position: number
  /** Logo et nom (lien éventuel). */
  identity: ReactNode
  /** Petite ligne sous le nom : tag du clan, composition… */
  caption?: ReactNode
  /** Valeur de la pastille sombre (« 144 pts »). */
  value: ReactNode
  /** Ligne facultative sous la pastille (« 66 kills · 2 Top 1 »). */
  detail?: ReactNode
  id?: string
  testId?: string
}

export default function PodiumSteps({
  ariaLabel,
  title,
  entries,
  stamp = 'Winner winner chicken dinner',
  emphasis = false,
}: {
  ariaLabel: string
  /** Intitulé en petites capitales en haut à gauche (« Podium · Power score »). */
  title: ReactNode
  /** Les trois premiers, dans l'ordre du classement. */
  entries: PodiumStepEntry[]
  /** Tampon en haut à droite ; `null` : pas de tampon (page Joueurs, demande du 2026-10-18). */
  stamp?: string | null
  /**
   * Données plus visibles (tournois, demande du 2026-10-11) : tag plus clair, valeur sur une plaque de score biseautée
   * au métal de la marche (or avec halo pour le premier, argent, bronze — `.podium-plate`, globals.css), détail plus
   * grand et jamais coupé. La page fournit le contenu de la plaque (`.podium-plate__value`, `.podium-plate__unit`).
   */
  emphasis?: boolean
}) {
  const order = [entries[1], entries[0], entries[2]]
  return (
    <section
      aria-label={ariaLabel}
      className="app-on-photo relative flex min-w-0 flex-col gap-2.5 overflow-hidden rounded-[14px] border border-gray-200 bg-gradient-to-b from-slate-900 to-slate-950 px-2.5 pt-3.5 text-slate-100 sm:px-5 sm:pt-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        <span className="min-w-0 truncate text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-400">{title}</span>
        {stamp ? <span className="app-stamp app-stamp--sm">{stamp}</span> : null}
      </div>
      <ol className="grid grid-cols-3 items-end gap-2 sm:gap-4">
        {order.map((entry, index) =>
          entry ? (
            <li key={entry.key} id={entry.id} className="flex min-w-0 scroll-mt-[160px] flex-col items-center gap-1.5" style={{ order: index }} data-testid={entry.testId}>
              {entry.position === 1 ? <Crown className="h-6 w-6 text-[var(--game-gold)]" aria-label="Premier" /> : null}
              {entry.identity}
              {entry.caption ? (
                <span className={`max-w-full truncate font-mono ${emphasis ? 'text-[13px] font-bold text-slate-200' : 'text-xs text-slate-400'}`}>
                  {entry.caption}
                </span>
              ) : null}
              {emphasis ? (
                // Halo sur une enveloppe : `clip-path` couperait l'ombre portée de la plaque elle-même.
                <span className={index === 1 ? 'podium-plate-glow' : ''}>
                  <span className={`podium-plate ${PLATES[index]}`}>{entry.value}</span>
                </span>
              ) : (
                <span className="t-num whitespace-nowrap rounded-full bg-slate-950 px-2.5 py-0.5 text-xs font-extrabold">{entry.value}</span>
              )}
              {entry.detail ? (
                <span
                  className={
                    emphasis
                      ? 'max-w-full text-center text-xs font-semibold text-slate-200 sm:text-[13px]'
                      : 'max-w-full truncate text-center text-[11px] text-slate-400'
                  }
                >
                  {entry.detail}
                </span>
              ) : null}
              <span
                className={`relative flex w-full justify-center overflow-hidden rounded-t-xl rounded-b-sm border pt-2.5 ${STEPS[index].height}`}
                style={{ background: STEPS[index].gradient, borderColor: STEPS[index].ring }}
                aria-hidden="true"
              >
                {/* Chiffre des marches en Teko (charte, section « Ligue inter-clans »). */}
                <span className="t-hero text-[38px] sm:text-[56px]" style={{ color: STEPS[index].number }}>{entry.position}</span>
                <span className="absolute inset-x-0 bottom-0 h-2.5 bg-[repeating-linear-gradient(90deg,rgba(0,0,0,.18)_0_8px,transparent_8px_16px)]" />
              </span>
            </li>
          ) : (
            <li key={`empty-${index}`} style={{ order: index }} />
          )
        )}
      </ol>
    </section>
  )
}

/**
 * Titre de podium mis en évidence (pages Joueurs et Ligue, demande du 2026-10-18) : coupe et critère en or de jeu,
 * « Podium » en blanc, plus grand que l'intitulé par défaut. À passer dans `title`.
 */
export function PodiumTitle({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[12px] tracking-[0.1em] sm:text-[14px]">
      <Trophy className="h-4 w-4 shrink-0 text-[var(--game-gold)] sm:h-[18px] sm:w-[18px]" aria-hidden="true" />
      <span className="text-white">Podium</span>
      <span className="text-[var(--game-gold)]">· {label}</span>
    </span>
  )
}

/** Contenu de la plaque de score (`emphasis`) : la valeur en Teko, puis l'unité en petites capitales (« 144 PTS »). */
export function PodiumPlate({ value, unit }: { value: ReactNode; unit: string }) {
  return (
    <>
      <b className="t-hero podium-plate__value">{value}</b> <span className="podium-plate__unit">{unit}</span>
    </>
  )
}

/**
 * Ligne sous la plaque : « 59 kills · 1 Top 1 », « 52 parties · 10 Top 1 ». Chiffres en blanc, Top 1 en or s'il y en a ;
 * sur mobile (colonnes de ~110 px), l'un sous l'autre plutôt que coupés.
 */
export function PodiumStats({ count, label, wins }: { count: ReactNode; label: string; wins: number }) {
  return (
    <span className="flex flex-col items-center sm:flex-row sm:gap-1.5">
      <span className="whitespace-nowrap">
        <b className="text-white">{count}</b> {label}
      </span>
      <span className="max-sm:hidden" aria-hidden="true">
        ·
      </span>{' '}
      <span className="whitespace-nowrap">
        <b className={wins > 0 ? 'text-[var(--game-gold)]' : 'text-white'}>{wins}</b> Top 1
      </span>
    </span>
  )
}

/** Logo d'un clan (photo) sur fond sombre fixe, dans les deux thèmes : podiums, classements de la ligue. */
export function ClanLogo({ imageUrl, size, className = '' }: { imageUrl: string | null; size: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block shrink-0 bg-slate-950 bg-cover bg-center ${className}`}
      style={{ width: size, height: size, backgroundImage: clanBackgroundImage(imageUrl) }}
    />
  )
}
