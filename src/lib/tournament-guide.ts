/**
 * Contenu du guide « Comment fonctionne un tournoi ? ».
 *
 * Source unique : la même donnée alimente l'onglet Guide de l'administration et la section publique de
 * `/tournaments`. Les descriptions de modes servent aussi de libellés au formulaire de création, pour qu'une règle
 * expliquée au joueur soit exactement celle proposée à l'organisateur.
 *
 * Les tests vérifient que les quatre modes du moteur y sont tous décrits : ajouter un mode sans l'expliquer casse
 * la suite.
 */
import type { MixedSquadRule, TournamentMode } from '@/lib/tournament-service'

export type TournamentModeDescription = {
  value: TournamentMode
  label: string
  /** Une phrase, telle qu'affichée sous le choix dans le formulaire. */
  help: string
}

export const TOURNAMENT_MODE_DESCRIPTIONS: TournamentModeDescription[] = [
  {
    value: 'inter_clan',
    label: 'Inter-Clans',
    help: 'Une ligne de classement par clan. C’est le mode historique : chaque clan présent dans une manche marque selon le placement de son escouade.',
  },
  {
    value: 'custom_teams',
    label: 'Équipes libres',
    help: 'Une ligne par équipe fixe, même si ses joueurs viennent de clans différents. L’équipe est identifiée par sa composition.',
  },
  {
    value: 'solo_ffa',
    label: 'Solo (chacun pour soi)',
    help: 'Classement individuel : chaque joueur marque selon son propre placement et ses propres kills.',
  },
  {
    value: 'intra_clan',
    label: 'Intra-clan',
    help: 'Scrims internes : seuls les membres du clan organisateur concourent, escouade contre escouade.',
  },
]

export type MixedSquadRuleDescription = {
  value: MixedSquadRule
  label: string
  help: string
}

export const MIXED_SQUAD_RULE_DESCRIPTIONS: MixedSquadRuleDescription[] = [
  {
    value: 'full_share',
    label: 'Partage intégral',
    help: 'Chaque clan présent dans une escouade mixte reçoit 100 % des points de placement, plus ses propres kills.',
  },
  {
    value: 'prorata',
    label: 'Au prorata',
    help: 'Les points de placement et le bonus de victoire sont divisés selon l’effectif : 2 joueurs sur 4 donnent la moitié des points. Les kills restent entiers.',
  },
]

export type TournamentGuideCard = {
  id: string
  title: string
  body: string
  /** Points détaillés, rendus en liste sous le paragraphe. */
  bullets?: string[]
}

export const TOURNAMENT_GUIDE_CARDS: TournamentGuideCard[] = [
  {
    id: 'captured-matches',
    title: 'Comment les matchs sont-ils capturés ?',
    body: "Un tournoi ne crée aucune partie : il retient des matchs déjà joués. Seules les parties personnalisées comptent, jamais les parties publiques, et seulement celles jouées entre la date de début et la date de fin du tournoi.",
  },
  {
    id: 'organizer-rule',
    title: 'La règle d’or de l’organisateur',
    body: "Un membre du clan organisateur doit être présent dans la partie pour qu’elle compte. C’est ce qui rattache une partie personnalisée à un tournoi plutôt qu’à un autre : sans cette règle, la partie d’un tout autre clan tombant dans la même fenêtre de dates entrerait dans le classement.",
  },
  {
    id: 'modes',
    title: 'Les quatre modes de tournoi',
    body: "Le mode décide de ce qui est classé : un clan, une équipe, un joueur ou une escouade interne. Il se choisit à la création et peut être changé ensuite : le classement est recalculé, rien n’est figé.",
    bullets: TOURNAMENT_MODE_DESCRIPTIONS.map((mode) => `${mode.label} — ${mode.help}`),
  },
  {
    id: 'mixed-squads',
    title: 'Les escouades mixtes',
    body: "En mode inter-clans, une escouade peut mélanger deux clans. L’organisateur choisit alors comment répartir les points de placement. Les kills, eux, restent toujours attribués au joueur qui les a faits.",
    bullets: MIXED_SQUAD_RULE_DESCRIPTIONS.map((rule) => `${rule.label} — ${rule.help}`),
  },
  {
    id: 'sync',
    title: 'La synchronisation PUBG',
    body: "« Synchroniser PUBG » interroge l’API avec le compte de l’organisateur, importe les parties récentes et met leur télémétrie en file d’attente. Les parties arrivent aussi toutes seules par la synchronisation quotidienne : le bouton sert à ne pas attendre.",
  },
  {
    id: 'scoring',
    title: 'Le calcul des scores',
    body: "Chaque manche rapporte des points de placement (Top 1 à Top 10), des points par kill et un bonus de victoire. L’option « meilleures manches retenues » ne garde que les N meilleures d’un participant, pour qu’une soirée ratée ne condamne pas un tournoi.",
    bullets: [
      'Un filtre de mode ou de carte trop strict ne retient aucune manche : dans le doute, laissez « tous les modes ».',
      'Avec le partage au prorata, les totaux deviennent décimaux : c’est normal, pas une erreur d’arrondi.',
    ],
  },
  {
    id: 'discord',
    title: 'La diffusion Discord',
    body: "Les résultats se publient manche par manche, jamais automatiquement. Une prévisualisation montre le message exact avant l’envoi, et une manche déjà diffusée est signalée pour éviter le doublon. Le message s’adapte au mode du tournoi.",
  },
]
