# Place d'un clan dans une partie partagée

> Constat du 2026-10-27, relevé en vérifiant une réponse du Coach IA (fil 5 : « ils ne sont pas de mon clan »).
> **Corrigé le 2026-10-27 dans la copie de travail — ni commité, ni déployé.** Recalculs à lancer après le déploiement :
> §8. *Destiné à l'équipe de développement.*

## 1. Le défaut

`SquadMatch` est unique par partie PUBG (`pubgMatchId @unique`) et rassemble **tous les joueurs suivis du lobby**, quel
que soit leur clan. Chaque clan qui synchronise la partie y attache ses membres (`analyzeMatchForSquads`,
[squad-detector.ts](../../src/lib/squad-detector.ts)) : le premier crée la ligne avec la place de **son** équipe
(`SquadMatch.placement = detectedSquad.placement`), les suivants ajoutent leurs `SquadMember` sans toucher à la place.

Le commentaire de `analyzeMatchForSquads` imposait déjà que les **totaux** (`totalKills`, `totalDamage`…) soient
recalculés par chaque consommateur depuis les `SquadMember` de son clan. La **place** n'avait pas reçu la même règle :
presque toutes les lectures prenaient `SquadMatch.placement` comme celle du clan affiché.

Ce qui est fiable : `SquadMember.placement` = `winPlace` du joueur ([pubg.ts](../../src/lib/pubg.ts)), la place de
**son équipe**.

**Correction de la fiche initiale** (mesure du 2026-10-27) : les membres d'un même clan dans une partie ne viennent pas
toujours d'un seul roster. Sur 41 368 couples clan × partie (clans non système, tout l'historique), **1 214** ont des
membres à des places différentes (537 depuis le 1er octobre) : des membres attachés à des moments où l'effectif du clan
différait (nouveaux venus, changements de clan), et les manches de tournoi, qui attachent tous les joueurs suivis du
lobby. La règle « plus petite place » donne alors la meilleure équipe du clan.

## 2. Ampleur (production, lecture seule, 2026-10-27)

Parties de clan depuis le 1er octobre 2026, place de la ligne comparée à la meilleure place des membres du clan :

| | Parties de clan | Places fausses | Top 1 comptés à tort | Top 1 manqués |
|---|---:|---:|---:|---:|
| Tous les clans | 18 695 | **1 155** (6,2 %) | **85** | **90** |
| Clan 201 | 2 253 | 141 | 8 | 9 |
| Clan 16 | 1 416 | 81 | 8 | 15 |
| Clan 25 | 1 383 | 72 | 4 | 7 |
| Clan 429 | 641 | 72 | 3 | 7 |

1 109 parties partagées par au moins deux clans suivis depuis le 1er octobre, dont 132 au Top 1 discordant. Exemple :
partie `cmuuc4zi30mn904srtelemx86`, place enregistrée 24 (l'escouade du clan 7), place du clan 25 : 12.

Requête de la mesure, rejouée par `scripts/measure-shared-placement.ts` (§7) :

```sql
SELECT t.clanId, COUNT(*) AS matches,
       SUM(t.matchPlacement <> t.clanPlacement) AS wrong,
       SUM(t.matchPlacement = 1 AND t.clanPlacement <> 1) AS falseWins,
       SUM(t.matchPlacement <> 1 AND t.clanPlacement = 1) AS lostWins
  FROM (
    SELECT cm.clanId, sm.id, sm.placement AS matchPlacement, MIN(sq.placement) AS clanPlacement
      FROM SquadMember sq
      JOIN ClanMember cm ON cm.id = sq.memberId
      JOIN SquadMatch sm ON sm.id = sq.squadMatchId
     WHERE sm.createdAt >= '2026-10-01' AND cm.clanId IS NOT NULL
     GROUP BY cm.clanId, sm.id, sm.placement
  ) t
 GROUP BY t.clanId
 ORDER BY wrong DESC;
```

## 3. Règle retenue

> La place d'un clan dans une partie = la plus petite `SquadMember.placement` non nulle de ses **membres actifs**.
> `SquadMatch.placement` ne se lit plus. La place d'un **joueur** est la sienne (`SquadMember.placement`, ou
> `Match.placement`).

- **En mémoire** : `clanPlacementOf(match, clanId)` (`null` sans membre classé), `clanPlacementTeam` (l'équipe qui a
  obtenu la place), `playerTeamOf` (l'équipe d'un joueur : les membres classés à sa place) —
  [clan-placement.ts](../../src/lib/clan-placement.ts), module pur, importable côté client.
