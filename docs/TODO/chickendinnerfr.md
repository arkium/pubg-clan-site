# Sous-domaine par clan — `<clan>.chickendinner.fr`

> **Spécification — cadrage validé le 2026-09-26 ; étapes 1 et 2 du §5 faites le 2026-09-26 (code, migration,
> 29 sous-domaines attribués) ; étapes 3 et 4 (certificat wildcard, Nginx, `CLAN_SUBDOMAIN_ROOT`) faites le 2026-10-31,
> recette passée le jour même (§6) ; `/login` sur sous-domaine et pastille de la vitrine déployés et vérifiés le soir
> même. Sous-domaine persistant réexaminé le 2026-10-31 (§9) : documenté, non planifié**
> *Destiné à l'équipe de développement.*
>
> Première version : une note d'opportunité. Revue contre le code et l'infrastructure le 2026-09-26 : le DNS est
> prêt, mais le tag de clan ne peut pas servir de clé (doublons en base), et le sous-domaine « persistant » casserait
> la session et les liens internes (§3) ; réexamen chiffré le 2026-10-31 (§9).

---

## 1. Le besoin

Donner à chaque clan une adresse courte et mémorisable — `smk.chickendinner.fr` — qui mène directement à sa vue
d'ensemble, sans que le joueur ait à passer par la liste des clans. Tout nouveau clan doit obtenir son adresse sans
action manuelle sur le DNS, le certificat ou Nginx.

---

## 2. Décisions

| Sujet | Décision | Date |
|---|---|---|
| Comportement | **Redirection** (option A) : `smk.chickendinner.fr/…` → `https://chickendinner.fr/clans/<id>/overview`. Le site reste sur un seul domaine | 2026-09-26 |
| Connexion directe et depuis le clan | `smk.chickendinner.fr/login` → `https://chickendinner.fr/login?redirect=/clans/<id>/overview` ; le bouton « Se connecter » du menu visiteur sur une page `/clans/<id>/…` passe aussi `?redirect=…` pour afficher l'écran d'accueil personnalisé du clan et ramener le joueur sur son clan après connexion | 2026-10-31 |
| Affichage de l'adresse courte | Pastille copiable `<clan>.chickendinner.fr` dans le bandeau de la vue d'ensemble du clan (`ClanShowcaseHero`), **seulement quand `CLAN_SUBDOMAIN_ROOT` est défini** : l'API overview renvoie `subdomainHost` (`clanSubdomainHost`), jamais une adresse qui ne mènerait nulle part (local, fonctionnalité coupée) | 2026-10-31 |
| Sous-domaine persistant (option B, réécriture interne) | **Écarté** : cookie de session à élargir à tous les sous-domaines, liens internes `/clans/<id>/…` à réécrire, clan sélectionné (`localStorage`) perdu d'un sous-domaine à l'autre (§3.C) | 2026-09-26 |
| Sous-domaine persistant, réexamen | Faisable ; avantages, coûts mesurés et plan en quatre lots consignés au **§9**. **Non planifié** : la redirection reste en place | 2026-10-31 |
| Clé de correspondance | **Champ dédié `Clan.subdomain`, unique**, et non le tag PUBG : le tag n'est pas unique et peut changer ou être repris (§3.B) | 2026-09-26 |
| Tags en double | Aucun des deux clans ne reçoit le tag seul : chacun reçoit un sous-domaine tiré de son **nom** (§4.B) | 2026-09-26 |
| Sous-domaine inconnu ou réservé | Redirection **temporaire** vers `https://chickendinner.fr/clans` (jamais 301 : le navigateur la mémoriserait) | 2026-09-26 |
| Sous-domaine inconnu, réservé ou de clan inactif (révision) | Redirection temporaire vers la **vitrine** `https://chickendinner.fr/` ([accueil.md](../features/accueil.md)) au lieu de `/clans` | 2026-09-26 |

---

## 3. État au 2026-09-26

### A. Infrastructure (vérifiée)

