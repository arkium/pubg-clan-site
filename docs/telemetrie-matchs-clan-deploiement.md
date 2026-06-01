# Déploiement télémétrie matchs clan

Ce document décrit le plan complet pour déployer tous les axes de la doc télémetrie-matchs-clan, avec la lib a créer/adapter, les migrations, les jobs cron, les APIs et les écrans.

## Objectif

Mettre en production un pipeline télémétrie qui:

1. Récupère les assets télémétrie PUBG pour les matchs importés.
2. Parse les événements utiles pour les membres du clan.
3. Stocke uniquement des agrégats en base.
4. Expose des APIs et des vues pour les nouveaux indicateurs (armes, synergies, style de jeu, positionnement, cercles, loot, véhicules).

## Périmètre fonctionnel

Les points a couvrir en livraison:

- Arsenal et préférences d'armes
- Comportement de jeu (agressif/passif/support)
- Synergies enrichies (revives croisés, co-kills)
- Heatmaps de positions
- Analyse cercles/zone
- Economie de loot
- Statistiques véhicules

## Architecture cible

## Reference externe: pubg.js

Le repo https://github.com/ickerio/pubg.js peut servir de reference de bonnes pratiques pour:

- la modelisation `Match` / `Asset` / `Participant`,
- l'extraction de l'URL telemetrie depuis les assets du match,
- la separation entre appel match et appel telemetrie.

Adaptation imposee a ce projet:

- conserver la gateway rate-limitee existante pour `api.pubg.com` (`src/lib/pubg.ts` + `api-throttle`),
- traiter la telemetrie CDN dans une couche dediee avec garde-fous de production,
- ajouter observabilite cron/idempotence/retry, non couverts nativement par pubg.js.

### Nouvelle lib serveur

Créer une lib dédiée avec découpage clair:

- src/lib/pubg-telemetry/client.ts
  - downloadTelemetryFromAsset(url)
  - récupération brute JSON depuis assets.pubg.com
- src/lib/pubg-telemetry/types.ts
  - typage minimal des événements supportés
- src/lib/pubg-telemetry/parser.ts
  - parseTelemetryEvents(events, clanContext)
  - routage par type d'événement
- src/lib/pubg-telemetry/aggregators/
  - weapons.ts
  - synergy.ts
  - playstyle.ts
  - position.ts
  - circles.ts
  - loot.ts
  - vehicles.ts
- src/lib/pubg-telemetry/index.ts
  - API haut niveau: computeTelemetryAggregatesForSquadMatch(...)

### Intégration avec la stack actuelle

- Source match: src/lib/pubg.ts (getMatch + assets)
- Sync existant: jobs cron import matchs
- Extension: étape post-import sync telemetry

Flux global:

1. Sync match importe ou met a jour SquadMatch/SquadMember.
2. Si pas de snapshot telemetry pour ce SquadMatch: fetch asset URL.
3. Parser calcule les agrégats du clan.
4. Upsert en base dans table snapshot + agrégats périodiques.
5. APIs de lecture alimentent UI clan/membre.

## Schéma de données (proposition)

### 1) Snapshot par match

Table de snapshot pour éviter le reparse a chaque requête:

- SquadMatchTelemetry
  - squadMatchId unique
  - weaponStats (Json)
  - synergyData (Json)
  - playstyleData (Json)
  - positionData (Json)
  - circleData (Json)
  - lootData (Json)
  - vehicleData (Json)
  - parserVersion (String)
  - sourceGeneratedAt (DateTime?)
  - parsedAt (DateTime)
  - errorCode (String?)
  - errorMessage (String?)

### 2) Agrégats périodiques

Pour les classements rapides:

- MemberWeaponStats (memberId, period, weaponName)
- MemberTelemetryStats (memberId, period)
  - aggressionScore
  - supportScore
  - zoneDisciplineScore
  - avgBlueZoneHits
  - avgCircleDelaySeconds
- ClanSynergyTelemetryStats (clanId, period, memberAId, memberBId)
  - reviveCount
  - coKillCount
  - sharedDamageEvents

## Suivi anti-doublon et reprise

Etat actuel (import matchs):

- Les doublons de match sont déjà évités via les contraintes DB et les `upsert`.
- `Match` est unique par `(memberId, pubgMatchId)`.
- `SquadMatch` est unique par `pubgMatchId`.
- Le cron garde un historique d'exécution (`CronExecution`) avec statuts `success|partial|failed`.

Extension recommandée pour la télémétrie:

- Créer un enregistrement unique par match analysé (`squadMatchId` unique dans `SquadMatchTelemetry`).
- Ajouter des champs de suivi: `status`, `attemptCount`, `lastAttemptAt`, `nextRetryAt`, `errorCode`, `errorMessage`, `parserVersion`.
- Règle d'exécution:
  - si `status=success` et `parserVersion` identique: ne pas retraiter,
  - si `status=failed` et `attemptCount < max`: retraiter selon backoff,
  - si `parserVersion` change: requeue contrôlée (rebuild).

Politique de reprise:

