# GEO & SEO — vérification du contrôle et plan d'amélioration

Contrôle reçu : [geo-seo.md](geo-seo.md) (10 pages analysées). Vérifié le **2026-10-18** contre la production
(`https://chickendinner.fr`, en-têtes et HTML servis) et le code (`main`, `a4e3d8d`). Règles SEO en place :
[docs/features/seo.md](../features/seo.md).

---

## 0. Search Console : 3 pages indexées sur 442 — priorité absolue

État au 2026-10-12 (captures du 2026-10-18) : **442 pages connues**, exactement les adresses du sitemap. **3 dans
l'index**, **438 « Détectée, actuellement non indexée »** (première détection le 2026-10-13), 1 page pour un second
motif (à relever).

**Ce que veut dire « Détectée, actuellement non indexée ».** Google connaît l'adresse (par le sitemap) mais **ne l'a
pas encore explorée** : il a reporté l'exploration. C'est courant pour un domaine neuf, sans liens entrants, qui
annonce d'un coup 442 adresses dont 97 % se ressemblent. Le sitemap a moins d'une semaine : rien d'anormal à ce
stade. Ne pas cliquer sur *Valider la correction* maintenant : ce motif n'a rien à corriger en soi.

**Le vrai risque arrive avec l'exploration, et le rapport d'audit ne l'a pas vu : `robots.txt` interdit `/api/`.**
Google exécute le JavaScript, mais son moteur de rendu respecte `robots.txt` pour chaque ressource, appels `fetch`
compris. **Rendu simulé le 2026-10-18** (Chromium sans interface sur la production, requêtes interdites par
`robots.txt` bloquées, comme le fait Google) :

| Page | Comme Google aujourd'hui | Avec la règle proposée (point 1) |
|---|---|---|
| `/clans` | page blanche : 0 mot, ni H1 ni lien | H1 « Les clans », 1 647 mots, `<main>`, 13 liens internes |
| `/tournaments` | page blanche | H1 « Tournois », « 1 terminé », palmarès |
| `/clans-leaderboard` | page blanche | H1, 27 clans classés, 216 mots, 20 liens |
| `/lecture-de-zone` | page blanche | H1, « Calculé sur 11 161 parties depuis le 29 mai 2026 », 433 mots |

**Mécanisme.** `/api/auth/mode` est bloqué, et `useAuthSession` se rabat alors sur « authentification active »
(`.catch(() => false)`). Le shell **redirige vers `/login`** (`ClanNavigation.tsx:558`), adresse elle-même interdite
par `robots.txt` : la page finit blanche. Pour Google, chaque page de données redirige donc en JavaScript vers une
page interdite. Les pages ne seraient pas seulement jugées pauvres : elles seraient vues comme des redirections vers
`/login`. Il faut corriger **avant** que Google vienne.

Le test en direct de la Search Console a renvoyé « Un problème est survenu » (erreur du service, à retenter plus
tard) : la simulation en tient lieu.

**Ce qui accélère l'exploration** : des liens internes dans le HTML initial (lot 1, Google les lit dès la première
passe, sans attendre le rendu), un sitemap resserré (point 3 ci-dessous), des liens entrants (lot 4.6) et les
demandes d'indexation pour les adresses clés (quota de quelques-unes par jour).

**Vérifier (5 minutes)** : *Inspection de l'URL* → `https://chickendinner.fr/clans` → *Tester l'URL en ligne* →
*Afficher la page testée*. La capture doit montrer « Vérification de la session… », et *Plus d'infos → Ressources de
la page* doit lister les `/api/…` comme **« Bloquée par le fichier robots.txt »**.

**Corriger — lot 0.0, à faire avant tout le reste.** Points 1 à 3 **réalisés le 2026-10-18** (`robotsRules` et
`sitemap` de `CLAN_PAGES` dans `page-seo.ts`, `headers()` de `next.config.ts`, tests dans `page-seo.test.ts`),
vérifiés sur le serveur de dev ; **en attente de déploiement**, puis point 4.

1. `robotsRules` (`src/lib/seo/page-seo.ts`) : remplacer `Disallow: /api/` par **`/api/internal/` et `/api/cron/`
   seulement**, les deux préfixes qu'aucune page n'appelle. Le shell d'une page publique appelle `/api/auth/mode`,
   `/api/auth/session`, `/api/setup/status`, `/api/settings/nav-permissions` et `/api/settings/login-welcome` : ni
   `/api/auth/`, ni `/api/setup`, ni `/api/settings/` ne peuvent être interdits. Les API qui exigent une session
   répondent 401 de toute façon. Règle validée par la simulation ci-dessus.
2. En-tête `X-Robots-Tag: noindex` sur toutes les réponses `/api/:path*` (`next.config.ts` → `headers()`), pour
   qu'aucune réponse JSON n'entre dans l'index.
3. **Alléger le sitemap tant que le lot 2 n'est pas fait** : 429 des 442 adresses (97 %) sont des pages de clan bâties
   sur 13 gabarits. Pour un domaine neuf, sans autorité, Google n'en explore qu'un échantillon et juge la qualité du
   site sur cet échantillon. Annoncer d'abord environ 47 adresses : les 12 pages publiques, la vue d'ensemble des 33
   clans et les tournois. Les autres pages de clan restent indexables et accessibles par les liens, puis rejoignent
   le sitemap à mesure qu'elles gagnent du contenu rendu côté serveur.
