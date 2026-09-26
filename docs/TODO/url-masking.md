# Liens courts — `/m/<match>`, `/t/<tournoi>` et `/j/<joueur>`

> **Spécification — cadrage validé le 2026-09-26, à implémenter**
> *Destiné à l'équipe de développement. Dépend de [chickendinnerfr.md](chickendinnerfr.md) (sous-domaine par clan).*
>
> Première version (2026-09-25) : réécriture transparente sous le sous-domaine du clan et jetons Sqids tirés d'un UUID.
> Revue contre le code le 2026-09-26 : la réécriture transparente est écartée (session, liens internes), l'identifiant
> d'un match n'est pas un UUID mais un **cuid**, et Sqids ne raccourcit ni ne protège un identifiant de 128 bits (§3).

---

## 1. Le besoin

Les liens envoyés hors du site — Discord surtout, e-mails ensuite — pointent vers des chemins longs :

```text
https://chickendinner.fr/clans/2/telemetry/matches/cmuiawkib067x04zz8htx378f/debrief
https://chickendinner.fr/tournaments/<tournoi>/matches/<match>
https://chickendinner.fr/members/42/dashboard
```

Le but : des adresses courtes, lisibles et stables, **sans changer** les adresses du site ni la façon dont il fonctionne.

---

## 2. Décisions

| Sujet | Décision | Date |
|---|---|---|
| Mécanisme | **Redirection 307** d'une adresse courte vers l'adresse canonique. Aucune réécriture transparente | 2026-09-26 |
| Identifiant | **Le cuid tel quel** (`SquadMatch.id`, `Tournament.id`) : ni encodage, ni dépendance, ni migration | 2026-09-26 |
| Sqids / Hashids | **Écarté** (§3.B) | 2026-09-26 |
| Clan d'un match partagé | Porté par le **sous-domaine** du lien quand il est connu ; sinon page de choix (§4.B) | 2026-09-26 |
| Joueurs | **Inclus** : `/j/<joueur>` vers le tableau de bord ; les noms des joueurs deviennent cliquables dans les embeds Discord | 2026-09-26 |
| Adresses actuelles | **Inchangées et définitives** : ce sont les cibles des redirections, et des liens déjà publiés sur Discord | 2026-09-26 |

---

## 3. État au 2026-09-26

### A. Identifiants

| Entité | Clé | Exemple | Longueur |
|---|---|---|---|
| `SquadMatch` | `id` (cuid) | `cmuiawkib067x04zz8htx378f` | 25 |
| `SquadMatch` | `pubgMatchId` (UUID PUBG) | `55d86446-9c45-4a0e-81ee-12ce3456bda4` | 36 — **absent des URL** |
| `Tournament` | `id` (cuid) | — | 25 |
| `ClanMember` | `id` (entier) | `42` | 1 à 5 |

Les liens de débriefing sont construits par `src/lib/match-links.ts` (`matchDebriefPath`,
`matchTournamentDebriefPath`) avec l'id `SquadMatch`.

### B. Pourquoi pas Sqids

- 128 bits exigent au moins 22 caractères en base 62 : un jeton ne peut pas être sensiblement plus court que le cuid
  (25). Le jeton de 11 caractères de la première version était impossible.
- Sqids n'est pas un chiffrement : avec l'alphabet par défaut, n'importe qui décode. Et un cuid n'est de toute façon
  pas devinable — il n'y a rien à cacher.
- Sqids décode aussi des jetons non canoniques : plusieurs adresses mèneraient au même match.

### C. Matchs partagés entre clans

Un `SquadMatch` réunit des membres de **plusieurs clans suivis** dans **3 273 cas sur 20 091** (16 %). Or le
débriefing canonique est propre à un clan (`/clans/<id>/…`, clan mis en avant). Le cuid seul ne suffit donc pas
toujours à choisir la page.

### D. Qui fabrique les liens — crons et workers

| Lien | Fabriqué par | Process | Base de l'URL |
|---|---|---|---|
| Top 1 → débriefing du clan | `discord-top1-embed.ts`, appelé par `notifyTop1IfEligible` (`squad-detector.ts`) | **cron** (synchro des matchs) et web (synchro manuelle) | `getSiteBaseUrl()` : `NEXT_PUBLIC_APP_URL ?? APP_URL` |
| Résultats de tournoi → manche, tournoi | `discord-tournament-embed.ts` | cron et web | idem |
| Invitations, réinitialisation | `auth-service.ts` | web | `APP_URL ?? NEXT_PUBLIC_APP_URL` (ordre **inverse**) |
| Joueurs (Top 1 : escouade ; tournoi : MVP) | mêmes embeds | cron et web | **aucun lien aujourd'hui** : nom en gras seulement |

