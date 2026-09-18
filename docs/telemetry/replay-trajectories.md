# Télémétrie PUBG — Trajectoires : avion de largage et joueurs

Ce document décrit comment le replay 2D reconstitue la trajectoire de l'avion de largage et le déplacement des joueurs à partir de la télémétrie PUBG stockée dans `SquadMatchTelemetry`.

Il consigne surtout les **pièges vérifiés sur données réelles** : plusieurs champs portent un nom trompeur ou une sémantique contre-intuitive, et s'y fier naïvement produit des trajectoires fausses sans lever la moindre erreur.

**Fichiers concernés**

| Fichier | Rôle |
|---|---|
| [`src/lib/pubg-telemetry/match-replay.ts`](../../src/lib/pubg-telemetry/match-replay.ts) | Construction du payload replay, normalisation du temps, ancrage des pistes |
| [`src/lib/pubg-telemetry/flight-path.ts`](../../src/lib/pubg-telemetry/flight-path.ts) | Plan de vol (depuis les sauts, repli sur les atterrissages), horaires de survol, position de l'avion, cap compas |
| [`src/lib/pubg-telemetry/position-heatmap.ts`](../../src/lib/pubg-telemetry/position-heatmap.ts) | Bornes cartographiques `getMapBounds` |
| [`src/components/telemetry/MatchReplay2D.tsx`](../../src/components/telemetry/MatchReplay2D.tsx) | Lecteur canvas : interpolation, caméra, calques, avion, rendu |
| [`src/components/ui/MapZoomControl.tsx`](../../src/components/ui/MapZoomControl.tsx) + [`src/lib/map-zoom.ts`](../../src/lib/map-zoom.ts) | Zoom standard des cartes, partagé avec les drop zones |
| [`src/app/api/clans/[clanId]/matches/[matchId]/replay/route.ts`](../../src/app/api/clans/%5BclanId%5D/matches/%5BmatchId%5D/replay/route.ts) | Route qui assemble le payload |

**Matchs de référence** utilisés pour toutes les mesures citées ici :

- `cmu00zh2r2e9t04tztbp80kfk` — Erangel (`Baltic_Main`), 2026-09-13, 100 joueurs, 27 équipes
- `cmtoouiyw8t6304b22w3f4u8y` — Sanhok (`Savage_Main`), 2026-09-05, 96 joueurs, 29 équipes
- `cmu027vpd3ftl04tzlejla0vk` — Karakin (`Summerland_Main`), 2026-09-13, 64 sauts — celui qui a révélé l'erreur de cap (§6.4)

---

## 1. Système de coordonnées

Les coordonnées télémétriques sont exprimées en **centimètres**, origine en haut à gauche, `x` vers l'est et `y` vers le **sud**. Cette orientation correspond directement à celle d'une image : aucune inversion d'axe n'est nécessaire pour projeter sur la carte.

```
xPourcent = x / bounds.width  * 100
yPourcent = y / bounds.height * 100
```

Les bornes proviennent de `getMapBounds(mapName)` et ne correspondent pas toujours à la taille commerciale de la carte :

| Carte | Clé technique | Bornes télémétrie | Image `public/maps/pubg/` |
|---|---|---|---|
| Erangel | `Baltic_Main` | 819 200 | 1008 × 1008 |
| Miramar | `Desert_Main` | 819 200 | 1008 × 1008 |
| Taego | `Tiger_Main` | 819 200 | 1008 × 1008 |
| Vikendi | `DihorOtok_Main` | 819 200 | 1008 × 1008 |
| Deston | `Kiki_Main` | 819 200 | 1008 × 1008 |
| Rondo | `Neon_Main` | 819 200 | 1008 × 1008 |
| Sanhok | `Savage_Main` | 409 600 | 1008 × 1008 |
| Paramo | `Chimera_Main` | 307 200 | 1008 × 1008 |
| Karakin | `Summerland_Main` | 204 800 | 1008 × 1008 |
| Camp Jackal | `Range_Main` | 819 200 | 819 × 819 |
| Haven | `Heaven_Main` | 102 400 | 819 × 819 |

Toutes les images sont carrées : aucune distorsion d'aspect n'est à compenser au rendu.

> ⚠️ **Les coordonnées peuvent sortir des bornes.** Sur le match Erangel de référence, `yMin = -51 267`, soit **−6,3 %** : c'est l'avion qui survole la mer au nord avant d'entrer sur la carte. Ne jamais `clamp` ces valeurs au rendu d'une trajectoire, sous peine de coller artificiellement l'avion au bord.

---

