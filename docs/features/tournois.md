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
| `playerBreakdown` | Détail par player (barème du mode Solo) : l'onglet en inter-clans, les top scorers et les awards dans **tous** les modes (en scrims internes, les seuls membres du clan organisateur) |
| `clanAverages` | En inter-clans : moyenne par player de chaque clan (onglet « Moyenne par clan ») |
| `leaders` | `killers` (toutes les manches, kills puis dégâts : le premier est le MVP) et `scorers` (ordre du détail par player) |
| `awards` | Fun facts et awards du tournoi, `telemetryRounds` / `rounds` ; `null` si leur calcul a échoué (le classement reste servi) |
| `weapons` | Les 8 armes les plus meurtrières et leurs 3 meilleurs tireurs |
| `clanImages` | Logo des clans du podium (`login_welcome_image_url`, comme la ligue) |

La page montre :

1. **En-tête sur la carte** (celle du tournoi, sinon celle de la dernière manche — `TournamentDetailHeader`) : état,
   mode, format, organisateur, dates, fin ou début, et **le mode en clair** (« Inter-clans : une ligne par clan… ») ;
   manches, participants, heure de la dernière manche. Actions d'organisateur (synchroniser, diffuser, paramètres) pour
   qui peut les exécuter. Au bas de la photo, le bandeau de remerciement aux clans (2026-10-11).
2. **Bandeau collant** : ancres Podium / Classement / Manches / Awards / Armes / Barème (`SectionAnchorNav`) et,
   connecté, la place du lecteur (« Ton clan : 2e · à 6 pts du 1er », `TournamentViewerChip`). Docke aussi sur mobile
   (exception à sticky.md §2). Une section absente (pas de podium, de manche, d'award ou d'arme) perd son ancre. Docké :
   une seule ligne, Awards et Armes partagent l'ancre « Stats », la phrase du lecteur se coupe (« … ») plutôt que de
   passer à la ligne ; docké sur mobile, « Podium » et « Barème » s'effacent aussi (mesuré le 2026-10-11 : 392 px pour
   343 avec « Podium »).
3. **Podium en marches** et **top killers / top scorers** (2026-10-11, voir « Statistiques du tournoi ») : le MVP est le
   premier des top killers.
