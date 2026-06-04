# Déploiement télémétrie matchs clan

Ce document décrit le plan complet pour déployer tous les axes de la doc télémetrie-matchs-clan, avec la lib a créer/adapter, les migrations, les jobs cron, les APIs et les écrans.

## Objectif

Mettre en production un pipeline télémétrie qui:

1. Récupère les assets télémétrie PUBG pour les matchs importés.
2. Parse les événements utiles pour les membres du clan.
3. Stocke uniquement des agrégats en base.
4. Expose des APIs et des vues pour les nouveaux indicateurs (armes, synergies, style de jeu, positionnement, cercles, loot, véhicules).

## Statut rapide (04/06/2026)

Ce resume est base sur verification du repo (code + routes + pages + schema Prisma).

Deja en place dans le repo:

- Pipeline telemetry (client CDN, parser streaming, persistence snapshot, backlog/job, retry/backoff).
- Tables Prisma telemetry (`SquadMatchTelemetry`, `MemberWeaponStats`, `MemberTelemetryStats`, `ClanSynergyTelemetryStats`).
- Cron telemetry branche (gate par `TELEMETRY_SYNC_ENABLED`).
- Endpoints clan/membre telemetry de la doc (weapons, synergies, playstyle, circles, heatmap, vehicles, loot, observability).
- Pages UI deja livrees (weapons clan/membre, heatmap-kills, recoveries, bloc playstyle).
- Tests telemetry (parser, job, contrats API, idempotence agregats).

Principal reste a faire:

- Executer le rollout reel sur environnement cible (pilote puis global), car c'est operationnel et non un manque de code.
- Lancer le reprocessing parserVersion sur l'historique si des snapshots `v1` restent en base.
- Finaliser les enrichissements metier fins (payloads/visuels) selon priorites produit.

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
- TELEMETRY_CAPTURE_FIXTURES=true|false (mode debug manuel uniquement)
- TELEMETRY_CAPTURE_FIXTURES_DIR=.telemetry-captured
- TELEMETRY_CAPTURE_FIXTURE_MAX_BYTES=52428800 (defaut 10 Mo, plafond dur 50 Mo)

Note:
- Le download assets.pubg.com ne passe pas par la limite RPM api.pubg.com, mais doit quand meme être borné en volume pour protéger le serveur.
- La capture de fixtures est volontairement bornée pour stabilité runtime et fonctionne en streaming incremental; si la limite est atteinte (ou si `content-length` est absent), le fichier est tronqué proprement (JSON valide) et la sync continue.
- Le dossier de capture recommandé est hors `src` (`.telemetry-captured`) pour éviter que `next dev` surveille/compile de gros JSON et déclenche des OOM.
- En cas d'échec de capture, le fichier partiel est supprimé automatiquement (pas de faux positifs avec JSON invalide).

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
- GET /api/clans/[clanId]/telemetry/observability?window=24h|7d|30d|all&limit=100

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

## Assets cartes heatmap-kills

Pour afficher les apercus de cartes dans `/clans/[clanId]/stats/heatmap-kills`:

- Dossier de stockage: `public/maps/pubg/`
- Format: `.webp`
- Nom de fichier: exactement le `mapName` PUBG + `.webp`

Exemples de noms attendus:

- `Baltic_Main.webp` (Erangel)
- `Savage_Main.webp` (Sanhok)
- `Desert_Main.webp` (Miramar)
- `DihorOtok_Main.webp` (Vikendi)
- `Range_Main.webp` (Camp Jackal)
- `Summerland_Main.webp` (Karakin)
- `Tiger_Main.webp` (Taego)
- `Kiki_Main.webp` (Deston)
- `Chimera_Main.webp` (Paramo)
- `Heaven_Main.webp` (Haven)
- `Neon_Main.webp` (Rondo)

Chemin charge cote UI: `/maps/pubg/<mapName>.webp`

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

Runbook detaille:

