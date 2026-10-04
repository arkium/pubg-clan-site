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

### 4.1 Lenteur corrigée à la source (2026-10-04)

La page mettait **17 à 21 s** à charger, quelle que soit la période. Mesure étape par étape
(`scripts/measure-positions-route.ts`, lecture seule) : **une requête** en coûtait 15 à 17 s — le comptage des matchs
sans `PositionMetricCell`, qui part de toute la télémétrie et filtre le clan par `EXISTS` : `SquadMatch` n'a d'index ni
sur `createdAt` ni sur `mapName`, MariaDB parcourait donc tous les matchs de la base. Elle renvoie 0 aujourd'hui (le
rattrapage des cellules est terminé), mais tournait à chaque appel.

Réécrite pour **partir des membres du clan** (`ClanMember` → `SquadMember` → `SquadMatch` → télémétrie, tout le chemin
indexé, `COUNT(DISTINCT sm.id)`) : 0,1 à 0,5 s. Équivalence vérifiée sur la condition inverse, non vide
(`scripts/measure-positions-raw-count.ts` : 176 matchs / 7 cartes sur la semaine, 1 351 / 10 sur tout l'historique,
identiques carte par carte). Même réécriture pour la sélection des matchs à relire (`loadRawPositionTelemetryRows`) et les
cercles non persistés (`loadUnpersistedSafeZoneRows`, 1,1 s → 0,06 s).

| Clan 13, étapes en série | Avant | Après |
|---|---|---|
| Semaine | 18,7 s | 1,4 s |
| Mois | 17,2 s | 0,7 s |
| Tous | 21,3 s | 4,8 s (résumé par carte 2,2 s, cellules par membre 1,5 s) |

**Pas de cache en base ni de calcul par cron** : la cause était une requête, pas le volume. Un cache aurait demandé une
table (migration de la base de production), un cron et des chiffres en retard de plusieurs heures. Piste si « Tous »
reste trop lent : précalculer ce seul cas, après mesure de l'index candidat sur `PositionMetricCell`.

### 4.2 Charte UI (2026-10-04)

