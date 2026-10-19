'use client'

import { CheckCircle2, ChevronRight, Inbox } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { ErrorState, ListSkeleton, toneStyle, type Tone } from '@/components/ui/CharteKit'
import { usePageData } from '@/hooks/usePageData'
import type { AdminInbox as AdminInboxData, AdminInboxTone } from '@/lib/admin-inbox/build'

/**
 * Boîte « À traiter » de l'accueil Plateforme (`GET /api/settings/inbox`, `src/lib/admin-inbox/`) : les files et
 * incidents de tout le site sur une seule liste, du plus urgent au simple « à relire », chaque ligne menant à sa page.
 * Charte UI : panneau `app-panel`, pastille de compte teintée par le ton, lien sur toute la ligne.
 */

const TONE_STYLE: Record<AdminInboxTone, Tone> = { urgent: 'neg', todo: 'warn', info: 'neutral' }
const TONE_LABEL: Record<AdminInboxTone, string> = { urgent: 'Urgent', todo: 'À traiter', info: 'À relire' }

function pickInbox(payload: unknown): AdminInboxData | null {
  const candidate = payload as Partial<AdminInboxData> | null
  return candidate && Array.isArray(candidate.items) ? (candidate as AdminInboxData) : null
}

export default function AdminInbox() {
  const [retry, setRetry] = useState(0)
  const { data, loading, error } = usePageData(retry > 0 ? `/api/settings/inbox?retry=${retry}` : '/api/settings/inbox', pickInbox)

  const actionable = data ? data.items.filter((item) => item.tone !== 'info').length : 0

  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="admin-inbox-title" data-testid="admin-inbox">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="admin-inbox-title" className="t-section-title m-0">
          À traiter
        </h2>
        {data ? (
          <span className="t-meta" data-testid="admin-inbox-summary">
            {actionable > 0 ? `${actionable} ${actionable > 1 ? 'sujets demandent' : 'sujet demande'} ton attention` : 'Aucune décision en attente'}
          </span>
        ) : null}
      </div>

      {!data && loading ? (
        <ListSkeleton rows={2} />
      ) : !data ? (
        <div className="app-panel">
          <ErrorState message={error || 'La boîte « À traiter » n’a pas pu être chargée.'} onRetry={() => setRetry((value) => value + 1)} testId="admin-inbox-error" />
        </div>
      ) : (
        <div className={`app-panel transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading || undefined}>
          {data.items.length === 0 ? (
            <p className="m-0 flex items-center gap-2.5 px-4 py-3.5 text-[13px] text-gray-700" data-testid="admin-inbox-empty">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--theme-ui-positive)]" aria-hidden="true" />
              Rien à traiter : toutes les files sont vides et aucun incident n’est en cours.
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col p-0">
              {data.items.map((item) => (
                <li key={item.key} className="border-t border-gray-200 first:border-t-0" data-testid="admin-inbox-item" data-key={item.key} data-tone={item.tone}>
                  <Link href={item.href} className="group flex items-start gap-3 px-3.5 py-3 hover:bg-gray-50 sm:px-4">
                    <span
                      className="t-num mt-0.5 inline-flex min-w-[2rem] shrink-0 justify-center rounded-md px-1.5 py-0.5 text-[12px] font-bold"
                      style={toneStyle(TONE_STYLE[item.tone])}
                      title={TONE_LABEL[item.tone]}
                    >
                      {item.count}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-[13px] font-semibold text-gray-900">
                        {item.label}
                        <span className="sr-only"> — {TONE_LABEL[item.tone]}</span>
                      </span>
                      {item.detail ? <span className="t-meta break-words">{item.detail}</span> : null}
                    </span>
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                  {item.links ? (
                    <div className="-mt-1.5 flex flex-wrap gap-x-3 gap-y-1 pb-3 pl-[3.75rem] pr-4">
                      {item.links.map((link) => (
                        <Link key={link.href} href={link.href} className="app-link text-[12px] font-semibold">
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {data.unavailable.length > 0 ? (
            <p className="m-0 flex items-center gap-2 border-t border-gray-200 px-4 py-2.5 t-meta" data-testid="admin-inbox-unavailable">
              <Inbox className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              Non lu cette fois : {data.unavailable.join(', ')}.
            </p>
          ) : null}
        </div>
      )}
    </section>
  )
}
