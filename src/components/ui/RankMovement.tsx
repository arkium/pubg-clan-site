/**
 * Évolution d'un rang par rapport à la période précédente : ▲N (vert), ▼N (rouge), « = », « nouv. » quand il n'était pas
 * classé. Née dans la Ligue inter-clans (docs/features/ligue-clans.md), partagée avec le classement des joueurs
 * (docs/features/joueurs.md). La page décide d'afficher ou non la colonne (aucune flèche pour « Tous »).
 */
export default function RankMovement({ rank, previousRank }: { rank: number; previousRank: number | null }) {
  if (previousRank === null) return <span className="text-[11px] font-extrabold text-gray-500" title="Pas classé sur la période précédente">nouv.</span>
  const delta = previousRank - rank
  if (delta === 0) return <span className="text-[11px] font-extrabold text-gray-500" title="Même rang que la période précédente">=</span>
  return (
    <span
      className="t-num text-[11px] font-extrabold"
      style={{ color: delta > 0 ? 'var(--theme-ui-positive)' : 'var(--theme-ui-negative)' }}
      title={`${delta > 0 ? 'Gagne' : 'Perd'} ${Math.abs(delta)} place${Math.abs(delta) > 1 ? 's' : ''} par rapport à la période précédente (${previousRank}e)`}
    >
      {delta > 0 ? `▲${delta}` : `▼${-delta}`}
    </span>
  )
}
