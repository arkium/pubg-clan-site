# Ligue Inter-Clans — un classement qui se joue comme une partie

Refonte livrée le 2026-09-27 (maquette Claude Design « Ligue clans », `LigueClansPropose`). Page publique
`/clans-leaderboard`, route `GET /api/clans-leaderboard?period=`. Anciens fichiers archivés dans
`archive/refonte-ui/ligue-clans/` (page, `ClanLeaderboardTable`, calcul et route d'avant).

## 1. Ce que l'analyse de cohérence a corrigé

| Constat (page d'avant, maquette) | Décision |
|---|---|
| Podium en 3 cartes identiques ; tableau de 8 colonnes qui s'allonge avec chaque clan | **Podium en marches** 2-1-3 (couronne, tampon « Winner winner chicken dinner »), puis classement **par cercle** : « Dans la zone » (4 à 8) toujours visible, « Blue zone » (9 et plus) repliée |
| Rien ne dit qui monte ni où est mon clan | Flèches ▲▼ (Power score), **fil de la ligue**, **titres**, pastille **« Mon clan · #N »** dans le bandeau, ligne du clan toujours visible même repliée, avec sa cible (« cible : Bof Team à 44 ») |
| Tri par en-tête sur ordinateur, par menu sur mobile | Un seul critère pour toute la page : segments sur ordinateur, **un bouton qui passe au suivant** sur mobile |
| Explication du Power score en grand bloc permanent | Une ligne repliable en bas |
| Maquette : `previousRank`, fil « déduit des changements de rang d'un jour à l'autre » — **aucun classement passé n'était stocké** (`ClanComparatorCache` ne garde que la période en cours) | Classements **recalculés à la volée** depuis les parties officielles, à n'importe quelle date (§3). Aucune table, aucune migration |
| Clans sans partie sur la période classés à 0 | **Non classés** : groupe replié « Sans partie » en bas (décision du 2026-09-27) |
| Maquette : flèches « par rapport à la période précédente » | Conservé (décision du 2026-09-27) : semaine d'avant, mois d'avant ; **aucune flèche ni meilleure remontée pour « Tous »** |
| Maquette : « 4 à 8 · qualifiés pour la prochaine phase », « mis à jour après chaque partie », chiffres d'exemple | Aucune qualification n'existe : sous-titre « 4 à 8 ». La fraîcheur affichée est la **dernière partie réellement prise en compte**. Toutes les valeurs viennent de la base |
| Maquette : périodes « 7 j / 30 j / Tout » | `PeriodFilter` du site : **Semaine / Mois / Tous** (calendaires) |
| Lignes de clan toutes cliquables (ancien tableau) — un membre connecté ne peut pas ouvrir un autre clan | Même règle que l'annuaire `/clans` : SuperUser ou visiteur ouvre tous les clans, un membre **seulement le sien** ; les autres sont affichés sans lien (pas de redirection vide) |

## 2. La page

- **Bandeau** (`DockingToolbar`) sur une ligne, **docké aussi sur mobile** : exception nommée à sticky.md §2
  (`MOBILE_DOCKED_EXTRA_CONTROLS`) — période, critère (Power, Win rate, Dégâts, Kills, Knocks), pastille « Mon clan »
  (session ; absente pour un visiteur) qui déplie la blue zone si besoin et amène la ligne du clan à l'écran.
- **Podium** du critère choisi. **Fil de la ligue** : 5 lignes sur ordinateur, 3 sur mobile. **Titres** : plus gros
  dégâts, machine à knocks (moyennes, au moins 3 parties), meilleure remontée (rang gagné par rapport à la période
  précédente).
- **Classement** : rang du critère, flèche (Power score seulement ; « nouv. » si le clan n'était pas classé la période
  précédente), logo (réglage `login_welcome_image_url` du clan, sinon l'image par défaut), barre relative au premier,
  win rate et joueurs actifs sur ordinateur, valeur du critère.

Composants : `src/components/clan-league/LeagueSections.tsx`. Logique pure : `src/lib/clan-league.ts`.

## 3. Données — `src/lib/clan-league-service.ts`

Une requête groupée par **clan et par partie officielle** (`SquadMatch.matchType = 'official'`), stats des seuls
membres actifs du clan (`isActive`, `joinStatus = 'active'`) — la règle du comparateur de clans. Clans retenus : actifs
et reliés à un clan PUBG. Mesuré le 2026-09-27 : ≈ 21 000 lignes sur tout l'historique en 1,2 s ; 5 minutes en mémoire
par période.

Power score : `win rate × 100 × 100 + dégâts moyens + kills moyens × 10 + knocks moyens × 5` (moyennes par partie).

| Champ de la réponse | Contenu |
|---|---|
| `standings` | Clans classés au Power score : parties, victoires, moyennes, `rank`, `previousRank` (période précédente, `null` sinon), `activeMembers` (joueurs actifs ayant joué) |
| `withoutMatch` | Clans suivis sans partie officielle sur la période |
| `feed` | Fil de la ligue : classement cumulé de la période à la fin de chacune des 7 dernières soirées (`sessionDateOf`, journée de Paris à 06:00), comparé à la veille — prise de la 1re place, remontée d'au moins 2 places, dépassement dans le top 8, entrée dans la zone, chute en blue zone |
| `titles` | `damage`, `knocks`, `climb` (`null` sans candidat ; `climb` toujours `null` pour « Tous ») |
| `lastMatchAt` | Dernière partie officielle prise en compte |

`computeClansLeaderboard` (`src/lib/clans-leaderboard.ts`) s'appuie désormais sur ce service : la vitrine de la vue
d'ensemble (« #13 sur N ») et l'annuaire des clans affichent **le même rang** que la Ligue, clans sans partie exclus.
`ClanComparatorCache` reste la source du comparateur de clans.

Contrôle en lecture seule : `npx tsx scripts/check-clan-league.ts` compare le calcul à la volée au cache du
comparateur. Relevé du 2026-09-27 : mêmes formules ; les seuls écarts sont les parties importées depuis le dernier
calcul du cache (le calcul à la volée en compte quelques-unes de plus, jamais de moins).

## 4. Tests

| Fichier | Couvre |
|---|---|
| `src/lib/clan-league.test.ts` | Power score, classement entre deux dates (clans sans partie exclus), tri par critère et cible, zones, fil (1re place, dépassement, zone, blue zone, rien au premier jour), titres et meilleure remontée |
| `src/lib/ui-conformance.test.ts` | Exception nommée du bandeau docké complet sur mobile |
| `e2e/clans-league.spec.ts` | Podium qui suit le critère, fil (3 / 5 lignes), titres, zones et blue zone repliée, sans partie, flèches (Power seulement, aucune pour « Tous »), visiteur sans pastille, bandeau docké sur une ligne ; membre connecté : « Mon clan · #10 », ligne visible repliée avec sa cible, pastille qui déplie et amène la ligne, liens limités à son clan. Données : `clansLeaderboardResponse` (`e2e/support/data.ts`) |

## Voir aussi

- [Clans](clans.md) §6 (vitrine : rang en Ligue) et §6 bis (annuaire : règle d'ouverture d'un clan)
