# Inventaire du reste à faire — `docs/TODO`, au 2026-10-20

> **Relevé du 2026-10-20** sur les 14 documents de `docs/TODO/` (~11 000 lignes, ~230 cases non cochées), chaque
> point contrôlé rapidement contre le code (`main`, `6374255`) : une recherche par point, pas une recette. Les actions
> de production n'ont pas pu être vérifiées d'ici : elles sont reprises telles que les documents les décrivent.
> *Destiné à l'équipe de développement et à Claude Code.*
>
> Les numéros de ligne renvoient à l'état des documents le 2026-10-20 ; ils glissent dès qu'un document est modifié.

**En bref.** Il reste bien moins à faire que les cases ouvertes ne le laissent croire : une cinquantaine sont faites
mais pas cochées, une quarantaine sont des recettes à refaire dans un navigateur (en partie couvertes par Playwright),
le reste se partage entre une dizaine de chantiers de code, des actions de production et des décisions.

---

## 1. Petits correctifs — traités le 2026-10-20

Décisions prises le 2026-10-20 sur les points qui n'étaient pas tranchés : tutoiement limité aux **messages envoyés**,
**refus 409** sur `track` pour un membre archivé, parti ou en attente, **pas de journalisation** de l'entrée d'un
nouveau joueur, rattachement `ClanMember` → `Player` **reporté** (§2).

