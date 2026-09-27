# Statistiques du clan — « Style de jeu » et « Carrière PUBG »

Livré le 2026-09-27 (maquette Claude Design « Statistiques » : `StyleJeuPropose`, `CarrierePropose`). Deux pages
remplacent l'ancienne page « Stats » et la page clan « Objets consommés » :

| Page | Adresse | Entrée de navigation | Données |
|---|---|---|---|
| Style de jeu du clan | `/clans/[clanId]/stats` | `clan.stats` | Télémétrie des parties, **filtrée par période** |
| Carrière PUBG du clan | `/clans/[clanId]/stats/career` | `clan.stats-career` (nouvelle) | API PUBG *lifetime*, **sans période** |

Les anciennes versions sont dans `archive/refonte-ui/statistiques/` (ignoré par git).

## 1. Ce que l'analyse de cohérence a corrigé

| Constat sur l'ancienne page / la maquette | Décision |
|---|---|
| « Engagement » (temps de jeu, parties, jours) venait de `PlayerStats`, c'est-à-dire des seules parties suivies par le site, présenté comme une carrière | Vraies valeurs PUBG : `timeSurvived`, `roundsPlayed`, `days` de l'API lifetime (§4) |
| Le filtre de période s'appliquait visuellement aux cumuls de carrière, qui ne dépendent d'aucune période | Carrière **sans** filtre de période : le bandeau montre la fraîcheur et la source |
| Objets consommés en double (page Stats et page dédiée), avec « Tous » par défaut | Une seule section sur « Style de jeu », période commune de la page (semaine par défaut) ; `/stats/items` redirige |
| Synergies en deux blocs (pairs puis `SquadSynergies`) sur deux types de match différents | Fusionnées en une section duo / trio / squad, parties **officielles** uniquement |
| Maquette : « PV soignés » | « Soins utilisés » : `heals` de l'API compte des **objets de soin**, pas des points de vie |
| Maquette : « synchronisé 4 fois par jour » | Fréquence lue dans la planification réelle (`daily_lifetime_stats_sync`, `0 4 * * *` → « une fois par jour ») |
| Maquette : pastille « N matchs analysés » sur la carrière | Nombre de joueurs synchronisés : la carrière ne dépend pas des matchs suivis |
| Maquette : podium en tête | Non repris : sur ces pages chaque carte porte déjà son top 3 (`RankCell`) |
| Émojis et anglicismes (« First contact », « Blue zone », « evt/m ») | Retirés ; vocabulaire de la refonte |
| Tableaux larges à défilement horizontal | **Pagination** (`Pagination`, 8 éléments par page) — aucune page ne défile horizontalement |

## 2. « Style de jeu du clan » (`/clans/[clanId]/stats`)

Bandeau : `PeriodFilter` + `usePagePeriod` (semaine par défaut). Au repos, le contexte (`N joueurs · X bots / match ·
Y positions / match`) et le lien « Carrière PUBG du clan → » ; ancres `SectionAnchorNav` quand le bandeau n'est pas
compact. Sur mobile docké : la période seule (`sticky.md` §2).

| Section (ancre) | Contenu | Source |
|---|---|---|
| Profil de jeu (`#sec-profile`) | Trois rôles — Fragger, Medic, Ghost — avec jauge de la moyenne du clan et top 3 (score > 0) ; trois thèmes — mobilité, gestion du cercle, survie. Retard au cercle et temps hors zone valent « — » quand ils ne sont pas mesurés | `GET …/telemetry/playstyle`, `GET …/bot-stats` |
| Objets consommés (`#sec-items`) | Indicateurs, familles (grille 2 colonnes), objets les plus consommés et objets par membre, **paginés par 8** | `GET …/telemetry/item-use` — voir [Objets consommés](objets-consommes.md) |
| Synergies (`#sec-synergies`) | Duo, Trio, Squad : taux de top 1 ensemble en barre, « Voir plus » | `useClanMatchesCache(…, 'official')` → `byMode.all.synergies` |
| Coopération (`#sec-cooperation`) | Cinq chiffres (indice de synergie, binômes actifs, réanimations, co-kills, recalls) et trois classements de binômes : sauvetages, co-kills, recalls | `GET …/telemetry/synergies?matchType=official&mode=all` |

Indice de synergie : score moyen des binômes rapporté au meilleur, avec réanimation × 3, co-kill × 2, dégâts
partagés × 1 (`cooperationSummary`). Distances et vitesses de télémétrie sont stockées × 10 : `telemetryKilometers` et
`telemetryKph` font la conversion.

Toute la logique d'affichage est pure, dans `src/lib/clan-playstyle.ts` (rôles, thèmes, contexte, familles et noms
français des objets, groupes de synergies, coopération).

## 3. « Carrière PUBG du clan » (`/clans/[clanId]/stats/career`)

Bandeau **sans période** (`dockOnMobile={false}`, comme toute page sans période) : au repos « Mis à jour il y a … ·
une fois par jour », « Source : API PUBG » et le lien « Style de jeu du clan → » ; ancres `career-<groupe>` une fois
docké sur ordinateur.

