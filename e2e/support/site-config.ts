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

/** Tâches planifiées : statut du clan sélectionné, horaires, workers absents (non bloquant). */
export function mockCronSettings(api: ApiMock) {
  api
    .on('GET', '/api/settings/cron-workers-status', { body: { ok: false } })
    .on('GET', '/api/settings/cron-schedules', {
      body: {
        ok: true,
        schedules: [
          { key: 'clan_match_sync', expression: '0 2,11,13 * * *', timezone: 'Europe/Paris', source: 'env' },
          { key: 'clan_stats_recalc', expression: '0 3,12 * * *', timezone: 'Europe/Paris', source: 'db' },
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