| Point | Ce qui a été fait | Tests |
|---|---|---|
| Case cochée alors que rien n'est fait : passe hebdomadaire sur les coéquipiers fréquents (source `player_refresh` déclarée, jamais émise) | Case **décochée** dans [todo.md](todo.md), avec la raison ; la fonctionnalité reste à faire (§2.A) | — |
| Recherche du Triage : `_` et `%` non échappés (`Lord_Kromb` trouve `LordXKromb`) | [encountered-players/route.ts](../../src/app/api/settings/encountered-players/route.ts) reprend `buildNameFilter` de l'annuaire. **Trouvé en chemin** : un `*` seul passait dans la branche de recherche, sans `take`, qui chargeait toute la table (1,6 M lignes) ; il passe désormais par la navigation paginée | `encountered-players-triage-route.test.ts` |
| Adresse publique du site lue à trois endroits, base vide sans avertissement | Une seule lecture, [public-base-url.ts](../../src/lib/public-base-url.ts). **Les deux ordres sont gardés** : ils sont voulus depuis /settings/configuration (2026-10-18), adresse publique `NEXT_PUBLIC_APP_URL` d'abord (Discord, alertes), liens de compte `APP_URL` d'abord. Variable vide = absente ; base absente → un avertissement par processus | `public-base-url.test.ts` |
| Vouvoiement dans les messages envoyés | Tutoiement dans les e-mails de décision (4), d'invitation, de mot de passe, et les notifications « demande d'adhésion » et « nouveau clan à valider » | `clan-contact-email.test.ts`, `tutoiement.test.ts` (contrôle de tout `src/` depuis le passage de l'interface, §2.A) |
| Trois tests Vitest écrivent dans la base de `DATABASE_URL` (la production) | Ignorés par défaut (`describe.runIf`), lancés avec `VITEST_DB_WRITES=1` contre une base de test ; règle dans CLAUDE.md, piège n° 9 | la suite complète n'écrit plus en base |
| « Suivre » réactive sans confirmation un membre archivé, parti ou en attente | [track/route.ts](../../src/app/api/settings/opponents/track/route.ts) : **409 `member_needs_reactivation`** sans `confirmReactivation: true` (distinct de `confirmMove`), message propre à une demande `/join` en attente. L'annuaire et l'écran Clans confirment en modale | `players-directory-route-contracts.test.ts` ; e2e `players-directory.spec.ts`, `settings-clans-track.spec.ts` |
| Journaliser l'entrée d'un nouveau joueur suivi | **Décidé : non** — l'historique des mutations reste réservé aux changements de clan, l'ajout est déjà dans le journal des actions d'administration | test existant conservé |

**Constat en chemin, non traité** : dans le Triage, une recherche par préfixe court (`a`) charge encore toutes les
lignes correspondantes avant de paginer en mémoire. Le correctif du `*` seul ne couvre pas ce cas.

---

## 2. Chantiers de code restants

### A. Moyens — lancés le 2026-10-20

| Chantier | État | Ce qui reste |
|---|---|---|
| **Tutoiement de l'interface** | ✅ 144 phrases dans 65 fichiers. Exception voulue : le verdict de la lecture de zone (`zone-closure-view.ts`), un pluriel adressé à l'escouade. `tutoiement.test.ts` contrôle tout `src/` | — |
| **Liens courts `/m`, `/t`, `/j`** | ✅ Code ([url-masking.md](url-masking.md)) : module, pages de redirection et de choix, embeds Discord, aperçu du site ; déployé le 2026-10-20 | Recette d'un lien reçu sur Discord (prochain Top 1) |
| **Distances de jeu** (vrai bug) | ✅ Les pages Style de jeu affichaient ≈ 86 km « à pied » par partie (centimètres de la télémétrie, avion et trajet depuis (0, 0) compris) au lieu de ≈ 2 km. Elles lisent désormais les mètres de l'API PUBG ; le parser n'ajoute plus l'avion ni la chute ; une ligne pas encore recalculée s'affiche « — » | ✅ Recalculés le 2026-10-20 (41 clans, 253 s) : 1,7 à 1,9 km à pied, 1,9 km en véhicule par partie |
| **Rattachement `ClanMember` → `Player`** | ✅ `src/lib/member-player-link.ts`, appelé par `/join`, l'installation, l'ajout d'un membre, les deux validations et la resynchronisation du miroir. Ne touche jamais au clan PUBG du joueur | ✅ Appliqué le 2026-10-20 : 54 fiches rattachées, 3 lignes `Player` créées, 0 fiche restante |
| **SEO, lot 4 et suite** | ✅ `/a-propos` : chiffres vivants datés (ceux de la vitrine) et phrase citable, lien vers la méthodologie. ✅ Page [`/a-propos/methodologie`](../../src/app/a-propos/methodologie/page.tsx) (réglages du Power score lus en direct, `Article` daté). ✅ `Organization` avec `contactPoint`, `AboutPage`. ✅ Préchauffage de la vitrine (cron `home_showcase_warm`). ✅ IndexNow, **coupé** sans `INDEXNOW_KEY`. ✅ `scripts/seo-raw-html-audit.ts` | Logo d'Arkium à fournir (aucun visuel du dépôt ne convient). Poser `INDEXNOW_KEY` pour activer IndexNow. CSP bloquante vers le 25 octobre – 1er novembre |
| **Fin d'`EncounteredPlayer`** | 🟡 Étape 1 faite : lectures sans changement de schéma basculées (§6) | Étapes 2 à 5 (§6), avec ton accord pour la migration et le `DROP` |
| **Colonnes JSON en clair** | Mesuré : vides sur les 32 929 lignes ; un DROP ne rend **aucun** octet | Nettoyage de code d'abord, puis migration ; sans urgence ([todo.md](todo.md) « Supprimer les colonnes en clair ») |
| **Passe hebdomadaire sur les coéquipiers fréquents** | Non commencée : une dizaine de questions à trancher (§4) | Le compteur existe déjà (`ClanEncounter.teammateEncounterCount`), il manque un index et tes réponses |

### B. Petits, sans urgence

- Seuils de purge vides (« > 60 j », « > 90 j ») ni masqués ni marqués : `src/app/settings/database/page.tsx`
  (l. 394).
- Modale « Sortir du clan » (trois choix) absente du catalogue `docs/ui/index.html` (l. 1748).
- Débriefing : badges « First contact P{n} » et « Retard cercle » (l. 5290).
- Avatars du podium et du classement solo des tournois (l. 4891).
- `mapAssetUrl()` à propager : 13 chemins `/maps/pubg/${…}` codés en dur (l. 5264).
- `PositionMetricCell` écrit hors de la transaction de la télémétrie (l. 4041).
- `docs/features/challenges.md:105` dit encore « déclenchement à implémenter » : `refreshChallengeProgressForClan` est
  déjà appelé par `cron-jobs.ts`.
- Écran Clans de l'administration : badge « manquants » non cliquable, pas de bandeau « Ajouter à <clan> »
  (l. 4423, 4437).

### C. Tests manquants

- Unitaires : `awards-service`, `stats-calculator`, `clan-comparator-service`, `head-to-head-service`, attribution de
  `getTournamentMatches` (l. 50, 5900, 5922-5923, 5940).
- Collisions du rattrapage et unicité concurrente `Player` / `OpponentClan` (l. 4485-4486).
- Match partagé entre deux clans suivis (`analyzeMatchForSquads` sur un `pubgMatchId` déjà en base, l. 3264).
- e2e « Owner A sur `/clans/B/settings` » ([administration.md](administration.md) l. 480, 780).

### D. Idées (backlog, rien dans le code)

- Adversaires : stats tactiques (K/D direct, badges Némésis / Proie, phasage drop / late game, vue Watchlist,
  l. 4478-4481) ; rivalité automatique et notification « croisé [Clan X] » (l. 4535).
- Ligue : historique et sparklines du Power score (l. 5585, 5810) ; défis inter-clans `ClanChallenge` (l. 5610-5612).
- Joueur : temps de jeu / jours actifs et badges « Marathonien » / « Régulier » sur le tableau de bord (l. 2457-2459) ;
  DPM et kills par heure (l. 2474) ; rappels par membre (l. 3375) ; Circle IQ, radar 6 axes, kills par distance et par
  phase (l. 2370-2375) ; objectifs personnels, badges de progression (l. 2388-2391).
- Notifications push réelles, FCM / VAPID (l. 42, 5891-5893).
- Idées de [pubgstatisticscom.md §5](pubgstatisticscom.md) absentes du code : ratio dégâts infligés / reçus, kill
  steals, Combat Ratio / Knock Ratio, histogrammes, calculateur TTK, rotation des cartes ; partielles : % de bots,
  grille d'activité sur 365 jours, performance par heure.
- SEO : `/llms.txt`, mentions externes, JavaScript inutilisé, `Dataset` pour la lecture de zone.
- Divers : Head-to-Head sans filtre de période (l. 3250), « En jeu maintenant » (bloqué par la synchro horaire),
  compression de page InnoDB, priorité entre les files d'appels PUBG, ligne sentinelle `ZoneClosurePosition`.

---

## 3. Production et serveur

À faire sur le serveur, dans l'ordre d'importance. Rien n'a pu être vérifié d'ici.

| Action | Source |
|---|---|
| ⚠️ **Port 3306 ouvert à tout Internet** ; jail fail2ban `mysqld-auth` à étudier | [todo.md](todo.md) l. 174 |
| ⚠️ `REVOKE` des droits globaux du compte `smk` | [database-performance.md](../ops/database-performance.md) |
| Rapport `db-health` à J+7 (prévu le 2026-09-22) jamais consigné ; en dépendent les index d'`EncounteredPlayer`, les réglages mémoire MariaDB et le `db-health disable` | [todo.md](todo.md) l. 157, 170 |
| Sous-domaines de clan : certificat wildcard (DNS-01), `server_name *.chickendinner.fr` dans Nginx, `CLAN_SUBDOMAIN_ROOT=chickendinner.fr`, redémarrage ; **puis** `includeSubDomains` au HSTS | [chickendinnerfr.md §5](chickendinnerfr.md), [deployment.md](../ops/deployment.md) |
| `APP_URL` et `NEXT_PUBLIC_APP_URL` à `https://chickendinner.fr` dans le `.env` (**posé le 2026-10-20**), rebuild, redémarrage du web puis du cron | [url-masking.md §5](url-masking.md) |
| Créer la boîte `contact@chickendinner.fr` (déjà citée par les pages légales) | [CU_todo.md](CU_todo.md) |
| `OPTIMIZE` de `SquadMatchTelemetry` (~16 Go à rendre au disque) | [todo.md](todo.md) l. 721, 733 |
| `scripts/resync-player-clan-identity.ts --apply` jamais lancé | [todo.md](todo.md) l. 4366 |
| `TELEMETRY_CAPTURE_FIXTURES_DIR` : même chemin absolu pour les 4 services, **puis seulement** `turbopackIgnore` dans le code | [todo.md](todo.md) l. 180 |
| SEO : nouveau test de `/clans` dans la Search Console et demande d'indexation, Bing Webmaster Tools, test des résultats enrichis, `application/json` dans les `gzip_types` de Nginx, PageSpeed | [geo-seo-propositions.md](geo-seo-propositions.md) |
| Constats en base : `ZoneClosurePosition` remplie par les nouveaux matchs, `ClanComparatorCache` rempli par `daily_stats_recalc` | [todo.md](todo.md) l. 4012, 5961 |
| ~~Recalculer les agrégats de télémétrie (distances en mètres)~~ — **fait le 2026-10-20** (41 clans, 253 s) | §2.A |
| ~~`npx tsx scripts/backfill-member-player-link.ts --apply`~~ — **fait le 2026-10-20** (54 fiches) | §2.A |
| ~~Vérifier que `CRON_BOOTSTRAP_SECRET` est posé pour le web **et** le cron~~ — **vérifié le 2026-10-20** : même valeur dans les units systemd des deux (`Environment=`, pas le `.env`, [deployment.md](../ops/deployment.md)). Reste : poser `INDEXNOW_KEY` pour activer IndexNow, puis importer la propriété dans Bing Webmaster Tools | [docs/ops/cron.md](../ops/cron.md), [seo.md](../features/seo.md) |

**Recettes dans un navigateur** — une quarantaine de cases, dont une partie déjà couverte par `e2e/` : arrêt de suivi
d'un clan, annuaire des joueurs (§9.D), Replay Karakin, manche de tournoi vue d'un autre clan, six états du Triage,
`/settings/discord`, pages de télémétrie en clair et sombre. Les listes de [refonte-ui.md](refonte-ui.md) (9 cases) et
[sticky.md](sticky.md) (11 cases) sont des grilles à repasser pour chaque nouvelle page, pas des tâches.

---

## 4. Décisions en attente

- **Légal** : licence propriétaire (`LICENSE.md` absent), identité de l'éditeur exigée par le droit belge (seul
  « Arkium » figure), hébergeur OVH à confirmer, autorité de contrôle et base légale à valider
  ([pages-legales.md §4](../features/pages-legales.md)).
