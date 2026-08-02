# Points à faire — PUBG Clan Site

Suivi des tâches restantes, classées par priorité. Mis à jour au 2026-08-01.

---

## P1 — Bloquants / manques fonctionnels immédiats

### ~~Télémétrie — Backfill v1 → v2~~ — ✅ Complété le 2026-06-21

346 snapshots `SquadMatchTelemetry` — tous `status=success`, `parserVersion=v2`. Aucun snapshot v1 résiduel.

- [x] Vérifier quels matchs en DB ont `parserVersion = 'v1'`
- [x] Lancer le backfill depuis les fichiers `.telemetry-captured/` encore présents
- [x] Vérifier après exécution que `MemberWeaponStats` est complet
- [ ] Supprimer les fichiers capturés obsolètes une fois le backfill terminé

**Référence :** `docs/telemetry/ops.md` — section Backfill v1 → v2

---

### ~~Migration SQL production~~ — ✅ Appliquée le 2026-06-20

`prisma/add-telemetry-columns.sql` appliqué manuellement sur `smk.arkium.group:3306` puis supprimé du repo. Tables et colonnes présentes en production :
- `ALTER TABLE SquadMember` — 13 champs stats
- `ALTER TABLE MemberTelemetryStats` — 3 champs heal
- `CREATE TABLE MemberSeasonStats`
- `CREATE TABLE MemberWeaponMastery`

---

### Pages UI manquantes ou non finalisées

Plusieurs pages sont décrites dans les docs comme à créer mais n'ont pas été vérifiées comme réellement implémentées :

- [x] `/clans/[clanId]/drop-zones` — page et API présentes
- [x] `/members/[id]/drop-zones` — page et API présentes
- [x] Awards — 11 awards complets, service + route API + page UI avec emojis, labels, descriptions et formatage
- [x] Défis — `refreshChallengeProgressForClan` câblée depuis `processChallenges` et `runDailyClanSync` (2026-06-23)

### ~~Drop zones membre — Lisibilité de la heatmap~~ — ✅ Complété le 2026-08-01

- [x] Remplacer les halos circulaires par des cellules carrées jointives alignées sur la grille télémétrie `40 × 40`
- [x] Appliquer cinq plages de couleur logarithmiques recalculées selon le maximum de la période, du filtre et de la carte actifs
- [x] Utiliser la palette vert clair, vert, jaune, orange et rouge pour distinguer les niveaux de densité
- [x] Faire varier logarithmiquement la transparence de `10 %` à `60 %` entre la plus faible cellule et le maximum courant
- [x] Masquer les faibles densités sous un seuil adaptatif `max(1, floor(log2(maximum)))`
- [x] Recalculer les cinq plages depuis le seuil visible et afficher le compteur `cellules visibles / cellules totales`
- [x] Conserver des aplats sans halo pour ne pas masquer le fond de carte
- [x] Appliquer un arrondi uniforme de `35 %` aux quatre coins de toutes les cellules de densité visibles, sans condition de voisinage
- [x] Afficher les points de drop zones des membres au-dessus de la couche de densité
- [x] Forcer les points de drop zones des membres en cyan totalement opaque, y compris en thème sombre
- [x] Ajouter une légende affichant les bornes absolues, le libellé de chaque niveau et le maximum courant
- [x] Conserver le détail au survol avec les coordonnées, le nombre d'atterrissages et le niveau de densité
- [x] Valider la page avec ESLint ciblé
- [x] Vérifier dans le navigateur les périodes `Semaine` (maximum 63) et `Tous` (maximum 717)
- [x] Vérifier dans le navigateur les bornes d'opacité, l'absence de halo, l'arrondi uniforme sur les cinq niveaux et l'ordre des couches
- [x] Vérifier dans le navigateur que les points membres ont `opacity: 1` et une couleur sans canal alpha
- [x] Vérifier les seuils adaptatifs `5` sur `Semaine` et `9` sur `Tous`

### ~~Cartes PUBG — Gestion des villes et périmètres~~ — ✅ Complété le 2026-08-01

- [x] Ajouter un stockage séparé `AppConfig.pubg_map_locations` sans modifier le contrat des alias de cartes
- [x] Ajouter le service de normalisation des villes avec coordonnées en pourcentage, rayon et statut actif
- [x] Ajouter `GET/PUT /api/settings/map-locations` avec permission `manage_settings` et validation Zod
- [x] Ajouter les vues `Alias des cartes` et `Villes et zones` dans `/settings/map-labels`
- [x] Permettre la sélection d'une carte, l'ajout, la modification, l'activation et la suppression d'une ville
- [x] Permettre le positionnement du centre par clic sur la carte et la saisie manuelle des coordonnées
- [x] Permettre le réglage du diamètre de `0,5 %` à `50 %` avec aperçu circulaire immédiat
- [x] Préremplir les 9 cartes disponibles avec 162 villes et zones issues des noms visibles sur les assets WebP
- [x] Permettre le préremplissage non destructif de la carte sélectionnée ou de toutes les cartes
- [x] Ajouter un zoom de `1×` à `4×`, sa réinitialisation et le déplacement dans la carte agrandie
- [x] Conserver le centre visible pendant le zoom et recentrer la carte lors de la sélection d'une ville
- [x] Conserver des coordonnées cartographiques exactes lors d'un placement sur une carte zoomée
- [x] Remplacer les contrôles externes par le viewport moderne partagé avec les pages drop zones
- [x] Superposer les contrôles de zoom sur la carte et masquer les barres de défilement
- [x] Permettre le zoom sous le curseur avec la molette et le déplacement par glisser-déposer
- [x] Distinguer un clic de placement d'un glisser de carte avec un seuil de mouvement
- [x] Passer au minimum à `2×` et centrer la carte lors de l'ajout ou de la sélection d'une ville
- [x] Vérifier le clic de placement à zoom `2×`, le drag sans déplacement de la ville et le rendu mobile sans débordement
- [x] Désactiver l'édition géographique de `Range_Main` et `Heaven_Main` tant que leurs images sont absentes
- [x] Valider un aller-retour API `PUT -> GET` puis restaurer la configuration initiale
- [x] Valider ESLint et les diagnostics VS Code sur le service, l'API et la page
- [x] Vérifier l'éditeur dans le navigateur sur desktop et mobile sans débordement horizontal

### ~~Drop zones membre — Statistiques par ville~~ — ✅ Complété le 2026-08-01

