# Accueil — vitrine publique de chickendinner.fr

> **Livré le 2026-09-26** — *destiné à l'équipe de développement.*
> Maquette : Claude Design, projet « Accueil chickendinner », écrans 4a à 4d (ordinateur 1440 et mobile 375, clair et
> sombre), composant `AccueilVitrine`.

---

## 1. Ce que fait la page

`/` n'était qu'une redirection (`HomeRedirect`) : vers `/login` sans session, vers `/clans` sinon. C'est désormais la
**vitrine du site**, pour tous, connectés compris :

| Bloc | Contenu |
|---|---|
| Héros (toujours sombre, photo) | Nom du site (sans logo, retiré le 2026-09-26), navigation publique (Les clans, Ligue des clans, Comparateur, Tournois), « Se connecter » (« Mon espace » pour un connecté), « Inscrire mon clan » (vers le bandeau d’inscription) ; boussole animée ; compteurs « joueurs » et « kills cette semaine » ; kill feed ; titre, accroche et appels à l'action |
| Kill feed (sous le héros, sous 1024 px) | Le même feed, en carte |
| Tournois (ajouté le 2026-10-08) | Maquette Claude Design « Accueil - Tournois », trois points d’accès (`HomeTournaments.tsx`) : **pastille** du lien « Tournois » (« En direct » en rouge, sinon le nombre de tournois qui commencent dans les 14 jours, rien sinon), dans la navigation du héros et le menu mobile ; **ticket** en bas à droite du héros dès 1 024 px — le tournoi en direct (manches jouées, 1er, « Suivre », puis « Ensuite : » le prochain) ou le prochain (compte à rebours, « Voir », puis « Puis : » le suivant) —, devenu un **bandeau** juste sous le héros, avant le kill feed, en dessous ; **section** « En ce moment et à venir » (« Prochains tournois » sans direct, « Derniers résultats » s’il ne reste que des résultats) avant les Chicken Dinners : le direct en grand sur la photo de sa carte avec son top 3, le nombre de joueurs dès la première manche (2026-10-10) et « Suivre le classement », les **résultats** d’un tournoi terminé depuis moins de 3 jours (vainqueur en or, classement final, « Voir le classement final »), puis les prochains tournois en **cartes** dès 768 px — un seul sur toute la largeur (photo à gauche, texte à droite), deux ou trois en autant de colonnes, au-delà des pages de trois parcourues par chevrons « ‹ 1 / 2 › » sous les cartes (décision du 2026-10-09) — et en **agenda** en dessous (mêmes pages), rappel « pas d’inscription ». **Section, ticket et pastille sont invisibles** sans direct, sans début dans les 14 jours ni résultats de moins de 3 jours (décision du 2026-10-08, après la première version qui affichait un encart « Aucun tournoi prévu ») |
| Chicken Dinner | Carrousel des **3 derniers Top 1** du site : « #1 / N équipes », carte, date, durée, clan, kills, dégâts, kill le plus long, équipe (armes, MVP), puis le bouton **« Revoir en replay 2D »** (2026-10-10 : bouton sombre bordé d’or, pastille ▶, reflet au survol) qui ouvre directement l’onglet Replay du débrief (`?tab=replay`, lisible sans compte) — le replay est mis en avant plutôt que les statistiques |
| Inscription | « Ton clan joue déjà. Ses stats t’attendent. », rappel « chickendinner.fr ne recrute pas : il suit les clans qui existent déjà dans PUBG », trois étapes (pseudo PUBG, demander l’accès à son clan ou l’inscrire — le compte se crée à l’acceptation —, stats), « Donner mon pseudo PUBG » (`/join`), puis `/clans` : « Voir les clans » pour un connecté, « Parcourir en visiteur » en mode visiteur, rien sinon |
| Pourquoi atterrir ici (ajouté le 2026-09-27) | « Toute la scène PUBG francophone, dans la même zone » : trois cartes — Ligue des clans (`/clans-leaderboard`), Tournois, carte sombre « Zéro inscription » (`/tournaments`), Comparateur (`/clans/comparator`). Mêmes pages que la navigation du héros, mêmes droits d'accès |
| Discord (ajouté le 2026-10-05) | « Winner winner ? Ton Discord le sait déjà » : bandeau sombre sur photo comme « Inscription » (`DiscordSection`, `HomeShowcase.tsx`), trois fonctions vérifiées contre [discord-notifications.md](discord-notifications.md) — alerte Chicken Dinner automatique, résultats de tournoi par manche avec MVP et classement général, réglages (modes, types de partie, rôle mentionné, simple webhook) —, lien « Inscrire mon clan » et rappel « menu Admin › Notifications Discord ». Image `public/discord-chicken-dinner.jpg` (IA) |
| Lecture de zone (ajouté le 2026-10-06) | Sous Discord, même bandeau sombre sur photo (`ZoneReadingSection`, `HomeShowcase.tsx`) : « L'avion donne le premier cercle. Pas la zone finale. », trois points (l'avion place le premier cercle, vise le centre plutôt que la ligne, entraînement sur les parties du clan) et lien « Lire la zone → » vers `/lecture-de-zone` ([lecture-de-zone.md](lecture-de-zone.md)). Textes fixes, tirés de la mesure du 2026-10-06 : la vitrine ne charge pas l'analyse. Image `public/vitrine-lecture-de-zone.jpg` (IA, 1600 × 900) |
| Nouveautés (ajouté le 2026-10-05) | « Fraîchement largué : deux nouveaux outils » : deux grandes cartes sombres sur photo (`NEWS`, `HomeShowcase.tsx`), Mortier (`/mortier`) et Carte des ressources (`/carte-des-ressources`), tampon « NOUVEAU », lien étendu à toute la carte. Images `public/nouveaute-*.jpg` générées par IA (Gemini, signalé dans les mentions légales). Pas dans la navigation du héros : à 1 024 px, six liens ne tiennent pas à côté de « Se connecter » et « Rejoindre ». Une nouveauté qui n'en est plus une sort de `NEWS` |
| Pied de page | Même contenu que le footer du site (`LegalFooterContent`, `src/components/SiteFooter.tsx`) : © Arkium (lien vers arkium.eu), les trois liens légaux, logo texte chickendinner.fr, mention KRAFTON complète ([pages-legales.md](pages-legales.md)) ; seules les marges sont celles de la vitrine. Remplace le pied de page du layout, masqué sur cette page |

