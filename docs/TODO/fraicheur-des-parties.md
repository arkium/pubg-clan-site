# Fraîcheur des parties — indicateur et alertes

> Plan du 2026-10-28, à la suite de la synchronisation toutes les 30 minutes ([synchro-parties-30-min.md](synchro-parties-30-min.md),
> déployée le 2026-10-27). **Implémenté le 2026-10-30, non déployé** : état au §9. But : voir, sans requête lourde, si les parties arrivent vite, si la
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

### 1 bis. Les cases rouges de « Activité du jour » (`/settings/pubg-api`, 2026-10-29)

La grille montrait 8 tranches rouges dans la journée. En base :

- **13 échecs sur 11 679 appels (0,11 %)**, tous sur `matches/{id}` de la synchronisation des parties ; aucun 429.
  Une tranche passe au rouge **dès un seul échec** (`pointTone` : `errors > rateLimited`), sur 300 à 380 appels par
  tranche.
- **10 × 404 « partie pas encore publiée »** : la liste des parties d'un joueur éliminé contient la partie **environ
  4 minutes avant sa fin** (médiane du 404 par rapport à la fin `pubgCreatedAt + duration`, 7 jours) — `matches/{id}`
  répond 404 tant que PUBG ne l'a pas publiée. C'est attendu, et ancien : 20 à 45 par jour avant le 2026-10-27, 10 à 14
  depuis.
- **3 × 502 / 504 à 19:08 UTC**, une minute, deux parties : incident passager chez PUBG ; aucune relance dans le tour
  (`retryCount` 0), les deux parties importées au tour suivant.
- **Récupération** (3 jours, 36 parties en 404) : 33 importées, médiane **24 min** après le 404 (tour suivant) ;
  mais **90 % sous 4 h 36** — une partie sur dix n'est rappelée que par la synchronisation de la carrière (toutes les
  4 h). Exemple : `f131a4aa…`, 404 à 14:27 UTC, aucun nouvel appel depuis. Probablement une partie vue seulement dans
  `/seasons/lifetime` (rattrapage de la carrière) : on ne peut pas le vérifier, ce rattrapage journalise sous la même
  origine `clan-match-sync` que la synchronisation.
- **Une partie jamais publiée** (`cdd1bc38…`, 4 essais en 404 sur une journée) : perdue, sans que rien ne le dise.

Le plan initial (délai, tours, quota, 429) ne voyait **rien** de cela : ces échecs ne déplacent ni le délai médian ni le
quota. Il faut distinguer les échecs attendus des vrais incidents, et suivre les parties en échec jusqu'à leur import
(lot 6).

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
| Échecs « à traiter » (401, 403, 400, 422…), 24 h | 0 | — | ≥ 1 | clé refusée ou appel mal formé : rien ne se répare seul |
| Échecs passagers PUBG (5xx, délai dépassé, réseau), dernière heure | < 10 | ≥ 10 | — | incident PUBG qui dure : les parties attendent |
| Parties perdues (toujours pas importées 24 h après le premier échec) | 0 | ≥ 1 | — | une partie (un Top 1, peut-être) manque au site |

Les 404 « partie pas encore publiée » ne comptent dans aucun seuil : ils sont attendus et repris au tour suivant ; seule
une partie qui reste en échec 24 h devient « perdue ».

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

### Lot 6 — Échecs PUBG classés et parties en attente (§1 bis)

- **Classement pur** (`src/lib/pubg-api-call-category.ts`) : `classifyPubgApiFailure(statusCode)` → `expected` (**toute
  404** : partie pas encore publiée, joueur ou clan introuvable), `transient` (5xx, échec réseau sans code), `rateLimited`
  (429), `action` (401, 403, 400, 422, autre 4xx). Décision du 2026-10-30, sur 14 jours de production : 378 des 391
  échecs étaient des 404 sur `matches/{id}`, `players?filter`, `players/{id}` et `clans` — tous « absent chez PUBG » ;
  13 des 5xx ou des appels sans réponse ; aucun 401, 403 ni 422. Classer la 404 selon l'endpoint n'apportait rien.
- **Grille « Activité du jour » et tendance sur 14 jours** : ton d'une tranche par une fonction pure testée
  (`pubgApiSlotTone`, sortie de la page) — rouge pour au moins un échec `action` ou 3 échecs `transient` ; orange pour
  les 429 (inchangé) ; les `expected` ne colorent plus la tranche, ils restent comptés dans l'infobulle. « Erreurs les
  plus fréquentes » regroupées par classe, avec une phrase par classe (« Partie pas encore publiée par PUBG : reprise au
  tour suivant »). Légende mise à jour.
- **Parties en attente** (dans `AppConfig.match_sync_health`, `pending`) : chaque partie dont `matches/{id}` échoue
  pendant la synchronisation y entre (identifiant, membre, clan, premier échec, essais, dernier code) ; **le tour suivant
  du clan la retente même si elle n'est plus dans la liste lue chez PUBG** (supprime la traîne de 4 h du §1 bis) ;
  sortie à l'import. Au-delà de 24 h ou de 6 essais : « perdue », gardée 7 jours pour l'affichage, plus retentée.