- [x] Associer chaque atterrissage à une seule ville active selon son centre et son rayon configurés
- [x] Résoudre les chevauchements par le plus faible ratio `distance / rayon`
- [x] Afficher au-dessus de la carte un Top 5 avec rang, ville, atterrissages, part, matchs et membres
- [x] Afficher pour chaque ville le membre qui y atterrit le plus souvent et son nombre d'atterrissages
- [x] Aligner le Top 5 sur le standard `app-table-*` avec podium, chiffres tabulaires et vue mobile dédiée
- [x] Afficher la ville favorite et les totaux en ville / hors périmètre
- [x] Ajouter un filtre par ville qui limite les points et recalcule la heatmap
- [x] Ajouter l'affichage facultatif des périmètres entre la heatmap et les points
- [x] Afficher `Dropzone : <ville>` dans l'infobulle de chaque point
- [x] Vérifier avec les données réelles que Pochinki est favorite avec 3 atterrissages sur la période active
- [x] Vérifier le rendu mobile sans débordement horizontal de page

### ~~Drop zones clan — Alignement avec la page membre~~ — ✅ Complété le 2026-08-01

- [x] Exposer les villes actives dans `GET /api/clans/[clanId]/telemetry/drop-zones`
- [x] Remplacer les halos radiaux par la grille carrée logarithmique `40 × 40`
- [x] Appliquer le seuil adaptatif, l'opacité `10 %–60 %`, les cinq couleurs et la légende dynamique
- [x] Ajouter le Top 5 standard `app-table-*` avec membre principal et vue mobile dédiée
- [x] Ajouter les statistiques en ville / hors périmètre et la ville favorite
- [x] Ajouter le filtre par ville avec recalcul des points et de la heatmap
- [x] Ajouter l'affichage facultatif des périmètres et les infobulles `Dropzone : <ville>`
- [x] Conserver les points colorés par membre au-dessus des périmètres et de la densité
- [x] Aligner les libellés et compteurs du bandeau sur les données filtrées
- [x] Vérifier Pochinki sur les données clan : 17 atterrissages, 6 matchs, 6 membres, Damarz principal avec 4
- [x] Vérifier le filtre Pochinki : 97 → 17 points et heatmap recalculée
- [x] Vérifier les rendus desktop et mobile sans débordement horizontal

### ~~Drop zones — Navigation cartographique~~ — ✅ Complété le 2026-08-01

- [x] Partager le viewport cartographique entre les pages membre et clan
- [x] Afficher les périmètres circulaires blancs par défaut sur les deux pages
- [x] Remplacer la case à cocher par un bouton superposé expliquant le principe d'association aux villes
- [x] Ajouter un zoom superposé de `1×` à `4×` avec niveau courant et réinitialisation
- [x] Ajouter le zoom et dézoom à la molette en conservant le point situé sous le curseur
- [x] Permettre le déplacement de la carte zoomée par glisser-déposer et masquer les barres de défilement
- [x] Conserver le centre visible lors d'un changement de zoom manuel
- [x] Passer à `2×` et centrer la ville lors d'une sélection depuis le filtre ou le Top 5
- [x] Réinitialiser le viewport lors d'un changement de carte ou de portée
- [x] Valider ESLint et les diagnostics VS Code sur le composant et les deux pages

### ~~Positions clan — Carte, villes, gradation et classement~~ — ✅ Complété le 2026-08-01

- [x] Mesurer le chargement réel de `GET /api/clans/[clanId]/telemetry/positions` sur les données hebdomadaires
- [x] Limiter le chargement des colonnes JSON lourdes à la carte sélectionnée
- [x] Supprimer le second chargement automatique de la carte initiale et dédupliquer les requêtes React simultanées
- [x] Ajouter un cache serveur de cinq minutes après vérification des permissions
- [x] Réutiliser le viewport des drop zones avec zoom, molette, déplacement et centrage
- [x] Exposer les villes actives, afficher leurs périmètres et ajouter un filtre avec centrage
- [x] Ajouter un Top 5 dynamique des villes pour la métrique visible avec podium et parts
- [x] Appliquer cinq plages logarithmiques `Très faible`, `Faible`, `Modérée`, `Forte` et `Point chaud`
- [x] Afficher les bornes absolues, le seuil adaptatif et le maximum de la métrique courante
- [x] Afficher les métriques de densité en cellules graduées et conserver des points gradués pour les événements ponctuels
- [x] Distinguer les événements ponctuels (`Kill`, `KO`, `Revive`, `Véhicule`, `Mort`) des zones de densité (`Tirs`, `Dégâts`) avec des marqueurs contrastés, des compteurs et un fond cartographique atténué
- [x] Afficher tous les événements ponctuels sans seuil et placer les marqueurs au-dessus des périmètres de villes
- [x] Conserver les couleurs par métrique en vue combinée `Tous`
- [x] Simplifier le filtre de cercle en plages tactiques `Toutes`, `Début` (phases 1–2), `Milieu` (phases 3–4) et `Fin` (phases 5–8)
- [x] Réutiliser les phases entières persistées sans migration ni backfill : chaque transition décimale reste rattachée à sa phase de départ
- [x] Appliquer la plage tactique aux métriques, au Top 5 et au cercle moyen, puis identifier celui-ci comme zone de sécurité moyenne
- [x] Vérifier le rendu desktop/mobile, le Top 5, le centrage sur Pochinki et l'absence de débordement horizontal

#### Évolution — Densité des positions en fin de zone

Objectif : montrer où les membres encore en vie terminent leurs rotations lorsque chaque rétrécissement prend fin et que le nouveau cercle devient stable. Cette vue mesure des positions d'arrivée, pas une densité d'événements de combat.

- [ ] Définir précisément une fin de zone depuis les transitions `isGame x.5 → x+1` des instantanés télémétriques
- [ ] Associer à chaque fin de zone le dernier échantillon de position connu de chaque membre encore en vie
- [ ] Compter au maximum une position par membre, par match et par fin de zone afin d'éviter les biais d'échantillonnage
- [ ] Exclure les membres morts avant la fermeture et afficher le nombre de survivants, de matchs et de fermetures observés
- [ ] Agréger les positions d'arrivée sur la grille `40 × 40` et permettre la comparaison `Début`, `Milieu` et `Fin de partie`
- [ ] Classer chaque position par rapport au nouveau cercle stable : centre, bord intérieur ou hors zone
- [ ] Ajouter un Top 5 des villes ou secteurs d'arrivée en réutilisant les périmètres cartographiques configurés
- [ ] Permettre les filtres par période, carte, joueur et plage tactique sans mélanger plusieurs observations d'un même joueur à une fermeture
- [ ] Évaluer une métrique persistée dédiée et un backfill depuis les JSON sources avant d'étendre `PositionMetricCell`
- [ ] Vérifier sur plusieurs matchs l'association temporelle entre fermeture, position joueur et cercle de référence
- [ ] Documenter le biais de survie : les phases tardives représentent uniquement les membres encore vivants
- [ ] Valider la lisibilité, les faibles échantillons et les rendus desktop/mobile avant exposition dans les dashboards

