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
| Héros (toujours sombre, photo) | Nom du site (sans logo, retiré le 2026-09-26), navigation publique (Ligue des clans, Comparateur, Tournois), « Se connecter » (« Mon espace » pour un connecté), « Rejoindre » ; boussole animée ; compteurs « joueurs » et « kills cette semaine » ; kill feed ; titre, accroche et appels à l'action |
| Kill feed (sous le héros, sous 1024 px) | Le même feed, en carte |
| Chicken Dinner | Carrousel des **3 derniers Top 1** du site : « #1 / N équipes », carte, date, durée, clan, kills, dégâts, kill le plus long, équipe (armes, MVP), lien vers le débriefing |
| Rejoindre | Trois étapes, « Demander à rejoindre » (`/join`), puis `/clans` : « Voir les clans » pour un connecté, « Parcourir en visiteur » en mode visiteur, rien sinon |
| Pied de page | `chickendinner.fr · © Arkium`, mention KRAFTON. Remplace le pied de page du layout, masqué sur cette page |

La vitrine est **plein écran pour tous**, connectés compris : pas de menu latéral. Un membre connecté y trouve
« Mon espace » (son tableau de bord `/members/<id>/dashboard`, `/members` sans membre actif) à la place de
« Se connecter ». Un cookie expiré ne donne pas de session : la vitrine s'affiche en visiteur.

Le menu latéral du site porte une entrée **« Accueil »** (`primary.home`, en tête) qui mène à `/`. Après la
connexion, on arrive toujours sur son tableau de bord, pas sur la vitrine.

---

## 2. Décisions (2026-09-26)

| Sujet | Décision |
|---|---|
| Périmètre | **Tout le site**, pas un clan : la maquette parlait « du clan » (24 membres), le site en suit 29. Compteurs et Top 1 tous clans actifs confondus ; « Rejoindre » mène à `/join`, qui sert aussi bien à rejoindre un clan suivi qu'à en proposer un |
| Accès | Mode visiteur actif en production (`DISABLE_AUTH_PERMISSIONS=true`) : les liens de la vitrine (classements, débriefing) fonctionnent sans compte. `/` est ajouté aux chemins publics du proxy : la vitrine reste visible si le mode visiteur est coupé |
| Victimes du kill feed | **Jamais leur pseudo** : le tag de leur clan s'il est connu (« un joueur [ABC] »), sinon « un adversaire » |
| Carrousel | Les **3 Top 1 les plus récents**, quel que soit le score |
| Membres connectés | Voient aussi la vitrine, **en plein écran** (plus de redirection vers `/clans`) ; entrée « Accueil » dans le menu latéral. Page d'arrivée après connexion **inchangée** (tableau de bord) |
| « #1 / 26 équipes » (maquette) | **Gardé**, sans migration : la télémétrie l'enregistre déjà (`numAliveTeams` des instantanés de phase). Vérifié contre l'API PUBG (29 `rosters` = 29). Partie sans télémétrie : « #1 » seul |
| Sous-domaine inconnu | Redirige vers la **vitrine** `/` (au lieu de `/clans`) ; un sous-domaine connu mène toujours à la vue d'ensemble de son clan (`fd.chickendinner.fr` → `/clans/28/overview`) |
| Métadonnées | Titre, description, adresse canonique, aperçu de partage Open Graph et carte large (image du héros, 1024 × 434), adresse de base tirée de `NEXT_PUBLIC_APP_URL` |
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
| `src/app/globals.css` (fin) | Classes `home-*`, animations, masquage de `.app-footer` (`body:has(.home-showcase)`) |
| `src/proxy.ts` | `/` dans `PUBLIC_PATHS` |
| `src/components/ClanNavigation.tsx` | `/` rendu sans le shell, comme `/login` et `/join` ; entrée « Accueil » (`primary.home`) en tête du menu |
| `src/lib/nav-permissions-registry.ts`, `src/components/ui/NavIcon.tsx` | Déclaration de `primary.home` et son icône |
| `scripts/seed-home-nav.ts` | Ligne `NavItem` de `primary.home` (simulation par défaut, `--apply` pour écrire). Sans elle l'entrée s'affiche, mais ne se masque ni ne se renomme depuis `/settings/nav-permissions` |

**Thème.** Le héros, le kill feed et le bandeau « Rejoindre » sont sombres par construction (photo) et gardent leurs
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
| `e2e/home.spec.ts` | Plein écran sans shell ni pied de page commun, pas de défilement horizontal, carrousel dans les deux sens, feed sans nom de victime, liens `/join` `/login` `/clans` `/clans-leaderboard`, compteurs et navigation sur ordinateur, menu sur mobile et tablette, entrée « Accueil » du menu latéral. **Non couvert** : le rendu pour un membre connecté (« Mon espace »), qui exige une session en base |

---

## 6. Questions ouvertes

- **Contenu indexable** : les métadonnées sont servies, mais compteurs et Top 1 arrivent après l'appel d'API (rendu
  client) ; un moteur de recherche voit surtout le héros. À reprendre si le référencement devient un objectif.
- **Image de partage** : celle du héros (1024 × 434) ; une image dédiée 1200 × 630 serait mieux cadrée.
