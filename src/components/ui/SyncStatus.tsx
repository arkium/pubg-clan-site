'use client'

import { RefreshCw } from 'lucide-react'

import { elapsedLabel } from '@/lib/relative-time'

/**
 * Fraîcheur d'une donnée PUBG synchronisée, dans le bandeau d'une page sans période (armes, carrière d'un joueur) :
 * « Synchro PUBG il y a 3 h », l'heure seule sur mobile. Bouton de rafraîchissement pour qui en a le droit (membre du
 * clan du joueur, SuperUser : `useCanRefreshMember`), sinon la date seule.
 */
export default function SyncStatus({
  lastRefresh,
  now,
  canRefresh,
  refreshing,
  onRefresh,
  subject,
  prefix = 'Synchro',
  testId = 'sync-status',
}: {
  lastRefresh: string | null
  now: Date
  canRefresh: boolean
  refreshing: boolean
  onRefresh: () => void
  /** Ce que le bouton rafraîchit, pour son nom accessible : « la maîtrise PUBG », « la carrière PUBG ». */
  subject: string
  prefix?: string
  testId?: string
}) {
  const elapsed = lastRefresh ? elapsedLabel(lastRefresh, now) : null
  const label = (
    <>
      <span className="sm:hidden">{elapsed ? elapsed.replace(/^il y a /, '') : 'jamais'}</span>
      <span className="hidden sm:inline">{elapsed ? `${prefix} ${elapsed}` : 'Jamais synchronisé'}</span>
    </>
  )
  const className =
    'inline-flex h-[34px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border border-gray-200 bg-white px-2.5 text-[13px] font-semibold text-gray-700'
  if (!canRefresh) {
    return (
      <span className={className} title="Synchronisé chaque nuit" data-testid={testId}>
        {label}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={refreshing}
      className={`${className} hover:bg-gray-50 disabled:opacity-60`}
      aria-label={`Rafraîchir ${subject}${elapsed ? ` (synchro ${elapsed})` : ''}`}
      data-testid={testId}
    >
      <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
      {label}
    </button>
  )
}
