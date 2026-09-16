# Performance de la base — mesurer avant d'indexer

Ce document consigne l'état **mesuré** de la base MariaDB de production, les décisions prises à partir de ces mesures, et la procédure pour les compléter. Il répond à une question simple : *faut-il ajouter des index ?* Réponse au 2026-09-15 : **non, pas à l'aveugle** — les mesures montrent un goulot mémoire et une requête qu'aucun index ne corrige, et la table la plus sollicitée est déjà sur-indexée.

> ⚠️ `DATABASE_URL` vise la base de **production** (`smk.arkium.group`, base `pubg_clan_smk`). Toute écriture — variable serveur, index, migration — est un acte de production. Voir aussi la procédure de migration dans `CLAUDE.md` (lecture du `migrate diff` obligatoire).

---

## 1. État mesuré (2026-09-15, uptime 3,1 jours)

| Indicateur | Valeur | Lecture |
|---|---|---|
| Serveur | MariaDB 10.11.14 (Ubuntu 24.04) | |
| `innodb_buffer_pool_size` | **128 Mo** (valeur par défaut) | ~16 Go de données : les index ne tiennent pas en mémoire |
| Lectures buffer pool servies par le disque | 2,36 % — **46,7 millions** de lectures disque | conséquence directe du point précédent |
| Requêtes > 10 s (`Slow_queries`) | **314**, soit ~103 / jour | alors que le journal des requêtes lentes était éteint |
| Parcours complets de table (`Select_scan`) | 446 648 sur 7,6 M requêtes | |
| Tables temporaires sur disque | 447 sur 27 676 | |
| `slow_query_log` / `performance_schema` / `userstat` | OFF / OFF / OFF | aucune visibilité avant le 2026-09-15 |

**Plus grosses tables**

| Table | Lignes | Données | Index | Index ÷ données |
|---|---|---|---|---|
| `SquadMatchTelemetry` | 7 622 | 13 427 Mo | 3 Mo | — (JSON hors page) |
| `EncounteredPlayer` | 1 642 613 | 374 Mo | **1 129 Mo** | **3,0** |
| `ClanEncounter` | 1 635 860 | 195 Mo | 381 Mo | 2,0 |
| `Player` | 431 557 | 83 Mo | 145 Mo | 1,8 |
| `PubgApiCallLog` | 326 956 | 63 Mo | 58 Mo | 0,9 |
| `PositionMetricCell` | 161 553 | 24 Mo | 73 Mo | 3,0 |

`SafeZonePhaseStat` (2026-09-16) évite de relire la colonne JSON `phaseSnapshots` pour le cercle moyen de la page
Positions : ~8 lignes par match (~115 000 lignes attendues une fois rattrapée), cercle moyen du clan 1 sur Erangel
mesuré à 70–120 ms contre 340–670 ms en lecture JSON.

### Requêtes vérifiées avec `EXPLAIN`

