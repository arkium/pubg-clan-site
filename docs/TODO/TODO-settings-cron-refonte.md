# TODO — Refonte de la page /settings/cron (pilotage cron SuperUser)

Créé le 2026-06-28. Décisions arrêtées le 2026-06-28. **Étapes 1–3 livrées le 2026-06-28.**

---

## Contexte

Les cron jobs sont **globaux** : chaque job (`daily_sync`, `daily_stats_recalc`, etc.) itère sur tous les clans actifs en base. La route `/clans/[clanId]/settings/cron` est donc un filtre de vue, pas une page de pilotage d'un cron dédié à un clan.

La page `/settings/cron` existait déjà mais n'était qu'une page de redirection vers `/clans/[clanId]/settings/cron`. Elle doit devenir la vraie page de pilotage global, réservée au SuperUser (cohérent avec TODO2 — le SuperUser est le seul à gérer les opérations cross-clan).

---

## Décisions arrêtées

| Point | Décision |
|---|---|
| Route principale | `/settings/cron` — vraie page de pilotage (plus une redirection) |
| Route à supprimer | `/clans/[clanId]/settings/cron/page.tsx` — supprimée |
| Accès | SuperUser uniquement (plus Owner) — cohérent avec l'architecture globale des crons |
| API backend | Inchangée : `GET/POST /api/clans/[clanId]/cron-control` reste pour les actions manuelles (avec le clan actif du SuperUser) |
| Modification des schedules | Étape optionnelle (voir Étape 4) — priorité basse |

---

## Architecture des workers — clarification

Il existe **trois pipelines distincts**, tous indépendants :

| Pipeline | Script | Mécanisme | Actions `CronExecution` |
|---|---|---|---|
| Cron scheduler | `cron-jobs.ts` (dans Next.js) | `node-cron`, schedulé | `daily_sync`, `daily_stats_recalc`, `daily_lifetime_stats_sync`, `daily_season_stats_sync`, `weekly_report_auto`, `monthly_report_auto` |
| Worker télémétrie | `npm run telemetry:worker` | Boucle infinie, poll 2s | `telemetry_resync_file` |
| Worker agrégats | `npm run telemetry:aggregates:worker` | Boucle infinie, poll 3s | `telemetry_recalc_aggregates` |

**Lien cron → télémétrie :** le job `daily_sync` exécute la télémétrie **en-process directement** (pas via les workers) :
```
daily_sync
  ├── syncTelemetryBatchForRecentSquadMatches()        ← télécharge + parse live
  └── recalculateTelemetryPeriodAggregatesForClan()    ← si parsed > 0
```
Les workers servent au **backfill/resync de fichiers capturés** — pipeline déclenché manuellement. Ils partagent la table `CronExecution` mais via des `action` différentes.

**Statut workers aujourd'hui :** aucune exposition API. Les métriques du `WorkerHealthMonitor` (jobs traités, taux d'échec, mémoire, `lastJobAt`) restent en mémoire locale et meurent avec le process. Par contre :
- Les lock fichiers (`.telemetry-resync-worker.lock`, `.telemetry-aggregate-worker.lock`) contiennent `workerId`, `pid`, `acquiredAt` — lisibles depuis l'API si même machine/FS
- La queue est interrogeable directement en base via les rows `CronExecution` avec `action = 'telemetry_resync_file'` / `'telemetry_recalc_aggregates'`

**Stratégie retenue pour le statut workers (sans modifier les scripts) :**
- Lire les lock fichiers depuis l'API → PID vivant ? âge du lock ?
- Lire la queue en base → `queued`, `running`, `success`, `failed` par type de worker
- Afficher la dernière exécution (`lastJobAt` déduit du dernier `CronExecution` en `success`)

---

## État actuel — lacunes identifiées

### Données disponibles dans l'API mais non affichées ✅ Résolu

| Donnée | État après livraison |
|---|---|
| Dernière exécution des 13 actions | ✅ Tableau complet avec toutes les `KNOWN_ACTIONS` |
| Métriques détaillées d'exécution (`details`) | ✅ Lignes expandables dans l'historique |
| Bouton `sync_stats` | ✅ Ajouté avec descriptif |
| Bouton `sync_telemetry_aggregates` | ✅ Ajouté avec descriptif |
| Statut workers télémétrie | ✅ Endpoint `GET /api/settings/cron-workers-status` + 3 panneaux |
| Stats queue telemetry (queued/running/failed) | ✅ Affiché dans les panneaux workers |

### Incohérences ✅ Résolues

- `type CronAction` complet : 6 actions incluant `sync_stats` et `sync_telemetry_aggregates`
- Checks de config partitionnés en 3 groupes (Système & API, Télémétrie, Schedules)
- Expressions cron dans leur propre groupe avec description FR en évidence
- Section statique supprimée
- Historique paginé 10 lignes + filtres Action/Statut + `take: 200` côté API

---

## Structure cible de la page `/settings/cron`

