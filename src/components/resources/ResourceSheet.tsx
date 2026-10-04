'use client'

import { AlertTriangle, Check, CheckCircle2, Eye, Flag, Hourglass, LogIn, RefreshCw, Trash2, X, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { FAMILY_ICONS, KIND_ICONS } from '@/components/resources/resource-icons'
import type { ObservedSpotView, ResourcePointView } from '@/lib/resources/resource-api'
import {
  OBSERVED_FAMILY_SINGULAR,
  confirmationLine,
  contributorCountLabel,
  observationLine,
  pendingLine,
  pointKindLabel,
  sharePercent,
} from '@/lib/resources/resource-view'

/**
 * Fiche d'un point (remplace le panneau de droite) : saisi validé, à confirmer, en attente (le sien : « Annuler ma
 * proposition »), ou emplacement observé. Un emplacement observé est calculé à partir des parties : il ne se signale
 * pas. Visiteur : « Toujours là » et « Signaler un problème » mènent à la connexion.
 */

export const RESOURCE_LOGIN_HREF = '/login?redirect=/carte-des-ressources'

type Tone = 'pos' | 'warn' | 'neutral'

const CHIP_TONE: Record<Tone, string> = {
  pos: 'bg-[var(--game-pos-soft)] text-[var(--game-pos)]',
  warn: 'bg-[var(--game-warn-soft)] text-[var(--game-warn)]',
  neutral: 'bg-[var(--theme-ui-surface-strong)] text-gray-700',
}

export function ResourceChip({ tone, icon: Icon, children, testId }: { tone: Tone; icon: LucideIcon; children: ReactNode; testId?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 self-start rounded-full px-2.5 py-1 text-xs font-bold ${CHIP_TONE[tone]}`} data-testid={testId}>
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {children}
    </span>
  )
}

function SheetHeader({
  tile,
  title,
  meta,
  onClose,
}: {
  tile: ReactNode
  title: string
  meta: string
  onClose: () => void
}) {
  return (
    <div className="flex items-start gap-3">
      {tile}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 id="resource-sheet-title" className="t-card-title">
          {title}
        </h2>
        <p className="t-meta">{meta}</p>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Fermer la fiche"
        className="-mr-1 -mt-1 shrink-0 rounded-[8px] p-1.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

function ErrorLine({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="flex items-start gap-1.5 text-[13px] font-semibold text-[var(--theme-ui-negative)]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {message}
    </p>
  )
}

type PointSheetProps = {
  point: ResourcePointView
  mapLabel: string
  signedIn: boolean
  confirming: boolean
  error: string | null
  onClose: () => void
  onConfirm: () => void
  onReport: () => void
  onCancelProposal: () => void
}

export function ResourcePointSheet({ point, mapLabel, signedIn, confirming, error, onClose, onConfirm, onReport, onCancelProposal }: PointSheetProps) {
  const Icon = KIND_ICONS[point.kind]
  const tileTone =
    point.state === 'to_confirm'
      ? 'bg-[var(--game-warn-soft)] text-[var(--game-warn)]'
      : point.state === 'pending'
        ? 'border-[1.5px] border-dashed border-gray-400 bg-[var(--theme-ui-surface-strong)] text-gray-900'
        : 'bg-[var(--theme-ui-surface-strong)] text-gray-900'
  const confirmation = confirmationLine(point)

  return (
    <section className="app-panel flex flex-col gap-4 p-4" aria-labelledby="resource-sheet-title" data-testid="resource-sheet" data-state={point.state}>
      <SheetHeader
        tile={
          <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-[10px] ${tileTone}`} aria-hidden="true">
            <Icon className="h-5 w-5" />
          </span>
        }
        title={pointKindLabel(point.kind)}
        meta={`${mapLabel} · grille ${point.grid}`}
        onClose={onClose}
      />

      {point.state === 'pending' ? (
        <>
          <ResourceChip tone="warn" icon={Hourglass} testId="sheet-chip">
            En attente de validation
          </ResourceChip>
          <p className="t-body text-gray-700">{pendingLine(point)}</p>
          {point.comment ? <p className="app-panel-muted t-body px-3 py-2 text-gray-700">« {point.comment} »</p> : null}
          <ErrorLine message={error} />
          {point.mine ? (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onCancelProposal} className="app-btn app-btn--md app-btn--danger gap-1.5">
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Annuler ma proposition
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          {point.state === 'to_confirm' ? (
            <ResourceChip tone="warn" icon={RefreshCw} testId="sheet-chip">
              À confirmer depuis la mise à jour PUBG
            </ResourceChip>
          ) : (
            <ResourceChip tone="pos" icon={CheckCircle2} testId="sheet-chip">
              Saisi et validé
            </ResourceChip>
          )}

          <ul className="flex flex-col gap-1.5 text-[13px] text-gray-700">
            {point.createdBy ? (
              <li className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                Ajouté par <b className="text-gray-900">{point.createdBy.name}</b>
                <span className="t-num rounded-[6px] bg-[var(--theme-ui-surface-strong)] px-1.5 py-0.5 text-[11px] font-bold text-gray-700">
                  {contributorCountLabel(point.createdBy.validatedCount)}
                </span>
              </li>
            ) : null}
            {point.validatedBy ? (
              <li>
                Validé par <b className="text-gray-900">{point.validatedBy}</b>
              </li>
            ) : null}
            <li className={confirmation.tone === 'warn' ? 'font-semibold text-[var(--game-warn)]' : ''} data-testid="sheet-confirmation">
              {confirmation.text}
            </li>
          </ul>

          <ErrorLine message={error} />

          {signedIn ? (
            // Empilés, pleine largeur : les deux boutons ne tiennent pas côte à côte dans le panneau.
            <div className="flex flex-col gap-2 [&>*]:w-full">
              {point.confirmedByMe ? (
                <button type="button" disabled className="app-btn app-btn--md app-btn--secondary gap-1.5">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Confirmé
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onConfirm}
                  disabled={confirming}
                  className={`app-btn app-btn--md gap-1.5 ${point.state === 'to_confirm' ? 'app-btn--primary' : 'app-btn--secondary'}`}
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {confirming ? 'Envoi…' : 'Toujours là'}
                </button>
              )}
              {point.reportedByMe ? (
                <button type="button" disabled className="app-btn app-btn--md app-btn--secondary gap-1.5">
                  <Flag className="h-4 w-4" aria-hidden="true" />
                  Signalement envoyé
                </button>
              ) : (
                <button type="button" onClick={onReport} className="app-btn app-btn--md app-btn--secondary gap-1.5">
                  <Flag className="h-4 w-4" aria-hidden="true" />
                  Signaler un problème
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-col gap-2 [&>*]:w-full">
                <Link
                  href={RESOURCE_LOGIN_HREF}
                  className={`app-btn app-btn--md gap-1.5 ${point.state === 'to_confirm' ? 'app-btn--primary' : 'app-btn--secondary'}`}
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Toujours là
                </Link>
                <Link href={RESOURCE_LOGIN_HREF} className="app-btn app-btn--md app-btn--secondary gap-1.5">
                  <Flag className="h-4 w-4" aria-hidden="true" />
                  Signaler un problème
                </Link>
              </div>
              <p className="t-meta flex items-center gap-1.5">
                <LogIn className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Connecte-toi pour confirmer ou signaler un point.
              </p>
            </div>
          )}
        </>
      )}
    </section>
  )
}

export function ResourceSpotSheet({
  spot,
  mapLabel,
  analysedMatches,
  onClose,
}: {
  spot: ObservedSpotView
  mapLabel: string
  analysedMatches: number
  onClose: () => void
}) {
  const Icon = FAMILY_ICONS[spot.family]
  const percent = sharePercent(spot.share)
  return (
    <section className="app-panel flex flex-col gap-4 p-4" aria-labelledby="resource-sheet-title" data-testid="resource-sheet" data-state="observed">
      <SheetHeader
        tile={
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--theme-ui-surface-strong)] text-gray-900" aria-hidden="true">
            <Icon className="h-5 w-5" />
          </span>
        }
        title={OBSERVED_FAMILY_SINGULAR[spot.family]}
        meta={`${mapLabel} · grille ${spot.grid}`}
        onClose={onClose}
      />
      <ResourceChip tone="neutral" icon={Eye} testId="sheet-chip">
        Observé dans les parties analysées
      </ResourceChip>
      <div className="flex flex-col gap-2">
        <p className="flex items-baseline gap-2" data-testid="sheet-share">
          <span className="t-hero t-hero--lg text-gray-900">{percent} %</span>{' '}
          <span className="t-body text-gray-700">des parties : trouvé ici</span>
        </p>
        <span className="block h-2 overflow-hidden rounded-full bg-[var(--theme-ui-surface-strong)]" aria-hidden="true">
          <span className="block h-full rounded-full bg-[var(--theme-ui-accent)]" style={{ width: `${percent}%` }} />
        </span>
        <p className="t-meta">{observationLine(spot, analysedMatches)}</p>
      </div>
    </section>
  )
}
