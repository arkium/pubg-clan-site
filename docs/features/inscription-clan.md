# Inscrire un nouveau clan — de la demande aux données

Le parcours complet d'une nouvelle équipe, de sa demande sur `/join` jusqu'à ses matchs, sa télémétrie et ses
statistiques : qui agit, où cliquer, ce qui se fait seul la nuit et ce qui reste manuel. Établi le 2026-10-19 à partir
du code et des clans inscrits en octobre (FR, GFG, CIVE, GENI).

Détails par brique : [Clans](clans.md) (flux `/join`, rôles), [Cycle de vie](cycle-de-vie-clan.md) (parking,
clans découverts), [Télémétrie](../telemetry/overview.md), [Crons](../ops/cron.md), [Notifications Discord](discord-notifications.md)
(salon d'administration).

---

## 1. Vue d'ensemble

| # | Étape | Qui | Où | Délai |
|---|---|---|---|---|
| 1 | Demande d'inscription | Un joueur du clan | `/join` | — |
| 2 | Décision | SuperUser | Plateforme › Cycle de vie des clans › **Clans en attente** | dès l'alerte |
| 3 | Création du compte Owner | Le demandeur | lien reçu par e-mail → `/activate` | 48 h pour le lien |
| 4 | Entrée des autres joueurs | Owner, joueurs, SuperUser | Paramètres du clan › Membres ; `/join` ; Plateforme › Clans | au fil de l'eau |
| 5 | Import des matchs | Cron 02:00, ou SuperUser à la main | **Mise en route du clan** (ou Plateforme › Tâches planifiées) | **le jour même** (fenêtre PUBG de 14 jours) |
| 6 | Télémétrie | Cron 02:00 si activé, ou SuperUser | **Mise en route du clan** (ou Paramètres du clan › Données › Rattrapages) | après l'étape 5 |
| 7 | Statistiques, caches, ligue | Crons 03:00 à 05:00, worker d'agrégats | rien à faire | nuit suivante |

**À retenir :** la validation n'importe rien. Un clan validé à 14 h n'a aucun match avant le cron de 02:00, aucune
statistique avant 03:00, et les parties de plus de 14 jours sont perdues. Pour un clan qui joue déjà, faire les
étapes 5 et 6 à la main juste après la validation.

**La page qui suit tout ça :** `/settings/clans/[clanId]/mise-en-route` (lien « Mise en route du clan → » dans le toast
de validation, tuile SuperUser des Paramètres du clan, fiche Plateforme du clan, boîte « À traiter »). Elle montre
l'état de chaque étape et porte les deux boutons des étapes 5 et 6. Un clan créé depuis moins de 30 jours dont une
étape obligatoire reste à faire apparaît dans la boîte « À traiter » de l'accueil Plateforme.

---

## 2. Étape 1 — La demande

Le joueur saisit son pseudo PUBG et sa plateforme sur `/join` (`POST /api/join`). Il n'a pas besoin de compte : une
**adresse de contact** est exigée, elle recevra la décision et le lien de création du compte.

- Le site lit le clan PUBG **du joueur** : il ne le choisit pas. Inconnu du site, le clan est créé **inactif**
  (`isActive: false`), avec ses rôles, et le demandeur en devient l'Owner **en attente**.
- Un joueur **sans clan PUBG** crée un « clan » à son propre pseudo (`pubgClanId` vide) : il ne pourra jamais entrer
  dans la ligue. L'alerte Discord le signale.
- Un clan **refusé** auparavant est rouvert par une nouvelle demande et revient dans la file.
- Un clan **arrêté** (archivé hors refus) refuse la demande : seul le SuperUser le réactive.

**Variante — clan découvert.** Le cycle de vie quotidien (01:45) peut créer lui-même un clan inactif quand des joueurs
du parking jouent dans un clan PUBG inconnu ([cycle-de-vie-clan.md](cycle-de-vie-clan.md) §4, cas B). Il n'a ni
demandeur ni Owner : sa validation ne crée aucun compte.

**Qui est prévenu :**

| Canal | Contenu |
|---|---|
| Discord, salon d'administration | `clan_request` (demande) ou `clan_discovered` (découverte), **avec mention** — voir § 9 |
| Notification interne | « Nouveau clan en attente de validation SuperUser », sur la page des notifications de chaque membre lié au compte SuperUser |
| E-mail | Seulement si la préférence e-mail de ce membre est activée (désactivée par défaut) |

---

## 3. Étape 2 — La décision du SuperUser

**Où :** Plateforme › Cycle de vie des clans › onglet **Clans en attente** (`/settings/clans/lifecycle?tab=pending`).
L'onglet affiche un compteur ; le lien de l'alerte Discord y mène directement.

**Vérifier avant de valider :**
- l'**adresse de contact** est bien celle du joueur (le demander en jeu ou sur le Discord du clan) — n'importe qui peut
  demander au nom d'un pseudo qui n'est pas encore membre ;
- le lien **Confrontations** : l'historique du clan contre les clans suivis, s'il en a ;
- l'origine : « Demande /join » ou « Découvert automatiquement ».

**Valider** (`POST /api/clans/[clanId]/approve`) :
1. le clan passe actif et reçoit son sous-domaine (`<clan>.chickendinner.fr`) ;
2. les joueurs du parking en attente de ce clan y sont rattachés (promotions différées du cas B) ;
3. l'Owner en attente est activé ;
4. sans compte, il reçoit l'e-mail de validation avec le **lien de création du compte** (48 h). Sans SMTP, le message
   de retour le dit : renvoyer l'invitation depuis la liste des membres du clan.

**Refuser** (`POST /api/clans/[clanId]/reject`) archive le clan avec la raison « refusé » et prévient le demandeur par
e-mail. Une nouvelle demande le rouvrira.

---

## 4. Étape 3 — Le compte de l'Owner

Le lien mène à `/activate`, puis à l'accueil `/` (« Mon espace »). L'Owner trouve ses outils dans **Paramètres du
clan** (`/clans/[clanId]/settings`) : Membres, Accueil login, Discord, Tournois. Il n'a ni page ni checklist de
démarrage ; l'e-mail ne donne pas de délai pour les premières données.

---

## 5. Étape 4 — Les autres joueurs

**L'API PUBG ne donne pas la liste des membres d'un clan** (l'endpoint répond 404, [cycle-de-vie-clan.md](cycle-de-vie-clan.md)
§1) : rien n'est importé automatiquement. Quatre voies :

| Voie | Qui | Où | Effet |
|---|---|---|---|
| Demande `/join` | Le joueur, puis l'Owner | Paramètres du clan › Membres › **Demandes d'adhésion** | Membre actif ; sans compte, invitation envoyée à l'acceptation |
| Ajout direct | Owner | Paramètres du clan › Membres › **Ajouter un joueur**, puis **Inviter** dans « Membres et invitations » | Membre actif ; l'invitation est un second geste (e-mail ou message Discord à copier) |
| Candidats détectés | SuperUser | Plateforme › Clans, ligne du clan dépliée › **Candidats détectés** › « Ajouter à l'effectif » | Coéquipiers déjà croisés dans les parties du clan, une fois leur clan résolu (cron toutes les 30 min, 2 rencontres au moins) |
| Parking | Cron 01:45 | — | Un joueur du parking dont le clan devient suivi y est promu (mode `apply` et promotion automatique activée) |

Une demande `/join` envoyée **avant** la validation du clan n'a pas d'Owner actif pour y répondre : elle déclenche
l'alerte `orphan_join_request` au SuperUser, qui peut l'accepter lui-même.

> **Deux joueurs au moins.** Une partie n'est retenue (`SquadMatch`) que si **deux membres suivis** jouent dans la
> même escouade. Un clan réduit à son Owner n'a ni télémétrie, ni place dans la ligue.

---

## 6. Étape 5 — Les matchs

- **Automatique :** le cron `daily_sync` (02:00) importe les parties de tous les membres actifs des clans actifs.
- **À la main, tout de suite :** bouton **Synchroniser les matchs** de la mise en route du clan, ou Plateforme › **Tâches planifiées** (`/settings/cron`) › Actions manuelles ›
  **Synchroniser les matchs**, pour le clan choisi. Aucun bouton équivalent côté Owner.
- Import membre par membre : Plateforme › Import de matchs (`/settings/match-import`).

PUBG ne garde les parties qu'**environ 14 jours** : chaque jour d'attente après la validation en fait perdre.

---

## 7. Étape 6 — La télémétrie

- **Automatique :** après le cron de 02:00, jusqu'à 50 parties par clan et par nuit, **seulement si
  `TELEMETRY_SYNC_ENABLED=true`** (état visible dans Plateforme › Configuration, section Télémétrie).
- **À la main :** bouton **Mettre en file** de la mise en route du clan (les urgences de la plus ancienne à la plus récente, puis le reste, 250 parties par appel), ou Paramètres du clan › **Données › Rattrapages** (`/clans/[clanId]/settings/data/recoveries`) :
  « Mettre en file les urgences » (parties de 7 à 14 jours, les premières perdues) puis « Mettre en file le backlog »
  (250 parties par clic). Vue tous clans : Plateforme › Télémétrie (`/settings/telemetry`).
- Le worker télémétrie traite les files de tous les clans, puis met en file le recalcul des agrégats du clan.

**Pièges :**
- « Synchroniser les matchs » (étape 5) **ne met pas** la télémétrie en file, malgré sa description.
- `npm run telemetry:batch` ne relit que des fichiers déjà capturés sur disque : inutile pour un nouveau clan.

---

## 8. Étape 7 — Statistiques et pages

Rien à faire : un clan actif est pris par tous les crons.

| Heure | Ce qui se calcule |
|---|---|
| 03:00 | Classement, distinctions, caches de la vue d'ensemble (awards, matchs, comparateur, quickStats). Avant ce passage, le bloc de statistiques de parties de la vue d'ensemble répond « Stats not ready ». |
| 04:00 | Statistiques carrière (lifetime) |
| 05:00 | Saison, ranked, maîtrise d'armes |
| En continu | Agrégats de télémétrie (worker), après chaque partie analysée |

La **Ligue des clans** exige un `pubgClanId` et un nombre minimum de parties officielles en escouade.

---

## 9. Alertes du SuperUser sur ce parcours

Salon Discord d'administration, réglé dans Cycle de vie des clans › Paramètres ([discord-notifications.md](discord-notifications.md),
« Salon d'administration ») :

| Événement | Quand | Mention |
|---|---|---|
| `clan_request` | Demande `/join` d'un nouveau clan, ou d'un clan refusé | oui |
| `clan_discovered` | Clan inconnu créé par le cycle de vie | oui |
| `orphan_join_request` | Demande d'adhésion à un clan sans Owner actif | oui |
| `daily_digest` | Chaque matin à 9 h, si quelque chose attend — dont les mises en route inachevées | oui |

Une étape oubliée (matchs pas importés, télémétrie pas lancée, joueurs manquants) remonte dans la boîte « À traiter »
de l'accueil Plateforme tant que le clan a moins de 30 jours, et donc dans la veille du matin.

---

## 10. Checklist du SuperUser

1. Alerte Discord reçue → **Clans en attente** : vérifier l'adresse, les confrontations, l'origine → Valider.
2. Cliquer **« Mise en route du clan → »** dans le message de validation.
3. Sur la mise en route : **Synchroniser les matchs**, puis **Mettre en file** la télémétrie.
4. Le lendemain : candidats détectés (lien de l'étape 3 de la page), statistiques calculées — la boîte « À traiter »
   rappelle le clan tant qu'une étape obligatoire reste à faire.

---

## 11. Limites connues

- **Pas d'import de l'effectif** : l'API PUBG ne le fournit pas. « Comparer avec PUBG », montré à l'Owner, ne liste
  donc rien d'exploitable.
- **La validation ne lance aucune synchronisation** : la page de mise en route la propose, mais rien ne guide l'Owner
  après `/activate`.
- **« Synchroniser les matchs » ne met pas la télémétrie en file** (sa description le dit depuis le 2026-10-19) et ne
  recalcule pas les caches de 03:00.
- **Cas B et `/join` :** si `/join` a déjà créé le clan, le cycle de vie n'enregistre pas de promotion différée pour
  les joueurs du parking (`createPendingClanForDetection` trouve le clan et s'arrête) : ils ne seront promus qu'au
  passage suivant la validation.
- **Ajout direct par l'Owner en deux gestes** : ajouter, puis inviter.
- **Passage manuel du cycle de vie** : script seulement (`scripts/run-clan-lifecycle-sync.ts`).

---

## 12. Fichiers clés

| Fichier | Rôle |
|---|---|
| `src/app/api/join/route.ts` | Demande, création du clan inactif, alertes |
| `src/app/api/clans/[clanId]/approve/route.ts`, `reject/route.ts` | Décision du SuperUser |
| `src/components/clan-lifecycle/ClanRequestsSections.tsx` | Onglet « Clans en attente » |
| `src/lib/join-request-access.ts` | Invitation du demandeur sans compte |
| `src/lib/clan-lifecycle/membership-sync.ts` | Clans découverts, promotions du parking |
| `src/app/api/clans/[clanId]/cron-control/route.ts` | Actions manuelles de `/settings/cron` |
| `src/lib/cron-jobs.ts` | `daily_sync`, mise en file de la télémétrie, crons de 03:00 à 05:00 |
| `src/lib/telemetry-recoveries-backlog.ts` | « Mettre en file le backlog » |
| `src/lib/admin-alerts/` | Alertes du salon Discord d'administration |
| `src/lib/clan-onboarding/` | Checklist de mise en route (`build.ts` pur, `service.ts`) |
| `src/lib/admin-inbox/` | Boîte « À traiter » de l'accueil Plateforme et veille du matin |