#### Phase 2 — Persistance des métriques de positions

Objectif : remplacer la lecture et l'agrégation à la demande des gros JSON télémétriques par des cellules persistantes, afin de supprimer le chargement à froid d'environ 20 secondes et de rendre ces données exploitables dans les dashboards.

##### Cadrage fonctionnel et technique

- [x] Limiter la page Positions aux catégories UI `Combat` et `Équipe` ; exclure `Mouvement` de cette page
- [x] Conserver les métriques persistées `position` et `rotation` pour les dashboards et analyses, sans les exposer dans cette page
- [x] Traiter les vues comme des métriques persistables plutôt que comme des catégories de stockage
- [x] Séparer explicitement les rôles dans les métriques : dégâts infligés/reçus, KO infligé/reçu, revive donné/reçu
- [x] Ne pas persister la vue combinée `Tous`, qui doit être reconstruite depuis les métriques élémentaires
- [x] Ne pas persister d'image de heatmap ni chaque combinaison de filtres
- [x] Retenir une granularité par match, membre, carte, phase, métrique et cellule `40 × 40`
- [x] Prévoir une contrainte d'unicité permettant le remplacement idempotent des cellules d'un match reparsé

##### Modèle et alimentation

- [x] Créer le modèle Prisma `PositionMetricCell` avec `squadMatchId`, `clanId`, `memberId`, `mapName`, `phase`, `metric`, `xIndex`, `yIndex`, `eventCount` et `matchDate`
- [x] Ajouter les relations vers `SquadMatch` et `ClanMember`, ainsi que les index nécessaires aux périodes, cartes, membres et métriques
- [x] Définir une contrainte unique sur `(squadMatchId, memberId, phase, metric, xIndex, yIndex)`
- [x] Créer et appliquer la migration SQL additive sans modifier les colonnes JSON télémétriques existantes
- [x] Extraire un helper pur qui transforme les échantillons d'un match en cellules persistables
- [x] Couvrir les métriques `position`, `rotation`, `kill`, `shot`, `damage_dealt`, `damage_taken`, `knockout_dealt`, `knockout_taken`, `revive_given`, `revive_received`, `vehicle` et `death`
- [x] Pondérer correctement les tirs et dégâts avec leur champ `count`
- [ ] Alimenter les cellules dans la même transaction que la persistance télémétrique du match
- [x] Supprimer puis recréer uniquement les cellules du match traité afin de garantir l'idempotence
- [x] Ajouter des tests unitaires pour la grille, les phases, les rôles et les poids, puis valider le remplacement idempotent sur la base

##### Backfill et validation des données

- [x] Ajouter un script CLI de backfill avec filtres `--clan`, `--limit` et reprise contrôlée
- [x] Backfiller les `1 284` télémétries du clan 1 sans supprimer les JSON sources (`161 900` cellules)
- [x] Vérifier qu'un second backfill ne modifie pas le nombre de cellules persistées (`161 900` avant/après)
- [ ] Comparer les agrégats persistés avec la route actuelle sur plusieurs cartes, membres, phases et métriques
- [x] Mesurer le volume, la durée et le stockage : environ `139 s`, `161 900` lignes, `97,4 MiB` (`24,1 MiB` données + `73,3 MiB` index)

##### API et performances

- [x] Retirer la catégorie `Mouvement`, les vues `Prédilection`, `Rotation` et `Lignes`, ainsi que leurs textes et contrôles de la page Positions
- [x] Supprimer le chargement API des trajectoires devenu inutile sur cette page, sans supprimer les données sources ni les cellules persistées
- [x] Créer un service partagé d'agrégation des cellules par période, carte, membre, phase et métrique
- [x] Migrer `GET /api/clans/[clanId]/telemetry/positions` vers `PositionMetricCell`
- [x] Conserver temporairement un fallback vers les JSON tant que le backfill n'est pas complet
- [ ] Supprimer le fallback et le cache mémoire lorsque les données persistées sont validées
- [ ] Vérifier que les filtres et le Top 5 restent identiques avant/après migration
- [x] Mesurer un premier chargement à froid inférieur à une seconde sur la période hebdomadaire (`692 ms`, cache vide)
- [ ] Ajouter des tests de route ou de service couvrant les semaines vides et les filtres combinés

##### Dashboards clan et membre

- [ ] Définir les KPI réellement utiles : événements en ville, ville favorite, zone de combat favorite et part du Top 5
- [ ] Ajouter un Top 5 des villes commutable entre présence, kills, dégâts et revives sur le dashboard clan
- [ ] Ajouter une carte miniature ou un lien préfiltré vers la page Positions sans dupliquer la heatmap complète
- [ ] Ajouter une évolution sur les huit dernières semaines avec conservation des semaines vides
- [ ] Ajouter au dashboard membre ses trois villes principales, sa zone de combat favorite et ses parts de kills/dégâts par ville
- [ ] Comparer les métriques du membre avec la moyenne du clan uniquement lorsque l'échantillon est suffisant
- [ ] Réutiliser les composants de podium, tableau et graphique déjà employés pour la pression au drop
- [ ] Vérifier les thèmes clair/sombre et les rendus desktop/mobile sur les deux dashboards

### Drop zones — Pression au drop dans un rayon de 250 m

La première phase valide le principe à partir des `landingSamples` déjà stockés, sans migration. La métrique est nommée **pression au drop** : elle mesure la fréquentation autour du point d'atterrissage, pas l'agressivité réelle du joueur.

#### Phase 1 — Calcul à la volée et validation UI

- [x] Pour chaque drop suivi, sélectionner uniquement les `landingSamples` du même match
- [x] Dédupliquer les joueurs par `memberKey` avant le comptage
- [x] Compter les autres joueurs dans un rayon réel de `250 m` (`25 000` unités PUBG)
- [x] Exposer `nearbyPlayerCount250m` pour chaque point dans les API membre et clan
- [x] Ajouter un niveau provisoire : `Calme` (0–2), `Contesté` (3–7), `Hot drop` (8–15), `Très chaud` (16+)
- [x] Remplacer chaque point par un marqueur unique dont le remplissage indique la pression
- [x] Conserver la couleur du membre sur le contour du marqueur dans la page clan
- [x] Ajouter une légende commune des quatre niveaux sur les pages membre et clan
- [x] Ajouter à l'infobulle le nombre de joueurs à moins de 250 m et le niveau de pression
- [x] Afficher la moyenne, le maximum et le pourcentage de hot drops pour `Semaine`, `Mois` et `Tous`
- [x] Ajouter au Top 5 des villes leur pression moyenne et leur part de hot drops
- [x] Vérifier par le code que les filtres de portée, joueur, carte et ville recalculent les indicateurs
- [x] Ajouter des tests unitaires pour la frontière des 250 m, la déduplication, les seuils et les agrégats
- [x] Valider ESLint, les diagnostics TypeScript et le build de production
- [ ] Valider les résultats sur plusieurs matchs réels en comparant les points proches sur la carte
- [ ] Ajuster et valider les seuils de pression à partir de la distribution observée
- [ ] Vérifier les rendus desktop/mobile et les thèmes clair/sombre sur les deux pages