- voir `docs/telemetrie-rollout.md` pour la sequence executable (preflight, dry-run opere, pilote automatise, extension globale, rollback).

Rollback:

- Couper TELEMETRY_SYNC_ENABLED.
- Conserver snapshots existants en lecture seule.
- Désactiver endpoints UI telemetry si nécessaire.

## Checklist de suivi de deploiement

Utiliser cette checklist comme feuille de route runbook. Cocher uniquement avec preuve (log, capture, SQL, page UI).

### A. Verification repo (fait une fois)

- [x] Tables telemetry presentes dans `prisma/schema.prisma`.
- [x] Job telemetry present et branche dans le cron.
- [x] Endpoints telemetry clan/membre presents.
- [x] Pages UI telemetry presentes.
- [x] Runbook present: `docs/telemetrie-rollout.md`.

### B. Preflight environnement cible (go/no-go)

- [ ] `DATABASE_URL` pointe vers la bonne base cible.
- [ ] Migrations appliquees (`npx prisma migrate deploy`) sur l'environnement cible.
- [ ] `TELEMETRY_SYNC_ENABLED=true` sur le worker cron actif.
- [ ] `TELEMETRY_PARSER_VERSION=v2` actif sur le worker cron.
- [ ] `TELEMETRY_MAX_MATCHES_PER_RUN` et `TELEMETRY_SYNC_CONCURRENCY` renseignes.
- [ ] Page `/clans/[clanId]/settings/cron` sans erreur bloquante sur checks telemetry.
- [ ] Verification SQL: presence de `Clan` actif et de la table `SquadMatchTelemetry`.
- [ ] Decision go/no-go prise et notee.

### C. Execution pilote (1 clan)

- [ ] Dry-run execute selon `docs/telemetrie-rollout.md`.
- [ ] Run pilote lance avec telemetry activee.
- [ ] Resultat run: `telemetry.scanned > 0`.
- [ ] Resultat run: `telemetry.failed` sous le seuil accepte.
- [ ] Si snapshots `v1` majoritaires: batch reprocess TEL-202 execute.
- [ ] Recalcul `sync_telemetry_aggregates` execute apres reprocess.
- [ ] UI validee sur le clan pilote:
  - [ ] `/clans/[clanId]/stats/weapons`
  - [ ] `/clans/[clanId]/stats/heatmap-kills`
  - [ ] `/members/[id]/weapons`
  - [ ] `/clans/[clanId]/telemetry/recoveries`
- [ ] Observation 48h complete sans incident bloquant.

### D. Extension globale

- [ ] Activation globale planifiee (fenetre + responsable).
- [ ] Parametres telemetry confirmes sur tous les workers cron.
- [ ] Activation globale executee.
- [ ] Monitoring 24h/7j valide (failed rate, p95 parse, bytes).
- [ ] Aucune regression API/UI critique constatee.

### E. Rollback (pret a executer)

- [ ] Procedure rollback verifiee dans `docs/telemetrie-rollout.md`.
- [ ] Action immediate connue: basculer `TELEMETRY_SYNC_ENABLED=false`.
- [ ] Canal d'alerte et responsable de decision identifies.

### F. Journal de suivi (a remplir)

- [ ] Date/heure:
- [ ] Environnement:
- [ ] Operateur:
- [ ] Actions executees:
- [ ] Resultats cles (scanned/parsed/failed, p95):
- [ ] Decision (continuer / rollback / corriger):
- [ ] Prochaine etape:

## Livrables attendus

- Lib serveur pubg-telemetry complète
- Migrations Prisma telemetry
- Jobs cron ingestion + agrégation
- Endpoints API clan/membre
- Pages UI telemetry clan/membre
- Tests unitaires + intégration
- Monitoring et runbook de prod

## Dernieres mises a jour (03/06/2026)

- Runbook TEL-403 complete dans docs/telemetrie-rollout.md avec journal local preflight, dry-run opere, verification post-run manuel et checklist run-par-run pilote.
- Page cron enrichie pour afficher les checks de configuration telemetry et reminders cron, avec validation des booleens et bornes numeriques.
- Roadmap TEL-403 mise a jour avec l'etat reel: preparation documentaire terminee, execution pilote/global restante sur environnement cible.

