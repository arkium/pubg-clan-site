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
- [ ] Ajouter une évolution temporelle de la pression au drop après validation du stockage

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
