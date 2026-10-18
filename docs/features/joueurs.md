# Joueurs — classement inter-clans et comparateur

Livré le 2026-10-12 depuis la maquette Claude Design « Joueurs » (projet « Audit design avec améliorations »,
`Joueurs.dc.html` : 11 états sur ordinateur, 3 sur mobile). Page globale **`/players`**, entrée **« Joueurs »** du menu
latéral, juste sous « Ligue » (icône médaille). Deux onglets : **Classement** et **Comparateur** (`?tab=compare`).

Routes : `GET /api/players/ranking?period=&mode=` et `GET /api/players/compare?ids=&period=&mode=`.
Code : `src/lib/players-ranking.ts` (pur), `src/lib/players-ranking-service.ts` (Prisma), `src/app/players/page.tsx`,
`src/components/players/` (`PlayersRanking`, `PlayersComparator`, `PlayersRadar`, `PlayersUi`).

## 1. Analyse de cohérence : ce que la maquette disait, ce qui a été retenu

Chiffres vérifiés en base le 2026-10-12 (lecture seule, `npx tsx scripts/measure-players-ranking.ts`, options
`--full-periods`, `--kills-only`, `--zone-only`, `--service`).

| Maquette | Constat | Décision |
|---|---|---|
| « 400 joueurs de 15 clans suivis » | 510 joueurs actifs, 33 clans suivis (dont 8 joueurs reliés à un compte du site) | Les vrais chiffres, dans la ligne d'état sous les onglets |
| Classés à 10 parties | Semaine complète : ~250 joueurs ≥ 10 parties ; un lundi : 6. Mois : 295. Tous : 432. Duo : ~35 par semaine | Seuil **10 parties** (toutes périodes), état « Pas encore assez de parties » sous **20 classés**, bouton vers le mois |
| Parties prises en compte : non précisé | 41 % des parties officielles des membres (10 576 / 25 490 ce mois) sont jouées **sans** un autre membre du clan : absentes de `SquadMember`, sans temps de survie ni télémétrie | **Parties officielles de clan** (`SquadMember`), comme la Ligue et le classement d'un clan (décision du 2026-10-12) |
| Mode Duo / Squad / Tous | Aucun agrégat stocké n'a de mode ; compter les membres suivis d'une partie se trompe quand deux clans partagent un lobby | Mode lu dans le **`gameMode` PUBG** (`duo%`, `squad%`) ; « Tous » sans filtre |
| Rôles Attaquant / Soutien / Tireur à distance, radar Attaquant / Soutien / Zone | Le site dit déjà **Fragger / Medic / Ghost** (`PlaystyleBadge`, style de jeu), scores relatifs au meilleur du clan | Noms et icônes du site **+ « Tireur à distance »** (décision du 2026-10-12), sur la page entière : quatre puces, quatre cartes « meilleurs par rôle », radar à quatre axes. Ici le score est un **centile entre tous les clans** |
| Interrupteur « Apparaître dans le classement public » | Demande une migration en production et un réglage `/account` ; 8 joueurs sur 510 ont un compte ; leurs stats sont déjà publiques (pages de clan en mode visiteur) | **Reporté** (décision du 2026-10-12) : carte « Mon rang » sans interrupteur ; le masquage passe par `/confidentialite/demande`. Voir §6 |
| « Dégâts de zone subis » (PV) | N'existe pas en base : seuls les **coups** de zone bleue (`blueZoneHits`) sont comptés | « **Coups de zone bleue** / partie », libellé du style de jeu du clan et du joueur |
| Retard sur le cercle, armes | Stockés par période seulement, **tous modes** (`MemberTelemetryStats`, `MemberWeaponStats`) | Agrégats existants, avec la mention « agrégats de la période, tous modes » (décision du 2026-10-12) |
| « Tout », `<select>` natif « Tous les clans », « Afficher 25 de plus », puces qui défilent sur mobile | Interdits par la charte (`ui-conformance.test.ts`, docs/ui/index.html §03, #pagination, #controles) | **« Tous »** (`PeriodFilter`), menu de la charte **avec recherche** (33 clans), **pagination numérotée par 10** (demande du 2026-10-12) avec recherche, puces paginées par chevrons (`ChevronPager`) |
| Comparateur : joueur 1 jaune, 2 bleu, 3 blanc | Le jaune est réservé à l'accent et au Top 1 ; le comparateur de clans a ses couleurs de slot | **P1 bleu, P2 orange, P3 émeraude** (`COMPARATOR_SLOTS`), traits plein / tirets / pointillés au radar |
| Fil d'Ariane « Accueil / Joueurs » | Les pages globales n'en ont pas (Ligue, Tournois) | `NavigationTrail` invisible (retour depuis une page joueur) |
| Comparateur sur mobile : « colonnes défilantes » | Défilement horizontal interdit | Libellé au-dessus des valeurs, une colonne par élément ; l'icône d'arme disparaît sous 640 px |
| « Mon rang · visible par toi seul » | Sans interrupteur, la phrase laisserait croire à une confidentialité qui n'existe pas | Carte « Mon rang » sans cette mention |

## 2. La page

- **Bandeau d'image** (`/banner-weapons.jpg`, le râtelier de la maquette), titre Teko « Joueurs », icône médaille.
- **Bandeau collant** (`DockingToolbar`) : période (`PeriodFilter`, défaut **Semaine** — demande du 2026-10-18 ; en
  début de semaine, l'état « pas encore assez de parties » propose le mois), mode (segmented), **tri « Classer par »**
  en liste déroulante (`MobileDropdownNav` compact, le composant de filtre des bandeaux du guide UI — demande du
  2026-10-18 : Dégâts, Kills, Knocks, Réanimations, Survie, puis les rôles avec leur icône), pastille **« Mon rang ·
  #N »** (membre connecté classé ; « En qualification · 6/10 » sinon) qui ramène la liste à sa page et y fait défiler.
  Une ligne à partir de 640 px. Sur mobile, au repos : période et tri, puis mode et pastille en seconde ligne (ordre
  CSS, chaque contrôle rendu une fois) ; **docké : période et tri**, exception déclarée (`MOBILE_DOCKED_EXTRA_CONTROLS`,
  docs/TODO/sticky.md §2) comme le critère de la Ligue.
- **Onglets** (`role=tablist`, flèches du clavier) sous le bandeau, comme Lecture de zone ; ligne d'état : classés,
  joueurs et clans suivis, dernière partie prise en compte, puis le lien **« Comment c'est calculé »** vers le guide du
  bas de page (`#guide-calcul`). Pendant un rechargement, le contenu précédent est estompé.
- **Guide de calcul** en bas de page, sous les deux onglets (`PlayersScoringGuide`, demande du 2026-10-18) : parties qui
  comptent, classement, flèches, comparateur, rôles, badge. **Replié par défaut** avec « Voir » / « Masquer », comme
  l'explication du Power score de la Ligue ; les liens « Comment c'est calculé » et « le guide de calcul » l'ouvrent
  avant d'y descendre (état tenu par la page). Ses seuils viennent des constantes du calcul (`PLAYERS_MIN_MATCHES`,
  `PLAYERS_MIN_RANKED`, `ROLE_MIN_SAMPLE`) : il ne peut pas annoncer un autre chiffre que celui appliqué. La note sous la
  liste y renvoie aussi.

### 2.1 Classement

- **Recherche et filtre** (bloc sous les onglets) : recherche de pseudo (sans accents ni casse ; un tag de clan exact
  liste ses joueurs) et filtre de clan (menu à recherche). En pied du bloc : une phrase rappelle le critère, la période
  et le mode, puis la règle des classés et le lien vers le guide de calcul (2026-10-18). Les puces « Classer par » de ce
  bloc ont laissé la place à la liste déroulante du bandeau.
- **Podium** en marches (`PodiumSteps`) des trois premiers du critère, **sans le tampon « Winner winner chicken
  dinner »** (`stamp={null}`, la Ligue et les tournois le gardent) et avec un **titre en évidence** (coupe et critère en
  or de jeu, « Podium » en blanc, 14 px — demande du 2026-10-18), avec la **plaque de score** des tournois
  (variante `emphasis`, `.podium-plate` — demande du 2026-10-18) : la valeur en Teko, l'unité du critère (« dégâts »,
  « kills », « knocks », « réas », « min », « / 100 » pour un rôle — `unit` de `PLAYER_CRITERIA`), puis « N parties ·
  N Top 1 » (Top 1 en or s'il y en a). Tag du clan en or de jeu (`--game-gold`) : le podium reste sombre dans les deux
  thèmes, l'accent du thème clair y serait illisible. À côté : la carte **Mon rang** (membre connecté :
  rang, part des classés derrière lui, joueur juste devant et écart ; ou progression « 6 / 10 parties ») ; sinon les
  **meilleurs par rôle** en colonne (en grille 2 × 2 sous le podium quand « Mon rang » est là). Une carte de rôle classe
  la page par ce rôle.