- **En SQL** : `CLAN_PLACEMENT_SQL` (`MIN(CASE WHEN cm.isActive = 1 AND cm.joinStatus = 'active' AND sq.placement > 0
  THEN sq.placement END)`, dans un `GROUP BY` clan × partie) et `clanPlacementSubquery(clanId)` (une ligne par partie) —
  [clan-placement-sql.ts](../../src/lib/clan-placement-sql.ts). NULL sans membre classé : `SUM(placement = 1)` et
  `AVG(placement)` l'ignorent.
- **Filtre Prisma** : `clanPlacementMemberWhere(clanId)` et `CLAN_PLACEMENT_MEMBER_SELECT`.

**Critère d'appartenance : les membres actifs** (`clanId`, `isActive`, `joinStatus = 'active'`), et non le seul clan
actuel du membre :

1. c'est déjà la règle des agrégats les plus lus — Ligue, Cartes, cache des matchs, comparateur, tête-à-tête,
   classements (« règle du comparateur », isolation des suivis `tracked`) : la place sort des **mêmes lignes** que les
   kills et dégâts affichés à côté ;
2. un joueur au suivi arrêté, une demande en attente ou refusée ne donne pas sa place au clan ;
3. mesuré en production : sur 48 680 couples clan × partie, la place est **identique** sous les deux critères ; seuls 36
   couples (un clan archivé) n'ont aucun membre actif.

