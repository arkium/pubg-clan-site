# Carte des ressources

Page `/carte-des-ressources`, entrée « Carte des ressources » du menu principal (sous « Tournois » et « Mortier »).
Une carte par map PUBG avec deux sortes de points :

- **observés** — les véhicules (voitures, motos, bateaux, planeurs) pris en début de partie dans les parties suivies
  par le site, regroupés en emplacements et recalculés chaque nuit ;
- **saisis** — stations-service, garages, pontons et salles secrètes placés par les joueurs, validés par un
  SuperUser, signalables et à reconfirmer après une mise à jour PUBG.

Maquettes source : Claude Design, projet « Audit design avec améliorations », fichiers « Carte des ressources - A faire »
(vue joueur : carte, fiche, signaler, proposer — bureau et mobile) et « Carte des ressources - superuser » (file de
validation, historique). Les salles secrètes ont été ajoutées à la demande (2026-10-05).

## 1. Décisions (2026-10-05)

| Question | Décision |
|---|---|
| Portée des points saisis | **Communs à tout le site** : une seule carte par map, validée par les SuperUsers (rôle global). Les véhicules observés sont aussi calculés sur toutes les parties suivies. |
| Voitures et motos | **Séparées à partir des nouvelles parties** : le parser garde désormais le modèle du véhicule (`vehicleId`, présent sur 100 % des événements des captures locales). Les parties plus anciennes n'ont que la famille « véhicule à roues » : couche « Voitures ou motos », qui s'efface d'elle-même avec la fenêtre de 90 jours. `vehicleUniqueId` est lu aussi, mais PUBG ne l'envoie pas (aucune occurrence de juin à septembre 2026). |
| Place de la page | Menu principal, page globale ; le filtre « Autour de nos drop zones » suit le clan sélectionné. |
| Fraîcheur des véhicules observés | **Chaque nuit** (cron `resource_vehicle_spots`, 06:30) ; la fiche dit « Mis à jour chaque nuit ». |

## 2. Données disponibles (mesure du 2026-10-05, `scripts/measure-resource-vehicles.ts`)

Sur les 400 parties les plus récentes : la télémétrie garde les montées de **tous les joueurs** de la partie
(~300 par partie), avec la famille PUBG du véhicule (`WheeledVehicle`, `FloatingVehicle`, `rubberboat`,
`FlyingVehicle`, et à ignorer `TransportAircraft`, `EmergencyPickup`, `Mortar`), la phase et la position.
Répartition des parties : Erangel 169, Vikendi 123, Karakin 82, Taego 12, Rondo 7, Miramar 6, Sanhok 1 — sur
Miramar et Sanhok, les emplacements observés seront rares au début.

## 3. Véhicules observés

Règles dans `src/lib/resources/resource-map.ts` (pur) ; calcul dans `src/lib/resources/resource-vehicle-spots.ts`.

- **Observation** d'une partie : les montées de début de partie (phase ≤ 1) d'un joueur seul à bord (un véhicule, pas
  ses passagers ; avant le 2026-10-04, `teammateAboard` manque et chaque passager compte une observation — cela gonfle
  `observations`, pas `matches`, donc pas les seuils). Si PUBG envoie un jour `vehicleUniqueId`, la première montée de
  chaque véhicule (son point d'apparition) remplace cette règle sans autre changement.
- **Écartées** : les montées au lobby (avant la première montée dans l'avion de largage — en juin 2026, un événement
  plaçait une moto au lobby dans 20 parties sur 66 : faux emplacement), les types de partie `custom`, `event`,
  `arcade` et `rumble` (on garde `official`, `competitive`, `airoyale`), et une télémétrie illisible (partie comptée
  comme illisible, le calcul continue).
- **Famille** (`classifyVehicle`) : planeur (`FlyingVehicle`), bateau (`FloatingVehicle`, `rubberboat`), moto
  (motos dont Ducati Panigale et Harley Road Glide, scooters, motocross, vélos, motoneiges, tuk-tuk **et quad** —
  modèles relevés sur les captures de télémétrie), voiture (autres véhicules à roues, skins compris), « voiture ou
  moto » (véhicule à roues sans modèle connu).
- **Emplacement** (`clusterObservations`) : cases de 40 m, fusionnées sous 90 m ; on retient le nombre
  d'observations et de **parties distinctes**.
- **Fréquence affichée** : parties où l'emplacement a servi / parties analysées sur la carte (« 62 % des parties :
  trouvé ici — 48 observations sur 78 parties analysées »).
