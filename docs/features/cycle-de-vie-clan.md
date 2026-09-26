# Cycle de vie du clan d'un joueur

Comment le site suit l'appartenance de clan des joueurs : détection quotidienne des changements, clan technique `Ungrouped`, promotion, rétrogradation, archivage et journal des mutations.

Livré le 2026-09-20. Plan et historique des décisions : `docs/TODO/todo.md`, section P2 « Cycle de vie du clan d'un joueur ».

---

## 1. Le problème

Un joueur suivi par le site peut quitter son clan PUBG à tout moment. Jusqu'au 2026-09-20, **rien ne le détectait** : la fiche `ClanMember` restait attachée à son ancien clan indéfiniment, faussant les effectifs, les classements et les pages « Adversaires ».

Deux contraintes ont façonné la solution, toutes deux mesurées sur l'API réelle :

### L'API PUBG ne renvoie pas les rosters de clan

`GET /shards/{shard}/clans/{id}/members` répond **404**, et `fetchPubgClanById` renvoie un `memberCount` sans `memberIds`. La comparaison ne peut donc pas se faire clan par clan : elle se fait **joueur par joueur**, par lots de 10.

> `syncClanMembership()` (bouton « Comparer PUBG ») en est la victime : `pubgMembers` est toujours vide, donc tous les membres actifs apparaissent en `inSiteOnly`. Le front le sait et masque la liste (`incompleteRelationships`).

### `attributes.clanId` n'est pas stable

Mesuré sur 540 observations le 2026-09-20 : **environ 5 % des comptes** renvoient des valeurs contradictoires d'un appel à l'autre, en basculant entre un clan réel et la chaîne vide. Ce n'est ni un désalignement de l'API (vérifié par un test de permutation), ni une transition passagère (identique deux heures plus tard).

**Conséquence de conception :** aucune action n'est jamais déclenchée sur une seule observation.

---

## 2. Le clan technique `Ungrouped`

Un clan marqué `Clan.isSystem = true` sert de **parking** : les joueurs sans clan qu'on veut continuer à suivre, et ceux en transition entre deux clans.

| Propriété | Valeur |
|---|---|
| Nom / tag | `Ungrouped` / `UNG` |
| `isSystem` | `true` |
| `isActive` | `true` — ses membres restent synchronisés, c'est tout l'intérêt |
| `pubgClanId` | `null` — il n'a pas de contrepartie PUBG |
| Unicité | Un par `platformShard` |

### Pourquoi `isSystem` et pas le nom

Avant le 2026-09-20, l'identification se faisait par `name === 'Ungrouped'`, recopié à cinq endroits. Un bug rendait ce choix dangereux : `resolvePubgClanForLocalClan()` retombait sur le clan PUBG du **premier membre actif** quand un clan n'avait pas de `pubgClanId` — ce qui est la définition même du parking. `syncTrackedClanStats()` écrivait alors ce clan-là sur `Ungrouped`, qui devenait un clan suivi ordinaire contenant tous les joueurs sans clan.

Trois garde-fous empêchent désormais cela :

1. `resolvePubgClanForLocalClan()` court-circuite sur `clan.isSystem` **avant** la boucle sur les membres.
2. `syncTrackedClanStats()` n'écrit jamais `name` / `tag` / `pubgClanId` sur un clan système.
3. `upsertTrackedClanFromPubg()` filtre sur `isSystem: false` — un vrai clan PUBG nommé « Ungrouped » ne peut pas l'absorber.

`getOrCreateUngroupedClan()` cherche sur `isSystem` + `platformShard`, jamais sur le nom : un parking renommé à la main reste retrouvable, au lieu d'en faire créer un second.

### Créer le clan technique d'un shard

```bash
npx tsx scripts/mark-system-clans.ts --create steam --apply
```

Simulation par défaut, idempotent, et refuse de créer si un clan porte déjà ce nom sur le shard.

---

## 3. La synchronisation quotidienne

Cron `clan_lifecycle_membership_sync`, `45 1 * * *` — quinze minutes avant `daily_sync`, pour que les mouvements soient appliqués **avant** le recalcul des agrégats du matin.

### Déroulé d'un passage

