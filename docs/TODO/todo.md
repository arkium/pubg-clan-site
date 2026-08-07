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

### Adversaires — Vue superadmin globale, suivi de joueurs et favoris

Réflexion démarrée le 2026-08-07 à partir du tableau `/clans/[clanId]/telemetry/opponents`. Constat initial : ce tableau est scopé au clan suivi, sans vue transverse ; il n'existe aucun moyen de "commencer à suivre" un adversaire rencontré, ni de favoriser un clan ou un joueur.

**Investigation du modèle de données existant** (session du 2026-08-07) :
- `EncounteredPlayer` (`clanId`, `pubgAccountId`, unique sur `[clanId, pubgAccountId]`) duplique l'identité d'un même joueur adverse une fois par clan qui l'observe — pas d'entité "joueur" partagée entre clans.
- Aucun concept `isTracked`/`favorite`/`watchlist` nulle part dans le schéma.
- Les stats détaillées (`PlayerStats`, `MemberWeaponStats`, etc.) sont toutes ancrées sur `ClanMember.id` — un `EncounteredPlayer` n'a que des compteurs de rencontre, aucun historique de matchs/dégâts.
- **Problème d'identité à 3 branches, pas 2** : `ClanMember.pubgAccountId`, `EncounteredPlayer.pubgAccountId` (par clan) et `KillEvent.killerAccountId`/`victimAccountId` (string libre) ne sont reliés par aucune FK. Rien n'empêche qu'un même `pubgAccountId` existe simultanément comme `ClanMember` dans un clan et comme `EncounteredPlayer` dans un autre.
- Pattern déjà en place pour une page globale hors `/clans/[clanId]/` : `src/app/settings/*` + `requireSuperUser` (ex. `settings/pubg-api`, `settings/cron`).
- Écriture d'`EncounteredPlayer` : seulement 2 sites (`src/lib/encountered-players.ts` upsert, `src/lib/cron-jobs.ts::resolveEncounteredPlayerClans`). La route API `encountered-players` est en lecture seule.

**Décision d'architecture retenue** (à valider avant implémentation) : normaliser l'identité plutôt que de garder les tables actuelles telles quelles.

- [ ] Créer `Player` (identité globale) — clé unique `[pubgAccountId, platformShard]`, porte nom + clan PUBG résolu
- [ ] Créer `OpponentClan` (clan adverse global) — clé unique `[pubgClanId, platformShard]`, tag/nom résolus, remplace le texte dupliqué `pubgClanTag`/`pubgClanName` par ligne
- [ ] Faire pointer `ClanMember` vers `playerId` (FK `Player`) au lieu de stocker `pubgAccountId` en dur
- [ ] Transformer `EncounteredPlayer` en table de faits `ClanEncounter` (`clanId` + `playerId` + `opponentClanId` + compteurs + dates), unique sur `[clanId, playerId]`
- [ ] Laisser `KillEvent.killerAccountId`/`victimAccountId` en string libre pour l'instant (faible valeur immédiate, gros volume) — ajouter `killerPlayerId`/`victimPlayerId` seulement si un besoin de stats apparaît plus tard
- [ ] Script de backfill : dédoublonner les `pubgAccountId` déjà présents des deux côtés ; en cas de collision membre/adversaire, priorité au statut membre
- [ ] Mettre à jour les 2 sites d'écriture (`encountered-players.ts`, `cron-jobs.ts`) + le(s) site(s) de création de `ClanMember`

**Fonctionnalités déclenchées par cette normalisation :**

- [ ] Page superadmin globale des adversaires (`src/app/settings/opponents/page.tsx` + API `requireSuperUser`) — agrège `ClanEncounter` sur tous les clans suivis, groupé par `OpponentClan` puis par `Player`, sans dédup à la volée grâce au modèle normalisé
- [ ] **Suivre un adversaire externe** = créer un `ClanMember` référençant le `playerId` existant, rattaché à un clan suivi choisi manuellement, avec un statut dédié (ex. `Tracked`, en réutilisant le champ `joinStatus` déjà présent comme state machine) + déclencher un job de resync télémétrie pour backfiller son historique
- [ ] **Compléter un clan déjà suivi** — cas distinct : quand le `pubgClanTag` résolu d'un `Player` (croisé comme adversaire *ou* comme coéquipier via `teammateEncounterCount`) correspond exactement à un `Clan` déjà suivi en base, proposer de l'ajouter directement comme `ClanMember` de **ce** clan (pas un nouveau clan choisi à la main) — couvre le cas du joueur qui a rejoint le clan en jeu mais n'a jamais été ajouté manuellement dans l'app
- [ ] Détecter automatiquement ces correspondances côté API (jointure `Player.pubgClanId` ↔ `Clan.pubgClanId`) et les faire remonter en priorité dans la page superadmin, plutôt que de compter sur une recherche manuelle
- [ ] Favori clan (`FavoriteClan` ou flag sur `OpponentClan`) — simple, pas de calcul de stats, sert juste à épingler en haut de la vue globale
- [ ] Favori joueur — pas de mécanisme séparé : c'est la même opération que "suivre un adversaire" ci-dessus, pour éviter de construire une architecture de stats parallèle indexée par `pubgAccountId`

**UI/UX de la page superadmin globale (`/settings/opponents`) :**

- [ ] Suivre le pattern des pages `settings/*` existantes : `.app-container` + `.app-main`, pas de `ClanSectionNav` (page hors contexte clan)
- [ ] Bandeau de compteurs globaux en tête de page : nombre de clans suivis actifs, nombre de clans adverses distincts, nombre total de rencontres sur la période, nombre de "membres manquants" détectés
- [ ] Filtre de période partagé par les deux tableaux (`Semaine` / `Mois` / `Tous`), cohérent avec les autres pages télémétrie — sans lui les compteurs mélangent des rencontres anciennes et récentes

**Tableau 1 — Clans suivis** (10 lignes, paginé) :
- [ ] Colonnes : nom/tag du clan, effectif (`ClanMember` actifs), nombre de rencontres générées (somme `ClanEncounter` sur la période), dernier match synchronisé, nombre de "membres manquants" détectés pour ce clan
- [ ] Colonne "membres manquants" cliquable → filtre direct le bandeau prioritaire (voir tableau 2) sur ce clan, sans quitter la page
- [ ] Tri par défaut sur le nombre de rencontres décroissant, tri cliquable par colonne
- [ ] Ligne cliquable → navigation vers `/clans/[clanId]/telemetry/opponents` de ce clan
- [ ] Recherche texte par nom/tag, indépendante du tableau 2

