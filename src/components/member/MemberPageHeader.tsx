'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

type MemberPageHeaderProps = {
  title: string
  subtitle?: string
  actions?: ReactNode
}

export default function MemberPageHeader({ title, subtitle, actions }: MemberPageHeaderProps) {
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
            className="inline-flex items-center justify-center rounded border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
          >
            Retour aux membres
          </Link>
        </div>
      </div>
    </header>
  )
}