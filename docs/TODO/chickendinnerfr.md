# Sous-domaine par clan — `<clan>.chickendinner.fr`

> **Spécification — cadrage validé le 2026-09-26 ; étapes 1 et 2 du §5 faites le 2026-09-26 (code, migration,
> 29 sous-domaines attribués) ; étapes 3 et 4 (certificat, Nginx, `CLAN_SUBDOMAIN_ROOT`) à faire sur le serveur**
> *Destiné à l'équipe de développement.*
>
> Première version : une note d'opportunité. Revue contre le code et l'infrastructure le 2026-09-26 : le DNS est
> prêt, mais le tag de clan ne peut pas servir de clé (doublons en base), et le sous-domaine « persistant » casserait
> la session et les liens internes (§3).

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
| Sous-domaine persistant (option B, réécriture interne) | **Écarté** : cookie de session à élargir à tous les sous-domaines, liens internes `/clans/<id>/…` à réécrire, clan sélectionné (`localStorage`) perdu d'un sous-domaine à l'autre (§3.C) | 2026-09-26 |
| Clé de correspondance | **Champ dédié `Clan.subdomain`, unique**, et non le tag PUBG : le tag n'est pas unique et peut changer ou être repris (§3.B) | 2026-09-26 |
| Tags en double | Aucun des deux clans ne reçoit le tag seul : chacun reçoit un sous-domaine tiré de son **nom** (§4.B) | 2026-09-26 |
| Sous-domaine inconnu ou réservé | Redirection **temporaire** vers `https://chickendinner.fr/clans` (jamais 301 : le navigateur la mémoriserait) | 2026-09-26 |

---

## 3. État au 2026-09-26

### A. Infrastructure (vérifiée)

| Élément | État |
|---|---|
| DNS `chickendinner.fr` | ✅ pointe vers le serveur de production (217.182.143.43) |
| DNS wildcard `*.chickendinner.fr` | ✅ déjà en place : un sous-domaine inventé résout vers la même adresse |
| Certificat HTTPS | ❌ couvre `chickendinner.fr` seulement : `https://smk.chickendinner.fr` échoue (nom de certificat incorrect) |
| Nginx (1.24, Ubuntu) | ⚠️ à étendre : `server_name` du domaine principal seulement |

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
- **Clan archivé ou désactivé** : son sous-domaine redirige vers `/clans` (sous-domaine conservé, pour une
  réactivation).

### C. Redirection (`src/proxy.ts`)

- Hôte `<x>.chickendinner.fr` (domaine racine lu depuis une variable d'environnement, par exemple
  `CLAN_SUBDOMAIN_ROOT=chickendinner.fr` ; absente → fonctionnalité désactivée, donc sans effet en local) :
  - `<x>` attribué à un clan actif → **307** vers `https://chickendinner.fr/clans/<id>/overview` ;
  - `<x>` inconnu, réservé, ou clan inactif → **307** vers `https://chickendinner.fr/clans`.
- Le chemin du sous-domaine est ignoré (`smk.chickendinner.fr/stats` → vue d'ensemble) : pas de second schéma d'URL.
  Seule exception : `/m/<match>` → `https://chickendinner.fr/m/<match>?c=<sous-domaine>` (lien court de
  débriefing, [url-masking.md](url-masking.md) §4.C).
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
3. **Certificat puis Nginx** sur le serveur ; vérifier `https://smk.chickendinner.fr` avant d'aller plus loin.
4. Définir `CLAN_SUBDOMAIN_ROOT` et redémarrer `web`.

---

## 6. Tests

| Fichier | Contenu |
|---|---|
| `src/lib/clan-subdomain.test.ts` | Normalisation (casse, accents, caractères interdits, tirets), validation (longueur, mots réservés), attribution : tag libre, tag pris → nom, nom pris → suffixe ; les quatre attributions du §4.B |
| `src/lib/clan-subdomain-proxy.test.ts` | Extraction de l'hôte : racine, `www`, `localhost`, IP, sous-domaine ; 307 vers la vue d'ensemble, 307 vers `/clans` si inconnu ou réservé ; fonctionnalité inactive sans `CLAN_SUBDOMAIN_ROOT` ; cache (un seul appel à la route interne par période) |
| Contrat de la route interne | Ne renvoie que les clans actifs non système ; ne renvoie ni nom ni donnée autre que `sous-domaine → id` |

Recette manuelle en production : `smk.chickendinner.fr`, `kilslms.chickendinner.fr`, un sous-domaine inventé,
`www.chickendinner.fr`, en HTTP et en HTTPS ; certificat valide sur chacun.

---

## 7. Documentation

| Document | Mise à jour |
|---|---|
| [docs/ops/deployment.md](../ops/deployment.md) | Certificat wildcard (DNS-01, renouvellement), `server_name` avec wildcard, variable `CLAN_SUBDOMAIN_ROOT` |
| [docs/features/cycle-de-vie-clan.md](../features/cycle-de-vie-clan.md) | Attribution du sous-domaine à l'activation, stabilité au changement de tag |
| CLAUDE.md | Variable d'environnement ; règle « pas de Prisma dans le proxy » rappelée avec la route interne |
| [docs/sommaire.md](../sommaire.md), [todo.md](todo.md) | Entrée du chantier |

---

## 8. Questions ouvertes

- Registrar du domaine : conditionne le plugin `certbot` pour la validation DNS.
- Faut-il montrer l'adresse du clan sur sa vue d'ensemble (lien copiable) ? Proposé, non décidé.
