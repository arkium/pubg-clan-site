import type { ClanActivity } from '@/lib/clan-directory'
import type { ClanListItem } from '@/lib/clan-list-service'
import { CLAN_PAGES } from '@/lib/seo/page-seo'

/**
 * Vue d'ensemble d'un clan — bloc « En bref » rendu côté serveur (docs/TODO/geo-seo-propositions.md, lot 2) : les
 * chiffres du clan en phrases et un lien vers chacune de ses pages (seule la vue d'ensemble est dans le sitemap, les
 * autres ne se découvrent que par ces liens). **Aucun pseudo** : uniquement des agrégats de clan — les pages joueur
 * restent hors index (seo.md §2). Pur.
 */

export type ClanOverviewFindings = {
  title: string
  facts: string[]
  links: Array<{ href: string; label: string }>
}

type ClanInput = Pick<ClanListItem, 'id' | 'name' | 'tag' | 'membersCount' | 'matchesCount' | 'winsCount' | 'killsCount' | 'lastMatchAt'>

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const longDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })

const STYLE_TEXT = {
  fragger: 'Fragger (agressivité)',
  medic: 'Medic (soutien)',
  ghost: 'Ghost (discipline de zone)',
} as const

const plural = (value: number, singular: string, pluralForm = `${singular}s`) => `${integer.format(value)} ${value > 1 ? pluralForm : singular}`
const rankLabel = (rank: number) => (rank === 1 ? '1er' : `${rank}e`)

export function clanOverviewFindings(clan: ClanInput, activity: ClanActivity | null, leagueSize: number, now: Date): ClanOverviewFindings {
  const label = `${clan.name} [${clan.tag}]`
  const facts = [
    `${plural(clan.membersCount, 'membre actif', 'membres actifs')}, ${plural(clan.matchesCount, 'partie importée', 'parties importées')}, ` +
      `${integer.format(clan.winsCount)} top 1 et ${plural(clan.killsCount, 'kill')} depuis le début du suivi.`,
  ]

  if (activity && activity.games7 > 0) {
    facts.push(`Ces 7 derniers jours : ${plural(activity.games7, 'partie importée', 'parties importées')} et ${integer.format(activity.wins7)} top 1.`)
  } else {
    // `games7` compte les parties importées ; `lastMatchAt` vient de la synchronisation du clan et peut être plus
    // récente (import en retard) : la date n'est citée que si elle confirme l'absence de partie sur 7 jours.
    const last = activity?.lastMatchAt ?? clan.lastMatchAt
    const lastDate = last ? new Date(last) : null
    if (clan.matchesCount === 0 && !lastDate) facts.push('Aucune partie importée pour l’instant.')
    else if (lastDate && now.getTime() - lastDate.getTime() > 7 * 86_400_000) {
      facts.push(`Aucune partie ces 7 derniers jours ; dernière partie le ${longDate.format(lastDate)}.`)
    } else facts.push('Aucune partie importée ces 7 derniers jours.')
  }

  if (activity?.leagueRank) {
    facts.push(`Ligue des clans : ${rankLabel(activity.leagueRank)} sur ${integer.format(leagueSize)} ce mois-ci, au Power score.`)
  }
  if (activity?.style) {
    facts.push(
      `Style de jeu : ${STYLE_TEXT[activity.style.id]}, score de ${integer.format(activity.style.score)} sur 100 — moyenne de ses membres, ` +
        `sur ${plural(activity.style.matches, 'partie')}.`
    )
  }

  return {
    title: `En bref : ${label}, clan PUBG suivi sur chickendinner.fr`,
    facts: [...facts, `Chiffres du ${longDate.format(now)}.`],
    // Pages publiques du clan seulement : une page hors index (Coach IA, réservée aux membres) n'est pas une porte d'entrée.
    links: CLAN_PAGES.filter((page) => page.path !== '/overview' && !page.noindex).map((page) => ({ href: `/clans/${clan.id}${page.path}`, label: page.label })),
  }
}
