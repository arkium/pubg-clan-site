# Cartographie tactique — « choisis un événement, lis la carte »

Refonte livrée le 2026-09-27 (maquette Claude Design « Positions », `PositionsPropose`). Page
`/clans/[clanId]/stats/positions`, entrée de navigation `clan.positions`. Ancienne page archivée dans
`archive/refonte-ui/positions/` (ignoré par git).

Répond à : **où le clan se bat, tombe et se relève, ville par ville ?**

## 1. Ce que l'analyse de cohérence a corrigé

| Constat (page d'avant) | Décision |
|---|---|
| Cinq listes dans le bandeau (carte, phase, joueur, catégorie, vue) ; « Infligés / Reçus » introuvable | Bandeau des **zones de drop** sur une ligne : carte ‹ ›, période, pastille joueur. La phase descend sous la carte, le sens se choisit **sur la carte** |
| « Catégorie » puis « Vue » : deux niveaux pour un choix ; les revives cachés dans « Équipe » | **Sept tuiles d'événement** avec icône, couleur et compteur : Kills, KO, Dégâts, Tirs, Revives, Véhicules, Morts (2 lignes sur mobile, sans défilement) |
| Vue « Tous » : 3 ou 4 couleurs superposées, 3 rendus différents | **Un événement à la fois, un seul rendu** : pastilles dimensionnées (racine du nombre) pour les événements ponctuels, halo (échelle log) pour tirs et dégâts. Le **rapport de force** répond à la question que posait « Tous » |
| Légende de 6 lignes loin de la carte ; « Cellules visibles », « Intensité max » | Une ligne de légende sous la carte ; compteurs techniques retirés |
| Noms de toutes les villes sur la carte ; filtre « Ville » en liste | **Épingles du top 5** (rang, nom, nombre, périmètre en pointillés) ; toucher une épingle ou une ligne du top 5 zoome |
| Maquette : « 7 jours / 30 jours / Tout » | `PeriodFilter` du site : **Semaine / Mois / Tous** (calendaires) |
| Maquette : « Qui … où » et « Roi du coin » par joueur — la route ne renvoyait que des cellules **agrégées** (tout le clan ou un seul membre) | Route étendue : `memberBreakdown` (§4) |

## 2. La page

- **Bandeau** (`DockingToolbar`), docké **aussi sur mobile** sur une ligne : exception nommée à sticky.md §2
  (`MOBILE_DOCKED_EXTRA_CONTROLS`), comme les zones de drop. Composants partagés `MapPager` et `PickerChip`
  (`src/components/maps/MapToolbarControls.tsx`) ; « N kills · Erangel » à droite sur ordinateur.
- **Événements** : sept tuiles ; le compteur additionne les deux sens (KO infligés + reçus…).
- **Carte** (`DropZoneMapViewport` : zoom, molette, glisser) : sens de l'événement en haut à gauche (Infligés / Reçus,
  Donnés / Reçus) seulement quand il en a ; étiquette de la carte voisine et « Glisse la carte pour changer de map » ;
  puce « Ville · Toute la carte ✕ » une fois zoomé ; message « Aucun événement « morts » pour le clan sur Miramar cette
  semaine » quand il n'y a rien.
- **Phase du cercle** : Toutes / Début (phases 1–2) / Milieu (3–4) / Fin (5–8), cercles qui rétrécissent. Hors
  « Toutes », la zone de sécurité moyenne de la plage s'affiche, l'extérieur en bleu.
- **Zone chaude** : gros plan sur la ville n° 1 de l'événement, formulé selon lui (« Là où le clan fait ses kills »,
  « … prend cher », « … se fait relever ») ; « Roi du coin » (ou « Le plus touché » pour un événement subi).
- **Rapport de force** : kills contre morts du clan dans les 4 villes les plus disputées ; « Terrain gagnant » à partir
  de 1,3 kill par mort, « À éviter » sous 0,8, « Équilibré » entre les deux.
- **Top 5** de l'événement (en ville / hors ville) et **« Qui … où »** : une carte par joueur (nombre, ville n° 1,
  K/D sur la carte), **paginée par chevrons** (4 par page, 2 sur mobile) ; toucher une carte filtre la carte.
- **Lien préfiltré** du panneau « Villes » (`CityInsightsPanel`, tableau de bord et zones de drop d'un joueur) :
  `?map=` et `?view=` (kill, damage, revive) choisissent la carte et l'événement au premier affichage.

Logique pure : `src/lib/positions-view.ts` (événements, villes, rapport de force, tailles, répartition par joueur),
composants : `src/components/positions/PositionsExplorer.tsx`.

## 3. Données

`GET /api/clans/[clanId]/telemetry/positions?period=&map=&memberKey=&phase=` — permission `clan.positions`, cache
mémoire de 5 minutes. Réponse inchangée (cellules 40 × 40 par métrique : `kills`, `deaths`, `shots`, `damageDealt`,
`damageTaken`, `knockoutsDealt`, `knockoutsTaken`, `revivesGiven`, `revivesTaken`, `vehicles`, `safeZoneOverlay`…),
plus :

```ts
memberBreakdown: Array<{
  memberKey: string          // clé canonique (compte PUBG, sinon pseudo)
  memberLabel: string
  totals: Partial<Record<PositionMetric, number>>
  byLocation: Partial<Record<PositionMetric, Record<locationId, number>>>
}>
```

Toujours **tout le clan** (même carte, période et phase), quel que soit `memberKey` : « Qui … où » reste complet quand
un joueur est filtré.

## 4. Une lecture par membre

`loadMemberPositionMetricCells` (`src/lib/position-metric-aggregation.ts`) groupe `PositionMetricCell` par
`memberId, metric, xIndex, yIndex` ; la route en tire la carte (membre filtré ou clan) **et** la répartition. Elle
remplace la lecture agrégée dans la route (`loadAggregatedPositionMetricCells` reste pour
`scripts/compare-position-metrics.ts`). Les matchs sans cellules sont relus comme avant ; `aggregateRawPositionRows`
renvoie en plus `memberCells`, dans la même passe.

Mesuré le 2026-09-27 sur le plus gros clan (Erangel, tout l'historique) : **54 000 lignes en 3,4 s** contre 9 000 en
2,0 s pour la lecture agrégée — une lecture remplace l'autre, et le cache de 5 minutes absorbe les allers-retours.

## 5. Tests

| Fichier | Couvre |
|---|---|
| `src/lib/positions-view.test.ts` | Événements et sens, centre des cellules, répartition par ville, rapport de force et verdicts, tailles et halos, répartition par joueur, roi du coin, carte « Qui … où » |
| `src/lib/position-metric-raw-aggregation.test.ts` | Cellules par membre : sans filtre de membre, avec la plage tactique |
| `src/lib/ui-conformance.test.ts` | Exception nommée du bandeau docké complet sur mobile |
| `e2e/positions.spec.ts` | Sept événements et compteurs, un seul rendu, sens sur la carte, épingles et zoom, zone chaude, rapport de force, top 5, phase et zone moyenne, filtre joueur (bandeau et « Qui … où »), message vide, glisser, bandeau docké sur une ligne, lien préfiltré `?map=&view=`. Données : `e2e/support/positions.ts` |

## Voir aussi

- [Zones de drop](drop-zones.md) — même bandeau, même carte, mêmes épingles
- [Villes et zones de combat](positions-villes.md) — `PositionMetricCell`, panneau « Villes » et son lien préfiltré