| Requête | Plan | Verdict |
|---|---|---|
| Débriefing / replay : `EncounteredPlayer WHERE pubgAccountId IN (…)` | `range` sur `(pubgAccountId, platformShard, clanResolvedAt)`, ~30 lignes | ✅ indexée |
| `KillEvent WHERE squadMatchId = ?` | `ref` sur `KillEvent_squadMatchId_idx` | ✅ indexée |
| Heatmap kills (`JSON_EXTRACT(t.summary, …)` sur les matchs d'un clan) | sous-requête matérialisée sur `ClanMember` + `SquadMember`, `eq_ref` sur la télémétrie | ✅ indexée |
| Cron de résolution des adversaires (`GROUP BY` identité + tri sur agrégats) | ~821 000 lignes examinées, `Using temporary; Using filesort` | ❌ **aucun index ne corrige un tri sur agrégats** → corrigé par la forme de la requête (§3.2) |
| Sélection « coéquipiers fréquents » (plan de détection des changements de clan) | parcours complet d'index, 1,64 M lignes | ⚠️ exigera un compteur pré-calculé avant implémentation |

---

## 2. Méthode — `scripts/db-health.ts`

```bash
npx tsx scripts/db-health.ts status                          # lecture seule
npx tsx scripts/db-health.ts enable --yes --long-query-time=2  # active les mesures
npx tsx scripts/db-health.ts report --days=7 --top=15        # lecture seule
npx tsx scripts/db-health.ts disable --yes                   # restaure slow log OFF, seuil 10 s, sortie FILE, userstat OFF
npx tsx scripts/db-health.ts reset-log --yes                 # vide mysql.slow_log après analyse
```

`enable` positionne, au niveau **global** du serveur :

| Variable | Valeur | Effet |
|---|---|---|
| `log_output` | `TABLE` | le journal lent est lisible en SQL (`mysql.slow_log`) — pas besoin d'accès au système de fichiers du serveur |
| `long_query_time` | `2` | seuil du journal lent |
| `slow_query_log` | `ON` | |
| `userstat` | `ON` | alimente `information_schema.INDEX_STATISTICS` et `TABLE_STATISTICS` (lectures par index et par table) |

**Mesures actives depuis le 2026-09-15.** Pièges à connaître :

- **Non persistant** : un redémarrage de MariaDB ramène la configuration du `my.cnf` (et remet les statistiques `userstat` à zéro). Relancer `enable` si nécessaire.
- **`long_query_time` est copié à l'ouverture de chaque connexion.** Les connexions déjà ouvertes (pool Prisma de l'application en production) gardent l'ancien seuil de 10 s jusqu'à leur renouvellement ou au redémarrage de l'application. Les requêtes du cron et des scripts lancés après l'activation sont, elles, mesurées à 2 s.
- **`enable` refuse de s'exécuter si `general_log` est actif** : `log_output=TABLE` redirigerait aussi ce journal.
- Le compte doit avoir le privilège `SUPER` (c'est le cas du compte applicatif actuel — voir §5).

`report` fournit :

1. les requêtes lentes regroupées par forme (littéraux remplacés par `?`), triées par **temps total** — c'est ce qui coûte réellement, pas la requête la plus lente isolée ;
2. les index **jamais lus** depuis l'activation de `userstat`, avec leur taille. Les index `_fkey` sont signalés « clé étrangère : non supprimable » : InnoDB les exige tant que la relation existe ;
3. les tables les plus lues et modifiées.

> Un index peut servir rarement : rapport hebdomadaire (lundi 08:00), page SuperUser ouverte ponctuellement, script de backfill. **Ne tirer de conclusion qu'après au moins 7 jours couvrant un lundi**, et vérifier dans le code qu'aucune requête ne dépend de l'index avant de le supprimer.

---

## 3. Décisions prises

### 3.1 Aucun index ajouté

Aucune requête vérifiée ne manque d'index. Ajouter des index sur `EncounteredPlayer` aggraverait les deux problèmes mesurés : plus de pages à garder en mémoire dans un buffer pool de 128 Mo, et des écritures plus lentes à chaque synchronisation (`encountered-players.ts` fait un `upsert` `EncounteredPlayer` par joueur du lobby, pour chaque clan suivi présent dans le match).

### 3.2 Cron de résolution des adversaires : sélection en deux paliers (2026-09-15)

`encountered_player_clan_resolution` tourne toutes les 30 minutes (`*/30 * * * *`). Chaque passage choisissait ses candidats avec un `GROUP BY pubgAccountId, platformShard` sur **~560 000 lignes** éligibles, trié par `SUM(combatInteractionsCount)`, `COUNT(clanId)`, `SUM(encounterCount)`, `MAX(lastSeenAt)`.

**Mesures avant correction** (production) : sélection **43 à 48 s** à chaque passage ; passage complet 19 min en moyenne, 46 min au pire (l'essentiel étant les appels PUBG, 40 identités par lot) ; 222 806 identités en attente, dont **556 seulement ont une interaction de combat**.

**Correction** (`selectPrioritizedEncounteredPlayerIdentities`, `src/lib/encountered-player-resolution.ts`) :

1. **Palier 1 — exact, à chaque passage.** Les identités ayant au moins une ligne avec `combatInteractionsCount > 0` sont isolées par l'index `(clanResolvedAt, combatInteractionsCount)`, puis regroupées. Le premier critère de tri étant la somme des interactions de combat, ces identités précèdent **toujours** les autres : si elles suffisent à remplir le lot, le résultat est identique à l'ancien calcul.
2. **Palier 2 — classement complet en cache.** Si le lot n'est pas rempli, les 1 000 premières identités du classement complet sont mises en cache (mémoire du processus) pour **6 h au plus**, et chaque passage consomme la suite en **revérifiant** l'éligibilité et les agrégats de chaque identité. Un classement épuisé est recalculé au plus une fois toutes les 10 min.
3. Un critère `pubgAccountId ASC` départage les ex æquo stricts, que MariaDB ordonnait arbitrairement.

**Mesures après correction** (production, lecture seule, même données) :

| Lot | Nouveau | Ancien | Résultat |
|---|---|---|---|
| 40 (taille réelle du cron) | **1,8 s** | 43,4 s | ordre strictement identique |
| 700 (force le palier 2) | 50,2 s au 1er appel (calcul du cache), **3,4 s** ensuite | 48,9 s | ordre strictement identique |

**Seul écart assumé** : une identité *sans* interaction de combat dont la priorité augmente attend le prochain recalcul du classement (6 h au plus). Les identités avec combat restent toujours fraîches.

Le `count` du backlog en fin de passage (1,3 s) est conservé.

### 3.3 Maintenance nocturne non destructive — cron `db_maintenance`

Cron `db_maintenance` (`DB_MAINTENANCE_CRON`, défaut `15 1 * * *`, `src/lib/db-maintenance.ts`) : clôt en `failed` les exécutions restées `running` **plus de 6 h** (plus longue exécution normale observée : 77 min pour `daily_sync`). Au 2026-09-15 : **32 `CronExecution`** orphelines (la plus ancienne du 2026-05-30) et **21 `EncounteredPlayerResolutionRun`** (du 2026-08-16 au 2026-09-14), affichées « en cours » indéfiniment.

Actif après déploiement uniquement : le déploiement de production tourne avec du code plus ancien.

### 3.4 Ce qui n'est volontairement PAS automatisé

L'item « Auto-cleanup cron » du todo prévoyait de supprimer les jobs `queued` > 24 h, les jobs `failed` > 7 j et les captures de plus de 30 jours. Vérification faite, **les trois sont à écarter en l'état** :

| Suppression envisagée | Pourquoi l'écarter | État au 2026-09-15 |
|---|---|---|
| Jobs `telemetry_resync_file` en `queued` > 24 h | un `telemetry:batch -- --all-matches` peut légitimement attendre plusieurs jours | 0 job en attente |
| Jobs `failed` > 7 j | la **dead letter** (`/api/clans/[clanId]/telemetry/dead-letter`) affiche justement les jobs `failed` : elle serait vidée silencieusement | 228 échecs, tous de juin |
| Fichiers `.telemetry-captured` > 30 j | ce sont les **seules copies** de la télémétrie après les 14 jours de rétention du CDN PUBG ; elles servent à re-parser (nouvelles colonnes `killFeedSamples`, `carePackageSamples`, zones d'impact…) | 17 Go, 673 fichiers — sur le poste de développement ; la production n'en a aucun |

À noter : `.next/standalone/.telemetry-captured` contient **les mêmes 672 fichiers** (17 Go), figés au 2026-07-04 — un doublon probablement laissé par un ancien build. Récupérable, mais à décider explicitement.

---

## 4. Recommandations en attente de décision

### 4.1 Mémoire InnoDB — levier n° 1

`innodb_buffer_pool_size` à 128 Mo est la valeur par défaut d'une installation. La valeur usuelle pour un serveur dédié à la base est **50 à 70 % de la RAM** ; si le serveur héberge aussi l'application Next.js et les workers (512 Mo chacun), il faut réserver leur mémoire.

MariaDB 10.11 accepte un redimensionnement **à chaud** :

```sql
SET GLOBAL innodb_buffer_pool_size = 4 * 1024 * 1024 * 1024;  -- exemple : 4 Go
```

…à reporter dans `my.cnf` (`[mysqld] innodb_buffer_pool_size = 4G`) pour survivre à un redémarrage. **Prérequis : connaître la RAM du serveur et ce qu'il héberge d'autre** (`free -m` sur l'hôte) — non accessible depuis SQL. Collecte en lecture seule : `scripts/db-server-diagnostic.sh`, à lancer en root sur l'hôte (Webmin → Outils → Terminal) ; il écrit son rapport dans `/root/diag-mariadb-<date>.txt`, empreintes de mot de passe masquées.

**Hôte mesuré le 2026-09-15 (partie système, sans accès SQL)** — VM KVM Ubuntu (noyau 6.8), **7,6 Gio de RAM**, 4 cœurs, swap 4 Gio (158 Mio utilisés), 3,2 Gio disponibles. **Serveur mutualisé** : Virtualmin/Webmin (~476 Mio), fail2ban (262 Mio), journald (251 Mio), Postfix/Dovecot, BIND, ProFTPD, Dolibarr (PHP-FPM, bases `dolibarr` et `dolibarr_sjlevage`). Aucun réglage MariaDB explicite : `[mysqld]` de `/etc/mysql/mariadb.conf.d/50-server.cnf` est vide.

| Process | RSS mesuré | Plafond |
|---|---|---|
| `mariadbd` | **1,77 Gio** avec un buffer pool de 128 Mio — écart inexpliqué, à analyser (`Memory_used`, `MEMORY_USED` par connexion, `key_buffer_size` et `aria_pagecache_buffer_size` par défaut, fragmentation) | aucun |
| `pubg-clan-site-telemetry-worker` | 1,12 Gio | tas V8 **2 048 Mo**, `MemoryMax=infinity` |
| `pubg-clan-site-telemetry-aggregates` | 302 Mio | tas V8 **2 048 Mo**, `MemoryMax=infinity` |
| `pubg-clan-site-web` / `-cron` | 232 / 159 Mio | aucun |

**Partie SQL (même jour, via `sudo -u mysql mariadb`)** : `Memory_used` = 512 Mio seulement pour 1,77 Gio de RSS, dont 108 Mio déjà en swap ; 81 threads, glibc malloc (ni jemalloc ni tcmalloc). Aux 128 Mio d'InnoDB s'ajoutent deux caches inutiles ici, laissés à leur défaut : `key_buffer_size` 128 Mio (MyISAM, aucune table concernée) et `aria_pagecache_buffer_size` 128 Mio (451 tables temporaires sur disque en 3 jours). Le reste (~1,2 Gio) est de la fragmentation de l'allocateur. `innodb_buffer_pool_chunk_size = 0` = dimensionnement automatique (défaut depuis MariaDB 10.8). 2,5 % des lectures InnoDB vont au disque (49,7 M en 3 jours), 32 connexions ouvertes, pic à 98 sur 151.

Conséquence : dans le pire cas (les deux workers proches de leur plafond de tas), la VM est déjà saturée **sans** agrandir le buffer pool.

**Plan retenu — après le rapport du 2026-09-22** (le redémarrage remet à zéro `INDEX_STATISTICS`) : en un seul redémarrage nocturne, `key_buffer_size = 16M`, `aria_pagecache_buffer_size = 32M`, `MALLOC_ARENA_MAX=2` dans un drop-in systemd de `mariadb.service` contre la fragmentation, `innodb_buffer_pool_size = 1G`, et les réglages de mesure (`slow_query_log`, `long_query_time`, `log_output`, `userstat`) écrits dans `50-server.cnf` pour survivre au redémarrage. Relever avant le `memory.peak` cgroup des quatre services du site.

**Pics cgroup relevés le 2026-09-15** (`memory.peak`, depuis le dernier démarrage de chaque unité) :

| Unité | Démarrée | Pic | Courant |
|---|---|---|---|
| `pubg-clan-site-web` | 14/09 20:35 | 272 Mio | 231 Mio |
| `pubg-clan-site-cron` | 14/09 20:35 | 393 Mio | 151 Mio |
| `pubg-clan-site-telemetry-worker` | 14/09 20:35 | 1 241 Mio | 1 076 Mio |
| `pubg-clan-site-telemetry-aggregates` | 14/09 20:35 | 1 440 Mio | 214 Mio |
| `mariadb` | 12/09 15:34 | **3 706 Mio** | 1 721 Mio |

Lecture : un pic cgroup compte aussi le **cache de fichiers** attribué au service (fichiers de tri, tables temporaires, journaux), récupérable par le noyau. Les 3,7 Gio de MariaDB ne prouvent donc pas une mémoire *anonyme* de cette taille ; la répartition se lit dans `memory.stat` (`anon` / `file`) — à relever avant le redimensionnement. Côté Node, les pics réels (1,2 et 1,4 Gio) restent loin des plafonds de tas de 2 Go. Recommandation révisée : **1 Go** d'abord (8 × 128 Mio), observation d'une semaine (swap, `available`, ratio `Innodb_buffer_pool_reads`), puis 1,5 Go si la marge le permet — pas 2 Go d'emblée. Les données chaudes à mettre en cache sont les index de `EncounteredPlayer`, `ClanEncounter` et `Player` (~2,4 Go de fichiers), pas les JSON de `SquadMatchTelemetry` lus un match à la fois. Comprendre les 1,77 Gio de `mariadbd` avant d'ajouter de la mémoire.

### 4.2 Index de `EncounteredPlayer` — à trancher avec les mesures

11 index secondaires pour 1,1 Go. Chevauchements **structurels** (à confirmer par `INDEX_STATISTICS`, pas à supprimer sur cette seule base) :

| Index | Colonnes | Taille | Remarque |
|---|---|---|---|
| `EncounteredPlayer_pubgAccountId_platformShard_clanResolvedAt_idx` | `pubgAccountId, platformShard, clanResolvedAt` | 193 Mo | **utilisé** par le débriefing, le replay et la résolution (propagation par compte) |
| `idx_encountered_player_name` | `pubgPlayerName` | 124 Mo | recherche par nom (pages adversaires) ? |
| `EncounteredPlayer_playerId_idx` | `playerId` | 93 Mo | lien vers `Player` |
| `EncounteredPlayer_clanId_encounterCount_idx` | `clanId, encounterCount` | 91 Mo | listes par clan triées |
| `EncounteredPlayer_clanResolvedAt_encounterCount_idx` | `clanResolvedAt, encounterCount` | 86 Mo | choisi par le planificateur pour l'ancienne sélection groupée ; **même préfixe** que le suivant |
| `idx_ep_resolution` | `clanResolvedAt, resolveAttempts, encounterCount` | 82 Mo | **utilisé** comme index couvrant par le `count` du backlog (`EXPLAIN` : `Using index`) |
| `EncounteredPlayer_clanResolvedAt_combatInteractionsCount_idx` | `clanResolvedAt, combatInteractionsCount` | 81 Mo | **utilisé** par le palier 1 (§3.2) |
| `EncounteredPlayer_clanId_pubgClanTag_idx` | `clanId, pubgClanTag` | 78 Mo | |
| `idx_ep_last_seen` | `lastSeenAt` | 70 Mo | |
| `idx_ep_resolved_clan` | `clanResolvedAt, pubgClanTag` | 58 Mo | |

Suppression éventuelle : migration additive inverse (`DROP INDEX … , ALGORITHM=INPLACE, LOCK=NONE`), après lecture du `migrate diff`, et vérification dans le code qu'aucune requête n'en dépend.

Observation connexe : `ClanEncounter` (1,64 M lignes, 576 Mo) duplique largement `EncounteredPlayer` dans le cadre de la normalisation des adversaires — sujet de stockage à traiter séparément.

### 4.3 Privilèges du compte applicatif

Le compte utilisé par l'application et les scripts détient des privilèges **globaux** : `SUPER`, `SHUTDOWN`, `FILE`, `CREATE USER` avec `GRANT OPTION`. Une application n'a besoin que de droits sur sa base. Recommandation :

- un compte **applicatif** limité à `pubg_clan_smk` (`SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES, CREATE TEMPORARY TABLES` — suffisant pour Prisma et les migrations) ;
- un compte **d'administration** séparé, réservé aux opérations serveur (`db-health enable/disable`, redimensionnement mémoire).

**Besoins réels vérifiés dans le code (2026-09-15)** :

| Usage | Droits nécessaires | Couvert par la liste ci-dessus |
|---|---|---|
| Prisma, `prisma migrate deploy`, `migrate diff --from-schema-datasource` | DML + DDL sur la base | oui |
| `/api/superuser/database/optimize` (`ANALYZE TABLE`, `OPTIMIZE TABLE`) | `SELECT`, `INSERT` sur les tables | oui |
| `information_schema.TABLES` (page base de données ; la route `telemetry/positions` ne lit plus `COLUMNS` depuis le 2026-09-16) | aucun (filtré sur les tables accessibles) | oui |
| Triggers, vues, procédures, `LOCK TABLES` | — | aucune occurrence dans les migrations ni dans le code |
| `db-health enable`, `disable` (`SET GLOBAL`) | `SUPER` | **non** → compte d'administration |
| `db-health reset-log` (`TRUNCATE mysql.slow_log`) | `DROP` sur `mysql.slow_log` | **non** → compte d'administration |
| `db-health report` (`mysql.slow_log`, `mysql.innodb_index_stats`) | `SELECT` sur ces deux tables | **non** → compte d'administration, ou `GRANT SELECT` ciblé |
| `prisma migrate dev` (base shadow) | `CREATE` global | **non** — ne doit jamais viser la production |

**Pas besoin de changer `DATABASE_URL`** : retirer les droits globaux du compte existant (`REVOKE`) puis lui accorder ses droits sur `pubg_clan_smk.*` conserve son nom et son mot de passe. Les droits globaux d'une connexion déjà ouverte restent acquis jusqu'à sa fermeture : redémarrer le site et les workers juste après, pour constater immédiatement un éventuel manque.

Préalables, à lire dans le rapport de `scripts/db-server-diagnostic.sh` avant toute modification :

1. le compte ne sert à **aucune autre base** que `pubg_clan_smk` (sinon un autre site perdrait l'accès) ;
2. un accès d'administration existe déjà et fonctionne (`root` par socket Unix sur l'hôte suffit pour les opérations locales) ;
3. les `SHOW GRANTS` complets du compte sont sauvegardés dans un fichier lisible par root seul : ils sont ré-exécutables tels quels pour revenir en arrière.

**Constaté le 2026-09-15** : deux comptes `smk@localhost` (le site, 31 connexions, uniquement sur `pubg_clan_smk`) et `smk@87.64.188.203` (le poste de développement), avec les **mêmes droits globaux** : `SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, FILE, SUPER, PROCESS, RELOAD, CREATE USER…` sur `*.*` avec `GRANT OPTION`, plus `ALL` sur `pubg_clan_smk.*` et sur `smk.*` (base inexistante, grant d'origine Virtualmin). Ils peuvent donc lire et modifier les bases Dolibarr (`dolibarr`, `dolibarr_sjlevage`) et `mysql`. Compte d'administration sans mot de passe : **`mysql@localhost`** (socket Unix, `sudo -u mysql mariadb`) ; `root@localhost` est en `mysql_native_password`.

**État au 2026-09-15 soir** : sauvegarde des grants faite (`/root/mariadb-grants-smk-2026-09-15-1810.sql`, 600, 6 lignes) ; le `REVOKE` n'est **pas encore appliqué** — l'assistant du serveur refuse d'exécuter une modification de droits, elle est à lancer par l'utilisateur.

**Décision** : retirer uniquement les droits globaux (`REVOKE ALL PRIVILEGES ON *.*` + `REVOKE GRANT OPTION ON *.*`) des deux comptes `smk`, en conservant leurs droits par base, puis redémarrer les quatre services. Pour que `db-health report` fonctionne encore depuis le poste de développement : `GRANT SELECT` sur `mysql.slow_log` et `mysql.innodb_index_stats` à `smk@87.64.188.203` seul, à retirer après l'analyse des index. `enable`, `disable` et `reset-log` passent par `mysql@localhost` sur le serveur. Les comptes `sjlevage@'%'` et `erp@109.137.144.56` (Dolibarr) restent **inchangés, par décision de l'utilisateur**.

### 4.4 Disque du serveur — prioritaire

`/dev/sda1` (partition unique, porte le datadir) : **48 Go, 92 % utilisés, 4,2 Go libres** au 2026-09-15. `SquadMatchTelemetry.ibd` = 14 Go.

- **Ne pas lancer `OPTIMIZE TABLE SquadMatchTelemetry`** (bouton « compacter » de `/settings/superuser/database`, table ciblée par défaut par `POST /api/superuser/database/optimize`) : InnoDB reconstruit la table dans un nouveau fichier, ce qui exige un espace libre proche de sa taille. Disque plein = MariaDB bloqué pour tous les services de la VM (mail, Dolibarr compris). Même contrainte pour toute migration non `INSTANT` sur cette table.
- Une purge (`DELETE`) ne rend pas l'espace au système mais laisse InnoDB **réutiliser** les pages libérées : elle arrête la croissance du fichier sans reconstruction.
- `data_free` cumulé des 15 plus grosses tables : ~78 Mio — un `OPTIMIZE` ne rendrait presque rien. `ibdata1`, `ibtmp1` et le redo log sont petits ; pas de binlogs (`log_bin=OFF`).
- **Inventaire du 2026-09-15** : `/var/lib` 18 Go (MariaDB), **`/var/log` 11 Go**, `/home` 4,2 Go (application 1,6 Go), `/usr` 3,3 Go, `/root` 2,8 Go, `/swapfile` 4 Go. Récupérable sans perte de données : **`/var/log/proftpd/sftp.log` 7,4 Go** (jamais tourné, contrairement à `proftpd.log`), **journal systemd 3,3 Go**, **`/root/.npm` 2,5 Go** (cache).
- **Nettoyage fait le 2026-09-15 : 11,7 Go libérés, disque à 68 % (16 Go libres).** `sftp.log` compressé en `sftp.log-20260915.gz` (548 Mio) puis vidé, règle `/etc/logrotate.d/proftpd-sftp` créée (hebdomadaire, 8 rotations, `copytruncate`) ; journal systemd plafonné par `/etc/systemd/journald.conf.d/90-size.conf` (`SystemMaxUse=1G`) ; cache `/root/.npm` vidé (résidu d'une commande manuelle : l'application appartient à `smk`). L'avertissement sur `OPTIMIZE TABLE SquadMatchTelemetry` reste valable : 14 Go à reconstruire pour 16 Go libres.
- Observation hors site : `sftp.log` n'avait jamais tourné depuis le 26/01/2025 (74,8 M lignes). Contenu protocolaire normal, sans échec d'authentification, mais ~12 000 sessions sur les 200 000 dernières lignes, toutes d'un client « Go » (synchronisation ou sauvegarde automatisée probable) — à confirmer par l'hébergeur.
- Hypothèse écartée : la production **n'a aucun répertoire `.telemetry-captured`** ; le doublon de 16,76 Go sous `.next/standalone` n'existait que sur le poste de développement (supprimé le 2026-09-15).

### 4.5 Exposition réseau

`mariadbd` écoute sur `0.0.0.0:3306` et `[::]:3306` ; firewalld (zone `public`) ouvre `3306/tcp` **à tout Internet**, en plus d'une règle qui accepte tout depuis `87.64.188.203`. Aucune jail fail2ban ne couvre MariaDB. `Aborted_connects` = 2 268 en 3 jours, dont `Access_denied_errors` = 2 149 (origine inconnue : `userstat` n'était pas encore actif). Depuis son activation, `CLIENT_STATISTICS` ne montre que `localhost` (474 connexions, 4 refus) et `87.64.188.203` (3, 0 refus) : aucune IP externe sur cette fenêtre de quelques heures. Seul compte joignable depuis n'importe quelle IP : `sjlevage@'%'` (droits limités à `dolibarr_sjlevage`). **Pare-feu laissé en l'état le 2026-09-15** (décision de l'utilisateur : ne pas toucher aux comptes Dolibarr, dont l'origine des connexions n'est pas connue). Piste sans impact sur les comptes : une jail fail2ban `mysqld-auth`, après avoir identifié l'origine des échecs (`information_schema.CLIENT_STATISTICS`).

---

## 5. Suivi

| Échéance | Action |
|---|---|
| 2026-09-22 (J+7, couvre le lundi 21) | `npx tsx scripts/db-health.ts report --days=7` ; consigner les résultats ici ; décider des index |
| Au déploiement | vérifier dans les logs `[Cron] DB maintenance — orphaned runs finalized` et la durée des passages de résolution (`/settings/opponents/resolution`) |
| Après analyse | `npx tsx scripts/db-health.ts disable --yes` (ou conserver le journal lent à 2 s si son coût est négligeable) |

## Voir aussi

- [Tâches cron](cron.md) — planification, observabilité, `db_maintenance`
- [Déploiement](deployment.md)
- `CLAUDE.md` — procédure de migration (`migrate diff` avant toute écriture)