**Tableau 2 — Clans adversaires** (10 lignes, paginé) :
- [ ] Colonnes : clan adverse (`OpponentClan`, tag + nom), nombre de fois adversaire (agrégé tous clans suivis confondus), nombre de fois coéquipier (agrégé tous clans suivis confondus), dernière rencontre
- [ ] Ligne séparée "Sans clan" regroupant les `Player` dont le clan PUBG n'est pas résolu (`pubgClanId` null / `Ungrouped`) — à ne pas mélanger avec les vrais clans adverses dans le tri/classement
- [ ] Icône d'info si "coéquipier" très supérieur à "adversaire" sur une ligne — signal qu'il s'agit probablement d'un clan allié/partenaire plutôt qu'un rival, sans traitement automatique
- [ ] Tri par défaut sur le nombre de fois adversaire décroissant, tri cliquable par colonne (y compris coéquipier)
- [ ] Recherche texte par tag/nom, indépendante du tableau 1
- [ ] Colonne "Clans nous ayant croisés" avec badges cliquables vers le clan suivi concerné (navigation vers `/clans/[clanId]/telemetry/opponents` filtré sur ce clan adverse)
- [ ] Étoile de favori sur chaque ligne (optimiste, sans rechargement de page), clans favoris épinglés en tête de tableau avec séparateur visuel
- [ ] Ligne dépliable/clic → détail des joueurs de ce clan adverse (`Player` rattachés à cet `OpponentClan`)
- [ ] Bandeau prioritaire "Membres manquants détectés" en tête de page : joueurs dont le `pubgClanTag` correspond à un clan déjà suivi, avec bouton direct "Ajouter à <clan>" (pas de sélecteur, le clan cible est déjà déterminé) — traité séparément et avant la liste générale des adversaires
- [ ] Sur la fiche d'un joueur sans correspondance : bouton "Suivre ce joueur" avec sélecteur manuel du clan suivi cible (rattachement à un clan différent de celui affiché par PUBG, cas volontaire) + confirmation avant déclenchement du backfill télémétrie (opération non instantanée)
- [ ] État visuel distinct pour un joueur déjà suivi ailleurs (badge "Membre de <clan>" au lieu du bouton "Suivre")
- [ ] Squelette de chargement et gestion d'erreur avec retry, cohérents avec `/clans`
- [ ] Vérifier le rendu en thème clair et sombre, et sur mobile (tableau → cartes empilées comme les autres pages `app-table-*`)

**Évolutions Stats & Tactique (pour le tableau 2) :**

- [ ] **K/D Ratio direct :** Ajouter `killsAgainst`, `deathsBy`, `damageDealtTo`, `damageReceivedFrom` dans `ClanEncounter` lors du parsing télémétrique.
- [ ] **Badges de Rivalité automatiques :** "Némésis" (on perd souvent contre eux), "Proie" (on gagne souvent) basés sur le K/D direct.
- [ ] **Phasage des rencontres :** Identifier si un clan adverse est un "Contestataire de Drop" (rencontres phase 1-2) ou un "Rival de Late Game" (phases finales).
- [ ] **Watchlist (Liste de surveillance) :** Créer une vue isolée dans le Dashboard Clan pour comparer les joueurs adverses `Tracked` aux moyennes de notre clan, avec une garantie d'isolation stricte (exclure `joinStatus='Tracked'` de tous les calculs internes du clan).

