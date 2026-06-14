# Sommaire docs

Cette page centralise la documentation du projet sur une seule vue.

## Vue rapide

- Classement clan: calcul live, filtres, badges, progression
- Matchs clan: agrégations sessions, synergies, top performers
- Cron clan: pilotage, sante, actions manuelles et jobs planifies
- Selection de clan: controle d acces, liste des clans, persistance de selection
- Login et activation: parcours auth joueur, invitations et reset mot de passe
- Tableaux du site: inventaire complet des vues tabulaires
- Composants UI: composants réutilisables et conventions
- Uniformisation UI: charte visuelle globale
- Resync worker runtime: queue dediee, worker separe et badge PID runtime
- Permissions navigation: rôles, couleurs, visibilité et ordre drag & drop des boutons nav

## Index par document

- [Calcul leaderboard](leaderboard-calcul.md)
  - Source des données, période, tri, K/M, distinctions, progression, all time
- [Calcul matchs clan](matchs-clan-calcul.md)
  - Méthodes de calcul de /clans/[clanId]/matches + sous-pages /matches/session/[date], navigation par date, sessions, synergies, performers
- [Pilotage cron clan](cron-clan-settings.md)
  - Logique de /clans/[clanId]/settings/cron: sante, checks, historique, actions manuelles et portee metier des crons
- [Selection de clan](selection-clan.md)
  - Logique de /clans: permissions, fetch `/api/clans`, recherche, selection et redirection
- [Calcul matchs membre](matchs-membre-calcul.md)
  - Logique de /members/[id]/matches: historique DB, tri/pagination, matchs recents PUBG et import
- [Calcul dashboard membre](dashboard-membre-calcul.md)
  - Logique de /members/[id]/dashboard: stats, progression, comparaison clan, squads, historique matchs
- [Login et activation joueurs](login-activation-joueurs.md)
  - Flux de connexion, activation par invitation, mot de passe oublie
- [Inventaire des tableaux](tableaux-site.md)
  - Où sont les tableaux, contrôles disponibles, état de centralisation
- [Composants réutilisables](composants-reutilisables.md)
  - Composants UI partagés, usages et contrats visuels
- [Uniformisation UI](ui-uniformisation.md)
  - Tokens, layout, panneaux, bonnes pratiques
- [Showcase composants](composants-showcase.html)
  - Démo visuelle des composants et styles
- [Télémétrie matchs clan](telemetrie-matchs-clan.md)
  - Données exploitables depuis l'API télémétrie PUBG, idées de stats, contraintes techniques et modèle de stockage
- [Déploiement télémétrie matchs clan](telemetrie-matchs-clan-deploiement.md)
  - Plan complet de livraison: lib télémétrie, migrations Prisma, cron, APIs, UI, observabilité, rollout et rollback
- [Runbook rollout telemetry](telemetrie-rollout.md)
  - Sequence operationnelle TEL-403: preflight, dry-run, pilote, global, journal et rollback
- [Récupération assets télémétrie](telemetrie-recuperation-assets.md)
  - Fonctions à coder pour extraire l'URL asset, télécharger en streaming et brancher l'ingestion sur les matchs existants
- [Resync worker et runtime dev](resync-worker-runtime.md)
  - Queue persistante, worker dédié hors process web, endpoint runtime PID/uptime et usage opératoire conseillé
- [Worker télémétrie — crash silencieux et correctifs](telemetry-worker-crash-fix.md)
  - Bug `Readable.toWeb()` Node.js 22 sur streams séquentiels, recovery des jobs bloqués, adaptateur stream manuel
- [Télémétrie batch - Phase 1-2](TELEMETRY_BATCH_README.md)
  - Mode manuel et batch robuste, enqueue/check status, CLI, worker avec memory protection (Phase 2)
- [Télémétrie - Trois modes de récupération](TELEMETRY_SYNC_MODES.md)
  - Direct Sync (rapide), Capture seule (sauvegarde), Queue Resync (async worker) - guide de décision et comparaison
- [Télémétrie - Interface de sélection depuis matchs](TELEMETRY_MATCHES_SESSION_INTERFACE.md)
  - Intégration des 3 modes directement sur page /clans/[id]/matches/session/[date] avec tabbed UI
- [Télémétrie Capture & Resync Workflow](TELEMETRY_CAPTURE_AND_RESYNC_WORKFLOW.md)
  - Workflow deux phases: capture depuis PUBG API → resync depuis fichiers locaux
- [Télémétrie Phase 2 Guide](TELEMETRY_PHASE2_GUIDE.md)
  - Memory monitoring, backpressure controller, dead letter queue, worker health tracking
- [Télémétrie Phase 3 Guide](TELEMETRY_PHASE3_GUIDE.md)
  - Dashboard monitoring, error browsing, queue cleanup, metrics export
- [Télémétrie Production Guide](TELEMETRY_PRODUCTION_GUIDE.md)
  - Déploiement production (Kubernetes, VPS, systemd), troubleshooting, monitoring, scenarios d'urgence
- [Télémétrie Status Complet](TELEMETRY_STATUS_COMPLETE.md)
  - Statut Phase 1-3, ce qui reste à faire, roadmap, recommandations
- [Season Stats — données et idées](season-stats.md)
  - Données ranked/normal disponibles depuis l'API PUBG, ce qui est stocké/affiché, faisabilité page TOP 3, idées pour dynamiser le clan
- [Lifetime Stats — données et idées](lifetime-stats.md)
  - Données lifetime disponibles depuis l'API PUBG, ce qui est stocké/affiché, lacunes filtre par mode, conception pages membre et clan
- [Leaderboards — deux systèmes, données et idées](leaderboards.md)
  - Leaderboard interne clan (existant) vs leaderboard PUBG API mondial (top 500, non consommé), conception pages membre et clan
- [Clans — endpoint PUBG API, données et idées](clans-endpoint.md)
  - Données clan disponibles depuis l'API PUBG, lacune principale (auto-sync roster), conception pages membre et clan admin
- [Intégration pubg/api-assets](pubg-api-assets-integration.md)
  - Dictionnaires JSON officiels (armes, véhicules, dégâts, maps), icônes HUD, plan d'implémentation en 4 phases avec checklist
- [Permissions et ordre de navigation](nav-permissions.md)
  - Système de gestion dynamique des boutons nav : rôles d'accès, couleurs, visibilité conditionnelle, ordre drag & drop, page owner /settings/nav-permissions

## Parcours recommandé

1. Comprendre le classement: commencer par [Calcul leaderboard](leaderboard-calcul.md)
2. Comprendre la page Matchs: lire [Calcul matchs clan](matchs-clan-calcul.md)
3. Vérifier les patterns UI: passer par [Composants réutilisables](composants-reutilisables.md)
4. Vérifier la cohérence visuelle: lire [Uniformisation UI](ui-uniformisation.md)

## Notes

- Les docs de calcul décrivent le comportement réel du code actuel.
- En cas d'évolution métier, mettre à jour en priorité:
  - leaderboard-calcul.md
  - matchs-clan-calcul.md
  - dashboard-membre-calcul.md
