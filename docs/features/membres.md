# Membres du clan et tableau de bord d'un joueur

Livré le 2026-09-27 (maquette Claude Design « Membres et joueur », `MembresPropose` et `TableauJoueurPropose`). Deux
pages refaites :

| Page | Adresse | Entrée de navigation | Données |
|---|---|---|---|
| Membres du clan | `/clans/[clanId]/members` | `clan.members` | Fiches des membres actifs, **sans période** (30 derniers jours pour les chiffres) |
| Tableau de bord d'un joueur | `/members/[id]/dashboard` | `member.dashboard` | **Une seule période** pour toute la page (semaine par défaut) |
| Style de jeu d'un joueur (ajoutée le 2026-10-03) | `/members/[id]/playstyle` | `member.playstyle` | Télémétrie, **une seule période** (semaine par défaut), comparée au clan — §3 bis |

Les anciennes versions sont dans `archive/refonte-ui/membres/` (ignoré par git).

## 1. Ce que l'analyse de cohérence a corrigé

| Constat (ancienne page ou maquette) | Décision |
|---|---|
| Maquette : « en jeu », « 3 en jeu », « En jeu · Erangel ». Les parties sont importées une fois par heure, avec un délai médian de plus de 45 min : personne ne sait qui joue à la minute près (même constat que pour `/clans`) | **« A joué ce soir »** : la dernière partie appartient à la soirée en cours (`sessionDateOf`, journée de Paris qui commence à 06:00) — pastille verte, « N ont joué ce soir » dans le bandeau |
| Maquette : K/D, win rate, parties sur 30 jours, tri par K/D. Le vocabulaire de la refonte dit **K/M**, et un K/D ne viendrait que de la carrière PUBG (autre source, sans fenêtre de 30 jours) | **K/M · Win rate · Parties** sur les 30 derniers jours glissants, parties **officielles** suivies par le site (`Match`) ; tri « K/M » |
| Ancienne liste : tri A-Z / Z-A seulement, panneau `bg-white`, « No members yet » en anglais | Filtre par rôle, recherche nom ou pseudo, tri Activité / Nom / K/M / Médailles, panneaux du thème, textes en français |
| Ancien tableau de bord : 12 blocs, titre « Tableau de bord » sans le nom du joueur, grille « Navigation du Joueur », style de jeu affiché deux fois, évolution du style de jeu avec **sa propre période** | Carte joueur en tête, puces vers les pages du joueur dans le bandeau, **une seule période** pour tout |
| Maquette : Némésis sur la période de la page, mais la route n'avait pas de période (500 derniers duels) | Période **facultative** ajoutée à `GET /api/members/[id]/nemesis` ; sans elle, tout l'historique. Depuis la refonte de la page ([nemesis.md](nemesis.md)), la route lit tous les duels, sans plafond |
| Maquette : « membre depuis mars 2025 ». `ClanMember.createdAt` est la date d'**ajout au site**, pas l'entrée dans le clan PUBG | « suivi depuis mars 2025 » |
| Maquette : « sur 64 équipes », « Survie au drop », « Part des drops » : aucune de ces valeurs n'est enregistrée | Non affichés. Meilleure partie : place ; Au drop : drops analysés, drops chauds, adversaires à 250 m, ville favorite |
| Maquette : puces des pages du joueur en **défilement horizontal** sur mobile | **Chevrons** ‹ › (`ChevronPager`) : 4 puces à la fois sur mobile, toutes à partir de `sm` — puis **puces retirées le 2026-10-03** : chaque page a son lien dans une carte (vérifié : les 9 entrées visibles du registre — les 3 autres sont `hidden` — ont chacune leur carte) |

## 2. « Membres du clan » (`/clans/[clanId]/members`)

Bandeau d'image (hauteur inchangée) : « Clan · N joueurs » et « N ont joué ce soir ». Bandeau de filtres
(`DockingToolbar`, **pas de docking sur mobile** : page sans période, `sticky.md` §2) : recherche, rôle (Tous, Fragger,
Medic, Ghost), tri (Activité, Nom, K/M, Médailles), lien « Demandes en attente (N) » pour qui peut les traiter.

- **Fiche** (`MemberCard`) : avatar entouré de la couleur du rôle, pastille verte si le joueur a joué ce soir, rôle,
  « vu il y a 2 j », puis K/M, Win rate, Parties (30 jours), arme fétiche (silhouette en filigrane et en pied de carte)
  et médailles de carrière. Toute la carte ouvre le tableau de bord du joueur.
