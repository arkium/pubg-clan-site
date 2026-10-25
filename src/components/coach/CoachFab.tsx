'use client'

import { Shield } from 'lucide-react'

import { useCoach } from '@/components/coach/CoachContext'

/**
 * Bouton flottant « Coach IA » du mobile (décision du 2026-10-25, docs/TODO/chatbot-ia.md §8.1) : sous 640 px le
 * bouton de l'en-tête est masqué (le header ne grandit jamais), celui-ci prend le relais en bas à droite, au-dessus du
 * contenu. Même état que le bouton de l'en-tête (`useCoach`) ; masqué par l'attribut `hidden` tant que le panneau est
 * ouvert (l'élément reste monté : le tiroir lui rend le focus à la fermeture) ; absent sur la page plein écran.
 * CSS `.coach-fab` (globals.css, charte section 44) : affiché sous 640 px seulement, sous les toasts et les menus.
 */
export default function CoachFab() {
  const { isOpen, toggle, onFullPage } = useCoach()
  if (onFullPage) return null
  return (
    <button
      type="button"
      onClick={toggle}
      hidden={isOpen}
      aria-expanded={isOpen}
      aria-controls="coach-drawer"
      aria-label="Coach IA"
      title="Coach IA"
      data-testid="coach-fab"
      className="coach-fab charte"
    >
      <Shield className="coach-ico" aria-hidden="true" />
    </button>
  )
}
