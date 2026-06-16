# Resync worker et statut runtime dev

Cette page documente les ajouts faits pour fiabiliser le resync telemetry en developpement et clarifier les faux "crashs" au lancement de `npm run dev`.

## Objectif

- Eviter que le resync lourd casse l'experience web de developpement.
- Distinguer "serveur non demarre" de "serveur deja actif".
- Donner un flux operatoire stable pour les lots telemetry.

## Changements techniques

### 1) Queue persistante de resync fichiers

- Service: `src/lib/pubg-telemetry/resync-queue.ts`
- Stockage: table existante `CronExecution`
- Action queue: `telemetry_resync_file`
- Statuts utilises: `queued`, `running`, `success`, `failed`
- Deduplication: un match deja `queued/running` n'est pas reenfile.

### 2) Endpoint enqueue (UI -> queue)

- Route: `POST /api/clans/[clanId]/telemetry/resync-files-queue`
- Fichier: `src/app/api/clans/[clanId]/telemetry/resync-files-queue/route.ts`
- Securite: `Owner` obligatoire sur le clan.
- Payload:
  - `squadMatchIds: string[]`
  - `resetBeforeSync: boolean`
  - `recalculateAggregates: boolean`

### 3) Worker dedie hors process web

- Script: `scripts/telemetry-resync-worker.ts`
- Commandes:
  - `npm run telemetry:worker`
  - `npm run telemetry:worker:once`
- Le worker:
  - claim 1 job,
  - traite 1 match,
  - met a jour `CronExecution` en succes/echec,
  - recalcule les aggregates si demande.

### 4) Extraction traitement resync fichier

- Fichier: `src/lib/pubg-telemetry/resync-files.ts`
- Reutilise par:
  - la route resync existante,
  - le worker dedie.

### 5) Indicateur visuel runtime serveur dev

- Route runtime: `GET /api/clans/[clanId]/dev/runtime-status`
- Fichier route: `src/app/api/clans/[clanId]/dev/runtime-status/route.ts`
- UI: `src/app/clans/[clanId]/matches/session/[date]/page.tsx`
- Affiche:
  - PID actif,
  - uptime,
  - version Node,
  - hostname.

But: rendre visible qu'un serveur est deja actif, au lieu de conclure a un crash immediat.

## Usage recommande

1. Lancer le web: `npm run dev` (une seule instance).
2. Dans la page session, utiliser `Queue worker` pour enfiler les matchs.
3. Lancer le worker dans un autre terminal: `npm run telemetry:worker`.
4. Verifier le badge runtime dans la page session pour confirmer le serveur actif.

## Notes de diagnostic

- Si `npm run dev` retourne rapidement avec code 1 et message d'instance deja active, ce n'est pas un crash applicatif.
- Si la page reste accessible et que les endpoints repondent `200`, le serveur est vivant.
- Les temps longs sur `resync-files-selected` (plusieurs dizaines de secondes) indiquent une charge de traitement, pas un arret automatique.
