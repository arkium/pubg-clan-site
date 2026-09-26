import Image from 'next/image'

/** Médailles des rangs 1 à 3 — images existantes du site (décision du 2026-09-26, docs/TODO/refonte-ui.md §3). */
export const RANK_MEDALS: Record<1 | 2 | 3, { src: string; alt: string }> = {
  1: { src: '/icons/medal-gold.svg', alt: 'Rang 1, médaille d’or' },
  2: { src: '/icons/medal-silver.svg', alt: 'Rang 2, médaille d’argent' },
  3: { src: '/icons/medal-bronze.svg', alt: 'Rang 3, médaille de bronze' },
}

const MEDAL_SIZE = { xs: 18, sm: 24, md: 30 } as const

/**
 * Rang d'un classement : médaille SVG pour 1 à 3, numéro ensuite. Jamais d'emoji ni de pastille « #1 »
 * (docs/ui/composants-refonte.md, `RankCell`).
 */
export default function RankCell({ rank, size = 'sm', className = '' }: { rank: number; size?: 'xs' | 'sm' | 'md'; className?: string }) {
  const medal = rank >= 1 && rank <= 3 ? RANK_MEDALS[rank as 1 | 2 | 3] : null
  if (medal) {
    const px = MEDAL_SIZE[size]
    return <Image src={medal.src} alt={medal.alt} width={px} height={px} className={`block shrink-0 ${className}`.trim()} />
  }
  return (
    <span className={`inline-block pl-1.5 text-[13px] font-semibold tabular-nums text-gray-500 ${className}`.trim()}>{rank}</span>
  )
}