- **Origine propre au rattrapage de la carrière** (`clan-lifetime-catchup` au lieu de `clan-match-sync`) : le journal
  dit enfin quel chemin a vu la partie.
- **Une relance dans le tour pour un échec passager** de `matches/{id}` (5xx, délai dépassé), après 5 s, une seule : le
  502 de 19:08 aurait été absorbé sans attendre 30 min. Les 404 ne sont pas relancés dans le tour (la partie n'est pas
  publiée, le tour suivant suffit).
- **Affichage** : dans le bloc « Fraîcheur des parties » de `/settings/cron`, une tuile **Parties en attente** (nombre,
  plus ancienne, perdues sur 7 jours) avec la liste dépliable (partie, clan, premier échec, essais, code) ; sur
  `/settings/pubg-api`, une ligne « Échecs du jour » par classe.
- **Alertes** : seuils du §3 (`action`, `transient`, parties perdues) dans `summarizeMatchSyncHealth`, donc dans « À
  traiter » et l'alerte Discord du lot 4. Les compteurs d'échecs par classe sont pris par `finishMatchSyncPass` (un
  `COUNT … GROUP BY statusCode` sur la dernière heure, par l'index `startedAt`).

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
| `pubg-api-call-category.test.ts` (lot 6) | `classifyPubgApiFailure` : 404 sur `matches/{id}` = `expected`, 404 sur un autre endpoint ≠ `expected`, 502 / 504 / code absent = `transient`, 401 / 403 / 422 = `action`, 429 = `rateLimited` ; `pubgApiSlotTone` : une tranche avec seulement des 404 attendus reste verte, un 401 la rend rouge, 2 × 502 non, 3 × 502 oui, 429 orange |
| `matches-sync-service.test.ts` (lot 6) | partie en 404 ajoutée aux parties en attente ; retentée au tour suivant **alors qu'elle n'est plus dans la liste PUBG** ; retirée à l'import ; « perdue » après 24 h ou 6 essais et plus retentée ; un 502 relancé une fois après 5 s dans le tour, un 404 jamais ; le rattrapage de la carrière journalise `clan-lifetime-catchup` |
| `match-sync-health.test.ts` (lot 6) | seuils `action` (≥ 1 = urgent), `transient` (≥ 10 / h = todo), parties perdues (≥ 1 = todo) ; les 404 attendus n'entrent dans aucun seuil ; la liste `pending` reste bornée (200 entrées) |
| existants | `tutoiement.test.ts` (nouveaux textes), `admin-action-log-routes.test.ts` (routes en lecture seule : rien à envelopper), `cron-schedules-route-contracts.test.ts` (aucun `cron.schedule`) |

## 6. Playwright (`e2e/`, toutes les API figées)

- `e2e/site-config.spec.ts` (page `/settings/cron`) : bloc « Fraîcheur des parties » en ordre (quatre tuiles et leurs
  chiffres), en état dégradé (tons, raisons), vide (« Pas encore de mesure », aucun « 0 min ») ; nouveau libellé de la
  carte du service cron. Réponse figée de `GET /api/settings/match-sync-health` dans `mockCronSettings`.
- `e2e/pubg-api-settings.spec.ts` (nouveau — la page n'a aucun test) : ligne « Quota » à 70 % et à 97 %, détail par
  priorité ; grille avec seulement des 404 attendus → aucune tranche rouge, avec un 401 → tranche rouge ; « Échecs du
  jour » par classe ; réponses figées de `pubg-api-calls` et `pubg-api-rate-limit`.
- `/settings/cron` : tuile « Parties en attente » (vide, deux en attente, une perdue) et sa liste dépliable.
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
6. Échecs (lot 6), sur une journée ordinaire : plus aucune tranche rouge pour des 404 attendus ; parties en 404
   importées en 90 % sous 1 h (contre 4 h 36 le 2026-10-29) ; aucune partie « perdue » hors partie jamais publiée par
   PUBG — chaque partie perdue est vérifiée à la main une fois (`matches/{id}` relu, sans clé, hors file). Mesure par
   `scripts/check-match-sync-health.ts`, qui lit le journal **une seule fois par l'index `startedAt`** et croise en
   mémoire : jamais de `LIKE '%…'` corrélé sur `PubgApiCallLog` (le 2026-10-29, une telle lecture a tourné 10 min en
   production avant d'être interrompue).

## 8. Hors de ce plan

- **Fraîcheur visible des joueurs** (« parties à jour il y a 12 min » sur les pages d'un clan) : à décider après une
  semaine de mesures, le même résumé pourrait la servir par clan.
- **Colonne `priority` dans `PubgApiCallLog`** : inutile tant que l'origine suffit (lot 2) ; migration seulement si deux
  priorités devaient partager une origine.
- **Une file par processus** (web, cron, worker pour une seule clé) : la garde sur `X-RateLimit-Remaining` évite les 429
  (aucune depuis le 2026-10-27) ; le seuil 429 du §3 dira s'il faut aller plus loin.
- **Télémétrie** : 90 % sous 2,2 h après l'import ; la file du worker a déjà son indicateur sur `/settings/telemetry`.

## 9. État (2026-10-30)

Plan écrit le 2026-10-28 (lot 6 le 2026-10-29), **implémenté le 2026-10-30, non déployé**. Seuils du §3 retenus tels
quels (constantes `MATCH_SYNC_THRESHOLDS`, `TRANSIENT_FAILURES_ALERT`) ; alerte Discord active par défaut.

| Lot | Fait |
|---|---|
| 6 — échecs classés, parties en attente | `classifyPubgApiFailure`, `pubgApiSlotTone` (grille et tendance de `/settings/pubg-api` : les 404 ne rougissent plus rien), « Échecs du jour » regroupés par classe, code et type d'appel (`topFailures`, au lieu d'un message par partie) ; KPI « Erreurs » hors 429 et 404 attendus ; parties en attente (`PendingMatchTracker`, retentées au tour suivant même absentes de la liste PUBG, perdues après 24 h ou 6 essais) ; relance unique d'un 5xx de `matches/{id}` après 5 s (`api-throttle.ts`) ; origine `clan-lifetime-catchup` |
| 1 — mesure | `matches-sync-service.ts` rend `newMatchDelaysMinutes` / `catchUpMatches` ; `match-sync-health.ts` (pur : état glissant, résumé, seuils, décision d'alerte) ; `match-sync-health-service.ts` (une lecture au début d'un tour, une écriture à la fin, tours sautés, comptage des appels PUBG en une requête) ; branchement dans `runDailyClanSync` |
| 2 — quota | origines explicites (`clan-lifetime-sync`, `season-stats-sync`, `weapon-mastery-sync`, `clan-stats-sync`, `clan-membership-sync`, `player-lookup`) ; priorité basse ajoutée aux noms du kill feed et au cycle de vie de nuit ; `PUBG_API_SOURCE_PRIORITIES` ; ligne « Quota » de « Activité du jour » (dernière heure par priorité, heure la plus chargée) |
| 3 — affichage | `GET /api/settings/match-sync-health` ; `MatchSyncHealthCard` en tête de `/settings/cron` (aussi sans clan sélectionné) ; carte « Service des tâches (cron) » |
| 4 — alertes | ligne `match_sync` de la boîte « À traiter » (production seulement) ; événement `match_sync_degraded`, messages `matchSyncDegradedAlert` / `matchSyncRecoveredAlert` (sans mention, option `withoutMention` de `sendAdminAlert`) |
| 5 — documentation | `docs/ops/cron.md`, `docs/features/discord-notifications.md`, `CLAUDE.md`, ce plan, `docs/sommaire.md` |

**En passant** : la tendance sur 14 jours de `/settings/pubg-api` rangeait les appels par date UTC mais ses jours à
partir du minuit local — sur un serveur qui n'est pas en UTC (un poste de dev), aucun appel du jour n'y apparaissait.
Corrigé (même horloge pour les deux) ; la production, en UTC, n'était pas touchée.

**Tests** : `match-sync-health.test.ts` (20), `match-sync-health-service.test.ts` (10, dont le contrôle statique du
branchement dans `cron-jobs.ts`), `match-sync-health-route-contracts.test.ts` (4), `pubg-api-call-category.test.ts`
(classement, ton, priorité de chaque origine contrôlée sur le code), `pubg-api-call-log-service.test.ts` (échecs par
classe, regroupement, quota ; passe à l'heure de Paris comme en UTC), `api-throttle.test.ts` (+3 : relance d'un 5xx, une
seule, jamais d'une 404 ni d'un endpoint limité), `matches-sync-service.test.ts` (+4 : délais, parties en attente,
retentée hors liste, origine du rattrapage), `admin-inbox.test.ts` (+2), `admin-alerts.test.ts` (+2) ; suite complète
verte. Playwright : `e2e/pubg-api-settings.spec.ts` (nouveau : grille, échecs du jour, quota), `e2e/site-config.spec.ts`
(+3 : bloc en ordre, dégradé, vide), `e2e/platform-hub.spec.ts` (+1), `e2e/clan-lifecycle.spec.ts` (9 alertes à
mention sur 12) — quatre projets ; rendu vérifié en clair et en sombre, ordinateur et mobile.

**Mesure de référence** (`scripts/check-match-sync-health.ts`, base de production, 24 h jusqu'au 2026-10-30 16:55 UTC) :
1 960 parties (par clan et par partie), délai médian 15 min, 90 % sous 28 min ; 48 tours, durée médiane 12 min ;
545 / 600 appels limités sur la dernière heure, aucun 429 ni échec à traiter. À comparer, le lendemain du déploiement,
à la mesure de la synchronisation (§7).

**Après le déploiement** : §7 (contrôles 1 à 6). Rien à régler : la clé `AppConfig.match_sync_health` se crée au premier
tour ; l'alerte se coupe, si besoin, sur la page « Cycle de vie des clans ».
