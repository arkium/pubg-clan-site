# Synchronisation des parties toutes les 30 minutes

> Plan du 2026-10-27, à la suite d'une question de joueur : « un Chicken Dinner à 18 h, rien sur Discord à 18 h 30,
> c'est normal ? ». Mesures et vérifications faites en production (lecture seule, et 14 appels directs à l'API PUBG
> pour la vérification du §2). **Implémenté le 2026-10-27, non déployé** : état au §8. *Destiné à l'utilisateur et à
> l'équipe de développement.*

## 1. Constat

L'alerte Top 1 sur Discord part quand le site importe la partie (`analyzeMatchForSquads` → `notifyTop1IfEligible`),
c'est-à-dire à la synchronisation des parties du clan (`daily_sync`, réglée en base sur `0 * * * *`, toutes les heures).

| Mesure (production) | Valeur |
|---|---|
| Délai entre la fin d'une partie et son alerte Top 1 (14 jours, hors rattrapages > 24 h) | médiane **2 h**, 75 % sous 2 h 50, 90 % sous 4 h ; 18 alertes sur 55 sous 1 h |
| Intervalle réel entre deux synchronisations d'un même clan (3 jours) | médiane **4 h 20**, 90 % sous 11 h 15 |
| Alertes Top 1 parties plus de 24 h après la partie (rattrapage d'anciennes parties) | 51 sur 106 en 14 jours |
| Quota de la clé PUBG au premier appel de la vérification | **0 restant** : la fenêtre de 10 appels / minute est pleine |

**Pourquoi.** Les 44 clans sont relus l'un après l'autre et chaque appel attend son tour dans une file à 10 appels par
minute (un toutes les 6 s, `src/lib/api-throttle.ts`) : un tour complet dure plusieurs heures, et un déclenchement qui
tombe pendant un tour est sauté (`clanSyncInProgress`). Régler le cron sur 30 minutes ne changerait donc rien.

Appels PUBG des dernières 24 h (`PubgApiCallLog`) :

| Endpoint | Appels | Limité par PUBG ? |
|---|---:|---|
| `matches/{id}` | 7 458 | **non** — aucune des 7 458 réponses n'a d'en-tête de limite |
| `players/{id}` | 4 352 | oui (10 / min) |
| `players/{id}/seasons/lifetime` | 3 319 | oui |
| `players/{id}/seasons/{saison}` | 1 416 | oui |
| `clans/{id}` | 1 189 | oui |
| `players?filter[playerIds]=…` (10 joueurs par appel) | 814 | oui |

Aucune réponse 429 sur 24 h : la file tient le quota, mais elle est pleine. Deux gaspillages :

1. **Deux appels limités par membre et par tour** (`players/{id}` et `seasons/lifetime`, `matches-sync-service.ts`) :
   739 membres → 1 478 appels, 2 h 28 de quota au minimum, alors qu'un tour de 30 minutes en permet 300.
2. **`matches/{id}` attend lui aussi 6 s** alors que PUBG ne le limite pas : ≈ 12 h de file perdues par jour. Le même
   détail de partie est en plus relu une fois par membre du clan présent.

## 2. Vérifications (2026-10-27)

- **Lecture groupée = lecture individuelle** : `players?filter[playerIds]` (10 joueurs) rend, pour 3 joueurs sur 3, les
  mêmes parties que `players/{id}` (207, 53 et 180 parties, identiques).
- **`seasons/lifetime` n'apporte presque rien** : 420 parties sur 10 joueurs, **1** absente de la lecture groupée
  (probablement une partie terminée entre les deux lectures). Elle est rattrapée par la synchronisation de la carrière,
  qui lit déjà cette réponse (§3, point 4).
- **`matches/{id}` n'est pas limité** : la réponse arrive même sans clé, sans `X-RateLimit-Limit`.

## 3. Plan

1. **Parties récentes lues par lots de 10** (`fetchRecentMatchIdsForPlayers`, déjà employé pour les tournois) : un appel
   pour 10 membres au lieu de deux par membre. 739 membres → **74 appels** par tour, ≈ 7 minutes de quota.
2. **`matches/{id}` hors de la file à 6 s** : quatre lectures en parallèle au plus, toujours journalisées
   (`PubgApiCallLog`) et relancées sur un 429 ; un même détail n'est lu qu'une fois par tour de clan.
3. **Priorités dans la file** : *haute* pour la synchronisation des parties (et des manches de tournoi), *basse* pour les
   tâches de fond (carrière, saisons, résolution des clans des joueurs croisés) ; la file sert la plus haute d'abord.
4. **Carrière toutes les 4 heures** (`daily_lifetime_stats_sync`, défaut `0 */4 * * *`, comme dans le jeu), en
   priorité basse. Elle lit `seasons/lifetime` pour chaque membre : les parties qu'elle y voit et que le site n'a pas
   sont importées au passage (rattrapage du §2, sans appel supplémentaire).
5. **Synchronisation des parties toutes les 30 minutes** (défaut de `daily_sync` : `*/30 * * * *`). La surcharge en base
   (`CronSchedule`, `0 * * * *`) l'emporte : **la passer à `*/30 * * * *` dans `/settings/cron-schedules` après le
   déploiement**.
6. **Page Discord** (`/clans/[clanId]/settings/discord`) : le délai d'une alerte, calculé d'après la fréquence réelle de
   la synchronisation (« les parties du clan sont relues toutes les 30 minutes : compte jusqu'à 45 minutes après la fin
   de la partie »).
7. **Mesure** : `scripts/measure-sync-latency.ts` (lecture seule) — délai des alertes, intervalle entre deux
   synchronisations d'un clan, appels par endpoint, 429 — avant et après.

## 4. Budget attendu (appels limités, par heure)

| Tâche | Avant | Après |
|---|---:|---:|
| Synchronisation des parties | ≈ 340 (un tour en 4 h 20) | ≈ 150 (74 par tour, 2 tours) |
| Fiche PUBG du clan après un import (`clans/{id}`, `syncTrackedClanStats`) | ≈ 11 | ≤ 88 le soir (un par clan ayant de nouvelles parties, par tour) |
| Carrière | ≈ 30 (une fois par nuit) | ≈ 185 (739 toutes les 4 h), en priorité basse |
| Résolution des joueurs croisés, saisons, cycle de vie | ≈ 220 | inchangé, en priorité basse |
| **Total** | ≈ 600 (plein) | ≈ 530 au plus fort, dont 150 prioritaires |

La synchronisation des parties ne dépend plus du reste : ses 74 appels passent devant. Chaque tâche n'attend qu'un
appel à la fois (boucles séquentielles) : pendant un tour, la priorité haute prend presque tous les créneaux, et les
tâches de fond reprennent ensuite — elles ralentissent, elles ne s'arrêtent pas. Délai attendu d'une alerte :
le temps que PUBG publie la partie (quelques minutes), plus l'attente du tour suivant (30 minutes au plus) et le passage
du clan dans le tour — **15 à 45 minutes** au lieu de 2 à 4 heures.

## 5. Tests

- `api-throttle.test.ts` : priorités (la haute passe devant), `matches/{id}` sans attente de 6 s, au plus quatre en
  parallèle, toujours journalisé.
- `matches-sync-service.test.ts` : lots de 10 par shard, plus aucun appel `players/{id}` ni `seasons/lifetime`, un détail
  de partie lu une fois pour plusieurs membres, membre absent de la réponse PUBG signalé.
- `clan-service` (carrière) : parties vues seulement par `seasons/lifetime` importées, les autres non.
- Défauts des tâches (`site-config.test.ts`), délai annoncé (`discord-sync-delay`), page Discord (Playwright).

## 6. Après le déploiement

1. Dans `/settings/cron-schedules` : `daily_sync` à `*/30 * * * *`. Vérifier que le `.env` du serveur ne fixe pas
   `CLAN_LIFETIME_STATS_SYNC_CRON` (sinon le passer à `0 */4 * * *`).
2. Le lendemain : `npx tsx --conditions=react-server --tsconfig ./tsconfig.json scripts/measure-sync-latency.ts` et
   comparer au §1 (délai des alertes, intervalle par clan, aucun 429).

## 7. Hors de ce plan

- **Alertes de rattrapage** : une ancienne partie importée tard (nouveau membre, carrière) part encore sur Discord
  (51 alertes sur 106 en 14 jours, jusqu'à 9 jours après la partie). Proposition : pas d'alerte au-delà de 24 h.
- **Une file par processus** : le web, le cron et le worker ont chacun leur file à 10 / min pour une seule clé ; la
  garde sur `X-RateLimit-Remaining` évite les 429 (aucun en 24 h). À surveiller avec la mesure du §6.

## 8. État (2026-10-27)

Implémenté, testé, **non déployé** :

| Point du §3 | Fait |
|---|---|
| 1. Lots de 10 | `matches-sync-service.ts` : `loadRecentMatchIds` (par shard, un lot en échec n'atteint que ses membres), `importMemberMatches` ; source `clan-match-sync` dans le journal PUBG |
| 2. `matches/{id}` hors file | `api-throttle.ts` : `isUnthrottledPubgEndpoint`, quatre lectures en parallèle (`UNTHROTTLED_CONCURRENCY`), journal et relance sur 429 inchangés ; cache par passage (`MatchResponseCache`, `fetchMatchDetails`) |
| 3. Priorités | `PubgApiPriority` (`high` / `normal` / `low`) dans `PubgApiCallContext` ; haute : synchronisation des parties, découverte des manches de tournoi ; basse : carrière, saisons, maîtrise d'armes, cron de résolution des joueurs croisés |
| 4. Carrière toutes les 4 h | défaut `0 */4 * * *` ; `fetchLifetimeStats` rend `recentMatchIds`, `syncClanLifetimeStats` les passe à `importMatchesForMember` (une lecture de la base quand rien n'est nouveau) |
| 5. Parties toutes les 30 min | défaut `*/30 * * * *` (`cron-jobs.ts`, `site-config.ts`, prochain passage estimé sur `/settings/telemetry`) ; libellés « Sync des parties des clans », « Sync carrière (lifetime) » |
| 6. Page Discord | bloc « Pas en direct… » sous l'interrupteur des alertes Top 1 (`describeTop1Delay`, `top1Delay` de `GET …/settings/discord`) |
| 7. Mesure | `scripts/measure-sync-latency.ts` |

**Mesure avant** (`measure-sync-latency.ts`, 3 jours, 2026-10-27) : 77 alertes Top 1 dont 51 rattrapages ; délai
médian 2,3 h, 75 % sous 3,8 h, 90 % sous 6,1 h, 7 sur 26 sous 45 min ; synchronisation d'un clan toutes les 4,3 h en
médiane (90 % sous 11,3 h) ; 477 appels limités par heure en médiane (max 536), aucun 429 ; `matches/{id}` 7 369 appels
par jour, non limités.

**Tests** : `api-throttle.test.ts` (priorités, parties hors file, quatre en parallèle, journal),
`matches-sync-service.test.ts` (lots par shard, plus d'appel par membre, cache partagé, erreurs par lot, compte
résolu, rattrapage), `pubg-sync-reads.test.ts` (cache, `recentMatchIds`, priorité transmise), `clan-lifetime-sync.test.ts`
(priorité basse, rattrapage sans faire échouer la carrière), `discord-sync-delay.test.ts`, `discord-route-contracts.test.ts`
(`top1Delay`), `clan-stats-route-contracts.test.ts` et `tournament-round-discovery.test.ts` mis à jour ; Playwright
`e2e/discord-settings.spec.ts` (délai à 30 min et à l'heure, rien sans délai connu ; 4 projets).
