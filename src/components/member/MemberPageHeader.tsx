'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

type MemberPageHeaderProps = {
  title: string
  subtitle?: string
  actions?: ReactNode
  backLabel?: string
  showBackButton?: boolean
  framed?: boolean
}

export default function MemberPageHeader({
  title,
  subtitle,
  actions,
  backLabel = 'Retour aux membres',
  showBackButton = true,
  framed = true,
}: MemberPageHeaderProps) {
  return (
    <header className={framed ? 'rounded-xl border border-gray-200 bg-white px-4 py-4 shadow-sm' : 'px-1 py-1'}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle ? <p className="text-sm text-gray-600">{subtitle}</p> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {showBackButton ? (
            <Link
              href="/members"
              className="app-btn app-btn--md app-btn--secondary"
            >
              {backLabel}
            </Link>
          ) : null}
        </div>
      </div>
    </header>
  )
}