### Drop zones — Changement de carte au swipe (mobile)

Objectif : sur `/clans/[clanId]/drop-zones` et `/members/[id]/drop-zones` en mode téléphone, permettre de changer de carte en glissant le pouce sur l'image, en plus de la dropdown existante. Le geste n'est actif qu'à zoom `1×` (aucun pan possible à ce niveau, donc aucune ambiguïté avec le déplacement de carte zoomée) ; les données de toutes les cartes sont déjà chargées en une seule requête par période, donc le changement de carte est un simple refiltrage client, sans latence réseau.

- [x] Ajouter `onSwipeMap?: (direction: 'prev' | 'next') => void` à `DropZoneMapViewport` (`src/components/drop-zones/DropZoneMapViewport.tsx`)
- [x] Déclencher le swipe uniquement si `zoom === MIN_ZOOM`, le geste est horizontal (`|deltaX| > |deltaY|`) et dépasse un seuil de `60px`
- [x] Ne pas interférer avec le tap (`onMapClick`) ni avec le pan existant à zoom `> 1×`
- [x] Câbler `handleSwipeMap` sur `/clans/[clanId]/drop-zones` : navigation circulaire dans le tableau `maps` triées, réutilisation de `selectMap` (dropdown + swipe partagent la même logique de sélection et de reset du viewport)
- [x] Câbler le même `selectMap` / `handleSwipeMap` sur `/members/[id]/drop-zones`, en réutilisant le composant `DropZoneMapViewport` déjà partagé
- [x] Valider ESLint et la vérification TypeScript sur les quatre fichiers modifiés (composant partagé + deux pages)
- [ ] Vérifier sur un téléphone réel le swipe gauche/droite sur les deux pages, l'absence de conflit avec le scroll vertical de la page et avec le tap de placement

#### Extension — Positions clan (`/clans/[clanId]/stats/positions`)

Contrairement aux pages drop zones, cette page ne précharge que la carte sélectionnée (optimisation déjà en place, voir "Positions clan — Carte, villes, gradation et classement" ci-dessus) : chaque changement de carte déclenche un vrai `fetch` vers `GET /api/clans/[clanId]/telemetry/positions?map=...`, atténué par le cache serveur de 5 minutes déjà en place plutôt qu'un simple refiltrage client instantané.

- [x] Ajouter `selectMap` (regroupant `setMapName`, reset du filtre de ville et `mapViewportRef.current?.reset()`) et le réutiliser dans `mapItems` (dropdown existante)
- [x] Ajouter `handleSwipeMap` qui navigue circulairement dans `payload.maps` selon la carte active (`mapName || payload.selectedMap`)
- [x] Garder le swipe inactif tant que `loading` est vrai, pour éviter d'empiler plusieurs `fetch` en cas de swipes rapprochés (le viewport est de toute façon démonté pendant le chargement, cette garde est une sécurité supplémentaire)
- [x] Câbler `onSwipeMap={handleSwipeMap}` sur `DropZoneMapViewport`
- [x] Valider ESLint et la vérification TypeScript sur la page
- [ ] Vérifier sur un téléphone réel le swipe gauche/droite, le comportement pendant le chargement réseau (carte suivante non warm en cache) et l'absence de swipes multiples empilés

#### Phase 2 — Persistance et historique après validation

- [x] Décider si les performances observées justifient la persistance des résultats dérivés
- [x] Créer `DropPressureStat`, un stockage par drop avec match, membre, coordonnées, date, joueurs proches et niveau
- [x] Stocker séparément le nombre total de joueurs proches et le nombre d'adversaires proches grâce au `teamId`
- [x] Calculer et stocker la pression lors du parsing des nouveaux matchs
- [x] Backfiller les matchs existants qui possèdent déjà des `landingSamples` (`1 284` matchs, `3 443` drops)
- [x] Garantir l'idempotence du parsing et du backfill avec l'unicité `(squadMatchId, memberId)` et le remplacement transactionnel
- [x] Utiliser `matchDate` pour consulter les fenêtres calendaires `Semaine`, `Mois` et `Tous`
- [x] Ajouter un panneau partagé de statistiques persistantes aux dashboards membre et clan
- [x] Afficher les drops/matchs analysés, moyennes joueurs/adversaires, maximum et part de hot drops
- [x] Vérifier les API authentifiées et les rendus desktop/mobile sur les données backfillées
- [x] Ajouter une évolution temporelle de la pression au drop après validation du stockage

---

## P2 — Fonctionnalités incomplètes

### ~~Challenges — Progression non automatisée~~ — ✅ Complété le 2026-06-23

`refreshChallengeProgressForClan(clanId)` ajoutée dans `challenge-service.ts`.
Appelée depuis deux points du cycle cron :
1. `processChallenges()` — avant `endChallenge`, pour que les scores finaux soient à jour
2. `runDailyClanSync()` — après import réussi de matchs

| Type | Source | Calcul |
|---|---|---|
| `kill_race` | `SquadMember._sum.kills` | somme directe |
| `damage_race` | `SquadMember._sum.damage` | `Math.round(sum)` |
| `win_streak` | `SquadMember.count` where `placement=1` | count de victoires |
| `survival_expert` | `SquadMember._sum.placement + _count` | `count×25 − sumPlacements` |
| `squad_synergy` | — | non implémenté (composition multi-membres, hors scope) |

- [x] Câbler `kill_race` et `damage_race`
- [x] Câbler `survival_expert`
- [x] Câbler `win_streak`

---

### Push notifications — Infrastructure sans service

Les préférences `pushNotifications` sont stockées et lues, mais l'envoi réel est un simple `console.log`. Il n'y a aucun service push branché.

- [ ] Choisir un service (ex. Firebase FCM, Web Push via VAPID)
- [ ] Implémenter le backend d'abonnement (`POST /api/members/[id]/push-subscribe`)
- [ ] Remplacer le `console.log` dans `createNotificationForMember` par un vrai appel push

