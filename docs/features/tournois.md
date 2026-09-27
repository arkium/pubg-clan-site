# Tournois — modes, barème et administration

Un tournoi regroupe les **parties personnalisées** jouées pendant une période, hébergées par un membre du clan
organisateur. Il ne crée aucune donnée de jeu : il sélectionne des matchs existants et leur applique un barème.

## Les quatre modes (2026-09-18)

Le mode est stocké dans `Tournament.rules` — aucune colonne, donc aucune migration :

```ts
rules = {
  mode: 'inter_clan' | 'custom_teams' | 'solo_ffa' | 'intra_clan',
  mixedSquadRule: 'full_share' | 'prorata',   // mode inter-clans uniquement
  placementPoints, killPoints, winBonus, bestOfRounds
}
```

| Mode | Ce qui est classé | Regroupement |
|---|---|---|
| `inter_clan` | Un clan | Les membres d'un même clan dans la manche |
| `custom_teams` | Une équipe fixe, même inter-clans | Tous les membres suivis de l'escouade |
| `solo_ffa` | Un joueur | Chaque membre, avec son propre placement |
| `intra_clan` | Une escouade du clan organisateur | Les membres du clan organisateur seulement |

`normalizeTournamentRules` impose les valeurs par défaut `inter_clan` et `full_share` : un tournoi créé avant cette
évolution garde donc exactement le comportement qu'il avait.

### Escouades mixtes en inter-clans

Quand une escouade réunit deux clans, le clan organisateur choisit :

- **Partage intégral** (`full_share`) : chaque clan reçoit 100 % des points de placement et du bonus de victoire ;
- **Prorata** (`prorata`) : placement et bonus sont divisés selon l'effectif — 2 joueurs sur 4 donnent la moitié.

Dans les deux cas, **les kills ne sont jamais partagés** : ils appartiennent au joueur qui les a faits.

### Deux fonctions de classement

- `computeTournamentStandings` — vue par clan, utilisée partout où le classement est affiché clan par clan.
- `computeTournamentModeStandings` — vue générique : une ligne par participant (`clan`, `team` ou `player`) selon le
  mode. Le moteur ne manipule que des identifiants ; les noms sont résolus à la lecture.

> **État au 2026-09-27** : le moteur gère les quatre modes ; la liste publique et la page de détail classent toutes
> deux par `computeTournamentModeStandings`. `computeTournamentStandings` reste exposée pour les écrans clan qui n'ont
> pas besoin du détail par participant.

## Filtres de format et de carte — piège corrigé

Le formulaire proposait des noms d'affichage (« Erangel ») et des modes inventés (« squad », « trio »). Les matchs
personnalisés, eux, stockent `Baltic_Main` et `normal-squad`. **Un tournoi filtré sur ces valeurs ne retenait aucune
manche, sans aucun message.**

`src/lib/tournament-filters.ts` corrige cela :

- listes de choix alignées sur les valeurs réellement observées en production ;
- `normalizeTournamentMapName` / `normalizeTournamentGameMode` traduisent les valeurs héritées, et sont appliquées
  **côté serveur** à chaque création ou modification ;
- piège à connaître : le dictionnaire officiel associe « Erangel » à `Erangel_Main`, une carte retirée du jeu. Les
  parties se jouent sur `Baltic_Main`, libellé « Erangel (Remastered) ». Une recherche inverse naïve par libellé
  renverrait donc vers une carte qui ne sort jamais.
- « Trio » n'est pas un mode PUBG mais une taille d'escouade : il est ramené à « tous les modes ».

## Page d'administration

`/clans/[clanId]/settings/tournaments`, réservée à `manage_settings`, organisée en trois onglets :

1. **Tournois** — recherche, filtre de statut, tournois actifs en cartes, brouillons et tournois terminés en
   accordéon. Actions par tournoi : synchroniser PUBG, diffuser sur Discord, voir le classement, modifier, supprimer.
2. **Créer / Modifier** — formulaire en cinq blocs : informations générales, mode de tournoi et attribution des
   points, format et filtres PUBG, barème, diffusion Discord.
3. **Guide** — ce que le tournoi comptabilise, les quatre modes, les escouades mixtes, la marche à suivre.

### Suppression

`TournamentDeleteModal` confirme avant d'appeler `DELETE /api/clans/[clanId]/tournaments/[tournamentId]`. La modale
dit explicitement ce qui est conservé : **les matchs PUBG, la télémétrie et les statistiques restent en base**, seule
la configuration du tournoi disparaît.

## Pages joueurs (refonte du 2026-09-27, maquette « Tournois »)

