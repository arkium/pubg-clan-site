import type { ClanDirectoryPayload } from '@/lib/clan-directory'
import type { ClanListItem } from '@/lib/clan-list-service'

/**
 * Annuaire des clans — bloc « En bref » rendu côté serveur (docs/TODO/geo-seo-propositions.md, lot 2) : totaux (même
 * calcul que le bandeau de `/clans`), clans les plus actifs sur 7 jours, styles de jeu, et la liste de tous les clans
 * suivis **en liens** — les cartes de l'annuaire s'ouvrent par un bouton, un robot n'y trouvait aucun lien. Pur.
 */

export type ClanDirectoryLink = { id: number; label: string }

export type ClanDirectoryFindings = {
  title: string
  scope: string
  /** « Les plus actifs ces 7 derniers jours : … », `null` sans partie. */
  active: { intro: string; clans: Array<ClanDirectoryLink & { detail: string }> } | null
  styles: string | null
  clans: ClanDirectoryLink[]
  join: string
}

type ClanInput = Pick<ClanListItem, 'id' | 'name' | 'tag' | 'membersCount' | 'matchesCount' | 'isSystem'>

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const longDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })

const STYLE_LABELS = { fragger: 'Fragger', medic: 'Medic', ghost: 'Ghost' } as const
const plural = (value: number, singular: string, pluralForm = `${singular}s`) => `${integer.format(value)} ${value > 1 ? pluralForm : singular}`

export function clanDirectoryFindings(clans: readonly ClanInput[], directory: ClanDirectoryPayload | null, now: Date): ClanDirectoryFindings {
  // Mêmes totaux que le bandeau de la page : clans hors clan système, joueurs et parties de tous les clans listés.
  const realClans = clans.filter((clan) => !clan.isSystem)
  const players = clans.reduce((sum, clan) => sum + clan.membersCount, 0)
  const matches = clans.reduce((sum, clan) => sum + clan.matchesCount, 0)
  const byId = new Map(realClans.map((clan) => [clan.id, clan]))
  const label = (clan: ClanInput) => `${clan.name} [${clan.tag}]`

  const activity = (directory?.activity ?? []).filter((row) => byId.has(row.clanId))
  const mostActive = activity
    .filter((row) => row.games7 > 0)
    .sort((left, right) => right.games7 - left.games7 || right.wins7 - left.wins7)
    .slice(0, 3)

  const styleCounts = new Map<string, number>()
  for (const row of activity) {
    if (row.style) styleCounts.set(row.style.id, (styleCounts.get(row.style.id) ?? 0) + 1)
  }
  const styleParts = (Object.keys(STYLE_LABELS) as Array<keyof typeof STYLE_LABELS>)
    .filter((id) => styleCounts.has(id))
    .sort((left, right) => (styleCounts.get(right) ?? 0) - (styleCounts.get(left) ?? 0))
    .map((id) => `${integer.format(styleCounts.get(id) ?? 0)} ${STYLE_LABELS[id]}`)

  return {
    title: `En bref : ${plural(realClans.length, 'clan PUBG suivi', 'clans PUBG suivis')}`,
    scope: `${plural(players, 'joueur')}, ${plural(matches, 'partie importée', 'parties importées')} depuis le début du suivi · chiffres du ${longDate.format(now)}`,
    active:
      mostActive.length > 0
        ? {
            intro: 'Les plus actifs ces 7 derniers jours :',
            clans: mostActive.map((row) => {
              const clan = byId.get(row.clanId)!
              return { id: clan.id, label: label(clan), detail: `${plural(row.games7, 'partie')}, ${integer.format(row.wins7)} top 1` }
            }),
          }
        : null,
    styles:
      styleParts.length > 0
        ? `Styles de jeu : ${styleParts.join(', ')}. Le style d’un clan est le plus haut de trois scores moyens de ses membres : ` +
          'agressivité (Fragger), soutien (Medic) ou discipline de zone (Ghost), à partir de 20 parties.'
        : null,
    clans: [...realClans].sort((left, right) => left.name.localeCompare(right.name, 'fr')).map((clan) => ({ id: clan.id, label: label(clan) })),
    join:
      'Le site ne recrute pas : il suit les clans qui existent déjà dans PUBG. Un joueur demande l’accès à son clan, ou ' +
      'l’inscrit s’il n’est pas encore suivi, avec son pseudo PUBG et sans compte.',
  }
}