## 2. Deux bases de temps coexistent

C'est le piège le plus coûteux du stockage télémétrie : **rien dans le schéma ne signale que les horodatages n'ont pas tous la même origine**.

| Champ | Base de temps |
|---|---|
| `positionSamples[].timestampSeconds` | **Secondes relatives** au début du match |
| `trajectorySegments[].timestampStart/End` | Secondes relatives |
| `phaseSnapshots[].timestampSeconds` | Secondes relatives |
| `landingSamples[].timestampSeconds` | **Epoch absolu** |
| `deathSamples[].timestampSeconds` | Epoch absolu |
| `knockoutSamples[].timestampSeconds` | Epoch absolu |
| `reviveSamples[].timestampSeconds` | Epoch absolu |
| `vehicleSamples[].timestampSeconds` | Epoch absolu |
| `KillEvent.timestampSeconds` (table SQL) | Epoch absolu |

Sans normalisation, un atterrissage s'affiche à la seconde `1 788 628 072` d'un match qui en dure `1 385`.

La conversion est centralisée dans `toRelativeSeconds` (`match-replay.ts`), avec `SquadMatch.createdAt` comme origine :

```ts
const EPOCH_THRESHOLD_SECONDS = 1_000_000

export function toRelativeSeconds(value: unknown, matchStartEpochSeconds: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const relative = value > EPOCH_THRESHOLD_SECONDS ? value - matchStartEpochSeconds : value
  return Number.isFinite(relative) ? Math.max(0, Math.round(relative)) : null
}
```

Le seuil de `1 000 000` s est sûr : aucune partie ne dure onze jours.

---

## 3. `positionSamples` couvre tout le lobby

Contrairement aux kills et aux dégâts — filtrés sur le roster du clan à la persistance — **les positions concernent tous les joueurs de la partie**.

| Match | Échantillons | Acteurs distincts | Équipes | Plage temporelle |
|---|---|---|---|---|
| Erangel | 5 568 | 100 | 27 | 0 → ~1 670 s |
| Sanhok | 4 591 | 96 | 29 | 0 → 1 361 s |

La raison tient à une garde du parser :

```ts
const isPositionClanMember =
  accumulator.clanMemberKeys.size === 0 ||
  accumulator.clanMemberKeys.has(actorKey.toLowerCase())
```

Sur le chemin de synchronisation principal, `clanMemberKeys` est **vide** — la résolution du clan se fait plus tard, à la persistance. La garde laisse donc tout passer. C'est la même mécanique que pour le kill-feed et les lancers d'utilitaires.

**Conséquence pratique :** le mode « Global 100 joueurs » du replay n'a demandé aucune modification du parser ni du stockage.

Chaque échantillon porte `memberKey`, `teamId`, `phase`, `timestampSeconds`, `x`, `y` et `inVehicle`. L'échantillonnage est d'**au moins 10 secondes par joueur** (`minPositionSampleIntervalSeconds`, défaut 10) : le lecteur doit donc interpoler.

---

## 4. Piège majeur — les positions à `t=0` ne sont pas l'avion

C'est l'erreur qui a produit les trajectoires fantômes en début de partie.

**Hypothèse intuitive (fausse) :** à `t=0` tous les joueurs sont dans l'avion, donc leur position commune donne le point d'entrée de l'appareil.

**Mesure sur le match Erangel :**

| Grandeur | Valeur |
|---|---|
| Moyenne des positions à `t=0` (n=99) | `(565 965, 305 667)` |
| Médiane des positions à `t=0` | `(526 775, 321 081)` |
| Position réelle de l'avion à `t=0` (extrapolée des sauts) | `(83 000, -87 000)` |

Deux constats :

1. Moyenne ≠ médiane ⇒ les joueurs ne sont **pas** groupés en un point à `t=0`.
2. Le barycentre est à environ **6 km** de la position réelle de l'appareil, lequel se trouve alors hors carte au nord-ouest.

Ces positions correspondent au spawn / à l'île d'attente. Les interpoler avec le premier point réel trace une diagonale de plusieurs kilomètres et place les joueurs n'importe où pendant les ~20 premières secondes.

> **Règle :** ne jamais utiliser `positionSamples` antérieurs au saut pour reconstituer un déplacement.

---

## 5. Source exacte — les sauts hors de l'avion

`vehicleSamples` contient un couple `ride` / `leave` par montée et descente de véhicule, avec position et horodatage. Le départ d'un aéronef **est** la position de l'avion à cet instant.

Types observés sur le match Erangel :

