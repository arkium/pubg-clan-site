# Tests de rendu (Playwright)

> Destiné à l'équipe de développement. Décisions : [docs/TODO/sticky.md §7.C](../TODO/sticky.md).

Vitest tourne en Node et ne rend aucun composant. Le comportement visuel des pages — bandeau collant, période,
captures — est vérifié par Playwright, dans `e2e/`.

## Ce qui est vérifié

| Fichier | Contenu |
|---|---|
| `e2e/sticky-toolbar.spec.ts` | Le bandeau se docke sous le header (±1 px) et couvre la colonne ; pas de saut du contenu à la bascule (±2 px) ; période seule sur mobile docké ; focus clavier jamais recouvert ; long menu parcourable jusqu'au bout depuis le bandeau docké ; ancre amenée sous le bandeau |
| `e2e/period.spec.ts` | `?period=` dans l'URL sans remontée de la page ; mémoire de la visite reprise sur une page ouverte sans paramètre, sans premier appel avec le défaut ; rechargement et retour ; un lien partagé l'emporte sur la mémoire ; défaut de chaque page |
| `e2e/leaderboard.spec.ts` | Classement du clan (refonte UI) : clic sur l'en-tête = tri, second clic = inversion, sans rechargement ; médaille d'or au meilleur même en tri croissant ; colonnes Duo/Trio/Squad seulement en « Tous » ; rappel « Tri : … » dans le bandeau docké sur ordinateur, absent au repos et sur mobile ; 10 lignes puis le reste, total du clan ; puces « Trier par » sur mobile |
| `e2e/clans.spec.ts` | Annuaire des clans ([clans.md](../features/clans.md) §6 bis) : bandeau et totaux, dernier clan consulté et clan du moment, tri par activité puis par nom, recherche par tag, clans en sommeil repliés, ouverture d'un clan ; membre connecté hors mode visiteur : page visible, seul son clan s'ouvre |
| `e2e/overview.spec.ts` | Vue d'ensemble ([clans.md](../features/clans.md) §6) : vitrine et palmarès, image du clan introuvable remplacée par l’image par défaut, briefing (trois liens), chiffres clés avec lien, duo (paire ≥ 5 parties) et lien « Synergies et coopération → » vers « Style de jeu », navigation par intention et indices, blocs déplacés absents |
| `e2e/matches.spec.ts` | Matchs et soirée ([matches.md](../features/matches.md)) : bandeau et indicateurs, carnet et lien vers la soirée, partie de 00:40 rangée dans la soirée de la veille, navigation datée, plan de vol, cartes de fin de partie, thème clair |
| `e2e/debrief.spec.ts` | Débriefing ([debriefing.md](../features/debriefing.md)) : en-tête, onglet dans l'URL (rechargement, clavier), filtres de la chronologie, détail et lien vers le replay, bande des équipes paginée, cartes de joueur, fond clair en thème clair |
| `e2e/home.spec.ts` | Vitrine de l'accueil ([accueil.md](../features/accueil.md)) : plein écran sans shell ni pied de page commun, sans défilement horizontal ; carrousel des Top 1 dans les deux sens ; kill feed sans nom de victime ; liens `/join`, `/login`, `/clans`, `/clans-leaderboard` ; compteurs et navigation sur ordinateur, menu sur mobile et tablette |
| `e2e/armory.spec.ts` | Armurerie du clan ([weapons.md](../features/weapons.md) §7) : « Tout l'arsenal » et loadout par défaut ; chevrons et `?cat=` sans rechargement ; emplacement du loadout → sa catégorie ; lien direct (`?cat=sr` réécrit en `SR`) conservé au changement de période ; redirection HTTP 307 de `…/stats/weapons/categories` ; filtre joueur ; tri par en-tête et pagination numérotée ; podium recalculé sur la catégorie ; puces « Trier par » sur mobile |
| `e2e/tournaments.spec.ts` | Tournois ([tournois.md](../features/tournois.md), « Pages joueurs ») : cartes de mode (légende et filtre), direct avec « Ton clan est 2e », palmarès dont le vainqueur suit le mode, recherche et statut sans émoji, guide en quatre lignes, bandeau docké **aussi sur mobile** (exception) ; tournoi : mode en clair, place du lecteur dans le bandeau, forme, détail par escouade, manches une par une, barème, solo (« Toi », trophée des clans), visiteur, redirections HTTP des anciennes adresses par clan. Données : `e2e/support/tournaments.ts` (dates relatives à l'heure du test) |
| `e2e/stats.spec.ts` | Statistiques ([statistiques.md](../features/statistiques.md)) : « Style de jeu » — une période pour toute la page, synergies et coopération en officielles, profil sans émoji, objets et membres paginés, synergies fusionnées, coopération, ancres et lien vers la carrière, période seule sur mobile docké ; « Carrière PUBG » — pas de filtre de période, fraîcheur et source, totaux et joueurs non resynchronisés, étiquettes des cartes, pas de docking sur mobile ; aucune des deux ne défile horizontalement ; redirection HTTP 307 de `…/stats/items`. Données : `e2e/support/stats.ts` |
| `e2e/members.spec.ts` | Membres et tableau de bord ([membres.md](../features/membres.md)) : « a joué ce soir » sans « en jeu », fiche et lien, réserve repliée, filtres rôle / recherche / tri K/M, demandes en attente, pas de docking sur mobile ; tableau de bord : carte joueur et distinction, période unique pour toutes les routes, chiffres clés, meilleure partie, profil et tendance, cartes et leurs liens, 5 dernières parties, chevrons des puces sur mobile, bandeau docké, aucun défilement horizontal. Données : `e2e/support/members.ts` (dates relatives à l'heure du test) |
| `e2e/visual.spec.ts` | Captures repos / docké / menu ouvert, thèmes clair et sombre |

Profils (`playwright.config.ts`) : Chromium 1 280 px, 768 px et 375 px, et WebKit profil iPhone 13 (approximation
de Safari sur iPhone, pas un iPhone réel). Les tests qui n'ont de sens que sur une largeur sont ignorés ailleurs.

## Sans base de test

- Le serveur local tourne tel que le configure `.env` : **mode visiteur** (`DISABLE_AUTH_PERMISSIONS="true"`) et
  **crons coupés** (`ENABLE_CRON_JOBS="false"` — à vérifier avant tout lancement, `DATABASE_URL` pointe la production).
- **Tous les appels `/api/**` du navigateur sont interceptés** (`e2e/support/api.ts`) : réponses figées du shell
  (session, navigation, liste des clans) et de chaque page (`e2e/support/pages.ts`, données fictives de
  `e2e/support/data.ts`). Un appel sans réponse prévue est **bloqué et fait échouer le test** ; une erreur JavaScript
  de la page aussi. Aucun test ne peut donc écrire en base.
- Seules les lectures du rendu serveur atteignent la base (état d'installation).
- Le test simule un visiteur qui revient (clan sélectionné en `localStorage`) : aujourd'hui, un premier visiteur qui
  ouvre directement une page de clan est renvoyé vers `/clans` par `useSelectedClan` (voir « Points connus »).

## Lancer

```bash
npm run dev                  # facultatif : Playwright le démarre (webServer) ou réutilise celui qui tourne
npm run test:e2e             # toute la suite, 4 profils
npx playwright test --project=chromium-desktop e2e/period.spec.ts   # une partie
npm run test:e2e:update      # régénère les captures de référence après un changement visuel voulu
```

Le serveur de développement compile chaque page à sa première visite : un test peut échouer une fois juste après une
modification du code (fichier JavaScript servi pendant la recompilation). Relancer avant d'enquêter.

## Captures de référence

Stockées dans `e2e/visual.spec.ts-snapshots/`, suffixées par profil et par système (`-win32`). Le rendu des polices
diffère entre Windows et Linux : générer et comparer sur le même système. Si les tests passent un jour en intégration
continue, y générer les captures dans l'image Docker officielle de Playwright. Toujours **regarder** une capture
régénérée avant de la valider.

## Écrire un test

- Déclarer les réponses de la page (`mockXxx(api)` dans `e2e/support/pages.ts`) avant `page.goto`.
- Cliquer dans un bandeau docké avec `clickInPlace(page, locator)` : `locator.click()` fait d'abord défiler jusqu'à la
  position d'origine de l'élément collant, ce qui dédocke le bandeau.
- Avant de naviguer vers une autre page, attendre `networkidle` : WebKit signale comme erreurs les requêtes
  interrompues par une navigation.
- En développement, React double les effets : vérifier les *valeurs* des appels (`api.paramValues`), pas leur nombre.

## Points connus

- **Premier visiteur sur un lien direct de clan** : redirigé vers `/clans` (course entre `setClanId` et la lecture
  asynchrone du mode visiteur dans `src/hooks/useSelectedClan.ts`). Hors du chantier des bandeaux ; à corriger à part.
