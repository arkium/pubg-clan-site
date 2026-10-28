# Fraîcheur des parties — indicateur et alertes

> Plan du 2026-10-28, à la suite de la synchronisation toutes les 30 minutes ([synchro-parties-30-min.md](synchro-parties-30-min.md),
> déployée le 2026-10-27). **Rien d'implémenté.** But : voir, sans requête lourde, si les parties arrivent vite, si la
> synchronisation tient dans son intervalle et si le quota PUBG approche du plafond — et être prévenu quand ça se
> dégrade, plutôt que de l'apprendre par un joueur. *Destiné à l'utilisateur et à l'équipe de développement.*

## 1. Constat (production, lecture seule, 2026-10-28)

Avant : 3 jours précédant le déploiement du 2026-10-27 (21:55) ; après : 23 h depuis le correctif de 22:40.

| De la fin de la partie à… | Avant | Après |
|---|---|---|
| son import sur le site (première ligne `Match`, par partie PUBG) | médiane 2 h, 90 % sous 5,1 h ; 20 % sous 45 min | médiane **15 min**, 90 % sous **27 min** ; 100 % sous 45 min |
| l'alerte Top 1 Discord | médiane 2,3 h, 90 % sous 6,1 h | médiane **14 min**, 90 % sous **26 min** |
| sa télémétrie analysée (`parsedAt` après l'import) | médiane 14 min, 90 % sous 10,4 h | médiane **18 s**, 90 % sous 2,2 h |

- **Tours de synchronisation** : 46 tours sur 46 attendus, durée médiane 13 min (max 18) pour un intervalle de 30 min,
  45 clans, aucun échec.
- **Quota PUBG** : 545 appels limités par heure en médiane, 556 au plus fort, pour un plafond de 600 (**91 %**) ; aucun
  429. Par origine sur 23 h : `pubg-lib` 5 459 (carrière, saisons, fiches de clan… sans origine propre),
  `clan-match-sync` 4 456, `encountered-player-resolution-cron` 2 048, `clan-lifecycle-cron` 74.
- **Coût d'une mesure à la demande** : recalculer le délai depuis `Match` regroupe toute la table — une trentaine de
  secondes. Impossible dans une lecture de page (règle du site : jamais un bilan lourd dans une page).

Ce que l'on ne voit nulle part aujourd'hui : le délai fin → site, la marge d'un tour sur son intervalle, les tours
sautés (`clanSyncInProgress` ne laisse qu'une ligne de journal), et la part du quota prise par la synchronisation.

## 2. Principe

1. **La synchronisation se mesure elle-même**, au fil du tour : elle connaît, pour chaque partie qu'elle importe, la
   fin de la partie (`pubgCreatedAt + durationSeconds`) et l'heure d'import. Aucun appel PUBG ni requête lourde en plus.
2. **Un résumé glissant de 24 h** est rangé dans `AppConfig` (une écriture par tour, comme
   `telemetry_geo_purge_counts`) : les pages et la boîte « À traiter » le lisent, rien de plus.
3. **Deux affichages, chacun son rôle** : le résultat de la tâche sur `/settings/cron` (« Fraîcheur des parties »), le
   quota sur `/settings/pubg-api` (« Quota »).
4. **Une alerte quand un seuil est franchi** (boîte « À traiter », veille du matin, salon Discord d'administration), à
   l'entrée dans l'état dégradé et non à chaque tour.
5. **Pas de migration** : `AppConfig` pour le résumé ; la priorité d'un appel PUBG se déduit de son origine (§4, lot 2),
   sans colonne nouvelle dans `PubgApiCallLog`.

## 3. Seuils proposés (à valider)

Un seuil ne s'applique que sur assez de données : délai calculé sur **au moins 20 parties** en 24 h (la nuit, une
poignée de parties ne dit rien), crons attendus (`cronJobsExpected`, production).

| Mesure (24 h glissantes) | En ordre | « À traiter » (todo) | Urgent | Pourquoi |
|---|---|---|---|---|
| Délai fin → site, 90 % | ≤ 45 min | > 60 min | > 120 min | 45 min est la promesse affichée sur la page Discord |
| Durée médiane d'un tour / intervalle | ≤ 60 % | > 80 % | — | au-delà, un tour sur deux risque d'être sauté |
| Tours sautés (déclenchement pendant un tour en cours) | 0 | ≥ 1 | ≥ 3 de suite | 3 de suite = la synchro tombe à une fois par 2 h |
| Dernier tour terminé | < 2 × intervalle + 30 min | — | au-delà | synchro arrêtée (service cron tombé, boucle bloquée) |
| Appels limités, dernière heure / plafond | < 85 % | ≥ 95 % | — | à 95 %, les tâches de fond n'avancent plus |
| Réponses 429, 24 h | 0 | ≥ 1 | ≥ 20 | une 429 = deux processus se partagent la clé sans se voir |

Constantes dans le module pur (`src/lib/match-sync-health.ts`), pour la page, la boîte et Discord.

## 4. Lots

### Lot 1 — Mesure au fil de la synchronisation

- `src/lib/matches-sync-service.ts` : pour chaque partie **nouvelle pour le membre** (`newMatchIds`) importée avec
  succès, délai = heure d'import − (`pubgCreatedAt` + `durationSeconds`). Par clan, le plus petit délai de chaque
  `pubgMatchId` (une partie à quatre membres compte une fois). Délai > 24 h = rattrapage (nouveau membre, historique) :
  compté à part, hors quantiles. Nouveau champ du résultat de `syncClanMatches` : `newMatchDelaysMinutes: number[]`,
  `catchUpMatches: number`. `importMatchesForMember` (rattrapage de la carrière) ne compte pas : seul `daily_sync`
  alimente l'indicateur.
- `src/lib/match-sync-health.ts` (pur) : types ; `recordPass(state, pass, now)` (ajoute un tour, retire ce qui a plus de
  24 h, borne à 2 000 délais) ; `recordSkippedTrigger(state, at)` ; `summarizeMatchSyncHealth(state, now,
  intervalMinutes)` → délai (médiane, 90 %, part sous 45 min, nombre, rattrapages), dernier tour (début, durée, clans,
  échecs), durée médiane et maximale, marge, tours sautés, quota, et `status` (`ok` / `todo` / `urgent`) avec la liste
  des raisons ; `shouldAlert(previous, next, now)` (entrée dans un état dégradé, rappel au plus toutes les 6 h, retour à
  la normale une fois).
- `src/lib/match-sync-health-service.ts` : lecture et écriture de `AppConfig.match_sync_health` (JSON) ;
  `finishMatchSyncPass(pass)` : lit l'état, ajoute le tour, prend le quota de la dernière heure (un `COUNT` sur
  `PubgApiCallLog` par `startedAt`, indexé, ~550 lignes) et les 429 de 24 h, écrit, puis décide de l'alerte (lot 4).
  `recordMatchSyncSkip(at)`.
- `src/lib/cron-jobs.ts`, `runDailyClanSync` : cumule les délais des clans, appelle `finishMatchSyncPass` dans le
  `finally` (un tour interrompu par une erreur compte, avec ses échecs) ; `recordMatchSyncSkip` dans la branche
  « previous run is still in progress ». Une erreur d'écriture du résumé est journalisée et n'interrompt jamais la
  synchronisation.
- Taille : ~1 300 parties en 24 h → 2 000 entiers au plus, moins de 15 Ko. Un seul écrivain (le service cron).

### Lot 2 — Quota PUBG lisible par priorité

- **Origines explicites** pour les appels qui tombent aujourd'hui dans `pubg-lib` : carrière (`clan-lifetime-sync`,
  `clan-service.ts`), saisons et classées (`season-stats-sync`, `cron-jobs.ts`), maîtrise d'armes
  (`weapon-mastery-sync`), fiche du clan après import (`clan-stats-sync`, `syncTrackedClanStats`), recherche de compte
  (`player-lookup`). Relevé à refaire à l'implémentation : tout appel sans `source` reste `pubg-lib`.