Le même critère sert partout : les consommateurs qui sélectionnaient les parties par `{ clanId }` ou
`{ clanId, isActive }` (route des matchs, vitrine du clan, Coach, analyse d'escouade) passent à
`clanPlacementMemberWhere`.

Aucune migration : `SquadMember.placement` existe et n'est jamais nulle (0 ligne à 0 sur 110 773).

## 4. Inventaire (2026-10-27)

`grep -rlE "sm\.placement|squadMatch\.placement|match\.placement|placement === 1" src` : 40 fichiers hors tests, plus les
lectures par `select: { placement }`, `where: { placement: 1 }`, SQL sans alias et requêtes sans `select`.

| Fichier(s) | Lecture | Catégorie | Correction |
|---|---|---|---|
| discord/discord-service.ts | `squadMatch.placement !== 1` | place du clan, **fausse** | `clanPlacementTeam` : place et équipe gagnante du clan |
| clan-league-service.ts (→ clan-league.ts) | `sm.placement` par clan | **fausse** | `CLAN_PLACEMENT_SQL` |
| clan-map-stats-service.ts (→ clan-maps.ts) | `sm.placement` (clan, moyenne des clans) | **fausse** | `CLAN_PLACEMENT_SQL` |
| api/clans/[clanId]/matches (→ match-sessions.ts, composants) | `match.placement`, `isWin`, performers | **fausse** | `clanPlacementOf`, `select` sans la colonne |
| matches-cache-service.ts (`ClanMatchesCache`) | `match.placement` | **fausse** | `clanPlacementOf` ; `buildClanMatchesCachePayloads` sans écriture |
| stats-calculator.ts (`PlayerStats.matchesWon`) | `squadMatch.placement` | **fausse** (joueur) | place du joueur |
| challenge-service.ts (`win_streak`) | `squadMatch: { placement: 1 }` | **fausse** (joueur) | place du joueur |
| notification-service.ts | `squadMatch.placement` | juste à la création seulement | place de chaque joueur |
| clan-directory-service.ts (→ clan-directory.ts) | `sm.placement` → `wins7` | **fausse** | place de chaque membre, `clanPlacementOf` |
| clan-showcase-service.ts (→ clan-showcase.ts) | `placement` sélectionné | **fausse** | `clanPlacementOf`, `clanPlacementTeam` |
| home-showcase-service.ts (vitrine `/`) | `SUM(placement = 1)`, `where: { placement: 1 }`, totaux de la ligne | **fausse** | `CLAN_PLACEMENT_SQL` ; équipe gagnante, ses kills et dégâts |
| clan-comparator-service.ts (`ClanComparatorCache`) | `match.placement` | **fausse** | `clanPlacementOf` ; `buildClanComparatorPayload` exportée |
| api/members/[id]/dashboard | frères d'armes (`squadMatch.placement`, tous clans), coéquipiers | **fausse** | place du joueur, membres actifs de son clan dans son équipe |
| api/members/[id]/activity-heatmap, map-stats, telemetry/drop-zones | meilleure équipe : `match.placement`, compositions tous clans | **fausse** | `playerTeamOf` / `clanPlacementTeam` |
| api/clans/[clanId]/telemetry/recoveries (admin) | `sm.placement` | **fausse** | `clanPlacementSubquery` |
| coach/coach-tools.ts | getRecentMatches, getSessions, getPlaySchedule (clan), getDropZones ; escouades tous clans ; `totalKills` de la ligne | **fausse** | `clanSquadRow` (clan : ses membres actifs ; joueur : son équipe) |
| coach/coach-context-service.ts | contexte de page « match » | **fausse** | `clanPlacementOf`, kills des membres |
| pubg-telemetry/match-debrief-payload.ts | repli `row.placement` sans équipe connue ; totaux de la ligne | **fausse** (repli) | membres de l'équipe mise en avant |
| pubg-telemetry/match-replay-loader.ts (→ match-replay.ts) | `sm.placement` (non affiché) | **fausse** | `clanPlacementSubquery` |
| telemetry-geo-purge.ts | `m.placement = 1` protège les Top 1 | **fausse** : le Top 1 d'un 2e clan était purgeable | `EXISTS` d'un joueur suivi classé 1er |
| squad-detector.ts | findBestPairs/Squads/WinRates, getClanSquadAnalysis (sans appelant), `calculateSquadStats` | **fausse** | `clanPlacementOf` ; plus de `winRate` tiré de la ligne |
| head-to-head-service.ts, players-ranking-service.ts, api leaderboard | `SquadMember.placement` | place d'un membre, juste | — |
| clan-stats-cache.ts (`Clan.clanStats`), members/calendar, members/matches, members/cards, dashboard (meilleure partie) | `Match.placement` | place d'un membre, juste | — |
| tournaments/standings ×2, tournament-*, discord-tournament-* | lignes d'équipe (`splitIntoPubgTeams`) | tournoi, juste | exception justifiée du contrôle |
| composants (MatchResultCard, SessionFlightPlan, SessionLogbook, SquadMatchList, PlayerDashboardSections, PlayerMatchesSections, MatchDebriefView, TournamentDetailSections), player-dashboard.ts, player-matches.ts, coach-context.ts | champ `placement` d'une réponse d'API | affichage | justes dès que l'API l'est |
| pubg-telemetry/match-teams.ts, parser.ts, matches-sync-service, matches/[matchId] | télémétrie, écriture de `Match` | juste | — |

## 5. Contrôle statique

[clan-placement-reads.test.ts](../../src/lib/clan-placement-reads.test.ts) lit toutes les sources de `src/` (tests
exclus, commentaires blanchis) et échoue sur : un appel `*.squadMatch.find…/aggregate/groupBy/count/update/upsert` qui
sélectionne, filtre ou trie sur `placement` ; un `find…` **sans `select`** (Prisma ramène alors la colonne) ; un bloc de
relation `squadMatch: { … placement … }` ; la propriété `.squadMatch.placement` ; en SQL, `<alias>.placement` d'un
`FROM / JOIN SquadMatch <alias>` ou `placement` nu sur un `SquadMatch` sans alias. Les blocs `members: { … }` sont ignorés.
Passé sur les versions `HEAD` des fichiers corrigés, il trouve les 40 lectures d'origine. Exceptions, par fichier et par
règle : `tournament-service.ts` (manches de tournoi), `pubg-telemetry/backlog.ts` et `manual-sync.ts` (pipeline de
télémétrie, `find…` sans `select` qui ne lisent pas la place).

## 6. Tests

| Fichier | Couvre |
|---|---|
| `clan-placement.test.ts` | `clanPlacementOf` et `CLAN_PLACEMENT_SQL` **exécuté sur SQLite** (`node:sqlite`, `test-stubs/sqlite-lobby.ts`) : deux clans dans la même partie, le clan B gagne une partie créée par le clan A, un seul clan, place 0 ignorée, membres non actifs, deux équipes du même clan |
| `shared-match-placement.test.ts` | vraies requêtes de la Ligue (`loadLeagueRows`, `leagueTableBetween`) et des Cartes (`loadClanMapStats`, moyenne des clans) sur SQLite : chaque clan d'une partie partagée avec sa propre place (Top 1, Top 10, place moyenne, points) |
| `shared-match-routes.test.ts` | route `GET /api/clans/[clanId]/matches` (place, Top 1, escouade limitée au clan, `select` sans la colonne), `PlayerStats.matchesWon`, défi `win_streak` |
| `discord/discord-service.test.ts` | le clan qui rejoint une partie gagnée par un autre ne reçoit rien ; celui qui gagne une partie créée par un autre reçoit l'alerte, avec ses seuls membres ; deux équipes : l'équipe gagnante seule ; pas de doublon |
| `coach/coach-tools.test.ts`, `coach/coach-context-service.test.ts` | place, Top 1 et escouade du clan (getRecentMatches, getSessions, getPlaySchedule, getDropZones), joueur dans l'autre équipe du clan, contexte de page |
| `clan-directory.test.ts`, `home-showcase-route-contracts.test.ts`, `member-routes-contracts.test.ts` | annuaire, vitrine (équipe gagnante, ses kills), frères d'armes et coéquipiers |

## 7. Mesures avant / après (production, lecture seule, 2026-10-27)

`npx tsx --conditions=react-server --tsconfig ./tsconfig.json scripts/measure-shared-placement.ts` (≈ 40 s) :

**Échantillon** : 30 parties partagées depuis le 1er octobre, 67 couples clan × partie, dont 34 à place discordante et 17
au Top 1 discordant ; la place attendue est recalculée par le script sans le code du site.

| Consommateur | Conformes |
|---|---|
| Ligue (`loadLeagueRows`) | 67 / 67 |
| Coach IA (`getSessions`, liste de la soirée) | 64 / 64 (3 hors des 40 parties listées) |
| Route des matchs (6 clans, mois) | 36 / 36 |
| Cartes et cache des matchs (Top 1, Top 10 du mois, 6 clans) | 6 / 6 clans |

**Top 1 du mois sur la page Cartes** (parties Normal), avant → après : clan 6 172 → 171, clan 7 55 → 52, clan 18 57 → 58,
clan 293 47 → 51, clan 26 68 → 72, clan 16 77 → 77.

**Ligue des clans (parties Normal)** :

- semaine : 22 clans classés, **11 changent de rang**, 6 de nombre de Top 1 — FRA 3e → 2e (Top 1 3 → 4), RATZ 2e → 3e,
  47R 13e → 8e (0 → 1), SRTY 8e → 10e (7 → 6), FUN 16e → 19e (4 → 2) ;
- mois : 34 clans classés, **16 changent de rang**, 24 de nombre de Top 1 — STAR 7e → 6e (47 → 51), RAF 6e → 7e
  (68 → 72), OKAY 15e → 14e, FR 14e → 15e ; tête inchangée (FD 1er, RATZ 2e).

Durées : la requête de la Ligue passe de 785 à 910 ms sur le mois et de 954 à 589 ms sur la semaine (mêmes ordres de
grandeur, caches de la base compris).

## 8. Recalculs à lancer après le déploiement (non lancés)

Tout passe par `scripts/recalc-shared-placement.ts`, **simulation par défaut**, `--apply` pour écrire (options
`--clan <id>`, `--only playerstats,matches-cache,comparator`) :

```bash
npx tsx --conditions=react-server --tsconfig ./tsconfig.json scripts/recalc-shared-placement.ts           # simulation
npx tsx --conditions=react-server --tsconfig ./tsconfig.json scripts/recalc-shared-placement.ts --apply   # écriture
```

Simulation du 2026-10-27 (avant déploiement ; les écarts des caches comptent aussi les parties jouées depuis le cron
de 03:00) :

| Agrégat | Écart | Écriture |
|---|---|---|
| `PlayerStats.matchesWon` / `winRate` | 737 lignes sur 7 119 (all 246, month 261, week 230), +85 Top 1 ; 394 lignes de période en cours périmées laissées au cron | `update` de ces deux colonnes, toutes périodes gardées (le cron ne refait que les périodes en cours) |
| `ClanMatchesCache` | 31 clans | `precomputeClanMatchesStats` |
| `ClanComparatorCache` | 35 clans | `computeClanComparatorStats` |

Sans script : le cron `daily_stats_recalc` (03:00) recalcule de lui-même les périodes en cours de `PlayerStats` (et leurs
badges `best_wr` / `mvp`), le cache des matchs et celui du comparateur ; la Ligue, la page Cartes, l'annuaire et les
vitrines se recalculent à la lecture (caches mémoire de 5 minutes) ; les défis actifs au prochain passage du cron
(`refreshChallengeProgressForClan`) — les défis terminés gardent leur résultat. `Clan.clanStats` n'est pas concerné : il
lit `Match.placement`, la place de chaque joueur. Les alertes Discord et les notifications déjà envoyées ne se rattrapent
pas.

## 9. Hors du chantier, relevé en chemin

- **Mode d'équipe compté sur tous les clans** : `leaderboard/route.ts` et `members/[id]/matches` dérivent duo / trio /
  squad de `SquadMatch._count.members` (tous les clans du lobby), et la seconde liste l'escouade sans filtre de clan.
- **Notification « partie en escouade »** : `notifySquadDetected` n'est appelée qu'à la création de la ligne ; les
  membres du 2e clan d'une partie n'en reçoivent pas.
- **`Clan.clanStats.quickStats`** compte des parties-joueurs (`Match`), pas des parties du clan.
- **Kills de la semaine sur la vitrine** : `SUM(SquadMatch.totalKills)`, les totaux du seul clan créateur.
- **Code sans appelant** : `getClanSquadAnalysis`, `findBestPairs`, `findBestSquads`, `getSquadWinRates`
  (squad-detector.ts), corrigés mais à supprimer.
