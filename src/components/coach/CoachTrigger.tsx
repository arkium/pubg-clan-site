'use client'

import { Shield } from 'lucide-react'

import { useCoach } from '@/components/coach/CoachContext'

/**
 * Bouton « Coach IA » de l'en-tête du shell (docs/TODO/chatbot-ia.md §8.1, P1) : teinté quand le tiroir est ouvert,
 * absent sur la page plein écran. Même hauteur que les cartes voisines (46 px à partir de 1 024 px), le header ne
 * change pas de hauteur — sous 640 px il passerait à la ligne et grandirait le header : il est masqué et le bouton
 * flottant `CoachFab` (bas droite) prend le relais ; le Coach s'ouvre aussi par le menu (entrée « Coach IA ») et les
 * boutons contextuels des pages.
 */
export default function CoachTrigger() {
  const { isOpen, toggle, onFullPage } = useCoach()
  if (onFullPage) return null
  return (
    <button
      type="button"
      onClick={toggle}
      aria-expanded={isOpen}
      aria-controls="coach-drawer"
      data-testid="coach-trigger"
      className="coach-trigger charte hidden h-12 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--theme-ui-accent-ring)] sm:inline-flex lg:h-[46px]"
      title="Coach IA"
    >
      <Shield className="h-4 w-4" aria-hidden="true" />
      <span>Coach IA</span>
    </button>
  )
}
