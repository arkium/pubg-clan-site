'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

type MemberPageHeaderProps = {
  title: string
  subtitle?: string
  actions?: ReactNode
  backLabel?: string
}

export default function MemberPageHeader({ title, subtitle, actions, backLabel = 'Retour aux membres' }: MemberPageHeaderProps) {
  return (
    <header className="rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle ? <p className="text-sm text-gray-600">{subtitle}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <Link
            href="/members"
            className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {backLabel}
          </Link>
        </div>
      </div>
    </header>
  )
}