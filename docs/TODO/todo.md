# Points à faire — PUBG Clan Site

Suivi des tâches restantes, classées par priorité. Mis à jour au 2026-08-11.

---

## P1 — Bloquants / manques fonctionnels immédiats

### ~~Modernisation Ops Cron (`/settings/cron`), Purge d'historique et Documentation des tâches~~ — ✅ Complété le 2026-09-02

Refonte moderne de la console de supervision des tâches planifiées `/settings/cron` selon le Design System (`docs/ui/index.html`), clarification du fonctionnement des jobs de synchronisation télémétrie et ajout de la purge des exécutions.

- [x] **Purge de l'historique d'exécutions :**
  - Ajout de la route API sécurisée `DELETE /api/clans/[clanId]/cron-control` (contrôle SuperUser / Owner, suppression dans `prisma.cronExecution` avec exclusion stricte des jobs `running` et `queued`).
  - Bouton interactif avec confirmation en ligne dans l'en-tête de la section Historique (`Trash2`, bouton "Confirmer la purge", notification toast haute visibilité et rafraîchissement dynamique).
- [x] **Descriptions enrichies des tâches cron :**
  - Dictionnaire `SCHEDULE_DESCRIPTIONS` détaillant le rôle précis et l'impact de chaque job (`daily_sync`, `daily_stats_recalc`, `daily_lifetime_stats_sync`, `daily_season_stats_sync`, `clan_online_reminder`, `weekly_report_reminder`, `weekly_report_auto`, `monthly_report_auto`, `challenge_processing`, `encountered_player_clan_resolution`).
  - Affichage direct sous le nom de chaque tâche dans le tableau d'édition des expressions cron.
- [x] **Contraste & Design System :**
  - Remplacement de tous les badges obsolètes par le composant `StatusPill` exploitant les classes officielles `.status-pill` (`--online`, `--pending`, `--error`, `--offline`) et `.status-dot`.
  - Intégration de `.app-meta-pill` pour le clan actif et les badges de métadonnées.
  - Toasts de feedback unifiés avec `.telemetry-toast-success` et `.telemetry-toast-error`.
  - Tous les textes et labels de tables et cartes adaptés pour un contraste optimal en thème sombre (`text-slate-900 dark:text-white`, `text-slate-700 dark:text-slate-300`, `dark:border-slate-700`, `dark:bg-slate-900`).
- [x] **Liaison explicite Actions manuelles ↔ Crons & Sélecteur de portée :**
  - Ajout sur chaque carte d'action manuelle d'un badge de liaison technique (`daily_sync`, `daily_stats_recalc`, `telemetry:aggregates:worker`, `daily_lifetime_stats_sync`) et harmonisation des intitulés de boutons.
  - Sélecteur de clan mis en évidence dans l'en-tête de la section, permettant de basculer instantanément d'un clan à un autre sans recharger la page, ou de sélectionner l'option globale « Tous les clans ».
  - Bandeau d'avancement en direct avec spinner, libellé précis de l'action en cours et barre de progression dynamique lors des exécutions unitaires ou par lot.
- [x] **Documentation du fonctionnement & limites :**
  - *Fréquence & Quota :* Le job `daily_sync` (par défaut `0 * * * *`, exécuté toutes les heures) découvre et planifie les nouveaux matchs PUBG pour tous les clans actifs avec une limite de sécurité fixée à 50 matchs max par clan par exécution (soit jusqu'à 1200 matchs/clan/jour).
  - *Découplage Cron / Worker :* Le cron scheduler planifie et dépose les matchs à traiter dans la file d'attente ; c'est le worker dédié en arrière-plan (`telemetry:worker`) qui dépile et télécharge la télémétrie en continu.
  - *Estimation dynamique :* L'estimation de prochaine relance lit dynamiquement l'expression cron en base plutôt qu'une valeur figée.


### Harmonisation de `/clans/[clanId]/telemetry/recoveries` avec la console globale — ✅ Réalisé le 2026-09-02

Mise à niveau de la console télémétrie par clan pour apporter le même état d'esprit et les mêmes capacités d'audit et de pilotage que la page globale `/settings/telemetry-recoveries` :
- [x] **Pilotage Moteur & File d'attente intégrés :**
  - Affichage en direct du statut du worker (en ligne/hors ligne, PID, heartbeat), de la file d'attente globale (`queued`, `running`, `remaining`, `total`), de la durée estimée ETA et de la prochaine relance cron estimée.
- [x] **Audit réel du Backlog du Clan :**
  - Calcul et affichage des métriques complètes du clan sur l'ensemble de la base : Matchs totaux, Complétés, Expirés définitifs PUBG (>14j), Backlog récupérable (<14j), Urgents (<14j sur le point d'expirer), En file / Restant à enfiler.
  - Jauge tricolore de complétion (complétés vert, expirés gris, récupérables indigo).
- [x] **Actions d'enfilage rapide pour le Clan :**
  - Ajout de la méthode `POST /api/clans/[clanId]/telemetry/recoveries` avec permission Clan Owner et SuperUser.
  - Bouton « Mettre en file les urgences (< 14j) » pour sécuriser les matchs avant expiration PUBG.
  - Bouton « Mettre en file tout le backlog » pour ingérer tous les matchs récupérables restants.
  - Bouton « Backfill JSON manquants » avec feedback toast unifié.
- [x] **Sélecteur de clan & Design System :**
  - Sélecteur rapide de clan en haut de page pour switcher immédiatement d'un clan à l'autre.
  - Lien direct vers la console globale pour les SuperUsers.
  - Intégration stricte du Design System (`.status-pill`, `.status-dot`, `.app-meta-pill`, `.app-btn`, `.telemetry-toast-success`, contrastes dark mode `dark:*`).


### ~~Clans "trackés" (RATZ, BEE, MTFR, BDXX, FR-Alliance-BE) — stats à zéro malgré la télémétrie~~ — ✅ Corrigé le 2026-08-11

`/clans/6/overview` (RATZ) affichait 0 partout (kills, wins, dégâts, matchs) alors que 511 lignes `SquadMember` existaient bien en base. Cause : `joinStatus: 'tracked'` isole volontairement les membres (voir `tracked-isolation.test.ts`) des agrégats (`recalculateStatsForClan` dans `stats-calculator.ts`, `precomputeClanMatchesStats` dans `matches-cache-service.ts`) — mais ce statut était le **seul** posé par le bouton "tracker" de `/settings/opponents` (`POST /api/settings/opponents/track`), utilisé pour construire la quasi-totalité du roster de 5 clans sur 6 du site (86 `ClanMember` sur ~95 dans ces clans, tous avec `playerId` renseigné → tous créés via cette route, jamais via `/join`).

- [x] Modifier `src/app/api/settings/opponents/track/route.ts` : poser `joinStatus: 'active'` au lieu de `'tracked'` (create + update) — une confirmation manuelle par un SuperUser vaut approbation, il n'existe pas de flux `/join` pour un joueur scouté sans compte sur le site.
- [x] Migrer les 86 `ClanMember` existants (`tracked` → `active`) sur les clans 3 (LesZzabeilles), 4 (LA_MEUTE), 5 (BDXX), 6 (Les-Ratz), 7 (FR-Alliance-BE).
- [x] Relancer `recalculateStatsForClan`, `precomputeClanMatchesStats`, `recalculateTelemetryPeriodAggregatesForClan` pour ces 5 clans.
- [x] Vérifié : clan 6 → 240 matchs / 1504 kills / 52 wins (période "Tous"), 56 lignes `PlayerStats`.
- [x] Complété après coup : `precomputeClanAwards` (`ClanAwardsCache`, cartes "Awards du mode") et `computeClanComparatorStats` (`ClanComparatorCache`, page `/clans/comparator` — cartes "Performances par mode" à 0 pour RATZ) n'avaient pas été relancés lors de la première passe ; le recalcul complet suit désormais la même séquence que `recalculateStatsDaily` dans `cron-jobs.ts` (`recalculateStatsForClan` → `precomputeClanAwards` → `precomputeClanMatchesStats` → `computeClanComparatorStats`).
- [x] Réécrit `tracked-isolation.test.ts` (obsolète : `periodType` manquant, modèle `ClanStats` inexistant) pour couvrir le pipeline actuel (`recalculateStatsForClan` + `precomputeClanMatchesStats`) et nettoyer ses données après exécution (un run précédent avait laissé un clan orphelin `Test Isolation Clan` en base réelle, supprimé).

