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

Filtres : période (semaine, mois, tous), carte, joueur, plage tactique. Elle montre :

- quatre indicateurs : observations, position moyenne (`distanceRatio`), part dans le cercle, survivants moyens ;
- la carte des positions d'arrivée, un point par case, taille proportionnelle au nombre d'arrivées ;
- le détail par fermeture : observations, parts centre / bord / hors zone, ratio moyen ;
- le Top 5 des secteurs d'arrivée, avec les périmètres de villes déjà configurés.

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