| Clé | Occurrences |
|---|---|
| `ride:TransportAircraft` / `leave:TransportAircraft` | 109 / 109 |
| `ride:WheeledVehicle` / `leave:WheeledVehicle` | 172 / 172 |
| `ride:EmergencyPickup` / `leave:EmergencyPickup` | 8 / 8 |
| `ride:FlyingVehicle` | 2 |
| `ride:FloatingVehicle` / `leave:FloatingVehicle` | 2 / 2 |

Trajectoire reconstituée à partir des seuls départs d'aéronef du largage initial :

| Point | Temps relatif | Coordonnées |
|---|---|---|
| Premier saut | 19 s | `(274 364, 97 448)` |
| Dernier saut initial | 60 s | `(689 490, 491 681)` |

Soit **5 725 m en 41 s ≈ 140 m/s** sur Erangel. Angle de l'axe : **+43,5°**, soit un cap compas de **134° (SE)** — voir §6.4 pour la différence entre les deux.

### Borner impérativement la fenêtre de largage

Sur 109 départs d'aéronef, **10 surviennent plus de 900 s après le premier** : ce sont les avions de rappel de fin de partie (puce bleue, évacuation d'urgence). Les inclure fait repartir la « trajectoire » vers le sud-est et la fausse complètement.

`extractInitialJumps` ne retient donc que les sauts survenant dans les **120 secondes** suivant le premier, et conserve le **premier** saut de chaque joueur :

```ts
const INITIAL_DROP_WINDOW_SECONDS = 120
```

---

## 6. Calcul du plan de vol

Deux implémentations coexistent dans `flight-path.ts`, avec un ordre de préférence strict.

### 6.1 `computeFlightPathFromJumps` — exact, à privilégier

Prend la liste des sauts du largage initial, triée par horodatage :

- `dropStart` = premier saut
- `dropEnd` = dernier saut de la fenêtre
- l'axe est prolongé jusqu'aux bordures de la carte par `extendToMapBorders`

L'ordre temporel des sauts suit exactement la progression de l'appareil : l'orientation est donc **non ambiguë**.

### 6.2 `computeFlightPath` — repli sur les atterrissages

Utilisé uniquement si les départs d'aéronef manquent (snapshot ancien, parser v1). Moyenne les extrémités
(15 % des atterrissages les plus précoces et les plus tardifs, au moins un de chaque côté et jamais les mêmes points
des deux côtés) pour en déduire un axe.

**Cette méthode est imprécise par construction** : le moment d'atterrissage dépend surtout de la distance planée par chaque joueur, pas de sa position sur la ligne de vol. Un joueur qui saute tôt et plane loin atterrit tard.

#### Garde-fou : pas d'axe plutôt qu'un faux axe (2026-09-18)

Le repli ne publie plus d'axe quand les largages couvrent **moins de 15 % de la largeur de la carte**
(`MIN_LANDING_BASELINE_RATIO`). Une escouade qui saute groupée ne dit rien de la ligne de vol, et l'erreur est
d'autant plus visible que la carte est petite.

Cas mesuré, match de tournoi Paramo `cmthld13a00dd04aw8xu80llc` (2026-08-31) : quatre joueurs sautés en 4 s
atterrissent en grappe sur **174 m, soit 5,7 % de la carte**. Le repli déduisait un axe à **−69,3°** alors que les
sauts réels donnent **−32,6°**. Une droite tirée d'un bord à l'autre de la carte à partir de ce bruit est pire
qu'aucune droite.

Le plan de vol porte maintenant sa provenance (`source: 'jumps' | 'landings'`), et le replay signale un axe de repli
par une pastille « axe estimé » à côté du cap.

### 6.3 Comparaison mesurée

| Méthode | `dropStart` | `dropEnd` | Angle de l'axe | Écart des points de saut à la ligne |
|---|---|---|---|---|
| Sauts (exacte) | `(274 364, 97 448)` | `(689 490, 491 681)` | **43,5°** | **0 m** |
| Atterrissages (repli) | `(378 862, 144 855)` | `(599 048, 377 407)` | 46,6° | 217 m |
| Référence mesurée | — | — | 44° | — |

Sur Erangel, les deux méthodes donnent la **même orientation générale**. Le repli n'est pas inversé — c'est un point qu'il a fallu vérifier explicitement, une mesure intermédiaire trompeuse ayant d'abord laissé croire à une inversion de 180° (voir §9).

**Ce n'est pas vrai sur toutes les cartes.** Sur le match Karakin `cmu027vpd3ftl04tzlejla0vk`, le repli se trompe de **45°** :