---

### ~~Stats lifetime — Pas de ventilation par mode~~ — ✅ Complété le 2026-06-23

- [x] Colonnes `statsSquad`, `statsDuo`, `statsSolo` (`Json?`) ajoutées dans `MemberLifetimeStats` + migration SQL
- [x] `fetchLifetimeStats` dans `pubg.ts` retourne `byMode: { squad, duo, solo }` via helper `buildStatsFromMode` + `getModeAggregate` (squad+squad-fpp, duo+duo-fpp, solo+solo-fpp)
- [x] `upsertStats` dans `route.ts` et `syncClanLifetimeStats` dans `clan-service.ts` stockent les colonnes par mode
- [x] `GET /api/members/[id]/stats` expose `statsByMode` dans la réponse (cache et live)
- [x] `MemberLifetimeStatsPanel` : `SegmentedControl` Tous / Squad / Duo / Solo — options désactivées si données absentes ; médailles de clan masquées hors mode "Tous"
- [x] `page.tsx` : state `statsByMode` parsé depuis la réponse API, passé au panel

---

### Auto-cleanup cron — Non branché

Le nettoyage des fichiers `.telemetry-captured/` et des jobs `failed` anciens est disponible via `queue-cleanup` mais n'est pas déclenché automatiquement.

- [ ] Ajouter un job cron nocturne qui appelle `queue-cleanup` (suppression jobs queued > 24h, jobs failed > 7j)
- [ ] Ajouter le nettoyage des fichiers `.telemetry-captured/` de plus de 30 jours

**Référence :** `docs/telemetry/overview.md` — section "Ce qui reste à faire"

---

### ~~Streaming JSON parser~~ — ✅ Déjà implémenté (vérifié le 2026-06-23)

Le parser `parseTelemetrySnapshotFromStream` dans `parser.ts` est un vrai streaming JSON character-by-character :
- `resync-files.ts` utilise `createReadStream({ highWaterMark: 64 KB })` — jamais de lecture complète en mémoire
- `consumeText()` suit `objectDepth` caractère par caractère ; `JSON.parse()` est appelé sur **un seul event** à la fois (quelques Ko)
- À aucun moment le fichier entier n'est accumulé en mémoire — inutile d'introduire `jsonstream` ou `@streamparser/json`

---

## P3 — Améliorations et données non encore exploitées

### Events télémétrie non parsés

| Événement | Intérêt | Travail estimé |
|---|---|---|
| `LogPlayerUseThrowable` | Diversité tactique (grenades, molotovs) | 2–4h |
| `LogVehicleLeave.rideDistance` | Distance véhicule précise par session | 1–2h |
| `LogVehicleLeave.maxSpeed` | Vitesse max par session (JACKY TUNING complet) | 1h |
| `CharacterWrapper.primaryWeaponFirst` | Arme en main au moment des kills | 4–8h |

---

### Champs `SquadMember` non affichés

Ces champs sont stockés en DB depuis la migration P1.1 mais n'ont pas tous de vue dédiée :

- `headshotKills` — ✅ affiché dans `/members/[id]/matches` (colonne du tableau) et agrégé dans map-stats (`totalHeadshots`). Absent des pages clan.
- `teamKills` — ❌ non affiché nulle part. La variable `teamKills` dans les pages télémétrie est la somme des kills d'équipe, pas ce champ.
- `swimDistance` — ❌ non affiché par match. Le lifetime agrégé `swamDistance` est bien présent dans `MemberLifetimeStatsPanel`.

**Remarques (vérification 2026-06-23) :**

- `headshotKills` est couvert à 2/3 : vue membre (/members/[id]/matches) et agrégat map-stats. Le seul endroit manquant est la liste de matchs du clan — valeur faible, pas prioritaire.
- Le nom `teamKills` dans `src/app/clans/[clanId]/matches/[matchId]/telemetry/page.tsx` et sa copie dans `src/app/clans/[clanId]/telemetry/matches/[matchId]/telemetry/page.tsx` est trompeur : c'est une variable locale qui fait `group.members.reduce(...kills)`, pas `SquadMember.teamKills`. À ne pas confondre si on veut un jour afficher les team kills réels.
- `swimDistance` par match a peu d'intérêt isolément (la distance de nage sur un match est anecdotique). L'agrégat lifetime suffit. Ce point peut rester hors scope sans impact utilisateur.
- Si `teamKills` doit un jour être affiché, le bon endroit est la fiche de match du clan (`/clans/[clanId]/matches/[matchId]`) et le détail de match membre, pas la télémétrie.

---

### Cron — Rapports hebdomadaires / mensuels

Les routes `generateWeeklyReport` et `generateMonthlyReport` existent mais leur déclenchement automatique dépend d'une vérification que le cron est bien configuré et actif.

- [ ] Vérifier que le cron `weekly_report` est actif et déclenche `generateWeeklyReport`
- [ ] Vérifier que le cron `monthly_report` est actif et déclenche `generateMonthlyReport`
- [ ] Tester la génération d'un rapport complet (toutes les sections)

---

### Performances — Cache des awards

Le calcul des awards (`computeClanAwards`) est entièrement à la volée à chaque GET. Sur la période `all` avec un historique long, la requête charge plusieurs milliers de lignes sans cache.

- [ ] Ajouter un TTL cache côté route (ex. 10 min avec `Cache-Control` ou table `PlayerAwardsCache`)
- [ ] Alternative : pré-calculer et stocker les awards lors du recalcul quotidien des stats

---

## Technique

### Tests

- [ ] Aucun test n'existe actuellement en dehors de `test:telemetry` (Vitest limité). Envisager des tests pour `awards-service.ts`, `report-generator.ts` et `stats-calculator.ts`
- [ ] Tester la route `drop-zones` avec des données réelles (après backfill)

### Documentation

- [x] Mettre à jour `docs/telemetry/ops.md` après le backfill v1 → v2
- [ ] Documenter les pages UI `/drop-zones` une fois créées
- [ ] Mettre à jour `docs/features/challenges.md` une fois la progression auto câblée

---

## Résumé — Ce qui reste à faire (au 2026-06-23)

### Tâches ouvertes par priorité