### Check implementation (tracabilite fichiers/lignes)

- src/lib/cron-observability.ts:318
  - ajout de la fonction getTelemetryEnvChecks() pour exposer les variables TELEMETRY_* dans les checks cron.
- src/lib/cron-observability.ts:475
  - ajout des checks reminders cron CLAN_ONLINE_REMINDER_CRON et WEEKLY_REPORT_REMINDER_CRON.
- src/lib/cron-observability.ts:497
  - aggregation finale getCronConfigurationChecks() etendue pour inclure env cron + env telemetry + schedules.
- docs/cron-clan-settings.md:238
  - documentation explicite des variables telemetry affichees sur la page /clans/[clanId]/settings/cron.
- docs/cron-clan-settings.md:245
  - documentation des regles de validation (true|false, entier > 0, statuts ok/warning/error).
- docs/telemetrie-rollout.md:61
  - journal local renseigne avec la verification post-run manuel (4 matchs importes, statut success).
- docs/telemetrie-rollout.md:137
  - checklist run-par-run pilote auto ajoutee (runs 1, 2, 3 et decision rapide).

## Verification d'avancement (basee sur verification repo au 04/06/2026)

Cette section met a jour l'etat reel par rapport au plan ci-dessus.

### Ce qui est deja livre

- [x] Extraction de l'URL telemetry asset depuis le match (`src/lib/pubg.ts`, `fetchMatchDetailsWithTelemetryAsset`).
- [x] Client CDN telemetry avec garde-fous (`src/lib/pubg-telemetry/client.ts`: timeout, limite taille, validation URL).
- [x] Parser minimal (`src/lib/pubg-telemetry/parser.ts`) avec summary/weaponStats/memberStats.
- [x] Correctif parser sur fixtures reelles: extraction des identites joueur depuis objets imbriques (`killer/attacker/victim/reviver/character`) + detection arme/headshot via `*DamageInfo` (`src/lib/pubg-telemetry/parser.ts`).
- [x] Snapshot DB par match (`SquadMatchTelemetry`) avec relation 1:1 et index status/updatedAt.
- [x] Declenchement manuel Owner (`POST /api/clans/[clanId]/telemetry/sync-selected`).
- [x] UI de selection sur la page session + bouton de recuperation manuelle.
- [x] Exposition telemetry dans l'API matchs (`GET /api/clans/[clanId]/matches`) et affichage dans la liste des matchs.
- [x] Page provisoire d'observabilite recoveries (`/clans/[clanId]/telemetry/recoveries`) + API associee.
- [x] Corpus reel valide: 20 fixtures capturees (`.telemetry-captured`) parsees en tests avec budget 2000 ms (`avgParseMs=359.3`, `p95ParseMs=508`).
- [x] Validation live (02/06/2026): recuperation manuelle 15/15 puis recalcul force `sync_telemetry_aggregates` OK (`periodsUpdated=3`, `memberTelemetryRows=18`, `clanSynergyRows=27`).
- [x] Validation UI live (02/06/2026): `Synergies > Telemetry` et `Carte playstyle clan` affichent des donnees non vides apres sync + recalcul.
- [x] TEL-202 (03/06/2026): batch telemetry priorise `failed -> pending -> rebuild(parserVersion)` et expose le suivi `queued.{failed,pending,rebuild}` + `reprocessed` dans le resultat de job.
- [x] TEL-203 (03/06/2026): endpoints telemetry clan/membre harmonises sur un contrat commun `ok + meta + data` avec compatibilite descendante (champs legacy conserves).

### Ce qui est partiellement livre

