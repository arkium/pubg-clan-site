/**
 * Tag du clan d'un joueur ou d'un clan, mis en évidence en jaune gras (demande du 2026-10-18, page Joueurs puis Ligue) :
 * texte d'accent de la charte (`--theme-ui-accent-text`, jaune en sombre, ambre lisible en clair), jamais une teinte en
 * dur. Sur une photo ou un podium (toujours sombres), `tone="photo"` : l'or de jeu, clair dans les deux thèmes — l'accent
 * du thème clair y serait sombre.
 */
export default function ClanTag({ tag, tone = 'theme', size = 'sm' }: { tag: string; tone?: 'theme' | 'photo'; size?: 'sm' | 'md' }) {
  const color = tone === 'photo' ? 'text-[var(--game-gold)]' : 'text-[var(--theme-ui-accent-text)]'
  return <span className={`shrink-0 font-mono font-extrabold ${size === 'md' ? 'text-[13px]' : 'text-[11px]'} ${color}`}>[{tag}]</span>
}
