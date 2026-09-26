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