- **Seuil d'affichage, relatif à la famille sur la carte** : au moins 3 parties, 0,5 % des parties, et le quart de
  l'emplacement le plus fréquent de la même famille. Un seuil unique de 5 % (première version) effaçait bateaux et
  planeurs : au premier remplissage (2026-10-05, 17 359 parties), l'emplacement le plus fréquent atteignait 24–27 %
  pour les véhicules à roues (6,7 % sur Sanhok, plus dispersé) mais 3,5 % au plus pour un bateau et 0,8–6,6 % pour un
  planeur. Résultat : Erangel 32 emplacements de véhicules à roues, 9 de bateaux, 2 de planeurs ; Miramar 18 / 6 / 0 ;
  Taego 34 / 2 / 3 ; Vikendi 54 / 0 / 5 ; Sanhok 51 / 1 / 0.
- **Taille d'un marqueur** : relative au plus fréquent de sa famille parmi les emplacements affichés (le meilleur
  emplacement de bateaux se voit autant que celui des voitures).
- **Fenêtre** : parties des 90 derniers jours.

## 4. Points saisis

Types : station-service, garage, ponton, salle secrète. Statuts : `pending` → `validated` (ou `rejected`) ; un
point validé peut être déplacé, changer de type ou être retiré (`removed`) après un signalement accepté.

- **Proposer** (joueur connecté) : placer le point, choisir le type, commentaire facultatif. Le point apparaît en
  pointillés pour son auteur et les SuperUsers seulement ; l'auteur peut annuler sa proposition.
- **Signaler** : « N'existe plus », « Mal placé » (nouvelle position), « Mauvais type » (nouveau type), commentaire
  facultatif. Les signalements identiques sont regroupés dans la file de validation (« 3 joueurs »).
- **Toujours là** : confirmation d'un point validé. Après une mise à jour PUBG, un SuperUser marque la carte « à
  revérifier » : ses points validés passent « à confirmer » jusqu'au prochain « Toujours là ».
- **Contributeur** : « 12 points validés » = propositions validées + signalements acceptés du joueur. Le nom affiché
  est le pseudo du compte ou celui d'un membre lié — jamais l'e-mail.

## 5. Vue SuperUser

Onglets réservés « Carte | Validation | Historique » sur la même page (`?tab=validation|history`).

- **Validation** : file de toutes les cartes (propositions et signalements regroupés), mini-cartes Avant / Après,
  Valider, Modifier (type ou marqueur déplacé, puis validation), Refuser — chaque décision est **annulable** ;
  sélection multiple. Panneau « Par carte » : « À revérifier après mise à jour PUBG », « Marquer vérifiée ».
- **Historique** : décisions des 30 derniers jours, paginées ; chaque entrée garde l'état d'avant et d'après, et
  « Annuler » restaure l'état d'avant si rien n'a changé depuis.
