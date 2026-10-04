# Densité des positions en fin de zone

Livré le 2026-09-17. Page `/clans/[clanId]/stats/zone-closures` (« Fin de zone », nav `clan.zone-closures`).

Répond à : **où l'escouade termine ses rotations quand un rétrécissement s'achève ?** Ce sont des positions
d'arrivée, pas une densité d'événements de combat.

## Ce qu'est une fin de zone

Dans `phaseSnapshots`, `isGame` alterne entre `x` (cercle annoncé, zone bleue stable) et `x.5` (zone bleue en train
de se refermer). Au premier instantané où `isGame` redevient entier, la zone sûre vaut exactement le cercle qui était
annoncé — vérifié sur des matchs réels : à `isGame = 2`, `safetyZoneRadius` reprend le `poisonGasWarningRadius`
de `isGame = 1`.

C'est donc l'instant de fermeture, et la zone sûre de cet instantané est le **nouveau cercle stable**. La ligne est
enregistrée sous le numéro de la phase qui commence (2 à 9), donc les mêmes plages tactiques que les cellules de
positions : Début 1–2, Milieu 3–4, Fin 5–8.

La phase 1 n'est pas une fermeture : la zone sûre y couvre encore toute la carte.

## Ce qui est enregistré

Table `ZoneClosurePosition`, une ligne par membre suivi, par match et par fermeture (contrainte unique) :

| Champ | Contenu |
|---|---|
| `phase` | Phase qui commence à la fermeture |
| `xIndex` / `yIndex` | Case de la grille 40 × 40 |
| `xPercent` / `yPercent` | Position exacte en pourcentage de carte |
| `distanceRatio` | Distance au centre du nouveau cercle ÷ son rayon |
| `zoneBand` | `center` (≤ 0,5), `edge` (≤ 1), `outside` (> 1) |
| `survivorCount` | Joueurs encore en vie dans le lobby à cette fermeture |

**Position retenue** : le dernier échantillon connu du membre avant l'instant de fermeture, s'il date de moins de
180 secondes (`MAX_POSITION_AGE_SECONDS`) — au-delà, il ne dit plus où le joueur se trouvait.

**Membres morts** : un membre mort avant la fermeture ne produit aucune ligne. La mort est jugée sur la phase
(`deathSamples.phase`), car `deathSamples.timestampSeconds` est un horodatage absolu, pas une durée de match.

## Biais de survie, à garder en tête

Les phases tardives ne décrivent que les membres encore en vie. Le nombre d'observations décroît donc avec les
phases, et une escouade éliminée tôt ne pèse que sur les premières fermetures — voire sur aucune : sur le clan 1,
**environ un tiers des matchs** ne produisent aucune ligne, l'escouade étant morte avant la première fermeture
(vers la dixième minute). La page affiche le nombre d'observations, de fermetures, de matchs et de joueurs pour que
ce biais reste lisible, et signale les échantillons de moins de 20 observations.

## La page

Refondue le 2026-10-04 selon la charte UI (règle « Pages à carte », [docs/ui/index.html](../ui/index.html#zoom-carte)) et
pour être lue par les joueurs, pas seulement par l'analyste.

**Bandeau** : photo `/banner-phases.jpg` (le mur de la zone bleue), titre Teko. **Filtres** sur une ligne, comme les
zones de drop et la cartographie tactique : carte ‹ ›, période, pastille joueur (couleur du style de jeu sur la période,
`usePlaystyleColors`) ; docké sur mobile, la ligne reste entière (exception `MOBILE_DOCKED_EXTRA_CONTROLS` du contrôle
`ui-conformance`). Phase du cercle : le `PhasePicker` de la cartographie, à côté de la carte. Plus de listes
déroulantes à intitulé (« Carte », « Joueur », « Plage tactique »).

De haut en bas :

- **la carte des arrivées** (points à l'accent, taille selon le nombre d'arrivées dans la case) et, à côté, **la cible** :
  centre / bord intérieur / dehors en anneaux (`--game-pos` / `--game-warn` / `--game-neg`), la distance moyenne au
  centre en pointillés d'accent, exprimée en **% du rayon** (0 au centre, 100 sur le bord) plutôt qu'en ratio brut ;
- **un verdict** en une phrase : « La zone vous colle aux talons » (≥ 30 % dehors), « Maîtres du centre » (≥ 25 % au
  centre), « Surfeurs de bord » (≥ 55 % au bord), sinon « Placement équilibré » ;
- **trois titres** parmi les joueurs d'au moins dix fermetures : *Roi du cercle* (le plus près du centre en moyenne),
  *Increvable* (le plus de fermetures vécues), *Coureur de zone bleue* (le plus souvent dehors, s'il l'a déjà été) ;
- **phase par phase** : une barre centre / bord / dehors par phase qui commence, et la part dehors ;
- **le top 5 des secteurs d'arrivée** (périmètres de villes configurés) ;
- **« Qui joue le cercle »** : les joueurs du plus central au plus excentré, avec un profil — *Court après la zone*
  (≥ 33 % dehors), *Joue le centre* (≥ 25 % au centre), *Longe le bord* (≥ 60 % au bord), *Équilibré* ; « trop peu de
  fermetures » sous dix. Toucher un joueur filtre la carte, la cible et le verdict. Paginé comme « Qui saute où » des
  zones de drop : chevrons ‹ n/N › dans l'en-tête, 5 joueurs par page sur mobile, 8 au-delà, rangs continus d'une page à
  l'autre ; un joueur choisi par la pastille du bandeau amène sa page.

Seuils calés sur les données réelles (`scripts/measure-zone-closures.ts`, lecture seule, clan 13 le 2026-10-04) : le
bord domine (50 à 68 % des fermetures), le centre reste rare (10 à 30 %), 14 à 45 % finissent dehors. Un seuil
« majorité au centre » ne serait jamais atteint. Logique pure : `src/lib/zone-closure-view.ts` (tests
`zone-closure-view.test.ts`) ; composants : `src/components/zone-closures/ZoneClosureSections.tsx`.

L'API renvoie désormais, pour chaque membre (mêmes filtres que la page, sans le filtre de membre), sa distance moyenne
et ses bandes : une seule requête agrégée de plus en SQL (`SUM(z.zoneBand = 'center')`…), 60 à 400 ms pour la page
complète selon la période. Tests e2e : `e2e/zone-closures.spec.ts`.

## Alimentation

Les trois chemins de synchronisation écrivent la table après le parsing
(`persistZoneClosurePositionsForMatch`). Rattrapage des matchs déjà analysés :

```bash
npm run telemetry:zone-closures:backfill              # tous les clans
npm run telemetry:zone-closures:backfill -- --clan 1  # un clan
```

Le rattrapage ne peut traiter que les matchs qui ont encore leurs `positionSamples` : pour les matchs purgés, les
fins de zone sont définitivement perdues (voir [Performance de la base](../ops/database-performance.md) §4.4).

## Contrôle sur données réelles

```bash
npx tsx scripts/inspect-zone-closures.ts <clanId> [squadMatchId]
```

Affiche les fermetures détectées d'un match, la position retenue par membre, sa distance au nouveau cercle, puis les
agrégats du clan. Mesure du 2026-09-17 sur le clan 1 : 718 positions, 343 fermetures, 87 matchs sur Erangel, résumé
complet en 132 ms ; parts centre 19 %, bord 54 %, hors zone 28 %.

## Voir aussi

- [Villes et zones de combat](positions-villes.md) — mêmes périmètres de villes, sur les tableaux de bord
- `docs/TODO/todo.md`, section « Évolution — Densité des positions en fin de zone »
