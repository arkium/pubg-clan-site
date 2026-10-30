import type { SiteConfiguration } from '@/lib/site-config'

import type { ApiMock } from './api'
import { CLAN_ID } from './data'

/**
 * Configuration du site (/settings/configuration) et Tâches planifiées (/settings/cron) — réponses figées. La
 * configuration reprend les constats du 2026-10-10 : secret de bootstrap d'exemple, lien de désabonnement inactif,
 * variable obsolète.
 */
export function siteConfiguration(): SiteConfiguration {
  return {
    generatedAt: '2026-10-10T12:00:00.000Z',
    errors: 1,
    warnings: 2,
    sections: [
      {
        id: 'identity',
        title: 'Identité et adresses',
        description: 'Nom du site dans les e-mails et adresses utilisées dans les liens envoyés.',
        items: [
          { key: 'site_name', label: 'Nom du site dans les e-mails', variable: 'SITE_NAME', status: 'ok', value: 'chickendinner.fr', effect: 'Objets, textes et pieds de page des e-mails.' },
          {
            key: 'clan_subdomains',
            label: 'Sous-domaines de clan',
            variable: 'CLAN_SUBDOMAIN_ROOT',
            status: 'info',
            value: 'absente : redirection coupée',
            effect: 'Un sous-domaine attribué mène à la vue d’ensemble de son clan.',
            fix: 'Pour l’activer : CLAN_SUBDOMAIN_ROOT="chickendinner.fr".',
          },
        ],
      },
      {
        id: 'security',
        title: 'Accès et sécurité',
        description: 'Qui voit quoi sans compte, et les secrets qui ouvrent des routes publiques.',
        items: [
          {
            key: 'bootstrap_secret',
            label: 'Secret du bootstrap Owner',
            variable: 'AUTH_BOOTSTRAP_SECRET',
            status: 'error',
            value: 'valeur d’exemple de .env.example (publique)',
            effect: 'Ouvre POST /api/auth/bootstrap-owner-invite.',
            fix: 'Générer une valeur (`openssl rand -base64 32`), la poser dans le .env, puis redémarrer les services.',
          },
          {
            key: 'unsubscribe_secret',
            label: 'Lien « Ne plus recevoir ces e-mails »',
            variable: 'NOTIFICATION_LINK_SECRET',
            status: 'warning',
            value: 'inactif : aucun secret utilisable',
            effect: 'Sans lui, les e-mails de notification partent sans lien d’arrêt.',
            fix: 'Générer une valeur (`openssl rand -base64 32`), la poser dans le .env, puis redémarrer les services.',
          },
        ],
      },
      {
        id: 'email',
        title: 'E-mails',
        description: 'Serveur d’envoi des invitations, réinitialisations, décisions et notifications.',
        link: { href: '/settings/email-delivery', label: 'Envoyer un e-mail de test' },
        items: [
          { key: 'smtp', label: 'Serveur d’envoi', variable: 'SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS', status: 'ok', value: 'ssl0.ovh.net:465, chiffré (TLS) — compte contact@chickendinner.fr', effect: 'Les e-mails partent réellement.' },
        ],
      },
      {
        id: 'tasks',
        title: 'Tâches planifiées',
        description: 'Processus qui exécute les tâches, fuseau horaire et validité des horaires du .env.',
        link: { href: '/settings/cron', label: 'Horaires et exécutions' },
        items: [{ key: 'cron_schedules', label: 'Horaires du .env', variable: 'CLAN_MATCH_SYNC_CRON', status: 'ok', value: '4 horaires valides', effect: 'Valeurs de départ.' }],
      },
      {
        id: 'obsolete',
        title: 'Variables obsolètes',
        description: 'Présentes dans le .env, mais lues nulle part : à retirer pour qu’il reste lisible.',
        items: [
          {
            key: 'obsolete_next_public_api_url',
            label: 'NEXT_PUBLIC_API_URL',
            variable: 'NEXT_PUBLIC_API_URL',
            status: 'warning',
            value: 'présente',
            effect: 'Aucun effet : jamais lue par le code.',
            fix: 'Retirer la ligne du .env.',
          },
        ],
      },
    ],
  }
}

export function mockSiteConfiguration(api: ApiMock) {
  api.on('GET', '/api/settings/site-config', { body: siteConfiguration() })
}

