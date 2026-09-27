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
| Libellés d'armes : le dictionnaire du client ne connaît pas tout (« WeapRPD_C ») | La route renvoie `weaponLabels`, calculés par `weaponDisplayName` (réglage `/settings/weapon-labels`, sinon nom déduit de l'identifiant) pour chaque arme affichée |
| Listes longues à défilement | **Top 10** par liste, **pagination par 5** (`paginate`), jamais de défilement horizontal ; sur mobile, **onglets** Chasseurs / Proies |
| Maquette : noms d'adversaires cliquables | **Aucun lien** : ce sont des joueurs extérieurs au site, sans page (pas de redirection vide) |
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
| `botKillCount`, `botDeathCount`, `environmentalDeathCount` | Comptés à part ; une mort sans tueur = zone, chute, noyade |
| `topDeathWeapons` | 5 armes de toutes les morts de la période, sans le filtre d'arme |
| `availableWeapons`, `selectedWeapon`, `period` | Menu d'armes (vraies armes de la période), filtre appliqué, période appliquée (`all` sans période) |
| `weaponLabels` | Libellé de chaque arme renvoyée |
| `totalDeathsTracked`, `totalKillsTracked` | Tous les événements, bots et zone compris |

## 4. Tests

| Fichier | Couvre |
|---|---|
| `src/lib/nemesis.test.ts` | Agrégation, bots et zone à part, duel inverse toutes armes sous filtre, death cam sans filtre, libellé de revanche |
| `src/lib/member-routes-contracts.test.ts` | Période facultative, lecture sans plafond, noms résolus ou inconnus, duel inverse, libellés d'armes |
| `src/lib/ui-conformance.test.ts` | Exception nommée du bandeau docké complet sur mobile |
| `e2e/nemesis.spec.ts` | Face-à-face et revanche, bilan, chasseurs paginés (onglets sur mobile, joueur inconnu), death cam, période et arme transmises à l'API, bandeau docké sur une ligne sans défilement horizontal. Données : `e2e/support/nemesis.ts` |

## Voir aussi

- [Membres et tableau de bord](membres.md) §3 — carte Némésis du tableau de bord (même route, avec sa période)
- [Cycle de vie d'un clan](cycle-de-vie-clan.md) — `EncounteredPlayer`, source des noms d'adversaires
