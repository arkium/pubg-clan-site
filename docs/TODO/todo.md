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

### Maîtrise armes (carrière) — Champs API mal mappés

Sur `/members/[id]/weapons`, la colonne Dégâts affichait `0` pour toutes les armes, et le taux de headshot était incohérent (pouvait dépasser 100 %). Root cause identifiée en comparant le code, une réponse API brute réelle, le schéma OpenAPI officiel PUBG (`https://documentation.pubg.com/en/_static/swagger/en/schemas/weaponSummary.yml`) et l'écran "Maîtrise des armes" du client PUBG.

- [x] Corriger `fetchWeaponMastery` (`src/lib/pubg.ts`) : fusion champ par champ de `OfficialStatsTotal`/`StatsTotal` au lieu d'un choix d'objet entier — un bloc peut avoir une activité réelle pendant que l'autre reste gelé à zéro
- [x] Corriger le nom de champ dégâts : `DamagePlayer` (total carrière), pas `Damage` (n'existe pas dans le schéma officiel)
- [x] Corriger le mapping `knockouts` : `Groggies` (*"caused another player to become groggy"*, confirmé officiellement et par recoupement avec "Neutralisations" affiché en jeu sur deux armes), pas `Defeats` (quasi toujours `0`, sémantique non confirmée — hypothèse : ancien nom de "kill" avant migration terminologique, jamais peuplé dans les blocs actifs)
- [x] Confirmer qu'aucun champ `Shots`/`Hits` n'existe dans le schéma officiel `weapon_mastery` — la précision par arme ne peut structurellement pas être calculée depuis cette source
- [x] Confirmer que `HeadShots` compte des **coups** en tête (peut dépasser `Kills`), pas des kills en headshot — vérifié sur deux armes contre l'écran officiel PUBG (MP5K, M24)
- [x] Retirer la colonne "Precision %" du tableau `/members/[id]/weapons` (toujours `0 %`, aucune donnée source possible)
- [x] Retirer la colonne "Headshot %" (`headshots/kills`, confirmée fausse — dépassait 100 % sur M24), conserver la colonne "Headshots" brute avec infobulle explicative
- [x] Ajouter la colonne "Neutralisations" (`knockouts`, déjà stockée en DB mais jamais affichée), triable comme les autres colonnes
- [x] Documenter la structure réelle de l'API dans `docs/features/weapons.md` et `docs/telemetry/pubg-api.md`, avec citation du schéma officiel
- [ ] Recliquer sur "Rafraîchir" sur `/members/[id]/weapons` pour valider en conditions réelles que Dégâts et Neutralisations s'affichent correctement après le correctif
- [ ] Étendre le correctif au reste du clan via le prochain passage du cron `daily_season_stats_sync` (`0 5 * * *`), pas de backfill manuel nécessaire

#### Colonne Distance (`LongestKill`) et réordonnancement du tableau — ✅ Complété le 2026-08-02

- [x] Migration additive `20260802130000_add_weapon_mastery_longest_kill_distance` : `MemberWeaponMastery.longestKillDistance Float @default(0)` — appliquée manuellement sur `smk.arkium.group` (vérifiée via `prisma migrate status` : `Database schema is up to date!`)
- [x] Régénérer le client Prisma (`npx prisma generate`, après arrêt du serveur dev qui verrouillait le `.dll` du query engine sur Windows)
- [x] Mapper `longestKillDistance` dans `fetchWeaponMastery` (`src/lib/pubg.ts`) : `official?.LongestKill ?? competitive?.LongestKill ?? 0` (absent de `StatsTotal` legacy par schéma officiel)
- [x] Persister `longestKillDistance` dans `POST /api/members/[id]/weapon-mastery` (create + update)
- [x] Réordonner les colonnes du tableau Maîtrise armes : Arme, Kills, Neutralisations, Dégâts, Headshots, Distance, Niveau
- [x] Ajouter la colonne "Distance" (`formatMeters(row.longestKillDistance)`), triable
- [x] Corriger l'orthographe et les accents manquants dans toute la page `/members/[id]/weapons` (titres de sections, sous-titres, boutons, dropdowns Période/Catégorie, options de catégories d'armes, en-têtes de tableau, messages d'erreur)
- [x] Valider ESLint (5 erreurs préexistantes non liées, vérifiées par comparaison avant/après) et la vérification TypeScript
- [ ] Recliquer sur "Rafraîchir" pour valider que la colonne Distance se remplit avec les vraies valeurs (ex. attendu : M24 ≈ 458 m, MP5K ≈ 73 m d'après les captures d'écran PUBG déjà comparées)

**Champ API restant non exploité** (piste future) : aucun — `LongestKill` est maintenant capturé.

---

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

### ~~Page `/clans` (sélecteur SuperUser) — Améliorations~~ — ✅ Implémenté le 2026-08-02

Suite à la correction du 2026-08-02 (flag `canSwitchClan` désynchronisé en `localStorage`, voir [useSelectedClan.ts](../../src/hooks/useSelectedClan.ts)), revue complète de la page `/clans` et de ses dépendances (`ClanSelector.tsx`, `GET /api/clans`).

#### Corrections rapides

- [x] Corriger l'encodage mojibake du titre et du sous-titre (`SÃ©lectionnez votre clan`, `Ã  consulter`, `donnÃ©es associÃ©es` dans `src/app/clans/page.tsx`) — double encodage UTF-8 (fichier UTF-8 réinterprété en Latin-1 puis réencodé), corrigé en réappliquant la transformation inverse sur tout le fichier
- [x] Remplacer `NextResponse.json` par `Response.json` dans `src/app/api/clans/route.ts` (convention du projet, voir `AGENTS.md`)
- [x] Remplacer la boucle `Promise.all` + `prisma.match.count` par clan (N+1 requêtes) par un `groupBy` unique sur `Match` (agrégation en mémoire par `clanId` via la map des membres actifs, sans requête par clan) — expose au passage `lastMatchAt` par clan

#### Conformité thème (clair/sombre)

- [x] `ClanSelector.tsx` hardcodait `bg-white`, `border-gray-200`, `text-gray-900`, `text-gray-600`, `text-red-600`, `bg-blue-600` — remplacé par `.app-panel` pour les cartes et les classes Tailwind remappées pour le texte (ces classes restent valides : elles sont interceptées par `globals.css` selon `data-app-theme`)
- [ ] Vérifier dans le navigateur le rendu complet (titre, recherche, tri, cartes, squelette de chargement, bouton "Consulter", erreur/retry) en thème clair et sombre — non vérifié en session : pas d'identifiants SuperUser ni de navigateur headless (`chromium-cli`/Playwright) disponibles dans cet environnement

#### UX

- [x] Mettre en évidence le clan actuellement sélectionné (`clanId` courant dans `useSelectedClan`) parmi les cartes avec une bordure bleue et un badge "Actif"
- [x] Ajouter une confirmation (`window.confirm`, cohérent avec le reste du projet) avant de changer de clan si un clan différent est déjà sélectionné
- [x] Ajouter un tri (Nom / Effectif / Matchs) via `SegmentedControl`, en complément de la recherche déjà présente
- [x] Afficher la date du dernier match par clan (`lastMatchAt`, calculé côté API depuis `Match.pubgCreatedAt`)
- [x] Remplacer le texte brut "Chargement des clans..." par un squelette de 6 cartes (`animate-pulse`)
- [x] Ajouter un bouton "Réessayer" sur le message d'erreur (déclenche un nouveau fetch via un `retryToken`)
- [x] Passer la grille de cartes à 3 colonnes sur grand écran (`lg:grid-cols-3`), auparavant plafonnée à 2
- [ ] Vérifier sur mobile réel l'absence de débordement horizontal avec le nouveau bandeau recherche + tri

#### Refonte visuelle des cartes — 2026-08-02

Cartes modernisées et sous-informations compactées : avatar `.app-avatar` avec initiales du tag, en-tête clan/tag/plateforme sur une ligne, 3 mini-tuiles `.app-panel-muted` avec icônes (`Users`/`Swords`/`Clock` de `lucide-react`) pour Membres / Matchs / Dernier match (date compacte `jj/mm`, date complète en `title` au survol), anneau bleu + badge "Actif" repositionné en coin, bouton "Consulter" en `app-btn app-btn--primary` pleine largeur.

- [x] Remplacer les 4 lignes de texte empilées par 3 tuiles de statistiques compactes avec icônes
- [x] Ajouter un avatar circulaire avec les initiales du tag du clan
- [x] Aligner les boutons ("Consulter", "Réessayer") sur le composant partagé `app-btn`
- [ ] Vérifier le rendu des tuiles de stats sur mobile (3 colonnes dans une carte à `sm:grid-cols-2`)

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

Développé et déployé le 2026-08-04 à partir de fichiers réels dans `.telemetry-captured/` (structure des événements vérifiée directement, pas juste le nom du champ). **Résultat sur les 3 items : 1 déployé (lancers), 1 abandonné après investigation car déjà résolu autrement (distance véhicule), 1 abandonné car la prémisse était fausse (arme au moment du kill).**

**Correction d'abord :** `LogVehicleLeave.maxSpeed` est **déjà parsé** ([parser.ts:1379](../../src/lib/pubg-telemetry/parser.ts#L1379), champ `TelemetryMemberStats.maxVehicleSpeedKph`) — la ligne du tableau précédent était obsolète, ce n'est plus à faire.

#### ~~1. `LogPlayerUseThrowable` — diversité tactique (grenades, fumigènes, flashbangs...)~~ — ✅ Déployé le 2026-08-04

- [x] Nouvelle table `MemberThrowableStat` (`squadMatchId`, `memberId`, `itemId`, `count`, `matchDate`, unique sur `[squadMatchId, memberId, itemId]`) — migration `20260804150000_add_member_throwable_stat`, remplacement idempotent par match comme `KillEvent`/`DropPressureStat`
- [x] Capture non filtrée dans le parser (`throwableSamples` dans [parser.ts](../../src/lib/pubg-telemetry/parser.ts), type `TelemetryThrowableSample`), même raison que le kill-feed : `clanMemberKeys` vide sur le chemin de sync principal, filtrage fait à la persistance dans [throwable-persistence.ts](../../src/lib/throwable-persistence.ts) (résolution contre tout le roster clan, pas seulement la squad détectée)
- [x] Branché sur les 3 chemins de sync ([pubg-telemetry/index.ts](../../src/lib/pubg-telemetry/index.ts) + 2 points de [manual-sync.ts](../../src/lib/pubg-telemetry/manual-sync.ts)), juste après `persistKillEventsForMatch`
- [x] Décidé : affichage par type précis (pas de regroupement offensif/tactique) — 9 types distincts observés, assez lisibles individuellement pour ne pas justifier une catégorisation supplémentaire
- [x] Section "Lancers" ajoutée sur `/members/[id]/weapons` (pas de page dédiée), API [`GET /api/members/[id]/throwables`](../../src/app/api/members/[id]/throwables/route.ts) (cumul lifetime tous matchs, `groupBy` Prisma)
- [x] **Découverte en cours d'implémentation :** ni les icônes (`public/icons/pubg/weapons/`) ni `resolveWeaponName()`/`damageCauserName.json` ne couvrent ces `itemId` (le dictionnaire indexe les grenades sous leur nom de *projectile en vol* — `ProjGrenade_C` — pas sous l'ID d'objet lancé `Item_Weapon_Grenade_C` de `LogPlayerUseThrowable`) — ajouté un petit mapping local `THROWABLE_LABELS` dans la page avec repli sur l'ID nettoyé pour tout type non couvert ; les icônes manquantes se dégradent silencieusement (comportement déjà prévu dans `WeaponIcon`, pas de correctif nécessaire)

**Validé le 2026-08-04** par un vrai resync (clan 1, match récent) : lancers capturés correctement pour 2 membres réels (`Pagiotte` : 3 grenades + 3 fumigènes ; `SAMUELAXEII` : 1 grenade + 1 flashbang), attribution par membre correcte.

**Effort réel :** conforme à l'estimation (2–4h) pour l'extraction ; le mapping de labels/icônes manquants était un imprévu mineur, pas un blocage.

#### 2. ~~`LogVehicleLeave.rideDistance` — distance véhicule précise par session~~ — ❌ Investigation faite, non implémenté

**Découverte du 2026-08-04 qui change la donne :** `SquadMember.rideDistance` — la distance véhicule **déjà en base**, sourcée depuis l'API de résumé PUBG (`participant.rideDistance` dans [pubg.ts:291](../../src/lib/pubg.ts#L291), via [squad-detector.ts:275](../../src/lib/squad-detector.ts#L275)), donc fiable et déjà officielle PUBG — **n'est utilisée nulle part sauf en interne pour l'award "JACKY TUNING"**, jamais affichée comme stat visible. Vérifié en base : `4390` lignes, moyenne `1289 m`, max `12836 m` — donnée réelle et cohérente, aucun signe de champ gelé. Le "besoin" de précision que ce point cherchait à combler est donc déjà résolu par une donnée existante et fiable, sans aucun parsing télémétrie.

**Tentative de vérification du champ télémétrie `LogVehicleLeave.rideDistance` — résultat non concluant, abandonné.** Comparé sur 3 matchs réels la somme de `rideDistance` par joueur contre une estimation par delta de position (même logique que le parser) : le ratio entre les deux variait de **~180 à plus de 400 000** selon le joueur, sans schéma cohérent expliquant l'écart (pas un facteur d'unité constant comme `/10` ou `/100`). Cause probable : un joueur monte/descend plusieurs véhicules différents dans un match et `rideDistance` semble se réinitialiser par instance de véhicule d'une façon que je n'ai pas isolée avec certitude dans le temps imparti.