- **Rôle dominant** : le plus haut des trois scores de style de jeu **depuis le début du suivi**
  (`MemberTelemetryStats` `all-time`) — Fragger = agressivité, Medic = support, Ghost = discipline de zone. Aucun rôle
  tant que les trois scores sont nuls.
- **Arme fétiche** : l'arme aux kills les plus nombreux depuis le début du suivi (`MemberWeaponStats` `all-time`).
- **En réserve** : aucune partie depuis 30 jours (ou jamais). Repliée en bas, comme les clans en sommeil de `/clans` ;
  chaque ligne ouvre le tableau de bord.

Logique pure : `src/lib/member-roster.ts` (rôle dominant, « ce soir », libellés d'activité, réserve, tris, filtres,
initiales).

### API — `GET /api/clans/[clanId]/members/cards`

Permission `clan.members`. Réponse : `{ clan, members: RosterMember[], pendingCount }`. `pendingCount` vaut `null`
quand le lecteur n'a pas `manage_members`. Chaque membre : `memberId`, `displayName`, `pubgPlayerName`, `avatarUrl`,
`lastMatchAt`, `role` (`{ id, score }` ou `null`), `recent` (`matches`, `kills`, `wins` sur 30 jours officiels),
`favoriteWeapon` (`{ id, label }` ou `null`), `medals`.

`GET /api/members?clanId=` (ancienne source de la page) reste utilisé par `/settings/match-import`.

## 3. Tableau de bord d'un joueur (`/members/[id]/dashboard`)

