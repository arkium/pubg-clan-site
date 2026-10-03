'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

import { publishNavBack } from '@/hooks/useNavBack'
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

  // Le bandeau collant reprend ce retour une fois docké (DockingToolbar) ; rien à reprendre quand le fil est masqué.
  useEffect(() => {
    publishNavBack(hidden ? null : backEntry)
    return () => publishNavBack(null)
  }, [backEntry, hidden])

  if (!backEntry || hidden) return null

  return (
    <div className="mb-4 flex items-center text-sm">
      <Link href={backEntry.href} className="app-back-link">
        <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
        Retour à {backEntry.label}
      </Link>
    </div>
  )
}