- **Totaux de carrière** (région « Totaux de carrière ») : temps de jeu, kills (K/D moyen), victoires, distance
  parcourue. Le temps de jeu dit « Disponible après la prochaine synchro PUBG » tant qu'aucun joueur n'a les champs
  d'engagement, puis « N joueurs sur M synchronisés », puis « soit X jours en partie ».
- **Sept groupes** : Engagement, Combat, Victoires, Support, Véhicules, Déplacements, Autres (`CAREER_GROUPS`,
  `src/lib/clan-career.ts`). Chaque carte (`CareerMetricCard`) porte une étiquette qui dit ce qu'elle compte :
  **Total**, **Moyenne**, **Record**, **Moins = mieux** (morts, défaites, suicides), **Mur de la honte** (teamkills) ;
  puis la valeur du clan et le top 3.
- **Jours de jeu** : l'API donne les jours **par mode**, sans union possible — la valeur est un plancher (max des modes),
  affichée « au moins ».
- Un membre actif sans carrière synchronisée est signalé ; une carte dont certains joueurs n'ont pas encore la
  métrique affiche « N joueurs en attente de synchro » au lieu de fausser le total.

## 4. Engagement : ce qui change dans la synchro lifetime

`src/lib/pubg.ts` lit désormais, pour chaque mode de `gameModeStats`, `timeSurvived` (secondes), `roundsPlayed` et
`days`. `mergeGameModes` additionne tout sauf `days`, pris au maximum (`daysPlayedFloor`). Les trois valeurs sont
écrites dans la colonne JSON existante `MemberLifetimeStats.other` (`timeSurvived`, `roundsPlayed`, `daysPlayed`) :
**aucune migration**.

Les lignes synchronisées avant le 2026-09-27 n'ont pas ces champs : elles se remplissent au prochain passage du cron
`daily_lifetime_stats_sync` (04:00 UTC par défaut, `CLAN_LIFETIME_STATS_SYNC_CRON`) ou d'un rafraîchissement manuel du
membre. D'ici là, la page l'annonce (§3).

## 5. API — `GET /api/clans/[clanId]/lifetime-stats`

Permission `clan.stats`. Aucun paramètre (plus de période, plus de lecture de `PlayerStats`).

```jsonc
{
  "clan": { "id": 7, "name": "…", "tag": "…" },
  "members": [{ "memberId": 1, "displayName": "…", "lastRefreshedAt": "…", "stats": { /* combat, victory, support, vehicle, movement, other */ } }],
  "activeMemberCount": 9,
  "lifetimeSync": { "expression": "0 4 * * *", "timezone": "UTC", "runsPerDay": 1 }
}
```

`lifetimeSync.expression` : planification `daily_lifetime_stats_sync` du registre cron, sinon variable d'environnement,
sinon `0 4 * * *` ; `runsPerDay` vient de `getCronRunsPerDay` (`src/lib/cron-frequency.ts`).

## 6. Liens et redirections

| Ancienne adresse | Devient |
|---|---|
| `/clans/[clanId]/stats/items` | 307 → `/clans/[clanId]/stats#sec-items` (`next.config.ts`, la requête `?period=` est conservée) |
| Vue d'ensemble, « Toutes les synergies » (panneau `SquadSynergies`) | Lien « Synergies et coopération → » vers `/clans/[clanId]/stats?period=<période>#sec-synergies` |

`src/lib/next-redirects.test.ts` vérifie que chaque destination existe et qu'aucune source n'est encore une page.

## 7. Navigation (base de production)

Les entrées du menu vivent dans la table `NavItem`. À faire par un administrateur dans `/settings/nav-permissions` :

- créer l'entrée `clan.stats-career` (« Carrière PUBG », `/clans/:clanId/stats/career`) ;
- l'entrée « Objets consommés » du clan (`clan.items`) pointe maintenant sur une redirection : elle peut être retirée ;
- le libellé de `clan.stats` peut devenir « Style de jeu du clan ».

## 8. Tests

| Fichier | Couvre |
|---|---|
| `src/lib/clan-career.test.ts` | Agrégats somme / moyenne / record, ordre moins = mieux et mur de la honte, joueurs sans métrique, totaux et libellés de synchro, formats |
| `src/lib/clan-playstyle.test.ts` | Rôles et top 3, thèmes avec mesures absentes, contexte, noms d'objets, groupes de synergies, indice de coopération |
| `src/lib/pubg-lifetime-engagement.test.ts` | Somme des modes, plancher des jours, champ absent |
| `src/lib/pagination.test.ts` | `paginationItems`, `paginate`, `getCronRunsPerDay` |
| `src/lib/clan-stats-route-contracts.test.ts` | Contrat de `lifetime-stats` (Prisma simulé) : forme sans période, fréquence par défaut et réglée, identifiant invalide et clan inconnu |
| `src/lib/ui-conformance.test.ts` | `stats/career` dans les pages à bandeau |
| `e2e/stats.spec.ts` | Les deux pages, pagination, absence de défilement horizontal, docking, redirection HTTP de `/stats/items` |

## Voir aussi

- [Objets consommés](objets-consommes.md) — source `LogItemUse`, page membre
- [Dashboard membre](member-dashboard.md) §3 — champs de `MemberLifetimeStats`
- [Clans](clans.md) §6 — vue d'ensemble