| Méthode | Angle de l'axe | Cap compas |
|---|---|---|
| Sauts (exacte) | −93,2° | **357° (N)** |
| Atterrissages (repli) | −48,2° | 42° (NE) |

Sur une petite carte, la distance planée pèse proportionnellement plus que la progression de l'avion : le repli n'est qu'un dernier recours.

### 6.4 Angle de l'axe ≠ cap compas

`FlightPath.angleDeg` est un **angle trigonométrique** : compté depuis l'**est**, dans le sens horaire (l'axe `y` pointe vers le sud). Un cap se compte depuis le **nord**. Conversion centralisée dans `compassHeadingDeg` :

```ts
cap = (angleDeg + 90) mod 360      // −93,2° → 357° ; 43,5° → 134°
```

`compassCardinal` en déduit le point cardinal français (`N`, `NE`, `E`, `SE`, `S`, `SO`, `O`, `NO`).

> ⚠️ **Erreur corrigée le 2026-09-13.** L'ancien badge « Cap C-130 » de la carte tactique affichait `angleDeg` normalisé
> sous le nom de cap, calculé de plus depuis les atterrissages. Sur le match Karakin il indiquait **312°** pour un avion
> qui volait en réalité au **357° (N)** : deux erreurs cumulées, source et convention. L'icône était en outre tournée de
> `angleDeg − 45°` alors que l'icône Lucide `Plane` pointe nativement au nord-est : la rotation correcte est `cap − 45°`.

### 6.5 Horaires de survol — animation de l'avion

`computeFlightPathFromJumps` renvoie aussi `timing` (secondes relatives) : l'appareil vole en ligne droite à vitesse constante, donc chaque point de l'axe a un horaire de passage, extrapolé depuis les deux sauts extrêmes.

```ts
vitesse = distance(dropStart, dropEnd) / (dropEndT − dropStartT)
startT  = dropStartT + projection(start − dropStart sur l'axe) / vitesse
endT    = dropStartT + projection(end   − dropStart sur l'axe) / vitesse
```

`aircraftPositionAt(flight, t)` interpole entre `start` et `end` et renvoie `null` hors de `[startT, endT]`. Le repli sur les atterrissages ne fournit **aucun** horaire (`timing: null`) : l'avion n'est alors pas animé, seule la ligne est tracée.

**La vitesse dépend de la carte** — ne jamais la coder en dur :

| Match | Carte | Sauts | Vitesse mesurée | Cap | Écart avion ↔ saut (médian / max) |
|---|---|---|---|---|---|
| `cmu00zh2r2e9t04tztbp80kfk` | Erangel | 99 | **140 m/s** | 134° SE | 30 m / 113 m |
| `cmtoouiyw8t6304b22w3f4u8y` | Sanhok | 88 | **71 m/s** | 189° S | 18 m / 52 m |
| `cmu027vpd3ftl04tzlejla0vk` | Karakin | 64 | **48 m/s** | 357° N | 18 m / 34 m |

L'écart résiduel entre la position animée et chaque saut vient de l'arrondi des horodatages à la seconde dans `toRelativeSeconds` (½ s × 140 m/s ≈ 70 m sur Erangel) : invisible à ×1, perceptible à ×8.

---

## 7. Ancrage des pistes de joueurs

Pour chaque joueur, la piste est construite ainsi :

1. **Premier point** = son saut hors de l'avion (position et instant exacts).
2. Les `positionSamples` **antérieurs au saut** sont écartés.
3. L'atterrissage en parachute (`landingSamples`) sert de point intermédiaire.
4. Les `positionSamples` suivants complètent la piste.
5. Les points de même horodatage sont dédupliqués.

```ts
if (accum.jump !== null && t < accum.jump) continue
```

Résultat sur le match Erangel : **99 joueurs sur 100** sont ancrés sur leur saut, avec un écart de **0 m** à la ligne de vol. Le centième n'a aucun départ d'aéronef enregistré (déconnexion avant largage) ; ses positions brutes sont alors conservées telles quelles, faute de mieux.

### Vies successives — mort et rappel

> ⚠️ **Bug corrigé le 2026-09-13.** Le payload ne retenait qu'**une** mort par joueur (`d` = première mort) et le
> lecteur masquait le joueur au-delà. Sur le match Karakin `cmu027vpd3ftl04tzlejla0vk`, Pagiotte (mort à 94 s) et
> SAMUELAXEII (mort à 177 s) disparaissaient donc **pour tout le reste de la partie**, rappels compris.

Un joueur peut mourir puis revenir par l'**avion de rappel** (`LogPlayerUseRespawn`). Ce que la télémétrie stockée en montre, mesuré sur Pagiotte :

