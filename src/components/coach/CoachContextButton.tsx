'use client'

import { Shield } from 'lucide-react'

import { useCoach } from '@/components/coach/CoachContext'

/**
 * Bouton contextuel d'une page (docs/TODO/chatbot-ia.md §8.1) : ouvre le tiroir avec le contexte de la page courante.
 * Sur la page plein écran, rien. Un visiteur obtient le teaser.
 */
export default function CoachContextButton({ label, className = '' }: { label: string; className?: string }) {
  const { open, onFullPage } = useCoach()
  if (onFullPage) return null
  return (
    <button type="button" onClick={open} className={`app-btn app-btn--secondary app-btn--sm gap-1.5 ${className}`} data-testid="coach-context-button">
      <Shield className="h-4 w-4" aria-hidden="true" />
      <span>{label}</span>
    </button>
  )
}