- **Power score** : coefficient de placement à ~170 au lieu de 250 (placement mesuré à 48-51 % du score) ; seuils par
  type de partie ([score.md](score.md), [ligue-clans.md](../features/ligue-clans.md)).
- **Télémétrie** : durée de conservation du JSON brut (disque) ; afficher ou non la « Fin de zone ».
- **Arrêt de suivi** : un Owner peut-il arrêter le suivi de son propre clan ? Refuser à l'archivage les demandes
  d'adhésion en attente ? ([clan-archive.md](clan-archive.md))
- **Navigation** : passer les 28 redirections de la réorganisation de 307 en 308 (`next.config.ts`) ; bandeau collant
  de `/clans` sur mobile (écart « à trancher » dans `ui-conformance.test.ts`) ; ancres de section sur mobile.
- **Cycle de vie des clans** : bloc « À trancher » de [todo.md](todo.md) (l. 1950-1961) — valeurs par défaut, seuil
  « coéquipier fréquent », adversaires favoris, visibilité d'UNG, un clan système par shard ; divergence de
  `KillEvent.clanId` après un déplacement.
- **Annuaire** : filtre dédié aux statuts 🟠 / 🟡 / ⚫ ; index `Player(lastSeenAt)` (tri par défaut à 1,5-1,8 s).
- **Passe hebdomadaire sur les coéquipiers fréquents** (`player_refresh`) : que mesure « ≥ 10 parties partagées »
  (par clan ou au total) ; statut des lignes de journal (`observed` gonfle le compteur SuperUser, `applied` entre dans
  le journal public) ; confirmation avant d'écraser un clan connu par « sans clan » ; tag et nom des clans inconnus
  (appels API en plus) ; créneau horaire ; renommages ; alerte Discord ou non.
