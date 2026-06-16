# Guide d'utilisation: Synchronisation télémétrie robuste

## Pour les développeurs

### Scenario 1: Tester une nouvelle feature télémétrie sans crash

```bash
# Terminal 1: Serveur web
npm run dev

# Terminal 2: Enqueue quelques matches
npm run telemetry:batch -- --clan 1 --verbose

# Terminal 3: Worker en one-shot (exit après traitement)
npm run telemetry:worker:once

# Vérifier les résultats
npm run telemetry:batch -- --check --clan 1
```

**Avantage**: Le serveur web ne freeze pas, worker traite indépendamment.

### Scenario 2: Après ajout de nouvelles colonnes d'agrégats

```bash
# 1. Modifier le schema: src/lib/pubg-telemetry/period-aggregates.ts
# 2. Migration Prisma: npx prisma migrate dev
# 3. Recalculer tous les agrégats

npm run telemetry:batch -- --all-clans --recalc-aggregates-only --verbose

# Vérifier
npm run telemetry:batch -- --check
```

**Note**: Les agrégats sont calculés **after** chaque sync si activé. Mais after dev, on peut recalc indépendamment.

### Scenario 3: Debug d'un match qui ne synce pas

```bash
# 1. Enqueue 1 match spécifique
npm run telemetry:batch -- --clan 1

# 2. Vérifier queue avant
npm run telemetry:batch -- --check --clan 1 --verbose

# 3. Lancer worker avec debug
npm run telemetry:worker:once

# 4. Vérifier status après
curl http://localhost:3000/api/clans/1/telemetry/sync-batch-manual
```

**Logs utiles**:
```bash
# Voir les détails du job échoué
SELECT * FROM CronExecution 
WHERE action='telemetry_resync_file' 
AND status='failed' 
ORDER BY createdAt DESC LIMIT 1
\G
```

---

## Pour l'administration production

### Setup initial

```bash
# 1. Vérifier Node.js >= 20
node --version

# 2. Installer dépendances
npm install

# 3. Tester mode dev
npm run telemetry:batch -- --check --clan 1

# 4. Tester worker
npm run telemetry:worker:once
```

### Stratégie batch

**Approche A: Worker toujours actif** (recommandé)
```bash
# Terminal dédié: worker qui traite en boucle
npm run telemetry:worker

# Enqueue jobs via cron/web au besoin
# Worker les traite automatiquement
```

**Approche B: Batch périodique via cron**
```bash
# /etc/cron.d/telemetry
# Toutes les 6h: sync recent matches
0 */6 * * * app /app/scripts/cron-telemetry-batch.sh >> /var/log/telemetry.log 2>&1

# Tous les jours 2AM: recalc aggregates
0 2 * * * app /app/scripts/cron-aggregates-batch.sh >> /var/log/telemetry.log 2>&1
```

**Approche C: Hybrid** (Production typique)
- Worker tourne 24/7 dans systemd/docker
- Cron enqueue les batchs au besoin
- Web UI pour interventions manuelles

### Monitoring

```bash
# Dashboard: voir les statuts en temps réel
curl http://api.prod/api/clans/1/telemetry/sync-batch-manual

# Logs systemd
journalctl -u telemetry-worker -f --since "1 hour ago"

# Alertes: si queue jamais vide mais jobs pending
watch -n 5 'curl -s http://localhost:3000/api/clans/1/telemetry/sync-batch-manual | jq .queue'
```

### Scenarios d'urgence

**Cas A: Queue surchargée (100+ jobs pending)**
```bash
# STOP worker immédiatement
kill $(pgrep -f "telemetry:worker")

# Vérifier ce qui se passe
npm run telemetry:batch -- --check --verbose

# Restart selective (une seule queue à la fois)
npm run telemetry:batch -- --clan 1 --all-matches  # Enqueue uniquement cette queue
# Puis restart worker
npm run telemetry:worker
```

**Cas B: Worker crash/memory leak**
```bash
# Vérifier si c'est bien un crash
ps aux | grep telemetry
# Si absent: redémarrer
npm run telemetry:worker &

# Si memory utilisée continue d'augmenter:
# C'est Phase 2 (streaming + GC) qu'il faut implémenter
# Pour l'instant: limiter batch size via TELEMETRY_RESYNC_BATCH_SIZE
export TELEMETRY_RESYNC_BATCH_SIZE=2
npm run telemetry:worker
```

