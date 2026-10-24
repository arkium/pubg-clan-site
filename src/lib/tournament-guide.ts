/**
 * Contenu du guide « Comment fonctionne un tournoi ? ».
 *
 * Source unique : la même donnée alimente l'onglet Guide de l'administration, le résumé de `/tournaments` et
 * l'en-tête d'un tournoi. Les descriptions de modes servent aussi de libellés au formulaire de création, pour qu'une règle
 * expliquée au joueur soit exactement celle proposée à l'organisateur.
 *
 * Les tests vérifient que les quatre modes du moteur y sont tous décrits : ajouter un mode sans l'expliquer casse
 * la suite.
 */
import type { MixedSquadRule, TournamentMode } from '@/lib/tournament-service'

export type TournamentModeDescription = {
  value: TournamentMode
  /** Libellé du formulaire de création. */
  label: string
  /** Libellé court des pages joueurs : badges, cartes de mode, en-tête d'un tournoi. */
  shortLabel: string
  /** Ce que le mode classe, en quelques mots (« classe les clans »). */
  ranks: string
  /** Une ou deux phrases, affichées sous le choix du formulaire et dans l'en-tête d'un tournoi. */
  help: string
}

export const TOURNAMENT_MODE_DESCRIPTIONS: TournamentModeDescription[] = [
  {
    value: 'inter_clan',
    label: 'Inter-clans',
    shortLabel: 'Inter-clans',
    ranks: 'classe les clans',
    help: 'Une ligne par clan. Chaque clan présent dans une manche marque selon le placement de sa squad.',
  },
  {
    value: 'custom_teams',
    label: 'Équipes libres',
    shortLabel: 'Équipes libres',
    ranks: 'classe les équipes',
    help: 'Une ligne par équipe fixe, même si ses joueurs viennent de clans différents. L’équipe est identifiée par sa composition.',
  },
  {
    value: 'solo_ffa',
    label: 'Solo (chacun pour soi)',
    shortLabel: 'Solo',
    ranks: 'classe les joueurs',
    help: 'Chacun pour soi : chaque joueur marque selon son propre placement et ses propres kills.',
  },
  {
    value: 'intra_clan',
    label: 'Intra-clan',
    shortLabel: 'Intra-clan',
    ranks: 'classe les squads du clan',
    help: 'Scrims internes : seuls les membres du clan organisateur concourent, squad contre squad.',
  },
]

/**
 * « Comment ça marche ? » de la liste publique `/tournaments`, en quatre lignes (maquette « Tournois », 2026-09-27).
 * Le guide complet (`TOURNAMENT_GUIDE_CARDS`) reste celui de l'administration ; ces lignes en sont le résumé et
 * doivent rester d'accord avec lui (`tournament-guide.test.ts`).
 */
export const TOURNAMENT_QUICK_GUIDE: string[] = [
  'Seules les **parties personnalisées** jouées pendant les dates du tournoi comptent.',
  'Un membre du **clan organisateur** doit jouer la partie (un observateur ne suffit pas).',
  'Chaque manche rapporte des points de **placement** (Top 1 à Top 10), des points par **kill** et un **bonus de victoire**.',
  'Le **mode** décide de ce qui est classé : un clan, une équipe, un joueur ou une squad du clan.',
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
    help: 'Chaque clan présent dans une squad mixte reçoit 100 % des points de placement, plus ses propres kills.',
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
    body: "Un membre du clan organisateur doit jouer la partie pour qu’elle compte : un hôte ou un observateur n’apparaît pas dans les données PUBG. C’est ce qui rattache une partie personnalisée à un tournoi plutôt qu’à un autre : sans cette règle, la partie d’un tout autre clan tombant dans la même fenêtre de dates entrerait dans le classement. La synchronisation lit les parties des joueurs du clan organisateur, pas seulement de celui qui clique : un organisateur observateur retrouve la manche dès qu’un de ses coéquipiers l’a jouée, avec tous les joueurs suivis, quel que soit le format (solo, duo, squad).",
  },
  {
    id: 'modes',
    title: 'Les quatre modes de tournoi',
    body: "Le mode décide de ce qui est classé : un clan, une équipe, un joueur ou une squad interne. Il se choisit à la création et peut être changé ensuite : le classement est recalculé, rien n’est figé.",
    bullets: TOURNAMENT_MODE_DESCRIPTIONS.map((mode) => `${mode.label} — ${mode.help}`),
  },
  {
    id: 'mixed-squads',
    title: 'Les squads mixtes',
    body: "En mode inter-clans, une squad peut mélanger deux clans. L’organisateur choisit alors comment répartir les points de placement. Les kills, eux, restent toujours attribués au joueur qui les a faits.",
    bullets: MIXED_SQUAD_RULE_DESCRIPTIONS.map((rule) => `${rule.label} — ${rule.help}`),
  },
  {
    id: 'sync',
    title: 'La synchronisation PUBG',
    body: "« Synchroniser PUBG » va chercher sur PUBG les dernières parties des joueurs du clan organisateur, retient celles du tournoi, met à jour le classement et récupère la télémétrie de chaque manche. Les parties arrivent aussi toutes seules par la synchronisation automatique : le bouton sert à ne pas attendre.",
    bullets: [
      'Clique après chaque manche, une fois la partie terminée : PUBG ne publie une partie que 2 à 3 minutes après sa fin.',
      'Le bouton annonce 0 manche ? PUBG ne l’a pas encore publiée : le site réessaie seul chaque minute, 10 fois au plus, avec un compte à rebours, et tu peux arrêter les essais. Toujours rien après 10 essais : vérifie que la manche est terminée, puis reclique. Recliquer est sans risque, une manche n’est jamais comptée deux fois.',
      'Le classement se met à jour aussitôt ; le replay de la manche suit quelques secondes plus tard, le temps d’analyser la télémétrie.',
      'La manche est retrouvée dès qu’un joueur du clan organisateur l’a jouée, même si l’organisateur l’a regardée en observateur. Si aucun joueur du clan ne l’a jouée, elle ne peut pas être retrouvée : un hôte ou un observateur n’apparaît pas dans les données PUBG.',
      'Les boutons d’organisation (synchroniser, diffuser, paramètres) ne sont visibles que de l’Owner du clan organisateur et du SuperUser, quel que soit son clan.',
    ],
  },
  {
    id: 'scoring',
    title: 'Le calcul des scores',
    body: "Chaque manche rapporte des points de placement (Top 1 à Top 10), des points par kill et un bonus de victoire. L’option « meilleures manches retenues » ne garde que les N meilleures d’un participant, pour qu’une soirée ratée ne condamne pas un tournoi.",
    bullets: [
      'Un filtre de mode ou de carte écarte toute manche hors filtre, même jouée pendant le tournoi, et sa télémétrie n’est pas récupérée : dans le doute, laisse « tous les modes ».',
      'Avec le partage au prorata, les totaux deviennent décimaux : c’est normal, pas une erreur d’arrondi.',
    ],
  },
  {
    id: 'discord',
    title: 'La diffusion Discord',
    body: "Les résultats se publient manche par manche, jamais automatiquement. Une prévisualisation montre le message exact avant l’envoi, et une manche déjà diffusée est signalée pour éviter le doublon. Le message s’adapte au mode du tournoi.",
  },
]
