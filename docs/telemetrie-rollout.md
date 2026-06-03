# Runbook rollout telemetry (TEL-403)

Ce document decrit la sequence de rollout recommandee pour activer la telemetry clan en production de facon progressive, observable et reversible.

Objectif:

- activer la sync telemetry sans perturber la sync matchs existante,
- verifier la stabilite sur un clan pilote avant extension globale,
- disposer d'un rollback simple base sur les flags et les ecrans ops deja livres.

## Prerequis

Avant tout rollout, verifier les points suivants:

- les migrations Prisma telemetry sont deployees sur la base cible,
- le worker cron est unique et porte `ENABLE_CRON_JOBS=true`,
- le worker cron a `TELEMETRY_SYNC_ENABLED=false` au depart,
- `TELEMETRY_PARSER_VERSION` est renseignee et correspond a la version voulue (actuellement `v2` si le rebuild parserVersion fait partie du rollout),
- `TELEMETRY_MAX_MATCHES_PER_RUN` et `TELEMETRY_SYNC_CONCURRENCY` sont fixes a des valeurs prudentes,
- la console ops telemetry `/clans/[clanId]/telemetry/recoveries` est accessible a un Owner,
- la page cron `/clans/[clanId]/settings/cron` remonte bien la sante et l'historique.

Valeurs de depart recommandees:

- `TELEMETRY_SYNC_ENABLED=false`
- `TELEMETRY_MAX_MATCHES_PER_RUN=10`
- `TELEMETRY_SYNC_CONCURRENCY=1`
- `TELEMETRY_RETRY_MAX=2`
- `TELEMETRY_FETCH_TIMEOUT_MS=30000`

## Ecrans et signaux a surveiller

Sources UI:

- `/clans/[clanId]/settings/cron`
- `/clans/[clanId]/telemetry/recoveries`

Signaux attendus pendant le rollout:

- `CronExecution` en `success` ou `partial` maitrise, sans derive d'echecs repetes,
- dashboard observability avec `failedRate` contenu et p95 techniques stables,
- recoveries avec proportion croissante de snapshots `success`,
- absence d'impact visible sur les parcours UI membre/clan deja relies a la telemetry.

Alertes de vigilance:

- hausse continue de `failed_rate`,
- p95 `parseMs` ou `downloadAssetMs` anormalement haut,
- backlog `failed` ou `rebuild` qui grossit sur plusieurs runs,
- erreurs repetitives `ASSET_URL_MISSING`, timeouts ou erreurs CDN,
- ralentissement sensible du cron `daily_sync` par rapport au comportement pre-rollout.

## Journal de rollout

Renseigner un journal simple au fil du rollout:

| Date/heure | Etape | Scope | Config | Resultat | Actions correctives |
| --- | --- | --- | --- | --- | --- |
| 2026-06-03 19:xx | Preflight | local (`localhost`) | `ENABLE_CRON_JOBS=false`, telemetry auto non active (runs `skipped`), recoveries UI accessible | OK partiel: prerequis schema/UI valides, etat coherent pour demarrage pilote | Avant pilote auto: activer worker cron dedie + fixer explicitement `TELEMETRY_SYNC_ENABLED=true`, `TELEMETRY_MAX_MATCHES_PER_RUN`, `TELEMETRY_SYNC_CONCURRENCY` |
| 2026-06-03 19:xx | Dry-run opere (manuel) | clan `1` local | telemetry auto toujours inactive, verification via console recoveries | OK: `16` lignes, `16` success, `0` failed, dashboard cron telemetry en `skipped` (pas de lot auto) | Pour passer pilote auto: activer le worker cron et la sync telemetry auto avec debit prudent (`max=10`, `concurrency=1`) |
| 2026-06-03 21:xx | Verification post-run manuel | clan `1` local | action `Sync matchs` lancee depuis `/settings/cron` | OK: run manuel `success` avec `4` matchs importes (duree ~107.6 s), checks cron sans erreur bloquante | Readiness confirmee pour pilote auto; rester prudent sur la marge rate-limit PUBG (remaining bas observe) |

## Etape 0 - Preflight

Objectif: verifier que l'environnement cible est pret sans activer la sync telemetry automatique.

Checklist:

1. Confirmer que les tables `SquadMatchTelemetry`, `MemberWeaponStats`, `MemberTelemetryStats` et `ClanSynergyTelemetryStats` existent.
2. Confirmer qu'au moins un clan actif existe et qu'un Owner peut ouvrir les pages ops.
3. Confirmer que les routes UI telemetry fonctionnent en lecture.
4. Confirmer que les tests telemetry sont verts sur la revision candidate.
5. Confirmer que `TELEMETRY_SYNC_ENABLED=false` sur le worker cron.

Critere de sortie:

- aucune erreur bloquante de schema ou de permission,
- dashboard recoveries accessible,
- historique cron lisible.

## Etape 1 - Dry-run opere

Objectif: observer le pipeline sur un perimetre strictement controle avant activation automatique large.

Sequence:

