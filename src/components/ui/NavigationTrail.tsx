'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export interface FallbackParent {
  href: string
  label: string
  altHref?: string
}

export interface NavigationTrailProps {
  currentLabel: string
  currentHref: string
  fallbackParent: FallbackParent | null
}

interface NavStackEntry {
  href: string
  label: string
  ts: number
}

const STORAGE_KEY = 'pubg-nav-stack'
const MAX_ENTRIES = 30

export function NavigationTrail({ currentLabel, currentHref, fallbackParent }: NavigationTrailProps) {
  const [backEntry, setBackEntry] = useState<{ href: string; label: string } | null>(null)

  useEffect(() => {
    // 1. Lire la pile actuelle
    const rawStack = sessionStorage.getItem(STORAGE_KEY)
    let stack: NavStackEntry[] = []
    if (rawStack) {
      try {
        stack = JSON.parse(rawStack)
      } catch (e) {
        console.error('Erreur de parsing de pubg-nav-stack', e)
        stack = []
      }
    }

    // 2. Déterminer l'entrée "Retour"
    let previous = null
    if (stack.length >= 1) {
      // Si la dernière entrée de la pile est différente de la page courante, c'est notre parent de retour
      const lastEntry = stack[stack.length - 1]
      if (lastEntry.href !== currentHref) {
        previous = lastEntry
      } else if (stack.length >= 2) {
        // Si c'est un rechargement de page, l'avant-dernière entrée est le parent
        previous = stack[stack.length - 2]
      }
    }

    // 3. Mettre à jour la pile avec la page courante
    if (stack.length === 0 || stack[stack.length - 1].href !== currentHref) {
      stack.push({
        href: currentHref,
        label: currentLabel,
        ts: Date.now()
      })
      // Limiter la taille
      if (stack.length > MAX_ENTRIES) {
        stack = stack.slice(stack.length - MAX_ENTRIES)
      }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stack))
    }

    // 4. Mettre à jour l'état local pour l'affichage
    if (previous) {
      setBackEntry(previous)
    } else if (fallbackParent) {
      setBackEntry(fallbackParent)
    }
  }, [currentLabel, currentHref, fallbackParent])

  if (!backEntry) return null

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