**Note :** le statut `joinStatus: 'tracked'` reste dans le schéma pour un éventuel futur usage (isolation d'un coéquipier auto-détecté non confirmé), mais n'est plus produit par aucun flux applicatif actuel.

### ~~Corrections UI & UX — Comparateur et Leaderboard~~ — ✅ Corrigé le 2026-08-14

- [x] **Comparateur (`/clans/comparator`) :** Corriger le débordement de l'arrière-plan sur les `app-panel` ("contour des cartes non respecté") via l'ajout de `overflow-hidden` généralisé sur les sections.
- [x] **Leaderboard (`/clans-leaderboard`) :** Rendre les en-têtes de table interactives pour permettre le tri selon 5 critères (Effectif Actif, Power Score, Win Rate, Dégâts moy., Kills moy.).
- [x] **Leaderboard :** Adapter le podium dynamique pour refléter le filtre actif (changement du classement et de l'étiquette affichée).
- [x] **Leaderboard :** Corriger le rayon de bordure des podiums flottants (`rounded-t-xl` remplacé par `rounded-xl`).

### ~~Dépendance `server-only` manquante — cassait `stats-calculator.ts` (via `notification-service.ts` → `email-service.ts`) hors build Next~~ — ✅ Corrigé le 2026-08-11

`server-only` était importé dans `email-service.ts` mais absent de `package.json`/`node_modules` : tout script ou test import ant `stats-calculator.ts` (donc `tracked-isolation.test.ts`) plantait avec `Cannot find module 'server-only'`. Une fois le paquet installé, le vrai module `server-only` lève une erreur volontaire dès qu'il est chargé hors du bundling spécial Next.js (serveur/client) — donc aussi en environnement Vitest.

- [x] `npm install server-only` (ajouté aux `dependencies`).
- [x] Alias `server-only` → stub no-op (`src/lib/test-stubs/server-only.ts`) dans `vitest.config.ts`, car Vitest n'a pas le découpage serveur/client de Next qui rend ce module inoffensif en prod.

### ~~SuperUser — Forbidden sur les clans hors clan d'appartenance~~ — ✅ Corrigé le 2026-08-09

`requireNavPermission` (`src/middleware/auth-permission.ts`) vérifiait l'appartenance au clan ciblé (`ensureMemberInClan`) **avant** de vérifier le statut SuperUser, contrairement à `requirePermission`/`requireRole` qui font le bypass SuperUser en premier. Un SuperUser dont le membre actif appartient au clan 1 recevait `403 Forbidden` sur les ~16 routes protégées par `requireNavPermission` (positions, matches, lifetime-stats, drop-zones, weapons, heatmap, challenges, reports, squad-analysis, leaderboard, bot-stats…) dès qu'il consultait un autre clan (ex. clan 7), alors que les données existaient bien.

- [x] Ajouter le bypass SuperUser avant le contrôle `ensureMemberInClan` dans `requireNavPermission`
- [x] Étendre le bypass SuperUser aux branches `role === 'admin'` et `role === 'owner'` (qui dépendaient des rôles du membre actif dans son propre clan, jamais valides pour un clan étranger)
- [x] Valider TypeScript et ESLint sur `auth-permission.ts`
- [ ] Vérifier dans le navigateur `/clans/7/telemetry/matches` avec la session SuperUser actuelle (`activeMemberId=1`, clan 1)

### ~~Refonte Dashboard Overview & Roster~~ — ✅ Complété (vérifié le 2026-08-30)

Cette tâche visait à transformer la page `Overview` en un véritable dashboard analytique (100% statistiques) alimenté par un cache persistant précalculé, et à alléger la page `Matches`. **Vérification de code du 2026-08-30 :** le chantier était en réalité entièrement implémenté, sans qu'aucune case n'ait été cochée entre-temps.

**1. Persistance & Cache (Cron)**
- [x] Modèle `ClanMatchesCache` dans `prisma/schema.prisma` (`clanId`, `period`, `periodKey`, `payload`, `computedAt`, unique `[clanId, period]`)
- [x] Migration appliquée
- [x] `src/lib/matches-cache-service.ts` avec `precomputeClanMatchesStats(clanId)`
- [x] Payload structuré par mode (`all`/`duo`/`trio`/`squad`) avec `globalStats`, `modePerformance`, `rosterStats`, `synergies.topPairs`/`topSquads` (top 5) et `topPerformers` (top 5 par catégorie)
- [x] Appelée depuis `src/lib/cron-jobs.ts`
- [x] Route `GET /api/clans/[clanId]/overview/matches-stats/route.ts`

**2. Allègement de la page Matches**
- [x] `modePerformance`, `<SquadSynergies />` et `<TopPerformers />` retirés de `src/app/clans/[clanId]/matches/page.tsx` (page réduite à `MatchStatCard` + `SessionRecap`)

**3. Refonte UI : Dashboard Overview**
- [x] Carte "Comparaison PUBG vs site" (`ClanSyncPanel`) déplacée vers `src/app/clans/[clanId]/settings/members/page.tsx`
- [x] Filtres *Période* (Semaine/Mois/Tous) et *Mode de jeu* (Tous/Duo/Trio/Squad) en en-tête du Dashboard
- [x] 6 KPIs connectés au cache (`globalStats`)
- [x] Section "Top Performers" : "Awards du mode" (#1 par catégorie) + `<TopPerformers />` (Top 5) côte à côte
- [x] Cartes "Performances par mode" (duo/trio/squad) et `<SquadSynergies />` connectées au filtre Mode
- [x] Mention "Données mises à jour le [date]" basée sur `computedAt`

**4. Refonte UI : Roster Membres Actifs (Performance)**
- [x] Tableau administratif remplacé par un "Roster des performances" basé sur `rosterStats` du cache
- [x] Colonnes livrées : Joueur, Matchs, Victoires, Kills, Dégâts (Moy), K+A Moy., Médailles — légèrement différentes de la spec initiale (pas de colonne "Statut"/icône de santé de synchro dédiée, "Victoires" plutôt qu'un Win Rate % explicite), fonctionnalité équivalente
- [x] Tableau responsive : table desktop (`hidden md:block`) / cartes mobile (`md:hidden`)

**5. Fix Responsive : Pression au drop**
- [x] `min-w-[760px]` supprimé de `DropPressureStatsPanel.tsx`
- [x] Pattern responsive (table desktop cachée en mobile + cartes mobile) appliqué

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

##### Optimisations complémentaires — lenteur résiduelle (2026-08-08)

Malgré la migration vers `PositionMetricCell`, `GET /api/clans/[clanId]/telemetry/positions` reste lent car plusieurs opérations coûteuses s'exécutent encore à chaque requête, y compris quand les données sont déjà persistées.

- [x] Mettre en cache en mémoire (process) le résultat des deux vérifications `information_schema.COLUMNS` au lieu de les requêter à chaque appel — le schéma ne change pas entre deux requêtes (`getColumnPresence()` dans `route.ts`)
- [x] Dédupliquer le double appel à `loadPositionMetricCatalog` — remplacé par `loadPositionMetricMapSummary` (résumé des cartes, appelé une fois) et `loadPositionMetricMemberPhaseBreakdown` (membres/phases, appelé une seule fois avec la carte réellement sélectionnée), la requête d'agrégat par carte n'est plus dupliquée
- [x] Éviter le scan complet de `SquadMatchTelemetry JOIN SquadMatch` sur toute la carte sélectionnée quand `hasPersistedData` est vrai et qu'aucun filtre de phase n'est actif (`needsRawRows`) — cette requête ne sert qu'à `phaseSnapshots` pour l'overlay de zone de sécurité
- [ ] Limiter la requête `phaseSnapshots` (quand nécessaire) aux colonnes utiles au lieu de sélectionner potentiellement tout l'historique du match
- [ ] Mesurer le temps de réponse avant/après sur `/clans/1/stats/positions` (période semaine et tous) pour valider le gain

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

**Décision d'architecture retenue** — implémentée le 2026-08-07 (Phase 1, voir résumé plus bas) : normaliser l'identité plutôt que de garder les tables actuelles telles quelles.

- [x] Créer `Player` (identité globale) — clé unique `[pubgAccountId, platformShard]`, porte nom + clan PUBG résolu
- [x] Créer `OpponentClan` (clan adverse global) — clé unique `[pubgClanId, platformShard]`, tag/nom résolus, remplace le texte dupliqué `pubgClanTag`/`pubgClanName` par ligne
- [x] Faire pointer `ClanMember` vers `playerId` (FK `Player`) au lieu de stocker `pubgAccountId` en dur — implémenté en phase 2, avec fallback sur pubgAccountId
- [x] Créer `ClanEncounter` (`clanId` + `playerId` + compteurs + dates), unique sur `[clanId, playerId]` — **en écriture double** avec `EncounteredPlayer`, pas un remplacement complet : les 4 sites de lecture existants (`encountered-players` route, `nemesis`, `matches/[matchId]/telemetry`, le cron) lisent toujours `EncounteredPlayer` sans changement. Le cut-over des lectures + suppression d'`EncounteredPlayer` reste à faire dans une session ultérieure, une fois les nouvelles tables validées en production.
- [x] Laisser `KillEvent.killerAccountId`/`victimAccountId` en string libre pour l'instant
- [x] Script de backfill (`scripts/backfill-opponent-normalization.ts`, `npm run telemetry:opponents:backfill`) : peuple `Player`/`OpponentClan`/`ClanEncounter` depuis `EncounteredPlayer` existant, idempotent, tri par `lastSeenAt` croissant (le plus récent l'emporte en cas de doublon cross-clan)
- [x] Mettre à jour les 2 sites d'écriture (`src/lib/encountered-players.ts::captureEncounteredPlayers`, `src/lib/cron-jobs.ts::resolveEncounteredPlayerClans`) — dual-write vers les nouvelles tables + dédup des appels API de résolution de clan via `Player.clanResolvedAt` (fenêtre de fraîcheur `PLAYER_CLAN_RESOLUTION_FRESHNESS_DAYS = 7`)
- [x] Cache DB-first pour `searchPlayerByName` (`src/lib/pubg.ts`) via `Player`, fenêtre de fraîcheur `PLAYER_NAME_SEARCH_FRESHNESS_DAYS = 3`
- [ ] Le(s) site(s) de création de `ClanMember` ne sont pas modifiés — hors scope Phase 1

**Priorisation par interactions de combat (La "Bounty List") — Phase 2 (Dénormalisation) — ✅ Fait, doublon de la section "Dénormalisation de la Bounty List — Phase 2 Terminée" plus bas, vérifié le 2026-08-30 :**
- [x] `combatInteractionsCount` ajouté à `EncounteredPlayer` (`prisma/schema.prisma`) + index `@@index([clanResolvedAt, combatInteractionsCount])` + script de backfill `src/scripts/backfill-combat-interactions.ts`
- [x] `persistKillEventsForMatch` (`src/lib/kill-event-persistence.ts`) incrémente/décrémente `combatInteractionsCount` de façon transactionnelle (delta +1/-1 dans un `$transaction`)
- [x] Tri du cron sur `_sum: { combatInteractionsCount: 'desc' }` via `groupBy` Prisma natif (`src/lib/encountered-player-resolution.ts`, fonction `selectPrioritizedEncounteredPlayerIdentities`) — plus aucun `$queryRaw` sur ce chemin
- [x] Fallback de remplissage supprimé côté code de production — reste un mock `$queryRaw` mort et inutilisé dans `encountered-player-resolution.test.ts` (résidu cosmétique sans impact)

**Fonctionnalités déclenchées par cette normalisation :**

- [x] Page superadmin globale des adversaires (`src/app/settings/opponents/page.tsx` + API `GET /api/settings/opponents`, `requireSuperUser`) — agrège `ClanEncounter` sur tous les clans suivis, groupé par `OpponentClan`
- [x] **Suivre un adversaire externe** (création de `ClanMember` avec statut `tracked`) — Isolation des requêtes statistiques mise en place (`joinStatus: 'active'` exigé)
- [x] **Compléter un clan déjà suivi** (bouton d'ajout direct) — Bouton "Ajouter" fonctionnel dans les lignes du tableau 1
- [x] Détection automatique des correspondances côté API (voir ci-dessus) — affichée dans le tableau 1, pas encore dans un bandeau prioritaire dédié (simplification, voir gaps UI ci-dessous)
- [x] Favori clan — `OpponentClan.isFavorite`, `PATCH /api/settings/opponent-clans/[id]`, toggle optimiste
- [x] Favori joueur — implémenté via étoile ⭐️ cliquable

**UI/UX de la page superadmin globale (`/settings/opponents`) — implémentée le 2026-08-07, avec quelques simplifications par rapport à la spec initiale (notées ci-dessous) :**

- [x] Pattern des pages `settings/*` : `.app-container` + `.app-main`, pas de `ClanSectionNav`
- [x] Bandeau de compteurs globaux : clans suivis, clans adverses distincts, rencontres totales sur la période, joueurs "sans clan"
- [x] Filtre de période partagé (`Semaine` / `Mois` / `Tous`)
- [x] Entrée de navigation superuser ajoutée (`NavItem.navKey = 'superuser.opponents'`, section `superuser-menu`) — insérée directement en base plutôt que via `prisma/seed-nav-items.ts`, qui recalcule `sortOrder` pour toutes les entrées et aurait écrasé un éventuel réordonnancement manuel existant

**Tableau 1 — Clans suivis** (10 lignes, paginé, tri serveur, recherche) :
- [x] Colonnes : nom/tag, effectif, rencontres (période), dernier match synchronisé, membres manquants
- [ ] Colonne "membres manquants" cliquable → filtre le bandeau prioritaire — **non fait** : pas de bandeau prioritaire séparé, juste le nombre affiché en badge (voir tableau 2)
- [x] Tri par défaut décroissant sur rencontres, tri cliquable par colonne
- [x] Ligne cliquable → `/clans/[clanId]/telemetry/opponents` — **à remplacer**, voir "Évolution — Détail au clic" ci-dessous
- [x] Recherche texte nom/tag

**Tableau 2 — Clans adversaires** (10 lignes, paginé, tri serveur, recherche) :
- [x] Colonnes : clan adverse, fois adversaire, fois coéquipier, dernière rencontre
- [ ] Ligne séparée "Sans clan" dans le tableau — **non fait** : le total est visible dans le bandeau de compteurs (`noClanPlayerCount`) mais pas comme ligne dédiée cliquable/détaillée
- [x] Icône d'info si coéquipier ≫ adversaire (seuil : `asTeammateCount > asOpponentCount × 2` et `> 2`)
- [x] Tri par défaut décroissant sur fois adversaire, tri cliquable (y compris coéquipier)
- [x] Recherche texte tag/nom
- [x] Colonne "Clans nous ayant croisés" avec badges — **non cliquables vers le clan filtré** (simplification, juste informatif pour l'instant)
- [x] Étoile de favori optimiste, favoris remontés en tête via `ORDER BY isFavorite DESC` — **sans séparateur visuel dédié** entre favoris et reste (simplification)
- [x] Ligne dépliable → détail des joueurs de ce clan adverse — **remplacé par la spec détaillée ci-dessous**
- [ ] Bandeau prioritaire "Membres manquants détectés" avec bouton "Ajouter à <clan>" — **non fait**, seule la détection en lecture (tableau 1) est en place
- [x] Bouton "Suivre ce joueur" avec sélecteur de clan — Implémenté avec un `<select>` déroulant et auto-refresh UI
- [x] Badge "Membre de <clan>" pour joueur déjà suivi ailleurs — badge vert émeraude
- [~] Squelette de chargement + retry — chargement basique en place (texte, pas de squelette de cartes), **pas de bouton "Réessayer"** explicite comme sur `/clans` — à ajouter
- [x] Vérification thème clair/sombre et mobile — **validée à l'écran par l'utilisateur le 2026-08-07**, aucun problème signalé

#### Évolution — Détail au clic — ✅ Implémenté et vérifié le 2026-08-07

Objectif : rendre le clic sur une ligne utile en place au lieu de naviguer hors de la page — afficher qui est déjà suivi et qui pourrait l'être, pour préparer le flux "Suivre"/"Compléter" (toujours reporté côté actions d'écriture, seule la lecture est en scope ici).

**API** :
- [x] `GET /api/settings/opponents/clans/[clanId]/members` — membres actifs (`ClanMember`) + candidats manquants (`Player` résolus au même `pubgClanId`, limite 50, triés par `lastSeenAt` décroissant)
- [x] `GET /api/settings/opponent-clans/[id]/players` — joueurs rattachés à l'`OpponentClan` (compteurs adversaire/coéquipier agrégés, limite 50), avec détection s'ils sont déjà `ClanMember` actif ailleurs (`trackedMember`)

**Tableau 1 — Clans suivis :**
- [x] Navigation directe remplacée par un accordéon en place (clic sur le nom = expand, contexte de recherche/tri/pagination conservé)
- [x] Badge/icône lien (`ExternalLink`) à côté du nom vers `/clans/[clanId]/telemetry/opponents`
- [x] Détail déplié : liste des `ClanMember` actifs (nom, `joinStatus`) + liste des candidats détectés
- [x] Bouton "Ajouter" par candidat — désactivé (`cursor-not-allowed`), infobulle expliquant que la création automatique n'est pas encore implémentée
- [x] Limite de 50 candidats par clan côté API, indicateur "+" si la limite est atteinte

**Tableau 2 — Clans adversaires :**
- [x] Clic sur le nom = accordéon en place, liste des `Player` rattachés à cet `OpponentClan` (nom, fois adversaire, fois coéquipier)
- [x] Deux actions distinctes, non fusionnées :
  - "Suivre" par joueur → ajout à un clan déjà suivi (désactivé, infobulle)
  - "Suivre ce clan" au niveau du groupe → onboarding complet comme nouveau clan suivi (désactivé, infobulle mentionnant explicitement que c'est un chantier distinct de l'ajout de membre, à documenter séparément avant implémentation — réutiliser `src/lib/clan-service.ts`/`src/app/api/join/route.ts` plutôt qu'un nouveau mécanisme)
- [x] Badge "Membre de `<clan>`" quand le joueur est déjà un `ClanMember` actif ailleurs, au lieu du bouton désactivé
- [x] Limite de 50 joueurs par clan adverse côté API, indicateur "+" si atteinte

**Vérification navigateur** (session partagée, superuser connecté) :
- [x] Accordéon tableau 1 : membre existant + 4 candidats détectés affichés correctement pour `FR-Alliance-BE`
- [x] Accordéon tableau 2 : 2 joueurs affichés pour `[SVN] THE_SEVEN`, boutons "Suivre"/"Suivre ce clan" bien désactivés
- [x] Toggle favori optimiste vérifié en direct (étoile pleine ↔ vide) sur `[DNA] DnA-eSports`, sans erreur console
- [x] Aucune erreur console JS pendant les interactions

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

- [x] Avant d'appeler l'API PUBG dans `searchPlayerByName`, chercher d'abord une correspondance dans `Player` (nom insensible à la casse) — **fait, doublon de la ligne cochée plus haut** (`src/lib/pubg.ts:515-521`, collation MySQL `utf8mb4_unicode_ci` insensible à la casse)
- [x] Fenêtre de fraîcheur : `PLAYER_NAME_SEARCH_FRESHNESS_DAYS = 3` (`src/lib/pubg.ts:10`), hit DB ignoré si `updatedAt` plus vieux que ce seuil
- [x] En cas de miss DB (ou hit périmé), appel API puis upsert dans `Player` (`src/lib/pubg.ts:553-561`)
- [x] Comportement centralisé dans `searchPlayerByName` (`src/lib/pubg.ts:506-575`), tous les appelants existants (`clan-service.ts`, `api/join/route.ts`, `setup-service.ts`) en bénéficient automatiquement

**Résolution de clan — Même principe, et un vrai doublon d'appels API déjà présent aujourd'hui :**

`resolveEncounteredPlayerClans` (`src/lib/cron-jobs.ts:1118`) appelle `fetchPlayerClan(pubgAccountId, platformShard)` une fois par ligne `EncounteredPlayer`, donc une fois par couple `(clanId, pubgAccountId)` — si le même joueur adverse est croisé par plusieurs clans suivis, sa résolution de clan est refaite à l'identique pour chacun.

- [~] `clanResolvedAt`/`resolveAttempts` existent bien sur `Player` (`prisma/schema.prisma:166-167`) et `clanResolvedAt` sert de cache anti-double-appel (`src/lib/encountered-player-resolution.ts:129`) — **mais pas un vrai déplacement** : `EncounteredPlayer` garde ses propres `clanResolvedAt`/`resolveAttempts` en écriture double (commentaire explicite dans le schéma : "transition"), et `Player.resolveAttempts` n'est jamais lu ni écrit nulle part — vérifié le 2026-08-30
- [x] Upsert `OpponentClan` sur `pubgClanId_platformShard` avant insertion (`src/lib/encountered-player-resolution.ts:162-175`) — vérifié le 2026-08-30
- [ ] Appliquer la même fenêtre de fraîcheur sur `OpponentClan` (tag/nom peuvent changer si le clan est renommé) que celle prévue pour `Player` — éviter de considérer une résolution ancienne comme définitive — **confirmé toujours absent** le 2026-08-30 (seule `PLAYER_CLAN_RESOLUTION_FRESHNESS_DAYS` existe, appliquée à `Player`, pas à `OpponentClan`)
- [ ] Vérifier que le batch `ENCOUNTERED_PLAYER_RESOLUTION_BATCH_SIZE` reste pertinent une fois la déduplication par `Player` en place (le volume réel à résoudre devrait baisser mécaniquement) — **toujours ouvert**, défaut `5` fixé le 2026-08-09 avant la dédup cross-clan, jamais réévalué depuis

**Référence :** discussion du 2026-08-07, pas encore de branche ni de migration créée.

---

### ~~Engagement & Assiduité (Temps de jeu et Jours actifs)~~ — ✅ Implémenté le 2026-08-08

Objectif : Afficher des indicateurs de temps de jeu et de rétention (jours actifs) aux niveaux membre, clan et super-admin, pour suivre l'implication réelle des joueurs au-delà du simple nombre de matchs.

- [x] **Base de données** : Ajouter `timePlayedSeconds` et `activeDays` à `PlayerStats` (par `week`, `month`, `all-time`) et effectuer la migration Prisma.
- [x] **Cron & Calculs** : Mettre à jour `stats-calculator.ts` pour agréger `timePlayedSeconds` à partir des temps de survie, et `activeDays` en comptant les jours uniques d'activité sur la période.
- [x] **Page Membre (Heatmap)** : Exposer et afficher les KPI "Temps de jeu total" et "Jours actifs" au-dessus du calendrier (`/api/members/[id]/activity-heatmap/route.ts`).
- [x] **Page Clan (Statistiques)** : Créer un groupe "Engagement & Assiduité" avec un résumé clan et un Top 3 Membres.
- [x] **Page SuperUser (Cross-Clan)** : Ajouter un tri par "Temps de jeu" et afficher les tuiles "Temps" sur les cartes de chaque clan (`/api/clans/route.ts`).

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

Développé et déployé le 2026-08-04 à partir de fichiers réels dans `.telemetry-captured/` (structure des événements vérifiée directement, pas juste le nom du champ). **Résultat sur les 3 premiers items : 1 déployé (lancers), 1 abandonné après investigation car déjà résolu autrement (distance véhicule), 1 abandonné car la prémisse était fausse (arme au moment du kill).** Un 4e item (objets de soin/boost consommés) a été ajouté le 2026-08-16, non encore développé.

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

#### 4. `LogItemUse` (catégorie `Use`) — détail des objets de soin/boost consommés + page dédiée — 🆕 À faire

Demandé le 2026-08-16, en prolongement de l'ajout des icônes manquantes (`public/icons/pubg/items/`, synchronisées via `npm run sync:pubg-assets -- --items`, voir plus bas) pour Heal/Boost/Fuel/Gadget.

**État actuel :** `LogItemUse` est déjà parsé ([parser.ts:1347](../../src/lib/pubg-telemetry/parser.ts#L1347)) mais uniquement en agrégats grossiers : `summary.itemUseEvents` (compteur global, tous types confondus — y compris munitions/attachments, pas seulement `Use`), `boostsUsed` (détection **fragile par sous-chaîne** sur l'`itemId` : `.includes('boost')`/`'energy'`/`'adrenaline'`/`'painkiller'`), `recalls` (bluechip transmitter). `LogHeal` ([parser.ts:1395](../../src/lib/pubg-telemetry/parser.ts#L1395)) alimente `healsUsed` + `healAmountTotal`, sans détail par type d'objet.

**Découverte en préparant ce chantier (vérifiée sur des captures réelles dans `.telemetry-captured/`) :** `LogItemUse` porte déjà `item.category` et `item.subCategory` directement dans le payload — pas besoin de deviner via des sous-chaînes comme le fait `boostsUsed` aujourd'hui :
```json
{"item": {"itemId": "Item_Heal_FirstAid_C", "category": "Use", "subCategory": "Heal"}}
{"item": {"itemId": "Item_Boost_AdrenalineSyringe_C", "category": "Use", "subCategory": "Boost"}}
{"item": {"itemId": "Item_JerryCan_C", "category": "Use", "subCategory": "Fuel"}}
{"item": {"itemId": "Item_Mountainbike_C", "category": "Use", "subCategory": "Gadget"}}
```
**Piège vérifié :** `LogHeal.item.itemId` est **vide** dans les captures réelles (`""`) — ne pas s'appuyer dessus pour le détail par objet, c'est `LogItemUse` avec `subCategory === 'Heal'` qui porte l'`itemId` fiable.

**Bug de casse déjà corrigé au passage (2026-08-16) :** l'`itemId` télémétrie du vélo de montagne est `Item_Mountainbike_C` (« b » minuscule) mais l'asset du repo officiel est `Item_MountainBike_C.png` (« B » majuscule) — invisible sur Windows/macOS (FS insensible à la casse) mais aurait cassé silencieusement en prod Linux. Corrigé via une table d'alias dans `itemIconUrl()` ([asset-url.ts](../../src/lib/pubg-assets/asset-url.ts)).

- [ ] Nouvelle table `MemberItemUseStat` (`squadMatchId`, `memberId`, `itemId`, `category`, `subCategory`, `count`, `matchDate`), unique sur `[squadMatchId, memberId, itemId]` — même schéma que `MemberThrowableStat` (migration `20260804150000_add_member_throwable_stat`), remplacement idempotent par match reparsé.
- [ ] Capturer les échantillons dans le parser (`parser.ts`, bloc `LogItemUse` ~ligne 1347) : pousser `{actorKey, itemId, category, subCategory}` dans un nouveau tableau `itemUseSamples` de l'accumulateur, **sans filtrer** sur `category === 'Use'` à ce stade (garder tout, filtrer à la persistance) — même raison que pour les lancers : `clanMemberKeys` est vide sur le chemin de sync principal, la résolution contre le roster se fait à la persistance.
- [ ] Remplacer la détection par sous-chaîne de `boostsUsed` (parser.ts ~lignes 1353–1357) par un test sur `item.subCategory === 'Boost'` — plus robuste, aligné sur les enums déjà présents dans `src/lib/pubg-assets/enums/item/{category,subCategory}.json`.
- [ ] Créer `item-use-persistence.ts` sur le modèle de `throwable-persistence.ts` : résoudre chaque `actorKey` contre tout le roster clan (pas seulement la squad détectée), écrire les lignes `MemberItemUseStat` en ne conservant que `category === 'Use'`.
- [ ] Brancher la persistance sur les 3 chemins de sync existants (`pubg-telemetry/index.ts` + les 2 points de `manual-sync.ts`), juste après `persistThrowableStatsForMatch`.
- [ ] Route API `GET /api/members/[id]/item-use` (cumul lifetime, `groupBy` Prisma sur `itemId`) sur le modèle de `GET /api/members/[id]/throwables` ; envisager aussi `GET /api/clans/[clanId]/telemetry/item-use` si la page clan agrège par clan et pas seulement par membre.
- [ ] **Page dédiée** (contrairement aux lancers, qui n'ont qu'une section sur `/members/[id]/weapons`) : `/members/[id]/items` et/ou `/clans/[clanId]/stats/items` — répartition Heal vs Boost vs Fuel vs Gadget, top objets utilisés par joueur, icône via `ItemIcon` (déjà créé, `src/components/ui/ItemIcon.tsx`) + libellé via `resolveItemName()` (`src/lib/pubg-assets/index.ts`). Suivre les conventions du projet : `app-container`/`app-main`, `ClanSectionNav`, cartes mobile + tableau desktop comme `/clans/[clanId]/stats/weapons`.
- [ ] Vérifier après ajout de tout nouvel `itemId` apparu en prod (nouvelle saison, nouvel objet) qu'il est bien couvert par `npm run sync:pubg-assets -- --items` — sinon l'icône se dégrade silencieusement vers `null` (comportement `ItemIcon` déjà en place, pas un bug bloquant).
- [ ] **Tests parser** : un event `LogItemUse` par `subCategory` (Heal/Boost/Fuel/Gadget) doit produire un échantillon avec le bon `itemId`/`category`/`subCategory` ; un `LogHeal` sans `itemId` ne doit pas produire de faux échantillon "Heal" ; un item hors catégorie `Use` (ex. `Ammunition`, observé dans les captures réelles) ne doit pas apparaître dans les agrégats "objets consommés" une fois le filtre de persistance appliqué.
- [ ] **Tests service de persistance** : remplacement idempotent par match (comme `throwable-persistence.test.ts`), résolution `memberId` depuis `actorKey` contre le roster clan complet, filtrage `category !== 'Use'` exclu.
- [ ] **Tests route API** : cumul lifetime correct, tri par `count`, comportement sur un membre sans aucune donnée.
- [ ] Valider ESLint et TypeScript sur tous les fichiers touchés.
- [ ] Vérifier par un vrai resync (comme pour les lancers le 2026-08-04) que les compteurs par item correspondent à une lecture manuelle de quelques événements `LogItemUse` d'un match réel.

**Effort estimé :** comparable aux lancers pour l'extraction/persistance (2–4h), plus le temps d'une page dédiée complète (mobile + desktop, contrairement à la simple section ajoutée pour les lancers) et ses tests — plutôt 1 jour complet.

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

#### Évolution — Backlog, Suivi Worker/Planification, Actions & Chargement Progressif — ✅ Déployé le 2026-09-02

Demande utilisateur : `/settings/telemetry-recoveries` n'affichait aucune information sur ce qui restait à récupérer (backlog invisible), le statut de complétion réel était absent, et aucune indication ne permettait de savoir quand le restant serait récupéré. De plus, un chargement rapide avec affichage progressif des données plus lourdes était requis.

- [x] **Chargement progressif et asynchrone :** suppression de l'écran blanc bloquant. La page et la navigation s'affichent instantanément. Trois flux de données parallèles indépendants :
  1. `GET /api/settings/telemetry-recoveries/status` : ultra-rapide (< 20ms), lit le lock du worker (`.telemetry-resync-worker.lock`), la file live-sync (`CronExecution`), la configuration scheduler (`TELEMETRY_SYNC_ENABLED`, quota) et l'ETA de traitement.
  2. `GET /api/settings/telemetry-recoveries?window=...` : rapide (50-100ms), récupère l'activité récente par fenêtre temporelle (`24h`, `7d`, `30d`, `all`).
  3. `GET /api/settings/telemetry-recoveries/backlog` : audit complet en tâche de fond sous skeleton animé, calculant le vrai volume de matchs éligibles, les télémétries complétées, le backlog restant, les matchs en file et les urgences PUBG 14 jours.
- [x] **Axe 1 — Visibilité Backlog & Complétion Réelle :**
  - Nouveau service [telemetry-recoveries-backlog.ts](../../src/lib/telemetry-recoveries-backlog.ts) avec agrégation SQL optimisée groupée par clan (`SquadMatch` non casual, `SquadMember`, `ClanMember`, LEFT JOIN `SquadMatchTelemetry`).
  - Prise en compte de la règle de rétention PUBG (14 jours) : les matchs de plus de 14 jours sans télémétrie sont isolés en `expiredMatches` (non récupérables).
  - Alerte d'urgence PUBG : détection des matchs datant de 7 à 13 jours risquant d'expirer prochainement.
  - Jauge de complétion réelle cross-clans et par clan : `complétés / (total - expirés PUBG)`.
- [x] **Axe 2 — Moteur & Planification (Quand est-ce récupéré) :**
  - Nouveau service [telemetry-recoveries-status.ts](../../src/lib/telemetry-recoveries-status.ts) et route [status/route.ts](../../src/app/api/settings/telemetry-recoveries/status/route.ts).
  - Bandeau temps réel : badge 🟢 Worker Actif (PID, traitement en cours) ou 🔴 Worker Inactif avec consigne explicite (`npm run telemetry:worker`).
  - File d'attente : nombre de matchs `queued` et `running`, temps estimé (ETA).
  - Statut de la synchronisation automatique nocturne (`TELEMETRY_SYNC_ENABLED`, heure estimée, quota par clan).
- [x] **Axe 3 — Actions SuperUser directes :**
  - Nouvelle route [POST /api/settings/telemetry-recoveries/enqueue-backlog](../../src/app/api/settings/telemetry-recoveries/enqueue-backlog/route.ts) permettant de mettre en file en 1 clic tout le backlog récupérable ou prioritairement les urgences (< 14 jours).
  - Boutons d'enqueuement cross-clans et par clan directement sur les cartes de clan avec rafraîchissement réactif (`reloadToken`).
- [x] **Tests & Validation :**
  - Nouveaux tests unitaires [telemetry-recoveries.test.ts](../../src/lib/telemetry-recoveries.test.ts) validant le statut, le calcul du backlog/complétion et l'enqueuement (3/3 passés).
  - `npx tsc --noEmit` : 0 erreur. ESLint : 0 erreur, 0 avertissement.

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
- [x] Documenter les pages UI `/drop-zones` une fois créées — `docs/features/drop-zones.md` existe (vérifié le 2026-08-30)
- [ ] Mettre à jour `docs/features/challenges.md` une fois la progression auto câblée — **confirmé toujours pas fait le 2026-08-30** : le câblage (`refreshChallengeProgressForClan`) est bien en place dans `cron-jobs.ts`, mais `docs/features/challenges.md` ne le mentionne pas

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

### ~~1. Classement public inter-clans ("Ligue des clans")~~ — ✅ Fait à ~90 % (vérifié le 2026-08-30, déployé sous le nom "Ligue Inter-Clans" sans que cette section ait été mise à jour)

**Pourquoi c'est utile :** la fonctionnalité la plus évidente et la plus motivante — donner à chaque clan un rang par rapport aux autres, pas seulement en interne.

**Données disponibles :** `Clan.clanStats.tracked.aggregated` existe déjà pour chaque clan actif (kills, damage, matches, winRate, assists, revives). Aucun nouveau pipeline de calcul n'est nécessaire, juste une agrégation de lecture sur tous les clans.

- [x] Page `/clans-leaderboard` (`src/app/clans-leaderboard/page.tsx`) listant tous les clans actifs, triable par winRate, kills totaux, damage moyen par match, matches joués (`ClanLeaderboardTable.tsx`, tri cliquable)
- [x] Podium Top 3 avec gradients/glow/icône couronne et animations d'entrée (`ClanLeaderboardTable.tsx`) — [ ] **sparklines de tendance 4 semaines toujours absentes**, aucune trace dans le code
- [x] Colonnes : rang (médailles), nom + tag, effectif actif, Power Score, winRate, dégâts moyens, kills moyens (+ knocks moyens en bonus)
- [x] Filtrage par période (Semaine/Mois/Tous), backend précalculé via `ClanComparatorCache`/`computeClanComparatorStats`, rafraîchi chaque nuit par `cron-jobs.ts`
- [x] Route API `GET /api/clans-leaderboard` (lecture `ClanComparatorCache` pour les clans `isActive`, tri en mémoire) — composant dédié `ClanLeaderboardTable.tsx` plutôt que réutilisation de `Leaderboard.tsx` interne

**Point d'attention :** comparer des totaux bruts favorise les gros clans (plus de membres = plus de kills). Voir item 4 (normalisation, toujours pas fait).

**Effort :** faible — réalisé.

### ~~2. Score de puissance de clan ("Clan Power Rating")~~ — ⚠️ Partiellement fait (vérifié le 2026-08-30)

**Pourquoi c'est utile :** un score unique, facile à afficher en badge, qui résume la force d'un clan mieux qu'un classement multi-colonnes.

- [~] Un "Power Score" existe et s'affiche partout sur `/clans-leaderboard` (`src/app/api/clans-leaderboard/route.ts`, formule `winRate*10000 + avgDamage + avgKills*10 + avgKnocks*5`) — **mais ce n'est pas une formule normalisée 0–100** (échelle libre non bornée) et le facteur de régularité (écart-type des perfs hebdo) n'est pas implémenté
- [ ] Historique du score dans le temps (courbe) — nouvelle table légère `ClanPowerRatingHistory (clanId, period, score)` ou append JSON dans `clanStats` à chaque recalcul nocturne — **confirmé absent**, le score est recalculé à la volée à chaque requête, rien n'est persisté dans le temps
- [ ] Évolution ± affichée comme delta (même pattern que les deltas du leaderboard interne) — pas de delta affiché

**Effort :** moyenne — le calcul brut existe déjà (à normaliser), l'historique demande une nouvelle table/append JSON et une décision sur la fenêtre de calcul (rolling 30 jours ?).

**Inspiration :** systèmes de type Elo/Glicko pour classer des équipes — ici plus simple, pas de confrontations directes à arbitrer (voir item 3).

### ~~3. Détection de rivalité — clans qui se croisent dans le même match~~ — ⚠️ Fait à ~70 % via le Comparateur de Clans (vérifié le 2026-08-30)

**Pourquoi c'est utile :** PUBG est un battle royale, donc deux clans trackés peuvent littéralement s'affronter dans le même match sans le savoir. Détecter ces croisements et en faire un classement "face-à-face" est une fonctionnalité qu'aucun site classique de stats PUBG ne propose.

**Données disponibles :** `Match` stocke déjà le `matchId` PUBG par membre. Si deux membres de deux clans différents ont le même `matchId`, c'est un croisement détecté.

- [x] Détection de `SquadMatch` partagés entre membres actifs de deux clans, via `src/lib/head-to-head-service.ts` (`getHeadToHeadStats`) — va au-delà de la demande initiale (kills directs via `KillEvent` en plus du placement)
- [x] Pour chaque croisement : meilleur placement par clan, kills totaux par clan, bilan victoire/défaite (`matchesWonByA/B`)
- [x] Tableau "Confrontations directes" par paire de clans — section "Le Derby — Head-to-Head" sur `/clans/comparator`
- [ ] **Reste manquant :** ce n'est pas un job/cron automatique balayant tous les clans (calculé seulement à la demande pour les clans sélectionnés manuellement, max 3, dans le Comparateur) ; aucune notification "Votre clan a croisé [Clan X]" n'existe

**Effort :** moyenne à élevée. La détection et l'exploitation fine (kills directs via `KillEvent`) sont faites ; il ne reste que l'automatisation en tâche de fond et la notification.

**Point d'attention confidentialité :** révèle des informations sur un autre clan sans son consentement explicite (placement, kills dans un match donné). Voir item confidentialité (toujours pas tranché — le leaderboard actuel expose tous les clans actifs sans distinction, ce qui correspond de facto à l'option "Public par défaut").

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

- [ ] Trancher l'option de confidentialité (recommandation : commencer par "Réservé SuperUser" pour valider l'intérêt et la fiabilité des chiffres, puis basculer vers "opt-in par clan" une fois le concept validé) — **note du 2026-08-30** : `/clans-leaderboard` (livré depuis) expose déjà tous les clans actifs sans distinction, donc l'option "Public par défaut" est de facto celle en place, sans qu'une décision explicite ait jamais été actée

### Priorisation suggérée

**Mise à jour du 2026-08-30 :** les items 1 et 3 ont été livrés entre-temps sous le nom "Ligue Inter-Clans" / "Comparateur de Clans" (voir sections ci-dessus), sans que cette table ait été tenue à jour.

| Priorité | Idée | Effort | Dépendances | Statut au 2026-08-30 |
|---|---|---|---|---|
| 1 | Classement inter-clans brut + per-capita (items 1 + 4) | Faible | Aucune — données déjà en base | Classement brut ✅ fait (`/clans-leaderboard`) ; per-capita ❌ toujours pas fait |
| 2 | Scope SuperUser-only en premier (item 6) | Faible | Aucune | ❌ Pas fait — décision jamais tranchée, page ouverte à tous les utilisateurs authentifiés |
| 3 | Clan Power Rating avec historique (item 2) | Moyenne | Nouvelle table ou append JSON | ⚠️ Score brut ("Power Score") fait, non normalisé, sans historique |
| 4 | Détection de rivalité / croisements de matchs (item 3) | Moyenne à élevée | Itérer avec/sans télémétrie | ⚠️ Fait à ~70 % via le Comparateur (manuel, pas de job auto ni notification) |
| 5 | Défis inter-clans (item 5) | Élevée | Extension du modèle `Challenge` | ❌ Pas fait |

Les items 1 et 2 peuvent être livrés ensemble comme un premier lot cohérent : une page SuperUser-only `/admin/clans-leaderboard` avec classement brut et per-capita, sans aucune migration de schéma.

---

## Suggestions — Stats et fonctionnalités

Idées de stats et fonctionnalités qui apporteraient une vraie valeur au clan. L'angle directeur est toujours "aider chaque joueur à identifier ce qu'il peut améliorer" — pas juste afficher des chiffres.

### Stats individuelles à mettre en place

- [x] **Précision par arme et par distance** — ✅ Fait pour l'essentiel (vérifié le 2026-08-30) : taux de précision (`hitsLanded / shotsFired`) affiché par arme sur `/members/[id]/weapons` et `/clans/[clanId]/stats/weapons`, alimenté par `MemberWeaponStats` via `/api/members/[id]/telemetry/weapons` et `/api/clans/[clanId]/telemetry/weapons`. Nuance : pas de comparaison explicite à une "portée efficace de référence" ni de mise en évidence visuelle au-dessus/en dessous de la moyenne clan — juste le tableau trié.
- [ ] **Score de positionnement (Circle IQ)** — score synthétique sur 100 combinant `circleDelayPercent` et `blueZoneHitsRate` (tous deux dans `MemberTelemetryStats`), classement des membres, tendance sur 4 semaines. Widget dashboard membre avec insight textuel ("Tu entres dans la zone 12 % moins vite que tes coéquipiers").
- [ ] **Profil de joueur — Spider chart** — radar à 6 axes normalisés sur 100 : Agressivité (kills/match vs moyenne clan), Précision (headshot rate), Support (revives/match), Survie (temps de survie moyen), Mobilité (distance à pied/match), Circle IQ (inverse de `circleDelayPercent`). Données dans `MemberTelemetryStats` et `PlayerStats`, normalisation par min/max du clan.
- [ ] **Radar playstyle vs moyenne clan** — superposer le profil du joueur (Agressivité/Support/Zone, déjà calculés par période) à la moyenne clan sur la section "Évolution du playstyle" existante. Radar SVG à 3 axes, joueur (rempli) vs moyenne clan (contour pointillé), réactif au SegmentedControl Semaine/Mois/Tous. Nécessite l'endpoint `/api/clans/[clanId]/telemetry/playstyle-average?period=week`. Cacher le radar si moins de 3 membres ont des données télémétrie sur la période. Page : `/members/[id]/dashboard`, section "Évolution du playstyle". Effort faible côté frontend.
- [ ] **Kill distance — Distribution** — répartition des kills par tranche (< 25 m CQC, 25–100 m mid, 100–200 m longue, > 200 m snipe), identification de l'arme "signature", comparaison au profil du clan. Données : `MemberWeaponStats.avgDistance`.
- [ ] **Évolution K/D par phase de cercle** — répartition des kills par phase (Early 1–3, Mid 4–6, Late 7+) en %, comparaison early/late entre membres ("early rusher" vs "late game player"). Données : `MemberTelemetryStats.firstKillPhase`, `killSamples` dans `SquadMatchTelemetry`.
- [ ] **Ratio damage dealt / damage taken** — ratio par membre et par période, classement du clan, identification des joueurs qui absorbent le plus de dégâts. Nécessite d'ajouter `avgDamageTaken` dans `MemberTelemetryStats` (données présentes dans le parser via `LogPlayerTakeDamage` + `LogBlueZoneDamage`, mais pas encore agrégées en période).

### Stats clan globales

- [ ] **Tendance du clan sur 8 semaines** — courbes win rate moyen, kills/match moyen, nombre de matchs joués (indicateur d'activité), agrégées depuis `PlayerStats` par `periodKey` semaine. Page suggérée : section "Santé du clan" dans l'overview du clan.
- [x] **Meilleurs duos du clan** — ✅ Fait à l'essentiel (vérifié le 2026-08-30) : top 5 des duos exposé en UI via `<SquadSynergies />` (`src/components/SquadSynergies.tsx`, section Overview clan), alimenté par `topPairs` (`src/app/api/clans/[clanId]/matches/route.ts`) avec matchs, kills, durée et winRate. Nuance : trié par matchs/winRate/kills, pas par le score `coKills + revives` pondéré décrit ici ; pas de matrice N×N "Chimie d'équipe" (`ClanSynergyTelemetryStats.reviveCount`/`coKillCount` alimentent un classement séparé "Top Sauvetages"/"Co-kills", pas ce score composite).
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

#### Limite d'affichage à 300 joueurs — diagnostic du 2026-08-09

Les clans 1, 5 et 7 affichent tous `300` dans la carte "Joueurs croisés" parce que l'API applique `take: 300`, puis utilise `rows.length` comme `summary.totalPlayers`. Le filtre `clanId` fonctionne bien — les joueurs renvoyés diffèrent selon le clan — mais ce nombre représente la taille de l'échantillon retourné, pas le total réel. Les cartes "Résolus", "En attente", "Clans identifiés" et "Dont coéquipiers", ainsi que le tableau des clans rivaux, sont également calculés sur ces 300 joueurs les plus croisés.

- [x] Confirmer dans le navigateur que `GET /api/clans/{1,5,7}/encountered-players?period=all` renvoie exactement 300 joueurs distincts propres à chaque clan
- [x] Calculer `summary.totalPlayers` avec un `count` exact utilisant les mêmes filtres `clanId` et `lastSeenAt`, indépendamment de la limite de la liste
- [x] Calculer les autres KPI et les agrégats de clans rivaux sur l'ensemble filtré, pas uniquement sur les 300 lignes retournées
- [x] Conserver une limite explicite pour la liste ou mettre en place une pagination serveur afin d'éviter de charger tous les joueurs dans le navigateur
- [x] Ajouter au-dessus du tableau des joueurs une mention visible du type : "Affichage limité aux 300 joueurs les plus croisés sur la période sélectionnée"
- [x] Tant que le total exact n'est pas séparé de la liste, ne pas présenter `rows.length` comme un total : afficher "300+" ou renommer la carte en "Joueurs affichés"
- [x] Vérifier après correction les clans 1, 5 et 7 ainsi que les périodes Semaine, Mois et Tous ; le total doit pouvoir dépasser 300 tandis que la liste reste explicitement limitée

**Corrigé le 2026-08-09** dans [encountered-players/route.ts](../../src/app/api/clans/[clanId]/encountered-players/route.ts) : la requête `EncounteredPlayer.findMany` charge désormais toutes les lignes filtrées (`allRows`, sans `take`) pour calculer `summary` (dont `totalPlayers` exact) et `rivalClans` sur l'ensemble réel ; seule la liste `players` retournée reste tronquée à `PLAYERS_LIST_LIMIT = 300` (les lignes les plus croisées, déjà triées). Nouveaux champs `playersListLimit`/`playersListTruncated` dans la réponse JSON, consommés côté UI (`/telemetry/opponents`) pour afficher un bandeau d'avertissement au-dessus du tableau quand la liste est tronquée. `rows.length` n'est plus utilisé comme total nulle part. `distinctClansIdentified` reste dérivé de `rivalClanMap.size`, désormais construit sur `allRows`.

#### Résolution des clans adverses — débit, observabilité et action ciblée

**Diagnostic du 2026-08-09 :** le clan 1 compte `8 067` joueurs croisés, dont `7 304` avec `clanResolvedAt = null`. Le cron `encountered_player_clan_resolution` s'exécute toutes les 30 minutes par défaut, mais `ENCOUNTERED_PLAYER_RESOLUTION_BATCH_SIZE = 5` limite le débit théorique à `240` joueurs par jour. Les candidats sont triés par `encounterCount DESC`, puis `lastSeenAt DESC` : un joueur éligible mais peu croisé peut rester durablement derrière les joueurs plus fréquents. Le serveur web observé a `ENABLE_CRON_JOBS=false`, configuration normale en mode deux workers, mais l'état du worker cron séparé n'est pas vérifiable tant que `CRON_BOOTSTRAP_SECRET` n'est pas configuré.

**Emplacement UI retenu :** ajouter un panneau "Résolution des clans adverses" dans la page SuperUser existante `/settings/opponents`, plutôt que créer une nouvelle page. Le réglage est global à tous les clans, consomme le rate limit PUBG partagé et complète directement la vue transverse des adversaires. La page `/settings/pubg-api-rate-limit` reste la source du plafond RPM ; `/clans/[clanId]/telemetry/opponents` expose uniquement l'état par joueur et ne porte pas le réglage global.

##### Réglage et augmentation du batch

- [x] Remplacer la constante seule `ENCOUNTERED_PLAYER_RESOLUTION_BATCH_SIZE = 5` par une configuration persistée globale dans `AppConfig`, avec fallback sur une variable d'environnement puis sur une valeur par défaut documentée
- [x] Mesurer le backlog global, le nombre de candidats éligibles, le débit réel et la consommation PUBG avant de fixer la nouvelle valeur par défaut ; ne pas augmenter arbitrairement le batch sans tenir compte de `pubg_api_rate_limit_rpm` et des syncs prioritaires — mécanisme livré, défaut conservé à `5` (bornes serveur `[1, 40]`), pas de changement de valeur tant que le panneau n'a pas été observé en conditions réelles
- [x] Ajouter dans `/settings/opponents` un panneau affichant : batch effectif, fréquence du cron, seuil minimal de croisements, backlog jamais tenté, backlog en retry, échecs définitifs, résolutions sur 24 h et estimation du temps de rattrapage
- [x] Ajouter dans ce panneau un contrôle SuperUser pour modifier le batch avec bornes serveur, validation, aide contextuelle et rappel que la limite PUBG est partagée avec les autres traitements
- [x] Permettre de désactiver temporairement la résolution automatique avec une valeur/configuration explicite, sans détourner le batch `0` comme état implicite — nouvelle clé `AppConfig` `encountered_player_resolution_enabled`, toggle dédié dans le panneau
- [x] Afficher l'état du worker cron et la dernière exécution réussie ; configurer la sonde `CRON_BOOTSTRAP_SECRET` afin de distinguer "web worker désactivé normalement" de "aucun worker cron actif" — `getCronWorkerRuntimeStatus()` extrait de `cron-control/route.ts` vers `cron-observability.ts`, réutilisé par le nouveau panneau (`CRON_BOOTSTRAP_SECRET` reste à configurer par l'opérateur si non fait, la distinction des 3 états est gérée par le code)
- [x] Journaliser pour chaque passage : candidats sélectionnés, résolus via cache, appels PUBG, sans clan, échecs, durée, backlog restant et rate limit avant/après — nouvelle table `EncounteredPlayerResolutionRun` (migration `20260809120000_add_encountered_player_resolution_run`), remplie par `resolveEncounteredPlayerClans()` et par la résolution manuelle (`source: 'manual'`)
- [x] Vérifier qu'une hausse du batch ne retarde pas `daily_sync`, la télémétrie et les actions manuelles ; conserver le passage obligatoire par la gateway/throttle PUBG centralisée — vérifié : tous les appels de résolution passent toujours par `fetchPlayerClan` → `queuedPubgGet` → `enqueuePubgApiRequestWithMetadata`, la file `ApiQueue` reste strictement FIFO partagée (pas de nouvelle voie de contournement ajoutée) ; documenté dans l'aide contextuelle du panneau que relever le batch augmente la latence des autres appelants de la même file

##### États de résolution dans l'API et l'UI

- [x] Exposer `resolveAttempts` dans `GET /api/clans/[clanId]/encountered-players` et dans le type `EncounteredPlayerRow`
- [x] Exposer un statut dérivé explicite plutôt que laisser le client l'inférer : `below_threshold`, `never_attempted`, `retry_pending`, `failed`, `resolved_with_clan`, `resolved_without_clan` — fonction pure `deriveEncounteredPlayerStatus()` dans `src/lib/encountered-player-status.ts`, seule source utilisée par l'API par clan, le panneau global et la table de triage
- [x] Définir `never_attempted` par `clanResolvedAt = null` et `resolveAttempts = 0`, uniquement si le seuil minimal de croisements est atteint ; afficher séparément "Seuil non atteint" avant éligibilité
- [x] Définir `retry_pending` lorsque `clanResolvedAt = null` et `0 < resolveAttempts < maxAttempts`, avec le nombre de tentatives visible dans le tableau
- [x] Définir `failed` lorsque `clanResolvedAt = null` et `resolveAttempts >= maxAttempts` ; ne plus afficher le même libellé "En attente de résolution" qu'un joueur jamais traité
- [x] Distinguer clairement `resolved_without_clan` : l'appel PUBG a réussi et a confirmé l'absence de clan, donc `clanResolvedAt` est renseigné même si `pubgClanId`/`pubgClanTag` restent nuls
- [x] Ajouter au tableau `/clans/[clanId]/telemetry/opponents` des libellés et infobulles expliquant chaque état, sans exposer de détail technique ou d'erreur sensible
- [x] Ajouter dans `/settings/opponents` des filtres globaux par statut et tentatives pour identifier rapidement le backlog et les échecs définitifs — nouvelle route `GET /api/settings/encountered-players`, table de triage filtrable par statut(s) et `minAttempts`

##### Résolution manuelle ciblée

- [x] Ajouter une route dédiée SuperUser pour résoudre un joueur précis, jamais par nom PUBG seul — **écart assumé par rapport à l'énoncé initial** : la route est finalement clée sur `EncounteredPlayer.id` (`POST /api/settings/encountered-players/[id]/resolve`), pas sur `Player.id`, car `Player` n'est upsert qu'après une résolution réussie ou un cache-hit — jamais avant la première tentative ni sur échec. Clé sur `Player.id` aurait rendu la route inutilisable pour `never_attempted`/`retry_pending`/`failed`, son cas d'usage principal. La dédup cross-clan reste identique (propagation par `pubgAccountId`+`platformShard`).
- [x] Réutiliser exactement le service de résolution du cron et la gateway PUBG ; ne pas dupliquer l'appel, le mapping de clan ni les écritures `Player`/`OpponentClan`/`EncounteredPlayer` — fonction partagée `resolveOneEncounteredPlayerCandidate()` dans `src/lib/encountered-player-resolution.ts`, utilisée par le cron et par la route manuelle
- [x] Dédupliquer la résolution transverse : un seul appel PUBG doit mettre à jour l'identité globale `Player`, puis propager le résultat aux lignes `EncounteredPlayer` du même compte dans tous les clans suivis — `updateMany` par `pubgAccountId`+`platformShard`, y compris pour les échecs (`resolveAttempts` incrémenté partout, décision actée avec l'utilisateur pour garder un statut cohérent entre clans)
- [x] Ajouter l'action "Résoudre maintenant" dans le détail joueur de `/settings/opponents`, réservée aux statuts non résolus
- [x] Ajouter une confirmation indiquant qu'un appel PUBG sera consommé, désactiver le bouton pendant la requête et afficher le résultat : clan trouvé, aucun clan, cache utilisé ou erreur/retry
- [x] Autoriser "Réessayer" après échec définitif avec remise à zéro contrôlée de `resolveAttempts`, journal d'audit et protection contre les clics répétés/concurrents — `?force=retry`, audit via `EncounteredPlayerResolutionRun` (`source: 'manual'`, `triggeredByUserId`), verrou en mémoire par identité (`Set` global, même style que le garde-fou du cron)
- [x] Appliquer un rate limit serveur à l'action manuelle et refuser une nouvelle résolution si une tentative du même joueur est déjà en cours — cooldown 60 s par joueur, plafond 20 résolutions/SuperUser/10 min, verrou en mémoire (409 si déjà en cours)
- [ ] Tester les six états UI, un résultat sans clan, un cache global récent, un échec PUBG, le maximum de tentatives et deux demandes concurrentes sur le même joueur — **non fait** : build/typecheck/lint passent, testé sans authentification (gating SuperUser confirmé, aucun crash serveur), migration + backfill vérifiés en base réelle (142 941/143 487 lignes `EncounteredPlayer` avec `playerId` peuplé). Pas d'accès navigateur/session SuperUser dans cet environnement pour dérouler le scénario complet — à valider manuellement

##### Priorisation cross-clan — maximiser les lignes résolues par appel PUBG

**Proposition du 2026-08-09 :** un même joueur peut être croisé par plusieurs clans suivis. Le sélectionner en priorité permet de consommer un seul appel PUBG, puis de renseigner simultanément toutes ses lignes `EncounteredPlayer`. Le rendement recherché n'est donc pas seulement le nombre de croisements d'une ligne, mais le nombre de relations clan-joueur retirées du backlog par identité globale résolue.

Ordre de priorité proposé pour les identités éligibles et non résolues :

1. nombre de clans suivis distincts ayant croisé le joueur, décroissant (`distinctClanCount`)
2. somme des croisements dans tous ces clans, décroissante (`totalEncounterCount`)
3. rencontre la plus récente parmi tous les clans, décroissante (`lastSeenAt`)

Ainsi, un joueur présent dans cinq clans est traité avant un joueur propre à un seul clan, puis le résultat est propagé par le couple `(pubgAccountId, platformShard)`. Une résolution peut alors retirer cinq lignes du backlog pour un seul appel PUBG.

- [x] Remplacer la sélection actuelle par ligne `EncounteredPlayer` par une sélection d'identités globales distinctes, idéalement depuis `Player` + `ClanEncounter`, avec fallback temporaire groupé sur `(pubgAccountId, platformShard)` tant que la transition depuis `EncounteredPlayer` n'est pas terminée — `selectPrioritizedEncounteredPlayerIdentities()` dans [encountered-player-resolution.ts](../../src/lib/encountered-player-resolution.ts), implémenté en groupBy sur `EncounteredPlayer` (le fallback groupé, `Player`/`ClanEncounter` pas encore la source de vérité pour la résolution — non fait, prématuré tant que la double-écriture n'est pas terminée)
- [x] Calculer pour chaque candidat `distinctClanCount`, `totalEncounterCount` et `lastSeenAt` sur l'ensemble des clans suivis, sans compter deux fois un même clan — `@@unique([clanId, pubgAccountId])` garantit qu'un groupe `groupBy` par identité ne contient jamais deux fois le même clan, donc `_count.clanId` = `distinctClanCount` sans logique supplémentaire
- [x] Appliquer l'ordre `distinctClanCount DESC`, `totalEncounterCount DESC`, `lastSeenAt DESC` avant la limite du batch — `orderBy` du `groupBy` Prisma, vérifié contre les données réelles (clan 1 : comptes croisés par 5-6 clans en tête)
- [x] Ne compter qu'une seule identité dans le batch, même si elle possède plusieurs lignes `EncounteredPlayer` ; le batch configuré doit représenter un nombre maximal d'appels PUBG potentiels, pas un nombre de relations clan-joueur — `take: batchSize` porte sur le nombre d'identités (`uniqueCandidatesSelected`), `candidatesSelected` redevient la somme des lignes représentées (nouveau sens, documenté dans le schéma)
- [x] Après cache-hit ou appel PUBG réussi, propager immédiatement le clan trouvé ou l'absence de clan à toutes les lignes partageant `(pubgAccountId, platformShard)` dans une même opération cohérente — déjà en place depuis le sous-bloc précédent (`resolveOneEncounteredPlayerCandidate`), inchangé ici
- [x] En cas d'échec PUBG, conserver des tentatives cohérentes au niveau de l'identité globale et éviter qu'une autre ligne du même joueur soit sélectionnée comme nouveau candidat au passage suivant — déjà garanti par la propagation `updateMany` existante (échecs inclus, actée avec l'utilisateur dans le sous-bloc précédent) : toutes les lignes d'une identité restent synchronisées, donc jamais sélectionnées séparément
- [x] Mesurer séparément dans le panneau `/settings/opponents` : identités globales restantes (appels potentiels), lignes clan-joueur en attente, joueurs communs à plusieurs clans et nombre moyen de lignes résolues par appel — nouvelle section de métriques (`crossClan` dans la réponse API), calculée par `groupBy` sur le backlog automatique (jamais tenté + nouvel essai prévu)
- [x] Ajouter aux journaux de run `uniqueCandidatesSelected`, `crossClanCandidatesSelected`, `encounterRowsUpdated` et `rowsResolvedPerApiCall` pour vérifier le gain réel — 4 nouvelles colonnes sur `EncounteredPlayerResolutionRun` (migration `20260809140000_add_cross_clan_resolution_metrics`), remplies par le cron et par la résolution manuelle, affichées dans la table des derniers runs
- [x] Afficher dans la table de triage le nombre de clans ayant croisé chaque joueur afin d'expliquer visuellement sa priorité — colonne "Clans" avec badge dès que `distinctClanCount > 1`
- [ ] Comparer sur un échantillon réel l'ancien tri et le nouveau : appels PUBG identiques, mais davantage de lignes retirées du backlog avec la stratégie cross-clan — **non fait** : nécessite d'observer plusieurs passages réels du cron avec l'ancien vs le nouveau tri (impossible à comparer a posteriori, l'ancien tri n'est plus en place) ; le panneau expose désormais `rowsResolvedPerApiCall` par run pour suivre ce gain dans le temps une fois le cron actif
- [x] Ajouter des tests couvrant un joueur présent dans plusieurs clans, l'unicité du candidat dans le batch, la propagation multi-lignes, le résultat sans clan, le cache-hit et l'échec partagé — [encountered-player-resolution.test.ts](../../src/lib/encountered-player-resolution.test.ts) (6 tests, prisma/pubg mockés), `npm run test:telemetry` : aucune régression sur la suite existante (4 échecs préexistants sans rapport, vérifiés par comparaison avant/après)

**Vérifié le 2026-08-09** : `tsc --noEmit`, `eslint` (aucune nouvelle erreur) et `npm run build` passent ; la requête `groupBy` de priorisation exécutée directement contre la base réelle (clan 1) retourne bien les comptes croisés par 5-6 clans en tête, `crossClanPlayerCount` cohérent. Test manuel authentifié en navigateur non fait (pas d'accès session SuperUser dans cet environnement) — à valider côté utilisateur sur `/settings/opponents`.

#### Dénormalisation de la Bounty List — Optimisation du cron (Phase 2 Terminée)

- [x] Ajout de la colonne `combatInteractionsCount` à la table `EncounteredPlayer`.
- [x] Ajout de l'index `@@index([clanResolvedAt, combatInteractionsCount])` pour garantir un temps d'exécution constant.
- [x] Script de backfill (`src/scripts/backfill-combat-interactions.ts`) exécuté pour initialiser les compteurs à partir de l'historique existant.
- [x] Mise à jour en temps réel des compteurs lors de l'ingestion d'un match (`persistKillEventsForMatch`).
- [x] Suppression de la requête SQL `$queryRaw` dans le cron au profit d'un tri natif Prisma sur `combatInteractionsCount`.

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

---

## Idées — Nouvelles métriques d'engagement (Temps de jeu et Jours Actifs)

**Pourquoi c'est utile :** Le nombre de matchs joués est un indicateur imparfait. Un match peut durer 2 minutes (mort au drop) ou 30 minutes (top 1). Utiliser le **temps de jeu réel** (playtime) et le **nombre de jours de jeu distincts** (active days) donne une image beaucoup plus juste de l'engagement réel des membres et du clan.

**Données disponibles :**
- `SquadMember.timeSurvived` (en secondes) : donne le temps de survie exact du joueur dans un match suivi.
- Date du match (`matchDate` ou `pubgCreatedAt`) : permet de déduire les jours uniques de connexion.

**Proposition d'implémentation :**

### 1. Statistiques par Membre (`PlayerStats`) — ⚠️ Partiellement fait (vérifié 2026-08-08)
- [x] Ajouter `timePlayedSeconds` (Int) et `activeDays` (Int) dans le modèle `PlayerStats` (qui agrège par semaine/mois/all-time). — `prisma/schema.prisma:695-696`
- [x] Lors de la génération des statistiques (cron), sommer les `SquadMember.timeSurvived` de la période pour calculer le temps de jeu. — `src/lib/stats-calculator.ts:95-141`
- [x] Compter les dates uniques des matchs (ex: format `YYYY-MM-DD`) de la période pour déterminer les `activeDays`. — `src/lib/stats-calculator.ts:97-103`
- [ ] Afficher ces deux métriques (Temps de jeu formaté en heures/minutes et Jours actifs) sur le profil du joueur (`/members/[id]/dashboard`). **Pas fait** : absent de `src/app/members/[id]/dashboard/page.tsx`. Actuellement affiché ailleurs seulement — agrégé par membre sur `src/app/clans/[clanId]/stats/page.tsx:145-146` ("Temps de jeu" / "Jours actifs"), et `activeDays` seul sur `src/app/members/[id]/heatmap/page.tsx:461`.
- [x] Ajouter ces métriques dans les classements (Leaderboard) pour permettre le tri (ex: les joueurs les plus assidus). **Fait, note précédente obsolète — vérifié le 2026-08-30** : `src/app/api/clans/[clanId]/leaderboard/route.ts` (`parseSortBy`/`sortLeaderboard`) gère bien `timePlayed` et `activeDays` en plus de `kills`/`damage`/`winRate`/`matches`/`kpm` ; option "Jours Actifs" présente dans `src/components/Leaderboard.tsx`.
- [ ] **Design Visuel attractif :** Ajouter des badges conditionnels exclusifs dans le leaderboard (ex: Badge "Marathonien" pour le plus de temps joué, Badge "Régulier" pour l'assiduité) et formater le temps de façon très lisible et moderne (ex: "12h 45m" avec une icône d'horloge dynamique).

**Prochaines étapes proposées :**
1. Ajouter une carte "Temps de jeu" / "Jours actifs" sur `/members/[id]/dashboard/page.tsx`, en réutilisant le pattern de fetch déjà utilisé côté clan-stats (`lifetime-stats` route lit déjà `PlayerStats.timePlayedSeconds`/`activeDays` — voir `src/app/api/clans/[clanId]/lifetime-stats/route.ts:174-197`). Prévoir un formatteur heures/minutes (probablement déjà présent via `formatDurationLong` utilisé dans `clans/[clanId]/stats/page.tsx:145`, à factoriser/réutiliser plutôt que dupliquer).
2. Étendre `LeaderboardSortBy` (`src/types/leaderboard.ts`) avec `timePlayed` et `activeDays`, câbler `parseSortBy` + `sortLeaderboard` dans `leaderboard/route.ts`, et ajouter les options correspondantes dans le composant de tri UI du leaderboard (probablement `SegmentedControl` selon les conventions du projet — voir CLAUDE.md section UI).
3. Vérifier si le dashboard membre doit consommer directement `PlayerStats` (comme lifetime-stats) ou une nouvelle route API dédiée — à trancher avant l'implémentation pour éviter une divergence de source de données avec la page clan-stats.

### 2. Statistiques par Clan (`ClanStats` ou Dashboard)
- [ ] **Temps de jeu total du clan** : Somme du `timePlayedSeconds` de tous les membres actifs sur la période (mesure l'investissement "heures-hommes").
- [ ] **Jours d'activité globaux** : Nombre de jours uniques où au moins un membre a joué.
- [ ] Afficher ces agrégats sur la page "Overview" et "Stats" du clan pour évaluer sa vitalité réelle indépendamment de sa taille brute.

### 3. Statistiques de performance dérivées (KPI avancés)
- [ ] Remplacer ou compléter le traditionnel "Dégâts / Match" par **Dégâts / Minute (DPM)**, plus juste pour l'e-sport.
- [ ] Calculer les **Kills / Heure**, ce qui lisse le biais des parties très courtes.
- [ ] Afficher une "Heatmap" d'activité ou un "Ratio de survie" calculé sur le temps passé.


#### Phase 2 — Suivi, Favoris & UI — ✅ Implémenté le 2026-08-08

Objectif : Finaliser la fonctionnalité de "Watchlist" en permettant d'ajouter des joueurs suivis sans corrompre les calculs statistiques des clans.

**Modèle et API :**
- [x] Ajout de `isFavorite` sur `Player` et lien `playerId` sur `ClanMember`.
- [x] Route `PATCH /api/settings/players/[id]/favorite` pour le système d'étoiles.
- [x] Route `POST /api/settings/opponents/track` pour insérer un `ClanMember` de statut `joinStatus: 'tracked'`.

**UI :**
- [x] Boutons "Ajouter" activés pour les membres manquants détectés (Tableau 1).
- [x] Boutons "Suivre" avec menu déroulant pour affecter un adversaire à un clan suivi (Tableau 2).
- [x] Étoiles de favori interactives pour chaque joueur (Tableau 2).
- [x] Toast de notifications modernes et rafraîchissement automatique des tableaux après interaction.

**Isolation Stricte (Watchlist) :**
- [x] Patch global sur `src/lib/stats-calculator.ts`, `cron-jobs.ts`, `report-generator.ts`, et `matches-cache-service.ts` pour filtrer `isActive: true, joinStatus: 'active'`.
- [x] Création du test unitaire `tracked-isolation.test.ts` pour garantir l'étanchéité des calculs.

---

## Idées — Comparateur de Clans (Méta-Dashboard)

**Pourquoi c'est utile :** Apporter une dimension méta et compétitive (Le "Derby") entre les différents clans suivis sur le site. Il s'agit de comparer l'activité, le style de jeu et les performances pures des rosters, plutôt que de se limiter à des classements de joueurs individuels.

**Données disponibles :**
- `Match`, `SquadMember`, `SquadMatch`, `PositionMetricCell`, `DropPressureStat`, `KillEvent`, `PlayerStats`, `ClanSynergyTelemetryStats`
- La télémétrie existante suffit largement, il s'agit surtout de nouvelles agrégations transverses (cross-clan) au-dessus de tables déjà peuplées — pas de nouveau parsing.

**Vérification du modèle de données (2026-08-10) :**
- `SquadMatch.pubgMatchId` est **globalement unique** (`prisma/schema.prisma:542`) : quand deux clans suivis jouent le même match PUBG, une seule ligne `SquadMatch` existe pour les deux, et `SquadMember` y rattache les membres des deux clans. `KillEvent.killerMemberId` / `victimMemberId` (`prisma/schema.prisma:717-723`) peuvent donc pointer vers des `ClanMember` de clans différents sur le même `squadMatchId` — le Head-to-Head (section 4) est réellement calculable, à condition que les deux clans concernés soient suivis par le site et que leur télémétrie ait été parsée. **Limite à documenter dans l'UI** : les affrontements avec des clans non suivis (rencontrés seulement via `EncounteredPlayer`/`OpponentClan`, cf. section "Idées — Suivi des adversaires rencontrés en match") ne peuvent pas être exploités ici — ces comptes ne sont jamais résolus en `ClanMember`, donc invisibles pour `KillEvent`.
- `PositionMetricCell` et `DropPressureStat` sont scopés par `clanId`/`memberId`, agrégeables directement par clan sans jointure supplémentaire.
- `ClanMatchesCache` (`prisma/schema.prisma:294`) est le pattern de cache déjà en place pour les agrégats coûteux par clan (`payload Json`, recalculé en cron) — à réutiliser comme modèle plutôt qu'à réinventer un cache ad hoc pour le comparateur.

**Proposition d'implémentation (Page Comparateur) :**

### 0. Fondations — Service d'agrégation et cache — ✅ Complété le 2026-08-10
- [x] Créer `src/lib/clan-comparator-service.ts` avec `computeClanComparatorStats(clanId)` (calcule `week`/`month`/`all`) qui calcule un payload unique regroupant les sections 1 à 3 (pouls, ADN, performances) — même esprit que `precomputeClanMatchesStats` dans `matches-cache-service.ts`. Réutilise `getDropPressureDashboardStats` (`src/lib/drop-pressure-stats.ts`) pour l'indice Hot Drop plutôt que de recalculer, et `PositionMetricCell` (`metric: 'knockout_taken'`) pour les KO subis (non présents dans `KillEvent`, qui ne journalise que les kills).
- [x] Ajouter le modèle `ClanComparatorCache` (`clanId`, `period`, `periodKey`, `payload Json`, `computedAt`), calqué sur `ClanMatchesCache` — migration additive `prisma/migrations/20260810120000_add_clan_comparator_cache` (appliquée manuellement sur `smk.arkium.group`, cf. gotcha connu du projet sur les migrations de production).
- [x] Intégrer le calcul dans `src/lib/cron-jobs.ts`, juste après `precomputeClanMatchesStats` dans `runDailyStatsRecalculation`, pour que la page comparateur ne fasse jamais de calcul à froid.
- [x] Créer `GET /api/clans/comparator?clanIds=1,2,3&period=month` — route transverse (`src/app/api/clans/comparator/route.ts`, hors du préfixe `/api/clans/[clanId]/`), qui lit `ClanComparatorCache` pour chaque `clanId` demandé (max 3) et retourne un tableau de payloads. Retourne `Response.json` standard (pas `NextResponse`), conforme au reste des nouvelles routes.
- [x] Permissions : lecture cross-clan ouverte à tout utilisateur authentifié (simple vérification de session via `getSessionFromRequest`, pas de `requireNavPermission` scopé à un clan) — cohérent avec la décision "comparaison publique côté site".
- [ ] Vérifier en base que le prochain passage du cron `daily_stats_recalc` peuple bien `ClanComparatorCache` pour les clans actifs (aucun backfill manuel déclenché à l'implémentation).

### 1. L'Activité et le Rythme de jeu (Le "Pouls") — ✅ Complété le 2026-08-10 (hors heatmap horaire)
- [x] **Indice de Synergie :** Répartition des tailles de squad par clan (solo/duo/trio/squad) dans `ClanComparatorPayload.pulse.squadSizeDistribution`, dérivé du nombre de `SquadMember` par `squadMatchId` appartenant au clan.
- [x] **Taux de participation (Roster Health) :** `pulse.rosterHealth` — membres actifs ayant joué / effectif total, filtré `isActive: true, joinStatus: 'active'` (isolation stricte, cf. `tracked-isolation.test.ts`).
- [x] **Régularité :** `pulse.dailyMatchCounts` (matchs par jour sur la période) et `pulse.activityByDayHour` (grille 7×24 jour/heure), affichés sous forme de compteurs sur la page — pas encore de heatmap visuelle superposée entre clans.
- [ ] **Heatmap d'activité comparée :** `activityByDayHour` est déjà calculé et mis en cache, mais la page ne l'affiche pas encore visuellement (juxtaposition Night Owls vs Weekend warriors) — reste à construire le composant de visualisation.
  - [ ] **Design Visuel attractif :** Concevoir une matrice style "Punchcard" (Github contribution graph). Si on compare 2 clans, utiliser des couleurs distinctes avec un mode de fusion (`mix-blend-mode: screen` ou `multiply`) pour mettre en évidence les heures de forte collision d'activité, ou une vue côte-à-côte avec des tooltips riches montrant le pourcentage d'activité.

### 2. Le Style de jeu (L'ADN) — ✅ Complété le 2026-08-10
- [x] **Indice de "Hot Drop" :** `dna.hotDropSharePercent`/`hotDropCount`/`dropCount`, calculé directement sur `DropPressureStat.pressureLevel` (`hot`/`very_hot`) avec filtre d'isolation `member.isActive/joinStatus` — **ne pas réutiliser `getDropPressureDashboardStats` telle quelle**, elle ne filtre pas par `joinStatus` et fait fuiter les membres en simple watchlist dans les stats d'un clan (bug trouvé et corrigé pendant l'implémentation, cf. `src/lib/clan-comparator-service.ts`).
- [x] **Agressivité vs Survie :** `dna.avgDamagePerMatch`/`avgKillsPerMatch` vs `dna.avgTimeSurvivedSeconds`, affichés en cartes par clan (pas encore en nuage de points).
- [x] **Altruisme (Teamplay) :** `dna.teamplayRatio` = `revivesGiven` / `knockoutsTaken`, où `knockoutsTaken` vient de `PositionMetricCell` (`metric: 'knockout_taken'`) et non de `KillEvent`, qui ne journalise que les kills (pas les KO) — même piège d'isolation que le Hot Drop, filtré via la relation `member`.

### 3. Les Performances Globales — ✅ Complété le 2026-08-10
- [x] **Winrate et Top 10 Rate :** `performance.winRate`/`top10Rate`, calculés depuis `SquadMatch.placement` (placement = 1 pour winrate, ≤ 10 pour Top 10) sur les matchs du clan dans la période.
- [x] **Dégâts moyens / Kills moyens :** `performance.avgDamagePerMatch`/`avgKillsPerMatch`, calculés directement depuis `SquadMember` sur la période (pas depuis `PlayerStats`, pour rester cohérent avec le filtrage d'isolation watchlist déjà appliqué au reste du payload).
- [x] **Performances par mode (ajout demandé le 2026-08-10) :** `pulse.modePerformance` (duo/trio/squad : matchs, victoires, winrate, kills), affiché sur la page comparateur avec `TeamModeBadge` — permet de voir si un clan joue surtout ensemble (squad complète) ou en petits groupes ad hoc.
  - **Bug corrigé (même jour) :** la taille d'équipe était calculée en filtrant les `SquadMember` sur `joinStatus: 'active'`, comme le reste du payload par souci d'isolation — mais un vrai squad de 4 avec 3 coéquipiers seulement `tracked` (auto-détectés, pas administrativement actifs) se retrouvait compté comme "solo" et disparaissait du tableau duo/trio/squad. Repéré sur FR-Alliance-BE : 42 matchs joués au total, 0 comptés en duo/trio/squad avant correctif. Fix : la taille d'équipe utilise désormais la composition réelle du squad (tous les membres du clan présents, `isActive: true`, peu importe `joinStatus`), tandis que l'agrégation des stats individuelles (kills/dégâts/revives) reste filtrée sur `joinStatus: 'active'` pour préserver l'isolation watchlist sur les chiffres attribués au clan.

### 4. Le Head-to-Head (Le "Derby") — ✅ Complété le 2026-08-10
- [x] **Détection des matchs communs :** `src/lib/head-to-head-service.ts`, `getHeadToHeadStats(clanIdA, clanIdB)` — `SquadMatch` où au moins un `SquadMember` actif appartient à chacun des deux clans.
- [x] **Tableau de Rivalité :** `KillEvent` filtré sur `killerMember`/`victimMember` résolus vers les deux clans (isolation `isActive`/`joinStatus` appliquée aussi ici) — compte `killsAOnB`/`killsBOnA`.
- [x] **Bilan de confrontation :** Le vainqueur d'un match commun se lit sur le **meilleur `SquadMember.placement` par clan**, pas sur `SquadMatch.placement` — un même `SquadMatch` (clé `pubgMatchId` globalement unique) peut représenter deux équipes réelles différentes si les deux clans étaient dans le même lobby sans être dans la même squad PUBG.
- [x] Le cas "aucun match commun" est géré explicitement dans l'UI (message dédié plutôt qu'un tableau vide).
- [x] Intégré à `GET /api/clans/comparator` (calculé à la demande pour chaque paire de clans sélectionnés, pas mis en cache comme les sections 1-3 — volume de paires trop faible pour justifier un cache dédié) et à la page comparateur.
- [ ] Le Head-to-Head est calculé toutes périodes confondues, indépendamment du filtre Semaine/Mois/Tous de la page — à réévaluer si le volume de confrontations augmente.

#### Bug structurel découvert et corrigé (même jour) — pipeline de sync ne partageait jamais un match entre deux clans

En vérifiant pourquoi aucune des 7 clans suivis n'avait le moindre match commun (constaté par l'utilisateur), investigation plus profonde que prévu : `analyzeMatchForSquads` (`src/lib/squad-detector.ts`) ne résolvait que les membres du clan dont c'était le job de sync, et — plus grave — quand un `SquadMatch` existait déjà pour un `pubgMatchId` (créé par un premier clan), la fonction **retournait l'existant sans jamais y attacher les membres d'un second clan**. Sur les 3031 `SquadMatch` en base au moment de l'investigation, aucun n'avait de membres de plus d'un `clanId` — le Head-to-Head était donc structurellement mort avant même d'être écrit.

- [x] `analyzeMatchForSquads` détecte désormais le squad du clan appelant même si le `SquadMatch` existe déjà, et attache les `SquadMember` manquants pour ce clan (fonction de détection extraite en `detectSquadFromMatchDetails`, réutilisée dans les deux branches).
- [x] **Risque identifié avant d'implémenter** : les colonnes dénormalisées `SquadMatch.totalKills/totalDamage/totalAssists/totalRevives` (calculées par `calculateSquadStats`, qui somme tous les `SquadMember` attachés) sont lues directement par plusieurs consommateurs comme "les stats de MON clan sur ce match" — attacher un second clan sans corriger ces consommateurs aurait fait fuiter les stats d'un clan vers l'autre sur les matchs partagés.
- [x] Décision : ne plus jamais recalculer ces colonnes lors de l'attache d'un second clan (elles restent celles du premier clan créateur, désormais considérées obsolètes/non fiables) — **4 fichiers consommateurs audités et corrigés pour recalculer depuis les `SquadMember` filtrés par clan plutôt que de faire confiance aux colonnes du `SquadMatch`** :
  - `src/lib/squad-detector.ts` — `getClanSquadMatches` filtre désormais `members` par `clanId` ; `findBestSquads`/`getSquadWinRates`/`getClanSquadAnalysis` recalculent via le nouvel helper `sumClanMemberTotals`.
  - `src/lib/matches-cache-service.ts` — cache Overview, même traitement.
  - `src/app/api/clans/[clanId]/matches/route.ts` — page Matchs en direct (mode de jeu, sessions, synergies duo/squad, top performers) — le plus gros fichier touché.
  - `src/lib/report-generator.ts` — rapports hebdo/mensuels (timeline, totaux).
- [x] Validé par une simulation contrôlée : insertion temporaire d'un `SquadMember` d'un second clan sur un `SquadMatch` réel existant → Head-to-Head détecte bien le match commun avec le bon vainqueur (meilleur placement), les stats des deux clans restent isolées (aucune fuite croisée vérifiée par requête), les caches se recalculent sans erreur — puis suppression de la ligne de test et re-vérification du retour à l'état initial.
- [ ] Pas de test automatisé couvrant ce scénario (match partagé entre deux clans) — à ajouter, notamment un test d'intégration sur `analyzeMatchForSquads` avec un `pubgMatchId` déjà existant.
- [ ] Le prochain vrai match partagé entre deux clans suivis (détecté par le cron/worker en conditions réelles, pas simulé) n'a pas encore été observé — à vérifier dès qu'il se présente que la détection fonctionne aussi via le pipeline de sync complet, pas seulement via l'insertion directe testée ici.

**Tentative de vérification en conditions réelles (2026-08-10) :** repéré via `EncounteredPlayer` (page "Adversaires") que Serejaah (clan BEE, memberId 19) et des membres de D32 se sont croisés 23 fois — **toujours comme coéquipiers, jamais comme adversaires** (`teammateEncounterCount: 23` = `encounterCount`). Les 2 lignes "Tué par le clan" affichées sur cette page sont donc probablement des team kills accidentels, pas des kills d'opposant. Tentative de rejouer ces 2 matchs (30 mai et 13 juin) via `fetchMatchDetails` pour vérifier l'attache réelle : **échec 404, l'API PUBG ne conserve les détails d'un match qu'environ 14 jours** — ces matchs sont définitivement inaccessibles côté PUBG, aucun moyen de les backfiller rétroactivement. Limite structurelle à retenir : le Head-to-Head et l'attache cross-clan ne peuvent couvrir que les matchs encore disponibles côté PUBG au moment où le second clan les synchronise pour la première fois (~14 jours), jamais l'historique complet.

#### Bug structurel n°2 découvert en creusant le premier — `KillEvent` avait exactement le même défaut

Question de l'utilisateur : "y a-t-il des matchs partagés parmi les 3031, je suppose que oui si un clan a tué un membre ?" — vérification : **0 des 91 `KillEvent` ayant killer et victim résolus ne sont cross-clan**, confirmant qu'aucun kill entre deux clans suivis n'a jamais été enregistré. Cause : `persistKillEventsForMatch`/`buildKillEventRows` (`src/lib/kill-event-persistence.ts`) dérivaient un unique `clanId` depuis le premier clan trouvé sur le `SquadMatch`, puis ne résolvaient `killerMemberId`/`victimMemberId` que contre le roster de CE seul clan — un kill entre deux clans suivis n'aurait donc jamais résolu les deux côtés, même après le fix d'`analyzeMatchForSquads` ci-dessus (qui attache désormais les `SquadMember`, mais `KillEvent` est peuplé par un pipeline séparé).

- [x] `persistKillEventsForMatch` résout désormais les rosters de **tous** les clans présents sur le match (`clanId: { in: clanIds } }`), plus seulement le premier.
- [x] `buildKillEventRows` résout `killerMemberId`/`victimMemberId` contre l'ensemble de ces rosters — un kill cross-clan résout maintenant les deux côtés.
- [x] `KillEvent.clanId` (colonne unique par ligne, utilisée par `encountered-players/route.ts` pour un usage mono-clan légitime — kills contre des adversaires non résolus) prend désormais le clan du killer si résolu, sinon celui de la victime, sinon le clan "principal" du match (comportement identique à avant sur les 99% de matchs mono-clan). Ce choix ne casse aucun consommateur existant : `head-to-head-service.ts` ne filtre jamais par `KillEvent.clanId`, et `nemesis/route.ts` filtre par `killerMemberId`/`victimMemberId` directement, pas par `clanId`.
- [x] Validé par deux tests unitaires directs sur `buildKillEventRows` (fonction pure) : un kill cross-clan résout bien les deux `memberId` avec `clanId` = clan du killer ; le cas nominal mono-clan (kill contre un adversaire non résolu) reste inchangé.
- [ ] Comme pour le bug n°1, pas encore observé en conditions réelles via le pipeline de sync complet (worker/cron) — seulement validé par simulation directe des fonctions pures et de la base.

### 5. UI/UX et Tests — 🚧 Base fonctionnelle livrée le 2026-08-10
- [x] Créer la page `src/app/clans/comparator/page.tsx` (`'use client'`, contenu dans un `<Suspense>` car elle lit `useSearchParams`), hors du préfixe `/clans/[clanId]/` puisqu'elle porte sur plusieurs clans — structure `.app-container`/`.app-main` standard, sans `ClanSectionNav`.
- [x] **Interface de sélection :** Sélecteur multi-clans en pills (jusqu'à 3), période via `SegmentedControl` (Semaine/Mois/Tous), sélection persistée en query string (`?clanIds=1,3&period=month`) pour permettre le partage d'un lien de comparaison.
- [x] **Visualisation "Radar Chart" :** `src/components/comparator/ClanComparatorRadar.tsx`, 5 axes normalisés (Agressivité, Survie, Teamplay, Activité, Winrate) sur jusqu'à 3 clans. Utilise directement les slots 1-3 du thème catégoriel du projet (`references/palette.md` du skill `dataviz` : bleu/orange/aqua, déjà validés all-pairs CVD en clair et sombre pour 3 séries) — pas de nouvelle validation de palette nécessaire tant que le plafond reste à 3 clans.
- [x] Entrée de navigation ajoutée (`primary.comparator`, `/clans/comparator`) dans la sidebar principale, seedée en DB (`NavItem`) et dans le fallback `nav-permissions-registry.ts`.
- [x] **Performances par mode :** cartes `TeamModeBadge` par clan (duo/trio/squad), même style que le panneau existant sur `/clans/[clanId]/overview`.
- [x] **Head-to-Head :** section dédiée avec confrontations par paire de clans sélectionnés, message explicite si aucun match commun.
- [x] Cache `ClanComparatorCache` peuplé manuellement pour les 7 clans actifs le 2026-08-10 (le cron nocturne `daily_stats_recalc` le repeuplera automatiquement ensuite) — les données radar/tableaux n'étaient pas visibles avant ce peuplement initial car la page ne calcule jamais à la volée.
- [ ] **Heatmap d'activité comparée** (section 1) : `pulse.activityByDayHour` est disponible mais pas encore visualisé.
- [ ] **Tests Unitaires (Services d'agrégation) :** Aucun test automatisé sur `clan-comparator-service.ts`/`head-to-head-service.ts` pour l'instant — validé manuellement par exécution directe sur les données réelles des 7 clans (a révélé et permis de corriger le bug d'isolation watchlist ci-dessus). À couvrir : Synergie, Roster Health, Hot Drop, Teamplay, isolation `joinStatus`, détection de matchs communs, calcul du vainqueur par meilleur placement.
- [ ] **Tests de Composants (UI) :** Pas de test automatisé sur la page/le radar — à couvrir : données vides, un seul clan sélectionné, clan sans télémétrie parsée, aucun match commun.
- [ ] Vérifier dans le navigateur (session authentifiée) les rendus desktop/mobile et les thèmes clair/sombre — non fait dans cette session (pas d'accès à une session de test ; seule la résolution de route a été vérifiée via `curl`, qui redirige correctement vers `/login` sans authentification).

**Décisions (2026-08-10) :**
- Périmètre clans : uniquement les clans actifs gérés sur le site (`joinStatus: 'active'`) — les clans en simple watchlist (`joinStatus: 'tracked'`) sont exclus du sélecteur, cohérent avec l'isolation déjà appliquée ailleurs (`tracked-isolation.test.ts`).
- Visibilité : le comparateur est exposé dans la navigation principale dès la V1, pas de phase de rodage en accès direct uniquement — prévoir l'entrée correspondante dans le composant de nav (`NavItem` / menu principal) dès l'implémentation de la page.

### 6. Nouvelles Statistiques Avancées (Télémétrie) — ⚠️ Implémenté le 2026-08-14, avec un écart de schéma trouvé le 2026-08-30 (voir ci-dessous)
- [x] **Traquer le "Recall" (Respawn) :** Ajouter la comptabilisation des utilisations du système de rappel de PUBG.
  - [~] **Base de données :** colonne `recallCount` (Int, default 0) — **correction du 2026-08-30 : présente uniquement sur `ClanSynergyTelemetryStats` (`prisma/schema.prisma`), absente de `MemberTelemetryStats` et du modèle `MemberMatchTelemetry` (qui n'existe pas — seul `SquadMatchTelemetry` existe, sans colonne `recallCount`, uniquement des blobs JSON)**. Cette case avait été cochée à tort ; le recall n'est agrégé qu'au niveau paire (`PairSynergyAggregate`), jamais par membre.
  - [x] **Parser (Backend) :** Analyser les événements correspondants (ex: `LogPlayerUseRespawn` ou items Blue Chip) dans `src/lib/pubg-telemetry/parser.ts` et incrémenter les `recallCount`. Mettre à jour l'agrégation dans `period-aggregates.ts`.
  - [x] **API :** Exposer `recallCount` dans la route `/api/clans/[clanId]/telemetry/synergies`.
  - [x] **UI (Frontend) :** Ajouter une colonne/carte "Top Recalls" dans le composant `SquadSynergies.tsx` avec une image dédiée et un badge (comme pour "Top Sauvetages").
  - [x] **Tests :** 
    - [x] Ajouter des données de test mockées dans `parser.test.ts` contenant un événement Recall.
    - [x] Exécuter la suite complète de tests Vitest.
    - [x] Vérifier sur la page d'overview que la carte s'affiche et affiche des données après l'analyse d'un match (manuel ou cron).

---

## Idées — Tournois entre clans

**Pourquoi c'est utile :** permettre à l'admin d'un clan suivi de déclarer un tournoi (règles, fenêtre de dates, clans participants) sans aucune préinscription joueur — l'app détecte elle-même les matchs du tournoi et calcule le classement selon le barème défini, affiché sur une page dédiée. Réflexion menée le 2026-08-29, convergée en plan concret ci-dessous.

### État réel — largement implémenté le 2026-08-30, bugs constatés à corriger

Le plan ci-dessous a été en grande partie codé entre le 2026-08-29 et le 2026-08-30 (commits `1aceb73`, `b26458d`, `860aaf5`, `539415f`, `5038da3`, `76ebe3d`), y compris la Phase 0 (découverte des matchs `custom`, avec commentaires citant explicitement cette section du todo). Vérifié le 2026-08-30 par relecture complète du code — **la Phase 0 est correcte, mais un bug de fond touche le filtrage par clan participant.**

**Ce qui fonctionne, vérifié :**
- [x] Schéma Prisma `Tournament`/`TournamentClan` (migration `20260830120000_add_tournament`).
- [x] Phase 0 : `fetchAllRecentMatchIds` (`src/lib/pubg.ts`) interroge `GET /players/{id}` en complément de `fetchRecentMatchIds`, fusionné et dédupliqué dans `sync-matches/route.ts` — corrige bien le gap identifié (0 match `custom` en base avant ce correctif). Testé (`pubg-tournament-match-discovery.test.ts`, mock propre du endpoint et de la déduplication).
- [x] Permission : `manage_settings` utilisée partout (pas de `manage_tournaments` inventée) — conforme à la correction actée.
- [x] Moteur de barème (`computeTournamentStandings`, `groupMatchIntoTeams`, `normalizeTournamentRules`) — 3 tests Vitest solides (placement + kills + bonus victoire + `bestOfRounds`), logique relue et correcte.
- [x] Pages : `/clans/[clanId]/settings/tournaments` (création/gestion), `/clans/[clanId]/tournaments[/[tournamentId]]`, `/tournaments[/[tournamentId]]` (variante top-level), sous-page détail télémétrie d'un match de tournoi.
- **Décision produit différente de ce qui avait été discuté le 2026-08-29** : pas de sélection manuelle des clans participants par l'organisateur — l'UI l'indique explicitement ("Les clans et joueurs suivis présents dans les matchs récupérés seront détectés automatiquement", `settings/tournaments/page.tsx:461`). Le modèle `TournamentClan`, la relation `Tournament.clans` et le champ `participantClanIds` (type + parsing dans la route POST) existent mais **ne sont jamais écrits** (`createTournament`/`updateTournament` les ignorent) — code mort, pas un choix assumé documenté comme tel.

**Principe produit confirmé (2026-08-30) :** l'admin du clan organisateur est celui qui crée/lance la partie perso dans le jeu — il est donc présent dans chaque match du tournoi. C'est pourquoi la synchro ne cible que son compte (pas tout le roster) : il suffit à découvrir tous les matchs. Le détail PUBG du match révèle ensuite tous les joueurs présents (tous clans confondus), et n'importe quel joueur d'un clan suivi qui y figure marque des points pour son clan — pas de présélection de clans participants, l'auto-détection est voulue. Ce principe **corrige deux entrées de la liste de bugs ci-dessous** (retirées, comportement confirmé correct) et **précise le correctif du bug n°1**.

**Bugs constatés :**

1. ~~`getTournamentMatches` ne réapplique pas le filtre "clan organisateur présent"~~ — **✅ Corrigé le 2026-08-30.** Ajouté `clanId: tournament.organizerClanId` au filtre `members.some.member` de `getTournamentMatches` (`src/lib/tournament-service.ts`), aligné sur `materializeTournamentCustomMatches` — un membre du clan organisateur doit désormais être présent dans le match pour qu'il compte, tout en gardant l'inclusion ouverte à tous les clans suivis pour l'attribution des points. Empêche la contamination entre tournois/scrims non liés tombant dans la même fenêtre de dates/mode.
2. ~~`TournamentClan`/`participantClanIds` est du code mort~~ — **✅ Supprimé le 2026-08-30.** Modèle `TournamentClan`, relation `Tournament.clans`/`Clan.tournamentEntries`, type `TournamentCreateInput.participantClanIds`, parsing dans les 2 routes POST/PATCH, et tous les usages front (`tournament.clans` dans les 3 pages) retirés. Migration `20260830200000_remove_tournament_clan` (table vérifiée vide avant suppression) appliquée en prod. Les pages affichent désormais le nombre de clans réellement auto-détecté (`participantClanIds` retourné par les routes standings) plutôt qu'un compteur toujours faux (`clans.length + 1` valait toujours `1`).
3. ~~`materializeTournamentCustomMatches` scopé au clan organisateur~~ — **retiré, comportement correct par conception** (conforme au principe confirmé le 2026-08-30).
4. ~~Le bouton de sync ne synchronise que l'admin qui clique~~ — **retiré, comportement correct par conception** (l'admin héberge chaque match, synchroniser son seul compte suffit).
5. **[Faible, non corrigé] `GET /api/tournaments/[tournamentId]/standings` n'a aucun contrôle de permission** (pas d'appel `requireNavPermission`/`requirePermission`) — accessible sans authentification, contrairement au reste du site.

**Vérifié après correctif (2026-08-30) :** `npx vitest run` sur les 2 suites tournois (7/7 tests OK), `tsc --noEmit` et `eslint` propres sur tous les fichiers touchés (schéma, `tournament-service.ts`, 5 routes API, 3 pages). Migration appliquée via `prisma migrate deploy`. Régénération du client Prisma (`npx prisma generate`) en attente — bloquée par le verrou Windows connu sur le moteur de requête tant que le serveur `npm run dev` tourne (cf. gotcha CLAUDE.md) ; à relancer une fois le serveur arrêté.

**Non vérifié dans cette passe (à faire) :** rendu navigateur (clair/sombre, mobile), fenêtre de rotation réelle de la relation `matches` de l'endpoint de base PUBG, budget rate-limit en conditions réelles, filtrage `matchType` sur `/clans/[clanId]/matches` (le point relevé en Phase 0 sur l'effet de bord liste générale).

### Constat de départ — un signal déjà en base et jamais exploité

| Élément | État actuel |
|---|---|
| `matchType` du match PUBG (`official`/`custom`/…) | Le champ est capturé et stocké dès l'ingestion (`src/lib/pubg.ts:1212`, `Match.matchType`/`SquadMatch.matchType`), et bien filtré en dur sur `'official'` par tous les consommateurs actuels (`squad-detector.ts:164`, `stats-calculator.ts:76`, `clan-comparator-service.ts:123`) — **mais l'hypothèse initiale que les matchs `custom` étaient "déjà en base, juste filtrés en aval" était fausse, vérifiée et corrigée le 2026-08-29 (voir "Prérequis bloquant" ci-dessous) : zéro match `custom` n'existe en base sur 21 377 matchs en prod.** Le signal reste valide une fois le pipeline de découverte de matchs corrigé. |
| Regroupement "qui a joué avec qui" | `detectSquadFromMatchDetails` (`squad-detector.ts:263`) détecte déjà les squads d'un clan présents dans un match/roster — réutilisable tel quel pour identifier les équipes d'un tournoi. |
| Matchs partagés entre plusieurs clans suivis | Déjà géré depuis le correctif documenté dans "Idées — Comparateur de Clans" §4 : un même `SquadMatch` (`pubgMatchId` globalement unique) peut porter des `SquadMember` de plusieurs clans, et `head-to-head-service.ts` sait déjà déterminer "qui a fini devant qui" sur un match commun via le meilleur `SquadMember.placement` par clan. Directement réutilisable pour un tournoi multi-clans. |
| Modèle d'événement clan avec règles configurables | `Challenge` (`prisma/schema.prisma:972`) est le précédent le plus proche : `title`/`description`, `startDate`/`endDate`, `criteria: Json`, `rewards: Json`, `status`. Le modèle `Tournament` proposé ci-dessous en reprend directement la forme. |
| Clans multi-trackés | Le flux `opponents → clan tracké` en cours de construction (`src/app/api/settings/clans/route.ts`) permet de transformer un clan adverse croisé en clan pleinement suivi (roster `ClanMember` complet) — un tournoi entre plusieurs clans trackés est donc atteignable sans nouveau modèle de joueur. |
| Fenêtre de disponibilité des matchs côté PUBG | ~14 jours après la partie (limite déjà documentée dans "Idées — Comparateur de Clans" §4, bug structurel n°1) — un tournoi déclaré sur des matchs plus anciens que ça ne peut pas être backfillé si aucun clan participant ne les a encore synchronisés à ce moment-là. |

### Décisions actées (2026-08-29)

| Question | Décision |
|---|---|
| Portée "joueurs de clans ou non" | **Multi-clans trackés uniquement** — un tournoi réunit un ou plusieurs clans déjà suivis par l'app (dont l'organisateur). Un joueur totalement hors plateforme ne peut pas participer en V1. Aucun nouveau modèle de joueur nécessaire. |
| Sélection des matchs du tournoi | **100 % automatique** — tout match `matchType: 'custom'` d'un clan participant dans la fenêtre `[startDate, endDate]` (+ filtres optionnels `gameMode`/`mapName`) compte pour le tournoi, sans validation manuelle par l'admin. Limite acceptée : un scrim hors-tournoi du même clan pendant la fenêtre sera compté aussi ; les filtres `gameMode`/`mapName` atténuent le risque sans l'éliminer. |
| Barème de classement | **Configurable simple** (JSON), pas de moteur de règles/formule libre — points par placement, points par kill, bonus victoire, nombre de manches comptabilisées. |

### Point ouvert — granularité du classement (proposition par défaut, à valider à l'implémentation)

Un tournoi communautaire classe généralement des **équipes** (squads), pas des clans entiers — un même clan peut aligner plusieurs squads. Proposition : classement principal **par équipe**, où une équipe = l'ensemble trié des `memberId` présents ensemble dans un match donné (même clé que `buildSquadKey` dans `squad-detector.ts:130`), avec une vue secondaire "cumul par clan" dérivée du même calcul. **Limite acceptée** : si la composition d'une équipe change d'une manche à l'autre (remplaçant), ses points se répartissent sur deux lignes d'équipe distinctes plutôt que de fusionner — cohérent avec l'absence de préinscription (aucune "identité d'équipe" déclarée à l'avance à laquelle rattacher un changement de composition).

### 0. Prérequis bloquant — le pipeline actuel ne capture aucun match `custom` ⚠️ vérifié le 2026-08-29 — ✅ Fix déployé le 2026-08-30 (points de vigilance ci-dessous restent ouverts)

**Constat empirique (requête directe en prod, `smk.arkium.group`) :** sur **21 377 lignes `Match`**, la distribution de `matchType` est `official: 21188`, `airoyale: 188`, `casual: 1` — **`custom` : 0**. Idem sur `SquadMatch` (`official: 5364`, `airoyale: 16`, `custom: 0`). Le postulat initial du plan ("les matchs custom sont déjà en base, juste filtrés en aval") était donc faux.

**Cause identifiée :** `fetchRecentMatchIds` (`src/lib/pubg.ts:683`), seule fonction de découverte de matchs utilisée par le sync (`src/app/api/clans/[clanId]/sync-matches/route.ts:132` et `src/app/api/members/[id]/matches/route.ts:237`), interroge `GET /shards/{shard}/players/{playerId}/seasons/lifetime`. Vérifié par appel direct à l'API PUBG en conditions réelles sur un membre tracké actif (`pagiotte`) : cet endpoint ne référence les matchs QUE via des relations groupées par mode de matchmaking classé (`matchesSolo`, `matchesSoloFPP`, `matchesDuo`, `matchesDuoFPP`, `matchesSquad`, `matchesSquadFPP`) — **32 matchs uniques**, tous de type `official`/`airoyale`. Le endpoint de base `GET /shards/{shard}/players/{playerId}` (relation `matches`, sans distinction de mode) référence lui **96 matchs** pour le même joueur sur la même fenêtre — **64 de plus**, absents de `seasons/lifetime`. Détail vérifié sur l'un de ces 64 : `matchType: 'custom'`, joué le jour même (`2026-08-29T14:50:03Z`) — confirme qu'un membre tracké joue déjà des parties perso aujourd'hui, invisibles du site.

- [x] Ajouter une fonction de découverte de matchs élargie (`fetchAllRecentMatchIds`, `src/lib/pubg.ts`) interrogeant `GET /shards/{shard}/players/{playerId}` (relation `matches`) en complément de `fetchRecentMatchIds` — **implémenté le 2026-08-30**, sans modifier `fetchRecentMatchIds` en place (fonction dédiée, nouveau champ optionnel `relationships.matches` ajouté à `PubgPlayerDetailResponse`). Testé via `src/lib/pubg-tournament-match-discovery.test.ts` (mock `enqueuePubgApiRequestWithMetadata`, comme `pubg-context-forwarding.test.ts`) : extraction/dédup depuis `relationships.matches.data`, tableau vide si absent, transmission `clanId`/`memberId` à la queue. **Câblé uniquement sur `sync-matches/route.ts`** (le pipeline qui alimente `Match`/`SquadMatch`, seul consommateur pertinent pour les tournois) — `members/[id]/matches/route.ts` (aperçu manuel, hors scope) non touché.
- [x] Fusionner/dédupliquer les IDs des deux sources avant le `filter` sur les matchs déjà importés (`sync-matches/route.ts`) — **fait le 2026-08-30** : `Array.from(new Set([...seasonMatchIds, ...allTimeMatchIds]))`, les deux appels lancés en parallèle (`Promise.all`) dans le même bloc `try/catch` existant, testé unitairement (dédup sur IDs qui se recoupent).
- [x] **Validé en conditions réelles le 2026-08-30** : après un premier passage de sync, le match custom de pagiotte du 29/08 (`Desert_Main`/Miramar, placement #6, `26a0fe46-...`) apparaît bien persisté dans `Match` avec `matchType: 'custom'` et s'affiche correctement sur `/members/[id]/matches` (badge "Custom" + mode "Solo"/`normal-squad`) — bout en bout découverte → import → affichage confirmé sur un vrai match, pas seulement en simulation API.
- [ ] **Fenêtre de rotation de la relation `matches` du endpoint de base — à mesurer, pas supposée.** 96 matchs référencés pour un seul joueur sur une fenêtre non caractérisée : si un joueur très actif fait tourner cette liste en quelques jours, le cron `CLAN_MATCH_SYNC_CRON` (`0 2,17 * * *`, 2 passages/jour, cf. `.env`) doit rester assez fréquent pour ne rater aucun match custom avant qu'il ne sorte de la fenêtre — vérifier sur plusieurs profils avant de valider que 2 syncs/jour suffisent pendant un tournoi actif. **Non vérifiable dans cette session** (pas d'accès API PUBG live ni base de prod en conditions réelles) — à observer une fois le fix Phase 0 déployé.
- [x] **Bonne nouvelle vérifiée :** le scoring (placement + kills, phase 3) ne dépend que de `analyzeMatchForSquads` (`sync-matches/route.ts:206`), lui-même alimenté par `fetchMatchDetails` (détail de match, pas de télémétrie CDN) — **aucune dépendance sur le worker télémétrie** (`TelemetryResyncJob`, parsing CDN, risque `Readable.toWeb()`). Un match custom peut donc apparaître dans le classement du tournoi dès le prochain sync clan, sans attendre le pipeline télémétrie complet.
- [x] **Effet de bord tranché le 2026-08-30 — aucune action requise sur `/clans/[clanId]/matches`.** Décision : les tournois ne comptabilisent que les matchs `custom` en **duo/trio/squad** (jamais en solo) — le mode d'équipe (`TeamModeBadge` déjà affiché sur cette page) suffit à distinguer contextuellement un match de tournoi/scrim d'un match classé solo, sans avoir besoin d'un badge `matchType` dédié. Aucun filtre `official` à ajouter non plus à cette page — elle continue d'afficher tous les matchs du clan, classiques et custom confondus, comme avant. Cette restriction duo/trio/squad sera appliquée directement dans le moteur d'attribution (`getTournamentMatches`, Phase 2) plutôt que sur l'affichage.
- [x] **Budget de rate-limit à chiffrer** — confirmé : l'élargissement double bien le nombre d'appels API par membre et par cycle de sync (`fetchRecentMatchIds` + `fetchAllRecentMatchIds`, lancés en `Promise.all` donc consommant 2 slots de la queue partagée au lieu d'1) — déployé tel quel le 2026-08-30, `AppConfig.pubg_api_rate_limit_rpm` (10 RPM par défaut) reste le seul régulateur ; aucun mécanisme de dégradation automatique ajouté. **À surveiller** sur `/settings/pubg-api` (panneau "Répartition par clan") après activation en conditions réelles.
- [x] **Synchronisation manuelle d'un tournoi actif** — livrée le 2026-08-30 : l'admin organisateur participant déclenche une récupération directe depuis PUBG avec son seul compte. Ses matchs custom récents sont importés, le détail de chaque match est lu une fois, les joueurs actifs des clans suivis sont détectés automatiquement dans les rosters, puis la télémétrie est mise en file. Le worker déclenche le recalcul d'agrégats après import. Aucun cron ni pré-inscription de clan/joueur n'est requis.

### 1. Fondations — modèle de données & migration — ✅ Livré le 2026-08-30

#### Navigation globale de tournois — ✅ Livré le 2026-08-30 (addition 2026-08-30)

- [x] Ajouter `primary.tournaments` au registre de permissions (`src/lib/nav-permissions-registry.ts`) : `hrefTemplate: '/tournaments'` (site-global, pas clan-scoped).
- [x] Créer page globale `/tournaments` (`src/app/tournaments/page.tsx`) — affiche tous les tournois de tous les clans, avec organizer, status, dates, clans participants.
- [x] Créer API globale `GET /api/tournaments` (`src/app/api/tournaments/route.ts`) — retourne tous les tournois, triés par statut puis date.
- [x] Mettre à jour navigation primaire (`src/components/ClanNavigation.tsx`) : `primary.tournaments` → `/tournaments`.
- [x] Reseed NavItem DB : `npx tsx prisma/seed-nav-items.ts` (55 entrées, incluant `primary.tournaments`).
- [x] Tests tournament-service : **3/3 passing** ✓

- [x] Ajouter au schéma Prisma :
  ```prisma
  model Tournament {
    id              String   @id @default(cuid())
    organizerClanId Int
    organizerClan   Clan     @relation("TournamentOrganizer", fields: [organizerClanId], references: [id], onDelete: Cascade)

    title       String
    description String?

    startDate DateTime
    endDate   DateTime

    gameMode String?   // filtre optionnel : squad-fpp, duo-fpp, solo-fpp… — null = tous modes
    mapName  String?   // filtre optionnel — null = toutes cartes

    rules  Json      // barème : placementPoints, killPoints, winBonus, bestOfRounds
    status String    @default("draft") // draft | active | finished

    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt

    clans TournamentClan[]

    @@index([organizerClanId, status])
    @@map("Tournament")
  }

  model TournamentClan {
    id           String     @id @default(cuid())
    tournamentId String
    tournament   Tournament @relation(fields: [tournamentId], references: [id], onDelete: Cascade)
    clanId       Int
    clan         Clan       @relation("TournamentParticipant", fields: [clanId], references: [id], onDelete: Cascade)

    @@unique([tournamentId, clanId])
    @@map("TournamentClan")
  }
  ```
- [x] Ajouter les relations inverses sur `Clan` (`organizedTournaments Tournament[] @relation("TournamentOrganizer")`, `tournamentEntries TournamentClan[] @relation("TournamentParticipant")`).
- [x] Définir la forme exacte de `rules` (JSON) : `{ "placementPoints": { "1": 15, "2": 12, "3": 10, "4": 8, "5": 6, "6": 4, "7": 2, "8": 1, "9": 1, "10": 1 }, "killPoints": 1, "winBonus": 5, "bestOfRounds": null }` — `bestOfRounds: null` = toutes les manches comptent, sinon on ne garde que les N meilleures par équipe. **Retenue telle quelle** (documentée sur le champ `Json` non typé Prisma, validée côté API à la phase 4).
- [x] Créer et appliquer la migration Prisma (additive, sans toucher aux tables existantes) — `prisma/migrations/20260830120000_add_tournament/migration.sql`, appliquée sur `smk.arkium.group` via `prisma db execute` + `prisma migrate resolve --applied` (même pattern que `ClanComparatorCache`/`ClanMatchesCache`), `npx prisma migrate status` confirme "Database schema is up to date!" après coup.
- [x] `npx prisma generate` après migration.

### 2. Moteur d'attribution des matchs (backend) — ✅ Livré le 2026-08-30

- [x] Créer `src/lib/tournament-service.ts`.
- [x] `getTournamentMatches(tournamentId)` : requête `SquadMatch` avec `matchType: 'custom'`, `createdAt` dans `[startDate, endDate]`, filtres `gameMode`/`mapName` si définis et membres actifs appartenant à un clan suivi actif. Les clans pris en compte sont découverts depuis les rosters, sans inscription préalable.
- [x] `groupMatchIntoTeams(squadMatch, trackedClanIds)` : regroupe les `SquadMember` des clans suivis détectés par clé d'équipe (`buildSquadKey`, memberIds triés).
- [x] Gérer le cas multi-clans dans un même match : réutiliser le principe déjà validé par `head-to-head-service.ts` (comparaison par meilleur placement d'équipe/clan sur un `SquadMatch` partagé), pas `SquadMatch.placement` brut qui ne reflète qu'un seul camp.
- [x] **Correctif de décision du 2026-08-30 (clarifié par l'utilisateur) :** contrairement à une première décision erronée prise plus tôt dans la session (exclusion du solo), `getTournamentMatches` **inclut tous les formats** — solo, duo, trio et squad. Les seuls filtres d'éligibilité sont `matchType: 'custom'`, la fenêtre `[startDate, endDate]` du tournoi et l'appartenance à un clan participant. Aucun filtre sur la taille du roster à ajouter dans le moteur d'attribution.

### 3. Moteur de barème (scoring) — ✅ Livré le 2026-08-30

- [x] `computeTournamentStandings(tournamentId)` : pour chaque match éligible et chaque équipe détectée, applique `rules.placementPoints[placement] ?? 0` + `rules.killPoints * killsÉquipe` + `rules.winBonus` si placement = 1, cumule par clé d'équipe sur toute la fenêtre (ou les `bestOfRounds` meilleures manches par équipe si défini).
- [x] Vue dérivée "cumul par clan" : somme des points de toutes les équipes rattachées à un `clanId` (voir "Point ouvert" ci-dessus pour la limite sur les recompositions d'équipe).
- [x] Tri du classement : points décroissants, puis kills totaux, puis meilleur placement moyen (mêmes tie-breakers que `sortAggregates` dans `squad-detector.ts:50`, à réutiliser si la forme des données le permet).
- [x] Tests unitaires : **3 tests passing** (regroupement par clan, calcul des points, application bestOfRounds) ✓

### 4. Administration — déclaration & gestion — ✅ Livré le 2026-08-30

Rattachée au clan organisateur, sur le modèle exact de `/clans/[clanId]/settings/members` (§8.2 #5 de `docs/navigation-arborescence.md`) — pas de route `/settings/tournaments` au niveau racine, ce niveau étant réservé aux outils transverses SuperUser (cron, monitoring PUBG API, import de matchs…).

- [x] `POST /api/clans/[clanId]/tournaments` : créer un tournoi (titre, description, dates, filtres `gameMode`/`mapName`, barème prérempli). Aucun clan participant n'est configuré.
- [x] `PATCH /api/clans/[clanId]/tournaments/[tournamentId]` : édition du barème, des dates, des filtres et du statut `draft`/`active`/`finished`.
- [x] `GET /api/clans/[clanId]/tournaments` : liste des tournois organisés par ce clan.
- [x] Permission : **`manage_settings`** pour l'admin du clan organisateur, avec bypass SuperUser.
- [x] Synchronisation directe `POST /api/clans/[clanId]/tournaments/[tournamentId]/sync` : récupération PUBG, projection des rosters suivis, télémétrie et recalcul asynchrone.

**Page `/clans/[clanId]/settings/tournaments`** — rôle `manage_settings`, protégée comme les autres pages `settings/*` existantes :
- Liste des tournois gérés par ce clan (titre, statut, dates, nombre de clans participants), actions Modifier / Changer de statut.
- Formulaire de création : titre, description, sélecteur multi-clans (parmi les clans trackés actifs, même composant que le sélecteur du Comparateur `src/app/clans/comparator/page.tsx`), deux champs date, dropdowns `gameMode`/`mapName` optionnels (réutiliser les options déjà utilisées sur les pages stats/positions), barème : 10 champs numériques placement→points préremplis (`1→15, 2→12, 3→10, 4→8, 5→6, 6→4, 7→2, 8→1, 9→1, 10→1`), un champ points/kill, un champ bonus victoire, une case à cocher + champ numérique pour `bestOfRounds`.
- Carte "Tournois" à ajouter au hub `/clans/[clanId]/settings`, **qui existe déjà** (`src/app/clans/[clanId]/settings/page.tsx:59-70` — contrairement à ce que documentait `docs/navigation-arborescence.md` au 2026-08-18 comme "hub à créer" ; le doc a pris du retard sur le code, à corriger dans la même passe que "À faire une fois livré" ci-dessous). Troisième `<Link>` de carte à ajouter aux côtés de "Joueurs et rôles" et "Accueil login", même style (`Users`/`Monitor` de `lucide-react`, classes `bg-gray-50`/`text-gray-900`/`text-gray-500` déjà remappées thème clair/sombre par `globals.css`).

### 5. Consultation — liste & résultats — ✅ Livré le 2026-08-30

Rôle **Tous** (comme Challenges, §8.1 #24-25 de `docs/navigation-arborescence.md`) — pas d'accès public non authentifié, cohérent avec le reste du site (aucune page de contenu n'est accessible sans session hors `/login`/`/join`).

- [x] `GET /api/tournaments/[tournamentId]/standings` : calcule le classement global via `computeTournamentStandings`, retourne les matchs comptabilisés et les clans suivis détectés.
- [x] `GET /api/clans/[clanId]/tournaments/[tournamentId]/standings` conservé pour compatibilité ; la consultation active est globale.

**Page `/clans/[clanId]/tournaments`** (liste) — `ClanSectionNav` + structure standard, position proposée dans l'arbre §8.1 : juste après "Challenges" (#24-25), même niveau d'indentation (`▸▸`) :
- Cartes ou table `app-table-*` des tournois où ce clan est organisateur ou participant, triés statut (actif → à venir → terminé) puis date, badge de statut par tournoi.
- Carte "Créer un tournoi" visible seulement si `manage_tournaments`, renvoie vers `/clans/[clanId]/settings/tournaments`.
- Parent de repli (à ajouter en §13.2) : `/clans/[clanId]/overview`.

**Page `/clans/[clanId]/tournaments/[tournamentId]`** (détail/résultats) — même gabarit que `/clans/[clanId]/challenges/[challengeId]` (#25) :
- En-tête : titre, description, dates, statut, barème résumé en badges (`#1 = 15 pts`, `Kill = 1 pt`, `Victoire = +5`).
- `SegmentedControl` "Classement par équipe" / "Classement par clan" (les deux vues du moteur de scoring, phase 3).
- Classement en `app-table-*` avec podium sur les 3 premiers (réutiliser le pattern podium du leaderboard), colonnes rang/équipe ou clan/manches jouées/kills/points ; vue Cartes sur mobile comme les autres tableaux `app-table-*`.
- Section détail des matchs comptabilisés (liste ou table dépliable : date, carte, mode, équipes, placement, kills) pour la transparence de la sélection 100 % automatique.
- Parent de repli (à ajouter en §13.2) : `/clans/[clanId]/tournaments`.

**À faire une fois livré :** ajouter les routes à `docs/navigation-arborescence.md` :
- Ajouter `/tournaments` (global) au hub principal (§8.1)
- Ajouter `/clans/[clanId]/tournaments` à la section clan (§8.1, après Challenges)
- Ajouter `/clans/[clanId]/settings/tournaments` au menu admin/settings (§8.2)
- Entrées dans la matrice de parents de repli §13.2
- Lignes dans le tableau de suivi §13.4
- Carte "Tournois" mentionnée en §14.7 (hub settings)

Le document précise qu'il reflète l'état réel du code (`Fichier généré depuis l'état du code au 2026-08-18`) — pas de mise à jour tant que rien n'est implémenté, seulement une fois les routes livrées (2026-08-30 : routes `/tournaments`, `/api/tournaments`, `/clans/[clanId]/tournaments`, `/clans/[clanId]/settings/tournaments` maintenant en place).

### 6. Performances

- [ ] V1 : calcul à la volée à chaque vue (volume attendu faible — quelques dizaines de matchs par tournoi), pas de cache dédié, sur le modèle de `getClanSquadAnalysis`.
- [ ] Si lenteur constatée : réutiliser le pattern `ClanMatchesCache`/`ClanComparatorCache` (payload JSON précalculé, invalidé au prochain cron ou à la création/édition du tournoi) plutôt qu'inventer un nouveau mécanisme de cache.

### 7. Tests & vérifications

- [x] Tests unitaires sur le moteur de barème : placement → points, points par kill, bonus victoire, cumul multi-matchs, troncature `bestOfRounds` — **3/3 passing** (2026-08-30) ✓
- [ ] Tests unitaires sur l'attribution : exclusion des matchs hors fenêtre de dates, hors `matchType: 'custom'`, hors clans participants ; inclusion correcte d'un match partagé entre deux clans participants.
- [ ] Test sur la nouvelle fonction de découverte de matchs (phase 0) : vérifier qu'elle référence bien des `matchType` non-`official` sur un fixture/mock de réponse `GET /players/{id}`, et que la déduplication avec `fetchRecentMatchIds` fonctionne sur des IDs qui se recoupent.
- [ ] Vérifier dans le navigateur : déclaration d'un tournoi de test, un match `custom` réel (ou simulé en base) dans la fenêtre, apparition correcte sur la page résultats, rendus desktop/mobile et thèmes clair/sombre.

### Limites connues (acceptées à la conception)

- Sélection des matchs 100 % automatique (décision actée) : un scrim hors-tournoi du même clan pendant la fenêtre sera compté aussi.
- V1 limité aux clans déjà trackés par le site — aucun joueur totalement hors plateforme ne peut participer.
- Fenêtre d'environ 14 jours pour la disponibilité des matchs côté API PUBG (cf. "Idées — Comparateur de Clans" §4) — un tournoi déclaré rétroactivement sur des matchs plus anciens ne peut pas être backfillé si aucun clan participant ne les a synchronisés à temps.
- Fenêtre de rotation (non caractérisée) de la relation `matches` du endpoint de base PUBG (phase 0) — un joueur très actif peut faire sortir un match custom de cette liste avant le prochain passage cron ; à mesurer avant de garantir une couverture à 100 % pendant un tournoi actif.
- Tournois éligibles sur **tous les formats** (solo/duo/trio/squad, décision clarifiée le 2026-08-30) — aucun filtre de taille d'équipe dans le moteur d'attribution ; seuls comptent `matchType: 'custom'`, la fenêtre de dates du tournoi et l'appartenance à un clan participant. Pas de badge `matchType` ajouté sur `/clans/[clanId]/matches`, qui continue d'afficher indifféremment matchs classés et custom (le `TeamModeBadge` existant suffit à donner le contexte).
- Recomposition d'équipe entre manches (remplaçant) : points répartis sur deux lignes d'équipe distinctes plutôt que fusionnés (voir "Point ouvert" ci-dessus).

### ~~Télémétrie — Cron Timeout (UND_ERR_HEADERS_TIMEOUT)~~ — ✅ Corrigé le 2026-09-01

Le cron `daily_sync` déclenchait une erreur `UND_ERR_HEADERS_TIMEOUT` car il appelait la route API `POST /api/clans/[clanId]/sync-matches` qui durait plus de 5 minutes pour les gros clans, dépassant la limite par défaut du client HTTP de Node.js (fetch).

- [x] Extraction de la logique de `sync-matches/route.ts` vers un service dédié `src/lib/matches-sync-service.ts`
- [x] Appel direct de la fonction `syncClanMatches` dans `src/lib/cron-jobs.ts` pour s'affranchir de la requête HTTP
- [x] Mise à jour de la route API `sync-matches/route.ts` pour utiliser ce même service tout en conservant les vérifications de permissions existantes
- [x] Mise à jour de la route de contrôle manuel (`/api/clans/[clanId]/cron-control`) pour appeler également le service en direct plutôt que via HTTP