- [ ] **Ne pas implémenter tel quel** — le besoin déclaré ("distance véhicule précise") est déjà satisfait par `SquadMember.rideDistance`, non exploité ailleurs qu'en interne pour un award
- [ ] Si la granularité par session (pas juste le total du match) devient un jour un besoin réel, reprendre l'investigation `LogVehicleLeave.rideDistance` avec plus de temps — comparer instance de véhicule par instance de véhicule (`vehicle.vehicleId`), pas juste une somme par joueur sur tout le match
- [x] Mesuré `SquadMember.rideDistance` en base pour objectiver : `4390` lignes, moyenne `1289 m`, max `12836 m`, jamais affiché dans l'UI (seulement `awards-service.ts`)

**Ce qui pourrait être fait à la place, à effort quasi nul :** exposer `SquadMember.rideDistance` (déjà fiable, déjà en base) quelque part en UI si le besoin est simplement "voir sa distance en véhicule" — pas fait ici, hors scope de cette investigation, mais noté comme piste bien moins chère que le parsing télémétrie.

#### 3. ~~`CharacterWrapper.primaryWeaponFirst` — arme en main au moment des kills~~ — ❌ Prémisse invalidée, ne pas faire tel quel

**Vérifié le 2026-08-04** sur un match réel capturé : `primaryWeaponFirst` **n'existe que sur `LogMatchStart`** (`characters[].primaryWeaponFirst`), comme snapshot du kit de spawn au tout début du match (généralement vide en mode standard) — **ce n'est pas un champ par kill**. Aucun événement `LogPlayerKillV2` ne contient d'info d'inventaire complet du tueur ; le seul champ arme rattaché au kill est déjà capturé (`killerDamageInfo.damageCauserName`, utilisé pour `weaponStats`/`memberWeaponStats`/le kill-feed Némésis).