- Erreurs transitoires réseau/CDN: retry automatique avec backoff.
- Erreurs fonctionnelles (asset manquant/corrompu): marquer `failed` sans boucle infinie.
- Job de rattrapage: traite en priorité les `failed` réessayables puis les `pending`.

## Variables d'environnement

A définir/valider:

- PUBG_API_KEY (déja existante)
- PUBG_BASE_URL (déja existante)
- TELEMETRY_SYNC_ENABLED=true|false
- TELEMETRY_MAX_MATCHES_PER_RUN=50
- TELEMETRY_FETCH_TIMEOUT_MS=30000
- TELEMETRY_RETRY_MAX=2
- TELEMETRY_PARSER_VERSION=v1
- TELEMETRY_MAX_ASSET_SIZE_MB=250
- TELEMETRY_TEMP_DIR=/tmp (ou équivalent OS)

Note:
- Le download assets.pubg.com ne passe pas par la limite RPM api.pubg.com, mais doit quand meme être borné en volume pour protéger le serveur.

## Gestion mémoire et temporaires

Règles d'implémentation:

- Traiter la télémétrie en flux (stream) et agréger au fil de l'eau.
- Interdire le chargement complet en mémoire d'un asset volumineux.
- Utiliser un parser JSON streaming pour itérer les événements sans buffer global.

Politique fichiers temporaires:

- Mode par défaut: pas d'écriture disque, traitement direct en stream.
- Mode fallback (si nécessaire): spool en répertoire temporaire dédié.
- Suppression obligatoire du fichier temporaire en bloc `finally`, succès ou échec.
- Job de nettoyage défensif au démarrage pour purger les restes anciens.

## Plan d'implémentation par phases

## Phase 0 - Préparation

- Ajouter migration Prisma des tables télémétrie.
- Ajouter index de lecture par clan/période.
- Ajouter feature flag TELEMETRY_SYNC_ENABLED.

Critères de sortie:
- Migration deployable sans casse sur base existante.
- Feature désactivable instantanément.

## Phase 1 - Ingestion et parsing minimal

Scope:
- Télécharger télémétrie depuis asset URL.
- Extraire seulement armes + revives + co-kills.
- Upsert SquadMatchTelemetry.

Critères de sortie:
- 1 run cron traite N matchs sans erreur bloquante.
- Données cohérentes visibles en DB.

## Phase 2 - Agrégats périodiques

Scope:
- Alimenter MemberWeaponStats et ClanSynergyTelemetryStats.
- Calcul week/month/all.

Critères de sortie:
- Requêtes leaderboard-like < 300 ms sur dataset moyen.
- Recalcul idempotent sur relance.

## Phase 3 - Playstyle et cercles

Scope:
- aggressionScore/supportScore/zoneDisciplineScore.
- Métriques cercles (retard moyen, présence en zone).

Critères de sortie:
- Scores bornés et stables (0-100).
- Validation manuelle sur échantillon de matchs.

## Phase 4 - Heatmaps positions

Scope:
- Stocker points simplifiés (downsampling).
- API par carte/période/joueur.

Critères de sortie:
- Charge JSON contrôlée (taille max par réponse).
- Affichage lisible sur cartes principales.

## Phase 5 - Loot et véhicules

Scope:
- Consommables utilisés, pickups majeurs.
- Distance véhicule, destructions, roadkills.

Critères de sortie:
- KPIs disponibles dans pages membre et clan.

## APIs a créer

### Clan

- GET /api/clans/[clanId]/telemetry/weapons?period=week|month|all
- GET /api/clans/[clanId]/telemetry/synergies?period=week|month|all
- GET /api/clans/[clanId]/telemetry/playstyle?period=week|month|all
- GET /api/clans/[clanId]/telemetry/heatmap?period=week|month|all&map=...
- GET /api/clans/[clanId]/telemetry/circles?period=week|month|all
- GET /api/clans/[clanId]/telemetry/vehicles?period=week|month|all
- GET /api/clans/[clanId]/telemetry/loot?period=week|month|all

### Membre

- GET /api/members/[id]/telemetry/weapons?period=week|month|all
- GET /api/members/[id]/telemetry/playstyle?period=week|month|all
- GET /api/members/[id]/telemetry/circles?period=week|month|all

## UI a livrer

### Clan

- /clans/[clanId]/stats/weapons
- /clans/[clanId]/stats/heatmap-kills
- Extension du bloc synergies existant avec onglet telemetry
- Carte playstyle clan (répartition agressif/support/passif)

### Membre

- /members/[id]/weapons
- Bloc playstyle et discipline zone sur dashboard membre

## Cron et orchestration

Ajouter un job dédié ou sous-étape dans sync-matches:

- syncTelemetryForRecentSquadMatches(clanId?)
  - sélection des SquadMatch récents sans snapshot ou parserVersion obsolète
  - récupération asset
  - parsing
  - upsert snapshot
  - mise a jour agrégats période

Politique de reprise:

- Si un match échoue: marquer errorCode/errorMessage et continuer.
- Retry limité (2 essais).
- Reprise sur run suivant.

