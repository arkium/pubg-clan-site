'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

import { NAV_STACK_STORAGE_KEY, parseNavStack, recordNavigation } from '@/lib/nav-stack'

export interface FallbackParent {
  href: string
  label: string
  altHref?: string
}

export interface NavigationTrailProps {
  currentLabel: string
  currentHref: string
  fallbackParent: FallbackParent | null
  hidden?: boolean
  forceFallback?: boolean
}

export function NavigationTrail({ currentLabel, currentHref, fallbackParent, hidden = false, forceFallback = false }: NavigationTrailProps) {
  const [backEntry, setBackEntry] = useState<{ href: string; label: string } | null>(null)

  useEffect(() => {
    // Une page dont l'état vit dans la query (filtres, sélection) doit la passer dans `currentHref`
    // pour que le retour depuis une page suivante restaure cet état.
    const { stack, previous } = recordNavigation(
      parseNavStack(sessionStorage.getItem(NAV_STACK_STORAGE_KEY)),
      { href: currentHref, label: currentLabel },
      Date.now()
    )
    sessionStorage.setItem(NAV_STACK_STORAGE_KEY, JSON.stringify(stack))

    // Mettre à jour l'état local pour l'affichage
    if (forceFallback && fallbackParent) {
      setBackEntry(fallbackParent)
    } else if (previous) {
      setBackEntry(previous)
    } else if (fallbackParent) {
      setBackEntry(fallbackParent)
    }
  }, [currentLabel, currentHref, fallbackParent, forceFallback])

  if (!backEntry || hidden) return null

  return (
    <div className="mb-4 flex items-center text-sm text-zinc-400">
      <Link 
        href={backEntry.href} 
        className="flex items-center hover:text-zinc-100 transition-colors"
      >
        <ChevronLeft className="w-4 h-4 mr-1" />
        Retour à {backEntry.label}
      </Link>
    </div>
  )
}
