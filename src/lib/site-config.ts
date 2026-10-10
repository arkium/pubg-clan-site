import { isAbsolute as isAbsolutePath } from 'node:path'

import { secretState, usableSecret, type SecretState } from '@/lib/auth/secrets'
import { describeCronExpression, isValidCron } from '@/lib/cron-observability'
import { getEmailDeliveryStatus } from '@/lib/email-delivery-config-service'
import { SITE_DOMAIN } from '@/lib/legal/legal-info'
import { getLatestPubgRateLimitSnapshot } from '@/lib/pubg-api-call-log-service'
import { getPubgApiRateLimitRpm } from '@/lib/pubg-rate-limit-config-service'

/**
 * Configuration du site (`/settings/configuration`, SuperUser) — tout ce que le `.env` règle, contrôlé et expliqué :
 * statut, valeur (jamais un secret en clair), effet, correction. Sortie de la section « Configuration » de
 * `/settings/cron` le 2026-10-10 ; Tâches planifiées n'en garde que le nombre d'erreurs et d'alertes.
 *
 * `buildSiteConfiguration` est pur (variables et faits déjà lus) ; `getSiteConfiguration` lit les faits.
 */

export type SiteConfigStatus = 'ok' | 'warning' | 'error' | 'info'

export type SiteConfigItem = {
  key: string
  label: string
  /** Variable(s) du `.env` concernée(s), affichées telles quelles. */
  variable: string | null
  status: SiteConfigStatus
  /** Valeur lisible ; jamais un secret ni une adresse de base de données en clair. */
  value: string
  /** Ce que le réglage change, dit en clair. */
  effect: string
  /** Comment corriger, quand le statut n'est pas « ok ». */
  fix?: string
}

export type SiteConfigSectionId = 'identity' | 'security' | 'email' | 'pubg' | 'tasks' | 'telemetry' | 'database' | 'obsolete'

export type SiteConfigSection = {
  id: SiteConfigSectionId
  title: string
  description: string
  link?: { href: string; label: string }
  items: SiteConfigItem[]
}

export type SiteConfiguration = {
  generatedAt: string
  errors: number
  warnings: number
  sections: SiteConfigSection[]
}

export type SiteConfigFacts = {
  env: Record<string, string | undefined>
  pubgRateLimitRpm: number
  latestRateLimit: { limit: number | null; remaining: number | null; resetAt: Date | string | null; observedAt: Date | string } | null
  email: { ready: boolean; lastSuccessAt: string | null; lastError: string | null }
  /** Serveur lancé depuis `.next/standalone` : les chemins relatifs y pointent au mauvais endroit. */
  standaloneRuntime: boolean
}

/** Variables encore présentes dans des `.env`, lues nulle part (vérifié le 2026-10-10). */
const OBSOLETE_VARIABLES: Record<string, string> = {
  NEXT_PUBLIC_API_URL: 'jamais lue par le code',
  SMTP_URL: 'remplacée par SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS et SMTP_FROM',
  WEEKLY_REPORT_GENERATION_CRON: 'les rapports ont été retirés le 2026-08-20',
  MONTHLY_REPORT_GENERATION_CRON: 'les rapports ont été retirés le 2026-08-20',
  WEEKLY_REPORT_REMINDER_CRON: 'les rapports ont été retirés le 2026-08-20',
}

/**
 * Horaires lus par `src/lib/cron-jobs.ts` (`CRON_SCHEDULE_DEFINITIONS`), avec leur valeur par défaut. Copie : ce module
 * ne peut pas importer cron-jobs (`server-only`, toutes les tâches) ; `site-config.test.ts` compare les deux listes.
 */
export const SCHEDULE_VARIABLES: Record<string, string> = {
  CLAN_MATCH_SYNC_CRON: '0 2 * * *',
  CLAN_STATS_RECALC_CRON: '0 3 * * *',
  CLAN_LIFETIME_STATS_SYNC_CRON: '0 4 * * *',
  CLAN_SEASON_STATS_SYNC_CRON: '0 5 * * *',
  CLAN_ONLINE_REMINDER_CRON: '0 18 * * *',
  CHALLENGE_PROCESSING_CRON: '0 0 * * *',
  ENCOUNTERED_PLAYER_CLAN_RESOLUTION_CRON: '*/30 * * * *',
  CLAN_LIFECYCLE_MEMBERSHIP_SYNC_CRON: '45 1 * * *',
  DB_MAINTENANCE_CRON: '15 1 * * *',
  TELEMETRY_GEO_PURGE_COUNT_CRON: '0 6 * * *',
  RESOURCE_VEHICLE_SPOTS_CRON: '30 6 * * *',
}

