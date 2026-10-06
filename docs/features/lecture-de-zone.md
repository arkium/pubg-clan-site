# Lecture de zone — analyse et entraînement

Page `/lecture-de-zone`, entrée « Lecture de zone » du menu latéral, juste sous « Carte des ressources »
(`primary.zone-reading`). Deux onglets : **Analyse** (ce que la ligne de vol du C-130 dit des cercles, sur toutes les
parties du site) et **Entraînement** (« Où finit la zone ? », dix vraies parties rejouées, classement du clan). Une
section de la vitrine (`/`) la présente, sous Discord.

Maquette source : Claude Design, projet « Audit design avec améliorations », fichier « Lecture de zone - A faire »
(bureau 1280 px et mobile 375 px). Code livré le 2026-10-06 ; la maquette a été **recadrée sur les données réelles**
(§1).

---

## 1. La maquette confrontée aux données (2026-10-06)

Le brief de la maquette posait comme idée centrale que « la zone finale se termine presque toujours sur la ligne de
vol ». Mesuré en lecture seule sur la base (`scripts/measure-zone-reading.ts`), ce n'est pas le cas :

| Indicateur (Erangel, échantillons de 1 500 à 3 000 parties) | Brief | Données |
|---|---|---|
| Distance médiane zone finale → ligne de vol | 61 m | **871 m** |
| Zones finales dans la bande ±200 m | 9 sur 10 | **1,2 sur 10** (0,7 au hasard) |
| La ligne traverse le cercle 1 | 100 % | 100 % (68 % avec la ligne d'une autre partie) |
| Centre du cercle 1 → ligne | 344 m | **899 m** (1 372 m avec la ligne d'une autre partie) |
| Cercle suivant plus proche de la ligne (C1 → C7) | 99 % → 53 % | **47 à 50 %** : le hasard |
| Erreur en visant le centre (C1 à C4) | 600 / 311 / 183 / 101 m | 593 / 310 / 184 / 102 m |
| Erreur en visant la ligne (C1 à C4) | 366 / 215 / 150 / 106 m | **1 016 / 808 / 570 / 367 m** (repère ramené dans le cercle) |
| Secteur du cercle suivant (8 secteurs) | — | 13 % de bonnes réponses au mieux : le hasard |

Mêmes ordres de grandeur sur Miramar, Taego, Vikendi, Sanhok et Rondo. La colonne « centre » du brief tombe juste :
ses chiffres venaient bien de vraies parties, le calcul de la ligne était faux. Ce qui tient : **l'avion place le
premier cercle** (toujours traversé, centre plus proche que par hasard) ; ensuite, les cercles se déplacent au hasard
et **viser le centre** est toujours le meilleur repère.

```bash
npx tsx scripts/measure-zone-reading.ts counts                    # volumes par carte et par mode
npx tsx scripts/measure-zone-reading.ts sample Baltic_Main 3000   # chiffres de l'analyse sur un échantillon
npx tsx scripts/measure-zone-reading.ts detail Baltic_Main 3      # contrôle de quelques parties (sauts, cercles)
```

**Décisions prises avec l'utilisateur le 2026-10-06 :**

| Sujet | Décision |
|---|---|
| Message de l'onglet Analyse | **Recadré** : même structure de blocs, mais chaque titre, verdict et règle est calculé depuis les chiffres (§3). Accroche du bandeau : « L'avion donne le premier cercle, pas la zone finale. » |
| Score de l'exercice 1 | **Moyenne par étape** : le marqueur est noté à chacun des cercles 1 à 4, comparé aux repères calculés sur le même cercle. La maquette notait le marqueur après le cercle 6 (écart quasi nul pour tous) face à des repères calculés sur le cercle 1 |
| Exercice 2 « Sens de fermeture » | **Supprimé** : 13 % de bonnes réponses au mieux, son classement aurait mesuré la chance |
| Emplacement | **Page globale**, comme le Mortier : l'analyse a besoin de toutes les parties du site (un clan seul passe rarement 300 parties par carte), le menu latéral ne porte que des pages globales |

**Autres écarts à la maquette, tranchés en cours d'implémentation :**

- **Solo retiré** du filtre de mode : 3 parties personnalisées en base. Restent Squad et Duo.
- **Période « 30 j / 90 j / Tous »** : périodes glissantes ajoutées au module partagé (`ROLLING_PERIODS`,
  `src/lib/period.ts`) ; « Tout » est interdit par le contrôle de conformance, c'est « Tous ».
- **« Avec avion — une série sur deux »** contredisait le bilan (« 5 parties avec / 5 sans » dans une même série) :
  l'avion est caché **une partie sur deux**, la pastille de l'en-tête dit « Avec avion » ou « Sans avion ».
- **Axe orientable** : la maquette filtrait les parties sur l'angle seul ; deux lignes parallèles peuvent être à
  plusieurs kilomètres. Le filtre porte sur l'angle (±7°) **et** la position (±6 % de la carte, ±492 m sur 8 km), et la
  ligne se déplace en plus de tourner.
- **Exemple « trop peu de parties »** : Rondo dans la maquette, qui a 1 064 parties ; en pratique, Haven (40).
- **Note « Petites cartes »** retirée : elle commentait l'ancienne thèse.
- **Image du bandeau** : la maquette reprenait `recall.jpg` (le rappel de coéquipier). Nouvelle image à produire (§8).

---

## 2. Données — table `ZoneReadingMatch`

Une ligne par partie (`SquadMatch`), écrite au parsing de la télémétrie par les trois chemins de synchronisation
(`persistZoneReadingMatchForMatch`, après les fins de zone). **Jamais bloquant** : une erreur d'écriture est
journalisée sans faire échouer la synchronisation. Logique : `src/lib/zone-reading/zone-reading-match.ts`.

| Champ | Contenu |
|---|---|
| `mapName`, `matchDate`, `teamMode` | Carte, date de la partie, `squad` / `duo` / `solo` (FPP compris) |
| `flightSource` | `jumps` (sauts hors de l'avion, écart nul) ou `landings` (repli approximatif) |
| `lineStartX/Y`, `lineEndX/Y` | Ligne de vol prolongée jusqu'aux bords de la carte (cm) |
| `circles`, `circleCount` | Cercles stables C1..Cn `[{ x, y, r }]` (cm) : C1 est le cercle atteint à la fermeture de la phase 2 (`detectZoneClosures`) |
| `finalX`, `finalY` | Zone finale : centre du dernier cercle stable atteint |

- Seules les parties de **battle royale classique** sont écrites (`solo|duo|squad`, `-fpp` compris) ; pas le camp
  d'entraînement. Le **type de partie** (`official`, `competitive`) est filtré à la lecture, sur `SquadMatch`, qui peut
  être reclassé après coup : événements, arcades et parties personnalisées sont écartés.
- `vehicleSamples`, `landingSamples` et `phaseSnapshots` ne sont pas touchés par la purge géographique : le rattrapage
  couvre **tout l'historique** (environ 24 000 parties le 2026-10-06).

```bash
npm run telemetry:zone-reading:backfill               # relançable : les parties déjà écrites sont ignorées
npm run telemetry:zone-reading:backfill -- --limit 500
```

---

## 3. Onglet Analyse

`GET /api/zone-reading?map=&mode=&period=` (public) : toutes les parties du site pour la carte, le mode et la période,
gardées en mémoire **dix minutes** par combinaison. Carte par défaut : la plus jouée. Sous **300 parties** sur la carte,
la page affiche le compteur (« 40 / 300 ») et un raccourci vers la carte la plus jouée à la place des chiffres.

Calculs purs : `src/lib/zone-reading/zone-reading-analysis.ts` et `zone-reading-geometry.ts` (mètres, partagés avec
les tests e2e).

| Bloc | Contenu | Texte calculé |
|---|---|---|
| 01 L'avion et la zone | Carte avec un axe orientable, la bande de 200 m de chaque côté, les zones finales des parties dont la ligne de vol est proche (au plus 400 points) ; trois chiffres : distance médiane zone finale → ligne, part des parties où la ligne traverse le cercle 1 (et la même part avec la ligne d'une autre partie), distance médiane du centre du cercle 1 à la ligne | `bandHeadline` (« Seulement 1 zone finale sur 10 finit dans cette bande ») et `bandExplanation` (comparaison au hasard : chaque zone finale confrontée à la ligne de la partie suivante) |
| 02 Sens de fermeture | Barres C2 à C8 : part des cercles plus proches de la ligne que le précédent, repère 50 % = hasard ; barre à l'accent au-delà de 60 % | `closingVerdict` (« L'avion place le premier cercle. Ensuite, c'est le hasard. ») |
| 03 La règle pratique | Erreur médiane sur la zone finale en visant le centre ou la ligne, cercles 1 à 4, meilleur choix en vert. Repère « ligne » : point de la ligne le plus proche du centre, ramené sur le bord du cercle quand la ligne le manque | `practicalRule` (« Vise le centre du cercle, dès le premier. ») |
| 04 Où finit la zone | Grille 8 × 8 (cases de 1 km sur 8 km, colonnes A–H, lignes I–P comme la carte du jeu), « Toutes les parties » ou « Selon l'axe », trois cases les plus fréquentes nommées d'après les lieux configurés (`getMapLocations` : « Pochinki », « sud de School ») | — |

**Axe du C-130.** L'API renvoie une entrée compacte par partie (`[angle × 10, décalage, zone finale x, y]`) : tourner
(poignée, ↺ ↻ par 15°, flèches du clavier sur la poignée) ou déplacer la ligne (glisser la bande, boutons de
décalage) filtre dans le navigateur, sans aller-retour. Axe par défaut : celui qui regroupe le plus de parties
voisines (`densestAxis`). Le même axe sert aux blocs 01 et 04.

---

## 4. Onglet Entraînement — « Où finit la zone ? »

Règles : `src/lib/zone-reading/zone-reading-game.ts`.

| Règle | Valeur |
|---|---|
| Série | 10 parties réelles : celles du clan sélectionné sur la carte, le mode et la période choisis (au moins 5 cercles), sinon celles de tout le site |
| Étapes | Cercle 1 affiché, le joueur pose son marqueur ; « Dévoiler le cercle 2 », 3, 4 (il peut le déplacer), puis « Voir la zone finale » |
| Score d'une partie | Moyenne des écarts du marqueur à la zone finale aux quatre étapes, au dixième de mètre |
| Repères | Sur le même cercle que l'étape : son centre, et le point de la ligne le plus proche du centre (ramené dans le cercle) |
| Avec / sans avion | Ligne de vol affichée aux parties 1, 3, 5, 7, 9, cachée aux autres ; révélée en pointillés à la fin |
| Bilan | Écart moyen, parties mieux que le centre, mieux que la ligne, record perso, barres toi / centre / ligne, écart avec et sans avion |
| Classement « Le clan » | Membres actifs du clan, **écart moyen sur toutes leurs séries terminées sur la carte**, le plus bas en tête ; puis le plus de séries, puis le nom. Dix premiers + ligne du lecteur |

**Membre connecté : réponse cachée jusqu'au bout.** Le départ ne renvoie que la date, le mode, la ligne de vol (une
partie sur deux) et le cercle 1 de chaque partie. Chaque étape envoie la position (`POST …/guess`) et reçoit le cercle
suivant, puis la zone finale et les écarts calculés par le serveur. La table `ZoneReadingSeries` garde les dix parties
(géométrie comprise) et les positions ; `progress` (0 à 40) sert de verrou optimiste : une étape jouée deux fois reçoit
409. Une seule série ouverte par joueur ; une série de plus de deux heures expire.

**Visiteur** : les dix parties complètes sont envoyées d'emblée et rien n'est écrit, comme au Mortier ; invitation à
se connecter au bilan.

Clavier : la carte est focalisable ; flèches pour placer ou déplacer le marqueur (1 % de la carte, Maj : 5 %),
Entrée pour dévoiler.

---

## 5. Routes

Contrat partagé par les routes, la page et les tests e2e : `src/lib/zone-reading/zone-reading-api.ts`. Service :
`src/lib/zone-reading/zone-reading-service.ts`.

| Route | Accès | Rôle |
|---|---|---|
| `GET /api/zone-reading?map=&mode=&period=` | Public | `ZoneReadingAnalysis` : cartes, compteur, statistiques, axes compacts, axe par défaut, noms des 64 cases |
| `POST /api/zone-reading/series` `{ map, mode, period, clanId }` | Public ; série enregistrée si membre actif (201), sinon 200 | `ZoneReadingSeriesStart` ; 409 `not_enough_matches` sous dix parties |
| `POST /api/zone-reading/series/:id/guess` `{ round, step, x, y }` | Membre actif, propriétaire | `ZoneReadingGuessResult` : cercle suivant ou révélation (et bilan) ; refus 401, 403, 404, 409 (`finished`, `expired`, `out_of_order`), 400 (`invalid_guess`) |
| `GET /api/zone-reading/leaderboard?clanId=&map=` | Public ; ligne du lecteur si session | `ZoneReadingLeaderboard` |

Aucun nom de joueur dans l'analyse : des lignes de vol et des cercles.

---

## 6. Page et composants

`src/app/lecture-de-zone/page.tsx` — bandeau photo (`/lecture-de-zone.jpg`, dégradé de repli tant que l'image manque),
bandeau de filtres collant (carte ‹ ›, Squad / Duo, 30 j / 90 j / Tous, « Calculé sur N parties depuis le … »),
onglets Analyse / Entraînement (`?tab=training`, `replaceState` : l'entraînement reste monté), mention « La zone garde
une part de hasard… » sous les deux onglets. Docké sur mobile, la ligne reste entière (exception
`MOBILE_DOCKED_EXTRA_CONTROLS` de `ui-conformance.test.ts`) : sous 640 px, le mode devient un bouton qui passe au
suivant, pour que le nom de la carte reste lisible.

`src/components/zone-reading/` : `ZoneReadingMapFrame` (carte carrée, calques SVG et HTML), `ZoneReadingAxisMap`
(axe, bande, grille, commandes), `ZoneReadingAnalysis` (quatre blocs, écran « pas assez de parties »),
`ZoneReadingTraining` (série, carte jouable, révélation), `ZoneReadingSummary`, `ZoneReadingLeaderboard`,
`useZoneReadingSeries`.

---

## 7. Tests

| Fichier | Couvre |
|---|---|
| `src/lib/zone-reading/zone-reading-geometry.test.ts` | Distances, repère « ligne » ramené dans le cercle, axe non orienté (repli à 180°), rotation, segment découpé par la carte, cardinaux |
| `src/lib/zone-reading/zone-reading-analysis.test.ts` | Statistiques, comparaison au hasard, titres calculés (chiffres réels et chiffres du brief), règle pratique, grille et noms de cases, axes compacts et axe par défaut |
| `src/lib/zone-reading/zone-reading-game.test.ts` | Score par étape, verdicts, alternance avec / sans avion, bilan, positions reçues |
| `src/lib/zone-reading/zone-reading-match.test.ts` | Ligne `ZoneReadingMatch` depuis les sauts et les fermetures, modes écartés, JSON en texte |
| `src/lib/zone-reading/zone-reading-route-contracts.test.ts` | Les quatre routes, Prisma simulé : filtres et cache de l'analyse, départ visiteur / membre, étapes dans l'ordre, bilan et record, refus, classement |
| `src/lib/period.test.ts` | Périodes glissantes 30 j / 90 j, hors de `PERIODS` |
| `e2e/zone-reading.spec.ts` | Titres et chiffres recalculés, axe tourné dans un bloc et suivi dans l'autre, filtres dans la requête, carte sous le seuil, lien du menu, visiteur, série complète d'un membre au clavier (40 étapes, bilan, record, classement relu, Rejouer), aucun défilement horizontal. Données : `e2e/support/zone-reading.ts` |
| `e2e/home.spec.ts` | Section « Lecture de zone » sous Discord |

---

## 8. Mise en production

1. **Migration** `20261006180000_add_zone_reading` (deux tables, aucune modification d'existant) :
   `npx prisma migrate deploy`. Sans elle, l'analyse et les séries répondent 500 ; la synchronisation de télémétrie,
   elle, continue (écriture non bloquante).
2. **Rattrapage** : `npm run telemetry:zone-reading:backfill` (environ 24 000 parties ; 3 000 parties se lisent en
   7 s lors de la mesure).
3. **Images** (générées par IA, signalé de façon générale dans les mentions légales) :
   `public/lecture-de-zone.jpg` (bandeau, 1600 × 900) et `public/vitrine-lecture-de-zone.jpg` (section de la vitrine,
   1600 × 900, sujet à droite, gauche sombre pour le texte).
4. Facultatif : une ligne `NavItem` `primary.zone-reading` pour masquer ou renommer l'entrée depuis
   `/settings/nav-permissions` ; le lien s'affiche sans elle.

---

## 9. Limites et pistes

- Les textes de la section de la vitrine sont fixes (elle ne charge pas l'analyse) : ils reprennent les constats du
  2026-10-06, à revoir si une mise à jour de PUBG change le placement des cercles — l'onglet Analyse, lui, suit les
  données.
- Le classement mélange les séries jouées sur toutes les périodes et les deux modes d'une carte.
- Un exercice « Premier cercle » (l'avion seul, poser le centre du cercle 1) serait le seul où l'avion apporte une
  information : écarté le 2026-10-06 au profit d'un seul exercice.