- `src/lib/pubg-api-call-category.ts` : `pubgApiPriorityOfSource(source)` → `high` (`clan-match-sync`,
  `tournament-sync`), `low` (carrière, saisons, maîtrise d'armes, joueurs croisés, cycle de vie, noms du kill feed),
  `normal` sinon (manuel, page, `pubg-lib`). La priorité de la file reste portée par l'appel (`PubgApiCallContext`) :
  cette table ne sert qu'à l'affichage, un test vérifie qu'elle dit la même chose que les appels (lot 6).
- `getPubgApiCallsOverview` : `rateLimitLimit` ajouté à la sélection des appels du jour (déjà chargés en mémoire) →
  `quota` : plafond horaire (`rpm × 60`), dernière heure (limités, part haute / normale / basse), heure la plus chargée,
  série horaire du jour, 429 du jour.
- `/settings/pubg-api`, carte « Activité du jour » : ligne « Quota » — jauge dernière heure / 600 (en ordre < 85 %,
  attention 85–95 %, au plafond ≥ 95 %), détail par priorité, phrase « Au plafond, les tâches de fond ralentissent
  d'abord ; la synchronisation des parties passe devant. »

### Lot 3 — « Fraîcheur des parties » sur `/settings/cron`

- `GET /api/settings/match-sync-health` (SuperUser, comme `cron-workers-status`) : lit `AppConfig`, rend
  `summarizeMatchSyncHealth` avec l'intervalle effectif de `daily_sync` (`resolveCronSchedule` +
  `getCronRunsPerDay`). Aucune requête sur `Match` ni sur `PubgApiCallLog`.
