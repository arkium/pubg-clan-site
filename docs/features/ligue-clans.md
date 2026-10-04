# Ligue Inter-Clans — un classement qui se joue comme une partie

Refonte livrée le 2026-09-27 (maquette Claude Design « Ligue clans », `LigueClansPropose`). Page publique
`/clans-leaderboard`, route `GET /api/clans-leaderboard?period=&matchType=`. Anciens fichiers archivés dans
`archive/refonte-ui/ligue-clans/` (page, `ClanLeaderboardTable`, calcul et route d'avant). **Power score pondéré,
seuil de qualification et type de partie le 2026-10-04** (cahier des charges : `docs/TODO/score.md`, §1 bis).

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

## 1 bis. Power score (2026-10-04)

L'ancien score (`win rate × 10 000 + dégâts + kills × 10 + knocks × 5`) ignorait le nombre de parties — un clan à une
partie gagnée restait premier toute la semaine — et le win rate en pesait la moitié, en tout ou rien. Désormais :

1. **Score brut** = points de placement moyens × 250 + dégâts moyens + kills moyens × 10 + knocks moyens × 5. Barème
   par partie : 1er 10, 2e 6, 3e 5, 4e 4, 5e 3, 6e 2, 7e et 8e 1, au-delà 0.
2. **Power score** = (n × score brut + M × score moyen de la ligue) / (n + M), n = parties du clan, **M = 20**. Le score
   moyen de la ligue met en commun toutes les lignes clan × partie de la fenêtre (clans en qualification compris), puis
   applique l'étape 1 — jamais la moyenne des scores des clans.
3. **Qualification** : classé à partir de **5 parties la semaine, 15 le mois, 30 pour « Tous »**. En dessous, bloc
   « En qualification » avec la progression (« 3 / 5 parties ») ; ses parties comptent dans le score moyen.

Constantes nommées et exportées dans `src/lib/clan-league.ts` (`PLACEMENT_POINTS`, `PLACEMENT_WEIGHT`,
`KILL_WEIGHT`, `KNOCK_WEIGHT`, `LEAGUE_PRIOR_MATCHES`, `LEAGUE_MIN_MATCHES`). `clanPowerScore` est **la seule formule du
site** : l'annuaire et la vitrine de la vue d'ensemble ne lisent que le rang (`computeClansLeaderboard`, type Normal).
`leagueTableBetween` applique la même règle à toute fenêtre : période, période précédente (flèches), soirée par
soirée (fil). Fil, titres et `previousRank` ne portent que sur les clans classés ; franchir le seuil n'est pas un
événement du fil. Les colonnes restent brutes (win rate, dégâts, kills, knocks ; **points de placement** ajoutés comme
critère) : seul le Power score est pondéré.

**Type de partie** : `matchType=official` (Normal, défaut), `competitive` (Ranked), `casual` (casual et lobbies de bots
`airoyale`), `custom` (Tournois / Custom) — `leagueMatchTypeValues`. Pas de « Tous » : chaque type a son classement.
Les types `event`, `arcade` et `rumble` ne comptent dans aucun. `competitive` a été ajouté à `ClanMatchTypeFilter` ; les
synergies écrites par le worker d'agrégats gardent leurs quatre types (`official`, `casual`, `custom`, `all`).

**Mesures (2026-10-04, lecture seule, `scripts/measure-league-score.ts`)** — ligue Normal :

| Fenêtre | Lignes | Placement moyen | Dégâts | Kills | Knocks | Part du placement | Coefficient pour 40 % |
|---|---|---|---|---|---|---|---|
| Mois en cours (4 jours) | 1 384 | 2,41 | 530 | 3,60 | 3,09 | 50,9 % | 161 |
| Septembre | 12 717 | 2,04 | 503 | — | — | 48,0 % | 181 |
| Tout l'historique | 24 169 | 2,05 | 468 | — | — | 49,9 % | 167 |

Parts du mois en cours : placement 50,9 %, dégâts 44,8 %, kills 3,0 %, knocks 1,3 %. **Hors de la fourchette 35-45 %
visée** : un coefficient d'environ 170 ramènerait le placement à 40 % — non appliqué, en attente de décision.

Clans classés / en qualification par type (2026-10-04) : Normal 25 / 2 (semaine), 21 / 5 (mois) ; Ranked 12 / 1
(semaine), 3 / 6 (mois) ; Casual 6 / 4, 0 / 10 ; Tournois / Custom 2 / 4, 0 / 6. Les seuils sont communs à tous les
types : hors Normal, le classement du mois est presque vide.

## 2. La page

- **Charte UI** (04/10/2026, `.charte` + `.game-ui`) : titre Teko sur la photo, tampon `app-stamp`, chiffres des marches
  en Teko, couronne en or de jeu (`.app-on-photo` sur le podium, toujours sombre), titres aux jetons de jeu, rangs par
  `RankCell`, textes à 11 px minimum. Signatures conservées : podium en marches, fil, blue zone (seul bleu autorisé).
- **Bandeau** (`DockingToolbar`) sur une ligne, **docké aussi sur mobile** : exception nommée à sticky.md §2
  (`MOBILE_DOCKED_EXTRA_CONTROLS`) — période, **type de partie** (menu à partir de 640 px ; sur mobile, segmented en
  seconde ligne au repos, absent une fois docké), critère (Power, Placement, Win rate, Dégâts, Kills, Knocks : segments
  à partir de 1 024 px, sinon un bouton qui passe au suivant), pastille « Mon clan » (session ; absente pour un
  visiteur ; « 3/5 » en qualification) qui déplie la blue zone si besoin et amène la ligne du clan à l'écran.
- **Podium** du critère choisi. **Fil de la ligue** : 5 lignes sur ordinateur, 3 sur mobile. **Titres** : plus gros
  dégâts, machine à knocks (moyennes, au moins 3 parties), meilleure remontée (rang gagné par rapport à la période
  précédente).
- **Classement** : rang du critère, flèche (Power score seulement ; « nouv. » si le clan n'était pas classé la période
  précédente), logo (réglage `login_welcome_image_url` du clan, sinon l'image par défaut), barre relative au premier,
  parties, win rate et joueurs actifs sur ordinateur, valeur du critère. Puis **En qualification** (progression) et
  **Sans partie** (replié). Sans clan classé : un message, et les deux blocs restent.
- **Explication du Power score** repliable : formule, barème, pondération (score moyen de la ligue de la période) et
  seuil de la période, lus dans la réponse (`scoring`).

Composants : `src/components/clan-league/LeagueSections.tsx`. Logique pure : `src/lib/clan-league.ts`.

## 3. Données — `src/lib/clan-league-service.ts`

Une requête groupée par **clan et par partie du type demandé** (`SquadMatch.matchType IN (…)`), stats des seuls
membres actifs du clan (`isActive`, `joinStatus = 'active'`) — la règle du comparateur de clans. Clans retenus : actifs
et reliés à un clan PUBG. Mesuré le 2026-09-27 : ≈ 21 000 lignes sur tout l'historique en 1,2 s ; 5 minutes en mémoire
par période **et par type** (clé `période:type`).

Power score : voir §1 bis.

| Champ de la réponse | Contenu |
|---|---|
| `matchType` | Type de partie du classement (`official`, `competitive`, `casual`, `custom`) |
| `standings` | Clans classés au Power score : parties, victoires, `avgPlacementPoints`, moyennes, `rawScore`, `powerScore`, `rank`, `previousRank` (période précédente, `null` sinon), `activeMembers` (joueurs actifs ayant joué) |
| `qualifying` | Clans sous le seuil : `matches`, `required` |
| `withoutMatch` | Clans suivis sans partie du type sur la période |
| `scoring` | `minMatches` (seuil de la période), `priorMatches` (M), `league` (moyennes et score brut de la ligue) |
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
| `src/lib/clan-league.test.ts` | Barème, score brut, pondération ; 1 partie gagnée non classée ; à performance égale, plus de parties = moins tiré vers la moyenne ; une 2e place rapporte ; score moyen mis en commun (qualification comprise) ; seuils ; types de partie ; classement entre deux dates, tri par critère (placement compris) et cible, zones, fil (1re place, dépassement, zone, blue zone, rien au premier jour, franchir le seuil n'est pas un événement), titres et meilleure remontée |
| `src/lib/clan-league-service.test.ts` | Prisma simulé : Ranked ne lit que `competitive`, Casual `casual` + `airoyale`, toutes les requêtes suivent le type, un cache par période et type |
| `src/lib/ui-conformance.test.ts` | Exception nommée du bandeau docké complet sur mobile |
| `e2e/clans-league.spec.ts` | Podium qui suit le critère, fil (3 / 5 lignes), titres, zones et blue zone repliée, en qualification (« 3 / 5 parties »), type de partie (Ranked recharge, `matchType=competitive`), explication du Power score, sans partie, flèches (Power seulement, aucune pour « Tous »), visiteur sans pastille, bandeau docké sur une ligne ; membre connecté : « Mon clan · #10 », ligne visible repliée avec sa cible, pastille qui déplie et amène la ligne, liens limités à son clan. Données : `clansLeaderboardResponse` (`e2e/support/data.ts`) |

## Voir aussi

- [Clans](clans.md) §6 (vitrine : rang en Ligue) et §6 bis (annuaire : règle d'ouverture d'un clan)
