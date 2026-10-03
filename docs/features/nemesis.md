# Némésis — des comptes à régler

Refonte livrée le 2026-09-27 (maquette Claude Design « Némésis », écrans 23a à 23e). Page `/members/[id]/nemesis`,
route `GET /api/members/[id]/nemesis?period=&weapon=`. Anciens fichiers archivés dans `archive/refonte-ui/nemesis/`
(page, route et `WeaponSelect`, qui n'avait pas d'autre utilisateur).

Source : la table `KillEvent` (kill feed de la télémétrie, voir [todo.md](../TODO/todo.md) item 3) — un joueur y est
tueur (`killerMemberId`) ou victime (`victimMemberId`). Les noms viennent d'`EncounteredPlayer`, résolus **à la
lecture**.

## 1. Ce que l'analyse de cohérence a corrigé

| Constat (page d'avant, maquette) | Décision |
|---|---|
| La route lisait les **500 derniers** événements de chaque côté : pour les plus gros joueurs, les totaux étaient tronqués (relevé du 2026-09-27 : 1 612 kills réels affichés 500) | **Plus de plafond** : tous les événements de la période sont lus (≈ 170 ms pour 1 700 kills, mesuré sur la base réelle) |
| Maquette : score de revanche « 2–7 » et badge de duel sur chaque ligne — la route ne renvoyait que le compte d'un seul sens | Chaque ligne porte `reverseCount` : kills du joueur sur ce chasseur, ou morts face à cette proie. **Toutes armes confondues**, même avec une arme choisie, pour que le score reste le vrai duel entre les deux joueurs |
| Maquette : bilan « kills / morts / K/D » — la route mélangeait joueurs, bots et morts par la zone | Bilan **joueurs seulement** (K/D compris), bots neutralisés, tué par un bot et morts par la zone **comptés à part** |
| Maquette : « Armes qui t'ont eu » — faut-il suivre le filtre d'arme ? | La death cam suit la **période** mais **ignore l'arme** (filtrer sur une arme ne laisserait qu'une ligne) |
| Adversaire vu dans le kill feed mais jamais relevé dans un lobby (match rattrapé) : la page affichait l'identifiant `account.…` | « **Joueur inconnu** » en italique (`resolved: false`), aussi sur la carte Némésis du tableau de bord |
| Suicide (sa propre grenade, un véhicule…) : le kill feed porte le même compte comme tueur et victime — le joueur apparaissait comme son propre némésis et sa propre proie, « revanche 3–3 » (relevé du 2026-10-03, devenu visible quand son nom a été résolu) | **Ignoré** partout (`isSelfKill`) : ni chasseur, ni proie, ni kill, ni mort face à un joueur, ni death cam. **Compté à part** dans le bilan (« 3 suicides », côté morts, une fois — la même ligne est sa mort et son « kill » ; suit le filtre d'arme) |
| Libellés d'armes : le dictionnaire du client ne connaît pas tout (« WeapRPD_C ») | La route renvoie `weaponLabels`, calculés par `weaponDisplayName` (réglage `/settings/weapon-labels`, sinon nom déduit de l'identifiant) pour chaque arme affichée |
| Listes longues à défilement | **Top 10** par liste, **pagination par 5** (`paginate`), jamais de défilement horizontal ; sur mobile, **onglets** Chasseurs / Proies |
| Maquette : noms d'adversaires cliquables | **Aucun lien** pour un joueur extérieur au site (pas de page). Un joueur **d'un clan suivi** porte un écusson (bouclier + tag, à l'accent) ; son nom ne mène à sa page que s'il est **du même clan** (les pages joueur ne s'ouvrent qu'au même clan, `requireSameClanAsMember`) — 2026-10-03 |
| Repérer les rivaux du site parmi les adversaires (demande du 2026-10-03) | Carte **« Clans suivis »** à côté de la death cam : les **3 derniers** joueurs (distincts) d'un **autre** clan suivi éliminés, les 3 derniers à t'avoir eu — chacun avec son nombre de duels de la période (« ×2 ») — et les totaux de la période (toutes armes, suicides exclus ; les duels internes au clan, souvent des parties personnalisées, n'y figurent pas) |
| Maquette : périodes « 7 j / 30 j / Tout » | `PeriodFilter` du site : **Semaine / Mois / Tous** (calendaires) ; **« Tous » par défaut**, les duels étant rares sur une semaine |

## 2. La page

- **Bandeau** (`DockingToolbar`) sur une ligne, **docké aussi sur mobile** : exception nommée à sticky.md §2
  (`MOBILE_DOCKED_EXTRA_CONTROLS`) — période et pastille d'arme (« Armes » sur mobile, « Toutes les armes » sur
  ordinateur ; couleur d'accent quand une arme est choisie). Le menu propose les armes réellement présentes sur la
  période, avec leur silhouette.
- **Face-à-face** : ton némésis (×N, arme principale, dernière fois), **revanche** (`reverseCount–count`, « N kills à
  rendre » ou « Vengé »), ta proie favorite.
- **Bilan** sur une ligne : kills, morts, K/D, bots neutralisés, fois tué par un bot, morts par la zone.
- **Chasseurs et proies** : 5 par page, badge de duel quand le duel inverse existe. Côte à côte sur ordinateur, un
  onglet à la fois sur mobile.
- **Death cam** : les 5 armes qui l'ont le plus éliminé, sous les listes jusqu'à 2xl, à droite au-delà.
- Changer la période ou l'arme garde les résultats précédents, estompés, pendant le rechargement (`usePageData`).

Composants : `src/components/nemesis/NemesisSections.tsx`. Logique pure : `src/lib/nemesis.ts` (`buildNemesis`,
`revengeLabel`).

## 3. Route — `GET /api/members/[id]/nemesis`

Accès `requireSameClanAsMember` (lecture). `?period=week|month` facultatif (sans : tout l'historique suivi — le tableau
de bord l'appelle aussi avec sa période), `?weapon=` filtre chasseurs, proies et bilan.

| Champ de `data` | Contenu |
|---|---|
| `topKillers`, `topVictims` | Joueurs seulement (bots exclus), 10 premiers : `name`, `clanTag`, `resolved`, `count`, `reverseCount`, `lastAt`, `topWeapon` |
| `playerKills`, `playerDeaths`, `playerKd` | Bilan contre les joueurs (arme choisie comprise) |
| `botKillCount`, `botDeathCount`, `environmentalDeathCount`, `suicideCount` | Comptés à part ; une mort sans tueur = zone, chute, noyade ; un suicide = même compte tueur et victime, exclu de tout le reste |
| `topDeathWeapons` | 5 armes de toutes les morts de la période, sans le filtre d'arme |
| `availableWeapons`, `selectedWeapon`, `period` | Menu d'armes (vraies armes de la période), filtre appliqué, période appliquée (`all` sans période) |
| `weaponLabels` | Libellé de chaque arme renvoyée |
| `topKillers[].tracked`, `topVictims[].tracked` | Joueur d'un clan suivi (actif, ni système ni archivé) : `clanId`, `clanTag`, `clanName`, `memberId`, `memberName`, `sameClan` ; `null` sinon |
| `trackedDuels` | `killCount`, `deathCount`, `recentKills`, `recentDeaths` : 3 joueurs distincts au plus, du plus récent au plus ancien (`name`, `tracked`, `weapon` et `at` de leur dernier duel, `count` de la période), contre les **autres** clans suivis, toutes armes |
| `totalDeathsTracked`, `totalKillsTracked` | Tous les événements, bots et zone compris |

### Noms des adversaires — « Joueur inconnu » (2026-10-03)

Le kill feed ne garde que l'identifiant de compte. Le nom vient, dans l'ordre :

1. des joueurs croisés **par le clan du joueur** (`EncounteredPlayer`, relevés dans les lobbies) ;
2. sinon, de l'**identité globale** `Player` (nommée par un autre clan suivi ou par le cron ci-dessous) ou des joueurs
   croisés **par un autre clan** — une requête par table, bornée aux comptes encore sans nom. Un `Player` dont le nom
   est son identifiant n'est pas un nom ;
3. sinon « **Joueur inconnu** » (`resolved: false`).

**Cron** : la résolution des joueurs croisés (`encountered_player_clan_resolution`, toutes les 30 min) traite ces
comptes **en priorité**, dans le même lot et le même quota (`src/lib/kill-feed-name-resolution.ts`). Un appel
`/players/{id}` (`fetchPlayerIdentity`) donne le nom **et** le clan, enregistrés par le même chemin qu'un joueur
croisé (`syncOpponentIdentityForMember` → `Player`, `OpponentClan`). La découverte des comptes sans nom relit
`KillEvent` au plus toutes les 6 h (3 à 6 s, pas d'index sur la date) ; entre deux, le lot vient de la liste en cache.
Un compte que l'API ne connaît pas (404, ou réponse sans nom) est marqué `notFound` dans `KillFeedAccountLookup` et
n'est plus redemandé ; un autre échec (quota, réseau) compte une tentative, abandon à 3. Les appels sont comptés dans
`pubgApiCalls` du passage ; le journal ajoute `killFeedNamed`, `killFeedNotFound`, `killFeedFailed`.

Mesuré le 2026-10-03 (`scripts/count-unresolved-opponents.ts`, lecture seule) : **1 511** comptes sans nom sur 68 878
adversaires ; **884** nommés tout de suite par l'étape 2 (aucun appel) ; **627** pour le cron — un appel par compte,
soit ~63 h au lot par défaut (5 par passage), ~8 h au lot maximal (40, réglage du cron).

**Déploiement** : la table `KillFeedAccountLookup` (migration `20261003120000_add_kill_feed_account_lookup`) doit
exister avant le premier passage du cron (`npx prisma migrate deploy`). Sans elle, la priorité kill feed échoue et le
passage continue avec les seuls joueurs croisés (erreur journalisée, lot inchangé).

## 4. Tests

| Fichier | Couvre |
|---|---|
| `src/lib/nemesis.test.ts` | Agrégation, bots et zone à part, 3 derniers joueurs distincts contre les autres clans suivis avec leur nombre de duels (même clan exclu, nom de la fiche membre en repli), suicides ignorés et comptés à part (filtre d'arme compris), duel inverse toutes armes sous filtre, death cam sans filtre, libellé de revanche |
| `src/lib/member-routes-contracts.test.ts` | Période facultative, lecture sans plafond, clans suivis (repère, même clan, carte, effectif des clans actifs), noms résolus ou inconnus, repli sur `Player` et les autres clans (jamais l'identifiant comme nom), duel inverse, libellés d'armes |
| `src/lib/kill-feed-name-resolution.test.ts` | Découverte une fois puis lot depuis le cache, comptes nommés ou abandonnés écartés, redécouverte à 6 h ; nom et clan en un appel, introuvable (404 ou sans nom) jamais redemandé, autre échec compté |
| `src/lib/ui-conformance.test.ts` | Exception nommée du bandeau docké complet sur mobile |
| `e2e/nemesis.spec.ts` | Face-à-face et revanche, bilan, chasseurs paginés (onglets sur mobile, joueur inconnu), death cam, période et arme transmises à l'API, bandeau docké sur une ligne sans défilement horizontal. Données : `e2e/support/nemesis.ts` |

## Voir aussi

- [Membres et tableau de bord](membres.md) §3 — carte Némésis du tableau de bord (même route, avec sa période)
- [Cycle de vie d'un clan](cycle-de-vie-clan.md) — `EncounteredPlayer`, source des noms d'adversaires