- [ ] **Ne pas implémenter tel que décrit initialement** — le besoin ("quelle arme tient le joueur au moment où il tue") est déjà satisfait par l'arme qui a causé le kill, déjà trackée partout
- [ ] Si un besoin distinct existe vraiment ("composition d'arsenal transportée", indépendamment des kills), ce serait une reconstruction complète de l'état d'équipement dans le temps via `LogItemEquip`/`LogItemUnequip`/`LogItemPickup`/`LogItemDrop` croisés par timestamp — un chantier bien plus lourd que l'estimation initiale (4–8h → plutôt 2–3 jours), avec une justification produit à clarifier avant de s'y engager

**Ce qui n'est PAS à faire (confirmé) :** chercher `primaryWeaponFirst` par kill, c'est structurellement absent de la télémétrie.

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

### Survival Mastery — Endpoint investigué, non retenu (API cassée côté PUBG)

Piste explorée : exposer `GET /players/{accountId}/survival_mastery` (schéma officiel `https://documentation.pubg.com/en/_static/swagger/en/schemas/survivalMastery.yml`), avec l'idée d'une nouvelle page dédiée `/members/[id]/survival` + `/clans/[clanId]/stats/survival`, sur le modèle des pages Drop zones / Positions / Weapons déjà existantes.

**Verdict : on ne fait rien.** Vérifié par appel API réel sur deux comptes du clan (membre 1 `pagiotte`, niveau 496, ~4931 matchs ; membre 2 `Kiffpit`, niveau 237, ~5239 matchs) :

- Les champs d'en-tête (`xp`, `tier`, `level`, `totalMatchesPlayed`) sont réels et cohérents.
- **Les 15 métriques du bloc `stats`** (`damageDealt`, `damageTaken`, `distanceOnFoot/BySwimming/ByVehicle/Total`, `healed`, `hotDropLandings`, `enemyCratesLooted`, `position`, `revived`, `teammatesRevived`, `timeSurvived`, `throwablesThrown`, `top10`) **sont toutes à `0`** sur les deux comptes testés, malgré une activité massive et réelle — même symptôme que le bloc `StatsTotal` gelé de `weapon_mastery`, mais ici c'est la totalité du détail qui est inexploitable, pas juste un bloc legacy en doublon d'un bloc actif.
- Seule exception : `timeSurvived.lastMatchValue` contient une vraie valeur en secondes (1496s et 9s respectivement, cohérent avec des fins de match réelles) — anecdotique, ne justifie pas une page à lui seul.
- Écart doc/réalité supplémentaire : la réponse réelle contient un champ `uniqueItemsLooted` absent du schéma officiel Swagger.
- Le service mort `src/lib/survival-title-service.ts` (mapping points de survie 0–6000+ → titre `Beginner`→`Lone Survivor`) utilise très probablement le mauvais champ : `xp` réel (2 692 300 / 2 173 700) est à des ordres de grandeur du seuil 0–6000 codé en dur. `tier` (= `3` identique sur les deux comptes malgré des `level`/`xp` très différents) est un candidat plus plausible comme index direct dans `survivalTitles.json`, mais non vérifié/câblé.

- [x] Récupérer le schéma officiel `survivalMastery.yml` et lister les 15 métriques disponibles (total/moyenne/meilleur match/dernier match)
- [x] Identifier les items du backlog P3 que ces métriques auraient pu débloquer sans parsing télémétrie (`damageTaken`, `distanceByVehicle`, `throwablesThrown`)
- [x] Tester un appel réel sur 2 comptes du clan pour valider la fiabilité des données
- [x] Confirmer que le bloc `stats` est vide sur les deux comptes malgré une activité réelle importante
- [x] Décider de ne pas construire de page dédiée tant que l'API n'est pas fiable côté PUBG
- [ ] Réévaluer périodiquement (pas de date fixée) si PUBG corrige un jour ce endpoint — retester avec le même script d'appel direct avant de relancer le sujet

**Ce qui n'est PAS à faire (confirmé)** : construire `/members/[id]/survival` et `/clans/[clanId]/stats/survival`, migrer un modèle `MemberSurvivalMastery`, réactiver `survival-title-service.ts` — tant que le bloc `stats` de l'API reste vide.

---

### Cron — Rapports hebdomadaires / mensuels

Les routes `generateWeeklyReport` et `generateMonthlyReport` existent mais leur déclenchement automatique dépend d'une vérification que le cron est bien configuré et actif.

- [ ] Vérifier que le cron `weekly_report` est actif et déclenche `generateWeeklyReport`
- [ ] Vérifier que le cron `monthly_report` est actif et déclenche `generateMonthlyReport`
- [ ] Tester la génération d'un rapport complet (toutes les sections)

---

### ~~Performances — Cache des awards~~ — ✅ Déployé le 2026-08-04

Développé le 2026-08-04 après lecture de [awards-service.ts](../../src/lib/awards-service.ts) et [awards/route.ts](../../src/app/api/clans/[clanId]/awards/route.ts).