| Élément | État |
|---|---|
| DNS `chickendinner.fr` | ✅ pointe vers le serveur de production (217.182.143.43) |
| DNS wildcard `*.chickendinner.fr` | ✅ déjà en place : un sous-domaine inventé résout vers la même adresse |
| Certificat HTTPS | ✅ **depuis le 2026-10-31** : wildcard Let's Encrypt `*.chickendinner.fr` + `chickendinner.fr` (DNS-01, plugin OVH), valable jusqu'au 29/01/2027. Avant : domaine principal seulement, les sous-domaines échouaient (nom de certificat incorrect) |
| Nginx (1.24, Ubuntu) | ✅ **depuis le 2026-10-31** : sous-domaines servis en HTTPS, HTTP redirigé vers HTTPS (301) |

### B. Les tags ne peuvent pas servir de clé

`Clan.tag` n'a aucune contrainte d'unicité (seuls `[name, platformShard]` et `[pubgClanId, platformShard]` en ont). Sur
30 clans actifs, **deux tags sont partagés** :

| Tag | Clans |
|---|---|
| `kms` | KilslMS (id 2), KeepMoveSurvive (id 180) |
| `fr` | FR-Alliance-BE (id 7), teambaguette (id 24) |

Tous les tags actuels sont par ailleurs compatibles DNS (`[a-z0-9]`, une fois en minuscules). Un tag PUBG peut
changer, ou être repris par un autre clan : une adresse fondée sur le tag changerait de destinataire sans prévenir.

### C. Pourquoi pas le sous-domaine persistant

- Le cookie `pubg_clan_session` est limité à l'hôte exact (`buildCookieOptions`, sans `domain`) : il faudrait
  `domain: '.chickendinner.fr'`, et tout sous-domaine le recevrait.
- Tous les liens internes sont écrits `/clans/${clanId}/…` : réécrits sous un sous-domaine, ils produiraient des
  chemins doublés ou deux schémas d'URL mêlés.
