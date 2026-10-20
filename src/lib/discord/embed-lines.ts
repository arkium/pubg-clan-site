/**
 * Mise en page des champs d'embed Discord (1 024 caractères) — partagée par les générateurs Top 1 et tournoi. Module
 * pur : l'aperçu côté client l'emploie aussi.
 */

export function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`
}

/** Nom en gras, en lien masqué quand une adresse existe (docs/TODO/url-masking.md §4.D). */
export function boldName(label: string, url: string | null | undefined) {
  if (!url) return `**${label}**`
  // Un crochet dans le libellé fermerait le lien avant l'heure.
  return `[**${label.replace(/[[\]]/g, (char) => `\\${char}`)}**](${url})`
}

/**
 * Empile des lignes tant qu'elles tiennent dans la limite Discord, puis signale
 * le reliquat au lieu de tronquer une ligne en plein milieu.
 */
export function joinBoundedLines(lines: string[], max: number) {
  const kept: string[] = []

  for (const line of lines) {
    if ([...kept, line].join('\n').length > max) {
      const overflow = `… et ${lines.length - kept.length} autre(s)`
      if ([...kept, overflow].join('\n').length <= max) kept.push(overflow)
      break
    }

    kept.push(line)
  }

  return truncate(kept.join('\n') || '—', max)
}

/**
 * Lignes dont le nom peut être un lien. Au-delà de la limite, les derniers noms perdent d'abord leur lien ; s'il le
 * faut encore, les dernières lignes cèdent la place à « … et N autre(s) ». Un lien n'est jamais coupé en deux.
 */
export function joinLinkedLines(lines: Array<{ linked: string; plain: string }>, max: number) {
  const chosen = lines.map((line) => line.linked)
  for (let index = chosen.length - 1; index >= 0 && chosen.join('\n').length > max; index -= 1) {
    chosen[index] = lines[index].plain
  }
  return joinBoundedLines(chosen, max)
}
