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

Tous ces paramètres forment `LeagueSettings` (`src/lib/clan-league.ts`) : valeurs par défaut
`DEFAULT_LEAGUE_SETTINGS` (celles ci-dessus), **réglables par le SuperUser sur /settings/league** (§5) — barème, coefficients,
M, seuils **par type de partie et par période**, zone, titres. `clanPowerScore` est **la seule formule du
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
(semaine), 3 / 6 (mois) ; Casual 6 / 4, 0 / 10 ; Tournois / Custom 2 / 4, 0 / 6. Avec les seuils par défaut, communs à
tous les types, le classement du mois est presque vide hors Normal : les seuils se règlent par type sur /settings/league.

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
| `src/lib/clan-league-service.test.ts` | Prisma simulé : Ranked ne lit que `competitive`, Casual `casual` + `airoyale`, toutes les requêtes suivent le type, un cache par période et type ; réglages enregistrés appliqués (seuil du type, nouvelle clé de cache) |
| `src/lib/league-settings.test.ts` | Validation (barème, bornes, seuils par type et période, au moins un coefficient), lecture tolérante, changements lisibles, aperçu (seuil abaissé, parts recalculées) |
| `src/lib/league-settings-route-contracts.test.ts` | Routes `/api/settings/league` et `/preview` : SuperUser seulement, 400 champ par champ, enregistrement `AppConfig` avec l'auteur, aperçu en lecture seule (Ranked = `competitive`) |
| `e2e/league-settings.spec.ts` | Valeurs par défaut, coefficient modifié (formule, changements, aperçu, enregistrement), seuil abaissé, erreurs et enregistrement bloqué, barème ±1 place, M = 0, annuler, pas de défilement horizontal, membre non SuperUser refusé. Données : `e2e/support/league-settings.ts` |
| `src/lib/ui-conformance.test.ts` | Exception nommée du bandeau docké complet sur mobile |
| `e2e/clans-league.spec.ts` | Podium qui suit le critère, fil (3 / 5 lignes), titres, zones et blue zone repliée, en qualification (« 3 / 5 parties »), type de partie (Ranked recharge, `matchType=competitive`), explication du Power score, sans partie, flèches (Power seulement, aucune pour « Tous »), visiteur sans pastille, bandeau docké sur une ligne ; membre connecté : « Mon clan · #10 », ligne visible repliée avec sa cible, pastille qui déplie et amène la ligne, liens limités à son clan. Données : `clansLeaderboardResponse` (`e2e/support/data.ts`) |

## 5. Réglages SuperUser — `/settings/league` (2026-10-04)

Page réservée au SuperUser (menu « Réglages de la ligue », `superuser.league-settings` ; entrée inscrite en base par
`npx tsx scripts/seed-league-settings-nav.ts`), écrite selon la charte UI (`.charte`, bandeau photo, `DockingToolbar`).

| Bloc | Réglage | Bornes |
|---|---|---|
| Points de placement | Points par place finale, de 1 à 16 places (au-delà, 0) — jamais plus que la place précédente, 1re place > 0 | 0 à 100 |
| Score brut | Coefficients placement, dégâts, kills, knocks ; part de chaque terme dans le score moyen de la ligue (aperçu), cible 35-45 % pour le placement et **coefficient proposé pour 40 %** (lien « appliquer ») | 0 à 2 000 · 0 à 10 · 0 à 500 · 0 à 500 |
| Pondération par le volume | M (0 : pas de pondération), avec le poids du propre score d'un clan à 5, 15 et 50 parties | 0 à 200 |
| Seuils de qualification | Une valeur par type (Normal, Ranked, Casual, Tournois / Custom) et par période (semaine, mois, tous) | 1 à 500 |
| Zones et titres | Dernier rang « Dans la zone » (podium 1 à 3, blue zone au-delà) ; parties minimum pour un titre | 4 à 30 · 1 à 100 |

- **Bandeau** : aperçu sur une période (`PeriodFilter`) et un type de partie (`MatchTypeMenu`), puis « Valeurs par
  défaut », « Annuler » et « Enregistrer » (accent). Docké sur mobile : la période seule.
- **Brouillon** : les erreurs s'affichent sous chaque champ (validation partagée avec la route) ; un bandeau liste les
  changements lisibles (« coefficient du placement : 250 → 170 ») tant qu'ils ne sont pas enregistrés.
- **Aperçu du classement** : recalculé 400 ms après la dernière frappe (`POST /api/settings/league/preview`, lecture
  seule) — rang et score avec les réglages en vigueur puis avec le brouillon, écart, clans qui entrent au classement ;
  paginé (`Pagination`, 12 lignes). Suspendu tant qu'un champ est en erreur.
- **Enregistrement** : `PUT /api/settings/league`, validation stricte, une ligne `AppConfig` (`league_settings`, JSON avec
  date et auteur). Aucune migration. La ligue publique relit les réglages (cache 30 s) et les inclut dans sa clé de cache :
  elle est recalculée au prochain appel. Une valeur enregistrée abîmée reprend champ par champ sa valeur par défaut
  (`mergeStoredLeagueSettings`) : la ligue publique ne tombe jamais.
- L'explication publique du Power score (`/clans-leaderboard`) et le découpage des zones suivent les réglages en vigueur
  (`scoring.settings` de la réponse).

Code : `src/lib/league-settings.ts` (bornes, validation, lecture tolérante, changements, aperçu — pur),
`src/lib/league-settings-service.ts` (`AppConfig`, cache), `src/app/api/settings/league/` (routes),
`src/components/league-settings/LeagueSettingsSections.tsx`, `src/app/settings/league/page.tsx`.

## Voir aussi

- [Clans](clans.md) §6 (vitrine : rang en Ligue) et §6 bis (annuaire : règle d'ouverture d'un clan)
