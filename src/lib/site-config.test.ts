import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { buildSiteConfiguration, SCHEDULE_VARIABLES, type SiteConfigFacts, type SiteConfigItem } from '@/lib/site-config'

// Module pur : aucune base, aucun réseau. Les valeurs sont fictives.
const GOOD_SECRET = 'Zs1pW8kQ2mVt7rXc4bN9yL0eAa'
const LINK_SECRET = 'Lk3nQ9vR2tY7wP4sD8fG1hJ6'

function facts(env: Record<string, string | undefined>, overrides: Partial<SiteConfigFacts> = {}): SiteConfigFacts {
  return {
    env,
    pubgRateLimitRpm: 10,
    latestRateLimit: { limit: 10, remaining: 7, resetAt: null, observedAt: new Date('2026-10-10T12:00:00Z') },
    email: { ready: true, lastSuccessAt: '2026-10-10T12:08:38.340Z', lastError: null },
    standaloneRuntime: false,
    ...overrides,
  }
}

function item(config: ReturnType<typeof buildSiteConfiguration>, key: string): SiteConfigItem {
  const found = config.sections.flatMap((section) => section.items).find((entry) => entry.key === key)
  if (!found) throw new Error(`réglage absent : ${key}`)
  return found
}

/** Le .env de production du 2026-10-10, secrets remplacés par des valeurs fictives. */
const PRODUCTION_ENV = {
  NODE_ENV: 'production',
  ENABLE_CRON_BOOTSTRAP: 'true',
  DATABASE_URL: 'mysql://smk:motdepasse-fictif@localhost:3306/pubg',
  NEXT_PUBLIC_API_URL: 'https://chickendinner.fr',
  PUBG_API_KEY: 'cle-pubg-fictive',
  APP_URL: 'https://chickendinner.fr',
  NEXT_PUBLIC_APP_URL: 'https://chickendinner.fr',
  INTERNAL_APP_URL: 'http://127.0.0.1:3000',
  AUTH_ALLOW_LEGACY_ACTOR_ID: 'false',
  AUTH_BOOTSTRAP_SECRET: 'change-me-long-random-string',
  SITE_NAME: 'chickendinner.fr',
  DISABLE_AUTH_PERMISSIONS: 'true',
  SMTP_HOST: 'ssl0.ovh.net',
  SMTP_PORT: '465',
  SMTP_USER: 'contact@chickendinner.fr',
  SMTP_PASS: 'mot-de-passe-smtp-fictif',
  SMTP_FROM: 'chickendinner.fr <contact@chickendinner.fr>',
  ENABLE_CRON_JOBS: 'true',
  TELEMETRY_SYNC_ENABLED: 'true',
  TELEMETRY_PARSER_VERSION: 'v2',
  TELEMETRY_MAX_MATCHES_PER_RUN: '10',
  TELEMETRY_SYNC_CONCURRENCY: '1',
  CLAN_MATCH_SYNC_CRON: '0 2,11,13,14,15,16,17,18,19,20,21,22,23 * * *',
  CLAN_MATCH_SYNC_TIMEZONE: 'Europe/Paris',
  CLAN_LIFETIME_STATS_SYNC_CRON: '0 4 * * *',
  CLAN_STATS_RECALC_CRON: '0 3,12 * * *',
  CLAN_ONLINE_REMINDER_CRON: '0 18 * * *',
  WEEKLY_REPORT_REMINDER_CRON: '0 9 * * *',
  WEEKLY_REPORT_GENERATION_CRON: '0 8 * * 1',
  MONTHLY_REPORT_GENERATION_CRON: '0 8 1 * *',
  TELEMETRY_RESYNC_WORKER_LOCK_FILE: '/home/smk/apps/pubg-clan-site/.telemetry-resync-worker.lock',
  TELEMETRY_AGGREGATE_WORKER_LOCK_FILE: '/home/smk/apps/pubg-clan-site/.telemetry-aggregate-worker.lock',
}

describe('buildSiteConfiguration — le .env de production du 2026-10-10', () => {
  const config = buildSiteConfiguration(facts(PRODUCTION_ENV, { standaloneRuntime: true }))

  it('signale la valeur d’exemple du secret de bootstrap comme une erreur', () => {
    expect(item(config, 'bootstrap_secret')).toMatchObject({ status: 'error', value: expect.stringContaining('valeur d’exemple') })
  })

  it('dit pourquoi le lien de désabonnement manque', () => {
    expect(item(config, 'unsubscribe_secret')).toMatchObject({ status: 'warning', value: 'inactif : aucun secret utilisable' })
  })

  it('liste les variables obsolètes présentes, et elles seules', () => {
    const obsolete = config.sections.find((section) => section.id === 'obsolete')
    expect(obsolete?.items.map((entry) => entry.variable)).toEqual([
      'NEXT_PUBLIC_API_URL',
      'WEEKLY_REPORT_GENERATION_CRON',
      'MONTHLY_REPORT_GENERATION_CRON',
      'WEEKLY_REPORT_REMINDER_CRON',
    ])
  })

  it('sous-domaines coupés et mode visiteur : des informations, pas des erreurs', () => {
    expect(item(config, 'clan_subdomains')).toMatchObject({ status: 'info', value: 'absente : redirection coupée' })
    expect(item(config, 'visitor_mode')).toMatchObject({ status: 'info', value: 'actif' })
  })

  it('reconnaît le reste comme en ordre (SMTP chiffré, horaires, verrous absolus, adresses publiques)', () => {
    expect(item(config, 'smtp')).toMatchObject({ status: 'ok', value: expect.stringContaining('ssl0.ovh.net:465, chiffré (TLS)') })
    expect(item(config, 'cron_schedules')).toMatchObject({ status: 'ok', value: '11 horaires valides' })
    expect(item(config, 'telemetry_resync_worker_lock_file').status).toBe('ok')
    expect(item(config, 'public_url').status).toBe('ok')
    expect(item(config, 'app_url').status).toBe('ok')
    expect(config.errors).toBe(1)
  })

  it('ne renvoie aucun secret ni l’adresse de la base', () => {
    const json = JSON.stringify(config)
    for (const secret of ['motdepasse-fictif', 'mysql://', 'cle-pubg-fictive', 'mot-de-passe-smtp-fictif', 'change-me-long-random-string']) {
      expect(json).not.toContain(secret)
    }
  })
})

