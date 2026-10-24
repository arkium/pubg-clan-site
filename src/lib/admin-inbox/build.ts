/**
 * Boîte « À traiter » du SuperUser (accueil Plateforme, veille Discord du matin) — construction pure, sans base.
 *
 * Les files du SuperUser vivent chacune sur leur page (clans en attente, demandes de confidentialité, carte des
 * ressources…), sans compteur ailleurs : cette boîte les rassemble. Chaque ligne n'apparaît que si elle a quelque
 * chose à dire ; une source illisible est signalée à part (`unavailable`), jamais affichée comme un zéro.
 *
 * Les faits sont lus par `service.ts` ; le seuil de chaque ton est fixé ici, pour la page et pour Discord.
 */

/** `urgent` : quelque chose se perd ou a cassé ; `todo` : une décision t'attend ; `info` : à relire quand tu peux. */
export type AdminInboxTone = 'urgent' | 'todo' | 'info'

export type AdminInboxItem = {
  key: string
  tone: AdminInboxTone
  count: number
  label: string
  detail: string | null
  href: string
  /** Liens secondaires (un par clan, par exemple), quand la ligne en couvre plusieurs. */
  links?: Array<{ label: string; href: string }>
}

export type AdminInbox = {
  items: AdminInboxItem[]
  /** Sources qui n'ont pas pu être lues : leur ligne manque, la page le dit. */
  unavailable: string[]
  generatedAt: string
}

type ClanRef = { id: number; tag: string; name: string }

/** `null` : la source n'a pas pu être lue. */
export type AdminInboxFacts = {
  pendingClans: Array<ClanRef & { createdAt: Date }> | null
  /** Clans validés récemment dont la mise en route n'est pas finie (`src/lib/clan-onboarding/`). */
  onboardingClans: Array<{ clan: ClanRef; nextStep: string; done: number; total: number }> | null
  orphanJoinRequests: Array<{ playerName: string; clan: ClanRef }> | null
  privacyDeadlines: Date[] | null
  resourceQueue: number | null
  unacknowledgedMoves: number | null
  archiveCandidates: number | null
  /** Dernier passage du cycle de vie ; `undefined` : jamais passé. */
  lastLifecycleRun: { status: string; startedAt: Date; circuitBreakerTripped: boolean } | undefined | null
  /** Les crons doivent tourner (production) : sinon, l'absence de passage n'est pas un incident. */
  cronJobsExpected: boolean
  telemetry: { workerAlive: boolean; queueRemaining: number; urgentBacklog: number } | null
  cronFailures: Array<{ label: string; clanTag: string | null }> | null
  configErrors: number | null
  /** Réponses du Coach IA votées « Inexact » et pas encore relues (`/settings/coach/questions`). */
  coachInaccurateVotes: number | null
}

export const ADMIN_INBOX_SOURCE_LABELS: Record<Exclude<keyof AdminInboxFacts, 'cronJobsExpected'>, string> = {
  pendingClans: 'clans en attente',
  onboardingClans: 'mise en route des clans',
  orphanJoinRequests: 'demandes d’adhésion',
  privacyDeadlines: 'demandes de confidentialité',
  resourceQueue: 'carte des ressources',
  unacknowledgedMoves: 'mouvements à relire',
  archiveCandidates: 'parking',
  lastLifecycleRun: 'cycle de vie',
  telemetry: 'télémétrie',
  cronFailures: 'tâches planifiées',
  configErrors: 'configuration',
  coachInaccurateVotes: 'Coach IA',
}

const DAY_MS = 24 * 60 * 60 * 1000
/** Un clan qui attend depuis une semaine : la demande refroidit, l'équipe perd ses parties (fenêtre PUBG de 14 j). */
export const PENDING_CLAN_URGENT_DAYS = 7
/** Échéance légale d'une demande de confidentialité à moins d'une semaine. */
export const PRIVACY_URGENT_DAYS = 7
/** Le cycle de vie passe chaque nuit à 01:45 : au-delà de 30 h sans passage, le cron ne tourne plus. */
export const LIFECYCLE_STALE_HOURS = 30

const TONE_ORDER: Record<AdminInboxTone, number> = { urgent: 0, todo: 1, info: 2 }

const DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count > 1 ? pluralForm : singular}`
}

function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS)
}

function pendingClansItem(clans: NonNullable<AdminInboxFacts['pendingClans']>, now: Date): AdminInboxItem | null {
  if (clans.length === 0) return null
  const oldest = clans.reduce((current, clan) => (clan.createdAt < current.createdAt ? clan : current))
  const waitingDays = daysBetween(oldest.createdAt, now)
  return {
    key: 'pending_clans',
    tone: waitingDays >= PENDING_CLAN_URGENT_DAYS ? 'urgent' : 'todo',
    count: clans.length,
    label: 'Clans en attente de ta décision',
    detail:
      waitingDays >= 1
        ? `Le plus ancien, [${oldest.tag}], attend depuis ${plural(waitingDays, 'jour')}.`
        : `[${oldest.tag}] est arrivé aujourd’hui.`,
    href: '/settings/clans/lifecycle?tab=pending',
  }
}

function onboardingItem(clans: NonNullable<AdminInboxFacts['onboardingClans']>): AdminInboxItem | null {
  if (clans.length === 0) return null
  const href = (clanId: number) => `/settings/clans/${clanId}/mise-en-route`
  return {
    key: 'onboarding',
    tone: 'todo',
    count: clans.length,
    label: 'Clans en cours de mise en route',
    detail: clans.map((entry) => `[${entry.clan.tag}] ${entry.done}/${entry.total} — ${entry.nextStep}`).join(' · '),
    href: href(clans[0].clan.id),
    links: clans.length > 1 ? clans.map((entry) => ({ label: `[${entry.clan.tag}]`, href: href(entry.clan.id) })) : undefined,
  }
}

function orphanJoinRequestsItem(requests: NonNullable<AdminInboxFacts['orphanJoinRequests']>): AdminInboxItem | null {
  if (requests.length === 0) return null
  const byClan = new Map<number, { clan: ClanRef; players: string[] }>()
  for (const request of requests) {
    const entry = byClan.get(request.clan.id) ?? { clan: request.clan, players: [] }
    entry.players.push(request.playerName)
    byClan.set(request.clan.id, entry)
  }
  const clans = [...byClan.values()]
  return {
    key: 'orphan_join_requests',
    tone: 'todo',
    count: requests.length,
    label: 'Demandes d’adhésion sans Owner pour y répondre',
    detail: clans.map((entry) => `${entry.players.join(', ')} → [${entry.clan.tag}]`).join(' · '),
    href: `/clans/${clans[0].clan.id}/settings/members?tab=demandes`,
    links:
      clans.length > 1
        ? clans.map((entry) => ({ label: `[${entry.clan.tag}]`, href: `/clans/${entry.clan.id}/settings/members?tab=demandes` }))
        : undefined,
  }
}

function privacyItem(deadlines: Date[], now: Date): AdminInboxItem | null {
  if (deadlines.length === 0) return null
  const overdue = deadlines.filter((deadline) => deadline <= now).length
  const nearest = deadlines.reduce((current, deadline) => (deadline < current ? deadline : current))
  const urgent = overdue > 0 || nearest.getTime() - now.getTime() <= PRIVACY_URGENT_DAYS * DAY_MS
  return {
    key: 'privacy_requests',
    tone: urgent ? 'urgent' : 'todo',
    count: deadlines.length,
    label: 'Demandes « Retirer mes données »',
    detail:
      overdue > 0
        ? `${plural(overdue, 'demande')} au-delà de l’échéance légale d’un mois.`
        : `Échéance la plus proche : ${DATE_FORMAT.format(nearest)}.`,
    href: '/settings/privacy-requests',
  }
}

function lifecycleItem(facts: AdminInboxFacts, now: Date): AdminInboxItem | null {
  const run = facts.lastLifecycleRun
  if (run === null) return null
  const href = '/settings/clans/lifecycle?tab=health'
  if (run === undefined) {
    return facts.cronJobsExpected
      ? { key: 'lifecycle', tone: 'urgent', count: 1, label: 'Cycle de vie des clans jamais passé', detail: 'Aucun passage enregistré : le cron du cycle de vie ne tourne pas.', href }
      : null
  }
  if (run.circuitBreakerTripped || run.status === 'aborted') {
    return { key: 'lifecycle', tone: 'urgent', count: 1, label: 'Dernier passage du cycle de vie abandonné', detail: 'Coupe-circuit déclenché : aucun mouvement n’a été appliqué.', href }
  }
  if (run.status === 'failed') {
    return { key: 'lifecycle', tone: 'urgent', count: 1, label: 'Dernier passage du cycle de vie en échec', detail: 'Rien n’a été appliqué ; le détail est dans l’onglet Santé.', href }
  }
  const hours = Math.floor((now.getTime() - run.startedAt.getTime()) / (60 * 60 * 1000))
  if (facts.cronJobsExpected && hours > LIFECYCLE_STALE_HOURS) {
    return { key: 'lifecycle', tone: 'urgent', count: 1, label: 'Cycle de vie des clans à l’arrêt', detail: `Aucun passage depuis ${plural(hours, 'heure')}.`, href }
  }
  return null
}

function telemetryItems(telemetry: NonNullable<AdminInboxFacts['telemetry']>): AdminInboxItem[] {
  const items: AdminInboxItem[] = []
  if (!telemetry.workerAlive && telemetry.queueRemaining > 0) {
    items.push({
      key: 'telemetry_worker',
      tone: 'urgent',
      count: telemetry.queueRemaining,
      label: 'Worker de télémétrie arrêté',
      detail: `${plural(telemetry.queueRemaining, 'analyse')} en file n’avancent plus.`,
      href: '/settings/telemetry',
    })
  }
  if (telemetry.urgentBacklog > 0) {
    items.push({
      key: 'telemetry_expiring',
      tone: 'todo',
      count: telemetry.urgentBacklog,
      label: 'Parties qui expirent sans analyse',
      detail: `Jouées il y a 7 à 14 jours : PUBG les efface ensuite.${telemetry.queueRemaining > 0 ? ` ${plural(telemetry.queueRemaining, 'analyse')} en file en ce moment.` : ''}`,
      href: '/settings/telemetry',
    })
  }
  return items
}

function cronFailuresItem(failures: NonNullable<AdminInboxFacts['cronFailures']>): AdminInboxItem | null {
  if (failures.length === 0) return null
  const byLabel = new Map<string, Set<string>>()
  for (const failure of failures) {
    const clans = byLabel.get(failure.label) ?? new Set<string>()
    if (failure.clanTag) clans.add(`[${failure.clanTag}]`)
    byLabel.set(failure.label, clans)
  }
  return {
    key: 'cron_failures',
    tone: 'urgent',
    count: failures.length,
    label: 'Tâches planifiées en échec (24 h)',
    detail: [...byLabel.entries()].map(([label, clans]) => (clans.size > 0 ? `${label} : ${[...clans].join(', ')}` : label)).join(' · '),
    href: '/settings/cron',
  }
}

export function buildAdminInbox(facts: AdminInboxFacts, now: Date = new Date()): AdminInbox {
  const items: Array<AdminInboxItem | null> = []

  if (facts.pendingClans) items.push(pendingClansItem(facts.pendingClans, now))
  if (facts.onboardingClans) items.push(onboardingItem(facts.onboardingClans))
  if (facts.orphanJoinRequests) items.push(orphanJoinRequestsItem(facts.orphanJoinRequests))
  if (facts.privacyDeadlines) items.push(privacyItem(facts.privacyDeadlines, now))
  if (facts.resourceQueue) {
    items.push({
      key: 'resource_queue',
      tone: 'todo',
      count: facts.resourceQueue,
      label: 'Carte des ressources : propositions et signalements',
      detail: null,
      href: '/carte-des-ressources?tab=validation',
    })
  }
  items.push(lifecycleItem(facts, now))
  if (facts.telemetry) items.push(...telemetryItems(facts.telemetry))
  if (facts.cronFailures) items.push(cronFailuresItem(facts.cronFailures))
  if (facts.configErrors) {
    items.push({
      key: 'config_errors',
      tone: 'urgent',
      count: facts.configErrors,
      label: 'Erreurs de configuration du serveur',
      detail: 'Un réglage du .env empêche une fonction du site de marcher.',
      href: '/settings/configuration',
    })
  }
  if (facts.unacknowledgedMoves) {
    items.push({
      key: 'unacknowledged_moves',
      tone: 'info',
      count: facts.unacknowledgedMoves,
      label: 'Mouvements automatiques à relire',
      detail: 'Appliqués par le cycle de vie, à marquer comme vus ou à annuler.',
      href: '/settings/clans/lifecycle?tab=mutations',
    })
  }
  if (facts.archiveCandidates) {
    items.push({
      key: 'archive_candidates',
      tone: 'info',
      count: facts.archiveCandidates,
      label: 'Joueurs du parking archivables',
      detail: 'Inactifs au-delà du seuil : les archiver arrête leurs appels quotidiens à PUBG.',
      href: '/settings/clans/lifecycle?tab=ungrouped',
    })
  }
  if (facts.coachInaccurateVotes) {
    items.push({
      key: 'coach_inaccurate_votes',
      tone: 'info',
      count: facts.coachInaccurateVotes,
      label: 'Réponses du Coach IA signalées « Inexact » à relire',
      detail: 'Question, précision du joueur, réponse et outils appelés, sans le compte.',
      href: '/settings/coach/questions',
    })
  }

  const unavailable = (Object.keys(ADMIN_INBOX_SOURCE_LABELS) as Array<keyof typeof ADMIN_INBOX_SOURCE_LABELS>)
    .filter((key) => facts[key] === null)
    .map((key) => ADMIN_INBOX_SOURCE_LABELS[key])

  return {
    items: items
      .filter((item): item is AdminInboxItem => item !== null)
      // Tri stable : à ton égal, l'ordre ci-dessus (décisions d'abord) est gardé.
      .sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]),
    unavailable,
    generatedAt: now.toISOString(),
  }
}

/** Lignes qui justifient de déranger le SuperUser (veille Discord) : tout sauf l'information. */
export function actionableInboxItems(inbox: AdminInbox) {
  return inbox.items.filter((item) => item.tone !== 'info')
}