Les crons et workers ne font que **fabriquer** des liens ; seul le web les **résout**. Conséquences :

1. Fabriquer un lien court ne demande **aucune lecture en base** de plus : le cuid et le clan sont déjà connus au
   moment de l'envoi (le clan est lu pour son nom et son tag : y ajouter `subdomain`).
2. Les quatre services partagent un seul `.env` (`docs/ops/deployment.md`) : la base publique et
   `CLAN_SUBDOMAIN_ROOT` y sont donc cohérentes. Mais **aujourd'hui `APP_URL` et `NEXT_PUBLIC_APP_URL` valent
   `http://localhost:3000` en local** ; en production, les passer à `https://chickendinner.fr` — sinon Discord
   reçoit des liens morts ou pas de lien du tout (base vide → embed sans lien, sans erreur).
3. `NEXT_PUBLIC_APP_URL` est **figée au build** dans le code servi par Next.js : changer de domaine impose de
   reconstruire le web, alors que le cron la relit au démarrage. Une base différente entre web et cron produit des
   liens différents pour le même match.
4. **Ordre de déploiement** : le web (qui résout `/m/…`) avant le cron (qui en publie) ; sinon les premiers liens
   Discord mènent à une 404.
5. Les appels internes du cron vers le web passent par `INTERNAL_APP_URL` (`http://127.0.0.1:3000`) : ni domaine ni
   sous-domaine, donc jamais touchés par la redirection de sous-domaine (qui ignore IP et `localhost`).

---

## 4. Le standard cible

### A. Adresses courtes

| Adresse courte | Redirige (307) vers |
|---|---|
| `/m/<match>` | Débriefing du match pour son clan : `/clans/<clan>/telemetry/matches/<match>/debrief` |
| `https://<sous-domaine>.chickendinner.fr/m/<match>` | Même débriefing, pour le clan de ce sous-domaine |
| `/t/<tournoi>` | `/tournaments/<tournoi>` |
| `/t/<tournoi>/<match>` | Manche du tournoi : `/tournaments/<tournoi>/matches/<match>` |
| `/j/<joueur>` | Tableau de bord du joueur : `/members/<joueur>/dashboard` |

- `<match>` et `<tournoi>` : cuid, validé par `^c[a-z0-9]{20,32}$` avant toute lecture en base.
- `<joueur>` : identifiant `ClanMember`, validé par `^[1-9][0-9]{0,9}$`. Joueur inconnu → 404 ; joueur inactif ou
  parti du clan → redirection quand même (le tableau de bord gère ces cas). L'identifiant est déjà visible dans les
  adresses actuelles (`/members/42/…`) : le lien court n'expose rien de plus. Les droits d'accès restent ceux du
  tableau de bord (connexion exigée hors mode visiteur).
- **Redirection, pas réécriture** : le joueur arrive sur l'adresse canonique — marque-page et partage stables,
  session, liens internes et clan sélectionné intacts.
- Les paramètres de contexte existants (`?period=`, `?fromDate=`) sont transmis s'ils sont présents.

### B. Résolution du clan pour `/m/<match>`

1. Le lien vient d'un **sous-domaine** attribué à un clan dont un membre a joué le match → ce clan.
2. Sinon, **un seul** clan suivi a joué le match → ce clan.
3. Sinon (match partagé, ou sous-domaine sans rapport) → **page de choix** servie sous `/m/<match>` : « Ce match
   concerne plusieurs clans », un lien par clan vers son débriefing. Pas de choix arbitraire.
4. Match inconnu ou cuid invalide → 404 du site (lien de retour vers `/clans`).

Le lien court est résolu par une page serveur normale (`src/app/m/[matchId]/page.tsx`), qui lit la base : **jamais
dans le proxy** (piège n° 4 du CLAUDE.md).

### C. Sous-domaine (amendement de chickendinnerfr.md §4.C)

