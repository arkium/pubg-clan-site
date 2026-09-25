# Arrêt de suivi d'un clan — archivage, sort des membres et réactivation

> **Spécification et implémentation**
> *Date : 25 septembre 2026*
> *Statut : ✅ implémenté le 2026-09-25 — migration **appliquée** le même jour, code non déployé (§7)*
> *Origine : ancien §5 de [players.md](players.md), sorti dans ce document après vérification du code.*
> *Destiné au SuperUser et à l'équipe de développement.*

---

## 1. Le besoin

Le site sait **ajouter** un clan au périmètre suivi : « Suivre ce clan » dans `/settings/opponents`, demande
publique `/join`, détection automatique par le cron `clan-lifecycle`. Il ne savait pas **arrêter** de suivre un clan
dissous, inactif ou qu'on ne souhaite plus surveiller, **y compris un clan vide**.

---

## 2. État du code avant ce chantier

### A. Aucun chemin n'existait

Aucune route ni aucun écran ne posait `Clan.isActive = false` sur un clan existant. Le seul levier aurait été un
`UPDATE Clan SET isActive = 0` à la main en base de production — **à ne pas faire**, pour les raisons du §2.C.

### B. Ce que `isActive = false` coupe effectivement

| Effet | Où |
|---|---|
| Plus de synchronisation de matchs | [matches-sync-service.ts:51](../../src/lib/matches-sync-service.ts#L51) |
| Plus de crons de statistiques du clan | [cron-jobs.ts:278](../../src/lib/cron-jobs.ts#L278), [cron-jobs.ts:380](../../src/lib/cron-jobs.ts#L380) |
| Membres du clan exclus du scan `clan-lifecycle` | [membership-sync.ts](../../src/lib/clan-lifecycle/membership-sync.ts) (`loadScannedMembers`) |
| Clan absent des listes de clans : `/api/clans` ne renvoie que les clans actifs, sauf `?all=true` pour un SuperUser, que plus aucun écran n'appelle | [api/clans/route.ts](../../src/app/api/clans/route.ts) |

L'historique n'est pas touché : matchs, duels, tournois restent en place.

### C. Pourquoi ça ne suffisait pas : `isActive = false` signifiait déjà « en attente »

Un clan détecté par le cron ou demandé via `/join` est **créé** avec `isActive = false` et attend la validation du
SuperUser. Désactiver un clan suivi le rendait indiscernable d'une demande en attente :

1. **Le clan archivé réapparaissait dans « Clans en attente »**, où « Valider » l'aurait remis en service.
2. **Aucune réactivation propre** : « Suivre ce clan » retrouvait le clan existant sans toucher à `isActive` et
   répondait « succès ».
3. **Rattachements invisibles** : `ensureTrackedClanForPlayer` (route `track` sans cible, `POST /api/members`,
   setup) rattachait un joueur au clan archivé, hors de toute synchronisation.
4. **Observations sans fin** — *correction du 2026-09-25 : la première version de ce document disait « mouvement
   jamais appliqué », c'était faux.* Un membre d'un clan suivi qui part vers un clan non suivi **est bien renvoyé
   au parking** par le cron. Le vrai défaut venait ensuite : un joueur du parking dont le clan PUBG est un clan
   connu mais inactif produisait **une nouvelle observation `observed` chaque nuit, sans fin**, puisque rien ne
   pouvait conclure l'écart.
5. **Membres gelés** : les membres laissés actifs dans le clan sortaient de tout traitement. D'où l'obligation de
   décider de leur sort au moment de l'archivage.

### D. Le cas du clan vide

C'est le cas simple : aucun membre actif, donc pas de décision sur leur sort. Les points 1 à 4 restaient entiers.

**Ne jamais faire de `DELETE`, même sur un clan vide.** « Vide » veut dire « sans membre actif », pas « sans
données » : `ClanEncounter`, `EncounteredPlayer`, `KillEvent`, `CronExecution`… sont en `onDelete: Cascade` et
partiraient avec le clan.

---

## 3. 🐞 Défaut associé — les clans refusés restaient « en attente »

`POST /api/clans/[clanId]/reject` passait le demandeur en `rejected` et clôturait les promotions en attente, mais
**ne modifiait pas le clan** : il gardait `isActive = false, isSystem = false` et restait donc dans « Clans en
attente » après son refus.

- [x] Vérifié en production le 2026-09-25, en lecture seule (`scripts/check-clan-archive-state.ts`) : **le défaut
      n'a jamais eu d'effet**. Un seul clan inactif non système en base, #375 [RST] RASTAMAN879, détecté par le cron
      le 2026-09-24 et réellement en attente (un mouvement `pending`, aucun demandeur). Aucun refus n'a encore eu
      lieu : le défaut était latent dans le code.
- [x] Corrigé : un refus archive désormais le clan (`archivedAt` + `archivedReason = 'rejected'`). **Aucun
      backfill nécessaire.**

---

## 4. Le modèle retenu — un état « archivé » distinct

Même convention que `ClanMember.archivedAt` / `archivedReason`, déjà en place pour le parking :

```prisma
model Clan {
  // ...
  isActive       Boolean   @default(true)
  archivedAt     DateTime? // renseigné = le clan n'est plus suivi
  archivedReason String?   // 'unfollowed' (décision SuperUser) | 'rejected' (demande refusée)
}
```

| État | Condition | Affiché dans |
|---|---|---|
| Actif | `isActive = true` | `/clans`, classements, Observatoire |
| En attente | `isActive = false` et `archivedAt IS NULL` | `clan-lifecycle` → « Clans en attente » |
| Archivé | `isActive = false` et `archivedAt IS NOT NULL` | `clan-lifecycle` → « Clans archivés » |

Les clauses correspondantes (`PENDING_CLAN_WHERE`, `ARCHIVED_CLAN_WHERE`) et les constantes vivent dans
[clan-archive-state.ts](../../src/lib/clan-archive-state.ts), module sans dépendance : les routes et le cron
l'importent sans tirer l'API PUBG. La migration
[20260925200000_add_clan_archive_fields](../../prisma/migrations/20260925200000_add_clan_archive_fields/migration.sql)
ajoute deux colonnes nullables ; le `migrate diff` contre la base produit exactement ces deux instructions.

### A. Route `PATCH /api/settings/clans/[id]`

[route.ts](../../src/app/api/settings/clans/[id]/route.ts), logique dans
[clan-archive.ts](../../src/lib/clan-archive.ts). Réservée au SuperUser (401 sans session, 403 sinon). `GET` sur la
même route décrit l'état du clan et son nombre de membres actifs, pour la boîte de dialogue.

```jsonc
// Archiver
{ "action": "archive", "membersDisposition": "ungrouped" } // ou "deactivate"
// Réactiver
{ "action": "reactivate" }
```

| Cas | Réponse |
|---|---|
| `action` ou `membersDisposition` inconnue, JSON invalide, identifiant invalide | 400 |
| Clan inconnu | 404 |
| Clan `isSystem` (Ungrouped ne s'archive jamais) | 400 `system_clan` |
| Clan non vide sans `membersDisposition` — aucun choix par défaut silencieux | 400 `disposition_required` |
| **Archiver un clan en attente** — il se refuse, il ne s'archive pas *(règle ajoutée à l'implémentation)* | 409 `clan_pending` |
| **Réactiver un clan en attente** — il se valide *(idem)* | 409 `clan_pending` |
| État changé entre la lecture et l'écriture (double clic, second onglet) | 409 `state_changed` |
| Archiver un clan déjà archivé / réactiver un clan déjà actif | 200, rien n'est réécrit |

Les erreurs ont la forme `{ error: <message affichable>, code }`.

**Archivage** — une seule transaction (état du clan, sort des membres, journal), avec un délai de 30 s : une
écriture de journal par membre, et la base peut être distante.
- **Clan vide** : `membersDisposition` est facultatif et ignoré.
- `ungrouped` : chaque membre actif part vers le clan Ungrouped **de son shard** (`getOrCreateUngroupedClan`,
  résolu avant la transaction), avec une ligne `PlayerClanChange` `manual_demotion` / `applied` /
  `triggeredByUserId`.
- `deactivate` : `isActive = false`, `archivedAt`, `archivedReason = 'clan_unfollowed'`, qui distingue ces fiches
  de la purge du parking (`ungrouped_inactive`) et d'un arrêt de suivi individuel. L'annuaire des joueurs les
  affiche « Suivi arrêté », motif « son clan n'est plus suivi ».
- **Le miroir adversaire (`Player.opponentClanId`) n'est pas resynchronisé** *(décision d'implémentation)* : le
  clan PUBG de ces joueurs n'a pas changé, seul le site a cessé de le suivre. Resynchroniser l'aurait vidé, et
  l'annuaire les aurait affichés « Solo ».
- Pas de notification Discord, comme pour la bascule manuelle vers le parking (chantier 3).

**Réactivation** : repasse `isActive = true` et vide `archivedAt` / `archivedReason`. Les anciens membres ne sont
**pas** réintégrés : ceux du parking seront promus par le cycle de vie s'ils sont toujours dans le clan PUBG (mode
application et promotion automatique actifs), les fiches désactivées se réactivent à la main depuis l'annuaire des
joueurs. Un clan **refusé** peut aussi être réactivé : il devient actif, sans membre.

