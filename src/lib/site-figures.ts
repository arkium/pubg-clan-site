import { SITE_DOMAIN } from '@/lib/legal/legal-info'

/**
 * Chiffres du site et phrase « citable » (docs/TODO/geo-seo-propositions.md, 4.1 et 4.7) : calculés à la volée, jamais
 * écrits en dur. Mêmes définitions que la vitrine de l'accueil (`stats` de `src/lib/home-showcase-service.ts`), pour
 * qu'une page ne contredise pas l'autre (§4 I) : clans actifs hors parking, membres actifs de ces clans, analyses de
 * télémétrie (une par escouade et par partie). Module pur.
 */

export type SiteFigures = { clans: number; players: number; analyzedMatches: number }

const integer = new Intl.NumberFormat('fr-FR')

function count(value: number, singular: string, plural: string) {
  return `${integer.format(value)} ${value > 1 ? plural : singular}`
}

export function citableSiteSentence(figures: SiteFigures, domain: string = SITE_DOMAIN) {
  return (
    `${domain} suit ${count(figures.clans, 'clan PUBG francophone', 'clans PUBG francophones')}, ` +
    `soit ${count(figures.players, 'joueur', 'joueurs')}, et a analysé ` +
    `${count(figures.analyzedMatches, 'partie d’escouade', 'parties d’escouade')}.`
  )
}

const longDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })
const isoDate = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/Paris' })

/** Date d'un chiffre, pour un `<time dateTime>` : jour de Paris (`AAAA-MM-JJ`) et libellé (« 20 octobre 2026 »). */
export function figuresDate(now: Date) {
  return { iso: isoDate.format(now), label: longDate.format(now) }
}