4. Après le déploiement : nouveau test en ligne sur `/clans` (la capture doit montrer l'annuaire), puis demander
   l'indexation des adresses clés, quelques-unes par jour : Ligue, annuaire, lecture de zone, tournois, mortier.
   Google relit `robots.txt` sous 24 h. Revoir le rapport *Pages* deux à trois semaines plus tard : le nombre de
   pages « Détectée » doit baisser, sans qu'elles passent à « Explorée, actuellement non indexée ».

Ce correctif ne sert qu'à Google et à Bing, qui exécutent le JavaScript. Pour les robots d'IA, seul le lot 2 (contenu
dans le HTML initial) change les choses.

**Bing** : dans Bing Webmaster Tools, *Importer depuis Google Search Console* reprend la propriété vérifiée et le
sitemap, sans nouvelle vérification DNS.

---

## 1. En bref

- **Le plus urgent n'est pas dans le rapport** : Google n'a pas encore exploré 438 des 442 pages, et quand il le
  fera, `robots.txt` l'empêchera de charger leurs données (§0).
- **Le rapport est juste sur les symptômes.** Presque tous les constats se vérifient, et les mesures (longueur des
  titres, nombre de mots, images, en-têtes) sont exactes au caractère près.
- **Une seule cause explique environ 70 % des constats GEO et « sémantique »** : le HTML envoyé au robot contient les
  états de chargement des pages, pas leur contenu. Les pages sont des composants client qui chargent leurs données
  après coup. Or les robots des moteurs génératifs (GPTBot, ClaudeBot, PerplexityBot, CCBot) **n'exécutent pas le
  JavaScript** : ils voient exactement ce que l'outil d'audit a vu — « Vérification de la session… », « 0 terminé ».
- **Le score Sécurité (57, identique sur toutes les pages)** tient à quelques en-têtes HTTP absents. Une correction
  côté serveur suffit.
- **Quelques constats sont faux ou trompeurs.** La page « À propos » existe, les images ont un `alt=""` conforme
  pour des images décoratives, et le rapport cite deux métriques invraisemblables ou retirées (TTFB 2 ms, FID).
- **Le rapport a aussi manqué des points**, dont un doublon `www`, des pages tournoi vides et un guide du mortier
  impossible à indexer (§4).

---

## 2. Ce que lit un robot qui n'exécute pas le JavaScript

Mesuré sur le HTML de production, sans exécuter le JavaScript, le 2026-10-18 :

| Page | H1 | Mots | Ce que le robot lit |
|---|---|---|---|
| `/` | « Winner winner, chicken dinner. » | 713 | accroche et sections ; « Chargement… » pour le kill feed et les Top 1 ; la boussole `N 15 30 NE 60…` deux fois |
| `/clans` | **aucun** | 42 | « Vérification de la session… » puis le pied de page |
| `/clans-leaderboard` | « Ligue Inter-Clans » | 70 | libellés des filtres, **aucun clan** |
| `/clans/comparator` | « Comparateur de clans » | 118 | sélecteurs vides |
| `/tournaments` | « Tournois » | 53 | « 0 en direct · 0 à venir · 0 terminé » — **faux** : un tournoi est terminé (13 clans, 81 joueurs, 5 manches) |
| `/tournaments/[id]` | **aucun** | 38 | le pied de page seul (page indexée et présente dans le sitemap) |
| `/mortier` | « Mortier » | 91 | commandes de l'exercice ; le guide (338 mots, 4 H2) n'existe qu'à `?tab=guide`, dont la canonique est `/mortier` |
| `/carte-des-ressources` | « Carte des ressources » | 59 | une phrase, une carte sans texte alternatif |
| `/lecture-de-zone` | « Lecture de zone » | 75 | une phrase et un avertissement, **aucun chiffre** |
| `/join`, `/a-propos`, pages légales | oui | 220 à 750 | du vrai contenu |

Par ailleurs, **aucune page intérieure n'a de `<main>`, de `<header>` ni de menu** dans ce HTML. Le shell (menu latéral, `<main>`)
n'apparaît qu'après deux appels du navigateur (`/api/auth/mode`, `/api/auth/session`) — voir lot 1. Sur `/clans`, par
exemple, le robot ne trouve que quatre liens internes : `/`, `/mentions-legales`, `/confidentialite`, `/a-propos`.

---

## 3. Vérification du rapport, constat par constat

✔ confirmé · ◐ en partie · ✘ faux

| Constat du rapport | Verdict | Ce que montre la vérification |
|---|---|---|
| Synthèse « compréhension LLM » (communautaire, non officiel, Arkium, API officielle, gratuit) | ✔ | Conforme aux pages légales et à `/a-propos` |
| « Lecture de zone basée sur des milliers de parties » | ✔ | Vrai : 25 047 parties en escouade, dont 11 131 sur Erangel, depuis le 2026-05-29 (`/api/zone-reading`). **Mais aucun chiffre n'apparaît dans le HTML** |
| Critique — annuaire `/clans` vide | ✔ | La page attend `useAuthSession` avant tout rendu (`src/app/clans/page.tsx:140`), alors que la production est en mode visiteur (`/api/auth/mode` → `authDisabled: true`) |
| Critique — tournois sans contenu | ✔ | Pire que décrit : l'état initial `[]` rend « 0 terminé » alors qu'un tournoi est terminé. Un robot lit un **chiffre faux** |
| Critique — pas de H1 sur `/clans` | ✔ | Même cause que l'annuaire vide |
| Pollution par l'interface (`N 15 30 NE…`) | ✔ | La boussole de l'accueil (`HomeShowcase.tsx`, `COMPASS`) porte `aria-hidden`, mais son texte reste dans le DOM : les robots ne tiennent pas compte d'`aria-hidden` |
| Pages outils sous-documentées | ◐ | Le guide du mortier existe (4 sections), mais il n'est pas indexable. La lecture de zone calcule des textes riches (`bandHeadline`, `closingVerdict`, `practicalRule`), mais ils arrivent après le chargement |
| Images sans `alt` (3 sur 4) | ◐ | Les trois ont `alt=""`, la bonne pratique pour une image décorative (fond de l'accueil, fond de `/join`). Seule la carte de `/carte-des-ressources`, qui est du contenu, mérite un texte. Le rapport n'a pas vu les deux images du guide du mortier |
| HSTS manquant (×10) | ✔ | `curl -I` : aucun `Strict-Transport-Security`. **Un seul correctif** pour les dix lignes du rapport |
| Contenu trop court (×6) | ✔ | Symptôme de la cause racine. Le seuil de 300 mots n'est pas un critère de Google |
| Pas de données structurées (×9) | ✔ | Seul l'accueil en a (`WebSite` + `Organization`). La recommandation « Organization, WebSite partout » est générique : voir lot 3 |
| Pas de page À propos ni d'équipe | ◐ | `/a-propos` existe depuis le 2026-10-05 (sitemap, pied de page), mais le rapport ne l'a pas analysée. En revanche, il est vrai qu'elle ne présente **personne** |
| Titres trop longs (61, 64, 74, 71, 62 caractères) | ✔ | Mesures exactes. Cause : le suffixe « · chickendinner.fr » (19 caractères) ; la règle maison ne compte que les « caractères utiles », hors suffixe |
| Meta description de l'accueil (213 caractères) | ✔ | Elle **viole aussi la règle maison** (≤ 170, `docs/features/seo.md` §1) |
| Meta descriptions courtes (pages légales, 106 et 111) | ✔ | Mesures exactes, enjeu faible |
| Ratio texte/HTML faible (×10) | ✔ | Ce n'est pas un facteur de classement, seulement un symptôme de la cause racine |
| CSP manquante (×10) | ✔ | Confirmé |
| *Reduce unused JavaScript* (26 Kio) | ✔ | Plausible (270 Ko de JS décompressé sur l'accueil), gain marginal |
| LCP 14,3 s | ◐ | Mesure de laboratoire (mobile bridé), non reproduite ici. Plausible, à re-mesurer (lot 5) |
| TTFB 2 ms | ✘ | Irréaliste : on mesure 65 à 120 ms pour le HTML complet |
| FID 103 ms | ✘ | Métrique retirée des Core Web Vitals le 2024-03-12 et remplacée par INP |

### Incohérences internes du rapport

- « E-E-A-T » apparaît deux fois ; « Chunkability » n'a pas de note.
- **Citabilité 100/100** alors que les « phrases quotables » sont des slogans (« Règle ton mortier. Pas ton squad. »)
  et que les données uniques citées n'apparaissent pas dans le HTML. Note surestimée.
- **Échantillon partiel** : 10 pages sur les 442 adresses du sitemap. Aucune page de clan, aucune page de tournoi,
  ni `/a-propos`, ni `/clans/comparator`. D'où le faux constat « pas de page À propos ».
- Les **29 « importants » ne sont que 6 problèmes distincts** (HSTS ×10, données structurées ×9, contenu court ×6,
  alt ×2, pollution, outils) ; les **32 « mineurs » n'en sont que 9**.
- La recommandation pour `/clans` (« des exemples même lorsque la session se charge ») traite le symptôme. Le vrai
  correctif : ne pas attendre la session pour une lecture publique.

---

## 4. Ce que le rapport n'a pas vu

| # | Constat | Preuve | Gravité |
|---|---|---|---|
| A | **`www.chickendinner.fr` sert tout le site en 200** au lieu de rediriger | `curl -I https://www.chickendinner.fr/clans` → 200. La canonique limite les dégâts, mais l'exploration est dédoublée et les liens entrants sont divisés | Importante |
| B | **Pages de tournoi vides** : ni H1, ni contenu dans le HTML | `/tournaments/cmuyds90z00gw04ao5mauo8ww` : 38 mots, uniquement le pied de page | Importante |
| C | **Le guide du mortier n'est jamais indexé** | Il n'existe qu'à `/mortier?tab=guide`, dont la canonique (`/mortier`) retire la requête | Importante |
| D | **Pas de `<main>` ni de menu dans le HTML** des pages intérieures | `ClanNavigation` démarre avec `authDisabled: false` (état initial du hook) et rend alors un simple `<div>` (`ClanNavigation.tsx:949`) ; le layout savait pourtant déjà, côté serveur, que le shell s'affiche | Importante |
| E | **Noms et ton incohérents** | H1 « Ligue Inter-Clans » face au titre et au menu « Ligue des clans ». Sur `/join`, la description tutoie (« Donne ton pseudo ») mais la page vouvoie (« Votre clan », « Demandez l'accès »), alors que tout le reste du site tutoie | Moyenne (note *Cohérence* : 50) |
| F | **Versions exposées** | `X-Powered-By: Next.js`, `Server: nginx/1.24.0 (Ubuntu)` | Faible |
| G | **Certificat invalide sur les sous-domaines de clan** | `https://smk.chickendinner.fr` → `SEC_E_WRONG_PRINCIPAL` (certificat wildcard pas encore posé) | Bloque `includeSubDomains` dans HSTS |
| H | **API de la vitrine lente à froid** | `/api/home/showcase` : 1,9 s sans cache, 30 ms ensuite | Moyenne (LCP) |
| I | **Les mêmes chiffres diffèrent d'une page à l'autre** | Le 2026-10-18 : l'accueil annonce 33 clans suivis et 510 joueurs, l'annuaire 34 clans et 558 joueurs. Définitions sans doute différentes (clan système, clans archivés, période), mais un moteur génératif qui lit les deux pages voit deux faits contradictoires | Moyenne (note *Cohérence*) — aligner les définitions ou nommer chaque chiffre précisément |
| J | **Bing est absent du plan** | `docs/features/seo.md` ne prévoit que la Search Console. Or ChatGPT Search et Copilot s'appuient sur l'index de Bing | Importante pour le GEO |


---

## 5. Propositions

Classées par rapport effet / effort. Chaque lot se déploie seul et porte ses tests (Vitest dans `src/lib/`,
Playwright avec réponses figées) : le site est en production.

### Lot 0 — serveur et métadonnées (quelques heures, effet immédiat)

**0.1 En-têtes de sécurité** (score Sécurité, constats HSTS ×10 et CSP ×10)

À poser dans `next.config.ts` → `headers()`, plutôt que dans nginx : c'est versionné et testable.

```text
Strict-Transport-Security: max-age=31536000          ← SANS includeSubDomains ni preload tant que
                                                        le certificat wildcard n'est pas en place (§4 G)
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-Frame-Options: SAMEORIGIN                          (ou frame-ancestors 'self' dans la CSP)
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

Plus `poweredByHeader: false` dans `next.config.ts`, et `server_tokens off;` dans nginx.

**0.2 CSP en deux temps.** D'abord `Content-Security-Policy-Report-Only` pendant une à deux semaines, puis
appliquée. Next.js injecte des scripts inline : il faut une CSP à *nonce*, générée dans `src/proxy.ts`. Ce n'est pas
plus coûteux ici, puisque le layout est déjà `force-dynamic`. Lire le guide CSP de `node_modules/next/dist/docs/`
avant d'écrire le code (Next 16). À recenser : Google Fonts (servies en local par `next/font`), images
Discord/PUBG, `/_next/image`.

**0.3 Redirection `www` → apex** (§4 A) : bloc nginx `server_name www.chickendinner.fr` → `return 301
https://chickendinner.fr$request_uri;`. Vérifier que le certificat couvre toujours `www`.

**0.4 Titres ≤ 60 caractères suffixe compris** (5 constats). Propositions, longueur comptée :

| Page | Actuel | Proposé | Long. |
|---|---|---|---|
| `/` | chickendinner.fr — stats, classements et Top 1 des clans PUBG | chickendinner.fr — stats et classements des clans PUBG | 54 |
| `/clans-leaderboard` | Ligue des clans PUBG — classement Power score · … | Ligue des clans PUBG — Power score · chickendinner.fr | 53 |
| `/carte-des-ressources` | Carte des ressources PUBG — véhicules, essence, garages · … | Carte des véhicules et ressources PUBG · chickendinner.fr | 57 |
| `/lecture-de-zone` | Lecture de zone PUBG — avion, cercles et zone finale · … | Lecture de zone PUBG — avion et cercles · chickendinner.fr | 58 |
| `/join` | Inscrire son clan PUBG ou relier son compte · … | Inscrire son clan PUBG, relier son compte · chickendinner.fr | 60 |

Changer la règle de `docs/features/seo.md` : **titre complet ≤ 60, description de 110 à 160**, et ajouter un test
dans `page-seo.test.ts` qui parcourt `STATIC_PAGES` et `CLAN_PAGES` (avec un nom de clan long). Pour les pages de clan
(« Nom [TAG] — Cartographie tactique · chickendinner.fr »), ne garder le suffixe que s'il tient : le nom du site
s'affiche déjà à part dans Google grâce au `WebSite` en JSON-LD.

**0.5 Descriptions.** Accueil (160) : « Le QG des clans PUBG francophones : parties importées automatiquement, Ligue
des clans, comparateur, tournois, mortier, carte des ressources et lecture de zone. » Pages légales : de 106-111 à
environ 150 (propositions à 159 et 148 disponibles). Les descriptions de clan restent sous 160 avec un nom long : à
tester.

**0.6 Texte alternatif.** Carte de `/carte-des-ressources` : `alt` construit d'après la carte affichée (« Carte
d'Erangel : véhicules observés et points utiles »). Images du guide du mortier : décrire ce qu'elles montrent. Fonds
de l'accueil et de `/join` : garder `alt=""`, ils sont décoratifs.

**0.7 Un seul nom, un seul ton** (§4 E). H1 de la Ligue : « Ligue des clans » (« Inter-Clans » peut rester en
sous-titre). Passer `/join` au tutoiement. Écrire partout « Power score » et « PUBG: BATTLEGROUNDS » à la première
mention.

**0.8 Ne jamais afficher un faux zéro.** Les compteurs de `/tournaments` affichent « — » tant que la liste n'est pas
chargée, comme les compteurs de l'accueil. À ajouter à la checklist « nouvelle page » de `CLAUDE.md`.

### Lot 1 — le shell rendu côté serveur (petit changement, effet sur toutes les pages)

**Réalisé le 2026-10-18.** Le layout transmet `ShellBootstrap` (mode visiteur, session, installation, thème) ;
`useAuthSession` en part pour le mode visiteur, et un échec de `/api/auth/mode` retombe sur la valeur du serveur. La
session reste « en chargement » jusqu'à `/api/auth/session` : une première version qui la déclarait absente d'emblée
renvoyait vers `/login` les pages d'administration des tests Playwright (session simulée dans le navigateur seulement).
`/clans` n'attend plus la session en mode visiteur. Le thème passe par un
cookie (`pubg_app_theme`, déclaré sur `/confidentialite`), le stockage du navigateur par `useSyncExternalStore`. Faux
zéros retirés de `/clans` et `/tournaments` (point 0.8). Vérifié sur le serveur de dev : `<main>`, H1 et 14 liens
internes dans le HTML de `/clans`, `/tournaments`, `/clans-leaderboard`, `/lecture-de-zone`, `/mortier` ; aucune erreur
d'hydratation sur 28 chargements (premier visiteur, thème clair avant le cookie, cookie posé, clan et joueur gardés).

Problème §4 D. Le layout racine calcule déjà côté serveur `session` et `isAuthDisabled()`. Il suffit de les
transmettre à `ClanNavigation` (ou de les fournir à `useAuthSession` comme état initial, par un contexte posé dans
le layout) pour que le **premier rendu** soit le bon :

- `<main>`, `<header>` et le menu latéral présents dans le HTML : tous les liens internes deviennent visibles sans
  JavaScript, et le contenu principal est isolé (constat « pollution »).
- La page `/clans` et ses semblables n'affichent plus « Vérification de la session… » en mode visiteur.
- Moins de décalages de mise en page à l'hydratation (CLS, et probablement LCP sur les pages intérieures).

- Le rendu ne dépend plus de `/api/auth/mode` : aujourd'hui, si cet appel échoue (robot qui le bloque, coupure
  réseau), un visiteur est **renvoyé vers `/login`** alors que la lecture est publique (§0, « Mécanisme »).

Risques : erreur d'hydratation si l'état initial diffère de celui que calcule le hook (même source, donc cohérent),
et tests Playwright qui simulent la session dans le navigateur (`e2e/support/api.ts`) — les relancer tous.
L'accueil, `/join` et les pages d'authentification gardent leur rendu plein écran.

### Lot 2 — le contenu dans le HTML initial, page par page (le gros levier GEO)

**Principe.** Chaque page publique devient un `page.tsx` **serveur** qui rend :

1. un bloc éditorial statique : ce que montre la page, la méthode, deux à quatre questions et réponses ;
2. un instantané des données, lu par les mêmes services `src/lib/` que l'API et passé au composant client en
   `initialData` (il prend ensuite le relais, filtres compris).

**Avancement.**

- `/lecture-de-zone` — **fait le 2026-10-18** : bloc serveur « En bref » (`ZoneReadingFindings`) sous l'analyse,
  diffusé dans un `Suspense`. 99 → 367 mots dans le HTML, H2 « En bref : ce que disent 11 274 parties sur Erangel »,
  quatre constats chiffrés et datés, méthode, parties par carte. Écart au principe : pas d'`initialData`, la réponse
  de l'API pèse 240 Ko (une entrée par partie pour tourner l'axe) et aurait alourdi d'autant le HTML.
- `/clans-leaderboard` — **fait le 2026-10-18** : bloc serveur « En bref » (`LeagueFindings`) en bas de page. 85 → 264
  mots, H2, podium de la semaine lié aux clans, clans classés / en qualification / sans partie, formule du Power score
  avec les réglages en vigueur. Même choix d'un bloc serveur plutôt que d'un `initialData`, pour un seul modèle sur
  toutes les pages.
- `/tournaments` — **fait le 2026-10-18** : ici l'`initialData` s'impose (1,2 Ko) — les vraies cartes et le palmarès
  sont rendus par le serveur, sans bloc en double. « 1 terminé » au lieu de « 0 terminé », 53 → 207 mots ;
  « Comment ça marche ? » toujours dans le HTML (replié par `hidden`).
- `/tournaments/[id]` — **fait le 2026-10-18** : résumé serveur à la place du chargement (H1, dates, organisateur,
  affluence, vainqueur, podium), 38 → 161 mots. Pseudos jamais écrits : podium nommé en inter-clans seulement.
- `/clans` — **fait le 2026-10-18** : bloc serveur « En bref » en fin de page (totaux, trois plus actifs sur 7 jours,
  styles de jeu, inscription), 42 → 280 mots, et surtout **34 liens vers les vues d'ensemble des clans** : les cartes
  de l'annuaire s'ouvrent par un bouton, la page n'offrait aucun lien explorable vers les clans. La logique de
  `GET /api/clans` est partagée (`listClansWithQuickStats`) : mêmes totaux que le bandeau.
- `/mortier/guide` — **fait le 2026-10-18** : le guide a sa propre adresse, indexée et dans le sitemap (« Guide du
  mortier PUBG à la grille », H1 « Guide du mortier », 4 sections, 364 mots), au lieu de `/mortier?tab=guide` dont la
  canonique était `/mortier`. Onglet lu dans le chemin, changement par `replaceState` : la série en cours est gardée.
  L'ancien `?tab=guide` redirige.
- Reste : `/carte-des-ressources`, l'accueil (vitrine) et les pages de clan.

Le composant client actuel ne change presque pas. Le filtre de période rechargé côté client garde son comportement
(résultats précédents estompés).

**Règles d'écriture pour être cité par un moteur génératif :**

- Un H2 par question, rédigé comme on la pose (« Comment est calculé le Power score ? »), avec la réponse dès la
  première phrase, puis le détail.
- Des chiffres avec leur périmètre et leur date : « sur 11 131 parties en escouade sur Erangel, du 29 mai au 18
  octobre 2026 ». Des chiffres **calculés à la volée**, jamais écrits en dur.
- Des entités nommées toujours de la même façon (chickendinner.fr, Ligue des clans, Power score).
- Une date de mise à jour visible, dans un `<time datetime>`.
- Les règles d'UI s'appliquent : hauteur des bandeaux inchangée, blocs en `.app-panel-muted` sous l'outil, `<details>`
  autorisé (son contenu reste dans le DOM).

**Par page, dans l'ordre de valeur :**

| Page | Bloc éditorial | Instantané de données |
|---|---|---|
| `/lecture-de-zone` | Méthode (bande de 200 m, comparaison au hasard), limites (« des probabilités, pas des certitudes ») | Les trois verdicts déjà calculés, avec leurs chiffres. **Exemple** (Erangel, escouade, au 2026-10-18) : la ligne de vol traverse le premier cercle dans 99,9 % des parties, contre 70,6 % avec la ligne d'une autre partie ; 11 % des zones finales tombent dans la bande de 200 m autour de la ligne, contre 7,9 % au hasard ; à partir du cercle 2, la fermeture ne suit plus l'avion (46 à 50 %, soit le hasard). C'est la donnée **la plus citable du site** |
| `/clans-leaderboard` | « Comment est calculé le Power score ? » (formule de [ligue-clans.md](../features/ligue-clans.md)), périodes, types de partie | Classement de la semaine (rang, clan, Power score, parties), chaque clan lié à sa vue d'ensemble |
| `/tournaments` et `/tournaments/[id]` | « Comment fonctionne un tournoi ? » (parties personnalisées importées, sans inscription, calcul des points) | Liste des tournois avec dates, nombre de clans et de joueurs, vainqueur. Page d'un tournoi : H1, podium, classement, manches |
| `/clans` | Ce qu'est un clan suivi, comment inscrire le sien, styles Fragger / Medic / Ghost | Liste des clans (nom, tag, effectif, parties sur 7 jours), liens vers leur vue d'ensemble |
| `/mortier` | Guide sur **sa propre adresse**, `/mortier/guide` (titre « Guide du mortier PUBG à la grille », dans `STATIC_PAGES` et le sitemap) ; `/mortier?tab=guide` redirige vers elle. Utile mais pas urgent : c'est le seul contenu « tutoriel » du site, celui qui répond à une question qu'on pose à Google comme à un moteur génératif (« comment régler le mortier PUBG »). Une page dont le titre et le H1 disent « guide du mortier » a plus de chances d'être retenue que l'onglet d'un outil intitulé « Mortier ». Coût faible : le composant `MortarGuide` existe. Version minimale : rendre les deux onglets dans le HTML, celui qui est inactif en `hidden` | Classement des artilleurs, si un clan est choisi |
| `/carte-des-ressources` | Comment les véhicules sont repérés (télémétrie des vraies parties), différence entre un point observé et un point proposé | Pour chaque carte : nombre d'emplacements de véhicules observés, et sur combien de parties |
| `/` | Accroche descriptive autour du slogan (le H1 peut garder « Winner winner, chicken dinner. » avec un sous-titre descriptif juste dessous) | Compteurs, Top 1 de la semaine et kill feed rendus côté serveur (cache de 5 min déjà en place) — gain de LCP au passage |

Boussole de l'accueil : la dessiner en SVG ou en CSS (`content:`) pour qu'elle quitte le texte de la page.

Pages de clan (13 par clan, 429 adresses pour 33 clans) : même principe dans un second temps, en commençant par la vue
d'ensemble. Jamais de pseudo de joueur extérieur (règle de l'accueil, [accueil.md](../features/accueil.md)).

### Lot 3 — données structurées (une seule source : `page-seo.ts`)

Ajouter `pageJsonLd(path, refs)` à côté de `homeJsonLd` et le rendre dans le layout pour **toutes** les pages
indexées, avec des tests dans `page-seo.test.ts`. Règle de Google : ne décrire que ce qui est visible dans la page,
d'où ce lot **après** le lot 2.

| Page | Types schema.org |
|---|---|
| Toutes | `WebSite` + `Organization` par référence `@id` (l'existant ; ajouter `logo` et `sameAs` — question 3), `BreadcrumbList` |
| `/clans-leaderboard`, `/clans` | `CollectionPage` + `ItemList` (clans, liens vers leur vue d'ensemble) |
| `/clans/[id]/overview` | `SportsTeam` (`sport` : « PUBG: BATTLEGROUNDS », nom, tag en `alternateName`), **sans liste de joueurs** |
| `/tournaments/[id]` | `SportsEvent` : dates, `eventStatus`, `eventAttendanceMode` en ligne, `VirtualLocation`, clan organisateur, clans participants |
| `/mortier`, `/lecture-de-zone`, `/carte-des-ressources` | `WebApplication` (`applicationCategory` : `GameApplication`, gratuit) |
| `/mortier/guide`, méthodologie | `Article` avec `dateModified` et auteur (question 1) |

À ne pas attendre : `FAQPage` et `HowTo` ne donnent plus de résultat enrichi chez Google depuis 2023 (FAQ réservée aux
sites gouvernementaux et de santé). Le **texte** en questions et réponses reste utile aux moteurs génératifs ; le
balisage est facultatif. `Dataset` pour la lecture de zone : possible plus tard (Google Dataset Search), effet faible.

### Lot 4 — autorité et présence hors du site (E-E-A-T, GEO)

1. **Enrichir `/a-propos`** (220 mots aujourd'hui). Décision du 2026-10-18 : **l'éditeur reste Arkium**, sans
   personne nommée. L'E-E-A-T passe donc par la transparence (méthode, sources, chiffres, dates de mise à jour) et par
   l'entité `Organization` Arkium : description, logo, `contactPoint` (contact@chickendinner.fr). Contenu : depuis
   quand le site existe, pourquoi, chiffres
   vivants (33 clans suivis, 510 joueurs, 31 205 parties analysées au 2026-10-18 — `stats` de `/api/home/showcase`),
   contact, date de mise à jour.
2. **Page « Méthodologie »** (ou une section de `/a-propos`) : Power score, styles Fragger / Medic / Ghost, lecture
   de zone, définition d'une soirée (de 06:00 à 06:00, heure de Paris), limites de l'API PUBG. C'est ce texte que
   les moteurs génératifs citeront pour répondre à « comment chickendinner calcule… ».
3. **Bing Webmaster Tools** + **IndexNow** (§4 J) : soumettre le sitemap, puis notifier IndexNow à la création d'un
   tournoi ou d'un clan. Vérifier aussi que les étapes Search Console de `seo.md` §4 sont faites.
4. **`robots.txt` et robots d'IA** — **réalisé le 2026-10-18** avec le lot 0.0 (`AI_TRAINING_BOTS`). Décision du
   2026-10-18 : **robots de recherche oui, robots d'entraînement non.**
   Il suffit de nommer les robots d'entraînement avec `Disallow: /`. Tous les autres, robots de recherche compris,
   suivent le groupe `*` (un robot nommé dans un groupe ignore le groupe `*`, d'où l'intérêt de ne nommer que ceux
   qu'on refuse).

   | Refusés (entraînement) | Autorisés par `*` (recherche et requêtes d'un utilisateur) |
   |---|---|
   | `GPTBot`, `ClaudeBot`, `CCBot`, `Google-Extended`, `Applebot-Extended`, `Meta-ExternalAgent`, `Bytespider` | `Googlebot`, `Bingbot`, `OAI-SearchBot`, `ChatGPT-User`, `Claude-SearchBot`, `Claude-User`, `PerplexityBot`, `Perplexity-User`, `Applebot` |

   À savoir : refuser `Google-Extended` ne change rien à la recherche Google ni aux AI Overviews, qui passent par
   `Googlebot`. Le respect de `robots.txt` reste volontaire (`Bytespider` le suit mal). Vérifier les noms sur les
   pages officielles de chaque éditeur au moment de l'écrire. Test dans `page-seo.test.ts`.
5. **`/llms.txt`** : résumé du site et liens vers les pages clés, en Markdown. Coût faible, mais aucun effet démontré
   à ce jour sur les grands moteurs : à faire en dernier.
6. **Mentions externes** : ce sont les liens et citations ailleurs qui décident pour les requêtes génériques
   (`seo.md` §5) et pour ce que les moteurs génératifs « savent ». Pistes : lien vers le site dans les serveurs Discord
   des clans suivis, dans les annonces de tournoi, communautés PUBG francophones (Reddit, forums), chaînes Twitch des
   joueurs.
7. **Phrases citables factuelles** plutôt que des slogans, par exemple : « chickendinner.fr suit 33 clans PUBG
   francophones, soit 510 joueurs, et a analysé 31 205 parties » — rendue à partir des chiffres du moment.

### Lot 5 — performance (LCP 14,3 s annoncé)

1. **Mesurer d'abord** : PageSpeed Insights (données terrain si le trafic suffit) et la trace Lighthouse, pour
   identifier l'élément LCP. Hypothèses : sur l'accueil, blocs qui attendent `/api/home/showcase` (1,9 s à froid) et
   animations infinies (Ken Burns sur le fond, boussole, kill feed) qui occupent le processeur en mobile bridé ; sur
   les pages intérieures, le shell monté après l'hydratation (corrigé par le lot 1).
2. Rendu serveur de la vitrine (lot 2) et préchauffage du cache de `showcase` (par le cron, par exemple).
3. **Compresser le JSON dans nginx** : les réponses de l'API ne sont pas compressées (`/api/zone-reading` : 240 Ko
   servis tels quels le 2026-10-18, alors que le HTML, le JS et le CSS le sont). Ajouter `application/json` à
   `gzip_types` du bloc HTTPS — gain probable de 80 à 90 % sur les grosses réponses.
4. *Unused JavaScript* (26 Kio) : en dernier.

---

## 6. Effet attendu sur les notes du rapport

| Note du rapport | Lots | Effet attendu |
|---|---|---|
| Sécurité 57 | 0.1, 0.2 | Fort : la plupart des points perdus sont des en-têtes |
| Sémantique 17 (S:0 sur 9 pages) | 1, 2 | Fort : c'est la cause racine |
| Structure GEO 63, Chunkability | 1, 2 (règles d'écriture), 3 | Fort |
| Cohérence 50 | 0.7, 0.8, 2 | Moyen à fort (faux zéros, noms, ton) |
| E-E-A-T (autorité 5/10) | 4.1, 4.2, 4.6 | Moyen, et lent pour les mentions externes |
| Performance 69 | 1, 5 | Moyen, à confirmer par la mesure |
| Technique 90 | 0.3 à 0.6 | Faible, déjà bonne |

Les notes de l'outil sont propriétaires : ce tableau donne une direction, pas un chiffre.

---

## 7. Contrôle après chaque déploiement

```bash
curl -sI https://chickendinner.fr/ | grep -iE 'strict-transport|content-security|x-content-type|referrer|x-powered|server'
curl -sI https://www.chickendinner.fr/clans          # attendu : 301 vers https://chickendinner.fr/clans
curl -s https://chickendinner.fr/tournaments | grep -o '<h1[^>]*>.*</h1>'
```

- **Ce que voit un robot sans JavaScript** : un script `scripts/seo-raw-html-audit.ts` (titre, description, H1,
  H2, mots visibles, images sans `alt`, présence de `<main>` et de JSON-LD pour chaque page du sitemap) rejouerait la
  mesure du §2. Celui qui a servi à cette vérification est prêt à être versionné.
- Test des résultats enrichis (Google) pour le JSON-LD, PageSpeed Insights pour le lot 5.
- Relancer le même outil d'audit sur les mêmes 10 pages, en ajoutant `/a-propos`, `/clans/comparator`, une page de
  clan et une page de tournoi.

---

## 8. Décisions et questions

Réponses du 2026-10-18 :

| Question | Décision |
|---|---|
| Mode visiteur définitif en production ? | **Oui**, sauf les pages réservées à un membre ou au SuperUser — déjà hors index (`/members/…`, `/account`, `/settings`, écrans techniques des clans). Le lot 2 est confirmé |
| Qui présenter (E-E-A-T) ? | **Arkium**, sans personne nommée (lot 4.1) |
| Robots d'IA ? | **Recherche oui, entraînement non** (lot 4.4) |
| Comptes officiels (`sameAs`) ? | En réflexion. Un serveur Discord chickendinner est envisagé, voir ci-dessous |
| Guide du mortier sur sa propre adresse ? | Utile mais pas urgent (lot 2, ligne `/mortier`) |
| Search Console, DNS ? | Search Console vérifiée (DNS), sitemap lu : 442 connues, 3 indexées, 438 « Détectée, actuellement non indexée » (§0). Bing : import depuis la Search Console |

**Un serveur Discord chickendinner ?** Son contenu n'est pas indexé par les moteurs : l'effet SEO direct est faible
(un `sameAs`, un lien de plus). L'intérêt est ailleurs : un lieu public pour les annonces de tournoi et les Top 1, qui
donne aux clans une raison de mettre un lien vers le site. Utile s'il est animé ; un serveur vide dessert l'image.

Restent ouverts :

1. Le **second motif** (1 page) et la **liste des 3 pages indexées** (rapport *Pages*, bas de page et
   *Afficher les données concernant les pages indexées*).
2. Le **test en ligne** de `/clans` (§0, « Vérifier ») a échoué côté Search Console le 2026-10-18 : la simulation
   le remplace ; le retenter après le déploiement du lot 0.0 pour confirmer chez Google.
3. Les comptes officiels, une fois la question du Discord tranchée.