**Cas C: Database connection pool saturée**
```bash
# Attendre que worker traite les jobs (il ferme les connexions)
npm run telemetry:batch -- --check

# Si toujours saturée: redémarrer database connection pool
# (dépend de ton infra PostgreSQL/MySQL)
```

---

## Architecture recommandée

### Development
```
┌─────────────────────────────┐
│   npm run dev               │  Port 3000
│   (serveur web)             │
└──────────────┬──────────────┘
               │
               └─→ POST /sync-batch-manual
                  (enqueue quick)
                  
┌──────────────────────────────┐
│ npm run telemetry:worker:once│  Terminal 2
│ (traite 1-5 jobs, exit)      │  Ou: watch mode
└──────────────────────────────┘
```

### Production (Kubernetes)
```
┌────────────────────────────┐
│  API Pod (Next.js)         │  Replicas: 3-5
│  • /sync-batch-manual      │  Max mem: 512MB
│  • GET status              │
└────────────────────────────┘
         │
         ├─→ Database (shared)
         │
         └─→ Redis (optional, future)
         
┌────────────────────────────┐
│  Worker Pod (Node.js)      │  Replicas: 1-2
│  • npm run telemetry:worker│  Max mem: 1GB
│  • Claims 1 job at a time  │  Retry: 3x
│  • Recalc aggs on demand   │
└────────────────────────────┘
```

### Production (VPS/Bare metal)
```
# systemd service
[Unit]
Description=PUBG Telemetry Worker
After=network.target

[Service]
Type=simple
User=app
WorkingDirectory=/app
Environment="NODE_ENV=production"
Environment="TELEMETRY_RESYNC_BATCH_SIZE=5"
ExecStart=/usr/bin/npm run telemetry:worker
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target

# Puis: sudo systemctl enable telemetry-worker
```

---

## Checklist: Avant de passer en production

- [ ] Tester sync 50 matches, vérifier pas de crash
- [ ] Tester recalc-aggregates sur tous les clans
- [ ] Vérifier mémoire ne dépassé pas 1GB (Phase 2 obligatoire si dépassé)
- [ ] Tester kill worker mid-job, vérifier job re-enqueue
- [ ] Setup systemd/docker pour worker auto-restart
- [ ] Setup logs rotation + monitoring
- [ ] Documenter procédure pour developers
- [ ] Ajouter alertes: "Worker down" + "Queue > 100"
- [ ] Planifier Phase 2: streaming + memory protection

---

## Commands de référence rapide

```bash
# Sync
npm run telemetry:batch -- --clan 1
npm run telemetry:batch -- --all-clans
npm run telemetry:batch -- --clan 1 --all-matches

# Agrégats
npm run telemetry:batch -- --clan 1 --recalc-aggregates-only
npm run telemetry:batch -- --all-clans --recalc-aggregates-only

# Worker
npm run telemetry:worker          # Boucle infini
npm run telemetry:worker:once     # Une seule fois

# Monitor
npm run telemetry:batch -- --check
npm run telemetry:batch -- --check --clan 1 --verbose

# API
curl http://localhost:3000/api/clans/1/telemetry/sync-batch-manual
curl -X POST http://localhost:3000/api/clans/1/telemetry/recalc-aggregates-batch \
  -H "Content-Type: application/json" \
  -d '{"scope": "clan"}'
```

---

## FAQ

**Q: Pourquoi worker en process séparé?**
A: Eviter que le parsing télémétrie (lourd) freeze le serveur web.

**Q: Peut-on avoir 2 workers simultanément?**
A: Oui! Chacun claim 1 job de façon atomique. Pas de conflit.

**Q: Mémoire augmente indéfiniment?**
A: C'est normal pour la v1. Phase 2 ajoute GC + streaming. À mettre en place avant prod 1000+ matches.

**Q: Queue stuck, comment reset?**
A: À implémenter en Phase 2: endpoint POST /queue-cleanup qui peut reset failed jobs.

**Q: Peut-on mixer web + CLI?**
A: Oui! Web enqueue, CLI monitor, worker traite tout indifféremment.

**Q: Combien de temps pour 100 matches?**
A: ~30-60s par match en moyenne (dépend de la size télémétrie). Donc 100 matches = ~1-2h.
