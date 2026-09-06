'use client'

import { ChevronDown } from 'lucide-react'

export default function ShowMoreToggle({
  expanded,
  onToggle,
  moreLabel = 'Voir plus',
  lessLabel = 'Voir moins',
  className = '',
}: {
  expanded: boolean
  onToggle: () => void
  moreLabel?: string
  lessLabel?: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-2.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 sm:py-2 ${className}`}
    >
      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
      {expanded ? lessLabel : moreLabel}
    </button>
  )
}