| Priorité | Catégorie | Item | Effort estimé |
|---|---|---|---|
| P1 | Ops | Supprimer les fichiers `.telemetry-captured/` obsolètes (backfill v1→v2 terminé) | < 1h |
| P2 | Infra | Push notifications — choisir et brancher un service réel (FCM / Web Push VAPID) | 1–2j |
| P2 | Ops | Auto-cleanup cron — brancher `queue-cleanup` nocturne (jobs queued > 24h, failed > 7j, fichiers capturés > 30j) | 2–4h |
| P3 | Télémétrie | Parser `LogPlayerUseThrowable` (grenades/molotovs) | 2–4h |
| P3 | Télémétrie | Parser `LogVehicleLeave.rideDistance` + `.maxSpeed` | 2–3h |
| P3 | Télémétrie | Parser `CharacterWrapper.primaryWeaponFirst` (arme au moment du kill) | 4–8h |
| P3 | UI | Afficher `teamKills` et `swimDistance` par match depuis `SquadMember` (`headshotKills` déjà couvert) | 1h |
| P3 | Fiabilité | Vérifier et tester les crons `weekly_report` / `monthly_report` | 1–2h |
| P3 | Performances | Cache awards `computeClanAwards` (TTL 10 min ou pré-calcul quotidien) | 2–4h |
| Tech | Tests | Tests unitaires pour `awards-service.ts`, `report-generator.ts`, `stats-calculator.ts` | 4–8h |
| Tech | Doc | Documenter `/drop-zones` + mettre à jour `docs/features/challenges.md` | 1h |

### Ce qui n'est PAS à faire (hors scope confirmé)

- `squad_synergy` challenge — calcul de composition multi-membres, complexité non justifiée
- Streaming JSON parser — déjà implémenté nativement dans `parser.ts`

---

## Idées — Comparaison de performances entre clans

Aujourd'hui, le site est strictement mono-clan : isolation garantie par `ensureMemberInClan()`, aucune page ne compare deux clans entre eux. Cette section propose des pistes pour introduire une dimension **inter-clans**, en s'appuyant au maximum sur les données déjà collectées (`clanStats`, `PlayerStats`, `Match`, `SquadMatch`) plutôt que sur de nouveaux pipelines.

### Constat de départ

| Élément | État actuel |
|---|---|
| Isolation clan | Stricte — un Owner/Admin/Member ne voit que son propre clan (voir `docs/features/clans.md` §3) |
| Données déjà agrégées par clan | `Clan.clanStats` (JSON) : totaux kills/damage/matches/winRate + top performers, recalculé chaque nuit par `syncTrackedClanStats()` |
| Multi-clan en DB | Oui — `GET /api/clans` liste déjà tous les clans actifs avec comptage membres/matchs |
| SuperUser | Seul rôle à avoir une vue cross-clan aujourd'hui |

Toute fonctionnalité de comparaison inter-clans est donc un **choix de politique de confidentialité** autant qu'une feature technique : faut-il que ce soit public (visible par tous les clans), opt-in par clan, ou réservé au SuperUser ? Voir item confidentialité ci-dessous.

### 1. Classement public inter-clans ("Ligue des clans")

**Pourquoi c'est utile :** la fonctionnalité la plus évidente et la plus motivante — donner à chaque clan un rang par rapport aux autres, pas seulement en interne.

**Données disponibles :** `Clan.clanStats.tracked.aggregated` existe déjà pour chaque clan actif (kills, damage, matches, winRate, assists, revives). Aucun nouveau pipeline de calcul n'est nécessaire, juste une agrégation de lecture sur tous les clans.

- [ ] Page `/clans-leaderboard` (ou `/ligue`) listant tous les clans actifs, triable par winRate, kills totaux, damage moyen par match, matches joués
- [ ] Colonnes : rang, nom + tag, effectif tracké, winRate, kills totaux, damage moyen
- [ ] Filtrage par période (week/month/all) en réutilisant la même logique de fenêtre que le leaderboard interne
- [ ] Route API `GET /api/clans-leaderboard` (lecture `clanStats` pour tous les clans `isActive`, tri en mémoire), réutiliser `Leaderboard.tsx`

**Point d'attention :** comparer des totaux bruts favorise les gros clans (plus de membres = plus de kills). Voir item 4 (normalisation).

**Effort :** faible.

### 2. Score de puissance de clan ("Clan Power Rating")

**Pourquoi c'est utile :** un score unique, facile à afficher en badge, qui résume la force d'un clan mieux qu'un classement multi-colonnes.

- [ ] Formule composite normalisée (0–100) : winRate, K/D moyen du clan, dégâts moyens par match, facteur de régularité (écart-type des perfs hebdo)
- [ ] Historique du score dans le temps (courbe) — nouvelle table légère `ClanPowerRatingHistory (clanId, period, score)` ou append JSON dans `clanStats` à chaque recalcul nocturne
- [ ] Évolution ± affichée comme delta (même pattern que les deltas du leaderboard interne)

**Effort :** moyenne — le calcul est simple, l'historique demande une nouvelle table/append JSON et une décision sur la fenêtre de calcul (rolling 30 jours ?).

**Inspiration :** systèmes de type Elo/Glicko pour classer des équipes — ici plus simple, pas de confrontations directes à arbitrer (voir item 3).

### 3. Détection de rivalité — clans qui se croisent dans le même match

**Pourquoi c'est utile :** PUBG est un battle royale, donc deux clans trackés peuvent littéralement s'affronter dans le même match sans le savoir. Détecter ces croisements et en faire un classement "face-à-face" est une fonctionnalité qu'aucun site classique de stats PUBG ne propose.

**Données disponibles :** `Match` stocke déjà le `matchId` PUBG par membre. Si deux membres de deux clans différents ont le même `matchId`, c'est un croisement détecté.

- [ ] Job (cron ou requête à la demande) qui trouve les `matchId` partagés entre `ClanMember` de clans différents (`GROUP BY matchId HAVING COUNT(DISTINCT clanId) > 1`)
- [ ] Pour chaque croisement : quel clan a eu le meilleur placement moyen / le plus de kills / a survécu le plus longtemps dans ce match précis
- [ ] Tableau "Confrontations directes" par paire de clans : nombre de croisements, bilan (qui a fini devant qui), landing zones communes si télémétrie disponible
- [ ] Notification optionnelle : "Votre clan a croisé [Clan X] dans un match le 12/07 — vous avez fini devant"

**Effort :** moyenne à élevée. La détection est une requête SQL simple ; l'exploitation fine (qui a tué qui) nécessite la télémétrie du match (déjà parsée dans `SquadMatchTelemetry` si sync côté clan). Sans télémétrie, on se limite à une comparaison de placement/stats basiques déjà dans `Match`.

**Point d'attention confidentialité :** révèle des informations sur un autre clan sans son consentement explicite (placement, kills dans un match donné). Voir item confidentialité.

### 4. Normalisation par effectif — comparer équitablement petits et gros clans

