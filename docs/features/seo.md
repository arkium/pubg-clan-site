# Référencement (SEO)

Ce que Google reçoit de chickendinner.fr : titres et descriptions de chaque page, indexation, adresse canonique,
aperçus de partage, sitemap, robots.txt et données structurées. Mis en place le 2026-10-05.

## 1. Où vivent les règles

| Fichier | Rôle |
|---|---|
| `src/lib/seo/page-seo.ts` | **Module pur, source unique** : titre, description et indexation de chaque page (`STATIC_PAGES`, `CLAN_PAGES`, `pageSeo`), métadonnées complètes (`buildPageMetadata`), contenu du sitemap et de robots.txt, données structurées de l'accueil |
| `src/lib/seo/seo-service.ts` | Lectures en base : nom du clan ou titre du tournoi de la page, clans et tournois du sitemap |
| `src/app/layout.tsx` | `generateMetadata` : applique les règles à **toutes** les pages |
| `src/proxy.ts` | Pose l'en-tête `x-pathname` sur chaque requête de page (`passThrough`) : sans lui, le layout racine ne connaît pas le chemin |
| `src/app/sitemap.ts`, `src/app/robots.ts` | `/sitemap.xml` et `/robots.txt`, calculés à chaque appel |
| `src/app/page.tsx` | Données structurées schema.org (`WebSite` + `Organization`) de l'accueil |
| `src/app/not-found.tsx` | Page 404 (Next.js répond 404 et pose `noindex`) |

**Pourquoi le layout racine.** Presque toutes les pages sont des composants client : elles ne peuvent pas exporter de
`metadata`. Plutôt qu'un `layout.tsx` par route, le layout racine calcule les métadonnées depuis le chemin transmis par
le proxy. Une page serveur peut toujours exporter les siennes, qui l'emportent.

**Liste blanche.** Seules les pages déclarées sont indexées : l'accueil, `STATIC_PAGES`, `CLAN_PAGES` et les tournois.
Toute autre adresse (page oubliée, 404) reçoit `noindex` sans canonique.

**Ajouter une page publique** : une entrée dans `STATIC_PAGES` (titre ≤ 60 caractères utiles, description de 60 à 170
caractères, `sitemap` si elle doit être annoncée). Une page de clan du menu latéral : une entrée dans `CLAN_PAGES`.

## 2. Ce qui est indexé (décisions du 2026-10-05)

| Pages | Indexation | Titre |
|---|---|---|
| `/` (vitrine) | oui | « chickendinner.fr — stats, classements et Top 1 des clans PUBG » |
| `/clans`, `/clans-leaderboard`, `/clans/comparator`, `/tournaments`, `/mortier`, `/carte-des-ressources`, `/join` | oui | propre à chaque page |
| Pages du **menu latéral d'un clan suivi** (vue d'ensemble, classement, membres, matchs, stats, carrière, armurerie, heatmap, cartographie, fin de zone, drop zones, awards, challenges) | oui si le clan est actif, non archivé, hors clan système | « Nom [TAG] — Classement · chickendinner.fr » |
| Autres pages d'un clan (réglages, télémétrie, demandes, débriefs, soirées) | non | « Nom [TAG] » |
| `/tournaments/[id]` | oui si le tournoi est `active` ou `finished` | « Titre — tournoi PUBG » |
| Pages légales | oui | « Mentions légales et CGU », etc. |
| **Pages joueur `/members/…`** | **non** (pseudos, y compris d'adversaires sur Némésis ; cohérent avec la page Confidentialité et le droit au retrait) | « Profil joueur » |
| `/account`, `/settings/…`, `/login`, `/activate`, `/reset-password`, `/clans/mutations` | non | — |

Tous les titres finissent par « · chickendinner.fr ». Une page indexée a une adresse canonique **sans la requête**
(`?period=`…) : une seule version par page. Une page hors index reçoit `noindex, follow` (Google suit ses liens).

## 3. Sitemap et robots.txt

- `/sitemap.xml` : accueil, pages publiques, les 13 pages du menu de chaque clan suivi (datées de sa dernière partie),
  tournois lancés. Environ 390 adresses au 2026-10-05 (29 clans). Base indisponible : seules les pages fixes.
- `/robots.txt` : tout est permis sauf `/api/`, `/account`, `/settings`, `/login`, `/activate`, `/reset-password`, et
  il annonce le sitemap. Les pages joueur **ne sont pas** bloquées ici : Google doit pouvoir y lire leur `noindex`.
- Ces deux adresses sont exclues du proxy (`matcher`) : jamais de redirection vers /login.

**Adresse publique** : `NEXT_PUBLIC_APP_URL` (sinon `https://chickendinner.fr`). En production, elle doit valoir
**`https://chickendinner.fr`** : c'est elle qui fabrique les adresses du sitemap, les canoniques et les aperçus.

## 4. Google Search Console — à faire une fois en production

1. Ouvrir https://search.google.com/search-console, ajouter la propriété **`chickendinner.fr`** (type « Domaine »).
2. Vérifier la propriété : enregistrement DNS TXT chez le registraire (recommandé, rien à déployer), ou balise HTML —
   dans ce cas, copier le code `content` dans la variable **`GOOGLE_SITE_VERIFICATION`** du `.env` de production et
   redémarrer le service web : `<meta name="google-site-verification">` est posé sur toutes les pages.
3. Menu **Sitemaps** : soumettre `https://chickendinner.fr/sitemap.xml`.
4. **Inspection d'URL** : demander l'indexation de l'accueil, de la Ligue et de l'annuaire des clans.

Les sous-domaines de clan (`smk.chickendinner.fr`) redirigent vers le domaine principal : rien à déclarer à part.

## 5. Ce qui fait (ou non) la première place

Rien ne garantit une position. Ce qui est en place permet à Google de comprendre chaque page ; le reste se joue
ailleurs :

- **Requêtes sur la marque** (« chickendinner.fr », nom d'un clan suivi) : première place très probable une fois les
  pages indexées — titres et descriptions les contiennent, la Search Console accélère la découverte.
- **Requêtes génériques** (« stats PUBG », « classement clans PUBG ») : face à op.gg, pubglookup, dak.gg, ce sont
  l'ancienneté, les **liens entrants** (Discord des clans, forums, réseaux) et la vitesse des pages qui décident.
- Les pages sont rendues côté navigateur : Google exécute le JavaScript, mais le contenu arrive après les métadonnées.
  Un rendu serveur des pages publiques les plus visées (Ligue, annuaire) serait le prochain levier.

## 6. Tests

- `src/lib/seo/page-seo.test.ts` : règles par page, métadonnées (canonique, robots, vérification), sitemap sans
  doublon, robots.txt, données structurées.
- `src/lib/seo/seo-service.test.ts` : clan suivi / archivé / en attente / système, tournoi lancé ou brouillon, base en
  panne, filtres du sitemap, en-tête `x-pathname` posé par le proxy (et non falsifiable).
- `e2e/legal.spec.ts` (titres d'onglet), `e2e/not-found.spec.ts` (404).