**Confirmé :** `GET /api/clans/[clanId]/awards` appelait `computeClanAwards()` sans aucun cache — pas de `Cache-Control`, pas de mémoïsation. `computeClanAwards()` charge **tous** les `SquadMember` du clan sur la période via `findMany` (pas de `groupBy` SQL), puis agrège en mémoire en JS. Sur la période `all`, ça veut dire une ligne par membre par match — potentiellement des dizaines de milliers de lignes rechargées et ré-agrégées à chaque affichage de la page Awards, par tous les membres qui la consultent.

**Option retenue : précalcul plutôt que TTL en mémoire.** Le projet a déjà exactement ce pattern ailleurs : `Clan.clanStats` (colonne `Json?`) est précalculé chaque nuit par `syncTrackedClanStats()` ([clan-service.ts:208](../../src/lib/clan-service.ts#L208)) — lu tel quel par les routes de lecture, jamais recalculé à la demande. Un TTL en mémoire (`Map` module-level) aurait été plus rapide à écrire mais ne survit pas à un redémarrage/déploiement et se désynchronise de la logique cron déjà en place pour des besoins similaires ; le précalcul est plus cohérent avec l'architecture existante.

- [x] Nouvelle table `ClanAwardsCache` (`clanId`, `period`, `periodKey`, `payload Json`, `computedAt`, unique sur `[clanId, period]`) — migration `20260804120000_add_clan_awards_cache`, même esprit que `Clan.clanStats` mais une ligne par période (week/month/all)
- [x] `precomputeClanAwards(clanId)` dans [awards-service.ts](../../src/lib/awards-service.ts) : calcule les 3 périodes et upsert dans `ClanAwardsCache`, appelée depuis `recalculateStatsDaily()` juste après `recalculateStatsForClan()` dans [cron-jobs.ts](../../src/lib/cron-jobs.ts) — même cron `daily_stats_recalc` déjà existant, pas de nouveau cron créé ; échec du précalcul non bloquant pour le reste de la boucle cron (try/catch dédié, comme le refresh challenges dans `runDailyClanSync`)
- [x] `GET /api/clans/[clanId]/awards` utilise désormais `getCachedOrComputeClanAwards()` : lit `ClanAwardsCache` en priorité, fallback sur `computeClanAwards()` à la volée si aucune ligne (clan tout juste créé) — **et écrit le résultat en cache à ce moment-là** (auto-guérison), pas seulement au prochain passage cron, puisque le calcul a de toute façon déjà eu lieu pour répondre à la requête
- [x] Décidé pour "week" : pas de rafraîchissement séparé plus fréquent — le cache se régénère au même rythme que les 2 autres périodes via le cron quotidien déjà existant ; suffisant vu que les awards ne sont pas une donnée temps réel
- [x] Mesuré le volume réel : `4379` lignes `SquadMember` pour le plus gros clan (D32, clan 1), `0` pour les 6 autres (pas encore de détection d'escouade)

**Validé le 2026-08-04** en conditions réelles : précalcul des 3 périodes pour le clan 1 en 335ms (3 lignes créées), lecture depuis le cache en 13ms, et auto-guérison confirmée sur un clan sans ligne de cache (clan 3 : calcul à la volée + écriture immédiate en cache, ligne créée et vérifiée en base).

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

---

## Idées — Suivi des adversaires rencontrés en match

Discuté le 2026-08-03. Objectif différent de la section "Comparaison de performances entre clans" ci-dessus : il ne s'agit pas de comparer deux clans déjà suivis, mais d'exploiter les rosters adverses (non trackés) déjà présents dans chaque match pour (1) repérer les clans potentiellement intéressants à ajouter plus tard, (2) mesurer la fréquence de croisement avec certains joueurs/clans, (3) savoir qui nous tue et qui on tue.

**Items 1 à 4 déployés (2026-08-03/04)**, ainsi que le filtrage par période et le classement "arme qui tue le plus" des suggestions complémentaires (voir détail par item ci-dessous). Restent : clans rivaux récurrents (qui finit devant), zone de mort récurrente, revanche.

### Règle d'appel API — à respecter strictement

- La résolution du clan d'un adversaire (`fetchPlayerClan(accountId)`, [pubg.ts:564](../../src/lib/pubg.ts#L564)) coûte **un appel API PUBG par joueur**.
- **Un seul appel par `pubgAccountId` jamais vu auparavant.** Si le joueur est déjà connu en base (`EncounteredPlayer` proposé ci-dessous), ne jamais rappeler l'API pour lui — se contenter d'incrémenter le compteur de croisements.
- Le rate limit PUBG est partagé avec la sync des clans suivis (`AppConfig.pubg_api_rate_limit_rpm`, défaut 10 RPM, voir `CLAUDE.md` section Gotcha 8) — cette résolution doit passer par la même queue/throttle, jamais en appel direct synchrone depuis une route.
- Aucun re-fetch périodique prévu par défaut (un joueur qui change de clan restera avec l'ancien tag tant qu'on ne décide pas explicitement d'un refresh — non retenu pour l'instant, à trancher plus tard si besoin).
- Les infos de roster adverses (nom, `accountId`, placement, kills) proviennent du match déjà synchronisé (`analyzeMatchForSquads`, [squad-detector.ts:213](../../src/lib/squad-detector.ts#L213)) — **aucun appel API supplémentaire** pour cette partie, uniquement pour la résolution du clan.
- **Bots identifiés gratuitement, sans appel API.** Confirmé empiriquement le 2026-08-03 sur des télémétries réelles (`.telemetry-captured/`, échantillon 130 comptes dont 4 bots) : les comptes bots ont un `accountId` au format `ai.<nombre>` (ex. `ai.325`), les vrais joueurs au format `account.<guid>` (ex. `account.16c80fae97c9468f923e5b45d8f34d92`) — distinction structurelle fiable à 100 %, aucune heuristique de nom nécessaire. **Ne jamais appeler `fetchPlayerClan` pour un `accountId` commençant par `ai.`** — un bot n'a structurellement aucun clan à résoudre, l'appel serait gaspillé.

### ~~1. Identification légère des adversaires (sans créer de `Clan`/`ClanMember`)~~ — ✅ Déployé le 2026-08-03

**Pourquoi c'est utile :** repérer les clans qui reviennent souvent en face de nous, pour décider plus tard de les ajouter officiellement — sans les mélanger avec la table `ClanMember` (qui sert au tracking actif "Ungrouped" inclus).

**Données disponibles :** rosters de match déjà résolus par `analyzeMatchForSquads` ; `fetchPlayerClan()` déjà implémenté dans `pubg.ts` pour la résolution ponctuelle.

- [x] Créer une table légère `EncounteredPlayer` (`pubgAccountId` unique par clan, `pubgPlayerName`, `platformShard`, `pubgClanId`/`pubgClanTag`/`pubgClanName` nullables, `clanResolvedAt`, `resolveAttempts`, `firstSeenAt`, `lastSeenAt`) — migration `20260803120000_add_encountered_player`, volontairement séparée de `Clan`/`ClanMember`
- [x] Brancher la capture des participants adverses au moment du sync de match — `captureEncounteredPlayers()` dans [encountered-players.ts](../../src/lib/encountered-players.ts), appelée juste après `analyzeMatchForSquads` dans [sync-matches/route.ts](../../src/app/api/clans/[clanId]/sync-matches/route.ts), exclut les comptes `ai.*` (bots) et les membres du clan suivi, aucun appel API supplémentaire
- [x] Ajouter une tâche basse priorité, séparée de la queue de sync clan, qui résout le clan **uniquement** pour les `pubgAccountId` non résolus — cron `encountered_player_clan_resolution` dans [cron-jobs.ts](../../src/lib/cron-jobs.ts) (`resolveEncounteredPlayerClans`), toutes les 30 min par défaut (`ENCOUNTERED_PLAYER_CLAN_RESOLUTION_CRON`), batch de 5, un seul appel par joueur (jamais de re-fetch), max 3 tentatives en cas d'échec réseau
- [x] Décider d'un seuil avant résolution — fixé à 2 croisements minimum (`ENCOUNTERED_PLAYER_MIN_ENCOUNTERS_BEFORE_RESOLUTION`)
- [x] Vue listant les clans adverses les plus rencontrés, non trackés, avec nombre de croisements — page [`/clans/[clanId]/telemetry/opponents`](../../src/app/clans/[clanId]/telemetry/opponents/page.tsx), API [`GET /api/clans/[clanId]/encountered-players`](../../src/app/api/clans/[clanId]/encountered-players/route.ts), accès Owner/Admin (`requireRole(['Owner', 'Admin'])`), nav ajoutée en DB (`NavItem.navKey = 'owner.encountered-opponents'`, section owner-menu, `defaultRole: 'owner'` — même visibilité nav que les pages télémétrie voisines ; l'API reste ouverte aux Admin en accès direct)
- [x] **Cas d'usage identifié le 2026-08-03, traité le 2026-08-03** : `/clans/[clanId]/telemetry/matches/[matchId]/telemetry` résout maintenant aussi les noms adverses via un nouveau `opponentIdentityMap` (issu d'`EncounteredPlayer`) exposé par [route.ts](../../src/app/api/clans/[clanId]/matches/[matchId]/telemetry/route.ts), avec un badge dédié "Adversaire · [tag]" (tone `opponent`, bleu ciel) distinct du badge "Membre du clan"
- [x] Sur cette même page, label "Bot" (tone `bot`, gris) affiché à la place du nom PUBG généré pour tout `accountId` préfixé `ai.` — détection par préfixe dans `resolveTelemetryMemberLabel()`

**Validé le 2026-08-03** sur un match réel déjà importé (clan 1) : roster de 99 participants, 92 bots détectés et exclus, 6 adversaires réels capturés correctement. Résolution de clan testée end-to-end sur un compte réel (résultat "sans clan", mis en cache — pas de re-appel).

**Non couvert dans ce lot** (à faire plus tard si besoin) : test visuel navigateur clair/sombre + mobile de la page `/telemetry/opponents` — pas de navigateur headless disponible dans cet environnement, à vérifier manuellement.

### ~~2. Compteur de croisements~~ — ✅ Déployé le 2026-08-03

**Pourquoi c'est utile :** savoir "on retombe souvent sur ce joueur/ce clan" est une info déjà disponible sans appel API — pur sous-produit du sync de match existant.

- [x] Incrémenter `EncounteredPlayer.encounterCount` à chaque match partagé avec un membre suivi (upsert dans `captureEncounteredPlayers`)
- [x] Exposer un top des adversaires/clans les plus croisés (par clan suivi) — bloc "Clans adverses les plus croisés" sur la page `/telemetry/opponents`, agrégé depuis `pubgClanTag`
- [ ] Distinguer croisement "même match, roster adverse" (déjà disponible) de "même match, dans le top de placement proche" si utile plus tard (hors scope initial)
- [x] Filtrage par période (Semaine/Mois/Tous) — **fait le 2026-08-04**, `SegmentedControl` sur `/telemetry/opponents`, filtre sur `lastSeenAt` (dernière rencontre) via `?period=`, pas un recalcul du compteur — `encounterCount` reste le cumul total historique, précisé dans l'UI

#### Bug trouvé et corrigé le 2026-08-04 : coéquipiers comptés comme adversaires

Signalé par l'utilisateur, confirmé sur données réelles : `captureEncounteredPlayers` parcourait tous les rosters du match sans distinguer le roster (squad) d'un membre suivi des autres — un ami/random groupé avec un membre en solo/duo queue se retrouvait donc dans "Adversaires rencontrés" au même titre qu'un vrai inconnu d'une autre équipe. Vérifié sur un match réel du clan 1 : `Praetes` et `BL0odice` étaient dans le même roster que `pagiotte`/`SAMUELAXEII` — de vrais coéquipiers, pas des adversaires.

- [x] Nouveau champ `EncounteredPlayer.teammateEncounterCount` (migration `20260804200000_add_teammate_encounter_count`) — sous-ensemble de `encounterCount`, incrémenté seulement quand le roster du joueur croisé contenait un membre suivi ; `opponentEncounterCount` (= `encounterCount - teammateEncounterCount`) calculé à la lecture, pas stocké
- [x] `captureEncounteredPlayers()` dans [encountered-players.ts](../../src/lib/encountered-players.ts) détermine `isOurRoster` par roster (au moins un participant dans `knownAccountIds`) avant de classer chaque adversaire potentiel
- [x] `topRivalClans` dans [encountered-players/route.ts](../../src/app/api/clans/[clanId]/encountered-players/route.ts) agrège désormais sur `opponentEncounterCount` uniquement — le clan d'un coéquipier occasionnel ne pollue plus le classement des clans rivaux
- [x] UI `/telemetry/opponents` : colonnes "Adversaire"/"Coéquipier" séparées (au lieu d'une colonne "Croisements" unique), badge "Coéquipier" ou "Mixte" (a été les deux selon le match) à côté du nom, filtre "Adversaires uniquement / Coéquipiers uniquement", nouvelle carte KPI "Dont coéquipiers", en-tête renommé "Joueurs croisés" (plus honnête que "Adversaires suivis")

**Validé le 2026-08-04** en rejouant la capture sur le même match réel : `Praetes` et `BL0odice` correctement identifiés avec un `teammateEncounterCount` non nul. Note : les chiffres exacts de cette première validation (11 et 4 croisements totaux) se sont révélés faux dans l'heure qui a suivi — voir le bug de double comptage ci-dessous, découvert en creusant pourquoi `Praetes` semblait sous-compté comme coéquipier.

#### Second bug trouvé et corrigé le 2026-08-04 (même jour) : compteurs de croisement doublés

Signalé par l'utilisateur ("il me semble que Praetes a été coéquipier plus d'une fois ?"), la vérification a révélé un bug plus grave que prévu : `captureEncounteredPlayers()` est appelée dans une boucle `for (member of clan.members) { for (matchId of nouveaux matchs DE CE MEMBRE) { ... } }` — la déduplication "match déjà importé" se fait par `memberId + pubgMatchId`, pas par `pubgMatchId` seul. Un match joué par **plusieurs membres du clan ensemble** (le cas normal en squad) est donc traité comme "nouveau" séparément pour chaque membre présent, et `captureEncounteredPlayers()` incrémentait `encounterCount`/`teammateEncounterCount` une fois par membre du clan dans le match, pas une fois par match réel. Tous les compteurs de croisement étaient gonflés depuis le tout début de la fonctionnalité (2026-08-03), dès qu'au moins 2 membres partageaient un match — ce qui est fréquent.

- [x] Correctif dans [sync-matches/route.ts](../../src/app/api/clans/[clanId]/sync-matches/route.ts) : nouveau `Set<string>` `capturedEncounterMatchIds` déclaré une fois par appel de sync (hors boucle membre), `captureEncounteredPlayers()` ne s'exécute que si le `pubgMatchId` n'a pas déjà été traité dans ce passage de sync
- [x] Données corrigées le 2026-08-04 : script ponctuel supprimant les lignes `EncounteredPlayer` des 3 clans affectés (clan 1 : 2370 lignes, clan 5 : 309, clan 7 : 764) et les reconstruisant en ne rappelant l'API qu'une fois par match réel distinct (38 + 7 + 9 = 54 appels), plutôt qu'une fois par paire membre/match — les matchs étaient tous récents (depuis le 2026-08-03), donc encore dans la fenêtre de rétention PUBG, aucune perte
- [x] Chiffre corrigé pour `Praetes` : `encounterCount: 7`, `teammateEncounterCount: 7` — **coéquipier 7 fois sur 7**, jamais un adversaire réel, contre l'ancien chiffre bugué (14 croisements, 1 seul marqué coéquipier) qui avait à la fois doublé le total et raté presque toute la détection de coéquipier

**Leçon retenue :** toute future feature qui capture une donnée "par match" depuis une boucle de sync structurée par membre doit dédupliquer explicitement par `pubgMatchId`, pas se fier à la déduplication `memberId + pubgMatchId` déjà en place pour l'import des `Match` — celle-ci est correcte pour son propre usage (une ligne `Match` par membre est voulu) mais incorrecte comme garde-fou pour une capture qui doit être unique par match réel.

#### Croisement avec le kill-feed — ✅ Déployé le 2026-08-04

Demandé par l'utilisateur : identifier sur `/telemetry/opponents` qui a déjà été tué par le clan, et qui a déjà tué un membre du clan. Peu coûteux car `KillEvent` (item 3, Némésis) contient déjà toute l'info nécessaire — simple croisement, aucune nouvelle capture de donnée.

- [x] Dans [encountered-players/route.ts](../../src/app/api/clans/[clanId]/encountered-players/route.ts) : deux `groupBy` sur `KillEvent` scopés au clan — `victimAccountId` où `killerMemberId` est renseigné (tué par le clan), `killerAccountId` où `victimMemberId` est renseigné (a tué un membre) — croisés avec `EncounteredPlayer.pubgAccountId`
- [x] UI `/telemetry/opponents` : colonnes "Tué par le clan" / "A tué un membre" dans le tableau, 2 cartes KPI ("Déjà tués par le clan", "Ont déjà tué un membre") avec le nombre de joueurs distincts concernés

**Limite héritée du kill-feed (déjà documentée pour l'item 3) :** ne couvre que les matchs synchronisés depuis le déploiement du kill-feed, pas d'historique rétroactif complet — même contrainte de rétention PUBG que pour Némésis.

**Validé le 2026-08-04** sur données réelles du clan 1 : 1743 adversaires distincts déjà tués par le clan, 1422 adversaires distincts ayant déjà tué un membre — requête `groupBy` fonctionnelle sur un volume réel de plusieurs milliers de lignes `KillEvent`.

#### Tableau des clans rencontrés (agrégat par clan) — ✅ Déployé le 2026-08-05

Demandé par l'utilisateur : sous le tableau des joueurs, une carte avec un tableau paginé des clans rencontrés (agrégés, pas joueur par joueur), avec les mêmes données utiles (nombre de kills, etc.) que le tableau joueurs. Réutilise entièrement les données déjà calculées côté API (pas de nouvelle capture, pas de migration schéma) — simple ré-agrégation de `EncounteredPlayer` + `KillEvent` par `pubgClanTag` au lieu de par joueur.

- [x] Dans [encountered-players/route.ts](../../src/app/api/clans/[clanId]/encountered-players/route.ts) : la `Map` `resolvedClanTags` (qui ne sommait que `opponentEncounterCount` pour les 5 pills existantes) remplacée par `rivalClanMap`, une `Map<string, RivalClanAccumulator>` accumulant par tag `playerCount`, `opponentEncounterCount`, `killedByClanCount`, `killedClanMemberCount` et `lastSeenAt` (max) — toujours filtrée sur `opponentEncounterCount > 0` par joueur, donc un clan uniquement croisé comme coéquipiers n'apparaît jamais (même règle que pour `topRivalClans`)
- [x] `topRivalClans` (top 5, pour les pills) désormais dérivé de ce même `rivalClanMap` plutôt que recalculé séparément ; nouveau champ `rivalClans` (liste complète, triée par `opponentEncounterCount` décroissant, non limitée) ajouté à la réponse JSON
- [x] `summary.distinctClansIdentified` recalculé depuis `rivalClanMap.size` (comportement identique à avant, juste la source de la donnée qui a changé)
- [x] UI `/telemetry/opponents` : nouvelle carte "Clans rencontrés" sous le tableau des joueurs, avec recherche (tag/nom), tri (Croisements / Joueurs identifiés / Tué par le clan / A tué un membre / Dernière rencontre / Tag) et pagination (10 lignes/page — `CLAN_PAGE_SIZE`), même pattern de pagination que le tableau joueurs (reset de page au changement de recherche/tri/période, clamp si la page dépasse le total)
- [x] Colonnes : Clan (tag + nom), Joueurs identifiés, Croisements, Tué par le clan, A tué un membre, Dernière rencontre

**Validé le 2026-08-05** sur données réelles du clan 1 : 59 clans adverses distincts agrégés (hors coéquipiers), classement cohérent avec les colonnes attendues (ex. `[SVN] THE_SEVEN` : 2 joueurs identifiés, 8 croisements, 2 kills de membre du clan — vérifié par script temporaire contre la DB de prod, supprimé après validation).

### ~~3. Némésis — qui nous a tués, qui on a tué~~ — ✅ Déployé le 2026-08-03 (+ backfill partiel via fichiers capturés)

**Pourquoi c'est utile :** angle jamais couvert actuellement, alors que la télémétrie contient déjà l'info brute (tueur/victime par événement `LogPlayerKill`).

**Données disponibles :** pipeline `pubg-telemetry` existant, mais les événements `LogPlayerKill`/`LogPlayerMakeGroggy` ne sont aujourd'hui pas persistés individuellement (seuls les totaux agrégés par `SquadMember` le sont).

- [x] Étendre le parser télémétrie pour extraire les événements `LogPlayerKill` — capture **non filtrée** à l'extraction (`killFeedSamples` dans [parser.ts](../../src/lib/pubg-telemetry/parser.ts), type `TelemetryKillFeedSample`) : `clanMemberKeys` est vide sur le chemin de sync principal (`index.ts` ne le passe jamais), donc le filtrage "victime ou tueur = membre suivi" est fait à la persistance, pas au parsing
- [x] Stocker dans une nouvelle table relationnelle `KillEvent` (migration `20260803180000_add_kill_event`) : `squadMatchId`, `clanId`, `killerAccountId`/`killerRawKey`/`killerMemberId`, `victimAccountId`/`victimRawKey`/`victimMemberId`, `weaponName`, `distance`, `headshot`, `timestampSeconds`, `matchDate` — table relationnelle plutôt que blob JSON (comme `PositionMetricCell`/`DropPressureStat`), pour permettre l'agrégation Némésis sans reparser du JSON
- [x] [kill-event-persistence.ts](../../src/lib/kill-event-persistence.ts) : résout `killerMemberId`/`victimMemberId` contre **tout le roster du clan** (pas seulement les membres de la squad détectée, car un kill peut impliquer n'importe quel participant du match), ne garde que les lignes où au moins un côté est un membre suivi ; remplacement idempotent (delete+recreate) par `squadMatchId`
- [x] Branché sur les trois chemins de sync existants : [pubg-telemetry/index.ts](../../src/lib/pubg-telemetry/index.ts) (chemin principal automatique) et les deux points de [manual-sync.ts](../../src/lib/pubg-telemetry/manual-sync.ts) (sync manuel / import fichier), juste après `persistDropPressureStatsForMatch`
- [x] Relié `killerAccountId`/`victimAccountId` à `EncounteredPlayer` — fait **à la lecture** dans l'API Némésis plutôt qu'à l'écriture, pour rester à jour si le nom/clan de l'adversaire est résolu plus tard
- [x] Page/widget "Némésis" par membre — [`/members/[id]/nemesis`](../../src/app/members/[id]/nemesis/page.tsx), API [`GET /api/members/[id]/nemesis`](../../src/app/api/members/[id]/nemesis/route.ts), accès `requireSameClanAsMember` (comme les autres pages membre), nav ajoutée en DB (`NavItem.navKey = 'member.nemesis'`, section member-section) ; exclut les bots des classements Némésis mais expose leur compte à part ("Bots neutralisés" / "Tué par un bot")
- [ ] Vérifier l'impact volumétrie/temps de parsing sur les matchs déjà backfillés avant d'envisager un backfill complet — **sans objet**, voir contrainte de rétention ci-dessous

**Correction du 2026-08-03 (même jour) : backfill partiel finalement possible, sans API.** L'analyse initiale ci-dessus était incomplète — elle ne considérait que le resync via l'API PUBG, bloqué par la rétention ~14-15 jours. Mais le dossier `.telemetry-captured/` contient déjà les fichiers JSON bruts téléchargés lors de précédents parsings (utilisés pour le backfill v1→v2, jamais nettoyés depuis). Vérifié : sur 672 fichiers capturés, **658 correspondent à des matchs hors fenêtre de rétention** — leur `squadMatchId` est encodé dans le nom de fichier. Ces fichiers permettent de reparser localement (aucun appel API PUBG) et d'en extraire le kill-feed.

- [x] Script [`scripts/backfill-kill-events-from-captured.ts`](../../scripts/backfill-kill-events-from-captured.ts) : parcourt `.telemetry-captured/`, extrait le `squadMatchId` du nom de fichier, reparse le JSON brut localement (`parseTelemetrySnapshot`), persiste via `persistKillEventsForMatch` — flags `--limit` et `--dry-run`
- [x] Validé sur un lot de 5 fichiers avant le lot complet : 28 lignes `KillEvent` réellement pertinentes écrites (sur 514 kills bruts parsés, la plupart impliquant des joueurs hors clan des deux côtés)
- [x] Lancé sur les 672 fichiers le 2026-08-03 — **terminé** : 672 fichiers traités, 672 matchés à un `SquadMatch` existant, 2 erreurs de parsing (JSON tronqué/corrompu sur les fichiers capturés — matchs ignorés, sans impact ailleurs), **3709 `KillEvent` écrits sur 659 matchs distincts** (clan 1)

Sur les 1319 télémétries déjà parsées : **658 récupérées via backfill local** (fichiers capturés, hors fenêtre de rétention, zéro appel API) + 300 potentiellement resynchronisables via l'API dans la fenêtre de rétention (non fait, resync individuel si besoin) = l'essentiel de l'historique du clan 1 dispose maintenant d'un kill-feed. Reste un résidu incompressible (~361 matchs, autres clans ou hors fenêtre sans fichier capturé) qui n'auront jamais de kill-feed.

**Validé le 2026-08-03** par un vrai resync d'un match récent (clan 1, dans la fenêtre de rétention) : 3 `KillEvent` capturés correctement, dont un membre tué par un adversaire résolu, un membre ayant tué un adversaire, un membre tué à la grenade — `killerMember`/`victimMember` correctement peuplés via jointure.

**Effort réel :** moyen, comme estimé — la difficulté principale était la découverte tardive que `clanMemberKeys` n'est jamais peuplé sur le chemin de sync automatique, nécessitant de déplacer le filtrage du parsing vers la persistance.

### ~~4. Bots par match — fréquentation lobby et bots neutralisés~~ — ✅ Déployé le 2026-08-04

Suggéré le 2026-08-03, en réaction directe à la confirmation du préfixe `ai.` ci-dessus. **Pourquoi c'est utile :** contexte de qualité pour les autres stats (un match avec beaucoup de bots doit être lu différemment d'un lobby 100 % humain) et un chiffre engageant en soi ("X bots neutralisés cette semaine").

**Données disponibles :** sous-produit direct de la détection de bots (préfixe `ai.`) et de l'extraction `LogPlayerKill` de l'item 3 — aucune nouvelle source de données, uniquement de l'agrégation supplémentaire sur ce qui est déjà itéré.

- [x] Compter les `accountId` uniques préfixés `ai.` par match au moment du parsing télémétrie — `countBotsInMatch()` dans [encountered-players.ts](../../src/lib/encountered-players.ts), calculé depuis le roster complet déjà chargé par `fetchMatchDetails`, aucun appel API supplémentaire
- [x] Stocker `botCount` par match observé — champ `Match.botCount` nullable (migration `20260803190000_add_match_bot_count`), rempli à chaque sync dans [sync-matches/route.ts](../../src/app/api/clans/[clanId]/sync-matches/route.ts) ; nullable et non backfillé (nouvelles synchronisations uniquement, cohérent avec la politique déjà adoptée pour `EncounteredPlayer`/`KillEvent`)
- [x] Compter, dans `KillEvent` (item 3), les kills où le tueur est un membre suivi et la victime un `ai.*` — fait en bonus de l'item 3 : `botKillCount`/`botDeathCount` exposés par `GET /api/members/[id]/nemesis` et affichés sur `/members/[id]/nemesis`
- [x] Exclure explicitement les kills/morts impliquant un bot des classements Némésis — fait (`topKillers`/`topVictims` filtrent `isBot`)
- [x] Afficher le nombre moyen de bots par match, par période — carte KPI "Bots moy. / match" sur `/telemetry/opponents`, `prisma.match.aggregate` scopé au clan et à la période sélectionnée (Semaine/Mois/Tous, même `SegmentedControl` que le filtre de l'item 2)

**Validé le 2026-08-04** : `countBotsInMatch` testé sur un vrai match récent (roster 98, 90 bots détectés, cohérent avec l'échantillon précédent). **`botCount` est encore vide en base à ce stade** — champ nouveau sans backfill, se remplit au fil des prochaines synchronisations (cron horaire déjà actif) ; la carte KPI affichera `-` tant qu'aucun match n'a de `botCount` non nul dans la période sélectionnée.

**Point d'attention documenté dans le code :** la moyenne agrège sur `Match` (une ligne par membre tracké, pas par match unique) — un match croisé par plusieurs membres du clan compte plusieurs fois. Approximation acceptable pour un indicateur de fréquentation, pas une statistique exacte.

#### Visibilité élargie — dashboards membre et clan (2026-08-04)

Discuté le 2026-08-04 : les stats bots n'étaient visibles que sur des pages secondaires (`/telemetry/opponents`, réservée Owner/Admin ; `/members/[id]/nemesis`, accessible mais pas la page d'atterrissage). Décision : remonter un teaser sur les deux dashboards principaux, en gardant les pages détaillées comme destination "en savoir plus".

- [x] **Dashboard membre** ([`/members/[id]/dashboard`](../../src/app/members/[id]/dashboard/page.tsx)) : tuile cliquable "🤖 Bots neutralisés" (lien vers `/members/[id]/nemesis`), fetch léger et non bloquant sur `GET /api/members/[id]/nemesis` déjà existant — aucune nouvelle route
- [x] **Page stats clan** ([`/clans/[clanId]/stats`](../../src/app/clans/[clanId]/stats/page.tsx), section "Ambiance de lobby") : moyenne de bots par match, réutilise le `SegmentedControl` de période déjà présent pour la section playstyle (`telemetryPeriod`) — pas de nouveau sélecteur
- [x] Nouvelle route [`GET /api/clans/[clanId]/bot-stats`](../../src/app/api/clans/[clanId]/bot-stats/route.ts) créée plutôt que de réutiliser `/api/clans/[clanId]/encountered-players` : cette dernière est réservée Owner/Admin (expose des noms d'adversaires), alors qu'une moyenne de bots ne révèle rien de sensible — permission alignée sur `requireNavPermission('clan.stats')`, donc visible à tout membre du clan comme le reste de la page stats
- [ ] `/clans/[clanId]/overview` envisagée initialement pour la tuile clan, écartée : cette page est réservée Admin (`defaultRole: 'admin'`), pas visible à tout le clan — `/clans/[clanId]/stats` choisie à la place (`defaultRole: 'none'`)

### Note pour plus tard — données de match du membre suivi lui-même

Mentionné le 2026-08-03 : la télémétrie contient aussi des données détaillées sur les matchs du membre suivi lui-même (au-delà de ce qui alimente déjà drop zones / positions / weapon mastery). Piste à creuser plus tard, sans axe précis identifié pour l'instant — à reprendre quand le reste de cette section sera avancé.

### Suggestions complémentaires (brainstorm, non détaillées techniquement)

**⏸ Pause décidée le 2026-08-04.** Items 1 à 4 déployés, backfill partiel fait, filtrage par période et classement d'armes ajoutés. Les 3 idées restantes ci-dessous sont notées mais volontairement non développées pour l'instant — à reprendre plus tard si besoin, aucune n'a de dépendance bloquante ni de contrainte d'urgence (les données nécessaires, `KillEvent` et `PositionMetricCell`, sont déjà en base).

- [ ] **Clans rivaux récurrents** — une fois `pubgClanTag` résolu sur les adversaires, agréger par clan adverse : nombre de croisements, qui finit devant (recoupe l'item "Détection de rivalité" de la section comparaison inter-clans ci-dessus, mais sans exiger que l'autre clan soit lui-même suivi sur le site) — le compteur de croisements par clan existe déjà (bloc "Clans adverses les plus croisés"), reste le "qui finit devant"
- [x] **Arme qui nous tue le plus** — **fait le 2026-08-04** : section "Armes qui vous tuent le plus" sur `/members/[id]/nemesis`, classement global (toutes armes, tous adversaires confondus, indépendant du filtre par arme) avec mini barres de comparaison, `aggregateWeapons()` dans [route.ts](../../src/app/api/members/[id]/nemesis/route.ts) — s'ajoute au filtre par arme déjà en place (qui lui recalcule les classements par adversaire) et au dropdown [`WeaponSelect`](../../src/components/ui/WeaponSelect.tsx) avec icônes, nouveau composant réutilisable créé faute d'équivalent existant (le `<select>` HTML natif ne peut pas afficher d'images dans ses options)
- [ ] **Zone de mort récurrente face à un adversaire donné** — croiser les positions de mort (déjà couvertes par `PositionMetricCell`, métrique `death`) avec `killerAccountId` une fois disponible
- [ ] **Revanche** — détecter si on retue plus tard dans la saison un joueur qui nous avait tués auparavant (nécessite l'historique `KillEvent` de l'item 3)

### Priorisation suggérée

| Priorité | Idée | Statut | Effort | Dépendances |
|---|---|---|---|---|
| 1 | Identification légère des adversaires + compteur de croisements (items 1 + 2) | ✅ Déployé 2026-08-03/04 | Faible à moyenne | Aucune |
| 2 | Némésis / kill-feed (item 3) | ✅ Déployé 2026-08-03 (+ backfill partiel) | Moyenne | Extension du parser télémétrie |
| 3 | Bots neutralisés / tué par un bot | ✅ Déployé en bonus de l'item 3 | Faible | Item 3 |
| 4 | Bots par match (fréquentation lobby, `botCount`) | ✅ Déployé 2026-08-04 | Faible | Aucune (indépendant du kill-feed) |
| 5 | Arme qui nous tue le plus | ✅ Déployé 2026-08-04 | Faible | Item 3 |
| 6 | Clans rivaux récurrents (qui finit devant), zone de mort récurrente, revanche | Reste à faire | Moyenne | Items 1–3 |

Item 4 restant (fréquentation lobby `botCount` par match) est indépendant du kill-feed — nécessite juste de compter les `ai.*` uniques par match au moment du parsing, sans lien avec `KillEvent`.