La spec du sous-domaine ignore le chemin (`smk.chickendinner.fr/<n'importe quoi>` → vue d'ensemble). Exception
unique : **`/m/<match>`** — le proxy redirige alors vers `https://chickendinner.fr/m/<match>?c=<sous-domaine>`, et
la page de résolution applique la règle 1 du §4.B. Le proxy n'interroge toujours pas la base.

### D. Fabrication des liens

- **Un seul module** `src/lib/short-links.ts` : `matchShortUrl({ squadMatchId, clanSubdomain })`,
  `tournamentShortUrl(tournamentId, squadMatchId?)` et `playerShortUrl(memberId)`, à partir d'une **base publique unique** `getPublicBaseUrl()`
  (qui remplace les deux lectures d'environnement actuelles, dans un ordre unique : `APP_URL`, puis
  `NEXT_PUBLIC_APP_URL`).
- Sous-domaine connu **et** `CLAN_SUBDOMAIN_ROOT` défini → `https://<sous-domaine>.<racine>/m/<match>` ; sinon
  `<base>/m/<match>`.
- Base publique absente → pas de lien (comportement actuel), avec un **avertissement** dans les journaux du cron, au
  lieu du silence.
- Emplacements à migrer : embed Top 1 (titre), embed de tournoi (lien du tournoi, replay de la manche). Les liens
  *dans* le site ne changent pas.
- **Joueurs cliquables** : dans le champ « Escouade » du Top 1 et la ligne MVP d'un tournoi, le nom devient un lien
  masqué Discord (`[**Nom**](<lien>)`). Un champ d'embed est limité à 1 024 caractères : la troncature existante
  (« … et N autre(s) ») doit compter la longueur des liens ; au-delà, les derniers noms restent sans lien plutôt que
  d'être coupés. Sans base publique, les noms restent en gras, sans lien.

---

## 5. Plan

1. `src/lib/short-links.ts` et `getPublicBaseUrl()` ; pages `/m/[matchId]`, `/t/[...]` et `/j/[memberId]`
   (redirections, page de choix) ; exception `/m/` dans le proxy du sous-domaine.
2. Embeds Discord sur les liens courts, noms des joueurs cliquables ; `subdomain` ajouté au `select` du clan dans
   `discord-service.ts` (l'identifiant des joueurs y est déjà connu).
3. Production : `APP_URL` et `NEXT_PUBLIC_APP_URL` à `https://chickendinner.fr` dans le `.env` partagé ; build du
   web ; **redémarrer le web, puis le cron et les workers**.
4. Vérifier un lien court réel depuis Discord avant d'annoncer.

Aucune migration, aucune dépendance. Les liens courts vers un clan passent par son sous-domaine dès que
[chickendinnerfr.md](chickendinnerfr.md) est livré ; avant, `/m/<match>` fonctionne sur le domaine principal.

---

## 6. Tests

| Fichier | Contenu |
|---|---|
| `src/lib/short-links.test.ts` | Base publique (ordre `APP_URL` puis `NEXT_PUBLIC_APP_URL`, barre finale retirée, absente → `null`) ; lien de match avec et sans sous-domaine, avec et sans `CLAN_SUBDOMAIN_ROOT` ; lien de tournoi et de manche ; lien de joueur ; cuid encodé |
| `src/lib/short-link-route-contracts.test.ts` | `/m/<match>` : clan unique → 307 vers le débriefing ; `?c=` d'un clan du match → ce clan ; match partagé sans indication → page de choix ; `?c=` d'un clan étranger au match → page de choix ; cuid invalide → 404 sans lecture en base ; match inconnu → 404 ; paramètres de contexte transmis. `/t/…` : 307 vers le tournoi et la manche. `/j/<joueur>` : 307 vers le tableau de bord ; identifiant non numérique, `0` ou trop long → 404 sans lecture en base ; joueur inconnu → 404 |
| `src/lib/discord/*` (existants) | Les embeds portent le lien court ; noms des joueurs en liens masqués ; champ « Escouade » sous 1 024 caractères avec l'escouade la plus longue ; base absente → pas de lien et avertissement |
| Proxy (tests de chickendinnerfr.md) | `smk.<racine>/m/<match>` → `<racine>/m/<match>?c=smk` ; tout autre chemin du sous-domaine → vue d'ensemble |

Recette : un lien Top 1 réel reçu sur Discord (titre et noms des joueurs), un lien vers un match partagé (page de choix), un lien de manche de
tournoi ; ancien lien long déjà publié toujours valide.

---

## 7. Documentation

| Document | Mise à jour |
|---|---|
| [docs/ops/deployment.md](../ops/deployment.md) | `APP_URL` / `NEXT_PUBLIC_APP_URL` en production, rebuild au changement de domaine, ordre de redémarrage web → cron |
| [docs/features/discord-notifications.md](../features/discord-notifications.md) | Liens courts dans les embeds |
| CLAUDE.md | `src/lib/short-links.ts` comme seul point de fabrication des liens externes |
| [docs/sommaire.md](../sommaire.md), [todo.md](todo.md) | Entrée du chantier |

---

## 8. Questions ouvertes

- Étendre aux liens des e-mails (rapports hebdomadaires et mensuels) ? Non inclus : aucun lien long n'y est publié
  aujourd'hui.
