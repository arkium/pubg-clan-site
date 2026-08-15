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
  backgroundImage?: string
  backgroundPosition?: string
  icon?: ReactNode
}

export default function MemberPageHeader({
  title,
  subtitle,
  actions,
  backLabel = 'Retour aux membres',
  showBackButton = true,
  framed = true,
  backgroundImage,
  backgroundPosition = 'center',
  icon,
}: MemberPageHeaderProps) {
  if (backgroundImage) {
    return (
      <header
        className="relative min-h-[10rem] overflow-hidden rounded-2xl bg-cover bg-no-repeat sm:min-h-[13rem]"
        style={{ backgroundImage: `url('${backgroundImage}')`, backgroundPosition }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />

        <div className="absolute right-2 top-2 z-10 flex flex-wrap items-center gap-2 sm:right-4 sm:top-4">
          {actions}
          {showBackButton ? (
            <Link
              href="/members"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 bg-black/50 px-2.5 py-1 text-xs font-semibold text-white shadow-sm backdrop-blur-md transition-colors hover:bg-black/70 sm:px-3 sm:py-1.5 sm:text-sm"
            >
              {backLabel}
            </Link>
          ) : null}
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 px-3 py-2.5 sm:px-5 sm:py-4">
          <div className="flex items-center gap-1.5 sm:gap-2">
            {icon}
            <h1 className="text-sm font-bold tracking-tight text-white drop-shadow-md sm:text-xl md:text-2xl">{title}</h1>
          </div>
          {subtitle ? (
            <p className="mt-0.5 text-[11px] font-medium text-gray-200 drop-shadow-md sm:mt-1 sm:text-sm">{subtitle}</p>
          ) : null}
        </div>
      </header>
    )
  }

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