### B. Ajustements du code existant

| Fichier | Changement |
|---|---|
| [pending-clans/route.ts](../../src/app/api/settings/clan-lifecycle/pending-clans/route.ts) | Filtre `PENDING_CLAN_WHERE` (`archivedAt: null`) |
| [clan-lifecycle/route.ts](../../src/app/api/settings/clan-lifecycle/route.ts) | Compteurs séparés : `pendingClans` et `archivedClans` |
| [archived-clans/route.ts](../../src/app/api/settings/clan-lifecycle/archived-clans/route.ts) | **Nouveau** : liste des clans archivés, avec motif, date et fiches encore rattachées |
| [approve/route.ts](../../src/app/api/clans/[clanId]/approve/route.ts) | 409 `clan_archived` : valider réactiverait l'ancien Owner et des promotions closes |
| [reject/route.ts](../../src/app/api/clans/[clanId]/reject/route.ts) | Archive le clan (`rejected`), en dernière écriture pour qu'un refus interrompu puisse être rejoué ; 409 sur un clan déjà archivé (corrige le §3) |
| [settings/clans/route.ts](../../src/app/api/settings/clans/route.ts) (« Suivre ce clan ») | 409 `clan_archived` avec l'identifiant du clan, au lieu d'un faux succès ; `state: 'pending'` quand le clan attendait déjà sa validation |
| [clan-service.ts](../../src/lib/clan-service.ts) `ensureTrackedClanForPlayer` | Renvoie `null` pour un clan archivé : les appelants se replient sur le clan demandé ou sur Ungrouped |
| [membership-sync.ts](../../src/lib/clan-lifecycle/membership-sync.ts) | Voir ci-dessous |
| [join/route.ts](../../src/app/api/join/route.ts) | **Trouvé à l'audit**, voir ci-dessous |
| [api/clans/route.ts](../../src/app/api/clans/route.ts) | Champ `archivedAt` et commentaire corrigé (`?all=true` renvoie aussi les archivés) |
| [opponents/route.ts](../../src/app/api/settings/opponents/route.ts) | `isSystem` sur les lignes « Vos clans suivis », pour masquer l'action sur Ungrouped |