- Détails d'interface : mini-cartes Avant / Après de 400 m de côté ; éditeur de position de 1 km (pointeur, ou
  flèches 10 m / Maj + flèches 50 m) ; notification annulable 7 s (un lot s'annule action par action) ; « Valider la
  sélection » affiche le nombre choisi ; l'historique se lit par pages de 7, page en état local.

Carte : zoom jusqu'à ×8 (`RESOURCE_MAP_MAX_ZOOM`, boutons, molette) et, sur mobile, **pincement à deux doigts**
(zoom continu, calé au lâcher sur le palier de ×0,5 le plus proche — commun à toutes les cartes de
`DropZoneMapViewport`, 05/10/2026). Le fond de carte reste l'image de 1 008 px : au-delà de ×4, il devient flou.

Page joueur — choix de mise en œuvre : un emplacement observé ne se signale pas (il est calculé) ; les compteurs des
couches sont recalculés côté page (filtre drop zones compris) ; cercles de 800 m visibles quand le filtre est actif ;
« Toujours là » et « Signaler » désactivés une fois faits ; pas de puce d'état pour une carte jamais vérifiée ;
libellé « Saisis par les joueurs » (points communs au site, la maquette disait « par le clan »).

## 6. Données

Migration `20261005090000_add_resource_map` — sept tables, aucune modification de table existante :

| Table | Rôle |
|---|---|
| `ResourcePoint` | Point saisi (carte, type, position en mètres, statut, auteur, validateur, dernière confirmation) |
| `ResourceReport` | Signalement (motif, position ou type proposés, commentaire, statut) |
| `ResourceConfirmation` | « Toujours là » |
| `ResourceMapState` | Vérification d'une carte (`verifiedAt`, `recheckSince`) |
| `ResourceAction` | Historique des décisions, état avant / après pour l'annulation |
| `ResourceVehicleSpot` | Emplacements de véhicules observés (recalculés chaque nuit) |
| `ResourceVehicleMapStat` | Parties analysées par carte (dénominateur des fréquences) |

## 7. Repères de grille

`gridLabel` : une lettre par kilomètre, colonnes A, B, C… d'ouest en est et lignes I, J, K… du nord au sud
(« D-M »), comme les cartes de 8 km du jeu. **À vérifier en jeu** pour Sanhok (4 km : A–D × I–L).

## 8. Fichiers

- Règles et contrat : `src/lib/resources/resource-map.ts`, `src/lib/resources/resource-api.ts`.
- Serveur : `src/lib/resources/resource-service.ts` (vue joueur, erreurs, noms des contributeurs),
  `resource-service-admin.ts` (file, décisions, cartes, historique, annulation), `resource-history.ts` (pur : états
  avant / après, comparaison, libellés), `src/app/api/resources/**` (11 routes) ; tests :
  `resource-route-contracts.test.ts`, `resource-history.test.ts`, base en mémoire `resource-test-db.ts`.
- Règles du serveur : proposition annulée par son auteur = ligne supprimée (rien n'avait été validé), refus d'un
  SuperUser = `rejected` ; 20 propositions en attente par joueur ; doublon refusé à moins de 25 m (même type) ;
  « mal placé » à plus de 15 m ; « n'existe plus » validé annule les autres signalements du point (restaurés par
  l'annulation) ; l'annulation ne restaure que les champs que la décision avait changés (un « Toujours là »
  postérieur est gardé) ; libellés de l'historique figés au moment de la décision. Drop zones : lues dans
  `DropPressureStat` (atterrissages du clan, 90 jours), même droit que la page « Zones de drop ».
- Agrégat : `src/lib/resources/resource-vehicle-spots.ts`, cron `resource_vehicle_spots`,
  `scripts/compute-resource-vehicle-spots.ts` (`--dry-run`).
- Page : `src/app/carte-des-ressources/page.tsx`, `src/components/resources/` (vue SuperUser :
  `src/components/resources/admin/`).

## 9. Calcul nocturne et déploiement

- Cron `resource_vehicle_spots` (`RESOURCE_VEHICLE_SPOTS_CRON`, défaut `30 6 * * *`, après le comptage de purge géo
  de 06:00), avec un verrou contre deux passages simultanés. Pas de ligne `CronExecution` : la table exige un clan, la
  tâche est globale (comme `db_maintenance`) ; trace : `ResourceVehicleMapStat.computedAt` et le journal.
- Une carte à la fois, télémétrie lue par lots de 50 (`decodeTelemetryRow`), une transaction par carte (emplacements
  remplacés, puis statistiques). Mesure en lecture seule (2026-10-05, `--dry-run --limit 150`) : 713 parties en
  1,2 s, 80 Mo de tas ; environ 17 500 parties sur 90 jours au total.
- `scripts/compute-resource-vehicle-spots.ts [--dry-run] [--limit n]` (`limit` par carte) : premier remplissage fait le
  2026-10-05 après la migration (appliquée le même jour) — 17 359 parties en 29 s, tas max 151 Mo.
- **À déployer** : le worker de télémétrie (le parser garde `vehicleId` — environ +1,2 Ko compressé par partie) et le
  service cron (nouvelle tâche).