4. **Classement** : ta ligne surlignée et marquée, barre de points à la couleur du mode, kills, Top 1 et **forme** (place
   à chaque manche, #1 en accent plein, « – » absent). Composition en pastilles pour les équipes libres. En inter-clans,
   « Cumul par clan / Moyenne par clan / Détail par squad / Détail par player ».
5. **Trophée des clans** en solo, rangs par `RankCell`.
6. **Manches une par une** : puces M1…Mn et chevrons, la dernière d'abord ; carte, tampon « Chicken dinner » et
   vainqueur, MVP, lien vers le débrief 2D, scores (ta ligne surlignée).
7. **Awards du tournoi** (fun facts et awards en carrousel) puis **Armes du tournoi**.
8. **Barème** en barres Top 1 → Top 10, puis par kill, bonus Top 1, manches retenues et, en inter-clans, la règle
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
- **Or et accent** : Top 1 du classement en `t-gold`, MVP du tournoi marqué en or en tête des top killers (sa bande
  `.app-panel` teintée or a disparu le 2026-10-11) ; place #1 d'une manche (`.tournament-place--win`) en accent plein. Barème : une seule barre à
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

**Écarts assumés avec la maquette** (règles de la refonte) : rangs par `RankCell` ; puces de manche et ancres en accent, pas en or ; hauteur du
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

### Squads d'une partie personnalisée (tournoi [FR] du 2026-10-10)

Une partie personnalisée range **tout le lobby suivi** sous une seule ligne `SquadMatch`
(`materializeTournamentCustomMatches`). Le moteur la traitait comme une seule squad : prorata calculé sur les 71
joueurs (points à rallonge de décimales) et « détail par escouade » qui mélangeait tous les clans. Désormais
(`src/lib/tournament-service.ts`) :

- **Une équipe PUBG = les joueurs qui ont le même placement** (`splitIntoPubgTeams`) ; sans placement, le joueur reste
  seul. Le prorata se calcule **dans chaque squad**.
- **Inter-clans** : un clan **cumule** les points de ses squads (une manche jouée par clan et par partie).
  `bestOfRounds` retient les meilleures manches du clan.
- **Squad suivie d'une manche à l'autre** (`groupMatchesByMode`) : une équipe rejoint la squad déjà vue avec qui elle
  partage la **majorité** de ses joueurs suivis. Un remplaçant ou un absent ne crée pas de nouvelle ligne ; un joueur
  qui change de squad ne fusionne pas les deux. La squad liste ses joueurs, les plus réguliers d'abord.

### Détail par squad et manches (2026-10-11)

Le mot **« squad »** remplace « escouade » dans tout ce qui touche aux tournois (pages, administration, guide,
Discord) ; le reste du site (débrief d'une partie, notifications) dit toujours « escouade ».

- **Détail par squad** (inter-clans) : même barème, mais chaque squad marque **tous** ses points (pas de prorata).
  Colonnes Squad, Points, Kills, Top 1, puis **une colonne par manche** (M1, M2…) avec la place ; masquées sur mobile
  comme la forme. Joueurs en une ligne qui passe à la ligne, **tag en gras écrit une fois par clan, pseudos en
  graisse normale** (`squadLabelGroups`, `compactSquadLabel` dans `tournament-mode-display.ts`).
- **Manches** (inter-clans) : le tableau de chaque manche liste **les squads** (place, joueurs et clans, kills,
  points), plus les clans aux points partagés. Le cumul par clan d'une manche reste dans le débrief, onglet du
  tournoi. Route : `squadRounds` (`buildRoundViews` en mode `custom_teams`), mêmes clés que `squadBreakdown`.
- **Carte de la manche** : titre, Chicken dinner, MVP et le bouton **« Revoir en replay 2D »** (onglet Replay du
  débrief, `matchTournamentReplayPath`) sont en **haut** de la colonne, le tableau des squads étant plus haut que la
  carte.
- **Débrief** : points d'une manche arrondis à une décimale (`formatTournamentPoints`).
- **Détail par player** (3e onglet, inter-clans) : même barème que le mode Solo — la place de sa squad, ses propres
  kills, le bonus d'un Top 1 —, sans prorata (`buildPlayerBreakdown`). Colonnes Points, Kills, Dégâts, Top 1, puis M1 à
  Mx avec **les kills** du player à chaque manche (`buildPlayerRounds`, « – » s'il n'a pas joué). **Paginé par 20**
  (`Pagination`). Sous chaque en-tête M1…Mx, un sous-titre dit ce que montre la colonne : « place » au détail par
  squad, « kills » au détail par player.
- **Filtre « Clan »** des détails par squad et par player (`TournamentClanFilter`, menu de la charte) : les clans qui
  ont participé (`participantClanIds` et `clans` de la route). Une squad mixte apparaît sous chacun de ses clans ; le
  rang affiché reste celui du **classement complet** (« 18 players sur 75 »). Changer de clan ramène à la page 1.

### Joueurs non suivis (2026-10-11)

Une manche ne retient que les joueurs **suivis** (`ClanMember` actif d'un clan actif). Un joueur que le site ne suit
pas ne marque rien et ses kills manquent à sa squad ; le prorata se calcule sur les seuls joueurs suivis. Au tournoi
[FR] du 2026-10-10, 4 joueurs sur ~77 par manche étaient dans ce cas (11 kills manquants à la squad LTF + OCD). Le
site les **connaissait** pourtant (adversaires croisés : `Player`, `EncounteredPlayer`, avec leur clan PUBG).

- **Liste** : bouton « Joueurs non suivis » sur la carte d'un tournoi (administration). La télémétrie couvre tout le
  lobby (`memberStats`, une entrée par compte PUBG) : `src/lib/tournament-untracked-players.ts` la compare aux joueurs
  suivis, manche par manche, sans les bots (`ai.…`) ni les animaux (`Monster.Bear-…` sur Dihor Otok). Chaque joueur :
  pseudo, clan PUBG, manches, kills, coéquipiers suivis (sa squad) et destination. Une manche sans télémétrie est
  signalée « non vérifiée ».
- **« Ajouter au site »** (`POST /api/clans/[clanId]/tournaments/[tournamentId]/untracked-players`) : mêmes règles
  qu'« Ajouter un joueur » (`POST /api/members`, appelé tel quel). Le **SuperUser** ajoute le joueur au clan qui suit
  son clan PUBG, **inscrit sur le site au besoin** (décision du 2026-10-11) ; un Owner seulement dans son propre clan.
  Puis `materializeTournamentCustomMatches` rattache le joueur aux manches : le classement se recalcule aussitôt. La
  réponse dit combien de manches sont réellement rattachées (aucune si le clan est inactif, en attente de validation).
  L'ajout prend de quelques secondes à une minute (appels PUBG, inscription du clan, rattachement) : la ligne affiche
  « Ajout en cours : … attendez le message final », et la fenêtre ne se ferme pas avant la réponse.
- **Premier usage** (2026-10-11, tournoi [FR]) : gurugun et Bobzore ajoutés à [BF], vOdKaNiCe38 et maladus7 avec leurs
  clans [BAN] et [GFG] inscrits ; les 5 manches sont depuis couvertes à 100 %.
- **En ligne de commande**, lecture seule : `npx tsx scripts/tournament-participant-coverage.ts <id du tournoi>`.

### Statistiques du tournoi (2026-10-11)

Demande faite après le premier tournoi [FR] (2026-10-10), d'après le tableur des organisateurs. Calcul pur dans
`src/lib/tournament-stats.ts` (testé), chargement dans `src/lib/tournament-stats-service.ts`, affichage dans
`src/components/tournaments/TournamentStatsSections.tsx`.

- **Bandeau de remerciement** au bas de l'en-tête (`TournamentDetailHeader`, prop `thanksClans`) : « Merci à tous les
  clans pour leur participation », puis les clans qui ont joué au moins une manche, **par ordre alphabétique** (un merci,
  pas un classement). Fond transparent, Teko en jaune d'accent, défilement continu (`.tournament-ticker`, durée selon la
  longueur du texte), arrêté au survol et figé si le système réduit les animations ; la phrase entière est donnée une
  fois aux lecteurs d'écran. Superposé à la marge basse : la marge haute rend ce que gagne la marge basse, **la hauteur
  de l'en-tête ne change pas**. Absent avant la première manche.
- **Ancre « Podium »** (podium et tops) en tête du bandeau collant ; absente sur mobile docké, faute de place.
- **Podium en marches 2-1-3, comme la ligue** (`PodiumSteps`, partagé avec `/clans-leaderboard`), à la place des trois
  cartes et de la bande MVP : logo du clan (celui du joueur en solo, le premier clan d'une équipe), nom, tag, points sur
  une **plaque de score** biseautée façon habillage esport (`.podium-plate`, au métal de la marche, halo or sur le 1er —
  charte §36), kills et Top 1 en blanc (l'un sous l'autre sur mobile). Variante `emphasis` du composant : la ligue garde
  sa pilule.
- **Top killers / top scorers** sur deux colonnes sous le podium (une seule sur mobile). Killers : toutes les manches,
  kills puis dégâts — la règle du MVP, qui en est le premier (couronne « MVP »). Scorers : le détail par player (place de
  sa squad, ses kills, bonus Top 1). Top 5, puis **la ligne du lecteur** s'il est plus loin (« ⋮ ») ; « Voir les N
  players » déplie tout le classement (décision du 2026-10-11 : « que chacun puisse se trouver »).
- **Onglet « Moyenne par clan »** (inter-clans, après « Cumul par clan ») : somme des points des players du clan au
  détail par player ÷ nombre de players — la formule du tableur. Le cumul avantage les clans venus à plusieurs squads.
  **Tous les clans sont classés**, même à un seul player (décision du 2026-10-11) ; le nombre de players est affiché.
  Formules écartées le 2026-10-11 : par manche jouée, et cumul du clan ÷ players (le placement n'y compte qu'une fois
  par squad et avantage les petits effectifs : au 10/10, OCD 16,7 devant BEE, 1 player, 14,8).
- **Awards du tournoi** (après les manches) : 4 fun facts (kills dont à la tête, manche la plus sanglante, dégâts,
  distance en véhicule) puis 20 awards au plus, sur le modèle des awards d'un clan mais limités au tournoi et à ses
  players (`TOURNAMENT_AWARDS`). Compteurs du résumé PUBG (`SquadMember` : carton en une manche, dégâts, knocks,
  headshots, kill le plus long, réanimations, assistances, survie, distances, boosts, soins, véhicules détruits, kills en
  véhicule, armes ramassées) et télémétrie (`memberStats` : dégâts encaissés, temps hors zone ; `killFeedSamples` :
  premier sang, premier éliminé). Un award sans valeur positive n'apparaît pas ; un award « meilleure manche » ou un
  premier sang unique porte sa manche (« M3 »). Écartés : plus de kills (déjà les top killers), tirs alliés (désignerait
  un joueur d'un autre clan), pointe de vitesse (`maxVehicleSpeedKph` compte l'avion : médiane de 1 067 km/h).
  - **Carrousel** sombre « esport » : 1 carte (mobile), 2 (≥ 640 px), 3 (≥ 1 024 px) ; chevrons, compteur, **glisser à
    la souris ou au doigt** (événements « pointer », 20 % d'une carte pour changer, résistance aux bords ; un geste
    vertical fait défiler la page : `touch-action: pan-y`), **défilement automatique** toutes les 6 s avec barre de
    progression en or, arrêté au survol, au focus, pendant un glissement, par le bouton pause ou si le système réduit
    les animations ; « Tout voir » passe en grille. La piste glisse sous un cadre fixe : aucun défilement horizontal.
    Les cartes hors cadre sont `inert`.
- **Armes du tournoi** : les 8 armes qui ont fait le plus de kills (players du classement, dégâts pour départager) et
  leurs 3 meilleurs tireurs, depuis `memberStats.weapons` de chaque manche (compte PUBG → membre). Variantes regroupées
  par le catalogue (`findWeaponEntry`) ; catégorie « Autre » (véhicules, zone) exclue. Cartes de l'armurerie
  (`.armory-showcase`, silhouette `ArmoryWeaponImage`) ; sur mobile, les 4 premières puis « Voir les 8 armes ».
- **Coût** : une requête `SquadMember` et une `SquadMatchTelemetry` (`memberStats`, `killFeedSamples`, colonnes `*Gz`
  décodées par `decodeTelemetryRow`) par affichage — 189 ms pour les 5 manches du 10/10. Une erreur à cette étape est
  journalisée et la route renvoie le classement sans awards ni armes.

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
| `intra_clan` | Scores de la manche (squads internes) | `N squad(s) classée(s)` |

**Classement final par squad** (inter-clans, 2026-10-11) : la modale propose, sous les manches, « Classement final par
squad » (`GET …/discord?view=squads`, `POST { view: 'squads' }`). Une ligne par squad — joueurs groupés par clan,
points, kills, Top 1 et place à chaque manche — dans la description de l'embed (4 096 caractères ; au-delà, « … et N
autre(s) squad(s) »). Journal `DiscordNotificationLog` : `kind = 'tournament_squads'`, `refId` = identifiant du tournoi ;
une rediffusion est signalée comme pour une manche.

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
| `tournament-mode-display.test.ts` | Unités par mode, repérage du lecteur (clan, joueur, équipe), phrase « Ton clan est 2e… », forme par manche, comptes à rebours, barème et règles, top 5 + ligne du lecteur, format des awards (durées, km, singulier) |
| `next-redirects.test.ts` | Chaque redirection de `next.config.ts` mène à une page existante et ne masque aucune page ; anciennes adresses de tournoi par clan |
| `e2e/tournaments.spec.ts` | Liste et détail rendus : cartes de mode, direct, palmarès par mode, recherche et statut, guide, bandeau collant (mobile compris), lecteur, forme, escouades, manches, barème, visiteur, redirections ; charte du détail (2026-10-04) : « en direct » à l'accent sans couleur en dur, `.tournament-place` ≥ 11 px, aucun défilement horizontal, bandeau docké sur une ligne à 375 px, 12 manches (puces paginées, forme bornée), tournoi à venir ; statistiques (2026-10-11) : podium en marches, top killers / scorers (MVP, ligne du lecteur, liste dépliable), moyenne par clan, awards (fun facts, chevrons, pause, « Tout voir », glisser à la souris et au doigt), armes, ancre « Stats » docké |
| `e2e/tournament-admin.spec.ts` | Administration (2026-10-04) : liste et archives, recherche et statut, création et modification (corps vérifiés), suppression en modale, synchronisation, diffusion Discord simulée, guide, refus sans droit, aucun défilement horizontal ni select natif |
| `tournament-standings-view.test.ts` | Libellés des participants, rangs, MVP, manches numérotées, trophée des clans, détail par escouade, détail par player limité au clan organisateur |
| `tournament-stats.test.ts` | Moyenne par clan (formule du tableur, clan à un player, égalités), top killers (règle du MVP) et scorers, awards (total, meilleure manche, télémétrie absente, premier sang), fun facts, armes (variantes, véhicules exclus, 3 tireurs, 8 armes) |
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

```bash
npx tsx scripts/inspect-tournament-stats.ts <tournamentId>
```

Statistiques telles que la page les reçoit, en lecture seule : moyenne par clan, top killers et scorers, fun facts,
awards (avec la manche du record) et armes, temps de calcul.

## Voir aussi

- [Notifications Discord](discord-notifications.md) — diffusion des résultats de manche
- `docs/TODO/todo.md`, section « Refonte UI/UX des Tournois »