**Cron `membership-sync`** — les clans archivés sont chargés à chaque passage :
- un joueur **du parking** dont le clan PUBG est archivé est dans l'état attendu, pas en écart : sa série
  d'observations est close, et **une seule** ligne `player_sync` / `ignored` est écrite (dédoublonnée depuis la
  date d'archivage, un nouvel archivage en produit une nouvelle). Elle est visible dans le journal sans s'ajouter
  aux mouvements « à relire », qui ne comptent que les `applied` ;
- un membre d'un clan suivi qui part vers un clan archivé est renvoyé au parking comme vers un clan non suivi, **sans
  demande de validation** ni appel PUBG ;
- un clan archivé n'est jamais une cible.

**Demandes `/join` — trouvé à l'audit.** Le refus archive désormais le clan ; or un demandeur refusé peut refaire
une demande (« Cycle de vie des membres rejetés », 2026-09-06), qui viserait alors un clan que personne ne regarde
plus. Règle retenue (`decideJoinTarget`) :
- **clan refusé** : la demande le remet en attente (`archivedAt` vidé), prévient les SuperUsers et le dit au
  demandeur, dès l'aperçu ;
- **clan dont le suivi a été arrêté** : 409 `CLAN_NOT_FOLLOWED` dès l'aperçu, sans écriture. Une demande de
  joueur ne défait pas une décision SuperUser.