Le **mode** d'abord : chaque mode a son identité — couleur, icône, ce qu'il classe — reprise partout (liste, badges,
en-tête d'un tournoi, barres de points). Couleurs : jetons `.tournament-mode--<mode>` (`--tmode`, `--tmode-text`,
`--tmode-soft`, `--tmode-ring`) dans `globals.css` ; icônes : `TOURNAMENT_MODE_ICONS`
(`src/components/tournaments/TournamentModeBadge.tsx`). Les états actifs (segmented, ancres, puces de manche) restent en
accent (refonte UI §6 bis).

| Mode | Couleur | Icône | Classe | Le lecteur |
|---|---|---|---|---|
| `inter_clan` | ambre | épées | les clans | « Ton clan » |
| `custom_teams` | violet | groupe | les équipes | « Ton équipe » |
| `solo_ffa` | rouge | viseur | les joueurs | « Toi » |
| `intra_clan` | cyan | maison | les escouades du clan | « Ton escouade » |

Libellés et textes des modes : **une seule source**, `TOURNAMENT_MODE_DESCRIPTIONS` (`src/lib/tournament-guide.ts` :
`label` du formulaire, `shortLabel` des pages joueurs, `ranks`, `help`). Unités, colonne et lecteur :
`src/lib/tournament-mode-display.ts` (pur, testé).

### Liste `/tournaments`

- **Bandeau d'image** : « Tournois », compteurs en direct / à venir / terminés ; « Gérer les tournois de mon clan »
  seulement pour qui a `manage_settings` (ou SuperUser).
- **Bandeau collant** : recherche (« Tournoi ou clan » : titre, description, organisateur, vainqueur) et statut
  (Tous / En direct / À venir / Terminés, sans émoji). Il docke **aussi sur mobile** : exception à sticky.md §2.
- **Cartes de mode** : légende et filtre à la fois, avec le nombre de tournois (compté sur la recherche et le statut) ;
  un second clic retire le filtre. Les anciens filtres Format, Carte et le tri ont disparu (décision du 2026-09-27).
- **En direct**, en grand sur la carte jouée : mode, format, organisateur, fin, manches, participants **selon le mode**,
  dernière manche (« il y a 22 min »), top 3 en cours et, connecté, « Ton clan est 2e, à 6 pts de [LMT] La Meute ».
- **À venir** : image de la carte jouée, compte à rebours ; un brouillon y figure avec l'étiquette « Brouillon ».
- **Palmarès** : le vainqueur **suit le mode** — clan, équipe (composition), joueur ou escouade — avec une sous-ligne
  adaptée (« 7 clans en lice », « équipe mixte de 3 clans », « 30 kills », « escouade de Clan Démo »).
- **« Comment ça marche ? »** : quatre lignes repliées, `TOURNAMENT_QUICK_GUIDE`. Le guide complet (7 fiches) ne vit
  plus que dans l'onglet Guide de l'administration (décision du 2026-09-27).

`GET /api/tournaments` (`src/lib/tournament-overview.ts`) classe par `computeTournamentModeStandings`, comme la page de
détail ; l'ancienne version classait **toujours par clan**, d'où un clan « vainqueur » d'un tournoi solo. Chaque résumé
porte : `mode`, `participantCount` (selon le mode), `clanCount`, `lastRoundAt`, `leaders` (3 premiers), `standings`
(complet, **seulement en direct**, pour situer le lecteur) et `winner` (nom résolu, `clanIds` représentés). Les noms
sont résolus en deux requêtes pour toute la liste (`src/lib/tournament-directories.ts`).

La vitrine d'un clan (« tournoi gagné ») lit `winner.clanIds` : un clan gagne un tournoi inter-clans, un tournoi solo
remporté par un de ses joueurs ou un tournoi en équipes libres dont il fait partie de l'équipe gagnante ; des scrims
internes ne comptent pas.

### Page d'un tournoi `/tournaments/[tournamentId]`

`GET /api/tournaments/[tournamentId]/standings` renvoie tout ce que la page affiche, noms déjà résolus
(`src/lib/tournament-standings-view.ts`) :

| Champ | Contenu |
|---|---|
| `rules` | Barème normalisé, mode et règle d'escouade compris |
| `modeStandings` | Classement selon le mode, une ligne par clan, équipe ou joueur, avec rang et libellé |
| `squadBreakdown` | En inter-clans seulement : le même tournoi recalculé escouade par escouade |
| `clanTrophy` | En solo seulement : somme des points des joueurs de chaque clan |
| `rounds` | Manches numérotées chronologiquement, avec vainqueur, MVP et score de chaque participant |
| `mvp` | Meilleur joueur du tournoi : le plus de kills, départagé par les dégâts |
| `standings` | Vue historique par clan, conservée pour les écrans clan |