- **Carte joueur** (bandeau d'image, hauteur minimale inchangée) : avatar entouré de la couleur du rôle, nom, pseudo
  PUBG, clan, « suivi depuis », rôle de la période (« Fragger · 82 % »), distinction du classement du clan sur la
  période (`computeDistinctions`, « Top killer de la semaine »), « A joué ce soir ». **Plus de puces** vers les pages
  du joueur (2026-10-03) : elles doublonnaient les liens des cartes — Carrière, Armes (Arsenal), Style de jeu (Profil de
  jeu, « Détail → »), Objets consommés, Némésis, Cartes, Drop zones (Au drop), Calendrier (« Détail → »), Matchs
  (« Tout l'historique → »).
- **Bandeau de période** : `PeriodFilter` + `usePagePeriod`, docké aussi sur mobile (page à période). Au repos :
  « Comparé à la moyenne du clan et à la période précédente ».
- **4 chiffres clés** : Kills et Dégâts avec l'écart à la moyenne du clan (« +18 % vs clan », rien sans moyenne),
  Win rate (« 4 top 1 sur 22 parties »), Parties (assistances, réanimations). Mini-barres : les 7 **soirées** de la
  semaine, les semaines du mois, les 8 dernières semaines pour « Tous » (`activityBuckets`, une partie de 01:30 compte
  la veille).
- **Meilleure partie** : la partie officielle aux kills les plus nombreux (puis dégâts), sur sa carte ; place, temps en
  vie, coéquipiers du clan, lien vers le débriefing quand la télémétrie existe.
- **Profil de jeu** : une barre par rôle, repère de la moyenne des membres mesurés du clan, tendance en points par
  rapport à la période précédente (aucune pour « Tous »). Remplace les jauges, l'évolution du style de jeu et le
  radar. En pied : temps en zone sûre, part des dégâts soignés, phase du premier contact.
- **Arsenal** (top 3 des armes, % de headshots et précision → Armes), **Frères d'armes** (3 partenaires du clan les
  plus fréquents : rôle, temps ensemble, parties, WR → leur tableau de bord), **Némésis** (bourreau, victime préférée,
  bots neutralisés → Némésis), **Au drop** (ville favorite, drops analysés, drops chauds, adversaires à 250 m → Zones
  de drop).
- **5 dernières parties** (débriefing quand il existe), puis « Tout l'historique → » (`/members/[id]/matches`).
- **Dernières parties** et **calendrier** des 5 dernières semaines côte à côte, **à la même hauteur** (bas alignés, les
  lignes des parties se partagent la hauteur ; le résumé du calendrier reste en pied). Le calendrier mène à la page du
  calendrier d'activité (« Détail → », `/members/[id]/heatmap`).
- **Rangée de trois cartes résumé** (2026-10-03), même matière sombre et même gabarit (« Voir → » sur la ligne du
  surtitre) : **Carrière PUBG** (sans période — voir [Carrière PUBG d'un joueur](carriere-joueur.md) §4), **Objets
  consommés** (par match, total, famille dominante, objet le plus utilisé — `/api/members/[id]/item-use`) et **Cartes**
  (carte la plus jouée, ses parties et son win rate, nombre de cartes jouées — `/api/members/[id]/map-stats`), ces deux
  dernières sur la période de la page (`src/components/player-dashboard/SummaryLinkCards.tsx`).

Logique pure : `src/lib/player-dashboard.ts` (clés de période, barres d'activité, écart au clan, profil et tendance).

### API

| Route | Changement |
|---|---|
| `GET /api/members/[id]/dashboard?period=` | **Réécrite** : `{ period, member, stats, clanAverage, activity, bestMatch, playstyle, mates }` (type `PlayerDashboardResponse`). Plus de `progression`, `topPerformances`, `squads`, `dropPressure*` |
| `GET /api/members/[id]/drop-pressure?period=` | **Nouvelle** : `{ period, stats, ranking, timeline }`, servie jusque-là par la route du tableau de bord |
| `GET /api/members/[id]/nemesis?period=week\|month` | Période **facultative** (`KillEvent.matchDate`) ; sans elle, tout l'historique suivi |
| `GET /api/members/[id]` | Renvoie aussi `clanId` : le menu (`ClanNavigation`) y lit le joueur consulté au lieu de charger tout le tableau de bord |

Le tableau de bord lit aussi, sur la même période : `telemetry/weapons`, `city-insights`, `matches` (5 parties) et le
classement du clan (`/api/clans/[clanId]/leaderboard`, parties officielles) pour la distinction.

## 3 bis. Style de jeu d'un joueur (`/members/[id]/playstyle`)

Ajoutée le 2026-10-03, écrite d'emblée selon la charte (`.charte`, docs/ui/index.html). Le tableau de bord n'en garde
que le résumé : la carte « Profil de jeu » porte un lien **« Détail → »** vers cette page. Elle rend visible ce que la
route `/api/members/[id]/telemetry/playstyle` calculait déjà sans qu'aucune page ne l'affiche, et donne au joueur
l'équivalent du style de jeu du clan (`/clans/[clanId]/stats`).

- **Bandeau** : période (`PeriodFilter` + `usePagePeriod`), contexte au repos (« 20 parties analysées · comparé à 8
  joueurs du clan »), ancres Profil / Mobilité / Coopération en seconde ligne. Docké sur mobile : la période seule.
- **Profil de jeu** : une carte par rôle (Fragger, Medic, Ghost) — jauge et score en Teko, barre avec le repère de la
  moyenne du clan, écart en points (« +21 pts vs clan ») et rang (« 2ᵉ sur 8 joueurs du clan », « Meilleur du clan »).
  Moyenne et rang sur les joueurs du clan mesurés **sur la même période**, le joueur compris même si la route du clan
  ne l'a pas renvoyé. Seul mesuré, ou sans accès aux données du clan : pas de comparaison.
- **Mobilité, cercle et survie** : les trois thèmes du style de jeu du clan (`playstyleThemes`), appliqués à la seule
  ligne du joueur, avec la colonne « Clan » en regard.
- **Coopération** : ses coéquipiers dans les binômes du clan (parties officielles, tous modes, comme le clan) — 4
  chiffres (coéquipiers, réanimations, co-kills, recalls) et un tableau trié par la pondération de l'indice de synergie
  (réanimations ×3, co-kills ×2, dégâts partagés ×1), paginé par 10. Un nom mène au style de jeu du coéquipier.
- **Meilleures formations** (2026-10-03, venues des statistiques par carte) : meilleurs duo, trio et squad de la période
  (`bestCompositions` de `/api/members/[id]/map-stats`), cartes `.app-panel` à liseré de la couleur du mode, win rate en
  Teko, coéquipiers, matchs / victoires / place moyenne ; un mode jamais joué n'est pas affiché. Hors des ancres du
  bandeau (trois ancres tiennent sur 375 px, pas quatre).
- **Aller plus loin** : Objets consommés, Statistiques par carte, Carrière PUBG.
- **Aucune partie analysée** sur la période : un message, pas de sections vides ; les liens restent.

Données : `/api/members/[id]/telemetry/playstyle` (`data.member.clanId` donne le clan), puis
`/api/clans/[clanId]/telemetry/playstyle` et `/api/clans/[clanId]/telemetry/synergies`. Logique pure :
`src/lib/player-playstyle.ts` (comparaison, rang, coéquipiers) ; blocs : `src/components/player-playstyle/`.

**Navigation** : `member.playstyle` dans les trois registres (`nav-permissions-registry`, `nav-parent-registry`,
`nav-icons`). Le menu lit la table `NavItem` : l'entrée n'y apparaît qu'après `npx tsx scripts/seed-playstyle-nav.ts`
(idempotent, écrit en base — à lancer au déploiement).

## 4. Blocs déplacés

| Bloc de l'ancien tableau de bord | Nouvelle place |
|---|---|
| Pression au drop (`DropPressureStatsPanel`) et villes (`CityInsightsPanel`, portée membre) | D'abord sous la carte des zones de drop du joueur ; **retirés le 2026-10-03** comme ceux du clan (redondants avec le profil de saut et le top 5) et archivés. Zones de combat : cartographie tactique du clan (lien en pied de la carte « Profil de saut ») — [drop-zones.md](drop-zones.md) |
| Compositions d'équipe (`TeamPlayCompositionsCard`) | Page « Stats par carte » du joueur, puis (2026-10-03) **style de jeu du joueur**, section « Meilleures formations » (`BestCompositions`) ; composant supprimé |
| Stats principales, progression, radar, jauges et évolution du style de jeu, squads fréquents, meilleures performances | Remplacés par les chiffres clés, la meilleure partie, le profil de jeu et les frères d'armes ; composants archivés |
| Historique des matchs paginé | Page « Matchs » du joueur ; le tableau de bord n'en garde que les 5 dernières |

## 5. Jetons et composants ajoutés

- `--theme-ui-positive` / `--theme-ui-negative` (`globals.css`, clair et sombre) : écart favorable, « a joué ce soir »,
  tendance. Pas de nouveau `dark:`.
- `ChevronPager` (`src/components/ui/ChevronPager.tsx`) : rangée paginée par chevrons au lieu d'un défilement horizontal.
- `usePageData` (`src/hooks/usePageData.ts`) : lecture d'une route qui garde la réponse précédente pendant le
  rechargement (la page l'estompe) ; sorti de la page « Style de jeu ».

## 6. Tests

| Fichier | Couvre |
|---|---|
| `src/lib/member-roster.test.ts` | Rôle dominant et égalités, « ce soir » en journée de Paris, libellés, réserve, K/M et win rate, tris, filtres sans accents, initiales |
| `src/lib/player-playstyle.test.ts` | Style de jeu du joueur : moyenne du clan joueur compris, rang et ex aequo, joueur absent des lignes du clan, sans comparaison, écart en points, coéquipiers côté partenaire et tri, contexte du bandeau |
| `src/lib/player-dashboard.test.ts` | Clés de période (janvier → décembre), barres par soirée (partie de nuit la veille), semaines du mois, 8 semaines, écart au clan, profil et tendance |
| `src/lib/member-routes-contracts.test.ts` | Contrats (Prisma simulé) : fiches (rôle, 30 jours officiels, arme fétiche, demandes réservées), tableau de bord (forme, meilleure partie, frères d'armes, profil), pression au drop, période de la Némésis |
| `e2e/members.spec.ts` | Les deux pages : « ce soir » sans « en jeu », fiches et lien, réserve, filtres et tri, demandes en attente, docking (pas sur mobile / oui sur le tableau de bord), période unique, chiffres clés, meilleure partie, profil, cartes et liens, dernières parties, calendrier et carte Carrière, chevrons sur mobile, aucun défilement horizontal. Données : `e2e/support/members.ts` |
| `e2e/player-playstyle.spec.ts` | Style de jeu du joueur : score, moyenne et rang par rôle, contexte du bandeau, thèmes avec la colonne Clan, coéquipiers triés et leur lien, période sans partie analysée, aucun défilement horizontal, lien « Détail → » du tableau de bord. Données : `e2e/support/player-playstyle.ts` |

## Voir aussi

- [Dashboard membre](member-dashboard.md) — données `PlayerStats` et `MemberLifetimeStats`, page de carrière du joueur
- [Villes et zones de combat](positions-villes.md) · [Clans](clans.md) §6 bis (annuaire des clans, réserve « en sommeil »)