Audit des lectures de `Clan.isActive = false` : `pending-clans`, le compteur du tableau de bord et `/api/clans`
étaient les seuls à supposer « en attente ». Les autres filtrent sur `isActive: true`, ce qui exclut
naturellement les archivés.

### C. Interface

1. **`/settings/opponents`, onglet `Clans`** — colonne « Suivi » du tableau « Vos clans suivis » : bouton **« Ne
   plus suivre »** (absent sur Ungrouped). La boîte de dialogue
   ([ClanArchiveDialog.tsx](../../src/components/clan/ClanArchiveDialog.tsx)) affiche le nombre de membres actifs,
   impose le choix *parking* / *désactivation* quand il y en a, sans présélection, et se réduit à une confirmation
   pour un clan vide.
2. **« Suivre ce clan »** (détail d'un clan adverse) sur un clan archivé : propose sa réactivation ; sur un clan en
   attente, renvoie vers sa validation.
3. **`/clans/[clanId]/settings`** — « Zone de danger » visible du seul SuperUser
   ([ClanFollowDangerZone.tsx](../../src/components/clan/ClanFollowDangerZone.tsx)) : désactiver le suivi (même
   boîte), réactiver un clan archivé, ou lien vers la validation d'un clan en attente.
4. **Liste des clans archivés** — *tranché à l'implémentation* : nouvel onglet **« Clans archivés »** de
   `/settings/clan-lifecycle` (`?tab=archived`), à côté de « Clans en attente » : c'est de la gouvernance, et les
   deux listes sont deux états du même champ. Action « Réactiver le suivi ».
5. **`/join`** : l'aperçu annonce qu'une demande sur un clan refusé le soumet de nouveau au SuperUser.

---

## 5. Tests de contrôle

| Fichier | Tests | Contenu |
|---|---|---|
| [clan-archive.test.ts](../../src/lib/clan-archive.test.ts) | 26 | États, clauses, schéma de requête, archivage (vide, `ungrouped` sur deux shards, `deactivate`, idempotence, état changé, miroir non touché), réactivation, décision `/join`, réouverture |
| [clan-archive-route-contracts.test.ts](../../src/lib/clan-archive-route-contracts.test.ts) | 27 | `PATCH` / `GET /api/settings/clans/[id]` (401/403/400/404/409, messages, journal avec auteur), listes et compteurs du cycle de vie, `approve`, « Suivre ce clan », `ensureTrackedClanForPlayer`, `/join` (aperçu et demande) |
| [clan-lifecycle/membership-sync.test.ts](../../src/lib/clan-lifecycle/membership-sync.test.ts) | +3 | Parking resté dans un clan archivé (une trace, dédoublonnée), départ vers un clan archivé sans demande ni appel PUBG |
| [clan-contact-email.test.ts](../../src/lib/clan-contact-email.test.ts) | +2 | Le refus archive le clan ; 409 sur un clan déjà archivé |

Les routes s'exécutent avec les vrais modules métier ; seuls la base et les services externes sont mockés.
**Chaque nouveau test a été rejoué contre l'ancien code** : les 3 tests du cron et les 10 tests de routes
concernés échouent sans l'implémentation.

**Tests existants relus** : ceux qui construisent des clans `isActive: false` sans `archivedAt` (en attente) restent
verts sans modification d'assertion. Seul le mock Prisma de `clan-contact-email.test.ts` a reçu `clan.update`,
utilisé par le refus (piège n° 9 du CLAUDE.md).

### Recette manuelle

1. Archiver un **clan vide** → confirmation simple ; il disparaît de `/clans` et de l'Observatoire, apparaît dans
   « Clans archivés », **pas** dans « Clans en attente ».
2. Archiver un clan avec membres, option *parking* → les membres sont au parking, le journal des mutations montre
   une ligne `manual_demotion` par membre.
3. Archiver avec l'option *désactiver* → les membres apparaissent « Suivi arrêté » dans l'annuaire des joueurs.
4. Le lendemain, dans le journal : une ligne `ignored` par joueur du parking resté dans ce clan, et une seule.
5. « Suivre ce clan » sur un clan archivé → proposition de réactivation, pas de faux succès.
6. Réactiver depuis « Clans archivés » → le clan revient dans `/clans`, la synchronisation reprend au cron suivant.
7. Refuser un clan en attente → il passe dans « Clans archivés » (motif « demande refusée »). Refaire une demande
   `/join` avec le même joueur → l'aperçu l'annonce, le clan revient dans « Clans en attente ».
8. `/join` sur un clan dont le suivi a été arrêté → message d'erreur dès l'aperçu.
9. Ungrouped : aucune action d'arrêt dans l'Observatoire ni dans ses paramètres.
10. Thèmes clair et sombre, boîte de dialogue sur mobile.

---

## 6. Questions

- [x] Liste des clans archivés : **onglet « Clans archivés » du cycle de vie** (§4.C).
- [x] Clans refusés déjà en base : **aucun**, pas de backfill (§3).
- [x] Notification Discord à l'archivage : **non**, par cohérence avec la bascule manuelle vers le parking, qui ne
      notifie pas non plus. À rouvrir si le salon d'administration doit tout voir.
- [ ] Un Owner de clan (non SuperUser) peut-il demander l'arrêt du suivi de son propre clan ? Aujourd'hui :
      SuperUser seulement.
- [ ] Les demandes d'adhésion en attente (`joinStatus: 'pending'`) d'un clan archivé restent en l'état. Faut-il
      les refuser à l'archivage ?

---

## 7. Implémentation du 2026-09-25

**Non commité, non déployé. Migration appliquée le 2026-09-25** (`prisma migrate deploy`, avec accord explicite),
après lecture du `migrate diff` : exactement les deux `ADD COLUMN`. Après application, le `migrate diff` répond
`-- This is an empty migration.`

| Fichier | Rôle |
|---|---|
| [schema.prisma](../../prisma/schema.prisma) + [migration.sql](../../prisma/migrations/20260925200000_add_clan_archive_fields/migration.sql) | `Clan.archivedAt`, `Clan.archivedReason` |
| [clan-archive-state.ts](../../src/lib/clan-archive-state.ts) | États, clauses, constantes, décision `/join` — sans dépendance |
| [clan-archive.ts](../../src/lib/clan-archive.ts) | Archiver, réactiver, décrire, rouvrir un clan refusé |
| [settings/clans/[id]/route.ts](../../src/app/api/settings/clans/[id]/route.ts), [archived-clans/route.ts](../../src/app/api/settings/clan-lifecycle/archived-clans/route.ts) | Nouvelles routes |
| [ClanArchiveDialog.tsx](../../src/components/clan/ClanArchiveDialog.tsx), [ClanFollowDangerZone.tsx](../../src/components/clan/ClanFollowDangerZone.tsx) | Nouveaux composants |
| [check-clan-archive-state.ts](../../scripts/check-clan-archive-state.ts) | Diagnostic en lecture seule des clans inactifs |
| Fichiers modifiés | Voir §4.B et §4.C |

**Vérifications** :
- `tsc` sans erreur ; ESLint sans erreur sur les nouveaux fichiers, aucun signalement ajouté sur les fichiers
  modifiés ;
- avant la migration, suite Vitest hors les trois tests branchés sur la base : 755 passés, 1 ignoré ;
- **après** la migration, suite complète : **760 passés, 1 ignoré** — les trois tests branchés sur la base créent
  et relisent des clans avec les nouvelles colonnes ; aucun clan de test résiduel ;
- `scripts/check-clan-archive-state.ts` après migration : 1 clan en attente (#375 [RST]), 0 archivé, et les clauses
  de l'application (`PENDING_CLAN_WHERE`, `ARCHIVED_CLAN_WHERE`) donnent les mêmes chiffres.

**Déploiement** : la migration est déjà en base ; le `prisma migrate deploy` de la procédure de déploiement n'aura
rien à faire. Le code actuellement en production ignore les deux colonnes nullables : l'ordre n'a plus d'importance.

**Reste à faire** : la recette du §5 dans un navigateur.