/**
 * Fraîcheur des parties (`GET /api/settings/match-sync-health`, docs/TODO/fraicheur-des-parties.md) : en ordre (chiffres
 * de production du 2026-10-28, une partie en attente), dégradé (synchronisation arrêtée, une partie perdue) ou vide.
 */
export function matchSyncHealthPayload(kind: 'ok' | 'degraded' | 'empty' = 'ok') {
  const health = {
    generatedAt: '2026-10-29T20:00:00.000Z',
    intervalMinutes: 30,
    measured: kind !== 'empty',
    delay:
      kind === 'empty'
        ? { count: 0, median: null, p90: null, underPromiseShare: null, catchUps: 0, toned: false }
        : { count: 1221, median: 15, p90: 27, underPromiseShare: 1, catchUps: 2, toned: true },
    lastPass:
      kind === 'empty'
        ? null
        : {
            startedAt: '2026-10-29T19:47:00.000Z',
            finishedAt: '2026-10-29T20:00:00.000Z',
            durationMinutes: 13,
            clans: 45,
            failedClans: 0,
            importedMatches: 52,
          },
    passes: kind === 'empty' ? { count: 0, medianDurationMinutes: null, maxDurationMinutes: null, marginRatio: null } : { count: 46, medianDurationMinutes: 13, maxDurationMinutes: 18, marginRatio: 0.43 },
    skipped: { last24h: 0, consecutive: 0 },
    pending: {
      waiting: kind === 'ok' ? 1 : 0,
      lost: kind === 'degraded' ? 1 : 0,
      oldestFailedAt: kind === 'ok' ? '2026-10-29T19:40:00.000Z' : null,
      entries:
        kind === 'empty'
          ? []
          : [
              {
                matchId: 'f131a4aa-4e9b-46e5-bf8e-d49233bd9c7e',
                clanId: CLAN_ID,
                firstFailedAt: '2026-10-29T19:40:00.000Z',
                attempts: kind === 'ok' ? 1 : 6,
                lastStatus: 404,
                lost: kind === 'degraded',
              },
            ],
    },
    calls:
      kind === 'empty'
        ? null
        : { at: '2026-10-29T20:00:00.000Z', limitedLastHour: 545, ceilingPerHour: 600, http429Last24h: 0, actionLast24h: 0, transientLastHour: 0, quotaRatio: 0.91 },
    status: kind === 'degraded' ? 'urgent' : 'ok',
    reasons:
      kind === 'degraded'
        ? [
            { key: 'stale', tone: 'urgent', text: 'Aucun tour terminé depuis 2 h 10' },
            { key: 'lost', tone: 'todo', text: '1 partie perdue : toujours pas importée 24 h après le premier échec' },
          ]
        : [],
  }
  return { ok: true, health, clans: [{ id: CLAN_ID, tag: 'ALP', name: 'Clan Alpha' }] }
}

/** Tâches planifiées : statut du clan sélectionné, horaires, workers absents (non bloquant). */
export function mockCronSettings(api: ApiMock, options: { matchSyncHealth?: 'ok' | 'degraded' | 'empty' } = {}) {
  api
    .on('GET', '/api/settings/match-sync-health', { body: matchSyncHealthPayload(options.matchSyncHealth) })
    .on('GET', '/api/settings/cron-workers-status', { body: { ok: false } })
    .on('GET', '/api/settings/cron-schedules', {
      body: {
        ok: true,
        schedules: [
          { key: 'daily_sync', expression: '*/30 * * * *', timezone: 'Europe/Paris', source: 'db' },
          { key: 'daily_stats_recalc', expression: '0 3,12 * * *', timezone: 'Europe/Paris', source: 'env' },
          { key: 'daily_lifetime_stats_sync', expression: '0 */4 * * *', timezone: 'Europe/Paris', source: 'default' },
        ],
      },
    })
    .on('GET', `/api/clans/${CLAN_ID}/cron-control`, {
      body: {
        ok: true,
        clanId: CLAN_ID,
        actionLabels: {},
        health: { successRate: 100, runningCount: 0, failedCount: 0, completedRecent: 3, totalRecent: 3 },
        checks: { errors: 1, warnings: 2 },
        runtime: {
          webWorker: { cronJobsEnabled: true, cronBootstrapEnabled: true },
          cronWorker: { probeEnabled: false, available: false, reason: 'Vérification distante non configurée' },
        },
        latestByAction: [],
        history: [],
      },
    })
}
