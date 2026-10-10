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

`/clans/[clanId]/settings/tournaments`, réservée à `manage_settings` (ou SuperUser ; sinon renvoi vers la vue
d'ensemble du clan), organisée en trois onglets :

1. **Tournois** — recherche, filtre de statut, tournois actifs en cartes, brouillons et tournois terminés en
   accordéon. Actions par tournoi : synchroniser PUBG, diffuser sur Discord, voir le classement, modifier, supprimer.
2. **Créer** (ou **Modifier** quand un tournoi est en cours d'édition) — formulaire en cinq blocs : informations
   générales (dont les heures facultatives), mode de tournoi et attribution des points, format et filtres PUBG, barème,
   diffusion Discord ; puis l'**aperçu de la vitrine** (voir « Horaires et aperçu de la vitrine »).
3. **Guide** — ce que le tournoi comptabilise, les quatre modes, les escouades mixtes, la marche à suivre.

**Charte UI** (`docs/ui/index.html`, 2026-10-04) : la page porte `.charte` et `.game-ui`. La page garde l'état et les
appels API ; les blocs vivent dans `src/components/tournament-admin/` (`TournamentAdminSections` : bandeau, cartes,
liste, alertes, toast, menu de statut ; `TournamentEditor` : formulaire ; `tournament-form.ts` : état, valeurs par
défaut, contrôles et corps envoyé, repris tels quels de l'ancienne page).

- **Bandeau d'image** (`/ClanLeaderboardTable.jpg`, hauteur standard 10 / 13 rem) : « Gestion des tournois » en
  `t-banner-title`, trophée à l'accent ; « Nouveau tournoi » en haut à droite, en verre dépoli (charte, En-têtes).
- **Bandeau collant** (`DockingToolbar`, `ToolbarGroup`) : onglets (icônes lucide, plus d'émoji), puis recherche
  (`app-toolbar-search`) et statut sur l'onglet Tournois. Page sans période : **rien de docké sur mobile**
  (`dockOnMobile={false}`, sticky.md §2). Docké sur ordinateur, le statut passe en menu (`StatusFilterMenu`) pour tenir
  sur une ligne. Hors du contrôle `ui-conformance` (pages d'administration hors périmètre).
- **Cartes** `app-panel` : mode par `TournamentModeBadge`, statut en pastille (actif teinté à l'accent, brouillon et
  terminé neutres), format, carte et dates (avec l'année) en `app-meta-pill`, « Tous formats » quand le format est
  libre ; « Supprimer » en `app-btn--danger`, écarté à droite. État vide : bordure tiretée, rayon 14.
- **Formulaire** : champs `app-input` (36 px, focus à l'accent), intitulé au-dessus, aide en `t-meta`. Les contrôles
  sont les mêmes qu'avant (titre, dates, fin après début) mais l'erreur s'affiche **sous le champ** au jeton négatif
  (`aria-invalid`, formulaire `noValidate`) ; l'erreur du serveur s'affiche sous le formulaire, à côté du bouton.
  Statut en `SegmentedControl` ; format PUBG (5 choix) en tuiles compactes ; mode du tournoi et escouades mixtes en
  tuiles radio (choix teinté à l'accent, icône du mode à sa couleur `--tmode`) ; carte (11 choix) en menu de la charte
  (`app-menu-trigger` / `app-menu`). **Plus aucun `<select>` natif.**
- **Messages** : alertes en ligne de la charte (succès au jeton positif, erreur au négatif) ; synchronisation en toast
  (en bas à droite, centré en bas sur mobile ; en cours au ciel, réussite positive, attente — aucune nouvelle manche —
  à l'orange `--game-warn`, échec négatif), fermé à la main
  comme avant.

### Horaires et aperçu de la vitrine (2026-10-10)

**Heures facultatives**, saisies **en heure de Paris** sous chaque date (« 21:00 » → « 03:00 » avec le jour suivant
comme fin, pour une soirée qui finit après minuit). Vides : le tournoi reste en **journées entières**, comme avant.
Logique dans `src/lib/tournament-schedule.ts` (pur, testé par `tournament-schedule.test.ts`), sans migration :
`startDate` / `endDate` sont déjà des horodatages.

- **Deux formes** : journée entière = minuit UTC pile (la fin couvre tout le dernier jour, jusqu'à 23:59:59.999 UTC) ;
  heure précise = l'instant converti depuis Paris (heure d'été ou d'hiver). Une heure tombant pile sur minuit UTC (2 h
  du matin en été) est décalée d'**une milliseconde**, pour ne jamais passer pour une journée entière.
- **Une seule fin** (`tournamentWindowEnd`) pour la **capture des manches** (`tournament-service.ts`), la **phase**
  « en direct » (`resolveTournamentPhase`, qui étendait jusqu'ici toujours à 23:59 en heure locale) et la **vitrine**
  (résultats gardés 3 jours après la fin réelle). **Conséquence** : avec une heure de fin, une partie jouée après elle
  n'est plus comptée.
- **API** : `startTime` / `endTime` (« HH:MM », facultatifs) à côté de `startDate` / `endDate` dans `POST` et `PATCH`
  `/api/clans/[clanId]/tournaments[/id]` ; l'API convertit. Heure mal formée ou fin avant le début : **400**
  (`TournamentInputError`). `GET` renvoie aussi `clan` (nom, tag) pour l'aperçu.
- **Affichage** : « 10 oct. 21:00 → 11 oct. 03:00 » (`formatTournamentPeriod`) sur `/tournaments`, la vitrine et ses
  cartes (heure en or dans le pavé de date) ; une journée entière s'affiche comme avant.

**Titre** (`src/lib/tournament-title.ts`, mêmes règles dans le formulaire et l'API) : 80 caractères au plus, **ni lien
(« https:// », « www. », « discord.gg/ », nom de domaine) ni balise HTML** — il s'affiche sur la vitrine publique.
Partout il est rendu en texte (React échappe, aucun `dangerouslySetInnerHTML`) ; sur Discord il part dans le titre de
l'embed, où ni lien ni mention ne sont interprétés.

**Aperçu de la vitrine** (`TournamentVitrinePreview`, dernier bloc du formulaire) : les vrais composants de la page
d'accueil (`HomeTournaments.tsx` : carte « Prochains tournois », ligne d'agenda mobile, ticket du haut de page, cadre
« en direct ») avec les valeurs saisies, plus le calendrier sur la vitrine (annoncé 14 jours avant, en direct, résultats
jusqu'au…, `homeTournamentVisibility`). Brouillon : « rien n'apparaît sur la vitrine ». Un titre refusé est signalé dans
l'aperçu avant l'envoi. L'aperçu est **inerte** (`inert`) : ses liens ne mènent nulle part.

**Nombre de joueurs** (`TournamentOverview.playerCount`) : joueurs suivis distincts des manches comptées, calculé à
partir des matchs du tournoi (pas besoin de télémétrie). La vitrine l'affiche dans le cadre « en direct » et les
résultats dès la première manche (« 42 joueurs »), rien avant.

### Synchronisation PUBG : ce que dit le bouton (2026-10-10)

`POST /api/clans/[clanId]/tournaments/[tournamentId]/sync` part des **propres parties PUBG du joueur actif** de la
session (`sync-matches` avec son `memberId`) : seule la partie qu'il a jouée est retrouvée aussitôt, avec tous les
joueurs suivis. Un joueur hors du clan organisateur reçoit un **403 expliqué** (avant : un 502 « Active member not
found in this clan »). La réponse porte `newRounds`, les manches que ce clic a fait entrer au classement.

Les deux pages (administration et page d'un tournoi) affichent le même message, écrit pour l'organisateur et non plus
un rapport technique — `src/lib/tournament-sync-summary.ts`, testé :

| Cas | Message (résumé) |
|---|---|
| Nouvelle manche | « 1 nouvelle manche ajoutée — 3 manches au total. » Le classement est à jour, le replay suit en quelques secondes |
| 0 manche au total | PUBG publie une partie quelques minutes après sa fin : attendre deux ou trois minutes, puis **recliquer — sans risque**, une manche n'est jamais comptée deux fois ; rappel de la fenêtre et des filtres du tournoi |
| Rien de nouveau | « Aucune nouvelle manche — N déjà au classement », même invitation à recliquer |
| Avant le début | « Le tournoi n'a pas commencé (dates) » |
| Délai du proxy dépassé (réponse non JSON) | La synchronisation continue peut-être : recharger dans une minute avant de recliquer |
| Échec PUBG (502) | La raison, puis « Réessayez dans une minute », sans risque |

Sur la page d'un tournoi, le classement **se recharge seul** après la synchronisation (plus de « Rechargez la page »).
Le replay vit dans le débrief de la manche, lu à l'ouverture : rien à recharger pour lui.

### Suppression

`TournamentDeleteModal` confirme avant d'appeler `DELETE /api/clans/[clanId]/tournaments/[tournamentId]`. La modale
dit explicitement ce qui est conservé : **les matchs PUBG, la télémétrie et les statistiques restent en base**, seule
la configuration du tournoi disparaît. Modale de la charte (comme la confirmation du mot de passe de `/account`) : voile
`app-modal-backdrop`, carte `app-panel`, tuile d'icône au jeton négatif, titre `t-section-title`, « Annuler » en
secondaire et « Supprimer définitivement » en `app-btn--danger` (jamais jaune) ; Échap ferme, sauf pendant la
suppression.

### Tests de la page

`e2e/tournament-admin.spec.ts` (simulations dans `e2e/support/tournament-admin.ts`, organisateur `manage_settings`,
toutes les API interceptées, `DELETE` par une route Playwright dédiée) : liste et archives, recherche et statut, état
vide, création (erreurs sous les champs, heures de Paris et aperçu de la vitrine, titre avec lien signalé puis refusé,
corps du `POST` complet avec `startTime` / `endTime`), erreur du serveur, modification (valeurs héritées
normalisées, corps du `PATCH`), suppression par la modale (Échap, `DELETE`), synchronisation et toast, diffusion
Discord (aperçu, manche déjà diffusée, envoi simulé), guide, bandeau docké sur ordinateur et jamais sur mobile, refus
sans droit, aucun défilement horizontal ni `<select>` natif.

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
- **Charte UI** (`docs/ui/index.html`, section « Tournois », 2026-10-04) : la page porte `.charte` ; titre du bandeau
  d'image en `t-banner-title` (Teko), compteur « en direct » à l'accent dès qu'un tournoi se joue, neutre sinon ;
  bandeau collant à une seule hauteur (`app-toolbar-search`, statut `self-stretch`). Docké sur mobile, le statut passe
  dans un menu (`TournamentStatusMenu`) pour tenir sur une ligne avec la recherche. La hauteur du bandeau d'image ne
  change pas. La page d'un tournoi a suivi le même jour (voir plus bas) ; `.tournament-place` est à 11 px.

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

1. **En-tête sur la carte** (celle du tournoi, sinon celle de la dernière manche — `TournamentDetailHeader`) : état,
   mode, format, organisateur, dates, fin ou début, et **le mode en clair** (« Inter-clans : une ligne par clan… ») ;
   manches, participants, heure de la dernière manche. Actions d'organisateur (synchroniser, diffuser, paramètres) pour
   qui peut les exécuter.
2. **Bandeau collant** : ancres Classement / Manches / Barème (`SectionAnchorNav`) et, connecté, la place du lecteur
   (« Ton clan : 2e · à 6 pts du 1er », `TournamentViewerChip`). Docke aussi sur mobile (exception à sticky.md §2). Sans
   manche, l'ancre « Manches » disparaît avec sa section.
3. **Podium** (`PodiumCards`, ordinateur) et **MVP dans tous les modes** (il n'apparaissait qu'en solo).
4. **Classement** : ta ligne surlignée et marquée, barre de points à la couleur du mode, kills, Top 1 et **forme** (place
   à chaque manche, #1 en accent plein, « – » absent). Composition en pastilles pour les équipes libres. En inter-clans,
   « Cumul par clan / Détail par escouade » reste proposé (décision du 2026-09-27).
5. **Trophée des clans** en solo, rangs par `RankCell`.
6. **Manches une par une** : puces M1…Mn et chevrons, la dernière d'abord ; carte, tampon « Chicken dinner » et
   vainqueur, MVP, lien vers le débrief 2D, scores (ta ligne surlignée).
7. **Barème** en barres Top 1 → Top 10, puis par kill, bonus Top 1, manches retenues et, en inter-clans, la règle
   d'escouade mixte (`placementScale`, `tournamentRuleLines`).

**Charte UI** (`docs/ui/index.html`, section « Tournois », 2026-10-04) : la page porte `.charte` (avec `.game-ui` et la
classe du mode) ; classes de rôle partout (`t-section-title`, `t-card-title`, `t-meta`, `t-num`, `t-hero`).

- **En-tête** : photo `.app-on-photo bg-hero-fallback`, rayon 14, titre `t-banner-title` précédé du trophée à l'accent,
  chiffres en Teko. La hauteur du bandeau d'image ne change pas (≈ 207 px au lieu de 210 sur ordinateur, structure
  identique : textes à gauche, trois tuiles à droite). Lien de l'organisateur blanc souligné d'accent.
- **État** (`TournamentPhaseBadge`, `data-testid="tournament-phase"`) : « en direct » en **accent plein à encre
  sombre**, comme la carte « en direct » de la liste (charte §1.2 : jamais de blanc sur le jaune) ; à venir (horloge),
  terminé (drapeau) et brouillon (crayon) en puce neutre sur la photo (`border-white/25 bg-white/15`). Plus aucun
  `bg-red-500` / `bg-sky-500` / `bg-amber-400`.
- **Lecteur** : pastille de place, marque « Ton clan » et ligne `.tournament-row--viewer` en accent teinté (plus de
  marque blanche sur l'accent). Dans le bandeau, la pastille prend la hauteur de la ligne des ancres (`self-stretch`,
  plus de `h-[34px]`). **Docké sur mobile, une seule ligne** (charte §6) : ancres sans icône, pastille réduite au rang
  (« 2e », phrase entière en infobulle et pour les lecteurs d'écran).
- **Or et accent** : Top 1 du classement en `t-gold`, MVP du tournoi dans un `.app-panel` teinté or (`--game-gold-soft`,
  chiffres en Teko) ; place #1 d'une manche (`.tournament-place--win`) en accent plein. Barème : une seule barre à
  l'accent, le Top 1, les autres à la couleur des traits (`--game-track-strong`, charte §5g). Lien « Débrief 2D » à
  l'accent sur la photo (plus d'indigo).
- **Aucun défilement horizontal** (charte §4) : le tableau n'a plus de conteneur défilant ; sous 768 px, kills et Top 1
  passent dans la sous-ligne et la forme disparaît ; la forme est bornée aux **5 dernières manches** de 768 à 1 023 px
  et aux **10 dernières** au-delà (« Forme · 10 dernières »). Les puces de manche ne défilent plus : jusqu'à 7 manches,
  toutes ; au-delà, la première, la courante et ses voisines, la dernière, « … » entre elles (`paginationItems`).
- **`.tournament-place`** (`globals.css`) : 11 px (10 px avant), rayon 6, #1 en accent plein à encre sombre (`#1c1003`,
  comme `.charte .app-placement-badge--winner`), Top 10 en accent teinté, au-delà en retrait, absent en contour.
- **États** : chargement par `CardSkeleton`, erreur en `t-neg` avec lien `app-link`, classement vide en état vide de la
  charte (panneau, trophée atténué, message).

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
- **Les actions d'organisateur** (synchroniser, diffuser, paramètres) suivent la règle des routes
  (`src/lib/tournament-manage-access.ts`, 2026-10-10) : le SuperUser, ou l'**Owner** du clan organisateur — son joueur
  **actif** (pas le clan sélectionné), tant que la compétition est ouverte aux Owners. Avant, `manage_settings` et le
  clan sélectionné suffisaient : le bouton s'affichait puis le serveur répondait « Forbidden ». Une mention « Réservé à
  l'organisation — les joueurs ne voient pas ces boutons » les précède. Un SuperUser hors du clan organisateur voit
  « Synchroniser PUBG » **désactivé**, avec la raison (passer sur son joueur du clan, ou laisser l'Owner cliquer).
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

### Modale de diffusion (charte UI, 2026-10-04)

`TournamentBroadcastModal` s'ouvre depuis l'administration et depuis la page d'un tournoi (props inchangées :
`clanId`, `tournamentId`, `tournamentTitle`, `onClose`, `onBroadcast`). Modale de la charte : voile
`app-modal-backdrop`, carte `app-panel`, tuile mégaphone teintée à l'accent, titre `t-section-title`, en-tête et
actions fixes avec un corps qui défile (sur mobile, « Confirmer » reste visible sous un long aperçu) ; Échap ferme.

- **Manche à diffuser** : menu de la charte (`app-menu-trigger` / `app-menu`), plus de `<select>` natif ; la dernière
  manche est choisie par défaut, une manche déjà partie porte « Déjà diffusée » en orange d'attente (`--game-warn`).
- **Manche déjà diffusée** : alerte en orange d'attente, bouton « Confirmer et rediffuser » ; erreur au jeton négatif.
- **Aperçu** (`DiscordEmbedPreview`, partagé avec `/clans/[clanId]/settings/discord`) : surfaces, textes et liens
  (`app-link`) aux jetons du thème, plus de bleu ni d'indigo en dur, plus de `dark:`. **Signature Discord gardée** :
  le liseré gauche à la couleur que porte l'embed (`embed.color`, une donnée du message) ; les émojis du texte font
  partie du message publié et restent. Pendant le calcul d'une autre manche, l'aperçu précédent reste, estompé.
- Les jetons `--game-warn` / `--game-warn-soft` supposent un ancêtre `.game-ui` : c'est le cas des deux pages qui
  ouvrent la modale.

## Guide « Comment fonctionne un tournoi ? »

Sept fiches, définies une seule fois dans `src/lib/tournament-guide.ts` et rendues par
`src/components/tournaments/TournamentGuide.tsx` :

1. comment les matchs sont capturés (parties personnalisées, dans la fenêtre de dates) ;
2. la règle d'or de l'organisateur (un de ses membres doit être dans la partie) ;
3. les quatre modes ;
4. les escouades mixtes et le partage des points ;
5. la synchronisation PUBG (cliquer après chaque manche ; « 0 manche » = pas encore publiée, recliquer sans risque ;
   qui voit les boutons) ;
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
| `e2e/tournaments.spec.ts` | Liste et détail rendus : cartes de mode, direct, palmarès par mode, recherche et statut, guide, bandeau collant (mobile compris), lecteur, forme, escouades, manches, barème, visiteur, redirections ; charte du détail (2026-10-04) : « en direct » à l'accent sans couleur en dur, `.tournament-place` ≥ 11 px, aucun défilement horizontal, bandeau docké sur une ligne à 375 px, 12 manches (puces paginées, forme bornée), tournoi à venir |
| `e2e/tournament-admin.spec.ts` | Administration (2026-10-04) : liste et archives, recherche et statut, création et modification (corps vérifiés), suppression en modale, synchronisation, diffusion Discord simulée, guide, refus sans droit, aucun défilement horizontal ni select natif |
| `tournament-standings-view.test.ts` | Libellés des participants, rangs, MVP, manches numérotées, trophée des clans, détail par escouade |
| `discord/discord-tournament-embed.test.ts` | Intitulés par mode, note de prorata, format des lignes, limites Discord |
| `discord/discord-tournament-service.test.ts` | Diffusion dans les 4 modes, MVP restreint en scrims internes, webhooks, journalisation |
| `tournament-guide.test.ts` | Couverture des modes par le guide, cohérence avec le moteur, fiches non vides, pièges rappelés, résumé en quatre lignes |
| `tournament-schedule.test.ts` | Heures de Paris (été, hiver), soirée 21 h → 3 h, journée entière conservée, minuit UTC décalé d'1 ms, relecture pour le formulaire, affichage, phase après l'heure de fin ; titre (liens, balises, longueur) |

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