- **Liste** : à partir du 4e (le podium montre les trois premiers), **10 lignes par page**, `Pagination` « Joueurs 1–10
  sur 292 ». Avec une recherche ou un filtre : tous les classés qui correspondent, avec leur rang général. Tableau à partir
  de 768 px (case à cocher, rang `RankCell`, flèche `RankMovement`, joueur, parties, valeur), cartes en dessous. Case,
  rang et flèche sont à la largeur de leur contenu (`w-px`) : le joueur prend la place restante (2026-10-18) ; la valeur
  ne passe jamais à la ligne (« 99 / 100 »). La ligne du joueur connecté porte « MOI » et le liseré d'accent de la Ligue.
- **Joueur** : pseudo en texte simple, **sans badge**, et **tag du clan en jaune gras** (`ClanTag`, texte d'accent
  `--theme-ui-accent-text` : jaune en sombre, ambre lisible en clair) — demande du 2026-10-18, choix assumé hors de la
  règle « jaune = accent, Top 1 ». Même tag sur les cartes de rôle et « Mon rang » ; nom en texte simple aussi dans
  l'en-tête du comparateur.
- **Badge du joueur** Fragger / Medic / Ghost (`RosterRoleBadge`, la pastille de la fiche soldat — demande du
  2026-10-18) : le **plus haut de ses trois scores de rôle de la période et du mode affichés** (`playerStyle`, décision
  du 2026-10-18 : un badge figé depuis le début ne se comprenait pas à côté des chiffres de la période). Il ne change
  pas avec le critère de tri ; « Tireur à distance » n'a pas de badge ; égalité : Fragger, Medic, Ghost ; aucun badge
  sans score positif. Il peut donc différer de la fiche soldat, mesurée depuis le début face au meilleur du clan. Dans
  la liste après le tag du clan (sur mobile, devant le nombre de parties) et sur la carte « Mon rang » ; expliqué dans
  le guide de calcul.
