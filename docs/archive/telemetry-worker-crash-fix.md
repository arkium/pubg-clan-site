# Worker télémétrie — crash silencieux et correctifs

Ce document retrace le diagnostic et les correctifs appliqués au worker `npm run telemetry:worker` qui crashait silencieusement après avoir traité 1 à 3 jobs.

## Symptôme

Le worker affichait `[TelemetryResyncWorker] job claimed` puis la console retournait au prompt PS sans aucun message d'erreur. Aucun handler Node.js (`uncaughtException`, `unhandledRejection`) n'était déclenché. L'exit code était **5** (V8 fatal error).

## Diagnostic — deux problèmes distincts

### Problème 1 : jobs bloqués en statut `running`

Chaque crash laissait le job en statut `running` dans la table `CronExecution`. Au prochain démarrage, `claimNextTelemetryResyncQueueJob` ne cherche que les jobs en statut `queued` — les jobs bloqués étaient invisibles. Le worker démarrait, ne trouvait rien, et attendait indéfiniment.

**Preuve :** 9 jobs en statut `running` accumulés sans jamais être retraités.

### Problème 2 : bug `Readable.toWeb()` dans Node.js 22

La cause racine du crash : `Readable.toWeb()` a un bug de fuite mémoire pour les streams séquentiels dans Node.js 22. Après le premier parse réussi, les ressources internes du stream ne sont pas libérées correctement. Le deuxième parse déclenche un V8 Fatal Error (OOM interne ou corrution d'état).

**Preuve reproductible** (sans Prisma, purement Node.js) :

```
node --max-old-space-size=512 tsx scripts/debug-parse-telemetry.ts fichier1.json fichier2.json

# Résultat avec Readable.toWeb() :
parsing: fichier1.json
before: heap=9MB rss=82MB
done: events=44359
after: heap=23MB rss=115MB

parsing: fichier2.json     ← CRASH exit code 5 ici
before: heap=23MB rss=115MB

# Résultat avec l'adaptateur custom :
parsing: fichier1.json  →  after: heap=22MB rss=121MB
parsing: fichier2.json  →  after: heap=23MB rss=125MB
parsing: fichier3.json  →  after: heap=35MB rss=129MB
all done
```

Le crash arrivait à 115MB RSS — largement sous la limite des 512MB. Ce n'était pas un OOM JS ordinaire mais une corruption interne de `Readable.toWeb()`.

## Correctifs appliqués

### 1. Recovery des jobs bloqués au démarrage

Fichier : [resync-queue.ts](../src/lib/pubg-telemetry/resync-queue.ts)

Fonction `recoverStuckTelemetryResyncJobs` : au démarrage du worker, les jobs en statut `running` depuis plus de 10 minutes sont automatiquement remis en `queued`.

```typescript
const recovered = await recoverStuckTelemetryResyncJobs(workerId)
if (recovered > 0) {
  console.warn('[TelemetryResyncWorker] recovered stuck jobs', { workerId, recovered })
}
```

Fichier : [telemetry-resync-worker.ts](../scripts/telemetry-resync-worker.ts)

### 2. Remplacement de `Readable.toWeb()` par un adaptateur manuel

Fichier : [resync-files.ts](../src/lib/pubg-telemetry/resync-files.ts)

```typescript
function nodeReadableToWebStream(readable: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      readable.on('data', (chunk) => {
        controller.enqueue(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk))
        readable.pause()               // backpressure
      })
      readable.on('end', () => controller.close())
      readable.on('error', (err) => controller.error(err))
    },
    pull() { readable.resume() },      // déblocage chunk suivant
    cancel() { readable.destroy() },   // cleanup garanti
  })
}
```

Avantages vs `Readable.toWeb()` :
- Backpressure explicite (`pause()/resume()`) : le GC a le temps de tourner entre chaque chunk de 64KB
- Cleanup garanti via `readable.destroy()` sur `cancel()`
- Pas de fuite de handles libuv entre parses successifs

### 3. Handlers de crash explicites

Fichier : [telemetry-resync-worker.ts](../scripts/telemetry-resync-worker.ts)

```typescript
process.on('uncaughtException', (error) => {
  console.error('[TelemetryResyncWorker] uncaughtException', { error: error.message, stack: error.stack })
  process.exit(1)
})

process.on('unhandledRejection', (reason) => {
  console.error('[TelemetryResyncWorker] unhandledRejection', { reason: String(reason) })
  process.exit(1)
})
```

Ces handlers ne capturent pas les V8 Fatal Errors (exit code 5) — ceux-ci sont par nature non interceptables — mais capturent toutes les erreurs JS non gérées.

## Comportement après correctifs

Au démarrage du worker :
1. Logs `recovered stuck jobs: N` si des jobs étaient bloqués
2. Traitement continu de la queue sans crash inter-jobs
3. Memory stable sur N jobs successifs (RSS ne s'accumule plus)

## Archivage de la méthode de diagnostic

La méthode ayant permis de trouver le bug :

1. Ajout de logs `process.stdout.write` (synchrone) à chaque étape du job
2. Identification que le crash était entre `before-parse` et `after-parse`
3. Test isolé du parser seul : OK
4. Test de 3 parses séquentiels avec `Readable.toWeb()` : crash exit code 5 dès le 2e
5. Même test avec adaptateur manuel : OK sur tous les fichiers

## Versions concernées

- Node.js : v22.22.3 (bug confirmé)
- `@prisma/client` : ^6.19.3
- Taille fichiers télémétrie : 22–34 MB (JSON PUBG)