const GENERATE_SECRET = 'Générer une valeur (`openssl rand -base64 32`), la poser dans le .env, puis redémarrer les services.'

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' })

function trimmed(value: string | undefined) {
  return value?.trim() ?? ''
}

function isLocalUrl(value: string) {
  try {
    const { hostname } = new URL(value)
    return hostname === 'localhost' || hostname === '127.0.0.1'
  } catch {
    return false
  }
}

function isValidUrl(value: string) {
  try {
    new URL(value)
    return true
  } catch {
    return false
  }
}

function positiveInteger(value: string | undefined) {
  if (value === undefined) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function secretValue(state: SecretState, value: string | undefined) {
  if (state === 'missing') return 'absent'
  if (state === 'example') return 'valeur d’exemple de .env.example (publique)'
  if (state === 'too_short') return `trop court (${trimmed(value).length} caractères)`
  return `défini (${trimmed(value).length} caractères)`
}

function identitySection(env: SiteConfigFacts['env'], production: boolean): SiteConfigSection {
  const siteNameValue = trimmed(env.SITE_NAME)
  const publicUrl = trimmed(env.NEXT_PUBLIC_APP_URL)
  const appUrl = trimmed(env.APP_URL)
  const internalUrl = trimmed(env.INTERNAL_APP_URL)
  const subdomainRoot = trimmed(env.CLAN_SUBDOMAIN_ROOT)
  const googleVerification = trimmed(env.GOOGLE_SITE_VERIFICATION)

  const urlItem = (key: string, label: string, variable: string, value: string, effect: string, fallback: string): SiteConfigItem => {
    if (!value) return { key, label, variable, status: 'warning', value: `absente (${fallback})`, effect, fix: `Définir ${variable}="https://${SITE_DOMAIN}".` }
    if (!isValidUrl(value)) return { key, label, variable, status: 'error', value, effect, fix: 'Adresse invalide : attendu une URL complète, avec https://.' }
    if (production && isLocalUrl(value)) {
      return { key, label, variable, status: 'error', value, effect, fix: `En production, ces liens mèneraient à la machine du visiteur : définir l’adresse publique (https://${SITE_DOMAIN}).` }
    }
    return { key, label, variable, status: 'ok', value, effect }
  }

  return {
    id: 'identity',
    title: 'Identité et adresses',
    description: 'Nom du site dans les e-mails et adresses utilisées dans les liens envoyés.',
    items: [
      {
        key: 'site_name',
        label: 'Nom du site dans les e-mails',
        variable: 'SITE_NAME',
        status: siteNameValue ? 'ok' : 'info',
        value: siteNameValue || `${SITE_DOMAIN} (par défaut)`,
        effect: 'Objets, textes et pieds de page des e-mails. Les pages gardent leur nom fixe.',
      },
      urlItem(
        'public_url',
        'Adresse publique',
        'NEXT_PUBLIC_APP_URL',
        publicUrl,
        'Liens des e-mails de notification et du désabonnement, messages Discord, adresse canonique et aperçus de partage.',
        `https://${SITE_DOMAIN} par défaut`
      ),
      urlItem(
        'app_url',
        'Adresse des liens de compte',
        'APP_URL',
        appUrl || publicUrl,
        'Liens d’activation de compte (invitations) et de réinitialisation du mot de passe ; à défaut, NEXT_PUBLIC_APP_URL.',
        'http://localhost:3000 par défaut'
      ),
      {
        key: 'internal_url',
        label: 'Adresse interne',
        variable: 'INTERNAL_APP_URL',
        status: internalUrl && isLocalUrl(internalUrl) ? 'ok' : 'warning',
        value: internalUrl || 'absente',
        effect: 'Appels du serveur à lui-même : tâches planifiées, sous-domaines de clan.',
        fix: internalUrl ? 'Idéalement une adresse locale (http://127.0.0.1:3000).' : 'Définir INTERNAL_APP_URL="http://127.0.0.1:3000".',
      },
      subdomainRoot
        ? {
            key: 'clan_subdomains',
            label: 'Sous-domaines de clan',
            variable: 'CLAN_SUBDOMAIN_ROOT',
            status: 'ok',
            value: subdomainRoot,
            effect: 'Un sous-domaine attribué mène à la vue d’ensemble de son clan (smk.chickendinner.fr…).',
          }
        : {
            key: 'clan_subdomains',
            label: 'Sous-domaines de clan',
            variable: 'CLAN_SUBDOMAIN_ROOT',
            status: 'info',
            value: 'absente : redirection coupée',
            effect: 'Un sous-domaine attribué mène à la vue d’ensemble de son clan (smk.chickendinner.fr…).',
            fix: `Pour l’activer : CLAN_SUBDOMAIN_ROOT="${SITE_DOMAIN}".`,
          },
      {
        key: 'google_verification',
        label: 'Vérification Google Search Console',
        variable: 'GOOGLE_SITE_VERIFICATION',
        status: googleVerification ? 'ok' : 'info',
        value: googleVerification ? 'définie' : 'absente',
        effect: 'Balise de preuve de propriété pour Google Search Console (facultative).',
      },
    ],
  }
}

function securitySection(env: SiteConfigFacts['env']): SiteConfigSection {
  const visitorMode = env.DISABLE_AUTH_PERMISSIONS === 'true'
  const bootstrap = secretState(env.AUTH_BOOTSTRAP_SECRET)
  const link = secretState(env.NOTIFICATION_LINK_SECRET)
  const linkFallback = link === 'missing' && usableSecret(env.AUTH_BOOTSTRAP_SECRET) !== null
  const legacyActor = env.AUTH_ALLOW_LEGACY_ACTOR_ID === 'true'

  const bootstrapItem: SiteConfigItem = {
    key: 'bootstrap_secret',
    label: 'Secret du bootstrap Owner',
    variable: 'AUTH_BOOTSTRAP_SECRET',
    status: bootstrap === 'ok' ? 'ok' : bootstrap === 'missing' ? 'info' : 'error',
    value: secretValue(bootstrap, env.AUTH_BOOTSTRAP_SECRET),
    effect:
      'Ouvre POST /api/auth/bootstrap-owner-invite, qui crée une invitation Owner et renvoie son lien d’activation. Absent : route fermée, normal une fois le site installé.',
    ...(bootstrap === 'example' || bootstrap === 'too_short'
      ? { fix: `La route le refuse depuis le 2026-10-10 et reste fermée, mais une version antérieure du code l’accepte : remplacer la valeur. ${GENERATE_SECRET}` }
      : {}),
  }

  const linkItem: SiteConfigItem =
    link === 'ok'
      ? {
          key: 'unsubscribe_secret',
          label: 'Lien « Ne plus recevoir ces e-mails »',
          variable: 'NOTIFICATION_LINK_SECRET',
          status: 'ok',
          value: `actif — ${secretValue(link, env.NOTIFICATION_LINK_SECRET)}`,
          effect: 'Signe le lien de désabonnement de chaque e-mail de notification et l’en-tête de désabonnement en un clic.',
        }
      : linkFallback
        ? {
            key: 'unsubscribe_secret',
            label: 'Lien « Ne plus recevoir ces e-mails »',
            variable: 'NOTIFICATION_LINK_SECRET',
            status: 'warning',
            value: 'actif, signé par AUTH_BOOTSTRAP_SECRET',
            effect: 'Signe le lien de désabonnement de chaque e-mail de notification et l’en-tête de désabonnement en un clic.',
            fix: `Un secret distinct est préférable : changer celui du bootstrap invaliderait les liens déjà envoyés. ${GENERATE_SECRET}`,
          }
        : {
            key: 'unsubscribe_secret',
            label: 'Lien « Ne plus recevoir ces e-mails »',
            variable: 'NOTIFICATION_LINK_SECRET',
            status: link === 'missing' ? 'warning' : 'error',
            value: link === 'missing' ? 'inactif : aucun secret utilisable' : `inactif — ${secretValue(link, env.NOTIFICATION_LINK_SECRET)}`,
            effect: 'Sans lui, les e-mails de notification partent sans lien d’arrêt : il ne reste que le lien vers les préférences, après connexion.',
            fix: GENERATE_SECRET,
          }

  return {
    id: 'security',
    title: 'Accès et sécurité',
    description: 'Qui voit quoi sans compte, et les secrets qui ouvrent des routes publiques.',
    items: [
      {
        key: 'visitor_mode',
        label: 'Mode visiteur',
        variable: 'DISABLE_AUTH_PERMISSIONS',
        status: 'info',
        value: visitorMode ? 'actif' : 'coupé',
        effect: visitorMode
          ? 'Statistiques de tous les clans consultables sans compte, en lecture seule (choix documenté, docs/features/accueil.md). L’administration et les écritures exigent toujours une session.'
          : 'Une session est exigée pour consulter les statistiques ; la vitrine et les pages légales restent publiques.',
      },
      bootstrapItem,
      linkItem,
      {
        key: 'legacy_actor',
        label: 'Ancien identifiant d’acteur',
        variable: 'AUTH_ALLOW_LEGACY_ACTOR_ID',
        status: legacyActor ? 'warning' : 'ok',
        value: legacyActor ? 'accepté' : 'refusé',
        effect: 'Compatibilité avec l’ancien format d’identifiant d’acteur (migration terminée).',
        ...(legacyActor ? { fix: 'Repasser à "false" : seule la session doit désigner l’acteur.' } : {}),
      },
    ],
  }
}

function emailSection(env: SiteConfigFacts['env'], email: SiteConfigFacts['email']): SiteConfigSection {
  const required = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']
  const missing = required.filter((key) => !trimmed(env[key]))
  const port = Number(env.SMTP_PORT ?? '0')
  const secure = trimmed(env.SMTP_SECURE).toLowerCase() === 'true' || port === 465

  return {
    id: 'email',
    title: 'E-mails',
    description: 'Serveur d’envoi des invitations, réinitialisations, décisions et notifications.',
    link: { href: '/settings/email-delivery', label: 'Envoyer un e-mail de test' },
    items: [
      missing.length === 0
        ? {
            key: 'smtp',
            label: 'Serveur d’envoi',
            variable: 'SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS',
            status: 'ok',
            value: `${trimmed(env.SMTP_HOST)}:${port}${secure ? ', chiffré (TLS)' : ''} — compte ${trimmed(env.SMTP_USER)}`,
            effect: 'Les e-mails partent réellement.',
          }
        : {
            key: 'smtp',
            label: 'Serveur d’envoi',
            variable: 'SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS',
            status: 'warning',
            value: `incomplet : manque ${missing.join(', ')}`,
            effect: 'Sans serveur complet, aucun e-mail ne part : l’envoi est simulé et seulement journalisé.',
            fix: 'Compléter les variables SMTP_*, redémarrer, puis envoyer un e-mail de test.',
          },
      {
        key: 'smtp_from',
        label: 'Expéditeur',
        variable: 'SMTP_FROM',
        status: trimmed(env.SMTP_FROM) ? 'ok' : 'warning',
        value: trimmed(env.SMTP_FROM) || 'absent',
        effect: 'Nom et adresse affichés dans la messagerie du destinataire.',
        ...(trimmed(env.SMTP_FROM) ? {} : { fix: `Par exemple : SMTP_FROM="${SITE_DOMAIN} <contact@${SITE_DOMAIN}>".` }),
      },
      {
        key: 'email_test',
        label: 'E-mail de test',
        variable: null,
        status: email.ready ? 'ok' : 'warning',
        value: email.ready
          ? `validé${email.lastSuccessAt ? ` le ${dateFormat.format(new Date(email.lastSuccessAt))}` : ''}`
          : email.lastError
            ? `échec : ${email.lastError}`
            : 'jamais validé',
        effect: 'Un test réussi affiche l’envoi d’invitations par e-mail dans la gestion des membres.',
        ...(email.ready ? {} : { fix: 'Envoyer un e-mail de test depuis la page « Envoi d’e-mails ».' }),
      },
    ],
  }
}

function pubgSection(env: SiteConfigFacts['env'], facts: SiteConfigFacts): SiteConfigSection {
  const key = trimmed(env.PUBG_API_KEY)
  const latest = facts.latestRateLimit
  return {
    id: 'pubg',
    title: 'API PUBG',
    description: 'Accès à l’API officielle PUBG, source de toutes les statistiques.',
    link: { href: '/settings/pubg-api', label: 'Appels et limite de débit' },
    items: [
      {
        key: 'pubg_api_key',
        label: 'Clé d’API',
        variable: 'PUBG_API_KEY',
        status: key ? 'ok' : 'error',
        value: key ? 'définie' : 'absente',
        effect: 'Synchronisation des matchs, des statistiques et de la carrière des joueurs.',
        ...(key ? {} : { fix: 'Créer une clé sur developer.pubg.com et la poser dans PUBG_API_KEY.' }),
      },
      {
        key: 'pubg_rate_limit',
        label: 'Limite de débit appliquée',
        variable: 'PUBG_API_RATE_LIMIT_RPM',
        status: 'info',
        value: `${facts.pubgRateLimitRpm} requêtes par minute`,
        effect: 'Plafond de la file d’appels à l’API ; réglable sans redémarrage dans « API PUBG ».',
      },
      {
        key: 'pubg_rate_limit_observed',
        label: 'Dernière limite observée',
        variable: null,
        status: 'info',
        value: latest
          ? `${latest.remaining ?? '—'} / ${latest.limit ?? '—'} restantes, observé le ${dateFormat.format(new Date(latest.observedAt))}`
          : 'aucun appel enregistré',
        effect: 'Ce que l’API PUBG a renvoyé au dernier appel.',
      },
    ],
  }
}

function tasksSection(env: SiteConfigFacts['env']): SiteConfigSection {
  const nodeEnv = env.NODE_ENV ?? 'development'
  const cronJobs = env.ENABLE_CRON_JOBS === 'true'
  const cronBootstrap = env.ENABLE_CRON_BOOTSTRAP === 'true'
  const timezone = trimmed(env.CLAN_MATCH_SYNC_TIMEZONE) || 'UTC'
  const cronSecret = secretState(env.CRON_BOOTSTRAP_SECRET)
  const schedules = Object.entries(SCHEDULE_VARIABLES).map(([variable, fallback]) => ({ variable, value: trimmed(env[variable]) || fallback }))
  const invalid = schedules.filter((schedule) => !isValidCron(schedule.value))

  return {
    id: 'tasks',
    title: 'Tâches planifiées',
    description: 'Processus qui exécute les tâches, fuseau horaire et validité des horaires du .env.',
    link: { href: '/settings/cron', label: 'Horaires et exécutions' },
    items: [
      {
        key: 'node_env',
        label: 'Environnement',
        variable: 'NODE_ENV',
        status: nodeEnv === 'production' ? 'ok' : 'warning',
        value: nodeEnv,
        effect: 'Mode de fonctionnement du serveur.',
        ...(nodeEnv === 'production' ? {} : { fix: 'En production : NODE_ENV=production.' }),
      },
      {
        key: 'enable_cron_jobs',
        label: 'Tâches planifiées sur ce processus',
        variable: 'ENABLE_CRON_JOBS',
        status: 'info',
        value: cronJobs ? 'actives' : 'inactives',
        effect: cronJobs
          ? 'Ce processus exécute les tâches planifiées (synchronisations, recalculs, rappels).'
          : 'Ce processus n’exécute pas les tâches : normal pour le processus web quand un processus cron séparé tourne.',
      },
      {
        key: 'enable_cron_bootstrap',
        label: 'Démarrage des tâches avec le site',
        variable: 'ENABLE_CRON_BOOTSTRAP',
        status: cronBootstrap ? 'warning' : 'ok',
        value: cronBootstrap ? 'activé (mode ancien)' : 'désactivé',
        effect: 'Lance les tâches au démarrage du processus web plutôt que par le point d’entrée interne.',
        ...(cronBootstrap ? { fix: 'Avec deux processus (web et cron), laisser false et passer par le point d’entrée interne sécurisé.' } : {}),
      },
      {
        key: 'cron_timezone',
        label: 'Fuseau des horaires',
        variable: 'CLAN_MATCH_SYNC_TIMEZONE',
        status: timezone === 'UTC' ? 'warning' : 'ok',
        value: timezone,
        effect: 'Fuseau dans lequel les horaires sont lus.',
        ...(timezone === 'UTC' ? { fix: 'Pour des heures françaises : CLAN_MATCH_SYNC_TIMEZONE=Europe/Paris.' } : {}),
      },
      {
        key: 'cron_schedules',
        label: 'Horaires du .env',
        variable: Object.keys(SCHEDULE_VARIABLES).join(', '),
        status: invalid.length === 0 ? 'ok' : 'error',
        value:
          invalid.length === 0
            ? `${schedules.length} horaires valides`
            : `invalide : ${invalid.map((schedule) => `${schedule.variable} (« ${schedule.value} »)`).join(', ')}`,
        effect: `Valeurs de départ, réglables sans redémarrage dans Tâches planifiées. Ex. synchronisation des matchs : ${describeCronExpression(schedules[0].value)}`,
        ...(invalid.length === 0 ? {} : { fix: 'Une expression cron a cinq champs : minute heure jour mois jour-de-semaine.' }),
      },
      {
        key: 'cron_bootstrap_secret',
        label: 'Secret du point d’entrée interne',
        variable: 'CRON_BOOTSTRAP_SECRET',
        status: cronSecret === 'ok' ? 'ok' : cronSecret === 'missing' ? 'info' : 'error',
        value: secretValue(cronSecret, env.CRON_BOOTSTRAP_SECRET),
        effect: 'Lancement des tâches par le point d’entrée interne et sonde « processus cron actif » de Tâches planifiées. Absent : sonde désactivée.',
        ...(cronSecret === 'example' || cronSecret === 'too_short' ? { fix: GENERATE_SECRET } : {}),
      },
    ],
  }
}

function telemetrySection(env: SiteConfigFacts['env'], standaloneRuntime: boolean): SiteConfigSection {
  const boolItem = (key: string, variable: string, label: string, effect: string, trueNote: string, falseNote: string): SiteConfigItem => {
    const raw = env[variable]
    if (raw !== 'true' && raw !== 'false') {
      return { key, label, variable, status: 'warning', value: raw ?? 'absente', effect, fix: `Définir explicitement ${variable}=true ou false.` }
    }
    return { key, label, variable, status: 'ok', value: raw === 'true' ? trueNote : falseNote, effect }
  }
  const intItem = (key: string, variable: string, label: string, fallback: number, unit: string, effect: string): SiteConfigItem => {
    const raw = env[variable]
    if (raw === undefined) return { key, label, variable, status: 'ok', value: `${fallback}${unit} (par défaut)`, effect }
    return positiveInteger(raw) === null
      ? { key, label, variable, status: 'error', value: raw, effect, fix: 'Valeur invalide : un entier supérieur à 0 est attendu.' }
      : { key, label, variable, status: 'ok', value: `${raw}${unit}`, effect }
  }
  const lockItem = (key: string, variable: string, label: string): SiteConfigItem => {
    const raw = trimmed(env[variable])
    const effect = 'Fichier de verrou du worker : Tâches planifiées s’en sert pour dire si le worker tourne.'
    if (!standaloneRuntime || (raw && isAbsolutePath(raw))) {
      return { key, label, variable, status: 'ok', value: raw || 'absente (répertoire courant)', effect }
    }
    return {
      key,
      label,
      variable,
      status: 'error',
      value: raw || 'absente',
      effect,
      fix: 'Serveur lancé depuis .next/standalone : un chemin absolu, identique à celui du worker, est nécessaire (docs/ops/deployment.md).',
    }
  }
  const parserVersion = trimmed(env.TELEMETRY_PARSER_VERSION)

  return {
    id: 'telemetry',
    title: 'Télémétrie',
    description: 'Téléchargement et analyse des fichiers de télémétrie des parties.',
    items: [
      boolItem('telemetry_sync_enabled', 'TELEMETRY_SYNC_ENABLED', 'Synchronisation automatique', 'Analyse des parties après chaque synchronisation.', 'activée', 'désactivée'),
      {
        key: 'telemetry_parser_version',
        label: 'Version de l’analyseur',
        variable: 'TELEMETRY_PARSER_VERSION',
        status: parserVersion ? 'ok' : 'warning',
        value: parserVersion || 'absente (v1 par défaut)',
        effect: 'Version enregistrée sur chaque analyse ; la changer relance les reconstructions.',
        ...(parserVersion ? {} : { fix: 'Définir une version explicite (v2).' }),
      },
      intItem('telemetry_max_matches_per_run', 'TELEMETRY_MAX_MATCHES_PER_RUN', 'Parties par passage', 50, '', 'Nombre de parties analysées à chaque passage.'),
      intItem('telemetry_sync_concurrency', 'TELEMETRY_SYNC_CONCURRENCY', 'Analyses en parallèle', 2, '', 'Fichiers traités en même temps.'),
      intItem('telemetry_retry_max', 'TELEMETRY_RETRY_MAX', 'Nouvelles tentatives', 2, '', 'Essais avant d’abandonner un fichier.'),
      intItem('telemetry_fetch_timeout_ms', 'TELEMETRY_FETCH_TIMEOUT_MS', 'Délai de téléchargement', 30000, ' ms', 'Temps maximal pour télécharger un fichier.'),
      intItem('telemetry_max_asset_size_mb', 'TELEMETRY_MAX_ASSET_SIZE_MB', 'Taille maximale d’un fichier', 250, ' Mo', 'Un fichier plus gros est ignoré.'),
      boolItem('telemetry_capture_fixtures', 'TELEMETRY_CAPTURE_FIXTURES', 'Capture de fichiers de test', 'Garde une copie des fichiers analysés, pour le débogage.', 'active (à couper hors débogage)', 'coupée'),
      lockItem('telemetry_resync_worker_lock_file', 'TELEMETRY_RESYNC_WORKER_LOCK_FILE', 'Verrou du worker de télémétrie'),
      lockItem('telemetry_aggregate_worker_lock_file', 'TELEMETRY_AGGREGATE_WORKER_LOCK_FILE', 'Verrou du worker d’agrégats'),
    ],
  }
}

function databaseSection(env: SiteConfigFacts['env']): SiteConfigSection {
  const url = trimmed(env.DATABASE_URL)
  return {
    id: 'database',
    title: 'Base de données',
    description: 'Connexion à la base MySQL / MariaDB.',
    link: { href: '/settings/database', label: 'État de la base' },
    items: [
      {
        key: 'database_url',
        label: 'Connexion',
        variable: 'DATABASE_URL',
        status: url ? 'ok' : 'error',
        // Jamais l'adresse : elle contient le mot de passe.
        value: url ? 'définie' : 'absente',
        effect: 'Toutes les données du site.',
        ...(url ? {} : { fix: 'Définir DATABASE_URL dans le .env (Prisma le lit aussi pour les migrations).' }),
      },
    ],
  }
}

function obsoleteSection(env: SiteConfigFacts['env']): SiteConfigSection | null {
  const present = Object.entries(OBSOLETE_VARIABLES).filter(([variable]) => env[variable] !== undefined)
  if (present.length === 0) return null
  return {
    id: 'obsolete',
    title: 'Variables obsolètes',
    description: 'Présentes dans le .env, mais lues nulle part : à retirer pour qu’il reste lisible.',
    items: present.map(([variable, reason]) => ({
      key: `obsolete_${variable.toLowerCase()}`,
      label: variable,
      variable,
      status: 'warning' as const,
      value: 'présente',
      effect: `Aucun effet : ${reason}.`,
      fix: 'Retirer la ligne du .env.',
    })),
  }
}

export function buildSiteConfiguration(facts: SiteConfigFacts, now = new Date()): SiteConfiguration {
  const env = facts.env
  const production = env.NODE_ENV === 'production'
  const sections = [
    identitySection(env, production),
    securitySection(env),
    emailSection(env, facts.email),
    pubgSection(env, facts),
    tasksSection(env),
    telemetrySection(env, facts.standaloneRuntime),
    databaseSection(env),
    obsoleteSection(env),
  ].filter((section): section is SiteConfigSection => section !== null)
  const items = sections.flatMap((section) => section.items)
  return {
    generatedAt: now.toISOString(),
    errors: items.filter((item) => item.status === 'error').length,
    warnings: items.filter((item) => item.status === 'warning').length,
    sections,
  }
}

export async function getSiteConfiguration(): Promise<SiteConfiguration> {
  const [pubgRateLimitRpm, latestRateLimit, email] = await Promise.all([
    getPubgApiRateLimitRpm(),
    getLatestPubgRateLimitSnapshot(),
    getEmailDeliveryStatus(),
  ])
  return buildSiteConfiguration({
    env: process.env,
    pubgRateLimitRpm,
    latestRateLimit,
    email: { ready: email.ready, lastSuccessAt: email.lastSuccessAt, lastError: email.lastError },
    standaloneRuntime: process.cwd().replace(/\\/g, '/').endsWith('/.next/standalone'),
  })
}
