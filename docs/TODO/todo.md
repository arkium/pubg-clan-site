# Points à faire — PUBG Clan Site

Suivi des tâches restantes, classées par priorité. Mis à jour au 2026-06-21.

---

## P1 — Bloquants / manques fonctionnels immédiats

### ~~Télémétrie — Backfill v1 → v2~~ — ✅ Complété le 2026-06-21

346 snapshots `SquadMatchTelemetry` — tous `status=success`, `parserVersion=v2`. Aucun snapshot v1 résiduel.

- [x] Vérifier quels matchs en DB ont `parserVersion = 'v1'`
- [x] Lancer le backfill depuis les fichiers `.telemetry-captured/` encore présents
- [x] Vérifier après exécution que `MemberWeaponStats` est complet
- [ ] Supprimer les fichiers capturés obsolètes une fois le backfill terminé

**Référence :** `docs/telemetry/ops.md` — section Backfill v1 → v2

---

### ~~Migration SQL production~~ — ✅ Appliquée le 2026-06-20

`prisma/add-telemetry-columns.sql` appliqué manuellement sur `smk.arkium.group:3306` puis supprimé du repo. Tables et colonnes présentes en production :
- `ALTER TABLE SquadMember` — 13 champs stats
- `ALTER TABLE MemberTelemetryStats` — 3 champs heal
- `CREATE TABLE MemberSeasonStats`
- `CREATE TABLE MemberWeaponMastery`

---

### Pages UI manquantes ou non finalisées

Plusieurs pages sont décrites dans les docs comme à créer mais n'ont pas été vérifiées comme réellement implémentées :

- [x] `/clans/[clanId]/drop-zones` — page et API présentes
- [x] `/members/[id]/drop-zones` — page et API présentes
- [x] Awards — 11 awards complets, service + route API + page UI avec emojis, labels, descriptions et formatage
- [ ] Défis — le déclenchement de la mise à jour de `progress` n'est pas implémenté (aucun cron ni webhook ne met à jour les scores en temps réel)

---

## P2 — Fonctionnalités incomplètes

### Challenges — Progression non automatisée

Le cycle de vie des challenges est géré par `processChallenges` dans `cron-jobs.ts` (activation auto des `pending`, clôture des `active` expirés). Mais `updateParticipantProgress` n'est appelée **nulle part** en dehors de sa définition dans `challenge-service.ts` — aucun code ne relie les matchs joués aux scores des participants :
- Aucun cron ne met à jour les scores des participants
- Le lien entre les matchs sync et les types `kill_race`, `damage_race`, etc. n'est pas câblé
- [ ] Câbler `updateParticipantProgress` depuis le cron de sync des matchs pour les types `kill_race` et `damage_race`
- [ ] Câbler le type `survival_expert` (placement moyen) depuis les `SquadMember` récents
- [ ] Câbler le type `win_streak` depuis les `SquadMatch.placement === 1`

---

### Push notifications — Infrastructure sans service

Les préférences `pushNotifications` sont stockées et lues, mais l'envoi réel est un simple `console.log`. Il n'y a aucun service push branché.

- [ ] Choisir un service (ex. Firebase FCM, Web Push via VAPID)
- [ ] Implémenter le backend d'abonnement (`POST /api/members/[id]/push-subscribe`)
- [ ] Remplacer le `console.log` dans `createNotificationForMember` par un vrai appel push

---

### Stats lifetime — Pas de ventilation par mode

`MemberLifetimeStats` agrège tous les modes (`solo`, `duo`, `squad`) ensemble via `aggregateGameModeStats()`. L'API PUBG fournit des données par mode.

- [ ] Stocker les stats par mode de jeu dans la table (nouvelles colonnes JSON `combatSquad`, `combatDuo`, `combatSolo`)
- [ ] Exposer le filtre par mode dans `GET /api/members/[id]/stats`
- [ ] Mettre à jour `MemberLifetimeStatsPanel` pour afficher le sélecteur de mode

---

### Auto-cleanup cron — Non branché

Le nettoyage des fichiers `.telemetry-captured/` et des jobs `failed` anciens est disponible via `queue-cleanup` mais n'est pas déclenché automatiquement.

- [ ] Ajouter un job cron nocturne qui appelle `queue-cleanup` (suppression jobs queued > 24h, jobs failed > 7j)
- [ ] Ajouter le nettoyage des fichiers `.telemetry-captured/` de plus de 30 jours

**Référence :** `docs/telemetry/overview.md` — section "Ce qui reste à faire"

---

### Streaming JSON parser

`resync-files.ts` charge encore les fichiers télémétrie en mémoire complète avant de les passer au parser, malgré un streaming partiel. Sur les fichiers > 30 Mo, le heap peut dépasser les 512 Mo du worker.

- [ ] Introduire un vrai streaming JSON (ex. librairie `jsonstream` ou `@streamparser/json`) pour éviter de tout charger avant de passer au parser
- [ ] Tester sur des fichiers de 35 Mo+ pour valider la réduction d'empreinte mémoire

---

## P3 — Améliorations et données non encore exploitées

### Events télémétrie non parsés

| Événement | Intérêt | Travail estimé |
|---|---|---|
| `LogPlayerUseThrowable` | Diversité tactique (grenades, molotovs) | 2–4h |
| `LogVehicleLeave.rideDistance` | Distance véhicule précise par session | 1–2h |
| `LogVehicleLeave.maxSpeed` | Vitesse max par session (JACKY TUNING complet) | 1h |
| `CharacterWrapper.primaryWeaponFirst` | Arme en main au moment des kills | 4–8h |

---

### Champs `SquadMember` non affichés

Ces champs sont stockés en DB depuis la migration P1.1 mais n'ont pas tous de vue dédiée :

- `headshotKills` par match — affiché dans la liste des matchs ?
- `teamKills` — affiché nulle part
- `swimDistance` — non affiché

---

### Cron — Rapports hebdomadaires / mensuels

Les routes `generateWeeklyReport` et `generateMonthlyReport` existent mais leur déclenchement automatique dépend d'une vérification que le cron est bien configuré et actif.

- [ ] Vérifier que le cron `weekly_report` est actif et déclenche `generateWeeklyReport`
- [ ] Vérifier que le cron `monthly_report` est actif et déclenche `generateMonthlyReport`
- [ ] Tester la génération d'un rapport complet (toutes les sections)

---

### Performances — Cache des awards

Le calcul des awards (`computeClanAwards`) est entièrement à la volée à chaque GET. Sur la période `all` avec un historique long, la requête charge plusieurs milliers de lignes sans cache.

- [ ] Ajouter un TTL cache côté route (ex. 10 min avec `Cache-Control` ou table `PlayerAwardsCache`)
- [ ] Alternative : pré-calculer et stocker les awards lors du recalcul quotidien des stats

---

## Technique

### Tests

- [ ] Aucun test n'existe actuellement en dehors de `test:telemetry` (Vitest limité). Envisager des tests pour `awards-service.ts`, `report-generator.ts` et `stats-calculator.ts`
- [ ] Tester la route `drop-zones` avec des données réelles (après backfill)

### Documentation

- [x] Mettre à jour `docs/telemetry/ops.md` après le backfill v1 → v2
- [ ] Documenter les pages UI `/drop-zones` une fois créées
- [ ] Mettre à jour `docs/features/challenges.md` une fois la progression auto câblée