| Instant | Source | Signification |
|---|---|---|
| 89 s | `knockoutSamples` (victim) | mis à terre |
| 94 s | `deathSamples` `(95 118, 74 740)` | mort |
| 98 → 147 s | `positionSamples` figées en `(95 118, 74 740)` | **cadavre** — à écarter |
| 147 → 659 s | aucune position | attente du rappel |
| 659 s | `positionSamples` `inVehicle: true` | à bord de l'avion de rappel — à écarter |
| 661 s / 668 s | `vehicleSamples` `ride` / `leave` `TransportAircraft` | embarquement / **saut** du rappel |
| 695 s | `landingSamples` | atterrissage |
| 1 013 s | `deathSamples` | mort définitive |

`LogPlayerUseRespawn` n'est **pas** persisté en échantillon (seul le compteur `memberStats[*].recalls` existe) : c'est le **saut** d'un avion postérieur à une mort qui marque le retour. `computeReplayLives` découpe ainsi la présence en vies `l: [[27, 94], [668, 1013]]` :

- une vie s'ouvre au saut (initial ou de rappel) et se ferme à une mort ;
- une mort sans saut ultérieur est définitive (`d`) ; `d` vaut `null` si la dernière vie court jusqu'à la fin ;
- seules les positions **situées dans une vie** sont conservées, et chaque vie est bornée par des points exacts (saut de rappel, lieu de la mort) pour que l'interpolation ne relie jamais un cadavre à la vie suivante ;
- le lecteur (`lifeAt`, `samplePlayerAt`) n'interpole qu'entre deux points de la même vie et coupe les traces à chaque mort.

### Escouade = équipe, pas seulement le clan

Sur ce même match, l'équipe 1 compte **4 joueurs dont 2 seulement sont membres du clan 1** : CdtMcKoy et dada14smc sont des coéquipiers hors clan (résolus via `Player`). Classés en lobby externe, ils étaient anonymes (`#1`) et masqués en mode Escouade hors combat — d'où « on ne voit pas le nom des 4 joueurs ».

Le payload expose désormais `sq: true` pour tout joueur de la **même équipe** qu'un membre du clan consulté. Le lecteur les traite comme l'escouade : toujours visibles et nommés, dans le suivi caméra et le compteur « en vie », couleur turquoise (`#2dd4bf`) pour les distinguer des membres du clan (émeraude).

### Événements dérivés des vies

| Événement | Source | Pourquoi |
|---|---|---|
| `recall` (`a` = joueur, position du saut) | chaque vie après la première | rendre le retour visible (journal, onde bleue « RAPPEL ») |
| `kill` sans acteur (`a = null`) | chaque mort qui ferme une vie, **sans** `KillEvent` à ±2 s pour la même victime | `KillEvent` n'est persisté que pour le clan suivi : la mort d'un coéquipier hors clan passait inaperçue |

Côté lecteur : état **à terre** (anneau ambre pointillé, « (à terre) » sur le nom) d'un knock jusqu'à la réanimation ou la mort ; réanimations et rappels flashés 4 s avec libellé ; journal et flashs **filtrés par mode de visibilité**, pour que les knocks du lobby ne chassent pas une réanimation de l'escouade.

Mesures après correction :

| Match | Escouade | Rappels | Réanimations | Morts dans le journal | Poids gzip |
|---|---|---|---|---|---|
| Karakin `cmu027vpd3ftl04tzlejla0vk` (clan 1) | 4 (dont 2 hors clan), 7 vies | 9 dans le lobby, 3 dans l'escouade | 15 (4 escouade) | 72 | 29 Ko (28 avant) |
| Erangel `cmu00zh2r2e9t04tztbp80kfk` | — | 10 | 28 | 107 (≈5 avant) | 59 Ko (56 avant) |

### Avions de rappel

`computeRecallFlights` (`flight-path.ts`) reconstitue chaque avion de rappel à partir des `ride` / `leave` `TransportAircraft` postérieurs à la fenêtre du largage initial, regroupés par écart de moins de 30 s. Vérifié sur Karakin : la position d'un **embarquement** est bien celle de l'appareil — même axe et même vitesse que les sauts.

Deux précautions :

- **horodatages non arrondis** (`toPreciseRelativeSeconds`) : un vol ne dure souvent que 3 à 12 s entre premier embarquement et dernier saut ; un arrondi à la seconde fausserait la vitesse de 15 % ;
- **ajustement par moindres carrés** de la position en fonction du temps, puis prolongement jusqu'aux bordures pour animer l'entrée et la sortie.

