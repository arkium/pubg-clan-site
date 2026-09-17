# Villes et zones de combat sur les tableaux de bord

Livré le 2026-09-17. Répond à la question « où joue le clan, et où se battent ses membres ? » sans rouvrir la page
Positions et sans relire les gros JSON de télémétrie.

## Où ça s'affiche

| Page | Panneau | Portée |
|---|---|---|
| `/clans/[clanId]/overview` | `CityInsightsPanel` (scope `clan`) | Tout le clan, avec les filtres période / type de match / mode déjà présents sur la page |
| `/members/[id]/dashboard` | `CityInsightsPanel` (scope `member`) | Le membre, avec une colonne de comparaison au clan |

Chaque panneau propose quatre familles d'événements : **Présence**, **Kills**, **Dégâts**, **Réanimations**.

## D'où viennent les chiffres

Tout est lu dans `PositionMetricCell` (cellules persistées au moment du parsing), jamais dans les colonnes JSON :

| Famille | Métrique `PositionMetricCell` |
|---|---|
| Présence | `position` |
| Kills | `kill` |
| Dégâts | `damage_dealt` |
| Réanimations | `revive_given` |

Une cellule occupe une case de la grille 40 × 40 de la carte. Son centre est rattaché à la ville configurée
(`MapLocation` : un cercle en pourcentage de carte, réglé dans les paramètres de cartes) qui le contient — la plus
proche en cas de cercles superposés. C'est la règle du Top 5 de la page Positions, désormais partagée dans
`src/lib/city-insights.ts` (`buildCityGrid`, `locationForPercent`).

Les événements hors de tout cercle restent comptés dans les totaux, jamais dans une ville : le panneau affiche la part
« hors des villes configurées » pour que ce reste soit visible.

## Indicateurs

- **Ville principale** : première ville par présence, avec sa part des passages en ville.
- **Zone de combat favorite** : ville où kills et dégâts infligés cumulent le plus d'événements.
- **Couverture** : nombre de matchs couverts, part hors villes, et date du plus ancien match disponible.
- **Top 5** : classement par famille, avec médailles pour les trois premiers.
- **Évolution** : huit dernières semaines, semaines vides conservées.
- **Comparaison au clan** (vue membre) : part du clan sur la même ville, affichée seulement au-delà de
  **25 événements** pour le membre et **100** pour le clan (`MEMBER_COMPARISON_MIN_EVENTS`,
  `CLAN_COMPARISON_MIN_EVENTS`). En dessous, la colonne affiche `—` : comparer trois événements à une moyenne de clan
  n'apprend rien.

## Lien vers la carte

Le bouton « Voir sur la carte » ouvre `/clans/[clanId]/stats/positions` préfiltrée. La page accepte maintenant
`?map=`, `?view=` et `?period=` (lus par `useSearchParams` dans un `Suspense`, comme les autres pages à paramètres).
La famille « Présence » n'a pas de vue équivalente sur la page Positions : le lien ouvre alors la carte sans filtre
de vue.

## Limite de données à connaître

Les positions brutes des matchs de plus d'environ trois semaines ont été purgées (voir
[Performance de la base](../ops/database-performance.md) §4.4). Deux conséquences :

- l'évolution 8 semaines est creuse avant le 31/08/2026, et le panneau l'explique au lieu de laisser croire à une
  absence d'activité ;
- les matchs anciens ne reviendront pas pour la présence, mais leurs kills, dégâts et réanimations réapparaîtront
  avec le rattrapage des cellules (`npm run telemetry:position-metrics:backfill -- --missing-only`).

## Contrôle sur données réelles

```bash
npx tsx scripts/inspect-city-insights.ts <clanId> [week|month|all] [memberId]
```

Lecture seule : volumétrie, temps de chargement, Top 5 par famille, ville favorite, zone de combat et évolution.
Mesure du 2026-09-17 sur le clan 1 : 303 matchs en septembre, Pochinki en tête avec 12,7 % des passages en ville,
740 ms de chargement (3 s sur « Tous les matchs »).

## Voir aussi

- [Zones de drop](drop-zones.md) — pression au drop, dont le panneau réutilise les conventions visuelles
- [Télémétrie — API](../telemetry/api.md) — route `positions` et heatmaps
- `docs/TODO/todo.md`, section « Dashboards clan et membre »
