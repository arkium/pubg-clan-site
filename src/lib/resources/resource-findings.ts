/**
 * Carte des ressources — bloc « En bref » rendu côté serveur (docs/TODO/geo-seo-propositions.md, lot 2) : pour chaque
 * carte, parties analysées, emplacements de véhicules affichés, l'emplacement le plus fréquent et les points validés,
 * en phrases ; puis la méthode. La carte interactive reste chargée par l'API. Pur, sans import `@/`.
 */
import type { ResourceMapResponse } from './resource-api'
import { OBSERVED_FAMILIES, RESOURCE_POINT_KINDS, RESOURCE_POINT_KIND_LABELS, type ObservedFamily } from './resource-map'

export type ResourceMapFinding = { label: string; sentence: string }

export type ResourceFindings = {
  title: string
  scope: string
  maps: ResourceMapFinding[]
  method: string
}

const integer = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 })
const percent = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 })
const longDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })

/** « de voitures », « de motos »… (« emplacements de … ») ; `feminine` accorde « trouvée ». */
const FAMILY_NOUNS: Record<ObservedFamily, { one: string; many: string; feminine: boolean }> = {
  car: { one: 'voiture', many: 'voitures', feminine: true },
  moto: { one: 'moto', many: 'motos', feminine: true },
  boat: { one: 'bateau', many: 'bateaux', feminine: false },
  glider: { one: 'planeur', many: 'planeurs', feminine: false },
  land: { one: 'voiture ou moto', many: 'voitures ou motos', feminine: true },
}

function mapSentence(view: ResourceMapResponse) {
  const { analysedMatches, spots } = view.observed

  const families = OBSERVED_FAMILIES.filter((family) => view.counts.observed[family] > 0).map((family, index) => {
    const count = view.counts.observed[family]
    const noun = count > 1 ? FAMILY_NOUNS[family].many : FAMILY_NOUNS[family].one
    return index === 0 ? `${integer.format(count)} emplacement${count > 1 ? 's' : ''} de ${noun}` : `${integer.format(count)} de ${noun}`
  })
  let sentence = analysedMatches > 0 ? `${integer.format(analysedMatches)} parties analysées : ` : ''
  sentence += families.length > 0 ? `${families.join(', ')}.` : 'pas encore d’emplacement de véhicule au-dessus des seuils.'

  const best = [...spots].sort((left, right) => right.share - left.share)[0]
  if (best) {
    const noun = FAMILY_NOUNS[best.family]
    sentence += ` Le plus fréquent : ${noun.one} en case ${best.grid}, trouvé${noun.feminine ? 'e' : ''} dans ${percent.format(best.share)} des parties.`
  }

  const points = RESOURCE_POINT_KINDS.filter((kind) => view.counts.points[kind] > 0).map((kind) => {
    const count = view.counts.points[kind]
    const labels = RESOURCE_POINT_KIND_LABELS[kind]
    return `${integer.format(count)} ${(count > 1 ? labels.plural : labels.singular).toLowerCase()}`
  })
  if (points.length > 0) sentence += ` Points placés par les joueurs : ${points.join(', ')}.`
  return sentence
}

export function resourceFindings(views: readonly ResourceMapResponse[], now: Date): ResourceFindings | null {
  if (views.length === 0) return null
  const windowDays = views[0].observed.windowDays
  return {
    title: `En bref : véhicules et ressources sur ${views.length} cartes PUBG`,
    scope: `Véhicules observés dans les parties des ${integer.format(windowDays)} derniers jours, recalculés chaque nuit · chiffres du ${longDate.format(now)}`,
    maps: views.map((view) => ({ label: view.map.label, sentence: mapSentence(view) })),
    method:
      'Un emplacement observé est l’endroit où un joueur, seul à bord, prend un véhicule en début de partie, dans les ' +
      'parties normales, classées et casual des clans suivis. Les observations proches sont regroupées ; un emplacement ' +
      'est affiché à partir de 3 parties, 0,5 % des parties de la carte et le quart de l’emplacement le plus fréquent de ' +
      'sa famille. Stations-service, garages, pontons et salles secrètes sont placés par les joueurs et validés par un ' +
      'administrateur.',
  }
}
