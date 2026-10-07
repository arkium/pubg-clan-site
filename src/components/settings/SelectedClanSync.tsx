'use client'

import { useEffect } from 'react'

import { useSelectedClan } from '@/hooks/useSelectedClan'

/** Aligne le clan sélectionné (barre latérale, `localStorage`) sur le clan de l'adresse, pour une page serveur. */
export default function SelectedClanSync({ clanId }: { clanId: number }) {
  const { setClanId } = useSelectedClan()

  useEffect(() => {
    setClanId(clanId)
  }, [clanId, setClanId])

  return null
}