| Vol (Karakin) | Survol | Vitesse | Cap | Rappelés |
|---|---|---|---|---|
| R1 | 354 → 379 s | 86 m/s | 107° E | 2 |
| R2 | 498 → 529 s | 67 m/s | 355° N | 1 |
| R3 | 650 → 690 s | 53 m/s | 257° O | 4 |
| R4 | 766 → 848 s | 28 m/s | 325° NO | 2 |

Les vitesses diffèrent d'un vol à l'autre ; chaque vol reste aligné (sur R3, l'avion animé passe à moins de 10 m du saut de 668 s — test `computeRecallFlights`). Côté lecteur, **ligne et appareil ne sont affichés que pendant le survol** (calque « C-130 & rappels »), en ambre pour les distinguer du C-130 initial, avec un badge « Avion de rappel : cap · rappelés » et des raccourcis `R1…Rn`.

### Caisses de largage

Extraites par le parser dans la colonne `carePackageSamples` (voir [parser.md](parser.md), événement 16 — repli sur `summary.carePackages` pour les matchs re-parsés le 2026-09-13) et converties par `buildMatchReplayPayload` en `crates` : `sp` largage, `t` atterrissage, `lt` premier pillage, `sq` pillée par l'escouade. Le lecteur les dessine selon l'instant : parachute pendant la chute, caisse pleine une fois posée, contour seul une fois pillée, anneau émeraude si l'escouade l'a pillée ; nom de l'arme sous la caisse principale à partir de ×3. Couleurs : rouge (principale), ambre (satellites), bleu (puce bleue), vert (véhicule).

> Les matchs parsés avant le 2026-09-13 n'ont pas de caisses : le calque « Largages » est alors grisé avec la raison au survol. Une re-synchronisation télémétrie (matchs de moins de 14 jours) les ajoute.

### Frags de tout le lobby

Le replay et le débriefing complètent les `KillEvent` par la colonne `killFeedSamples` (`mergeKillFeedWithKillEvents`). Conséquences : une mort a désormais un tueur même hors clan suivi, et les kills d'un coéquipier dont le clan n'a pas synchronisé le match apparaissent (duels, Combat Log, kill-feed du replay). Les frags issus de la télémétrie sont marqués « télémétrie » dans l'interface. Sans cette colonne (match parsé avant le 2026-09-14), on retombe sur les seuls `KillEvent` et sur les morts « X éliminé » sans tueur.

### Coéquipiers hors clan dans le débriefing

La route `/matches/[matchId]/telemetry` expose `squadMates` (`squad-mates.ts`) : les joueurs de la même équipe qu'un membre du clan qui ne figurent pas dans `SquadMember`, avec leurs statistiques de `memberStats`. Pour les membres suivis, télémétrie et API concordent exactement (kills, dégâts, réanimations) ; seules les **assistances** n'existent pas côté télémétrie. Le bandeau, les indicateurs « escouade », le tableau de l'onglet Escouade et les silhouettes anatomiques les incluent désormais.

Un coéquipier peut être **suivi dans un autre clan du site** sans avoir de ligne `SquadMember` pour le clan consulté (son clan n'a pas encore synchronisé le match). La route cherche donc une fiche `ClanMember` pour chaque coéquipier : `trackedClan` renseigné → badge violet « [SMK] suivi » ; aucune fiche → badge « non suivi », avec en info-bulle la date de dernière résolution du tag de clan PUBG (`Player.clanResolvedAt`), qui peut être périmé.

Le Combat Log considère toute l'**escouade** (clan + coéquipiers) dans son filtre « Escouade », ajoute les **rappels** (`extractRespawnEvents`, même règle que les vies du replay) et affiche une légende sur les sources.

### Format de piste

Les pistes sont aplaties en tableau de nombres, 4 entrées par échantillon, pour limiter le poids réseau :

```
p = [t₀, x₀, y₀, inVehicle₀, t₁, x₁, y₁, inVehicle₁, …]
```

| Match | JSON brut | Gzip |
|---|---|---|
| Erangel (100 joueurs, 153 zones, 143 événements) | 154 Ko | **56 Ko** |
| Sanhok (96 joueurs, 137 zones, 123 événements) | 131 Ko | **47 Ko** |

À titre de comparaison, un client qui téléchargerait le fichier télémétrie brut manipulerait 30 à 60 Mo.

---

## 8. Cercles de zone

`phaseSnapshots` fournit l'état des zones. Les noms de champs sont trompeurs : **malgré le suffixe `Meters`, les rayons sont en centimètres**, dans la même unité que les coordonnées.

| Champ | Signification |
|---|---|
| `safetyZoneX` / `safetyZoneY` / `safetyZoneRadiusMeters` | Zone jouable courante (limite du mur bleu) |
| `poisonGasWarningX` / `poisonGasWarningY` / `poisonGasWarningRadiusMeters` | Prochaine zone (cercle blanc) |
| `isGame` | Numéro de phase, décimal (`0.1`, `1`, `1.5`, `2`…) |
| `numAlivePlayers` / `numAliveTeams` | Survivants à l'instant du snapshot |

Projection d'un rayon :

```ts
rayonPourcent = radius / bounds.width * 100
```

> ⚠️ **`poisonGasWarningX/Y` n'a été ajouté au parser qu'en septembre 2026.** Les snapshots antérieurs ne portent que le **rayon** du prochain cercle, jamais son centre : `px` / `py` valent alors `null` et le lecteur n'affiche pas le cercle blanc. Un re-parse le peuple — vérifié à 170 snapshots sur 170 sur une capture réelle. Pour un match déjà analysé, passer par « Resync ce match » (page « Audit Technique Brut ») : `npm run telemetry:batch -- --clan <id>` ignore les matchs déjà en `success`.
>
> Le rayon du prochain cercle vaut `0` pendant la phase `0.1` (avant le premier rétrécissement) : conditionner l'affichage à `pr > 0`.

Le lecteur interpole linéairement centre et rayon entre deux snapshots encadrant l'instant courant (`sampleZoneAt`), ce qui donne un rétrécissement continu.

---

## 9. Méthode de diagnostic — et un contre-exemple utile

Une mesure intermédiaire a d'abord conduit à une conclusion fausse. Elle est consignée ici parce que le raisonnement est reproductible.

**Mesure trompeuse :** angle déduit du déplacement du barycentre des positions entre `t=0` et `t=20` → **−145°** (nord-ouest), contre `+46,6°` pour le plan de vol calculé (angles trigonométriques, §6.4). Conclusion apparente : orientation inversée de 180°.

**Pourquoi c'est faux :** les positions à `t=0` sont celles du spawn (§4), et à `t=20` une partie des joueurs a déjà sauté et dérive en parachute. Aucun des deux barycentres ne représente l'avion.

**Mesure fiable :** les départs d'aéronef donnent `+44°`, cohérents avec les `46,6°` du plan de vol. **Le plan de vol n'était pas inversé** ; le vrai défaut était l'ancrage des pistes sur des positions de spawn.

**Leçon :** avant de « corriger » une orientation, valider la référence elle-même sur une source dont la sémantique est certaine. Un barycentre de joueurs n'est un point physique qu'à la condition qu'ils soient effectivement groupés — ce que la comparaison moyenne / médiane permet de vérifier en une ligne.

### Scripts de diagnostic

| Script | Usage |
|---|---|
| [`scripts/inspect-replay-scale.ts`](../../scripts/inspect-replay-scale.ts) | Dimensions des assets, bornes effectives des positions, cap de l'avion par trois méthodes, types de `vehicleSamples` |
| [`scripts/inspect-match-replay.ts`](../../scripts/inspect-match-replay.ts) | Construit le payload replay hors HTTP : affiliations, zones, événements, poids réseau, écart des ancrages à la ligne de vol |

```bash
npx tsx scripts/inspect-replay-scale.ts Baltic_Main
npx tsx scripts/inspect-match-replay.ts <squadMatchId> <clanId>
```

---

## 10. Rendu dans le lecteur

`MatchReplay2D` dessine sur un `<canvas>` 2D sous `requestAnimationFrame`.

**Interpolation** — `samplePlayerAt(player, time)` cherche la vie en cours (`lifeAt`), fait une recherche dichotomique dans la piste aplatie, puis interpole linéairement entre les deux échantillons encadrants **de cette vie**. Un joueur est masqué hors de ses vies : avant son saut, entre une mort et un rappel, après sa mort définitive (§7).

**Caméra** — centre normalisé `(cx, cy)` plus facteur d'échelle, gérés dans le canevas et non par un conteneur scrollable. Ce choix est imposé par le suivi caméra et le rendu à 60 fps. Le **comportement** suit en revanche le standard des cartes du site ([`docs/ui/index.html#zoom-carte`](../ui/index.html#zoom-carte)), identique aux drop zones :

- contrôle `MapZoomControl` `[ − | ⊙ 1× | + ]` en haut à droite, paliers additifs de ×0,5, de ×1 à **×8** (plafond relevé par rapport aux ×4 des drop zones pour séparer les joueurs d'un même bâtiment) ;
- molette par écouteur natif `{ passive: false }`, un palier par cran, `preventDefault()` seulement si le zoom change ;
- déplacement au glisser uniquement au-delà de ×1, caméra **bornée à la carte** par `clampCameraToMap` (y compris pendant un suivi caméra près d'un bord) ;
- bouton central : carte entière et libération du suivi caméra.

Le zoom conserve le point situé sous le curseur :

```ts
camera.cx = worldX - (anchor.x - width / 2) / (baseScale * nouveauZoom)
```

**Avion C-130** — calque « C-130 » (actif par défaut) : ligne de vol pointillée, tronçon déjà parcouru en bleu pendant le survol, fenêtre de largage (premier saut en vert, dernier en ambre), silhouette d'avion dessinée en dernier au-dessus des joueurs, et badge « Cap C-130 : 357° N » en haut à gauche, complété de « · 12/64 sautés » pendant le survol.

**Calques hérités de l'ancienne « Carte Tactique 2D »** — l'onglet statique a été supprimé le 2026-09-13 et ses usages repris ici, en version chronologique (tout ce qui s'est produit jusqu'à l'instant courant) :

| Ancienne carte tactique | Replay |
|---|---|
| Trajectoires de l'escouade, filtrables par phase | Calque « Trace complète » (trajet depuis le saut, y compris des membres morts) + boutons `P1…Pn` qui positionnent la lecture au début de chaque phase |
| Points d'atterrissage (identifiant brut `account.xxx` au survol) | Calque « Atterrissages » (marqueurs sans libellé, escouade plus contrastée) |
| Points d'élimination | Calque « Éliminations » |
| Cercle de zone de la phase sélectionnée | Cercles interpolés en continu (§8) |
| Badge « Cap C-130 » (faux, §6.4) | Badge corrigé + avion animé |

En mode Escouade, un adversaire n'a de marqueur persistant qu'à partir de son premier échange (knock, kill, réanimation) avec l'escouade.

Côté API, la route `/matches/[matchId]/telemetry` ne renvoie plus `flightPath` : son seul consommateur était l'onglet supprimé.

**Projection** — `baseScale = Math.min(largeur, hauteur)` et la carte est dessinée en carré : le rendu reste correct même si le canevas ne l'est pas.

**Performance** — le temps courant vit dans une `ref`, pas dans un état React. Le curseur de la timeline est piloté par manipulation directe du DOM, et un `setState` n'est déclenché qu'au changement de seconde entière (1 rendu/s à vitesse ×1, 8/s à ×8).

---

## 11. Limites connues

| Limite | Cause |
|---|---|
| Pas de lignes de tir individuelles | `shotSamples` est agrégé en clusters spatiaux, sans horodatage exploitable. Le lecteur trace la ligne tueur → victime au moment du frag ou du knock. |
| Granularité de 10 s | `minPositionSampleIntervalSeconds` ; l'interpolation lisse mais ne restitue pas les micro-déplacements. |
| Joueurs sans saut enregistré | Déconnexion avant largage : leurs positions de spawn restent affichées, faute de point d'ancrage. |
| Avion non animé sur les vieux snapshots | Sans départs d'aéronef, le plan de vol vient des atterrissages : pas d'horaire (`timing: null`), et un cap qui peut être faux de 45° sur petite carte (§6.3). |
| Écart avion ↔ saut jusqu'à ~110 m | Horodatages arrondis à la seconde (§6.5). |
| Tueur inconnu sur les morts hors clan | `deathSamples` ne porte pas le tueur ; seul `KillEvent` (clan suivi) le fournit. Le journal affiche « X éliminé ». |
| Rappel sans mort enregistrée | Si la mort manque dans `deathSamples`, aucune vie n'est fermée : cadavre et avion de rappel restent interpolés comme avant la correction. |
| Cercle blanc absent sur l'historique | `poisonGasWarningX/Y` n'existe que sur les snapshots parsés après septembre 2026. |
| Replay indisponible après purge | `/settings/superuser/database` permet de purger `positionSamples` et `trajectorySegments` ; la route renvoie alors `REPLAY_NO_POSITIONS` (404). |

---

## Voir aussi

- [Parser](parser.md) — détail des 15 événements parsés et des champs extraits
- [Pipeline](pipeline.md) — chaîne CDN → parse → persistance
- [API — contrats](api.md) — contrats JSON des routes télémétrie
- [Ops production](ops.md) — backfill, re-parse, variables d'environnement