1. Laisser `TELEMETRY_SYNC_ENABLED=false`.
2. Choisir un clan pilote avec historique recent et volume de matchs raisonnable.
3. Utiliser les actions manuelles existantes pour rafraichir les matchs du clan si necessaire.
4. Depuis la page matchs/session ou la console recoveries, lancer une recuperation telemetry manuelle sur un lot court.
5. Verifier les statuts des snapshots et les metriques d'observability.

Ce que l'on valide a ce stade:

- les snapshots `success`/`failed` sont coherents,
- les erreurs sont actionnables sans SQL manuel,
- les pages membre/clan lisent correctement les nouvelles donnees,
- le parser actif et les aggregats periodiques produisent des donnees plausibles.

Critere de sortie:

- pas d'erreur systemique sur le lot manuel,
- observability exploitable,
- rollback non necessaire sur le dry-run.

## Etape 2 - Pilote automatise

Objectif: activer la sync telemetry automatique avec debit minimal et surveillance rapprochee.

Configuration recommandee:

- `TELEMETRY_SYNC_ENABLED=true`
- `TELEMETRY_MAX_MATCHES_PER_RUN=10`
- `TELEMETRY_SYNC_CONCURRENCY=1`

Sequence:

1. Activer le flag sur le worker cron.
2. Redemarrer seulement le worker concerne.
3. Surveiller les premiers runs `daily_sync` et leur sous-partie telemetry.
4. Controler le clan pilote sur au moins 48 h ou plusieurs runs complets, selon la cadence reelle.

Points de controle:

- statut des runs `daily_sync` dans la page cron,
- totaux, p95 et alertes sur `/telemetry/recoveries`,
- absence de derive du backlog `failed/pending/rebuild`,
- UI pilote non vide sur `/members/[id]/weapons`, `/members/[id]/dashboard` et `/clans/[clanId]/stats`.

Critere de sortie:

- pas d'incident bloquant ouvert,
- taux d'echec stable et explique,
- performance cron compatible avec la fenetre de traitement,
- journal de rollout complete.

## Etape 3 - Extension globale progressive

Objectif: etendre l'activation a tous les clans actifs sans changer brutalement le debit.

Approche recommandee:

1. Conserver `TELEMETRY_SYNC_ENABLED=true`.
2. Monter d'abord `TELEMETRY_MAX_MATCHES_PER_RUN` avant la concurrence.
3. N'augmenter `TELEMETRY_SYNC_CONCURRENCY` qu'apres stabilisation des temps de download/parse.
4. Verifier apres chaque palier que les alertes et le backlog restent maitrises.

Paliers prudents proposes:

- palier 1: `max=10`, `concurrency=1`
- palier 2: `max=25`, `concurrency=1`
- palier 3: `max=25`, `concurrency=2`
- palier 4: `max=50`, `concurrency=2`

Critere de sortie:

- backlog normalise,
- aucun pic durable de `failedRate`,
- UI telemetry exploitable sur plusieurs clans actifs,
- plus besoin d'interventions manuelles recurrentes.

## Etape 4 - Rebuild parserVersion si necessaire

Cette etape ne s'applique que si le rollout inclut un rattrapage v1 -> v2 ou toute future migration de parser.

Avant de lancer le rebuild:

- verifier que le pilote automatique est stable,
- confirmer la valeur de `TELEMETRY_PARSER_VERSION`,
- estimer le backlog `rebuild` depuis les ecrans ops.

Conduite recommandee:

1. Garder un debit faible tant que le backlog `rebuild` est dominant.
2. Suivre `reprocessed`, `queued.rebuild` et les p95 techniques.
3. Ne pas augmenter les curseurs tant que le backlog ne diminue pas clairement.

Critere de sortie:

- backlog `rebuild` sous controle ou vide,
- aggregates periodiques stables,
- aucune duplication visible cote UI.

## Rollback

Le rollback prioritaire doit rester simple et rapide.

Sequence de rollback:

1. Repasser `TELEMETRY_SYNC_ENABLED=false` sur le worker cron.
2. Redemarrer le worker cron.
3. Verifier qu'aucun nouveau lot telemetry auto ne repart.
4. Continuer a utiliser la console recoveries pour diagnostiquer l'etat existant.
5. Si necessaire, masquer temporairement les entrees UI telemetry dependantes du scope impacte.

Ce que l'on ne fait pas en premier recours:

- suppression de masse des snapshots existants,
- reinitialisation destructive des agregats sans analyse,
- rollback DB tant qu'un arret par flag suffit.

Critere de rollback valide:

- sync matchs principale conservee,
- telemetry automatique stoppee,
- etat du systeme encore observable.

## Definition of Done TEL-403

TEL-403 peut etre considere termine quand les conditions suivantes sont remplies:

- un journal de rollout a ete renseigne du preflight au global,
- le pilote automatique est reste stable au moins 48 h,
- la console ops permet de diagnostiquer les incidents sans SQL manuel,
- la procedure de rollback a ete relue et testee au moins une fois sur environnement cible.