- **Flèches** : rang de la période précédente pour **chaque critère** (semaine d'avant, mois d'avant), « nouv. » si le
  joueur n'était pas classé ; aucune pour « Tous ».
- **Liens** vers la page d'un joueur : règle de la Ligue — SuperUser ou mode visiteur : tous ; membre connecté : son clan.
- **Cases à cocher** : trois au plus, puis « Comparer la sélection » ouvre le comparateur avec ces joueurs.

### 2.2 Comparateur

- **Emplacements** (2, puis « Ajouter un 3e joueur ») : recherche parmi les joueurs qui ont joué sur la période (classés et
  en qualification) et les clans (« Moyenne <clan> ») ; raccourcis du membre connecté : **Moi**, **Un coéquipier** (liste
  les joueurs de son clan), **La moyenne de mon clan**. Sélection dans l'URL : `?tab=compare&ids=12,34,clan-5`.
- **Tableau** : en-tête par élément (clan, parties, arme la plus jouée), puis Combat (dégâts, kills, knocks, kills en
  headshot, distance moyenne des kills), Équipe (réanimations, assistances, survie), Positionnement (retard sur le
  cercle, coups de zone bleue — « plus bas = mieux »), Armes (les 3 plus jouées : précision, kills). La meilleure valeur
  porte la couronne et « meilleur » (accent) ; un joueur sous le seuil reste affiché, estompé, **hors concours**, avec un
  avertissement.
- **Profil par rôle** : radar à quatre axes et tableau des scores. **Duels directs** : éliminations de chacun sur l'autre,
  dernière rencontre (date, carte, vainqueur), **depuis le début, tous modes** (comme le face-à-face du comparateur de
  clans) ; « Pas de duels avec une moyenne de clan ». **Lecture** : jusqu'à trois traits où chacun se détache des autres
  d'au moins 5 % (« arrive plus tôt dans le cercle », « réanime plus », « tue de plus loin »…).

## 3. Calculs — `src/lib/players-ranking.ts`

| Élément | Règle |
|---|---|
| Moyennes | Par partie de clan de la période et du mode |
| Échantillon minimal | 5 kills (headshots), 5 kills mesurés (distance), 5 fermetures de zone (Ghost) : en dessous, la mesure est absente (« — ») et sort du rôle |
| Centile | Part des joueurs classés dépassés ; ex æquo à mi-chemin ; un joueur classé ne se compte pas lui-même |
| Fragger | Moyenne des centiles des dégâts, kills et knocks |
| Medic | Moyenne des centiles des réanimations, assistances et temps de survie |
| Ghost | Centile de la part des fermetures de zone passées dans le nouveau cercle (bandes `center` + `edge`, docs/features/fin-de-zone.md) |
| Tireur à distance | Moyenne des centiles de la distance moyenne des kills (`KillEvent`, suicides exclus) et de la part de kills en headshot |
| Classement | Valeur décroissante (mesure absente en dernier), puis parties, puis nom ; pas d'ex æquo, comme la Ligue |
| Moyenne d'un clan | Sommes de ses joueurs actifs qui ont joué sur la période, puis mêmes moyennes ; rôles en centile face aux classés |

## 4. Données — `src/lib/players-ranking-service.ts`