```
┌─────────────────────────────────────────────────────┐
│  En-tête : titre + badge cron worker + badges       │
│            erreurs/warnings config                  │
├─────────────────────────────────────────────────────┤
│  Cards métriques (4) :                              │
│  Taux succès | Total récent | En cours | Échecs     │
├─────────────────────────────────────────────────────┤
│  Statut des workers (3 panneaux côte à côte)        │
│  ┌──────────────────┐ ┌──────────────┐ ┌─────────┐ │
│  │ Cron scheduler   │ │telemetry:    │ │aggreg.: │ │
│  │ (Next.js)        │ │worker        │ │worker   │ │
│  │ initialized: oui │ │PID: 1234     │ │PID: -   │ │
│  │ jobs activés: oui│ │lock âge: 2m  │ │inactif  │ │
│  │                  │ │queue: 3/0/0  │ │queue:0/ │ │
│  └──────────────────┘ └──────────────┘ └─────────┘ │
├─────────────────────────────────────────────────────┤
│  Tableau "Dernière exécution par action"            │
│  Source : latestByAction — une ligne par action     │
│  Colonnes : Action | Statut | Début | Durée | Source│
│  (pas de pagination — 13 actions max, statique)     │
├─────────────────────────────────────────────────────┤
│  Actions manuelles (6 boutons) :                    │
│  sync_matches | sync_stats | sync_telemetry_agg     │
│  sync_lifetime_stats | rapport hebdo | rapport mensuel│
├─────────────────────────────────────────────────────┤
│  Configuration — 3 groupes (accordéons ou onglets) :│
│    • Système & API (NODE_ENV, DATABASE_URL, …)      │
│    • Télémétrie (ENABLE_TELEMETRY_*, …)             │
│    • Schedules cron (expressions + description FR)  │
│  + Rate limit PUBG API (snapshot)                   │
├─────────────────────────────────────────────────────┤
│  Historique — pagination 10 lignes + filtres        │
│  Filtres : Action (select) | Statut (select)        │
│  Colonnes : Action | Statut | Début | Durée |       │
│             Source | Message                        │
│  Ligne expandable → details JSON                    │
│    (importedMatches, telemetrySync.parsed/failed,   │
│     membersTotal, seasonRefreshed, masteryRefreshed)│
└─────────────────────────────────────────────────────┘
```

---

## Étapes d'implémentation

### Étape 1 — Supprimer la route par clan ✅ Livré

- [x] Supprimer `src/app/clans/[clanId]/settings/cron/page.tsx`
- [x] Dans `src/lib/nav-permissions-registry.ts` : entrée `owner.cron` supprimée, entrée `superuser.cron → /settings/cron` créée
- [x] Dans `src/app/settings/cron/page.tsx` : logique de redirection supprimée, remplacée par la vraie page

### Étape 2 — Réécrire `/settings/cron/page.tsx` ✅ Livré

