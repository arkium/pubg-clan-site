'use client'

import { useCallback, useState } from 'react'

/**
 * Image avec repli : si `src` ne se charge pas (fichier supprimé, lien rompu), l'image affichée devient `fallback`.
 * Jamais un cadre vide. `broken` signale l'échec, pour proposer par exemple de remplacer l'image.
 *
 * Brancher `src` et `onError` sur l'`<img>`. L'URL doit arriver après l'hydratation (fetch côté client, cas de toutes
 * les images de clan) : une erreur survenue avant elle n'atteindrait pas `onError`.
 */
export function useImageFallback(src: string | null | undefined, fallback: string) {
  const wanted = src?.trim() || null
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const broken = wanted !== null && failedSrc === wanted

  const onError = useCallback(() => {
    if (wanted) setFailedSrc(wanted)
  }, [wanted])

  return {
    src: wanted && !broken ? wanted : fallback,
    broken,
    onError: broken ? undefined : onError,
  }
}