**Tests & Validation (Critiques pour l'intégrité) :**

- [ ] **Migration & Backfill :** Vérifier que la déduplication des `pubgAccountId` existants gère correctement les collisions (priorité au statut membre, sans écraser d'historique).
- [ ] **Intégrité DB :** Valider par des tests les contraintes d'unicité sur `Player` et `OpponentClan` lors du parsing simultané de plusieurs matchs.
- [ ] **Agrégation Télémétrie :** Créer un test unitaire garantissant que `killsAgainst`, `deathsBy`, etc. sont incrémentés sur le bon `ClanEncounter` lors du parsing d'un faux match JSON.
- [ ] **Isolation stricte de la Watchlist :** Test automatisé s'assurant qu'un `ClanMember` avec `joinStatus='Tracked'` est formellement ignoré par toutes les requêtes de moyennes, leaderboards et calculs de densité du clan.
- [ ] **Invalidation du Cache Local :** Vérifier que la table `Player` agit comme cache pour `searchPlayerByName`, mais force un rafraîchissement API (invalidation) si les données sont trop vieilles.

**Recherche de joueur — Vérifier la DB avant l'appel API PUBG :**

`searchPlayerByName` (`src/lib/pubg.ts:494`) tape l'API PUBG à chaque appel, sans aucun cache — problématique avec un rate limit par défaut de `10 RPM` (`AppConfig.pubg_api_rate_limit_rpm`) partagé avec la sync de matchs et la télémétrie. La table `Player` normalisée (voir ci-dessus) devient une opportunité de cache local pour cette fonction, pas seulement pour la nouvelle page.

- [ ] Avant d'appeler l'API PUBG dans `searchPlayerByName`, chercher d'abord une correspondance dans `Player` (nom insensible à la casse)
- [ ] Traiter un hit DB comme une piste, pas une vérité absolue : un joueur PUBG peut renommer son compte, `Player.pubgPlayerName` peut être périmé — définir une fenêtre de fraîcheur (ex. `updatedAt` de plus de N jours) au-delà de laquelle on retombe sur l'API malgré le hit local, en réutilisant le même principe que `clanResolvedAt`/`resolveAttempts` déjà en place pour la résolution de clan
- [ ] En cas de miss DB, appeler l'API comme aujourd'hui puis upserter le résultat dans `Player` — la table s'auto-alimente et les recherches suivantes du même nom deviennent gratuites
- [ ] Centraliser ce comportement dans `searchPlayerByName` lui-même plutôt que dans la route de la nouvelle page, pour que tous les appelants existants (ajout manuel de membre, etc.) en bénéficient sans dupliquer la logique

**Résolution de clan — Même principe, et un vrai doublon d'appels API déjà présent aujourd'hui :**

`resolveEncounteredPlayerClans` (`src/lib/cron-jobs.ts:1118`) appelle `fetchPlayerClan(pubgAccountId, platformShard)` une fois par ligne `EncounteredPlayer`, donc une fois par couple `(clanId, pubgAccountId)` — si le même joueur adverse est croisé par plusieurs clans suivis, sa résolution de clan est refaite à l'identique pour chacun.

- [ ] Déplacer `clanResolvedAt`/`resolveAttempts` de `EncounteredPlayer` vers `Player` (cohérent avec la normalisation ci-dessus) — un joueur donné n'est résolu qu'une seule fois, pas une fois par clan suivi qui l'a croisé
- [ ] Avant d'insérer le résultat de `fetchPlayerClan` comme nouveau `OpponentClan`, vérifier s'il existe déjà une ligne pour ce `pubgClanId` et upserter dessus plutôt que d'en recréer une par joueur résolu
- [ ] Appliquer la même fenêtre de fraîcheur sur `OpponentClan` (tag/nom peuvent changer si le clan est renommé) que celle prévue pour `Player` — éviter de considérer une résolution ancienne comme définitive
- [ ] Vérifier que le batch `ENCOUNTERED_PLAYER_RESOLUTION_BATCH_SIZE` reste pertinent une fois la déduplication par `Player` en place (le volume réel à résoudre devrait baisser mécaniquement)

**Référence :** discussion du 2026-08-07, pas encore de branche ni de migration créée.

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

### ~~Monitoring PUBG API (`/settings/pubg-api`) — Lisibilité des données~~ — ✅ Déployé le 2026-08-05

Réflexion du 2026-08-05 après lecture de [page.tsx](../../src/app/settings/pubg-api/page.tsx) et du type `ApiCallRow` : la page était centrée sur des appels individuels (heatmap 24h, historique paginé ligne à ligne) plutôt que sur des tendances agrégées. Toutes les pistes identifiées ont été déployées le même jour.

**Base commune** : nouveau module partagé [pubg-api-call-category.ts](../../src/lib/pubg-api-call-category.ts) (`categorizePubgApiCall`, `PUBG_API_CALL_CATEGORY_LABELS`) — remplace la fonction `getCronBadgeMeta` dupliquée qui vivait uniquement côté page, désormais réutilisée à la fois par l'agrégation serveur ([pubg-api-call-log-service.ts](../../src/lib/pubg-api-call-log-service.ts)) et par les badges côté client.

**Correction du 2026-08-05 (a posteriori) — la catégorisation initiale était quasi inopérante :** toutes les requêtes PUBG passent par `queuedPubgGet` ([pubg.ts:21-28](../../src/lib/pubg.ts#L21-L28)) avec `source` toujours égal à `'pubg-lib'` et `endpoint` toujours égal au chemin REST brut (ex. `/shards/steam/players/{id}/weapon_mastery`). Les mots-clés de l'ancienne catégorisation (`sync-matches`, `daily_sync`, `weekly`, `report`, `challenge`...) visaient des noms de jobs cron internes qui n'apparaissent quasiment jamais dans ces URLs réelles — résultat : presque tous les appels tombaient dans "Autre", y compris dans la répartition agrégée ci-dessous. Remplacé par une catégorisation basée sur la forme réelle du chemin REST PUBG (11 catégories couvrant les 11 points d'appel existants de `pubg.ts` : recherche joueur, détail joueur, maîtrise armes, stats lifetime/ranked/saison, liste des saisons, membres du clan, clan, détail match) — "Autre" ne devrait plus apparaître en pratique. Colonne "Cron" renommée en "Type" dans le tableau d'historique (l'ancien nom n'avait plus de sens).

**Complément du 2026-08-05 :** dans le tableau desktop, l'endpoint complet (`method` + chemin REST avec IDs) n'était visible qu'au survol (tooltip) sous le badge de catégorie — ajouté en clair sous le badge (police monospace, `break-all`), aligné sur la vue mobile qui l'affichait déjà en clair.

**Bug trouvé et corrigé le 2026-08-05 — appels clan doublés inutilement :** l'analyse de la colonne "Dispo API" (`rateLimitRemaining`) a révélé que la ligne "Clan" affichait systématiquement "-" pour une partie des appels. Diagnostic confirmé en base sur `PubgApiCallLog` (24 h glissantes) : `fetchPubgClanById()` ([pubg.ts](../../src/lib/pubg.ts)) tentait d'abord `/clans?filter[clanIds]=...`, qui **échoue en 404 à 100 % (120/120 appels observés)**, puis retombait en silence sur `/clans/{clanId}` qui réussit toujours (120/120). Les réponses d'erreur PUBG ne portent pas les en-têtes `X-RateLimit-*`, d'où le "-" sur la tentative ratée. Comme `clanId` est déjà connu à l'appel, la première tentative était purement redondante — corrigé en appelant directement `/clans/{clanId}`, ce qui divise par deux la consommation de quota RPM pour chaque lookup de clan (1 appel au lieu de 2). Sans régression : comportement final identique pour les appelants (`clan-service.ts`), simple suppression d'un aller-retour mort.

**Non lié à un bug (comportement PUBG confirmé) :** `/matches/{id}` ("Détail match") ne renvoie jamais les en-têtes `X-RateLimit-*` même en succès (61/61 dans l'échantillon) — particularité de cet endpoint côté PUBG, rien à corriger côté code.

- [ ] Surveiller sur quelques jours que "Clan" n'apparaît plus qu'une fois par lookup dans l'historique et que "Dispo API" y est systématiquement renseigné

**Priorité haute**

- [x] Répartition agrégée par source/cron : panneau "Répartition par cron / source" (appels, succès, erreurs, 429, latence moyenne par catégorie, fenêtre 24h)
- [x] Regroupement des messages d'erreur : panneau "Top erreurs" (top 5 messages par occurrence, fenêtre 24h)
- [x] Vue au-delà de 24h : panneau "Tendance 14 jours", mini graphique en barres (`dailySeries`), teinte rouge/ambre/verte selon présence d'erreurs/429 ce jour-là

**Priorité moyenne**

- [x] Jauge de consommation du quota : barre de progression sous les tuiles `X-RateLimit-*`, teinte verte/ambre/rouge selon le % consommé (70 % / 90 %)
- [x] Filtre par endpoint/source/`clanId` dans l'historique : formulaire "Filtrer" + "Effacer les filtres" au-dessus du tableau, paramètres `q` et `clanId` sur `GET /api/settings/pubg-api-calls`
- [x] Badge de cohérence RPM configuré vs `X-RateLimit-Limit` observé : bandeau d'alerte ambre si le RPM configuré dépasse la limite réelle observée côté PUBG

**Priorité basse**

- [x] Métrique "retries totaux" en carte de synthèse (`totals.retriesTotal`)

**Réalisé également le 2026-08-05**

- [x] Légende des codes statut au-dessus du tableau d'historique (2xx succès / 429 limite de débit / 4xx-5xx-n-a erreur)
- [x] Pagination adaptée : option `15` lignes remplace `10` dans `HISTORY_PAGE_SIZE_OPTIONS`, devient la valeur par défaut côté page et côté service (`getPubgApiCallsOverview`)

**Validation :** ESLint et `tsc --noEmit` propres sur les 4 fichiers modifiés/créés (page, service, route API, module de catégorisation). Non vérifié en session : rendu navigateur réel (pas d'identifiants SuperUser/Owner disponibles dans cet environnement).

- [ ] Vérifier dans le navigateur (Owner) le rendu des nouveaux panneaux, la jauge de quota, le filtre d'historique et le badge de cohérence RPM, en thème clair et sombre

**Refonte visuelle du 2026-08-05 — corrections de thème + alignement UI/UX :**

- [x] `bg-slate-900` (badge "Aujourd'hui") et `bg-slate-200` (piste de la jauge de quota) n'étaient pas remappés par le thème (couleurs non couvertes par `globals.css`) — remplacés par une mise en page sans couleur codée en dur et par `bg-gray-100` (remappé)
- [x] Ajout des variantes sombres manquantes dans `globals.css` pour `fuchsia`, `teal`, `lime` (bg-50/100, text-700/800/900, border-200/300) et `orange` (bg-50, border-200/300) — suivent exactement le pattern déjà existant pour emerald/amber/rose/cyan/etc., nécessaire pour que les nouveaux badges de catégorie restent lisibles en thème sombre
- [x] Remplacement du bouton "Voir uniquement les erreurs" et du `MobileDropdownNav` de pagination par deux `SegmentedControl` — standard documenté dans `docs/ui/tables.md` §"Standard des boutons segmentés" (CLAUDE.md règle #6), pas d'ad-hoc
- [x] Icônes `lucide-react` sur les 6 cartes de métriques, le bouton Actualiser, le titre "Configuration du rate limit", l'alerte de cohérence RPM et le bouton Purger
- [x] Grille de métriques passée à `gap-4` (2 colonnes mobile / 6 desktop) au lieu d'un simple empilement `grid-cols-1`
- [x] Mini-barres de répartition (succès/429/erreurs) sous chaque catégorie dans "Répartition par type d'appel", et barre de poids relatif sous chaque message dans "Top erreurs"
- [ ] Vérifier dans le navigateur (Owner) le rendu clair/sombre et mobile de la refonte visuelle — non vérifié en session, pas d'accès Owner disponible

---

### ~~Monitoring PUBG API — Répartition par clan~~ — ✅ Déployé le 2026-08-06 (backend + UI)

**Constat :** la colonne `PubgApiCallLog.clanId` existe déjà en base et un filtre par `clanId` a été ajouté sur `/settings/pubg-api` (voir ci-dessus), mais **elle est toujours `null` en pratique** — le filtre ne retournera jamais rien tant que ce chantier n'est pas fait. `queuedPubgGet()` ([pubg.ts:21-28](../../src/lib/pubg.ts#L21-L28)), point d'entrée unique de tous les appels PUBG, ne transmet que `{ source, method, endpoint, shard }` à la queue ([api-throttle.ts](../../src/lib/api-throttle.ts)) — jamais `clanId`/`memberId`, même quand la fonction appelante connaît parfaitement le clan ou le membre concerné. Le type `PubgApiRequestMetadata` supporte déjà ces deux champs, ils ne sont simplement jamais peuplés.

**Objectif produit :** permettre d'identifier quel clan consomme le plus de quota RPM partagé (utile en environnement multi-clan pour repérer une sync mal réglée qui pénalise les autres clans).

**Contrainte du 2026-08-05 (demande explicite) :** ce chantier touche des fonctions au cœur du pipeline de sync/télémétrie (`pubg.ts`, `pubg-domain/client.ts`, `clan-service.ts`, `pubg-telemetry/index.ts`, `pubg-telemetry/manual-sync.ts`, `cron-jobs.ts`) — la télémétrie ne doit pas être cassée par ce changement. Documentation du plan **avant** toute implémentation, avec tests, comme demandé.

#### Principe retenu — additif uniquement, zéro rupture de signature — ✅ Fait le 2026-08-06

- [x] `queuedPubgGet(url, config, context?: PubgApiCallContext)` dans `pubg.ts` transmet `context?.clanId`/`context?.memberId` à `enqueuePubgApiRequestWithMetadata`
- [x] Paramètre optionnel `context?: PubgApiCallContext` (`{ clanId?: number; memberId?: number }`, exporté depuis `pubg.ts`) ajouté en dernière position sur les 11 fonctions concernées : `searchPlayerByName`, `fetchPubgClanById`, `fetchClanMembers`, `fetchPlayerClan`, `fetchRecentMatchIds`, `fetchLifetimeStats`, `fetchPlayerRankedStats`, `fetchPlayerSeasonStats`, `fetchWeaponMastery`, `fetchMatchDetails`, `fetchMatchDetailsWithTelemetryAsset` (+ le helper interne partagé `fetchMatchResponse`)
- [x] `fetchCurrentSeason` non modifiée (appel système, aucun contexte pertinent)
- [x] Méthodes de `PubgDomainClient` ([pubg-domain/client.ts](../../src/lib/pubg-domain/client.ts)) étendues en miroir avec le même paramètre optionnel

#### Sites d'appel mis à jour (clanId/memberId déjà connus localement)

- [x] `src/lib/clan-service.ts` — `resolvePubgClanForLocalClan`, `syncClanMembership`, `syncClanLifetimeStats` (3 sites)
- [x] `src/lib/cron-jobs.ts` — `syncClanSeasonStats`, `syncClanWeaponMastery` (4 sites) ; `resolveEncounteredPlayerClans` volontairement laissé sans contexte (résolution de joueurs adverses, pas de clan/membre du site concerné)
- [x] `src/app/api/members/[id]/weapon-mastery/route.ts`, `.../stats/route.ts`, `.../season-stats/route.ts`, `.../matches/route.ts` — `memberId` du paramètre de route
- [x] `src/app/api/clans/[clanId]/sync-matches/route.ts` — `clan.id`/`member.id` (3 sites : résolution joueur, liste des matchs, détail de match)
- [x] `src/app/api/members/route.ts` — `clanId` optionnel du body validé, passé quand présent
- [x] `src/app/api/matches/[matchId]/route.ts` — `memberId` du body sur `POST` (le `GET` n'a pas de `memberId` disponible, laissé tel quel)
- [ ] **Volontairement différé** — `src/lib/pubg-telemetry/index.ts` et `manual-sync.ts` (`fetchMatchDetailsWithTelemetryAsset`, appelé depuis `scripts/telemetry-resync-worker.ts` et `job.ts`) : zone la plus sensible du pipeline (worker dédié, mémoire limitée à 512 Mo) — c'est précisément la zone que la contrainte anti-régression visait à protéger. À reprendre dans un chantier séparé, testé isolément, si le besoin de granularité par match du worker se confirme
- [ ] **Volontairement non câblé** — `src/app/api/join/route.ts`, `src/lib/setup-service.ts` (recherche joueur avant création du membre/setup initial, aucun `clanId`/`memberId` n'existe encore à ce stade) ; `src/app/api/matches/[matchId]/route.ts` GET (pas de `memberId` dans la requête) ; `resolveEncounteredPlayerClans` dans `cron-jobs.ts` (joueurs adverses, hors périmètre)

#### Garde-fous anti-régression télémétrie — ✅ Validés le 2026-08-06

- [x] Aucune modification de la logique métier, du typage de retour ou de la gestion d'erreur des fonctions `pubg.ts` — uniquement un paramètre optionnel traversant jusqu'à la queue
- [x] Rollout fichier par fichier (pubg.ts → pubg-domain/client.ts → clan-service.ts → cron-jobs.ts → routes API), chaque étape vérifiée par `tsc --noEmit` avant la suivante
- [x] Confirmé par grep : seuls `pubg-telemetry/index.ts` et `manual-sync.ts` importent `pubg.ts` dans tout `src/lib/pubg-telemetry/` (le parser lui-même n'appelle jamais ces fonctions) — et ces deux fichiers sont précisément ceux volontairement non touchés
- [x] `tsc --noEmit` : **137 erreurs avant et après**, sur l'ensemble du projet — 0 régression de compilation introduite (comparé via `git stash`/`git stash pop` contre le commit `f1beb69`)

#### Tests — ✅ Faits le 2026-08-06

- [x] `vitest.config.ts` : `include` élargi de `['src/lib/pubg-telemetry/**/*.test.ts']` à `['src/lib/**/*.test.ts']`
- [x] [api-throttle.test.ts](../../src/lib/api-throttle.test.ts) : 3 tests — `clanId`/`memberId` transmis dans `metadata` sont bien répercutés dans la ligne loggée (branche succès, branche erreur, et défaut à `null` quand absents)
- [x] [pubg-context-forwarding.test.ts](../../src/lib/pubg-context-forwarding.test.ts) : 3 tests sur `fetchPubgClanById`, `fetchWeaponMastery`, `fetchLifetimeStats` avec `enqueuePubgApiRequestWithMetadata` mocké — vérifie que `context` atteint bien la queue sans toucher au parsing de la réponse
- [x] `npm run test:telemetry` : mêmes 3 fichiers en échec (4 tests) qu'avant tout changement de cette session (confirmé par `git stash`) — pré-existant, sans lien avec ce chantier ; 55 tests passent désormais (49 + 6 nouveaux), 0 nouvelle régression
- [ ] Validation manuelle post-déploiement : lancer une sync clan réelle (`npm run telemetry:batch -- --clan <id>` ou bouton "Sync" sur `/clans/[clanId]/settings`) et vérifier sur `/settings/pubg-api` que les nouvelles lignes affichent un `clanId` peuplé et que le filtre `clanId` retourne des résultats — nécessite un environnement avec accès PUBG API réel, non disponible en session

#### Côté UI — panneau "Répartition par clan" sur `/settings/pubg-api` — ✅ Déployé le 2026-08-06

Réutilise les mécanismes déjà en place (filtre `clanId` déjà câblé sur l'historique, pattern d'agrégation déjà utilisé pour "Répartition par type d'appel") plutôt que d'introduire un nouveau système.

- [x] `getPubgApiCallsOverview()` étendu : groupe les `dayRows` (déjà chargées pour `byCategory`/`topErrors`, fenêtre 24h) par `clanId`, calcul `count/success/errors/rateLimited/avgDurationMs` par clan
- [x] **Amélioration par rapport au plan initial** : quand la ligne n'a pas de `clanId` direct mais a un `memberId` (cas des routes membre — weapon-mastery, stats, season-stats, matches), le `clanId` est résolu via un batch `prisma.clanMember.findMany({ id: { in } })` plutôt que d'exiger que chaque site d'appel connaisse et transmette son propre `clanId` — centralise la résolution dans l'agrégation au lieu de la disperser dans ~13 sites d'appel
- [x] Batch `prisma.clan.findMany({ where: { id: { in: clanIds } } })` sur les `clanId` résolus pour construire le label `Nom [TAG]` — même pattern que le `memberMap` déjà utilisé pour `actorLabel`
- [x] Bucket explicite "Sans clan" pour les lignes sans `clanId` ni `memberId` résolvable (ex. `fetchCurrentSeason`, appels système)
- [x] Nouveau panneau `app-panel` "Répartition par clan", même format visuel que "Répartition par type d'appel" (mini-barre succès/429/erreurs par ligne)
- [x] Mise en évidence visuelle (bordure rose + icône `AlertTriangle`) des clans dont le taux combiné `(errors + rateLimited) / count` dépasse `10 %` sur la fenêtre 24h — le bucket "Sans clan" n'est jamais marqué comme problématique (pas un vrai clan à corriger)
- [x] Clic sur une ligne clan → applique le filtre `clanId` déjà existant sur "Historique récent" (réutilise `appliedHistoryClanId`/`historyClanIdInput`, aucun nouvel état de filtre) ; désactivé sur la ligne "Sans clan" (rien à filtrer)
- [x] Tri par défaut : nombre d'appels décroissant (fait côté service, pas besoin de tri côté client)
- [ ] Vérifier rendu clair/sombre et mobile du nouveau panneau — non vérifié en session, pas d'accès Owner disponible

**Validation :** ESLint et `tsc --noEmit` propres (137 erreurs avant/après, identique à la baseline). `npm run test:telemetry` : mêmes 3 fichiers en échec préexistants, 55 tests passent toujours. Le panneau restera vide ("Aucun appel aujourd'hui") tant qu'aucune sync clan réelle n'a eu lieu depuis le déploiement du plumbing backend — comportement attendu, pas un bug.

---

### ~~Récupérations télémétrie (`/clans/[clanId]/telemetry/recoveries`) — Pagination du tableau historique~~ — ✅ Déployé le 2026-08-06 (+ option validée)

Réflexion demandée le 2026-08-06 après capture d'écran du pattern `SegmentedControl` (Tout/Erreurs, 15/25/50) déployé sur `/settings/pubg-api`, en référence pour cette page.

**Distinction par clan — déjà en place, différemment que `/settings/pubg-api` :** la route [route.ts](../../src/app/api/clans/[clanId]/telemetry/recoveries/route.ts#L94-L100) filtre en SQL via `WHERE EXISTS (... cm.clanId = ${parsedClanId})` — chaque visite de `/clans/[clanId]/telemetry/recoveries` ne retourne que les récupérations du clan concerné. Ce n'est pas une vue globale multi-clans à ventiler comme l'était `/settings/pubg-api` avant le panneau "Répartition par clan" — c'est scopé par construction (un clan = une URL). Pas de chantier de plomberie `clanId`/`memberId` à refaire ici, contrairement au chantier PUBG API.

- [x] Pagination **côté client** dans [page.tsx](../../src/app/clans/[clanId]/telemetry/recoveries/page.tsx) : `paginatedRows` dérivé de `sortedRows.slice(...)`, page courante bornée via `historyPageClamped = Math.min(historyPage, historyTotalPages)` (protège contre une page hors bornes après un rechargement de données, en plus du reset explicite ci-dessous)
- [x] Sélecteur de taille de page en `SegmentedControl` avec `10`, `15`, `25` (défaut `15`) — même pattern que `/settings/pubg-api`
- [x] Contrôles précédent/suivant + "X–Y sur N" sous le tableau, réutilisant `.app-pagination`/`.app-pagination-button`/`.app-pagination-label` de `globals.css` (markup copié du seul autre usage existant, `MatchHistory.tsx`)
- [x] Retour à la page 1 sur changement de filtre/recherche/tri/taille de page — `setHistoryPage(1)` ajouté directement dans chaque `onChange` (`statusFilter`, `parserFilter`, `searchTerm`, `primarySortKey/Direction`, `secondarySortKey/Direction`, `historyPageSize`), même convention que `/settings/pubg-api`
- [x] Compteur "Résultats: X / Y" conservé (inchangé, toujours basé sur `sortedRows` complet), complété par la pagination sous le tableau
- [x] Export CSV et badge "Résultats" laissés sur `sortedRows` (l'intégralité du filtré/trié), volontairement **pas** limités à `paginatedRows` — exporter doit rester indépendant de la page affichée
- [ ] Vérifier rendu clair/sombre et mobile — non vérifié en session, pas d'accès disponible

**Option validée avec l'utilisateur — migration des 6 `<select>` bruts vers les composants partagés :**

- [x] Statut et Parser JSON → `FilterDropdown` (label + select thémé, composant déjà utilisé ailleurs dans le site)
- [x] Tri principal/secondaire et Ordre principal/secondaire → `SegmentedControl` avec label au-dessus (`<p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">`), même agencement que `/clans/[clanId]/leaderboard`
- [x] Option "Décroissant"/"Croissant" de l'ordre secondaire désactivée via la prop `disabled` de `SegmentedControl` quand `secondarySortKey === 'none'` (remplace l'attribut `disabled` du `<select>` d'origine)

**Validation :** ESLint — 5 erreurs préexistantes inchangées (vérifié par `git stash`/`git stash pop` : mêmes règles, mêmes causes, non liées à ce chantier — `set-state-in-effect` sur deux effets non touchés, `Date.now()` impur dans un `useMemo` non touché, 2 apostrophes non échappées). `tsc --noEmit` : 137 erreurs, baseline inchangée. `npm run test:telemetry` : 55/59, mêmes échecs préexistants.

**Modernisation visuelle du 2026-08-06 — icônes et couleurs, alignée sur `/settings/pubg-api` :**

Couleurs déjà vérifiées comme bien thémées (mêmes familles remappées slate/emerald/rose/amber que `/settings/pubg-api`) — cette passe est purement visuelle, aucun bug de thème à corriger ici.

- [x] Nouveau composant local `MetricCard` (icône + label + valeur, tons slate/emerald/amber/rose, variante `compact`) — même esprit que celui de `/settings/pubg-api`, appliqué aux 6 cartes de synthèse, aux 4 cartes KPI et aux 5+4 cartes du dashboard observability (15 cartes au total converties)
- [x] Icônes `lucide-react` sur les 3 boutons d'action (`RefreshCw` Rafraichir, `Wrench` Backfill, `ArrowLeft` Retour aux matchs) et sur les 4 titres de section (`Gauge` KPIs, `Server` Observability, `History` Historique)
- [x] Sélecteurs "Fenetre" (KPIs de santé + Dashboard observability) migrés de `<select>` vers `SegmentedControl` (`WINDOW_OPTIONS` partagé, 24h/7j/30j/Tout) — effet de bord positif : élimine au passage 2 des 5 erreurs ESLint préexistantes (apostrophe non échappée dans "Tout l'historique", remplacé par "Tout")
- [x] Mini-barre de répartition (succès/échecs/expirés/en attente) sous les 6 cartes de synthèse principales, même pattern que les barres de "Répartition par type d'appel" sur `/settings/pubg-api`
- [x] Icône ajoutée dans chaque badge de statut (`CheckCircle2`/`XCircle`/`Clock`/`History`) sur le tableau d'historique principal et le tableau observability, alerts de santé avec `CheckCircle2`/`AlertTriangle` selon le statut
- [x] Validation : ESLint passé de 5 à **3** erreurs préexistantes (2 corrigées en effet de bord, aucune nouvelle), `tsc --noEmit` 137 (baseline inchangée), `npm run test:telemetry` 55/59 (mêmes échecs préexistants)
- [ ] Vérifier rendu clair/sombre et mobile dans le navigateur — non vérifié en session, pas d'accès disponible

**Correctif du 2026-08-06 (retour utilisateur sur capture d'écran) :** `SegmentedControl` avec `wrap` sur "Tri principal" (3 options) et "Tri secondaire" (4 options) ne tenait pas sur une ligne dans une colonne à 4 — le retour à la ligne cassait la forme arrondie du conteneur (effet "marche d'escalier"). "Ordre principal"/"Ordre secondaire" (2 options courtes) restaient propres. Revenu à `FilterDropdown` pour les deux contrôles à options multiples (Tri principal, Tri secondaire), conservé `SegmentedControl` uniquement pour les deux qui tiennent naturellement sur une ligne (Ordre principal, Ordre secondaire). Revalidé : ESLint toujours 3 erreurs préexistantes (inchangé), `tsc --noEmit` 137, `test:telemetry` 55/59.

---

### ~~Détail télémétrie d'un match (`/clans/[clanId]/telemetry/matches/[matchId]/telemetry`) — Modernisation visuelle + pagination~~ — ✅ Déployé le 2026-08-06

Page d'audit/debug dense (1800 lignes, 8 sections) pour un développeur inspectant le pipeline parser sur un match précis. Même traitement que `/settings/pubg-api` et `/clans/[clanId]/telemetry/recoveries` : icônes `lucide-react`, aucun bug de couleur à corriger (mêmes familles déjà remappées).

- [x] Icône sur le titre `<h1>` (`Radar`) et sur les 8 titres de section (`Users` Contexte match, `Server` Etat pipeline, `ListChecks` Resume parser, `Crosshair` Top armes, `Users` Stats membres, `Waves` Phases du match, `MapPin` Positions brutes, `FileJson` Payload JSON brut)
- [x] Icônes sur les 3 boutons d'action (`ArrowLeft` Retour, `RefreshCw` Resync ce match, `Upload` Importer fichier telemetry)
- [x] Badge de statut pipeline (`telemetryTone`/`telemetryLabel`) avec icône selon le statut (`CheckCircle2`/`XCircle`/`AlertTriangle`), même traitement sur le bloc "Erreur telemetry"
- [x] Badges de statut membre dans les cartes "Stats membres parser" (`resolved`/`opponent`/`bot`/`unresolved`) avec icône dédiée (`CheckCircle2`/`Swords`/`Bot`/`HelpCircle`)
- [x] Pagination à 15 lignes sur le tableau "Top armes (weaponStats)" — seul tableau de la page dont la taille dépend directement du nombre d'armes distinctes utilisées dans le match et peut dépasser 15 lignes sur un match chargé ; les autres tableaux (contexte match, phases, stats armes par membre) sont naturellement bornés par la taille d'une squad ou le nombre de phases d'un match (≤ ~20), pas de pagination nécessaire. Réutilise `.app-pagination` (même markup que les deux autres pages), page bornée via `Math.min(page, totalPages)`
- [x] Validation : ESLint — **20 erreurs préexistantes, comptage identique avant/après** (vérifié par `git stash`/`git stash pop`) — toutes liées à un bug préexistant et non lié à cette session (hooks `useMemo`/`useEffect` appelés après un retour anticipé conditionnel `if (!clanId || !matchId) return`, dans la zone `rawPhaseOptions`/`filteredPositionSamples` etc., lignes ~937-1198, jamais touchée par cette passe) + 1 paire de guillemets non échappés préexistante. `tsc --noEmit` : 137 (baseline inchangée). `npm run test:telemetry` : 55/59 (mêmes échecs préexistants)
- [ ] Vérifier rendu clair/sombre et mobile dans le navigateur — non vérifié en session, pas d'accès disponible

**Note pour un futur chantier (hors scope ici) :** le bug préexistant de hooks conditionnels (20 erreurs ESLint) mériterait sa propre correction séparée — déplacer `rawPhaseOptions`, `filteredPositionSamples`, `filteredTrajectorySegments`, `filteredDeathSamples`, `filteredInBoundsPositionSamples`, `filteredInBoundsDeathSamples`, `filteredInBoundsTrajectorySegments`, `outOfBoundsSummary`, `clanAccountIds`, `clanTeamId`, `groupedMemberStats` et l'effet de reset `rawPhaseFilter` avant le early-return `if (!clanId || !matchId)`, ou restructurer ce dernier. Risqué à faire en même temps qu'une passe visuelle — volontairement laissé de côté.

**Correctifs du 2026-08-06 (retour utilisateur sur capture d'écran) :**

- [x] **Bug de thème réel, corrigé dans `globals.css` (pas seulement sur cette page)** : `border-slate-100` (utilisé sur `<tr className="border-t border-slate-100">` dans quasiment tous les tableaux du site) n'était **pas** dans la liste des classes remappées par le thème — seuls `border-slate-200`/`border-slate-300` l'étaient, alors que `divide-slate-100` l'était déjà (incohérence dans la CSS d'origine). Résultat : lignes de séparation gris très clair figées, quasi blanches et visibles en thème sombre. Ajouté `.border-slate-100` aux deux règles de remap existantes (claire `body[data-app-theme]` et sombre `html[data-app-theme='dark']`), même valeur que `border-gray-100`/`border-slate-200`. Bénéficie automatiquement aux 4 fichiers du projet qui utilisaient cette classe : cette page, [matches/[matchId]/telemetry/page.tsx](../../src/app/clans/[clanId]/matches/[matchId]/telemetry/page.tsx), [nav-permissions/page.tsx](../../src/app/settings/nav-permissions/page.tsx), [phase-labels/page.tsx](../../src/app/settings/phase-labels/page.tsx)
- [x] Tri par colonne sur le tableau "Top armes (weaponStats)" (Arme/Kills/Headshots/Damage) — en-têtes cliquables avec indicateur `↑`/`↓`, même pattern que `MatchHistory.tsx` (clic sur la même colonne inverse le sens, clic sur une autre colonne repart en `desc`). Tri appliqué avant la pagination ; reset à la page 1 sur changement de tri
- [x] Validation : ESLint toujours 20 erreurs préexistantes (inchangé, aucune nouvelle), `tsc --noEmit` 137, `npm run test:telemetry` 55/59

---

### ~~Vue cross-clans SuperUser — Télémétrie + API PUBG~~ — ✅ Déployé le 2026-08-06

Demande du 2026-08-06 : permettre à un SuperUser de comparer la santé télémétrie et la consommation API de plusieurs clans sans naviguer clan par clan. Analyse du modèle de permissions avant de proposer une architecture.

#### Constat sur le contrôle d'accès — bug trouvé au passage

Deux mécanismes distincts coexistent dans le code :

- **`isSuperUser`** : flag global sur `UserAccount` (`src/middleware/auth-permission.ts`), indépendant de tout clan. C'est le vrai SuperUser — `requireSuperUser()`/`isSuperUserSession()` l'utilisent côté API, et il bypass les checks clan-scopés (ex. la route recoveries via `requireRole(['Owner'])(request, { clanId })` laisse passer un SuperUser sur n'importe quel clan).
- **`permissions.includes('*')`** : dérivé du rôle du **membre actif dans son clan courant** (`getMemberPermissionKeys()` dans `role-service.ts`) — le rôle "Owner" donne `['*']` à l'échelle de ce clan. Ce n'est **pas** l'équivalent d'être SuperUser.

[`/settings/pubg-api/page.tsx:158`](../../src/app/settings/pubg-api/page.tsx#L158) gate toute la page sur `permissions.includes('*')`, jamais sur `isSuperUser` (pourtant déjà exposé par `useAuthSession()` — voir `src/hooks/useAuthSession.ts`). Conséquence : un simple Owner de clan (pas SuperUser) peut accéder à la page, et un vrai SuperUser dont le membre actif n'a pas le rôle Owner sur son clan lié se ferait bloquer à tort.

- [x] Corrigé `/settings/pubg-api/page.tsx` : `isOwner = permissions.includes('*')` remplacé par `isSuperUser` (retourné par `useAuthSession()`, déjà exposé côté hook) sur les 5 points de gate (accès page, effet de chargement, `handleSaveRpm`, `handlePurgeHistory`, `canWriteSettings`) ; import `permissions` retiré du destructuring devenu inutile ; message d'accès refusé mis à jour ("reservee au SuperUser")
- [x] Corrigé côté serveur : `GET/DELETE /api/settings/pubg-api-calls` et `GET/POST /api/settings/pubg-api-rate-limit` utilisaient `getMemberPermissionKeys(session.activeMemberId)` + `permissions.includes('*')` — remplacé par `session.isSuperUser` directement (déjà présent sur `AuthSessionContext` retourné par `getSessionFromRequest()`, pas besoin de requête supplémentaire). Bénéfice additionnel : un SuperUser sans `activeMemberId` (aucune adhésion clan) n'est plus bloqué à tort — l'ancien code exigeait `session?.activeMemberId` avant même de vérifier `isSuperUser`
- [x] Validation : ESLint et `tsc --noEmit` propres (137 erreurs, identique à la baseline), `npm run test:telemetry` toujours 55/59 (mêmes 3 échecs préexistants)

#### Décision d'architecture — API PUBG : rien de nouveau à créer

`/settings/pubg-api` est déjà une page globale (hors `/clans/[clanId]/...`), et le panneau "Répartition par clan" livré le 2026-08-06 **est déjà** la vue cross-clans demandée pour le volet API. Le fix d'accès ci-dessus est fait — ce volet est maintenant complet.

#### Décision d'architecture — Télémétrie : nouvelle page — ✅ Déployée le 2026-08-06

`/clans/[clanId]/telemetry/recoveries` est scopée à un clan par construction (route dynamique + filtre SQL `cm.clanId = X` dans `route.ts`). Forcer cette page à représenter "tous les clans" (id spécial type `clanId=all`, toggle de mode) aurait été bancal et aurait fragilisé une page qui fonctionne bien pour son usage actuel (deep-dive un clan). Le pattern déjà établi dans ce projet pour une vue globale réservée SuperUser est `/settings/pubg-api` — répliqué à l'identique.

**Décisions validées avant implémentation (questions posées à l'utilisateur) :** nom de page `/settings/telemetry-recoveries` (cohérent avec le nom de la page clan-scopée) ; page en lecture seule + liens vers le détail par clan, sans dupliquer les actions Backfill/Export CSV de la page clan-scopée.

- [x] Nouveau service [telemetry-recoveries-overview.ts](../../src/lib/telemetry-recoveries-overview.ts) : `getTelemetryRecoveriesOverview(window)`. Requête SQL en deux temps plutôt qu'un simple `GROUP BY` — un `SELECT DISTINCT (clanId, squadMatchId)` dérivé d'abord (dédupliquer les cas où plusieurs membres du même clan sont dans la même squad, pour ne jamais compter une ligne `SquadMatchTelemetry` deux fois pour un même clan), puis jointure vers `SquadMatchTelemetry` avec filtre de fenêtre temporelle optionnel (`Prisma.empty` si `window=all`, même pattern que `drop-pressure-persistence.ts`/`position-metric-aggregation.ts`). Classification succès/échec/expiré/en attente et résolution des noms de clan répliquent exactement la logique déjà existante dans [route.ts](../../src/app/api/clans/[clanId]/telemetry/recoveries/route.ts) (réutilise `isTelemetryDataExpiredError`, ne la duplique pas)
- [x] Nouvelle route [GET /api/settings/telemetry-recoveries](../../src/app/api/settings/telemetry-recoveries/route.ts), gate `session.isSuperUser` (le bon mécanisme, pas `'*'`), paramètre `window` (`24h`/`7d`/`30d`/`all`, défaut `7d`)
- [x] Type `TelemetryScope` étendu avec `'global'` dans [api-contract.ts](../../src/lib/pubg-telemetry/api-contract.ts) (changement additif, n'affecte aucun des 12 autres appelants existants)
- [x] Nouvelle page [/settings/telemetry-recoveries](../../src/app/settings/telemetry-recoveries/page.tsx) : panneau "Répartition par clan" avec mini-barre succès/échecs/expirés/en attente par ligne, bordure + icône d'alerte si le taux d'échec dépasse `10 %`, sélecteur de fenêtre en `SegmentedControl`, lien "Détail" vers `/clans/[clanId]/telemetry/recoveries` par ligne
- [x] Nouvelle entrée nav `superuser.telemetry-recoveries` dans [nav-permissions-registry.ts](../../src/lib/nav-permissions-registry.ts) (section `superuser-menu`) — coexiste sans collision avec `owner.telemetry-recoveries` (la page clan-scopée existante, navKey différent)
- [x] **Découverte en cours d'implémentation :** le menu de navigation lit la table `NavItem` en base, pas directement `nav-permissions-registry.ts` (fallback statique non atteint une fois la DB seedée — commentaire `@deprecated` sur `getItemRole`). Lancé `npx tsx prisma/seed-nav-items.ts` (upsert idempotent) pour que la nouvelle entrée apparaisse réellement dans le menu SuperUser — 49 lignes `NavItem` en base après coup
- [x] Validation : requête SQL testée directement contre la base réelle (20 lignes échantillon), puis pipeline complet (agrégation + résolution nom de clan) simulé en Node contre la vraie base — résultat cohérent : clan D32 [SMK], 1674 récupérations, 1342 succès, 332 expirées, 0 échec, 0 en attente
- [x] ESLint et `tsc --noEmit` propres (137 erreurs, baseline inchangée), `npm run test:telemetry` toujours 55/59 (mêmes 3 échecs préexistants)
- [ ] Vérifier rendu clair/sombre et mobile dans le navigateur — non vérifié en session, pas d'accès SuperUser disponible

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