**2a. En-tête**
- [x] Titre "Ops Cron (global)"
- [x] Badge statut cron worker
- [x] Badges erreurs/warnings de la config
- [x] Indicateur du clan actif (#id)

**2b. 4 cards métriques**
- [x] Taux de succès récent, exécutions récentes, en cours, échecs récents

**2c. Statut des workers — 3 panneaux**
- [x] Chapeau explicatif sur les 3 processus indépendants
- [x] Endpoint `GET /api/settings/cron-workers-status` créé (`src/app/api/settings/cron-workers-status/route.ts`)
  - [x] Lecture `.telemetry-resync-worker.lock` (pid, acquiredAt, PID vivant)
  - [x] Lecture `.telemetry-aggregate-worker.lock`
  - [x] Stats queue via `getTelemetryResyncQueueStats()` et `getTelemetryAggregateRecalcQueueStats()`
- [x] `getTelemetryAggregateRecalcQueueStats()` créée dans `aggregate-recalc-queue.ts`
- [x] 3 panneaux affichant : badge vivant/inactif, âge du lock, queued/running/failed/terminés

**2d. Tableau "Dernière exécution par action"**
- [x] Chapeau explicatif (scheduler vs manuel)
- [x] 13 actions affichées via `KNOWN_ACTIONS`, ligne vide si aucune exécution
- [x] Colonnes : Action | Statut | Début | Durée | Source

**2e. Actions manuelles — 6 boutons**
- [x] 6 boutons : sync_matches, sync_stats, sync_telemetry_aggregates, sync_lifetime_stats, rapport hebdo, rapport mensuel
- [x] Descriptif fonctionnel sous chaque bouton
- [x] Type `CronAction` complet

**2f. Configuration — 3 groupes**
- [x] Chapeau explicatif error vs warning
- [x] Groupe "Système & API" (clés hors `telemetry_*` et `_cron`)
- [x] Groupe "Télémétrie" (clés `telemetry_*`)
- [x] Groupe "Schedules cron" (clés `*_cron`)
- [x] Rate limit PUBG API dans panneau séparé

**2g. Historique — pagination + filtres**
- [x] Chapeau explicatif (scheduler + manuel + workers)
- [x] Pagination 10 lignes par page (précédent/suivant + numéro)
- [x] Filtre Action (`<select>` dynamique sur les actions distinctes)
- [x] Filtre Statut (running/success/partial/failed)
- [x] Réinitialisation des filtres + compteur de résultats
- [x] Lignes expandables (chevron) pour afficher `details` (importedMatches, telemetrySync, membersTotal, etc.)
- [x] `getCronOverview` modifié pour accepter `take` — route passe `take: 200`

### Étape 3 — Protéger la route côté auth ✅ Livré

- [x] `src/app/settings/cron/page.tsx` : vérification `isSuperUser` — redirect `/` si non SuperUser, redirect `/login` si non authentifié
- [x] Clan actif manquant → message d'erreur explicite avec lien vers `/clans`
- [x] `src/app/api/settings/cron-workers-status/route.ts` : protégé par `isSuperUserSession`
- [x] `src/lib/nav-permissions-registry.ts` : entrée `owner.cron` supprimée, `superuser.cron` créée

### Étape 4 — Modification des fréquences depuis l'UI (optionnel, priorité basse)

Aujourd'hui les expressions cron sont lues depuis `process.env` au démarrage — impossible à changer sans redémarrer le serveur.

**Migration Prisma**
- [ ] Créer la table `CronSchedule` :

```prisma
model CronSchedule {
  key        String   @id  // ex: 'daily_sync', 'daily_stats_recalc'
  expression String        // ex: '0 2 * * *'
  timezone   String   @default("UTC")
  updatedAt  DateTime @updatedAt
  updatedBy  Int?
}
```

- [ ] Générer et appliquer la migration

**`src/lib/cron-jobs.ts`**
- [ ] Au bootstrap (`initializeCronJobs`), lire les expressions depuis `CronSchedule` en priorité, `.env` en fallback
- [ ] Exposer une fonction `rescheduleJob(key, newExpression)` : `task.stop()` + créer un nouveau `ScheduledTask`

**API**
- [ ] Ajouter `PUT /api/settings/cron-schedules` (SuperUser uniquement) : valider l'expression via `cron.validate()`, persister en base, appeler `rescheduleJob`

**UI**
- [ ] Dans la section "Schedules" (Étape 2e) : rendre les expressions éditables (champ texte inline + bouton Appliquer)
- [ ] Validation côté client de l'expression cron avant envoi
- [ ] Feedback immédiat (succès/erreur)

---

## Fichiers impactés

| Fichier | Action | État |
|---|---|---|
| `src/app/clans/[clanId]/settings/cron/page.tsx` | Supprimer | ✅ Supprimé |
| `src/app/settings/cron/page.tsx` | Réécrire (vraie page SuperUser) | ✅ Livré |
| `src/lib/nav-permissions-registry.ts` | `owner.cron` supprimé, `superuser.cron` ajouté | ✅ Livré |
| `src/app/api/clans/[clanId]/cron-control/route.ts` | `take: 200` dans `getCronOverview` | ✅ Livré |
| `src/app/api/settings/cron-workers-status/route.ts` | Créer (lock fichiers + stats queue) | ✅ Créé |
| `src/lib/cron-observability.ts` | `getCronOverview` accepte `take` | ✅ Livré |
| `src/lib/pubg-telemetry/aggregate-recalc-queue.ts` | Ajout `getTelemetryAggregateRecalcQueueStats` | ✅ Livré |
| `src/lib/cron-jobs.ts` | Étape 4 seulement | En attente |
| `prisma/schema.prisma` | Étape 4 seulement | En attente |

---

## Suggestions futures (non planifiées)

### Purge de l'historique cron

**Contexte :** La table `CronExecution` accumule les entrées de deux types distincts :

- **Entrées scheduler** (`daily_sync`, `sync_matches`, etc.) : ~6 lignes × N clans par jour. Volume très faible, pas de pression sur la DB même après plusieurs mois.
- **Entrées télémétrie** (`telemetry_resync_file`, `telemetry_recalc_aggregates`) : une ligne par fichier téléchargé, accumulation rapide. **Déjà couverte** par le cleanup existant dans le dashboard télémétrie via `POST /api/clans/[clanId]/telemetry/queue-cleanup` (actions `cleanup-stale`, `cleanup-failed`).

**Conclusion :** Un bouton de purge dans `/settings/cron` n'est pas nécessaire en l'état. La pression vient des entrées télémétrie qui ont déjà leur mécanisme.

**Si le besoin évolue, deux pistes :**

1. **Lien rapide vers le dashboard télémétrie** depuis le panneau workers de `/settings/cron` — une ligne de code, évite de naviguer manuellement pour déclencher le cleanup.
2. **Purge automatique des entrées scheduler > 90 jours** — à implémenter comme tâche cron dédiée (`cleanup_old_cron_history`) plutôt que comme bouton UI, pour ne pas exposer une opération destructive dans l'interface. Cible : entrées avec `action NOT IN ('telemetry_resync_file', 'telemetry_recalc_aggregates')` et `finishedAt < NOW() - 90 jours`.

---

## Références

- Architecture cron globale : `src/lib/cron-jobs.ts`
- API de contrôle : `src/app/api/clans/[clanId]/cron-control/route.ts`
- Hiérarchie de rôles : `docs/TODO/TODO2.md`
- Documentation cron ops : `docs/ops/cron.md`