- [x] Phase 0 - Preparation: migrations telemetry OK, feature flag `TELEMETRY_SYNC_ENABLED` branche au flux runtime.
- [x] Phase 1 - Ingestion/parsing minimal: disponible en mode manuel et automatise via cron telemetry.
- [~] Observabilite: vue recoveries disponible et metriques techniques batch/cron ajoutees (`bytesDownloaded`, `fetchMatchMs`, `downloadAssetMs`, `parseMs`, `persistMs`); dashboard observability 24h/7j/30j/all livre sur l'endpoint/page recoveries (totaux, p95, alertes seuils), reste a brancher si besoin vers une vraie serie temporelle externe.

### Ce qui reste a faire (ecart principal avec cette doc)

- [x] Job backlog + orchestrateur generique (`src/lib/pubg-telemetry/backlog.ts`, `index.ts`, `job.ts`) en place.
- [x] Integration cron telemetry initiale en place dans `runDailyClanSync` (gatee par `TELEMETRY_SYNC_ENABLED`).
- [x] Champs de reprise avances (`attemptCount`, `lastAttemptAt`, `nextRetryAt`) ajoutes dans `SquadMatchTelemetry`.
- [~] Agregats periodiques dedies implementes partiellement: tables `MemberWeaponStats`, `MemberTelemetryStats`, `ClanSynergyTelemetryStats` + recalcul periodique cron; l'attribution arme-par-membre est implementee dans le parser v2 (weapons embarques dans `memberStats`), reste a faire: reprocess parserVersion + enrichissement metier fin.
- [~] APIs telemetry partiellement livrees: clan `/telemetry/weapons`, `/telemetry/synergies`, `/telemetry/playstyle`, `/telemetry/circles`, `/telemetry/heatmap`, `/telemetry/vehicles`, `/telemetry/loot`, `/telemetry/observability` + membre `/telemetry/weapons`, `/telemetry/playstyle`, `/telemetry/circles` disponibles; reste surtout l'enrichissement metier des endpoints et la chaleur geospatiale fine.
- [x] Pages produit telemetry ciblees implementees: `/clans/[clanId]/stats/weapons`, `/clans/[clanId]/stats/heatmap-kills`, `/members/[id]/weapons`.
- [x] Carte playstyle clan ajoutee sur `/clans/[clanId]/stats` (filtres `week|month|all`, moyennes et tops par axe).
- [x] Extension synergies livree sur `/clans/[clanId]/matches`: onglet `Telemetry` ajoute au bloc `Synergies` avec chargement API `/api/clans/[clanId]/telemetry/synergies`.
- [x] Onglet `Synergies > Telemetry` enrichi avec indicateur global de qualite (score combine revive/co-kills/shared damage) + KPIs de volume.
- [~] Telemetry membre: endpoint `/api/members/[id]/telemetry/playstyle` alimente; attribution arme-par-membre implementee cote parser/aggregats (v2), reste a faire: rerun/rebuild des snapshots pour remplir `MemberWeaponStats` sur l'historique.
- [x] Parsing streaming JSON pur (sans `JSON.parse` global) implemente.
- [x] Suite de tests telemetry: socle unitaire livre, integration corpus reel validee (20 fixtures), tests de contrats API harmonises ajoutes (member weapons + observability clan) et test d'idempotence du recalcul d'agregats telemetry ajoute.

## Roadmap actualisee (priorites)

### P1 - Fermer le pipeline automatique

- [x] Creer backlog telemetry (`listSquadMatchesNeedingTelemetry`).
- [x] Creer orchestrateur unique `syncTelemetryForSquadMatch`.
- [x] Creer job batch avec concurrence bornee (2-4).
- [x] Brancher le job dans cron (ou sous-etape fin `sync-matches`) avec compte-rendu d'execution.
- [x] Ajouter retry borne + backoff sur erreurs transitoires.

Critere de sortie P1:

- le traitement telemetry fonctionne sans action manuelle,
- les erreurs d'un match n'interrompent pas le batch,
- reprise operationnelle sur run suivant.

### P2 - Agregats et APIs metier