## Observabilité

Ajouter logs et compteurs:

- telemetry.matches.scanned
- telemetry.matches.parsed
- telemetry.matches.failed
- telemetry.fetch.ms
- telemetry.parse.ms
- telemetry.aggregate.ms
- telemetry.asset.bytes
- telemetry.tempfiles.created
- telemetry.tempfiles.deleted

Ajouter vue admin/cron:

- dernier run telemetry
- parser version active
- backlog (matchs non parsés)
- top erreurs

## Performance et coûts

Garde-fous:

- Concurrence fetch limitée (ex: 2 a 4 téléchargements simultanés)
- Timeout strict sur fetch
- Limite de taille par asset (Content-Length ou compteur de bytes)
- Annulation immédiate du téléchargement si la taille dépasse le seuil
- Downsampling positions pour heatmap
- Pagination sur endpoints volumineux

Cibles:

- API lecture agrégée < 300 ms
- Job telemetry borné en durée (ex: max 5 min/run)

## Sécurité

- Jamais exposer URL d'asset brute si inutile coté client.
- Valider clanId/memberId via auth existante.
- Ne pas loguer de payload télémétrie complet.

## Plan de test

### Tests unitaires

- Parsers par type d'événement
- Agrégateurs par métrique
- Scoring playstyle

### Tests d'intégration

- Pipeline complet match -> snapshot -> agrégats
- Idempotence (2 runs consécutifs)
- Gestion erreurs réseau

### Validation métier

- Comparaison manuelle sur 10 matchs de référence
- Vérification cohérence armes/revives/co-kills

## Stratégie de rollout

1. Déployer migration + feature flag off.
2. Déployer lib et cron telemetry en mode dry-run (logs only).
3. Activer sur 1 clan pilote.
4. Vérifier observabilité 48h.
5. Activer globalement.

Rollback:

- Couper TELEMETRY_SYNC_ENABLED.
- Conserver snapshots existants en lecture seule.
- Désactiver endpoints UI telemetry si nécessaire.

## Checklist opérationnelle

- Migration Prisma appliquée
- Variables d'env renseignées
- Feature flag configuré
- Cron telemetry actif
- Endpoints telemetry testés
- UI telemetry validée desktop/mobile
- Dashboard d'observabilité en place
- Procédure rollback documentée

## Livrables attendus

- Lib serveur pubg-telemetry complète
- Migrations Prisma telemetry
- Jobs cron ingestion + agrégation
- Endpoints API clan/membre
- Pages UI telemetry clan/membre
- Tests unitaires + intégration
- Monitoring et runbook de prod

## Exemple de bloc fun en bas de page

Ce type de rendu peut être ajouté comme un bloc de synthèse narratif au bas de la doc ou de la page de stats:

🎉 **Classement fun du match** 🎉
🏆 **Top 3 équipes** 🏆

🥇 **Équipe 13** (Top 1)
🥈 **Équipe 3** (Top 2)
🥉 **Équipe 7** (Top 3)

Équipe 13 (Top 1)

- papy_0 | @papy_0
- zionXXL | @zionXXL
- Toper-Harley | @Toper-Harley

Équipe 3 (Top 2)

- FR_Boutu | @PorCificateur
- Twitch_Niouskk | @Twitch_Niouskk
- VAPOJACKTWITCH | @𝐯𝐚𝐩𝐨𝐣𝐚𝐜𝐤
- mika3522 | @Mika

Équipe 7 (Top 3)

- TigrOo-SmK | @TigrOo-SmK
- 37u51v3
- Viande_Hachee
- YOURKINPOPOV

💀 **Le croc mort** (6)
Toper-Harley

💪 **La brute** (696)
FR_Boutu

🤝 **Soutiens opérationnel** (3)
Twitch_Niouskk

🔪 **Le serial killer** (2)
Toper-Harley

🎯 **Le sniper** (152)
FR_Boutu

🌿 **Le brouteur d'herbe** (4)
Toper-Harley

🍺 **L'alcoolique du dimanche** (8)
FR_Boutu

🎯 **Le chasseur de tête** (2)
Toper-Harley

🏥 **Le fou de l'hôpital** (12)
Twitch_Niouskk

🩹 **Le ressuscité** (1)
Toper-Harley

🚗 **JACKY TUNING** (3645)
FR_Boutu

🕵️ **L'infiltré** (1)
Toper-Harley

🚶 **Le rodeur** (2853)
warrick06

💥 **Le destructeur** (1)
Twitch_Niouskk

🔫 **Le collectionneur d'arme** (15)
FREDOCUS

Source des données:

- le bloc n'existe pas tel quel dans le code actuel,
- il doit être produit à partir des agrégats du leaderboard (`PlayerStats`, `badgeType`, top performers `top_killer`/`top_damage`/`best_wr`/`mvp`/`best_kpm`),
- et éventuellement enrichi par les rapports (`ReportHighlights`, `mvpScore`) pour les formulations éditoriales,
- la couche fun est donc une couche de présentation au-dessus des stats calculées, pas une source de données autonome.