- `selectedClanId` (`localStorage`) est propre à chaque origine : chaque sous-domaine repartirait de zéro — et
  aggraverait le bug connu du premier visiteur renvoyé vers `/clans` ([tests-e2e.md](../ops/tests-e2e.md#points-connus)).
- Les liens absolus des e-mails et de Discord (`NEXT_PUBLIC_APP_URL`) resteraient sur le domaine principal.

Réexamen du 2026-10-31, avec des mesures à jour et les points ajoutés depuis (Next 16, référencement, services
OVH) : §9.

### D. Le proxy

`src/proxy.ts` tourne sous Node (Next 16) et appelle déjà `/api/setup/status` à **chaque** requête. Le piège n° 4
du CLAUDE.md y interdit Prisma. Ajouter une lecture en base par page sur une VM partagée n'est pas souhaitable :
la correspondance doit être mise en cache.

---

## 4. Le standard cible

### A. Données

- Nouveau champ `Clan.subdomain String? @unique` (`VarChar(63)`), en minuscules, `[a-z0-9-]`, sans tiret en début
  ni en fin, 2 à 63 caractères.
- **Mots réservés**, jamais attribués : `www`, `api`, `admin`, `mail`, `smtp`, `imap`, `pop`, `ftp`, `dev`,
  `staging`, `test`, `status`, `static`, `cdn`, `assets`, `app`, `auth`, `login`. Liste unique dans
  `src/lib/clan-subdomain.ts`, avec la normalisation et la validation.
- Le clan système (`isSystem`) n'a pas de sous-domaine.

### B. Attribution

- **Par défaut** : le tag en minuscules, s'il est valide, non réservé et libre.
- **Sinon** (tag déjà pris, réservé ou invalide) : le nom du clan normalisé (minuscules, accents retirés, caractères
  hors `[a-z0-9]` remplacés par `-`, tirets consécutifs fusionnés). En dernier recours, suffixe numérique (`-2`, `-3`…).
- **Doublons actuels** (décision du 2026-09-26) — aucun des deux clans ne garde le tag seul :

  | Clan | Sous-domaine |
  |---|---|
  | KilslMS (id 2) | `kilslms` |
  | KeepMoveSurvive (id 180) | `keepmovesurvive` |
  | FR-Alliance-BE (id 7) | `fr-alliance-be` |
  | teambaguette (id 24) | `teambaguette` |

- **Nouveau clan** : attribution automatique quand le clan devient actif (validation dans le cycle de vie, ajout
  depuis l'Observatoire). Un changement de tag ultérieur **ne modifie pas** le sous-domaine : l'adresse reste stable.
- **Modification** : réservée au SuperUser (réglages du clan) ; l'ancien sous-domaine est libéré immédiatement.
- **Clan archivé ou désactivé** : son sous-domaine redirige vers la vitrine `/` (`/clans` avant la révision du 2026-09-26) (sous-domaine conservé, pour une
  réactivation).

### C. Redirection (`src/proxy.ts`)

- Hôte `<x>.chickendinner.fr` (domaine racine lu depuis une variable d'environnement, par exemple
  `CLAN_SUBDOMAIN_ROOT=chickendinner.fr` ; absente → fonctionnalité désactivée, donc sans effet en local) :
  - `<x>` attribué à un clan actif → **307** vers `https://chickendinner.fr/clans/<id>/overview` ;
  - `<x>` inconnu, réservé, ou clan inactif → **307** vers la vitrine `https://chickendinner.fr/` (révision du
    2026-09-26 ; `/clans` auparavant).
- Le chemin du sous-domaine est ignoré (`smk.chickendinner.fr/stats` → vue d'ensemble) : pas de second schéma d'URL.
  Deux exceptions :
  - `/m/<match>` → `https://chickendinner.fr/m/<match>?c=<sous-domaine>` (lien court de débriefing, [url-masking.md](url-masking.md) §4.C) ;
  - `/login` → `https://chickendinner.fr/login?redirect=/clans/<id>/overview` (lien direct vers la page de connexion personnalisée aux couleurs du clan).
- Le domaine racine, `www`, `localhost` et les adresses IP ne sont jamais traités comme des sous-domaines.
- **Aucune lecture Prisma dans le proxy** : il appelle une route interne légère
  (`GET /api/internal/clan-subdomains`, sur le modèle de `/api/setup/status`) qui renvoie la table
  `sous-domaine → id` des clans actifs ; le proxy la garde en cache mémoire quelques minutes. Une modification
  d'attribution est donc visible au plus tard à l'expiration du cache.
- La redirection passe **avant** la logique d'installation et de session : un sous-domaine n'affiche jamais de page.

### D. Infrastructure

1. **Certificat wildcard** Let's Encrypt couvrant `chickendinner.fr` et `*.chickendinner.fr`. Il exige une
   validation **DNS-01** : `certbot` avec le plugin du registrar (renouvellement automatique à vérifier).
2. **Nginx** : `server_name chickendinner.fr *.chickendinner.fr;` sur le bloc HTTPS existant (en-têtes `Host`,
   `X-Forwarded-Proto` déjà transmis), et le bloc HTTP de redirection vers HTTPS étendu aux sous-domaines.
3. Rien à faire au DNS : le wildcard est en place.

---

## 5. Plan

1. **Code** (sans effet en production tant que `CLAN_SUBDOMAIN_ROOT` n'est pas défini) : `src/lib/clan-subdomain.ts`,
   champ Prisma et migration, attribution à l'activation d'un clan, route interne, redirection dans le proxy,
   réglage SuperUser.
2. **Migration en production** — *avec accord explicite* : `migrate diff` lu avant, puis ajout de la colonne et de
   l'index unique ; remplissage des clans actifs par un script `scripts/backfill-clan-subdomains.ts` en mode
   simulation d'abord (liste des attributions affichée), puis écriture.
3. **Certificat puis Nginx** sur le serveur ; vérifier `https://bee.chickendinner.fr` avant d'aller plus loin.
4. Définir `CLAN_SUBDOMAIN_ROOT` et redémarrer `web`.

---

## 6. Tests

| Fichier | Contenu |
|---|---|
| `src/lib/clan-subdomain.test.ts` | Normalisation (casse, accents, caractères interdits, tirets), validation (longueur, mots réservés), attribution : tag libre, tag pris → nom, nom pris → suffixe ; les quatre attributions du §4.B |
| `src/lib/clan-subdomain-proxy.test.ts` | Extraction de l'hôte : racine, `www`, `localhost`, IP, sous-domaine ; 307 vers la vue d'ensemble, 307 vers la vitrine `/` si inconnu ou réservé ; fonctionnalité inactive sans `CLAN_SUBDOMAIN_ROOT` ; cache (un seul appel à la route interne par période) |
| Contrat de la route interne | Ne renvoie que les clans actifs non système ; ne renvoie ni nom ni donnée autre que `sous-domaine → id` |

Recette manuelle en production : deux sous-domaines attribués (liste dans `GET /api/internal/clan-subdomains` —
`smk` et `kilslms`, pris en exemple dans les tests, n'y sont **pas**), un sous-domaine inventé, `www.chickendinner.fr`,
en HTTP et en HTTPS ; certificat valide sur chacun.

Recette du 2026-10-31 (certificat et Nginx en place ; `/login` et la pastille revérifiées après le déploiement du
soir) :

| Adresse | Résultat |
|---|---|
| `https://bee.chickendinner.fr/` | ✅ 307 → `/clans/3/overview` ; certificat wildcard valide |
| `https://ratz.chickendinner.fr/stats` | ✅ 307 → `/clans/6/overview` (chemin ignoré) |
| `https://ratz.chickendinner.fr/m/abc123` | ✅ 307 → `/m/abc123?c=ratz` |
| `https://inconnu-xyz.chickendinner.fr/`, `https://smk.chickendinner.fr/` | ✅ 307 → vitrine `/` (non attribués) |
| `https://www.chickendinner.fr/` | ✅ 301 → `https://chickendinner.fr/` |
| `http://bee.chickendinner.fr/` | ✅ 301 → `https://bee.chickendinner.fr/` |
| `https://bee.chickendinner.fr/login` | ✅ 307 → `https://chickendinner.fr/login?redirect=/clans/3/overview` (après déploiement ; avant : vue d'ensemble) |
| Pastille de la vitrine | ✅ `GET /api/clans/3/overview` → `subdomainHost: "bee.chickendinner.fr"` |

---

## 7. Documentation

| Document | Mise à jour |
|---|---|
| [docs/ops/deployment.md](../ops/deployment.md) | Certificat wildcard (DNS-01, renouvellement), `server_name` avec wildcard, variable `CLAN_SUBDOMAIN_ROOT` |
| [docs/features/cycle-de-vie-clan.md](../features/cycle-de-vie-clan.md) | Attribution du sous-domaine à l'activation, stabilité au changement de tag |
| CLAUDE.md | Variable d'environnement ; règle « pas de Prisma dans le proxy » rappelée avec la route interne |
| [docs/sommaire.md](../sommaire.md), [todo.md](todo.md) | Entrée du chantier |
| [docs/features/seo.md](../features/seo.md) | Canonique sur le domaine principal si le sous-domaine persistant est adopté (§9) |
| `next.config.ts`, [deployment.md](../ops/deployment.md), [geo-seo-propositions.md](geo-seo-propositions.md) §4 G, [inventaire-2026-10-20.md](inventaire-2026-10-20.md) | HSTS : wildcard posé, `includeSubDomains` bloqué par `mail.chickendinner.fr` (§8) |

---

## 8. Questions ouvertes

- ~~Registrar du domaine : conditionne le plugin `certbot` pour la validation DNS.~~ **Vérifié le 2026-10-31** : zone DNS chez **OVH** (`dns200.anycast.me` / `ns200.anycast.me`, wildcard `* IN A 217.182.143.43` en place, e-mails OVH `imap`/`pop3`/`smtp`/`mail` et `ftp` définis explicitement en CNAME) → plugin **`python3-certbot-dns-ovh`**.
- ~~Faut-il montrer l'adresse du clan sur sa vue d'ensemble (lien copiable) ?~~ **Fait le 2026-10-31** : pastille copiable `<clan>.chickendinner.fr` affichée dans le bandeau de la vue d'ensemble (`ClanShowcaseHero`), quand `CLAN_SUBDOMAIN_ROOT` est défini.
- **HSTS `includeSubDomains`** — le certificat wildcard le permet pour les sous-domaines de clan depuis le
  2026-10-31, mais pas pour les noms d'OVH : `mail`, `imap`, `pop3` et `smtp` sont des CNAME vers `ssl0.ovh.net`, dont
  le certificat ne couvre pas ces noms (`https://mail.chickendinner.fr` échoue), et `http://mail.chickendinner.fr`
  redirige vers le webmail OVH (301 → `https://www.ovh.co.uk/mail/`). Avec `includeSubDomains`, un navigateur qui a vu
  `chickendinner.fr` forcerait le HTTPS sur `mail.` : ce raccourci deviendrait inaccessible, sans contournement
  possible. Les logiciels de messagerie (IMAP, SMTP) ne sont pas concernés ; `ftp` pointe vers le serveur du site
  (CNAME `chickendinner.fr`) et passe. **À trancher** : renoncer au raccourci webmail `mail.chickendinner.fr`, ou
  garder HSTS sans `includeSubDomains` (état actuel, `next.config.ts`).
- **Sous-domaine persistant** (`bee.chickendinner.fr/overview`) — §9.

---

## 9. Sous-domaine persistant — réexamen du 2026-10-31

> Proposition : garder l'adresse du clan pendant toute la visite (`bee.chickendinner.fr/overview`,
> `bee.chickendinner.fr/leaderboard`) pour donner au joueur le sentiment d'être chez son clan. **Statut : documenté,
> non planifié** ; la redirection (option A) reste en place.

Faisable : le proxy de Next 16 peut servir `/clans/<id>/<page>` à l'adresse `bee.chickendinner.fr/<page>` sans changer
la barre d'adresse (réécriture). Les objections du §3.C tiennent toujours ; les mesures ci-dessous datent du
2026-10-31.

### A. Avantages

| Avantage | Détail |
|---|---|
| Appartenance | Le nom du clan reste dans l'adresse pendant toute la visite |
| Adresse partagée courte | Copier la barre d'adresse donne `bee.chickendinner.fr/leaderboard` (Discord, favoris) ; aujourd'hui seule l'adresse d'entrée est courte |
| Identifiant masqué | `/clans/3` disparaît de l'adresse, dans la logique de [url-masking.md](url-masking.md) |
| Connexion aux couleurs du clan | `bee.chickendinner.fr/login` connaît le clan par l'hôte, sans `?redirect=` |
| Clan connu dès la requête | Le serveur connaît le clan avant tout rendu : des couleurs propres au clan dans le menu deviendraient possibles |
| Liens sortants | Les messages Discord et les e-mails d'un clan pourraient porter son sous-domaine sur toutes les pages, pas seulement `/m/` |

### B. Coûts

| Point | Constat | Conséquence |
|---|---|---|
| Session | `pubg_clan_session` est limité à l'hôte exact (`buildCookieOptions`, `src/lib/auth-session.ts`, sans `domain`) | Un membre connecté sur `chickendinner.fr` paraît déconnecté sur `bee.` : le cookie doit passer à `domain: '.chickendinner.fr'`. La déconnexion efface alors les deux formes (sinon un cookie fantôme reste) ; toutes les sessions en cours sont concernées |
| Cookie envoyé chez OVH | `mail`, `imap`, `pop3`, `smtp` pointent vers `ssl0.ovh.net` (§8) | Le cookie élargi partirait vers un hôte tiers si un navigateur y passait outre l'alerte de certificat. Risque faible, à accepter explicitement |
| Stockage du navigateur | `selectedClanId`, `canSwitchClan`, `pubg_nav_collapsed` (`localStorage`, 14 fichiers) et le cookie de thème `pubg_app_theme` (`appThemeCookie`, sans `Domain`) sont propres à chaque origine | Chaque sous-domaine repart de zéro, ce qui aggrave le bug du premier visiteur renvoyé vers `/clans` ([tests-e2e.md](../ops/tests-e2e.md#points-connus)). Le cookie de thème doit suivre la session ; sous un sous-domaine, le clan sélectionné se déduit de l'hôte |
| Liens internes | 271 liens `/clans/${…}` dans 100 fichiers, plus 17 `router.push` / `replace` | Une fonction unique de fabrication des liens d'un clan, à introduire partout. Un lien vers un autre clan (Ligue, annuaire, comparateur, adversaires) change d'origine : rechargement complet de la page. Pages hors clan (`/players`, `/tournaments`, `/members/…`) : sur le domaine principal |
| `usePathname()` | La doc de Next 16 (`use-pathname.md`, « Avoid hydration mismatch with rewrites ») prévient d'un écart entre serveur et navigateur sous une réécriture du proxy | 10 fichiers lisent le chemin en supposant `/clans/<id>/…` (menu, onglets du clan, `redirectClanId` du lien « Se connecter ») : leur fournir un chemin normalisé |
| Référencement | Deux adresses pour une même page | La canonique est relative et résolue sur `chickendinner.fr` (`generateMetadata`, `src/lib/seo/page-seo.ts`) : elle reste juste **si `x-pathname` reçoit le chemin interne** (`/clans/3/overview`) ; sinon elle pointe vers `chickendinner.fr/overview`, qui n'existe pas. Canonique sur le sous-domaine écartée : 30 sites distincts pour Google, un sitemap et un robots.txt par hôte |
| Renommage | Aujourd'hui, renommer un sous-domaine ne change que l'adresse d'entrée | Avec des adresses persistantes, tous les liens et favoris partagés cassent : garder l'ancien nom comme alias |
| Tests | Playwright tourne sur `localhost` | Un projet de plus sur `bee.localhost` (Chrome le résout sans configuration) |

Sans effet : les appels `/api/` sont relatifs, aucune route ne vérifie l'en-tête `Origin`, et la CSP
(`src/lib/security/csp.ts`) n'autorise que `'self'`, qui désigne l'origine servie, sous-domaine compris.

### C. Plan, si la décision est prise

Quatre lots, chacun testable et déployable seul :

1. **Session et stockage** — cookies de session et de thème sur `.chickendinner.fr`, déconnexion qui efface les deux
   formes, clan sélectionné déduit de l'hôte sous un sous-domaine. Invisible pour les joueurs ; prérequis des autres
   lots.
2. **Liens d'un clan** — une fonction `clanHref(clanId, chemin)` qui rend `/leaderboard` sous le sous-domaine du clan
   et `/clans/<id>/leaderboard` ailleurs ; elle remplace les 271 liens, avec un contrôle statique dans Vitest sur le
   modèle de `src/lib/ui-conformance.test.ts`.
3. **Réécriture dans le proxy** — pages du clan seulement (`/overview`, `/leaderboard`, `/matches`…) ; `x-pathname`
   reçoit le chemin interne ; chemin normalisé pour les composants qui lisent `usePathname()`. Tout autre chemin du
   sous-domaine garde la redirection actuelle vers le domaine principal.
4. **Canonique et liens sortants** — canonique inchangée sur `chickendinner.fr` ; liens Discord et e-mails par
   `src/lib/short-links.ts`, seul fabricant des liens envoyés hors du site.

Décision à prendre avant le lot 1 : accepter que le cookie de session parte vers tout `*.chickendinner.fr`, noms
d'OVH compris.