La vitrine est **plein écran pour tous**, connectés compris : pas de menu latéral. Un membre connecté y trouve
« Mon espace » (son tableau de bord `/members/<id>/dashboard`, `/members` sans membre actif) à la place de
« Se connecter ». Un cookie expiré ne donne pas de session : la vitrine s'affiche en visiteur.

Le menu latéral du site porte une entrée **« Accueil »** (`primary.home`, en tête) qui mène à `/`. Après la
connexion, on arrive toujours sur son tableau de bord, pas sur la vitrine.

---

## 2. Décisions (2026-09-26)

| Sujet | Décision |
|---|---|
| Périmètre | **Tout le site**, pas un clan : la maquette parlait « du clan » (24 membres), le site en suit 29. Compteurs et Top 1 tous clans actifs confondus ; « Inscrire mon clan » mène au bandeau d’inscription, puis à `/join`, qui sert aussi bien à relier son compte à un clan suivi qu'à inscrire le sien |
| Vocabulaire (2026-10-09) | Le site **ne recrute pas** : il suit les clans qui existent déjà dans PUBG. Retour d’un lecteur : la vitrine ressemblait à l’annonce d’un clan qui cherche des joueurs (« Recrutement ouvert », « Il reste une place dans l’avion », « Rejoindre le squad », « Demander à rejoindre »). On dit désormais **inscrire son clan** et **relier son compte**, jamais « rejoindre le squad », « recrutement » ni « créer un clan » (le site ne fonde pas de clan, il en suit un) ; une phrase le dit en clair sur la vitrine et sur `/join`. Appliqué à la vitrine (menu, héros, bandeau, étapes), à `/join` et ses modales (« Inscrire le clan », « Demander l’accès au clan »), à la connexion, au titre SEO de `/join`, aux messages de `/api/join` (« demande d’accès », « demande d’inscription »), aux e-mails de décision et à la page Confidentialité. Contrôlé par `e2e/home.spec.ts` et `e2e/join.spec.ts`. Les écrans d’administration gardent « demandes d’adhésion » (vocabulaire de l’Owner, sans ambiguïté) |
| Promesses du compte (2026-10-10) | `/login` et `/join` ne promettent que ce que le compte apporte vraiment. Sans compte : statistiques, classements, tournois, débriefings (mode visiteur). Avec un compte de membre : séries enregistrées au mortier et à la lecture de zone, classements du clan, carte des ressources (confirmer, signaler), mouvements entre clans, adversaires rencontrés, « Mon compte » ; l’Owner gère son clan. Retirés : « synchroniser vos statistiques » (automatique, outils réservés au SuperUser), « gérer vos clans » pour tous, « tableaux de bord » (publics), les défis (masqués). Le parcours sans issue (compte uniquement sur invitation, `/join` réservé aux connectés) est remplacé par une demande sans compte : son acceptation envoie le lien de création du compte ([clans.md](clans.md), « Ajout d’un membre — flux auto-inscription »). Vitrine alignée le 2026-10-10 : « de ton clan », jamais « du clan » (le site n’est pas un clan, `e2e/home.spec.ts` le vérifie) ; Discord activé par l’Owner dans Paramètres du clan › Notifications Discord (plus de « menu Admin ») ; tournois « sans inscription » précisés : seules les parties des membres des clans suivis sont comptées |
| Accès | Mode visiteur actif en production (`DISABLE_AUTH_PERMISSIONS=true`) : les liens de la vitrine (classements, débriefing) fonctionnent sans compte. `/` est ajouté aux chemins publics du proxy : la vitrine reste visible si le mode visiteur est coupé |
| Victimes du kill feed | **Jamais leur pseudo** : le tag de leur clan s'il est connu (« un joueur [ABC] »), sinon « un adversaire » |
| Carrousel | Les **3 Top 1 les plus récents**, quel que soit le score |
| Membres connectés | Voient aussi la vitrine, **en plein écran** (plus de redirection vers `/clans`) ; entrée « Accueil » dans le menu latéral. Page d'arrivée après connexion **inchangée** (tableau de bord) |
| « #1 / 26 équipes » (maquette) | **Gardé**, sans migration : la télémétrie l'enregistre déjà (`numAliveTeams` des instantanés de phase). Vérifié contre l'API PUBG (29 `rosters` = 29). Partie sans télémétrie : « #1 » seul |
| Sous-domaine inconnu | Redirige vers la **vitrine** `/` (au lieu de `/clans`) ; un sous-domaine connu mène toujours à la vue d'ensemble de son clan (`fd.chickendinner.fr` → `/clans/28/overview`) |
| Métadonnées | Titre, description, adresse canonique, aperçu de partage Open Graph et carte large (image dédiée `public/chickendinnerfr.jpg`, 1024 × 541, ratio ≈ 1,91:1), adresse de base tirée de `NEXT_PUBLIC_APP_URL` |
| Textes de « Pourquoi atterrir ici » | Vérifiés contre les pages le 2026-09-27 et corrigés par rapport à la maquette : la Ligue classe au **Power score** (win rate — pas les victoires —, dégâts, kills, knocks) sur la semaine, le mois ou depuis le début ; un tournoi compte ses **parties personnalisées** (pas « tes parties comme d'habitude »), sans inscription, avec le barème de l'organisateur ; le comparateur met des **clans** face à face (win rate, top 10, dégâts et kills par partie, duels, hot drops, survie) — pas deux joueurs, et aucune mesure de précision. « Tous les clans francophones » devient « Les clans francophones » : seuls les clans suivis sont classés |
| Tournois de la vitrine (2026-10-08) | **Cartes sur ordinateur et tablette, agenda sur mobile** (écrans 1a et 1f de la maquette, choix de l’utilisateur). « En direct » = la règle de `/tournaments` (`resolveTournamentPhase`) : tout un tournoi actif, de sa date de début à la fin de son dernier jour, pas seulement les soirées où l’on joue. La maquette écrivait « Manche 5 / 18 » : aucun total de manches n’existe en base (un tournoi compte ce qui se joue, `bestOfRounds` ne retient que les meilleures), la vitrine écrit « 5 manches ». Les boutons « Suivre », « Voir » et « Voir le tournoi » et « Voir le classement final » mènent à `/tournaments/<id>`, « Tous les tournois » à `/tournaments`. Fenêtres (choix de l’utilisateur) : annonce **14 jours** avant le début, résultats gardés **3 jours** après la fin, rien sinon. Le reste de la maquette (navigation, compteurs, textes) n’est pas repris |
| « Kill feed en direct » | Ce n'est pas du temps réel : une rotation des kills remarquables des 8 dernières victoires, relue au plus toutes les 5 minutes |

---

## 3. Données — `GET /api/home/showcase`

Route **publique** (aucune session), servie par `src/lib/home-showcase-service.ts`, logique pure dans
`src/lib/home-showcase.ts`.

| Champ | Source |
|---|---|
| `stats.clans` | `Clan` actifs, non système, non archivés |
| `stats.players` | `ClanMember` actifs (`joinStatus = active`) de ces clans |
| `stats.weekKills`, `stats.weekWins` | `SUM(SquadMatch.totalKills)` et Top 1 depuis le lundi 00:00 (semaine ISO, `getPeriodStart('week')`, comme le reste du site) |
| `dinners` | `SquadMatch` `placement = 1` les plus récents ayant au moins un membre d'un clan actif ; clan de l'équipe = le plus représenté parmi ces membres (`pickSquadClan`) |
| Durée | `Match.duration` (par `pubgMatchId`) ; `null` si absente |
| `teamCount` | `SquadMatchTelemetry.phaseSnapshots` (colonne compressée, lue par `decodeTelemetryRow`) : maximum de `numAliveTeams` une fois la partie lancée (`isGame > 0`) — `teamCountFromPhaseSnapshots`. Lu pour les seuls Top 1 affichés |
| Kill le plus long | `MAX(SquadMember.longestKill)`, déjà en mètres |
| Armes d'un joueur | Ses deux armes les plus meurtrières dans la partie, d'après `KillEvent` |
| MVP | Le plus de kills, puis le plus de dégâts ; personne sans kill ni dégât |
| `killFeed` | `KillEvent` des 8 dernières victoires (tueur membre suivi) : poêle +3, ≥ 200 m +2, tête +1 ; 2 lignes au plus par tueur tant que d'autres restent ; une ligne « #1 » toutes les 4 |
| Tag du clan de la victime | Membre suivi : tag de son clan (aucun pour le clan technique) ; sinon `Player.opponentClan.tag` |

**Pièges**

- Les distances de `KillEvent` sont en **centimètres** (`centimetersToMeters`) ; `SquadMember.longestKill` est en mètres.
- Un même frag est enregistré **une fois par clan** suivi présent dans l'équipe : `dedupeKills` le ramène à une ligne.
- La réponse ne contient **aucun identifiant de compte** PUBG (vérifié par le test de contrat).

**Charge.** Mesurée le 2026-09-26 sur la production : ~1 s sans cache (`SquadMatch` 20 000 lignes, `KillEvent`
116 000). La lecture des Top 1 parcourt `SquadMatch` sans index (`placement`, `createdAt`), ~60 ms : aucun index
ajouté. La réponse est gardée **5 minutes** en mémoire du process web, les appels simultanés partagent la même
lecture, une lecture en échec n'est pas gardée.

### Tournois — `GET /api/home/tournaments` (2026-10-08)

Route à part, servie par `src/lib/home-tournaments-service.ts` (logique pure `src/lib/home-tournaments.ts`) à partir de
`listTournamentOverviews`, comme la page `/tournaments`. **Mêmes droits que `/api/tournaments`** (décision du
2026-09-16) : un utilisateur connecté, ou tout le monde en mode visiteur ; sinon 401, et la vitrine ne demande même
pas la route (`useHomeTournaments` n’est activé que pour une session ou en mode visiteur) ni n’affiche de tournoi.

| Champ | Contenu |
|---|---|
| `live` | Tournois en direct, le plus animé d’abord (dernière manche la plus récente) ; trois premiers ayant marqué (`label`, points) — pas le classement complet ; `playerCount` (joueurs suivis des manches comptées, affiché dès la première, aussi dans les résultats). Heures de Paris quand l’organisateur les a précisées : « 10 oct. 21:00 → 11 oct. 03:00 », heure en or dans le pavé de date des cartes ([tournois.md](tournois.md), « Horaires et aperçu de la vitrine ») |
| `upcoming`, `upcomingCount` | Tournois qui commencent dans les **14 jours** (`HOME_UPCOMING_WINDOW_DAYS`), le plus proche d’abord, neuf au plus (`HOME_UPCOMING_LIMIT`, trois pages de trois ; les deux premiers servent aussi à « Ensuite » / « Puis ») ; leur total pour la pastille |
| `results` | Tournois terminés depuis moins de **3 jours** après leur dernier jour (`HOME_RESULTS_WINDOW_DAYS`) et qui ont un vainqueur, le plus récent d’abord ; trois premiers du classement final |

Brouillons jamais montrés. Les participants sont des clans suivis ou leurs membres (`describeParticipant`) : aucun
pseudo de joueur extérieur au site. Réponse gardée **5 minutes** en mémoire, comme la vitrine ; les comptes à rebours
(« dans 5 h », « il y a 22 min ») sont calculés dans le navigateur.

---

## 4. Fichiers

| Fichier | Rôle |
|---|---|
| `src/app/page.tsx` | États d'installation, puis vitrine ; lit la session pour le lien « Mon espace » ; métadonnées (`generateMetadata`) |
| `src/lib/clan-subdomain-host.ts` | Sous-domaine inconnu → vitrine `/` |
| `src/components/home/HomeShowcase.tsx` | La vitrine (client) ; police Teko par `next/font/google` (variable `--font-teko`) |
| `src/hooks/useHomeShowcase.ts` | Lecture de l'API |
| `src/app/api/home/showcase/route.ts` | Route publique |
| `src/lib/home-showcase-service.ts` | Lectures Prisma et cache |
| `src/lib/home-showcase.ts` | Types et logique pure (clan, MVP, armes, feed, formatage) |
| `src/components/home/HomeTournaments.tsx` | Tournois de la vitrine : pastille, ticket du héros, bandeau mobile, section (direct, cartes, agenda, état vide) |
| `src/hooks/useHomeTournaments.ts`, `src/app/api/home/tournaments/route.ts` | Lecture des tournois de la vitrine ; route ouverte comme `/api/tournaments` |
| `src/lib/home-tournaments-service.ts`, `src/lib/home-tournaments.ts` | Cache de 5 minutes ; sélection pure (direct, à venir dans 14 jours, résultats de moins de 3 jours) |
| `src/app/globals.css` (fin) | Classes `home-*`, animations, masquage de `.app-footer` (`body:has(.home-showcase)`) |
| `src/proxy.ts` | `/` dans `PUBLIC_PATHS` |
| `src/components/ClanNavigation.tsx` | `/` rendu sans le shell, comme `/login` et `/join` ; entrée « Accueil » (`primary.home`) en tête du menu |
| `src/lib/nav-permissions-registry.ts`, `src/components/ui/NavIcon.tsx` | Déclaration de `primary.home` et son icône |
| `scripts/seed-home-nav.ts` | Ligne `NavItem` de `primary.home` (simulation par défaut, `--apply` pour écrire). Sans elle l'entrée s'affiche, mais ne se masque ni ne se renomme depuis `/settings/nav-permissions` |

**Thème.** Le héros, le kill feed et le bandeau « Inscription » sont sombres par construction (photo) et gardent leurs
couleurs dans les deux thèmes. Le reste passe par les jetons (`--page-surface`, `--theme-ui-*`, `.app-panel`,
`.app-panel-muted`) ; l'or des sur-titres est `--home-gold` (ambre 700 en clair, ambre 400 en sombre).

**Mouvement.** Zoom lent du héros, boussole, entrée des lignes du feed et halo du bouton sont coupés sous
`prefers-reduced-motion: reduce`, et le feed cesse alors de tourner.

---

## 5. Tests

| Fichier | Contenu |
|---|---|
| `src/lib/home-showcase.test.ts` | Formatage (cm → m, durée, fond de carte), clan de l'équipe, MVP, armes, note des kills (poêle ≠ Panzerfaust), dédoublonnage, ordre et plafond du feed, victimes jamais nommées |
| `src/lib/home-showcase-route-contracts.test.ts` | Route sans session : compteurs, Top 1 (équipe mixte, clan technique écarté), durée, lien de débriefing, tags des victimes, aucun `account.` dans la réponse, 500 en erreur ; cache (une lecture par période, appels simultanés, échec non gardé) |
| `src/lib/home-tournaments.test.ts` | Sélection (brouillons écartés, direct le plus animé d’abord, à venir dans la fenêtre de 14 jours seulement, triés et plafonnés, top 3 ayant marqué, résultats gardés 3 jours après le dernier jour, rien à montrer sinon), libellé des manches, droits de la route (401 sans session hors mode visiteur), cache |
| `e2e/home.spec.ts` | Plein écran sans shell ni pied de page commun, pas de défilement horizontal, carrousel dans les deux sens, feed sans nom de victime, liens `/join` `/login` `/clans` `/clans-leaderboard`, liens légaux du pied de page, compteurs et navigation sur ordinateur, menu sur mobile et tablette, entrée « Accueil » du menu latéral ; vocabulaire (2026-10-09) : aucun texte de recrutement, « Inscrire mon clan » mène au bandeau d’inscription et à son rappel « ne recrute pas » ; tournois (2026-10-08) : pastille « En direct » ou nombre de tournois à venir, ticket sur ordinateur et bandeau sous 1 024 px, direct et top 3, cartes dès 768 px (une en largeur, deux ou trois colonnes, chevrons au-delà) et agenda en dessous, section avant les Chicken Dinners, états « rien en cours », « résultats seuls » et « rien à montrer » (section, ticket et pastille absents). **Non couvert** : le rendu pour un membre connecté (« Mon espace »), qui exige une session en base |
| `e2e/join.spec.ts` | `/join` (2026-10-10) : titres « demander l’accès à son clan ou l’inscrire », « pas besoin de compte », rappel « ne recrute pas », aucun texte de recrutement ni de défis, pas de défilement horizontal ; visiteur sans compte, clan déjà suivi : modale « Demander l’accès au clan », adresse exigée, demande envoyée avec elle et message « vous recevrez … le lien pour créer votre compte » ; clan pas encore suivi : modale « Inscrire le clan ». Réponses de `POST /api/join` figées : rien n’est enregistré |

---

## 6. Questions ouvertes

- **Contenu indexable** : les métadonnées sont servies, mais compteurs et Top 1 arrivent après l'appel d'API (rendu
  client) ; un moteur de recherche voit surtout le héros. À reprendre si le référencement devient un objectif.
