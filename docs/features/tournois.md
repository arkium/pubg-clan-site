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

> **État au 2026-09-18** : le moteur gère les quatre modes, et la page de détail les affiche (VOLET 3).
> `computeTournamentStandings` reste exposée pour les écrans clan qui n'ont pas besoin du détail par participant.

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

## Page publique

`/tournaments` (refondue le 2026-09-17) : hero, recherche, filtres, tournois en direct en cartes et archives en
tableau triable avec vainqueur. Voir `src/lib/tournament-overview.ts`.

## Page de détail d'un tournoi

`/tournaments/[tournamentId]` (refondue le 2026-09-18). `GET /api/tournaments/[tournamentId]/standings` renvoie tout
ce que la page affiche, noms déjà résolus (`src/lib/tournament-standings-view.ts`) :

| Champ | Contenu |
|---|---|
| `rules` | Barème normalisé, mode et règle d'escouade compris |
| `modeStandings` | Classement selon le mode, une ligne par clan, équipe ou joueur, avec rang et libellé |
| `squadBreakdown` | En inter-clans seulement : le même tournoi recalculé escouade par escouade |
| `clanTrophy` | En solo seulement : somme des points des joueurs de chaque clan |
| `rounds` | Manches numérotées chronologiquement, avec vainqueur, MVP et score de chaque participant |
| `mvp` | Meilleur joueur du tournoi : le plus de kills, départagé par les dégâts |
| `standings` | Vue historique par clan, conservée pour les écrans clan |

La page montre : hero avec badge d'état pulsant, badges (mode, format, carte, clans détectés, manches), barème
rétractable, podium des trois premiers, classement adapté au mode, puis les manches avec un lien direct vers le
débriefing 2D.

### Arbitrages à connaître

- **Le vainqueur d'une manche est celui qui finit premier**, pas celui qui marque le plus de points : avec un fort
  bonus de kills, les deux peuvent différer.
- **Une équipe n'a pas de nom propre** : sa composition en tient lieu (`[SMK] Pagiotte, [RATZ] Nova`), puisque c'est
  elle qui l'identifie d'une manche à l'autre.
- **Points décimaux** : le partage au prorata produit des totaux comme `18,5 pts`. La colonne affiche la décimale
  seulement quand elle existe, et une infobulle rappelle la règle.
- **Les actions d'organisateur** (synchroniser, diffuser, paramètres) n'apparaissent que pour un SuperUser, ou pour
  un membre ayant `manage_settings` sur le clan organisateur **et** l'ayant pour clan sélectionné.
- **Pas d'avatars** dans le podium ni dans le classement solo : l'avatar vit sur `UserAccount` via `MemberIdentity`,
  hors du périmètre du classement. Médailles et pastilles de clan en tiennent lieu.
- **Le mode intra-clan exige le clan organisateur** : sans lui, le moteur ne renvoie aucune entrée plutôt qu'un
  classement faux. La route le fournit toujours.

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

Le même composant sert à l'onglet Guide de l'administration et à la section repliable de `/tournaments` : une règle
expliquée au joueur ne peut pas diverger de celle montrée à l'organisateur. Les descriptions de modes servent aussi
de libellés au formulaire de création, et un test échoue si un mode du moteur n'y est pas décrit.

## Tests

| Fichier | Couvre |
|---|---|
| `tournament-service.test.ts` | Regroupement par clan, barème, `bestOfRounds`, scores de manche |
| `tournament-modes.test.ts` | Normalisation du mode, partage intégral vs prorata, découpe par mode, classements |
| `tournament-filters.test.ts` | Traduction des cartes et modes hérités, listes proposées |
| `tournament-route-contracts.test.ts` | Passage du mode à la création et à la modification, suppression et son refus hors clan |
| `tournament-list-filters.test.ts` | Recherche, filtres et tri de la page publique |
| `tournament-standings-view.test.ts` | Libellés des participants, rangs, MVP, manches numérotées, trophée des clans, détail par escouade |
| `discord/discord-tournament-embed.test.ts` | Intitulés par mode, note de prorata, format des lignes, limites Discord |
| `discord/discord-tournament-service.test.ts` | Diffusion dans les 4 modes, MVP restreint en scrims internes, webhooks, journalisation |
| `tournament-guide.test.ts` | Couverture des modes par le guide, cohérence avec le moteur, fiches non vides, pièges rappelés |

## Contrôle sur données réelles

```bash
npx tsx scripts/inspect-tournament-standings.ts <tournamentId> [inter_clan|custom_teams|solo_ffa|intra_clan]
```

Rejoue le même tournoi dans le mode demandé, sans rien écrire : classement, MVP, trophée des clans et manches.

## Voir aussi

- [Notifications Discord](discord-notifications.md) — diffusion des résultats de manche
- `docs/TODO/todo.md`, section « Refonte UI/UX des Tournois »