- **Fin d'`EncounteredPlayer`** (§6) : accord pour la migration additive de l'étape 2, puis pour le `DROP`.
- **Code sans appelant** : `src/components/ProgressionChart.tsx`, `getClanSquadAnalysis`, routes `drop-pressure-stats`
  et `city-insights` d'un clan, `standings` d'un tournoi côté clan.
- **Divers** : tag du clan actuel ou figé au moment du kill ; résoudre les ~5 % de pseudos inconnus du lobby ;
  confidentialité inter-clans ; serveur Discord officiel (`sameAs`) ; préfixe `owner.` de
  `owner.encountered-opponents`.

---

## 5. Documents en retard sur le code

À cocher, rayer ou corriger lors d'un prochain ménage :

- [administration.md](administration.md) : l'en-tête (l. 11-12) dit encore que les scripts du lot 2 « n'ont tourné
  qu'en simulation », de même que l. 556, 570, 799 et Q-D6 — ils ont été appliqués le 2026-10-12 (`47ad1bd`). La liste
  « Reste à faire » (l. 1314-1341) est entièrement faite. Les livraisons du 2026-10-19 (alertes Discord, boîte « À
  traiter », mise en route d'un clan) n'y figurent pas.
- [score.md](score.md) : la nouvelle formule est implémentée (`src/lib/clan-league.ts`) ; manque un en-tête « ✅ ».
- [clan-archive.md](clan-archive.md), [players.md](players.md) : « non déployé » — déployés depuis.
- [refonte-ui.md](refonte-ui.md) l. 126 : tableau qui défile à 768 px, corrigé le 2026-10-04.
- [sticky.md](sticky.md) l. 465 : workflow Azure supprimé.
- [CU_todo.md](CU_todo.md) l. 40-41 : cases MIT / AGPLv3, options écartées et non tâches.
- [geo-seo-propositions.md](geo-seo-propositions.md) l. 49 : lot 0.0 « en attente de déploiement ».
- [todo.md](todo.md) — cases faites mais non cochées, entre autres : déploiement de `db_maintenance` (l. 155), du
  correctif de purge (l. 375), de la compression (l. 593, 702) ; bouton de test du webhook (l. 1571) ; raccourci
  « membre suivi » (l. 1335) ; crons de rapports hebdo / mensuel (fonction supprimée, `9c03382`) ; rôle Moderator
  (supprimé, `a448513`) ; cache de `searchPlayerByName` (l. 4489) ; filtre « Sans clan » (l. 4430) ; tests et recettes
  de tournoi couverts par Vitest et `e2e/` (l. 5515-5574) ; Power score normalisé et delta (l. 5584-5599) ; heatmap
  d'activité comparée (l. 5921) ; `rideDistance` affiché (l. 3483) ; titre « à implémenter » du lot 6 (l. 799).

---

## 6. Fin d'`EncounteredPlayer` — mesures et plan

Mesuré en lecture seule le 2026-10-20 (MariaDB 10.11, `innodb_file_per_table=1`, buffer pool 128 Mo).

| Table | Lignes | Données | Index |
|---|---|---|---|
| `EncounteredPlayer` | 3 629 815 | 972 Mo | **2 802 Mo** (11 index) |
| `ClanEncounter` | 3 629 706 | 444 Mo | 859 Mo |
| `Player` | 755 653 | 139 Mo | 257 Mo |

- `EncounteredPlayer` pèse **3,77 Go, 22 % de la base** (17,1 Go), et grossit d'environ 65 Mo par jour : elle a
  doublé depuis le 2026-09-15 (chiffres de [database-performance.md](../ops/database-performance.md) périmés).
- La double écriture est fidèle : `encounterCount`, `teammateEncounterCount`, `firstSeenAt` et `lastSeenAt` identiques
  à 100 % sur les échantillons ; 109 lignes d'écart sur 3,6 M. Tout compte d'`EncounteredPlayer` a sa ligne `Player`.
  Les copies par clan sont **en retard** : 30 % des lignes récentes non résolues alors que `Player` l'est.
- Seule colonne sans équivalent : `combatInteractionsCount` (priorité du cron de résolution). `Player.resolveAttempts`
  existe mais n'est jamais incrémenté.
- **Gain attendu : ≈ 3,7 Go rendus au disque dès le `DROP TABLE`** (un `DELETE` ne réduirait jamais le fichier), plus
  ~65 Mo par jour évités, et 2,8 Go d'index en moins à disputer au buffer pool.

**Étapes** (chacune déployée sur les 4 services avant la suivante) :

1. ✅ **Lectures sans changement de schéma** (2026-10-20) : débriefing, replay, joueurs d'un tournoi, kill feed lisent
   `Player` seul (la lecture d'`EncounteredPlayer` y était redondante) ; Némésis ne charge plus toutes les lignes du
   clan (jusqu'à 300 000 par appel), une requête `Player` bornée aux comptes des duels ; la page Adversaires
   (`src/lib/clan-encountered-players-service.ts`) lit `ClanEncounter` ⋈ `Player` ⋈ `OpponentClan` en un passage
   groupé. Mesure : 8,5 à 15 s pour les deux plus gros clans contre 9 à 19 s avant (plus l'agrégation de 300 000
   objets dans le serveur web), < 0,3 s pour un clan ordinaire. Le goulot reste le buffer pool de 128 Mo.
2. **Colonnes** (migration additive, sur accord, `migrate diff` d'abord) : `Player.encounterCount` (total tous clans),
   `Player.combatInteractionsCount`, index `(clanResolvedAt, resolveAttempts, combatInteractionsCount,
   encounterCount)` (~50 Mo) ; le code les alimente (capture, deltas des kills, échecs de résolution) ; rattrapage en
   simulation puis `--apply`.
3. **Dernières lectures** : Triage (`/api/settings/encountered-players`, une ligne par identité), sélection du cron de
   résolution (une requête sur le nouvel index remplace le `groupBy` de 48 s et son cache de 6 h), comptages du
   backlog. Le statut de résolution devient global (correction des 30 % en retard). À trancher : le seuil « au moins 2
   rencontres » compte-t-il par clan ou au total ?
4. **Arrêt de la double écriture**, puis une semaine d'observation (`MAX(updatedAt)` figé).
5. **`DROP TABLE EncounteredPlayer`**, sur accord ; seulement quand plus aucun process ne tourne l'ancien code.