La page porte `.charte` et `.game-ui` ([docs/ui/index.html](../ui/index.html#zoom-carte)), selon la règle « Pages à carte » :
titre du bandeau en Teko ; « Toute la carte ✕ » en `map-overlay-active`, ville sélectionnée et phase active à l'accent
(plus de cyan, sauf le point du sélecteur de carte, identité de la page) ; épingles or / argent / bronze conservées,
textes à 11 px (10 et 9 avant) ; top 5 par `RankCell` ; rapport de force kills `--game-pos` / morts `--game-neg` ; zone
chaude sur la photo (`.app-on-photo`), ville en Teko, « Roi du coin » en or de jeu. **Joueurs** (pastille du bandeau et
« Qui … où ») à la couleur de leur **style de jeu sur la période** (`usePlaystyleColors`, légende `PlaystyleLegend`) au
lieu d'une couleur tirée du nom ; la route renvoie désormais `memberId` avec chaque joueur.

### 4.3 Véhicules : des véhicules, pas des passagers ni des avions (2026-10-04)

**Avant** : l'événement « Véhicules » comptait chaque montée et chaque descente de chaque passager (`vehicleSamples`,
LogVehicleRide / LogVehicleLeave), sur une seule carte. Trois défauts :

- **l'avion** : la montée au départ et le **saut** de chaque joueur, un tiers des échantillons, alignés sur la route
  de l'avion — et le saut est déjà la page Zones de drop ;
- **les passagers** : quatre joueurs dans une voiture faisaient huit événements ;
- **deux questions mélangées** : où le clan prend ses véhicules, et où il en descend.

**Après** : deux sens, comme KO ou Revives — **Montées** (« Véhicules pris », *Qui prend un véhicule où*) et
**Descentes** (« Véhicules laissés », *Qui laisse un véhicule où*), métriques `vehicle_ride` / `vehicle_leave`. Une
montée compte quand le véhicule est **pris** (aucun coéquipier déjà à bord), une descente quand le **dernier**
coéquipier en sort : une de chaque par véhicule. Elles reviennent au joueur qui prend le véhicule, et à celui qui le
quitte en dernier : la somme des joueurs est le nombre de véhicules. La tuile ne compte que les montées
(`countFirstRoleOnly`), sinon chaque véhicule y serait deux fois. Le conducteur (siège 0) n'est pas la bonne règle :
27 % des véhicules sont pris par une place passager.

**Engins exclus** (mesure `scripts/measure-vehicle-samples.ts`, clan 13, 60 matchs, part des échantillons) :

| Type (`vehicleType`) | Part | Retenu |
|---|---|---|
| `WheeledVehicle` (voitures, motos, BRDM…) | 65,9 % | oui |
| `TransportAircraft` (C-130) | 30,9 % | **non** |
| `EmergencyPickup` (ballon d'évacuation) | 1,6 % | **non** |
| `FlyingVehicle` (planeur) | 0,9 % | **non** |
| `FloatingVehicle` (bateaux) | 0,4 % | oui |
| `Mortar` (mortier, monté comme un véhicule) | 0,3 % | **non** |

Type absent : conservé — aucun cas sur la base, y compris les plus anciens matchs (`scripts/measure-vehicle-cells.ts`).

**Une seule règle** : `vehicleTripFlags` et `countsAsPositionVehicle` (`src/lib/vehicle-trips.ts`), appliquées à
l'écriture des cellules (`buildPositionMetricCellRows`) et à la lecture brute (`position-metric-raw-aggregation.ts`).

- **Depuis le 2026-10-04, exact** : le parseur lit `fellowPassengers` et note `teammateAboard` sur chaque échantillon
  (même `teamId`, autre joueur). Vérifié sur 40 parties brutes (`scripts/measure-vehicle-passengers.ts`, sans base) :
  0 écart avec la télémétrie. 1,66 passager par véhicule pris en moyenne, sur tout le lobby.
- **Avant, déduit** : la télémétrie stockée ne dit pas qui était à bord avec qui, et PUBG ne la garde que 14 jours.
  Une montée est « véhicule déjà pris » si un coéquipier connu (membre du clan de l'escouade) est à bord d'un véhicule
  du même type, monté à moins de 100 m ; une descente n'est pas « la dernière » si un coéquipier reste à bord et
  descend plus tard à moins de 100 m. Contre la vérité des 40 parties : **86 à 88 % des événements bien classés, total
  juste à 0,5 % (montées) et 1,3 % (descentes)**. Erreurs connues : passager pris en route compté comme preneur, deux
  motos prises côte à côte comptées comme une.

**Conversion de l'historique** : `scripts/convert-vehicle-position-cells.ts` (simulation par défaut, `--write` pour
appliquer, une transaction par page de 200 matchs, reprise par `--after`). Il remplace les cellules `vehicle` d'un
match par `vehicle_ride` / `vehicle_leave` déduites, **en gardant le membre et le clan des cellules d'origine** : un
recalcul depuis les membres actuels ajouterait des véhicules aux membres rattachés au match après coup (sans
positions ni kills pour ce match) et déplacerait ceux qui ont changé de clan (`scripts/measure-vehicle-cell-drift.ts` :
105 matchs sur 1 345 pour le clan 13, comptes identiques partout ailleurs). Ces membres servent en revanche à la
déduction : ils étaient bien à bord. Simulation : 22 991 matchs, 292 998 cellules `vehicle` (410 081 montées et descentes de passagers, avion compris) → **87 674 véhicules
pris et 87 362 laissés**, 135 868 cellules, 33 s.

**Ordre de déploiement** : `web` et `telemetry-worker`, **puis** la conversion. Entre les deux, la route ignore les
cellules `vehicle` (métrique inconnue) : la carte « Véhicules » ne montre que les nouveaux matchs. Les matchs que
l'ancien worker écrit pendant le déploiement gardent des cellules `vehicle` : relancer la conversion les reprend.

## 5. Tests

| Fichier | Couvre |
|---|---|
| `src/lib/positions-view.test.ts` | Événements et sens, véhicules pris / laissés et tuile, « le plus touché » des sens subis, centre des cellules, répartition par ville, rapport de force et verdicts, tailles et halos, répartition par joueur, roi du coin, carte « Qui … où » |
| `src/lib/vehicle-trips.test.ts` | Engins exclus ; véhicules et non passagers : télémétrie exacte, déduction de l'historique (même voiture, véhicules éloignés, types différents), joueurs hors escouade |
| `src/lib/position-metric-raw-aggregation.test.ts` | Cellules par membre : sans filtre de membre, avec la plage tactique ; véhicules pris / laissés |
| `src/lib/pubg-telemetry/position-metric-cells.test.ts` | Écriture des cellules : toutes les métriques, poids des tirs et dégâts, engins exclus, un véhicule pour deux passagers |
| `src/lib/pubg-telemetry/parser.test.ts` | `teammateAboard` lu dans `fellowPassengers` (coéquipier, adversaire, liste absente) |
| `src/lib/ui-conformance.test.ts` | Exception nommée du bandeau docké complet sur mobile |
| `e2e/positions.spec.ts` | Sept événements et compteurs, un seul rendu, sens sur la carte, véhicules (tuile = véhicules pris, Montées / Descentes), épingles et zoom, zone chaude, rapport de force, top 5, phase et zone moyenne, filtre joueur (bandeau et « Qui … où »), message vide, glisser, bandeau docké sur une ligne, lien préfiltré `?map=&view=`. Données : `e2e/support/positions.ts` |

## Voir aussi

- [Zones de drop](drop-zones.md) — même bandeau, même carte, mêmes épingles
- [Villes et zones de combat](positions-villes.md) — `PositionMetricCell`, panneau « Villes » et son lien préfiltré