describe('buildSiteConfiguration — règles', () => {
  it('aucun secret en clair, même utilisable', () => {
    const config = buildSiteConfiguration(
      facts({ AUTH_BOOTSTRAP_SECRET: GOOD_SECRET, NOTIFICATION_LINK_SECRET: LINK_SECRET, CRON_BOOTSTRAP_SECRET: GOOD_SECRET })
    )
    const json = JSON.stringify(config)
    expect(json).not.toContain(GOOD_SECRET)
    expect(json).not.toContain(LINK_SECRET)
    expect(item(config, 'unsubscribe_secret')).toMatchObject({ status: 'ok', value: 'actif — défini (24 caractères)' })
  })

  it('lien signé par le secret du bootstrap : actif, mais un secret distinct est conseillé', () => {
    const config = buildSiteConfiguration(facts({ AUTH_BOOTSTRAP_SECRET: GOOD_SECRET }))
    expect(item(config, 'unsubscribe_secret')).toMatchObject({ status: 'warning', value: 'actif, signé par AUTH_BOOTSTRAP_SECRET' })
    expect(item(config, 'bootstrap_secret').status).toBe('ok')
  })

  it('en production, une adresse locale dans les liens envoyés est une erreur', () => {
    const config = buildSiteConfiguration(facts({ NODE_ENV: 'production', NEXT_PUBLIC_APP_URL: 'http://localhost:3000' }))
    expect(item(config, 'public_url').status).toBe('error')
    expect(item(config, 'app_url').status).toBe('error')
    // En développement, c'est normal.
    expect(item(buildSiteConfiguration(facts({ NEXT_PUBLIC_APP_URL: 'http://localhost:3000' })), 'public_url').status).toBe('ok')
  })

  it('valeurs invalides : entier de télémétrie, horaire, verrou relatif en build standalone', () => {
    const config = buildSiteConfiguration(
      facts({ TELEMETRY_SYNC_CONCURRENCY: 'deux', CLAN_STATS_RECALC_CRON: 'tous les jours', TELEMETRY_RESYNC_WORKER_LOCK_FILE: '.lock' }, { standaloneRuntime: true })
    )
    expect(item(config, 'telemetry_sync_concurrency').status).toBe('error')
    expect(item(config, 'cron_schedules')).toMatchObject({ status: 'error', value: expect.stringContaining('CLAN_STATS_RECALC_CRON') })
    expect(item(config, 'telemetry_resync_worker_lock_file').status).toBe('error')
  })

  it('SMTP incomplet et test jamais validé : à revoir ; sans variable obsolète, pas de section', () => {
    const config = buildSiteConfiguration(facts({ SMTP_HOST: 'ssl0.ovh.net' }, { email: { ready: false, lastSuccessAt: null, lastError: null } }))
    expect(item(config, 'smtp')).toMatchObject({ status: 'warning', value: expect.stringContaining('SMTP_PORT') })
    expect(item(config, 'email_test')).toMatchObject({ status: 'warning', value: 'jamais validé' })
    expect(config.sections.some((section) => section.id === 'obsolete')).toBe(false)
  })

  it('compte erreurs et alertes', () => {
    const config = buildSiteConfiguration(facts({}))
    const items = config.sections.flatMap((section) => section.items)
    expect(config.errors).toBe(items.filter((entry) => entry.status === 'error').length)
    expect(config.warnings).toBe(items.filter((entry) => entry.status === 'warning').length)
    // Sans clé PUBG ni base : erreurs.
    expect(item(config, 'pubg_api_key').status).toBe('error')
    expect(item(config, 'database_url').status).toBe('error')
  })
})

describe('horaires contrôlés', () => {
  it('reprennent exactement les variables et valeurs par défaut de src/lib/cron-jobs.ts', () => {
    const source = readFileSync(path.resolve(__dirname, 'cron-jobs.ts'), 'utf8')
    const definitions = Object.fromEntries(
      [...source.matchAll(/envVar:\s*'([A-Z_]+)',[^}]*?defaultExpression:\s*'([^']+)'/g)].map((match) => [match[1], match[2]])
    )
    expect(Object.keys(definitions).length).toBeGreaterThan(0)
    expect(SCHEDULE_VARIABLES).toEqual(definitions)
  })
})