**Pourquoi c'est utile :** sans ça, tout classement brut favorise mécaniquement les clans à 30 membres actifs contre ceux à 8. Un petit clan très performant n'a aucune chance de se distinguer.

- [ ] Toutes les métriques du classement inter-clans (item 1) déclinées en version "par membre actif" : kills/membre, damage moyen/membre, matches/membre
- [ ] Toggle "Classement brut" vs "Classement par capita" (comme le toggle Clan/Inclus Solo existant sur le leaderboard interne)
- [ ] Seuil minimum de membres actifs ou de matchs joués pour apparaître dans le classement per-capita

**Effort :** faible — division simple sur les données déjà agrégées de l'item 1. À faire en même temps que l'item 1, pas après.

### 5. Défis et événements inter-clans

**Pourquoi c'est utile :** le modèle `Challenge` existe déjà pour les défis internes à un clan. L'étendre à un scope inter-clans donnerait un vrai objectif compétitif motivant (type "guerre de clans").

**Données disponibles :** `Challenge`, `ChallengeParticipant`, `ChallengeReward` existent déjà, actuellement scopés par `clanId`.

- [ ] `Challenge` à scope `null` clanId (global) ou nouveau type `ClanChallenge` opposant N clans sur un objectif commun (ex. "premier clan à atteindre 10 000 kills cumulés cette semaine")
- [ ] Classement de progression en temps réel entre clans participants, jauge comparative
- [ ] Récompenses spécifiques (badge clan) — équivalent `ClanRewards` au modèle `PlayerRewards` existant

**Effort :** élevée — extension de modèle de données, pas juste une vue en lecture. À envisager après les items 1–4 (quick wins sur données déjà là).

Voir aussi la section "Compétitions inter-clans" ci-dessous (suggestions), qui recoupe cette idée avec un `ClanChallenge` détaillé.

### 6. Opt-in et confidentialité — condition préalable à tout ce qui précède

**Pourquoi c'est un sujet à part entière :** le système actuel a été durci récemment précisément pour garantir l'isolation stricte entre clans. Introduire une comparaison inter-clans est un changement de philosophie qui mérite une décision explicite, pas juste un ajout de route API.

| Option | Description | Effort |
|---|---|---|
| Public par défaut | Tous les clans actifs apparaissent dans les classements inter-clans (comme un leaderboard PUBG mondial) | Faible — aucun nouveau champ nécessaire |
| Opt-in par clan | Un Owner active un flag `Clan.publicStatsOptIn` dans les settings pour apparaître dans les classements | Moyenne — nouveau champ + toggle dans `/clans/[clanId]/settings` |
| Réservé SuperUser | Comparaison visible uniquement en interne pour la modération/animation de la plateforme, pas exposée aux clans eux-mêmes | Faible — nouvelle page réservée `requireSuperUser()` |

- [ ] Trancher l'option de confidentialité (recommandation : commencer par "Réservé SuperUser" pour valider l'intérêt et la fiabilité des chiffres, puis basculer vers "opt-in par clan" une fois le concept validé)

### Priorisation suggérée

| Priorité | Idée | Effort | Dépendances |
|---|---|---|---|
| 1 | Classement inter-clans brut + per-capita (items 1 + 4) | Faible | Aucune — données déjà en base |
| 2 | Scope SuperUser-only en premier (item 6) | Faible | Aucune |
| 3 | Clan Power Rating avec historique (item 2) | Moyenne | Nouvelle table ou append JSON |
| 4 | Détection de rivalité / croisements de matchs (item 3) | Moyenne à élevée | Itérer avec/sans télémétrie |
| 5 | Défis inter-clans (item 5) | Élevée | Extension du modèle `Challenge` |

Les items 1 et 2 peuvent être livrés ensemble comme un premier lot cohérent : une page SuperUser-only `/admin/clans-leaderboard` avec classement brut et per-capita, sans aucune migration de schéma.

---

## Suggestions — Stats et fonctionnalités

Idées de stats et fonctionnalités qui apporteraient une vraie valeur au clan. L'angle directeur est toujours "aider chaque joueur à identifier ce qu'il peut améliorer" — pas juste afficher des chiffres.

### Stats individuelles à mettre en place

- [ ] **Précision par arme et par distance** — taux de précision (`hitsLanded / shotsFired`) par arme, comparaison à une portée efficace de référence, mise en évidence des armes au-dessus/en dessous de la moyenne clan. Données : `MemberWeaponStats` (`shotsFired`, `hitsLanded`, `avgDistance`, `kills`, `headshots`). Page suggérée : section "Mes armes" dans le dashboard membre.
- [ ] **Score de positionnement (Circle IQ)** — score synthétique sur 100 combinant `circleDelayPercent` et `blueZoneHitsRate` (tous deux dans `MemberTelemetryStats`), classement des membres, tendance sur 4 semaines. Widget dashboard membre avec insight textuel ("Tu entres dans la zone 12 % moins vite que tes coéquipiers").
- [ ] **Profil de joueur — Spider chart** — radar à 6 axes normalisés sur 100 : Agressivité (kills/match vs moyenne clan), Précision (headshot rate), Support (revives/match), Survie (temps de survie moyen), Mobilité (distance à pied/match), Circle IQ (inverse de `circleDelayPercent`). Données dans `MemberTelemetryStats` et `PlayerStats`, normalisation par min/max du clan.
- [ ] **Radar playstyle vs moyenne clan** — superposer le profil du joueur (Agressivité/Support/Zone, déjà calculés par période) à la moyenne clan sur la section "Évolution du playstyle" existante. Radar SVG à 3 axes, joueur (rempli) vs moyenne clan (contour pointillé), réactif au SegmentedControl Semaine/Mois/Tous. Nécessite l'endpoint `/api/clans/[clanId]/telemetry/playstyle-average?period=week`. Cacher le radar si moins de 3 membres ont des données télémétrie sur la période. Page : `/members/[id]/dashboard`, section "Évolution du playstyle". Effort faible côté frontend.
- [ ] **Kill distance — Distribution** — répartition des kills par tranche (< 25 m CQC, 25–100 m mid, 100–200 m longue, > 200 m snipe), identification de l'arme "signature", comparaison au profil du clan. Données : `MemberWeaponStats.avgDistance`.
- [ ] **Évolution K/D par phase de cercle** — répartition des kills par phase (Early 1–3, Mid 4–6, Late 7+) en %, comparaison early/late entre membres ("early rusher" vs "late game player"). Données : `MemberTelemetryStats.firstKillPhase`, `killSamples` dans `SquadMatchTelemetry`.
- [ ] **Ratio damage dealt / damage taken** — ratio par membre et par période, classement du clan, identification des joueurs qui absorbent le plus de dégâts. Nécessite d'ajouter `avgDamageTaken` dans `MemberTelemetryStats` (données présentes dans le parser via `LogPlayerTakeDamage` + `LogBlueZoneDamage`, mais pas encore agrégées en période).