- [x] Ajouter tables agregats periodiques (`MemberWeaponStats`, `MemberTelemetryStats`, `ClanSynergyTelemetryStats`).
- [~] Alimenter week/month/all depuis snapshots match (member telemetry + synergies OK, member weapons disponibles sur snapshots parser v2; backlog de reprocessing v1 -> v2 a executer).
- [~] Exposer APIs clan/membre telemetry de la section "APIs a creer" (clan weapons/synergies/playstyle/circles/heatmap/vehicles/loot + membre weapons/playstyle/circles livres, reste a completer).

Critere de sortie P2:

- endpoints telemetry clan/membre disponibles,
- temps de reponse cible atteignable sur dataset moyen,
- recalcul idempotent verifie.

### P3 - UI telemetry ciblee

- [x] Livrer pages clan weapons + heatmap + extension synergies telemetry.
- [~] Livrer page membre weapons + bloc playstyle/zone (page weapons livree avec etats loading/empty/error + retry + liens ops; bloc dashboard playstyle/discipline zone branche sur l'API membre avec filtres periode alignes; enrichissement UI metier restant selon parser v1).
- [x] Conserver la page recoveries comme console ops officielle et ajouter un acces direct Owner depuis Ops Cron/navigation.

Critere de sortie P3:

- parcours telemetry clan/membre complet en UI,
- coherence desktop/mobile validee.

### P4 - Qualite, perf et rollout

- [x] Passer a un parser JSON streaming reel.
- [x] Ajouter tests unitaires + integration sur corpus reel (10-20 matchs): socle unitaire livre, corpus reel valide sur 20 fixtures reelles.
- [~] Instrumenter metriques telemetry (`matches.scanned/parsed/failed`, `fetch.ms`, `parse.ms`, `asset.bytes`) : metriques exposees dans les resultats batch/cron et dashboard observability UI (totaux, p95, alertes), reste a brancher vers une serie de temps externe si necessaire.
- [ ] Executer rollout progressif (flag off -> dry-run -> clan pilote -> global).

Critere de sortie P4:

- stabilite prouvee sur 48h mini,
- observabilite suffisante pour diagnostiquer sans SQL manuel,
- procedure de rollback validee.

## Plan d'action executable en tickets (ordre recommande)

Objectif de ce plan: transformer les ecarts restants en tickets concrets, livrables par lot court, sans regressions du pipeline deja en prod technique.

### Lot A - P2 donnees metier (priorite haute)

Ticket A1 - Attribution armes par membre (parser v2)

- Scope:
  - enrichir le parser pour relier chaque evenement arme au bon membre du clan de facon deterministe,
  - gerer les cas ambigus (noms manquants, bots, events incomplets) avec une strategie explicite,
  - versionner le parser en `v2` et conserver compatibilite lecture `v1`.
- Fichiers cibles:
  - `src/lib/pubg-telemetry/parser.ts`
  - `src/lib/pubg-telemetry/types.ts`
  - tests telemetry associes.
- Definition of Done:
  - `/members/[id]/weapons` retourne des donnees non vides sur echantillon reel,
  - taux d'evenements armes non attribues mesure et trace,
  - aucune regression sur revives/co-kills/playstyle existants.

Ticket A2 - Rebuild controle des snapshots parserVersion

- Scope:
  - ajouter un job de requeue/rebuild pour matchs `success` en `v1` lors d'un passage `v2`,
  - limiter le debit (batch borne) et conserver idempotence,
  - journaliser progression et erreurs.
- Fichiers cibles:
  - `src/lib/pubg-telemetry/backlog.ts`
  - `src/lib/pubg-telemetry/job.ts`
  - orchestration cron telemetry.
- Definition of Done:
  - backlog parserVersion obsolete vide apres execution,
  - aucun doublon d'agregats periodiques,
  - execution interrompable et reprenable sans perte.
- Etat: implementation job/backlog livree (priorisation + comptage reprocess), execution de rattrapage globale a lancer en environnement cible.

Ticket A3 - Enrichissement endpoints telemetry (clan/membre)

- Scope:
  - completer les payloads metier des endpoints `weapons/circles/vehicles/loot/heatmap`,
  - uniformiser formats de reponse (tri, pagination, bornes),
  - documenter contrats JSON stables.
- Fichiers cibles:
  - routes `src/app/api/clans/[clanId]/telemetry/*`
  - routes `src/app/api/members/[id]/telemetry/*`
  - docs API.
- Definition of Done:
  - toutes les routes de la section "APIs a creer" renvoient des donnees exploitables,
  - p95 < 300 ms sur dataset moyen,
  - tests integration API verts.

### Lot B - P3 UI produit (priorite haute)

Ticket B1 - Finalisation page membre weapons

- Scope:
  - afficher les statistiques armes reellement alimentees par A1,
  - gerer etats vide/loading/erreur propres,
  - ajouter filtres periode coherents avec le reste du produit.
- Fichiers cibles:
  - page membre stats weapons,
  - composants telemetry membre associes.
- Definition of Done:
  - page non vide sur clan pilote,
  - coherence responsive desktop/mobile,
  - pas de warning runtime/client.

Ticket B2 - Bloc playstyle/zone sur dashboard membre

- Scope:
  - integrer les KPIs playstyle + discipline zone sur le dashboard membre,
  - harmoniser wording/legendes avec la page clan stats.
- Definition of Done:
  - composant visible et alimente en `week|month|all`,
  - UX validee sur echantillon membres actifs/inactifs.

Ticket B3 - Decision produit sur recoveries

- Scope:
  - trancher: conserver `/telemetry/recoveries` comme console ops officielle,
  - ajuster navigation + droits (Owner/Admin) avec acces direct depuis Ops Cron.
- Definition of Done:
  - un seul parcours ops supporte officiellement,
  - lien present dans l'UI admin cible.
- Etat: livre (acces Owner ajoute dans la navigation et lien rapide depuis `/clans/[clanId]/settings/cron`).

### Lot C - P4 observabilite, qualite, rollout (priorite haute)

Ticket C1 - Dashboard metriques telemetry

- Scope:
  - brancher les metriques existantes vers une serie temporelle,
  - afficher: scanned/parsed/failed, latences fetch/parse/aggregate, volumes bytes,
  - fournir une vue 24h/7d/30d.
- Definition of Done:
  - dashboard consultable sans SQL manuel,
  - seuils d'alerte definis pour `failed` et latence p95.

Ticket C2 - Durcissement tests non-regression

- Scope:
  - ajouter tests de non-regression parser v2 sur corpus reel,
  - verifier idempotence rebuild + recalcul agregats,
  - ajouter tests de contrat API telemetry.
- Definition of Done:
  - pipeline CI telemetry vert,
  - rapport de couverture stable sur modules critiques telemetry.

Ticket C3 - Rollout progressif opere

- Scope:
  - appliquer sequence `flag off -> dry-run -> pilote -> global`,
  - suivre 48h mini sur pilote avec check-list incidents,
  - valider rollback operationnel.
- Definition of Done:
  - journal de rollout renseigne,
  - aucun incident bloquant non resolu avant activation globale.

## Ordre d'execution propose (sprintable)

1. A1 puis A2 (fermer la source de verite data armes + migration parserVersion).
2. A3 en parallele de B1/B2 (APIs metier puis consommation UI).
3. B3 (decision produit recoveries) avant gel UI.
4. C1 puis C2 (observabilite et qualite avant exposition large).
5. C3 (rollout pilote puis global).

## Jalons de validation

- Jalon J1 (fin Lot A): donnees armes membre fiables + endpoints telemetry complets.
- Jalon J2 (fin Lot B): parcours UI clan/membre complet et coherent.
- Jalon J3 (fin Lot C): observabilite exploitable + rollout valide en production.

## Backlog sprint (pret a copier GitHub/Jira)

Convention:

- Estimation: S (1-2 j), M (3-5 j), L (5-8 j)
- Priorite: P0 (critique), P1 (haute), P2 (normale)
- Type: `feature`, `tech`, `ops`, `qa`

### Epic E1 - Fiabilite data telemetry (P2)

Ticket TEL-201 - Parser v2 attribution armes par membre

- Type: `feature`
- Priorite: P0
- Estimation: L
- Dependances: aucune
- Description:
  - enrichir la resolution d'identite joueur sur evenements armes,
  - tracer les evenements non attribues,
  - incrementer `TELEMETRY_PARSER_VERSION` vers `v2`.
- Critere d'acceptation:
  - endpoint membre weapons retourne des donnees sur fixtures reelles,
  - taux non attribue visible en metriques,
  - tests parser existants restent verts.

Ticket TEL-202 - Rebuild controle snapshots parserVersion

- Type: `tech`
- Priorite: P0
- Estimation: M
- Dependances: TEL-201
- Description:
  - requeue des snapshots `success` version obsolete,
  - traitement batche limite et reprenable,
  - suivi d'avancement par lot.
- Critere d'acceptation:
  - backlog obsolete vide apres execution,
  - aucune duplication d'agregats,
  - reprise correcte apres interruption.
- Etat: implementation job/backlog livree (priorisation + comptage reprocess), execution de rattrapage globale a lancer en environnement cible.

Preflight execution reelle (runbook rapide):

1. Verifier que la base cible contient les tables telemetry (`SquadMatchTelemetry`, `MemberWeaponStats`, `MemberTelemetryStats`, `ClanSynergyTelemetryStats`).
2. Verifier qu'au moins un clan actif est present dans `Clan`.
3. Verifier que le worker cron a `TELEMETRY_SYNC_ENABLED=true`.
4. Verifier que `TELEMETRY_PARSER_VERSION=v2` est actif sur le worker cron.

Checks SQL minimaux:

```sql
SELECT id, name, isActive FROM Clan ORDER BY id LIMIT 10;
SHOW TABLES LIKE 'SquadMatchTelemetry';
SELECT status, parserVersion, COUNT(*)
FROM SquadMatchTelemetry
GROUP BY status, parserVersion
ORDER BY status, parserVersion;
```

Critere go/no-go:

- si `Clan` est vide ou `SquadMatchTelemetry` absent: ne pas lancer le backfill (appliquer migrations / pointer la bonne DB d'abord),
- si `parserVersion=v1` majoritaire: lancer le batch TEL-202 puis recalcul periodique telemetry.

Ticket TEL-203 - Contrats API telemetry homogenes

- Type: `feature`
- Priorite: P1
- Estimation: M
- Dependances: TEL-201
- Description:
  - homogeniser payloads et bornes sur clan/membre,
  - normaliser tri/pagination/periode,
  - documenter schemas de reponse.
- Critere d'acceptation:
  - routes telemetry de la doc toutes alimentees,
  - p95 endpoint cible < 300 ms dataset moyen,
  - tests integration API verts.
- Etat: contrat commun livre sur les routes telemetry existantes (meta/data + legacy), enrichissement metier fin des payloads encore a poursuivre selon priorites produit.

### Epic E2 - Finition UI telemetry (P3)

Ticket TEL-301 - Finaliser page membre weapons

- Type: `feature`
- Priorite: P0
- Estimation: M
- Dependances: TEL-201, TEL-203
- Description:
  - brancher la data v2,
  - etats loading/empty/error,
  - filtres `week|month|all` coherents.
- Critere d'acceptation:
  - page exploitable sur clan pilote,
  - rendu correct desktop/mobile,
  - pas de warning React runtime.
- Etat: avancement significatif livre (gestion loading/empty/error, retry et filtres periode harmonises); reste conditionne par le rerun/rebuild parser v2 sur l'historique pour garantir des donnees pleines sur toutes periodes.

Ticket TEL-302 - Bloc playstyle/zone dashboard membre

- Type: `feature`
- Priorite: P1
- Estimation: S
- Dependances: TEL-203
- Description:
  - afficher KPIs playstyle + discipline zone,
  - harmoniser labels avec page clan stats.
- Critere d'acceptation:
  - bloc visible et alimente pour `week|month|all`,
  - UX validee sur profils membre heterogenes.
- Etat: implemente (bloc playstyle + discipline zone ajoute sur `/members/[id]/dashboard`, connecte a `/api/members/[id]/telemetry/playstyle` avec periode synchronisee sur les stats principales).

Ticket TEL-303 - Decision produit recoveries + navigation ops

- Type: `ops`
- Priorite: P1
- Estimation: S
- Dependances: aucune
- Description:
  - arbitrer maintien ou migration page recoveries,
  - fixer emplacement navigation et permissions.
- Critere d'acceptation:
  - un seul point d'entree ops officiel,
  - documentation ops et menu aligns.
- Etat: livre (recoveries conservee comme console ops officielle + menu Owner + lien depuis Ops Cron).

### Epic E3 - Observabilite et rollout (P4)

Ticket TEL-401 - Dashboard metriques telemetry

- Type: `ops`
- Priorite: P0
- Estimation: M
- Dependances: TEL-202
- Description:
  - publier series temporelles `scanned/parsed/failed`, latences, bytes,
  - fournir vues 24h/7d/30d,
  - definir seuils d'alerte.
- Critere d'acceptation:
  - dashboard accessible sans SQL,
  - alertes minimales configurees.
- Etat: implemente (endpoint `/api/clans/[clanId]/telemetry/observability` enrichi avec health/p95/alertes, dashboard affiche sur `/clans/[clanId]/telemetry/recoveries`).

Ticket TEL-402 - Durcissement suite de tests telemetry

- Type: `qa`
- Priorite: P1
- Estimation: M
- Dependances: TEL-201, TEL-203
- Description:
  - non-regression parser v2 sur corpus reel,
  - tests idempotence rebuild,
  - tests contrats API.
- Critere d'acceptation:
  - pipeline CI telemetry vert,
  - couverture stable sur modules critiques.
- Etat: solide premier durcissement livre (tests de contrats API pour `member/weapons` et `clan/observability` + test d'idempotence du recalcul `period-aggregates`; socle parser/job deja vert). Extensions possibles ensuite sur rebuild de bout en bout si necessaire.

Ticket TEL-403 - Rollout pilote puis global

- Type: `ops`
- Priorite: P0
- Estimation: M
- Dependances: TEL-401, TEL-402, TEL-301
- Description:
  - sequence `flag off -> dry-run -> pilote -> global`,
  - surveillance 48h,
  - validation procedure rollback.
- Critere d'acceptation:
  - journal de rollout complete,
  - zero incident bloquant ouvert avant global.
- Etat: progression confirmee.
  - runbook dedie redige et complete (`docs/telemetrie-rollout.md`) avec checklist run-par-run pilote,
  - journal local renseigne (preflight + dry-run opere + verification post-run manuel),
  - page cron enrichie pour afficher les checks `.env` telemetry et reminders cron,
  - execution operationnelle pilote/global restant a mener sur l'environnement cible.

## Proposition de planning (2 sprints)

Sprint S1:

- TEL-201
- TEL-202
- TEL-203
- TEL-303 (done)

Objectif S1: fiabiliser la donnee telemetry et stabiliser les contrats API.

Sprint S2:

- TEL-301
- TEL-302
- TEL-401
- TEL-402
- TEL-403

Objectif S2: finaliser l'experience UI, poser l'observabilite production et acter le rollout.

## Vue dependances rapide

- TEL-201 -> TEL-202
- TEL-201 -> TEL-203
- TEL-203 -> TEL-301
- TEL-203 -> TEL-302
- TEL-202 -> TEL-401
- TEL-201 + TEL-203 -> TEL-402
- TEL-301 + TEL-401 + TEL-402 -> TEL-403

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