Joueurs actifs (`isActive`, `joinStatus = 'active'`) des clans suivis (`isActive`, hors `isSystem`, non archivés),
parties `matchType = 'official'`. Trois lectures groupées par joueur, chacune sur la période **et** la précédente
(colonne `isCurrent`) : `SquadMember` (moyennes), `KillEvent` (distance des kills), `ZoneClosurePosition` (fermetures).
Résultat gardé **5 minutes** en mémoire par période et mode (la promesse est partagée : deux visiteurs simultanés ne
relancent pas les lectures ; une lecture en échec n'est pas gardée).

Comparateur : le classement en cache, plus `MemberTelemetryStats` et `MemberWeaponStats` de la clé de période des
agrégats (`getPeriodKey`, exportée de `period-aggregates.ts` pour lire la même clé que l'écriture), et les duels
(`KillEvent` par membre **ou** par compte PUBG, quand le clan de la victime n'est pas rattaché à la partie).

**Accès** : les deux routes répondent à une session valide ou en mode visiteur (`DISABLE_AUTH_PERMISSIONS`), sinon 401 —
la règle des tournois. Elles exposent les moyennes de **tous** les joueurs suivis, quel que soit le clan du lecteur :
c'est l'objet de la page. Aujourd'hui le mode visiteur rend déjà ces chiffres publics (pages de clan) ; s'il était coupé,
un membre continuerait de voir ici les joueurs des autres clans, alors que les pages d'un joueur
(`requireSameClanAsMember`) se fermeraient. Les **liens** vers ces pages suivent déjà cette règle (son clan seulement).

**Mesures (2026-10-12, base de production, premier appel sans cache)** : classement 1,0 à 1,8 s selon la période et le
mode, réponse de 10 à 170 Ko (avant compression) ; comparaison de 2 joueurs et d'une moyenne de clan : 0,45 s.
Aucun index ajouté : `SquadMatch.createdAt` n'est pas indexé, mais la table est petite (~27 000 lignes) et le cache
absorbe la charge.

## 5. Tests

| Fichier | Couvre |
|---|---|
| `src/lib/players-ranking.test.ts` | Mode et critère, plaque de score (valeur et unité), durées, moyennes et seuils d'échantillon, centiles (ex æquo, valeur extérieure, population vide), rôles, classement et rangs précédents, « Mon rang » (classé, en tête, en qualification), recherche, meilleure case du comparateur, lecture, clés comparées |
| `src/lib/players-ranking-service.test.ts` | Prisma simulé : badge du joueur (meilleur rôle de la période, aucune lecture de plus), classés / en qualification, rôles et flèches de la période précédente, filtres SQL (officielles, mode `gameMode`, clans suivis), « Tous » sans période précédente, cache (5 min, par mode, échec non gardé), moyenne de clan, télémétrie pondérée sans les non-mesurés, armes hors grenades, duels par membre ou compte, éléments inconnus écartés |
| `src/lib/players-route-contracts.test.ts` | 401 sans session hors mode visiteur, paramètres par défaut, 400 sous deux éléments, 500 sans détail |
| `src/lib/ui-conformance.test.ts` | `src/app/players/page.tsx` dans `TOOLBAR_PAGES` |
| `e2e/players.spec.ts` | Podium sans tampon et titre en évidence, tri par la liste déroulante du bandeau (aussi docké, sur mobile compris), podium avec plaque de score (valeur, unité, Top 1), nom sans badge et tag du clan, badge Fragger / Medic / Ghost qui suit la période mais pas le critère, semaine par défaut, score sur une ligne, règle des classés dans « Classer par », guide de calcul replié (« Voir » / « Masquer ») ouvert par le lien du haut, meilleurs par rôle, liste paginée par 10 à partir du 4e, rôle qui reclasse, flèches et « nouv. », aucune pour « Tous », recherche sans accents et filtre de clan, semaine sans assez de classés, mode Duo, lien du menu sous « Ligue » ; comparateur par cases à cocher et par recherche, 3e joueur sous le seuil, duel et dernière rencontre ; membre connecté : « Mon rang », pastille, raccourcis « Moi » et moyenne du clan. Données : `e2e/support/players.ts` |

## 6. Suites

- **Interrupteur « Apparaître dans le classement public »** (reporté le 2026-10-12) : préférence par membre (modèle
  `NotificationPreference`), route `requireOwnMember`, réglage dans `/account` et sur la carte « Mon rang » ; masquer le
  joueur de la liste publique en gardant son rang pour lui. Migration à faire valider avant tout `db push`.
- **Dégâts de zone en points de vie** : demanderait de compter les PV dans le parser (`isBlueZoneDamage`) puis de
  ré-analyser la télémétrie.
- **Positionnement et armes par mode** : les agrégats n'ont pas de colonne de mode ; les calculer partie par partie
  coûterait la décompression de la télémétrie (jusqu'à ~3 000 parties pour « Tous »).