- `SectionCard` « Fraîcheur des parties » en tête de page, quatre tuiles : **Délai fin → site** (médiane · 90 %, 24 h,
  nombre de parties), **Dernier tour** (heure, durée, clans, échecs), **Marge** (durée médiane sur l'intervalle),
  **Tours sautés** (24 h) ; ton de chaque tuile d'après §3 ; raisons listées quand l'état n'est pas « en ordre ».
  Avant le premier tour mesuré : « Pas encore de mesure » — jamais un faux zéro. Moins de 20 parties : délai affiché,
  sans ton.
- Carte « Scheduler cron (Next.js) — Tâches planifiées dans le processus web » : faux depuis le 2026-10-27 →
  « Service des tâches (cron) — Tâches planifiées dans le service cron ; le web enregistre les horaires ».

### Lot 4 — Alertes

- **Boîte « À traiter »** (`src/lib/admin-inbox/`) : fait `matchSync` (résumé lu dans `AppConfig`, `null` si
  illisible → `unavailable`, jamais un zéro) ; ligne `match_sync` vers `/settings/cron#fraicheur`, ton d'après §3,
  détail = la première raison (« 90 % des parties arrivent en plus de 60 min », « 2 tours sautés », « quota à 97 % »,
  « aucun tour depuis 1 h 40 »). La veille du matin la reprend d'elle-même.
- **Discord d'administration** : événement `match_sync_degraded` dans `catalog.ts` (groupe « Plateforme », `toAct:
  true`, actif par défaut), message dans `messages.ts` (raisons et chiffres, lien vers `/settings/cron` par la base
  publique ; ni pseudo ni adresse), envoyé par `fireAdminAlert` depuis `finishMatchSyncPass` quand `shouldAlert` le dit ;
  retour à la normale : un message sans mention. État d'envoi (`lastAlertAt`, `lastStatus`) gardé dans le résumé.

### Lot 5 — Documentation

`docs/ops/cron.md` (indicateur, seuils, clé `AppConfig`), `docs/features/discord-notifications.md` (nouvel événement),
fiche de la page API PUBG, `CLAUDE.md` (une ligne : la synchro se mesure elle-même, jamais de requête sur `Match` dans
une page), ce plan (§8 État), `docs/sommaire.md`.

## 5. Tests (Vitest, `src/lib/**`)

| Fichier | Ce qu'il vérifie |
|---|---|
| `match-sync-health.test.ts` (nouveau) | `recordPass` retire ce qui a plus de 24 h et borne à 2 000 délais ; quantiles (médiane, 90 %) sur des délais connus ; chaque seuil du §3 à sa borne (45 / 60 / 120 min, 60 / 80 %, 1 et 3 tours sautés, 85 / 95 %, 1 et 20 × 429) ; moins de 20 parties = pas de ton sur le délai ; état vide « pas encore de mesure » ; `shouldAlert` : entrée en état dégradé, pas de rappel avant 6 h, retour à la normale une fois, pas d'alerte quand les crons ne sont pas attendus |
| `matches-sync-service.test.ts` | délai calculé sur `pubgCreatedAt + durationSeconds` des seules parties nouvelles ; une partie à plusieurs membres compte une fois (le plus petit délai) ; rattrapage > 24 h exclu et compté ; partie déjà connue, import en échec et `importMatchesForMember` ne comptent pas |
| `match-sync-health-service.test.ts` (nouveau, Prisma simulé) | un tour = une lecture et une écriture de `AppConfig` ; quota de la dernière heure lu par `startedAt` ; tour sauté enregistré ; écriture en échec journalisée sans exception ; alerte envoyée une seule fois sur deux tours dégradés de suite |
| `cron-jobs` (par extraction) | `runDailyClanSync` appelle `finishMatchSyncPass` après le dernier clan, et aussi quand un clan lève une erreur ; `recordMatchSyncSkip` quand un tour est en cours — contrôle statique si l'import de `cron-jobs.ts` reste trop lourd |
| `pubg-api-call-category.test.ts` | chaque `source:` littéral des appels PUBG du code a une priorité (contrôle statique) ; la priorité affichée = celle passée à la file (`clan-match-sync` haute, carrière basse…) |
| `pubg-api-calls` (contrat de route) | `quota` : plafond = rpm × 60, comptes par heure et par priorité, 429 du jour ; 403 hors SuperUser |
| `match-sync-health` (contrat de route) | 403 hors SuperUser ; résumé rendu depuis `AppConfig` seul (aucun mock `match` / `pubgApiCallLog` appelé) ; `AppConfig` absente = état vide |
| `admin-inbox.test.ts` | ligne `match_sync` absente en ordre, `todo` / `urgent` aux seuils, détail = première raison ; source illisible = `unavailable` |
| `admin-alerts.test.ts` | événement `match_sync_degraded` au catalogue ; message sans pseudo, adresse ni lien brut (base publique) |
| existants | `tutoiement.test.ts` (nouveaux textes), `admin-action-log-routes.test.ts` (routes en lecture seule : rien à envelopper), `cron-schedules-route-contracts.test.ts` (aucun `cron.schedule`) |

## 6. Playwright (`e2e/`, toutes les API figées)

- `e2e/site-config.spec.ts` (page `/settings/cron`) : bloc « Fraîcheur des parties » en ordre (quatre tuiles et leurs
  chiffres), en état dégradé (tons, raisons), vide (« Pas encore de mesure », aucun « 0 min ») ; nouveau libellé de la
  carte du service cron. Réponse figée de `GET /api/settings/match-sync-health` dans `mockCronSettings`.
- `e2e/pubg-api-settings.spec.ts` (nouveau — la page n'a aucun test) : ligne « Quota » à 70 % et à 97 %, détail par
  priorité ; réponses figées de `pubg-api-calls` et `pubg-api-rate-limit`.
- `e2e/platform-hub.spec.ts` : ligne « Synchronisation des parties » dans « À traiter », lien vers `/settings/cron#fraicheur`.
- Thèmes clair et sombre, mobile : sur les quatre projets ; captures de référence seulement si une page déjà capturée
  change (`visual.spec.ts` ne couvre ni `/settings/cron` ni `/settings/pubg-api` aujourd'hui).

## 7. Contrôles

**Avant de commiter** : `npx tsc --noEmit`, `npm run lint`, Vitest complet, specs Playwright touchées sur les quatre
projets ; `migrate diff` vide (aucune migration attendue).

**Mesure de référence** : `scripts/check-match-sync-health.ts` (nouveau, lecture seule) recalcule depuis la base le
délai fin → site des 24 dernières heures (la requête lourde du §1, ~30 s, hors heures de jeu), la durée des tours
(`CronExecution`) et le quota (`PubgApiCallLog`), puis les compare au résumé de `AppConfig.match_sync_health`.

**Après le déploiement** :

1. Dans les 30 minutes : `AppConfig.match_sync_health` existe et porte un tour ; le bloc s'affiche sur `/settings/cron`.
2. Le lendemain : `check-match-sync-health.ts` — écart de médiane et de 90 % sous 2 min, même nombre de tours, même
   quota à ±5 %. Un écart plus grand = la mesure au fil du tour se trompe (partie comptée deux fois, rattrapage compté).
3. Non-régression : durée médiane d'un tour inchangée (±1 min) ; **zéro appel PUBG en plus** (comptes par origine du
   journal identiques à l'activité près) ; aucune ligne `[match-sync-health]` d'erreur dans `journalctl -u
   pubg-clan-site-cron`.
4. Alerte : vérifiée en test (lot 4) ; en production, l'interrupteur de `match_sync_degraded` est visible avec ceux des
   autres alertes, sur la page « Cycle de vie des clans ». Pas d'essai forcé en production.
5. Retour arrière : l'indicateur ne fait que lire ; l'alerte se coupe par son interrupteur, sans déploiement.

## 8. Hors de ce plan

- **Fraîcheur visible des joueurs** (« parties à jour il y a 12 min » sur les pages d'un clan) : à décider après une
  semaine de mesures, le même résumé pourrait la servir par clan.
- **Colonne `priority` dans `PubgApiCallLog`** : inutile tant que l'origine suffit (lot 2) ; migration seulement si deux
  priorités devaient partager une origine.
- **Une file par processus** (web, cron, worker pour une seule clé) : la garde sur `X-RateLimit-Remaining` évite les 429
  (aucune depuis le 2026-10-27) ; le seuil 429 du §3 dira s'il faut aller plus loin.
- **Télémétrie** : 90 % sous 2,2 h après l'import ; la file du worker a déjà son indicateur sur `/settings/telemetry`.

## 9. État (2026-10-28)

Plan écrit, rien d'implémenté. À trancher avant de commencer : les seuils du §3, l'alerte Discord active par défaut.