### Stats clan globales

- [ ] **Tendance du clan sur 8 semaines** — courbes win rate moyen, kills/match moyen, nombre de matchs joués (indicateur d'activité), agrégées depuis `PlayerStats` par `periodKey` semaine. Page suggérée : section "Santé du clan" dans l'overview du clan.
- [ ] **Meilleurs duos du clan** — top 5 des paires les plus synergiques (score coKills + revives pondérés, normalisé par matchs ensemble), "ce duo gagne X % de ses matchs ensemble", carte "Chimie d'équipe" (matrice N×N, win rate par paire). Données déjà stockées dans `ClanSynergyTelemetryStats` (`reviveCount`, `coKillCount`, `matchesTogether`) mais non exposées côté UI.
- [ ] **Heatmap clan des zones de danger** — heatmap agrégée "où notre clan prend le plus de dégâts" par carte, comparaison avec "où on inflige des dégâts" pour identifier les zones à éviter. Données : `SquadMatchTelemetry.damageSamples` / `killSamples`, actuellement agrégés seulement par match, pas en heatmap cumulative par carte.
- [ ] **Carte des loot routes préférées** — visualisation des trajectoires des 15 premières secondes après le drop par membre, calcul de la dispersion moyenne au drop (distance entre membres de la squad, clan groupé vs dispersé). Données : `SquadMatchTelemetry.landingSamples` (parser v2) et `trajectorySegments`.

### Fonctionnalités sociales et engagement

- [ ] **Badges de progression (Rank cards)** — ex. "Sniper en progression" (`avgDistance` de kill +20 % sur 4 semaines), "Reviver de l'équipe" (top 1 revives 3 semaines d'affilée), "Circle Master" (`circleDelayPercent` < 5 % pendant 1 mois). Entièrement calculable depuis `MemberTelemetryStats` et `PlayerStats` agrégés dans le temps.
- [ ] **Objectifs personnels (Goals)** — modèle `MemberGoal` (`memberId`, `metric`, `target`, `deadline`, `status`), page `/members/[id]/goals` avec saisie d'objectif et courbe de progression, notification automatique à l'atteinte. Difficulté : métriques hétérogènes (`PlayerStats`, `MemberTelemetryStats`, `MemberWeaponStats`) — nécessite un résolveur de métrique générique.
- [ ] **Rapport hebdomadaire enrichi avec stats télémétrie** — ajouter au rapport existant (basé uniquement sur `PlayerStats`) : meilleur Circle IQ de la semaine, paire la plus synergique (revives + co-kills), arme la plus utilisée par le clan (`MemberWeaponStats`), insight "% de kills au headshot cette semaine" (tendance vs semaine précédente).
- [ ] **Comparaison avec les saisons PUBG** — graphique "évolution du tier ranked" par membre sur les 5 dernières saisons, vue "qui a le plus progressé en ranked ce mois-ci", comparaison tier ranked vs performance squad (corrélation ?). Données : `MemberSeasonStats` (stats ranked par saison), pas encore de vue dédiée à la progression saisonnière du clan.

### Fonctionnalités de gestion et animation du clan

#### Rôle Moderator — animation de clan

Le rôle Moderator existe en DB mais n'a pas de fonctions définies. Quatre axes d'animation identifiés à implémenter dans une future itération.

- [ ] **Gestion des défis internes (Challenges)** — le Moderator peut créer, modifier et clore des challenges (`kill_race`, `damage_race`, etc.) sans impliquer l'Owner/Admin. Permission à câbler : `manage_challenges` sur `POST/PATCH /api/clans/[clanId]/challenges`.
- [ ] **Annonces et rappels (Notifications)** — le Moderator peut rédiger et envoyer des annonces aux membres (soirée scrims, objectif de la semaine), gestion des canaux (Discord webhook, email). Permissions : `manage_notifications`, `manage_channels`.
- [ ] **Recrutement (Invitations membres)** — le Moderator peut envoyer des invitations à de nouveaux joueurs, mais ne peut pas retirer/archiver un membre existant. Permission : `invite_members` (sans `remove_members` ni `kick_members`).
- [ ] **Export des rapports** — le Moderator peut exporter les rapports hebdomadaires/mensuels du clan (PDF, CSV), utile pour des analyses hors site (Discord, Google Sheets). Permission : `export_reports`.

#### Compétitions inter-clans

**Pourquoi c'est utile :** les challenges actuels sont intra-clan. Une compétition inter-clans permettrait de mesurer l'ensemble d'un clan face à un autre sur une période donnée — un motivateur fort pour l'engagement. Recoupe l'idée "Défis et événements inter-clans" ci-dessus (comparaison inter-clans, item 5).

- [ ] Modèle `ClanChallenge` : deux clans s'affrontent sur une métrique (kills, win rate, damage) sur une période définie
- [ ] L'Owner ou le SuperUser crée le défi et invite un clan adverse (via son `clanId`)
- [ ] Cron nocturne comparant les stats agrégées des deux clans sur la période
- [ ] Leaderboard live inter-clans affiché pour les membres des deux clans
- [ ] À la clôture : badge "Vainqueur du défi inter-clan [Nom du clan] — Saison X" attribué aux membres du clan gagnant

**Données disponibles :** `PlayerStats` agrégés par clan et par période sont déjà calculés — moteur des stats existant réutilisable comme base.

**Difficulté principale :** isoler les matchs joués *pendant* la période du défi (filtrage par `Match.playedAt` dans la fenêtre temporelle du `ClanChallenge`).

**Page suggérée :** `/clans/[clanId]/competitions` — liste des défis inter-clans actifs/terminés, formulaire d'invitation.

### Axes techniques qui débloqueraient plusieurs stats

| Amélioration technique | Stats qu'elle débloquerait |
|---|---|
| Ajouter `avgDamageTaken` dans `MemberTelemetryStats` | Ratio dealt/taken, identification des joueurs exposés |
| Parser `LogPlayerUseThrowable` | Diversité tactique, grenadiers vs non-grenadiers |
| Stocker `rideDistance` par session depuis `LogVehicleLeave` | Suivi véhicule par type |
| Ventiler `MemberLifetimeStats` par mode de jeu | Stats solo/duo/squad comparées |
| Agréger `damageSamples` et `killSamples` par carte sur la période | Heatmaps cumulatives clan par carte |