La page montre :

1. **En-tête sur la carte** (celle du tournoi, sinon celle de la dernière manche) : état, mode, format, organisateur,
   dates, fin ou début, et **le mode en clair** (« Inter-clans : une ligne par clan… ») ; manches, participants, heure de
   la dernière manche. Actions d'organisateur (synchroniser, diffuser, paramètres) pour qui peut les exécuter.
2. **Bandeau collant** : ancres Classement / Manches / Barème (`SectionAnchorNav`) et, connecté, la place du lecteur
   (« Ton clan : 2e · à 6 pts du 1er »). Docke aussi sur mobile (exception à sticky.md §2). Sans manche, l'ancre
   « Manches » disparaît avec sa section.
3. **Podium** (`PodiumCards`, ordinateur) et **MVP dans tous les modes** (il n'apparaissait qu'en solo).
4. **Classement** : ta ligne surlignée et marquée, barre de points à la couleur du mode, kills, Top 1 et **forme** (place
   à chaque manche, #1 en or, « – » absent). Composition en pastilles pour les équipes libres. En inter-clans,
   « Cumul par clan / Détail par escouade » reste proposé (décision du 2026-09-27).
5. **Trophée des clans** en solo.
6. **Manches une par une** : puces M1…Mn et chevrons, la dernière d'abord ; carte, chicken dinner, MVP, lien vers le
   débrief 2D, scores (ta ligne surlignée).
7. **Barème** en barres Top 1 → Top 10, puis par kill, bonus Top 1, manches retenues et, en inter-clans, la règle
   d'escouade mixte (`placementScale`, `tournamentRuleLines`).

Sans manche comptabilisée, le message du joueur ne parle pas de synchronisation : seul l'organisateur reçoit
« Lancez une synchronisation PUBG… ».

**Écarts assumés avec la maquette** (règles de la refonte) : podium par `PodiumCards` (cartes alignées, pas l'ordre
2-1-3) et MVP sur sa propre ligne ; rangs par `RankCell` ; puces de manche et ancres en accent, pas en or ; hauteur du
bandeau d'image de la liste inchangée ; « Tous formats » (et non « Tous les modes ») quand le format est libre, le mot
« mode » désignant ici le mode du tournoi.

### Arbitrages à connaître

- **Le vainqueur d'une manche est celui qui finit premier**, pas celui qui marque le plus de points : avec un fort
  bonus de kills, les deux peuvent différer.
- **Une équipe n'a pas de nom propre** : sa composition en tient lieu (`[SMK] Pagiotte, [RATZ] Nova`), puisque c'est
  elle qui l'identifie d'une manche à l'autre.
- **Points décimaux** : le partage au prorata produit des totaux comme `18,5 pts`. La colonne affiche la décimale
  seulement quand elle existe, et une infobulle rappelle la règle.
- **Le lecteur** vient de la session (`useAuthSession().members`) : son clan en inter-clans, lui-même en solo, une
  équipe ou escouade qui le compte sinon. En visiteur, rien n'est surligné.
- **Les actions d'organisateur** (synchroniser, diffuser, paramètres) n'apparaissent que pour un SuperUser, ou pour
  un membre ayant `manage_settings` sur le clan organisateur **et** l'ayant pour clan sélectionné.
- **Pas d'avatars** : l'avatar vit sur `UserAccount` via `MemberIdentity`, hors du périmètre du classement.
  `PodiumCards` affiche l'initiale du nom, tag de clan ignoré.
- **Le mode intra-clan exige le clan organisateur** : sans lui, le moteur ne renvoie aucune entrée plutôt qu'un
  classement faux. La route le fournit toujours.
- **`resolveTournamentPhase`** vit dans le module pur `tournament-mode-display.ts` (la page de détail, côté navigateur,
  en avait une copie) ; `tournament-overview.ts` le réexporte.

### Anciennes adresses

`/clans/[clanId]/tournaments` et `/clans/[clanId]/tournaments/[tournamentId]` affichaient un écran, chargeaient les
données puis redirigeaient côté navigateur. Supprimées le 2026-09-27 : **redirection HTTP 307** vers `/tournaments` et
`/tournaments/[tournamentId]` (`next.config.ts`). La route `GET /api/clans/[clanId]/tournaments/[tournamentId]/standings`
n'a plus d'appelant (conservée). Anciennes pages : `archive/refonte-ui/tournois/` (ignoré par git).

## Diffusion Discord

L'embed de résultats de manche suit le mode du tournoi (`src/lib/discord/discord-tournament-embed.ts`) :

| Mode | Intitulé des scores | Pied de page |
|---|---|---|
| `inter_clan` | Scores de la manche | `N clan(s) classé(s)` |
| `custom_teams` | Scores de la manche (équipes) | `N équipe(s) classée(s)` |
| `solo_ffa` | Classement de la manche (joueurs) | `N joueur(s) classé(s)` |
| `intra_clan` | Scores de la manche (escouades internes) | `N escouade(s) classée(s)` |

Le classement général joint à l'embed suit le même mode. Quand le partage au prorata est actif, une ligne l'annonce :
sans elle, les points décimaux passeraient pour une erreur de calcul.

L'orchestration (`discord-tournament-service.ts`) réutilise `buildRoundViews` et `computeTournamentModeStandings` :
**l'embed et la page de détail affichent donc exactement les mêmes chiffres**. En scrims internes, le MVP est
restreint au clan organisateur — sinon un joueur d'un autre clan présent dans la partie pourrait être sacré.

## Guide « Comment fonctionne un tournoi ? »

Sept fiches, définies une seule fois dans `src/lib/tournament-guide.ts` et rendues par
`src/components/tournaments/TournamentGuide.tsx` :

1. comment les matchs sont capturés (parties personnalisées, dans la fenêtre de dates) ;
2. la règle d'or de l'organisateur (un de ses membres doit être dans la partie) ;
3. les quatre modes ;
4. les escouades mixtes et le partage des points ;
5. la synchronisation PUBG ;
6. le calcul des scores, avec les deux pièges qui font croire à un bug (filtre trop strict, points décimaux) ;
7. la diffusion Discord.

Il sert à l'onglet Guide de l'administration. La liste `/tournaments` en montre le résumé en quatre lignes
(`TOURNAMENT_QUICK_GUIDE`, même fichier) ; un test vérifie que ce résumé reprend les règles des fiches. Les descriptions
de modes servent aussi de libellés au formulaire de création et aux pages joueurs, et un test échoue si un mode du
moteur n'y est pas décrit.

## Tests

| Fichier | Couvre |
|---|---|
| `tournament-service.test.ts` | Regroupement par clan, barème, `bestOfRounds`, scores de manche |
| `tournament-modes.test.ts` | Normalisation du mode, partage intégral vs prorata, découpe par mode, classements |
| `tournament-filters.test.ts` | Traduction des cartes et modes hérités, listes proposées |
| `tournament-route-contracts.test.ts` | Passage du mode à la création et à la modification, suppression et son refus hors clan |
| `tournament-list-filters.test.ts` | Recherche (vainqueur compris), statut (brouillons avec « à venir »), filtre de mode, compteurs, répartition direct / à venir / palmarès |
| `tournament-overview.test.ts` | Liste publique : vainqueur et participants selon le mode (joueur en solo, escouade en intra-clan), dernière manche, classement détaillé seulement en direct, noms en deux requêtes |
| `tournament-mode-display.test.ts` | Unités par mode, repérage du lecteur (clan, joueur, équipe), phrase « Ton clan est 2e… », forme par manche, comptes à rebours, barème et règles |
| `next-redirects.test.ts` | Chaque redirection de `next.config.ts` mène à une page existante et ne masque aucune page ; anciennes adresses de tournoi par clan |
| `e2e/tournaments.spec.ts` | Liste et détail rendus : cartes de mode, direct, palmarès par mode, recherche et statut, guide, bandeau collant (mobile compris), lecteur, forme, escouades, manches, barème, visiteur, redirections |
| `tournament-standings-view.test.ts` | Libellés des participants, rangs, MVP, manches numérotées, trophée des clans, détail par escouade |
| `discord/discord-tournament-embed.test.ts` | Intitulés par mode, note de prorata, format des lignes, limites Discord |
| `discord/discord-tournament-service.test.ts` | Diffusion dans les 4 modes, MVP restreint en scrims internes, webhooks, journalisation |
| `tournament-guide.test.ts` | Couverture des modes par le guide, cohérence avec le moteur, fiches non vides, pièges rappelés, résumé en quatre lignes |

## Contrôle sur données réelles

```bash
npx tsx scripts/inspect-tournament-standings.ts <tournamentId> [inter_clan|custom_teams|solo_ffa|intra_clan]
```

Rejoue le même tournoi dans le mode demandé, sans rien écrire : classement, MVP, trophée des clans et manches.

```bash
npx tsx scripts/inspect-tournament-overviews.ts
```

Ce que `GET /api/tournaments` renverra, en lecture seule : état, mode, manches, participants et vainqueur selon le mode,
temps de calcul.

## Voir aussi

- [Notifications Discord](discord-notifications.md) — diffusion des résultats de manche
- `docs/TODO/todo.md`, section « Refonte UI/UX des Tournois »