1. **Verrou** : refus de démarrer si un run `ClanLifecycleRun` est encore `running`. Verrou en base, pas en mémoire — le web et le worker sont deux process distincts.
2. **Chargement** des `ClanMember` actifs de clans actifs, clan technique compris.
3. **Interrogation** par lots de **10 maximum** (au-delà, l'API tronque silencieusement).
4. **Comparaison** de l'état observé au clan enregistré.
5. **Confirmation** : un écart écrit une observation ; il faut N observations concordantes pour agir.
6. **Coupe-circuit** : si la part de l'effectif à déplacer dépasse le seuil, le passage est marqué `aborted` et **rien n'est appliqué**.
7. **Application**, seulement si le mode vaut `apply`.

Mesuré le 2026-09-20 : 346 membres, **35 appels**, ~255 s (borné par le quota de 10 req/min).

### La résolution à trois états

`fetchPlayerClan()` renvoie `null` aussi bien pour « pas de clan » que pour « champ absent ». Le module `clan-lifecycle/clan-state.ts` sépare les deux :

| État | Signification | Déclenche une action ? |
|---|---|---|
| `has_clan` | Identifiant de clan exploitable | oui, après confirmation |
| `no_clan` | L'API dit explicitement « pas de clan » (`""` ou `null`) | oui, après confirmation |
| `unknown` | Champ absent, compte absent de la réponse, erreur réseau | **jamais** |

Un compte demandé mais **absent de la réponse** devient `unknown`, jamais « sans clan » — c'est ce qui arrive à un `playerId` invalide, que l'API omet silencieusement.

### La décision en deux niveaux

Exiger la stabilité de la **destination** produisait un résultat arbitraire : selon la valeur sur laquelle tombaient les N derniers appels, le même compte partait vers un clan ou vers le parking, au hasard.

Le départ, lui, est stable. Mesuré sur les deux comptes instables du 2026-09-20 : ils contredisaient leur clan enregistré **12 fois sur 12**, en alternant seulement sur la destination.

1. **Niveau 1 — le départ** (`evaluateDepartureConfirmation`) : « ce joueur est-il encore dans son clan enregistré ? ». Binaire, donc stable. C'est ce niveau qui autorise un mouvement.
2. **Niveau 2 — la destination** (`evaluateConfirmations`) : utilisée seulement si elle est *elle aussi* stable. Sinon le joueur va au parking, qui est fait pour les transitions.

Une observation `unknown` **casse la série** au lieu de la prolonger — sans quoi N réponses dégradées d'affilée passeraient pour une confirmation.

### Ce qui est décidé

| Situation | Action | `source` |
|---|---|---|
| Départ vers un clan **suivi et actif** | Transfert automatique | `auto_transfer` |
| Départ vers un clan **inconnu** | Bascule vers le parking + création du clan en attente | `auto_demotion` |
| Départ sans clan | Bascule vers le parking | `auto_demotion` |
| Sortie du parking vers un clan suivi | Promotion | `ungrouped_promotion` |
| Départ vers un clan **archivé** | Bascule vers le parking, **sans** demande de validation (§12) | `auto_demotion` |
| Joueur du parking resté dans un clan **archivé** | Aucun mouvement ; une seule trace `ignored` par archivage (§12) | `player_sync` |
| Écart constaté sans mouvement | — | `player_sync` |

> **Les mouvements automatiques ne sont validés par personne.** C'est un choix assumé : la justesse des agrégats prime sur la validation humaine. La contrepartie est qu'ils ne sont jamais silencieux — notification Discord, page publique `/clans/mutations`, et action « annuler » dans le journal SuperUser.

---

## 4. Promotion depuis le parking

Quand un joueur du parking est détecté dans un clan, trois cas :

- **Cas A — clan déjà suivi et actif** → déplacement automatique. La cible a déjà passé la validation, le risque est nul. Gouverné par `ungrouped_auto_promote`.
- **Cas B — clan inconnu** → le clan est créé **`isActive: false`**, un `PlayerClanChange` en `pending` est écrit par membre concerné, et **personne n'est déplacé**. Les demandes sont dédupliquées par identifiant PUBG.
- **Cas C — aucun clan** → le joueur reste au parking. État normal.

Le cas B respecte le garde-fou de `/join` : **un clan n'entre dans la ligue que sur validation SuperUser**. Les mouvements en attente s'appliquent à l'approbation du clan (`applyPendingPromotionsForClan`), et sont clôturés sans déplacement si le clan est refusé.

---

## 5. Les trois façons de faire sortir un joueur

| Geste | Qui | `ClanMember` | Sync PUBG | Agrégats | Rattachement |
|---|---|---|---|---|---|
| **Sortir du clan** (`PATCH`) | Owner | `clanId` → clan système | **maintenue** | retiré | parking |
| **Transférer de clan** (`PATCH`) | SuperUser | `clanId` → cible | maintenue | retiré de A, ajouté à B | clan cible |
| **Arrêter le suivi** (`DELETE`) | SuperUser | `isActive: false`, `clanId` inchangé | **arrêtée** | retiré | clan d'origine |

> **Les trois retirent le membre des agrégats du clan.** `recalculateStatsForClan` filtre sur `{ clanId, isActive: true, joinStatus: 'active' }` : un simple arrêt de suivi suffit déjà à sortir le joueur des totaux, classements et awards. La différence porte sur le **rattachement** : un déplacement re-parente la fiche, donc toutes les vues qui joignent par `member.clanId` réattribuent son passé au nouveau clan.
>
> `KillEvent.clanId` est une colonne figée à l'écriture : les vues basées sur la télémétrie continuent de rattacher le joueur au clan d'origine. Les deux familles de vues divergent après un déplacement — limite connue, non corrigée.

**`DELETE` est réservé au SuperUser** depuis le 2026-09-20 : il coupe la synchronisation PUBG, donc fait disparaître le joueur de l'écosystème. Un Owner qui veut se séparer d'un membre le bascule vers le parking, ce qui garde le suivi actif et laisse une trace.

---

## 6. Archivage du parking

Le parking ne se vide pas tout seul : chaque membre y coûte un appel PUBG par jour, plus sa synchronisation de matchs.

Au-delà de `ungrouped_archive_after_days` jours d'inactivité, un membre devient **candidat**. Le cron **marque**, le SuperUser **décide** — sauf si `ungrouped_auto_archive` est activé.

Archiver pose `isActive: false` + `archivedAt` + `archivedReason: 'ungrouped_inactive'`. La raison est ce qui distingue une purge d'un arrêt de suivi ordinaire, qui pose le même `isActive`. La réactivation ne concerne **que** ce que la purge a désactivé.

Un membre **sans aucun match connu** est inclus : jamais joué depuis qu'il est suivi, c'est le cas le plus coûteux et le moins utile à garder actif.

---

## 7. Journal des mutations

Toute décision écrit une ligne `PlayerClanChange`, **dans la même transaction que le mouvement** — sinon on obtient soit un mouvement sans trace, soit une trace sans mouvement.

### Statuts

| Statut | Signification |
|---|---|
| `observed` | Écart constaté, en cours de confirmation. Aucun mouvement |
| `pending` | Attend la validation d'un clan (cas B) |
| `applied` | Mouvement réellement effectué |
| `ignored` | Série interrompue, ou ligne devenue caduque |
| `reverted` | Mouvement annulé depuis le journal |

### Annulation

Trois règles, destinées à empêcher une annulation de restaurer un état faux :

1. **Seul le dernier mouvement appliqué d'un membre est annulable** — sinon on écraserait un mouvement plus récent (`superseded`).
2. **L'état courant doit correspondre** à ce que le mouvement a posé (`state_mismatch`).
3. **Rien n'est effacé** : l'original passe à `reverted`, une ligne inverse `manual_revert` est écrite.

La route renvoie **409** en cas de refus : la requête est bien formée, c'est l'état qui s'y oppose.

### Deux vues

- **`/clans/mutations`** — visible par tout membre connecté, n'expose que les mouvements réellement survenus (`applied`, `reverted`).
- **Onglet « Mutations » de `/settings/clan-lifecycle`** — SuperUser, **tous statuts**, avec les actions « Annuler » et « Marquer comme vu ». C'est là qu'on comprend *pourquoi* un mouvement n'a pas encore eu lieu.

### Deux actions qu'il ne faut pas confondre

| Action | Effet | Modifie les données ? |
|---|---|---|
| **Annuler** | Replace le joueur dans son clan précédent et écrit une ligne inverse | **oui** |
| **Marquer comme vu** | Sort le mouvement de la file de relecture | **non** |

Le compteur « mouvements à relire » en tête de page ne compte que les mouvements `applied` **non encore marqués comme vus**. Il sert de file de travail : quand le cron déplacera des joueurs automatiquement, le compteur montera ; on passe en revue, on marque comme vu ce qui est normal, on annule le reste.

> Le nom technique reste `acknowledge` côté API et `acknowledgedAt` en base. Le libellé « Acquitter » avait d'abord été retenu, puis remplacé le 2026-09-20 : il venait du vocabulaire de supervision et n'était pas compris à l'usage. Une légende rappelle la distinction directement sur l'onglet.

---

## 8. Réglages

Tous dans `AppConfig`, éditables depuis l'onglet « Paramètres » de `/settings/clan-lifecycle`, sans redéploiement.

| Clé | Rôle | Défaut |
|---|---|---|
| `clan_lifecycle_mode` | `observe` (journalise sans appliquer) ou `apply` | **`observe`** |
| `clan_lifecycle_confirmations_required` | Passages quotidiens concordants avant d'agir | `3` |
| `clan_lifecycle_max_moves_ratio` | Coupe-circuit, en % de l'effectif | `10` |
| `clan_lifecycle_discord_webhook_url` | Salon d'administration, **global** | vide |
| `ungrouped_archive_after_days` | Seuil d'inactivité du parking | `90` |
| `ungrouped_auto_archive` | Archive sans validation | `false` |
| `ungrouped_auto_promote` | Promotion automatique (cas A) | `true` |

Toute valeur par défaut est la plus prudente : une base indisponible ne peut pas faire basculer le cron en `apply`.

### Mise en service

```bash
# Etat courant
npx tsx scripts/set-clan-lifecycle-config.ts --show

# Passage manuel (respecte le mode configure)
npx tsx scripts/run-clan-lifecycle-sync.ts

# Bascule en application — decision qui engage
npx tsx scripts/set-clan-lifecycle-config.ts --mode apply
```

Séquence recommandée : `observe` → laisser passer N cycles → **relire les écarts confirmés à la main** → `apply`.

---

## 9. Fichiers

| Fichier | Rôle |
|---|---|
| `src/lib/clan-lifecycle/clan-state.ts` | Résolution à trois états, lots plafonnés, complétude |
| `src/lib/clan-lifecycle/safety.ts` | Confirmations, départ, coupe-circuit — fonctions pures |
| `src/lib/clan-lifecycle/config.ts` | Les 8 clés `AppConfig` |
| `src/lib/clan-lifecycle/membership-sync.ts` | Le passage quotidien |
| `src/lib/clan-lifecycle/pending-promotions.ts` | Mouvements différés à l'approbation d'un clan |
| `src/lib/clan-lifecycle/revert.ts` | Annulation et marquage « vu » |
| `src/lib/clan-lifecycle/ungrouped-archive.ts` | Candidats, archivage, réactivation |
| `src/lib/clan-lifecycle/discord-notifier.ts` | Notification des mouvements automatiques |
| `src/lib/clan-lifecycle/clan-decision-email.ts` | Email d'acceptation / refus d'un clan |
| `src/lib/player-clan-change.ts` | Écriture du journal, constantes de `source` et `status` |
| `src/lib/player-clan-identity.ts` | Réalignement du miroir adversaire après un mouvement (§11) |
| `scripts/resync-player-clan-identity.ts` | Réparation des décalages déjà en base (§11) |
| `src/lib/clan-archive-state.ts` | États actif / en attente / archivé d'un clan, clauses et constantes (§12) |
| `src/lib/clan-archive.ts` | Arrêt de suivi et réactivation d'un clan (§12) |

**Tests** : `src/lib/clan-lifecycle/*.test.ts` (safety, membership-sync, promotion, revert, discord-notifier), `src/lib/system-clan-protection.test.ts`, `src/lib/member-clan-move-permissions.test.ts`, `src/lib/clan-contact-email.test.ts`, `src/lib/player-clan-identity.test.ts`, `src/lib/encountered-player-resolution.test.ts`,
`src/lib/clan-archive.test.ts`, `src/lib/clan-archive-route-contracts.test.ts`.

---

## 10. Limites connues

- **Le clignotement de `attributes.clanId` n'est pas expliqué**, seulement contourné. Le taux de 5 % est mesuré sur 40 comptes et deux passages ; la valeur `N = 3` est calibrée sur des passages rapprochés, pas sur des passages quotidiens. `npm run clanid:instability` accumule les observations pour affiner.
- **Un mouvement re-parente tout l'historique** du membre, alors que `KillEvent.clanId` reste figé : les vues télémétrie et les vues statistiques divergent après un déplacement.
- **La passe hebdomadaire sur les coéquipiers fréquents** (comptes non suivis croisés en match) n'est pas implémentée — elle parcourrait `EncounteredPlayer` (1,64 M lignes) et demande un compteur pré-calculé.
- **`syncClanMembership()` reste en place** mais ne produit rien d'exploitable, faute de roster côté API.

---

## 11. Le miroir « adversaire » — propagation d'un changement de clan

### Le constat

Le 2026-09-22, `WESTEN88` apparaît **simultanément** :

- sur `/settings/clan-lifecycle` — promu de `[UNG]` vers `[47R]`, statut `applied` ;
- sur `/clans/12/members` — seul joueur de `47RONIN47`, ce qui est correct ;
- sur `/settings/opponents` — « candidat détecté » de **BOFTEAM**, avec un bouton
  « Ajouter à l'effectif » actif.

Les trois écrans disent vrai *par rapport à la table qu'ils lisent*. Le problème
n'est pas une page, c'est que **le même fait est stocké trois fois** et qu'un seul
des trois était tenu à jour.

### Les trois miroirs du même fait

| Où | Écrit par | Lu par |
|---|---|---|
| `ClanMember.clanId` → `Clan` | Cycle de vie (§3–§5), transfert manuel, `/join` | Tout le site « clan suivi » |
| `Player.opponentClanId` → `OpponentClan` | Résolution des joueurs croisés | `/settings/opponents`, rejeu, débrief |
| `EncounteredPlayer.pubgClanId/Tag/Name` | Capture télémétrie + résolution | `/clans/[id]/telemetry/opponents`, némésis, triage |

`Player` et `EncounteredPlayer` décrivent le clan **PUBG** du compte ; `ClanMember`
décrit le clan **suivi sur le site**. Quand le cycle de vie déplace un membre, il
vient précisément de mesurer le clan PUBG auprès de l'API — mais il n'écrivait que
la première ligne du tableau.

### Pourquoi le décalage ne se résorbait jamais

La résolution des joueurs croisés possède une fenêtre de fraîcheur de 7 jours
(`PLAYER_CLAN_RESOLUTION_FRESHNESS_DAYS`) : un compte résolu récemment n'est pas
redemandé à l'API. Or `captureEncounteredPlayers` repoussait `Player.clanResolvedAt`
à chaque rencontre d'un membre suivi **sans jamais réécrire `Player.opponentClanId`**.

La fenêtre n'expirait donc plus, le cache restait « frais » indéfiniment, et il
réécrivait l'ancien clan sur toutes les lignes `EncounteredPlayer` du compte à
chaque passage. Mesuré sur WESTEN88 : 18 lignes `EncounteredPlayer`, toutes à
`BOFS`, sur 18 clans observateurs différents.

### Ce qui a été corrigé

**1. Un point unique de propagation** — `src/lib/player-clan-identity.ts` :

- `syncOpponentIdentityForMember({ pubgAccountId, platformShard, clan })` — upsert
  de l'`OpponentClan`, réécriture de `Player`, puis de **toutes** les lignes
  `EncounteredPlayer` du compte (un compte n'a qu'une appartenance, quel que soit
  le nombre de clans qui l'ont croisé) ;
- `syncOpponentIdentityForMemberId(memberId)` — variante « après mouvement » qui
  recharge le membre.

**Appelé hors transaction, volontairement.** Le miroir est un cache de lecture, pas
une trace d'audit : un échec d'écriture ne doit pas annuler un mouvement déjà
décidé. Il est donc journalisé (`console.warn`), jamais propagé — contrairement à
`recordPlayerClanChange`, qui reste dans la transaction du mouvement (garde-fou C).

**2. Tous les chemins d'écriture l'appellent** :

| Chemin | Fichier |
|---|---|
| Cron d'appartenance, mouvement appliqué | `clan-lifecycle/membership-sync.ts` |
| Promotion différée à l'approbation d'un clan | `clan-lifecycle/pending-promotions.ts` |
| Annulation depuis le journal | `clan-lifecycle/revert.ts` |
| Transfert / rétrogradation manuels | `PATCH /api/members/[id]` |
| Arrêt de suivi (soft delete) | `DELETE /api/members/[id]` |
| « Suivre ce joueur » / « Ajouter à l'effectif » | `POST /api/settings/opponents/track` |
| Capture télémétrie et résolution | `encountered-players.ts`, `encountered-player-resolution.ts` |

**3. Le clan suivi prime sur le cache.** Dans
`resolveOneEncounteredPlayerCandidate`, la vérification « ce compte est-il membre
d'un clan suivi ? » passe désormais **avant** la lecture du cache `Player`, et non
après. Coût : un `findFirst` indexé de plus par candidat
(`idx_clan_member_pubg_account`). Gain : un décalage qui ne se résorbait jamais seul.

**4. Le parking n'est pas une réponse.** Le raccourci ne s'applique que si le clan
suivi porte un vrai `pubgClanId`. Un membre garé dans `Ungrouped` ne signifie pas
« ce compte n'a aucun clan PUBG », mais « le site n'a pas d'avis » : l'API doit
trancher, sinon on perdrait la découverte du clan non suivi qu'il vient peut-être
de rejoindre. En revanche, un mouvement **appliqué** vers le parking vient, lui,
de mesurer l'absence de clan : le miroir est alors remis à `null`.

### Le garde-fou côté action

Le bouton « Ajouter à l'effectif » appelait `POST /api/settings/opponents/track`,
qui faisait un `update` inconditionnel de `ClanMember.clanId`. Sur un candidat
fantôme, il aurait **sorti `WESTEN88` de `47R` pour le mettre dans BOFTEAM**, sans
confirmation et sans ligne de journal — un dégât réel causé par un affichage périmé.

Deux corrections indépendantes du miroir, pour que le cas ne puisse pas se
reproduire même si le miroir dérive à nouveau :

- `GET /api/settings/opponents/clans/[clanId]/members` expose `trackedElsewhere`
  (membre actif d'un **autre** clan suivi). L'UI affiche alors un badge
  « Membre de `[TAG]` » au lieu du bouton — symétrique de ce que le tableau 2
  faisait déjà pour les joueurs d'un clan adverse.
- `POST /api/settings/opponents/track` renvoie **409 `member_tracked_elsewhere`**
  avec le clan courant. Le déplacement n'a lieu qu'avec `confirmMove: true`, et il
  écrit alors une ligne `PlayerClanChange` (`source: manual_transfer`) — il
  apparaît donc dans `/settings/clan-lifecycle` et reste annulable.

### Réparer les décalages déjà en base

Le code corrigé empêche les nouveaux décalages ; il ne répare pas l'existant.

```bash
npx tsx scripts/resync-player-clan-identity.ts                  # simulation (défaut)
npx tsx scripts/resync-player-clan-identity.ts --only=conflict  # les contradictions seules
npx tsx scripts/resync-player-clan-identity.ts --apply
```

Trois classes, d'urgence décroissante :

| Classe | Situation | Gravité |
|---|---|---|
| `conflict` | Le miroir nomme un clan, le clan suivi en nomme un autre | Le miroir énonce un fait **faux** (cas WESTEN88) |
| `cleared` | Le miroir nomme un clan, le membre est au parking | Le cycle de vie a mesuré « plus de clan PUBG » |
| `filled` | Le miroir est vide, le clan suivi nomme un clan | Rien de faux, juste une résolution jamais faite |

Mesure du 2026-09-22 avant correction : **2 `conflict`, 3 `cleared`, 15 `filled`**.

### Ce qui n'est volontairement pas couvert

- **`KillEvent.clanId` reste figé** au clan du moment du kill. C'est voulu : un kill
  appartient à l'histoire, pas à l'effectif courant. C'est la limite déjà notée en
  §10 (« un mouvement re-parente tout l'historique »).
- **Les compteurs de rencontre** (`ClanEncounter`, `EncounteredPlayer.encounterCount`)
  ne sont pas réattribués : ils comptent des rencontres passées, pas une appartenance.
- **`/clans/[clanId]/telemetry/opponents` et la page némésis** lisent `EncounteredPlayer`
  sans cascade vers `ClanMember`. Elles bénéficient du correctif par ricochet (les
  lignes sont réécrites), mais n'ont pas de repli si le miroir dérive — contrairement
  au rejeu et au débrief, qui appliquent déjà la cascade
  `EncounteredPlayer < Player < ClanMember`. À aligner si le besoin se confirme.

### Tests

`src/lib/player-clan-identity.test.ts` — écriture du miroir, remise à `null` au
parking, effacement sur membre désactivé, échec journalisé sans propagation,
`trackedElsewhere` exposé par l'API, 409 sans confirmation, mouvement **et** trace
avec confirmation.

`src/lib/encountered-player-resolution.test.ts` — le clan suivi prime sur un cache
`Player` encore frais mais périmé (régression WESTEN88), et le parking ne
court-circuite pas l'appel API.

`src/lib/clan-lifecycle/{membership-sync,promotion,revert}.test.ts` — chaque
mouvement appliqué déclenche le réalignement.

---

## 12. Arrêt de suivi d'un clan — clans archivés

Spécification complète et historique : [docs/TODO/clan-archive.md](../TODO/clan-archive.md).

Un clan en attente de validation et un clan qu'on ne suit plus ont tous deux `isActive = false`. Depuis le
2026-09-25, `Clan.archivedAt` les distingue :

| État | Condition | Où le voir |
|---|---|---|
| Actif | `isActive = true` | `/clans`, classements, Observatoire |
| En attente | `isActive = false`, `archivedAt` vide | Cycle de vie → « Clans en attente » |
| Archivé | `isActive = false`, `archivedAt` renseigné, `archivedReason` = `unfollowed` ou `rejected` | Cycle de vie → « Clans archivés » |

**Arrêter le suivi** (`PATCH /api/settings/clans/[id]`, SuperUser) : depuis « Vos clans suivis » dans
l'Observatoire, ou depuis la zone de danger des paramètres du clan. Un clan vide s'archive sur simple
confirmation ; sinon il faut choisir le sort des membres actifs :
- `ungrouped` → parking du shard de chaque membre, une ligne `manual_demotion` par membre ;
- `deactivate` → fiches désactivées, `archivedReason: 'clan_unfollowed'` (à distinguer de `ungrouped_inactive`, §6).

Rien n'est supprimé, et le miroir adversaire n'est pas touché : le clan PUBG des joueurs n'a pas changé.

**Refuser** une demande de clan l'archive (`rejected`) : il quitte la liste d'attente. Une nouvelle demande `/join`
visant ce clan le remet en attente. En revanche, une demande visant un clan dont le suivi a été arrêté est refusée
(409 `CLAN_NOT_FOLLOWED`).

**Réactiver** (onglet « Clans archivés », « Suivre ce clan », zone de danger) remet le clan en service sans
réintégrer ses anciens membres : le passage quotidien promouvra ceux du parking s'ils sont toujours dans le clan
PUBG (§4, cas A).

**Dans le passage quotidien** (§3) : un clan archivé n'est jamais une cible ni une nouvelle demande. Un joueur du
parking resté dans un clan archivé n'est plus en écart : sa série d'observations est close, et une seule ligne
`ignored` est écrite par archivage. Avant ce changement, un joueur du parking dont le clan PUBG était un clan
connu mais inactif accumulait une observation par nuit, sans fin.

**Valider** (`approve`) un clan archivé est refusé (409) : cela réactiverait son ancien Owner et des promotions
closes. La réactivation a sa propre action.

## 13. Sous-domaine du clan

Spec : [docs/TODO/chickendinnerfr.md](../TODO/chickendinnerfr.md). Chaque clan actif (hors clan système) reçoit un
sous-domaine unique (`Clan.subdomain`) — `smk.chickendinner.fr` redirige vers sa vue d'ensemble.

- **Attribution** (`src/lib/clan-subdomain-service.ts`, `ensureClanSubdomain`) : à la **validation** d'un clan
  (`approve`), à la **création** d'un clan suivi depuis PUBG et à la **réactivation** d'un clan archivé. Jamais sur
  un clan en attente. Elle ne fait jamais échouer l'activation : un oubli se rattrape par
  `scripts/backfill-clan-subdomains.ts`.
- **Règle** : le tag en minuscules s'il est valide, non réservé, libre et porté par ce seul clan actif ; sinon le
  nom normalisé ; sinon un suffixe `-2`, `-3`… Deux clans actifs au même tag n'ont ni l'un ni l'autre le tag seul.
- **Stabilité** : un changement de tag ou de nom ne modifie pas le sous-domaine. Un clan archivé garde le sien (il
  redirige vers `/clans` tant que le clan n'est pas réactivé).
- **Modification** : réservée au SuperUser, dans les paramètres du clan (« Adresse du clan »). L'ancien
  sous-domaine est libéré immédiatement.
