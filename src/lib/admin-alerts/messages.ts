import { ADMIN_ALERT_EVENTS, type AdminAlertEvents } from '@/lib/admin-alerts/catalog'
import type { AdminInbox, AdminInboxTone } from '@/lib/admin-inbox/build'
import type { DiscordEmbed } from '@/lib/discord/discord-client'
import { PRIVACY_REQUEST_KIND_LABELS, type PrivacyRequestKind } from '@/lib/legal/privacy-request'
import { getPublicSiteBaseUrl } from '@/lib/public-base-url'
import {
  RESOURCE_POINT_KIND_LABELS,
  RESOURCE_REPORT_KIND_LABELS,
  resourceMap,
  type ResourcePointKind,
  type ResourceReportKind,
} from '@/lib/resources/resource-map'

/**
 * Contenu des alertes du salon d'administration (`src/lib/admin-alerts/catalog.ts`) — fonctions pures, testées seules.
 *
 * Discord est un service tiers : n'y part que ce qui sert à décider. Jamais une adresse e-mail, jamais le pseudo ni le
 * motif d'une demande « Retirer mes données ». Chaque message renvoie vers la page où la décision se prend.
 */

const COLOR_TO_DECIDE = 0xf5c518 // jaune de la charte : une décision t'attend
const COLOR_INCIDENT = 0xdc2626 // rouge : quelque chose n'a pas tourné
const COLOR_PRIVACY = 0x0ea5e9 // bleu : demande à délai légal
const COLOR_INFO = 0x64748b // ardoise : pour information

/** Adresse publique du site ; vide, les messages partent sans lien. */
function linkTo(path: string) {
  const base = getPublicSiteBaseUrl()
  return base ? `${base}${path}` : undefined
}

function clanLabel(tag: string, name: string) {
  return tag ? `[${tag}] ${name}` : name
}

const PENDING_CLANS_PATH = '/settings/clans/lifecycle?tab=pending'

export function clanRequestAlert(input: {
  clanId: number
  clanName: string
  clanTag: string
  platformShard: string
  playerName: string
  /** Le clan avait été refusé : la demande le remet dans la file. */
  reopened: boolean
  /** Le joueur est dans un clan PUBG ; sinon le « clan » porte son pseudo et restera hors de la ligue. */
  hasPubgClan: boolean
}): DiscordEmbed {
  const lines = [
    input.reopened
      ? `**${input.playerName}** redemande ce clan, refusé auparavant.`
      : `**${input.playerName}** demande l’inscription de son clan.`,
  ]
  if (!input.hasPubgClan) {
    lines.push('⚠️ Ce joueur n’est dans aucun clan PUBG : le clan porte son pseudo et ne pourra pas entrer dans la ligue.')
  }
  return {
    title: `🆕 Demande d’inscription — ${clanLabel(input.clanTag, input.clanName)}`,
    description: lines.join('\n'),
    url: linkTo(PENDING_CLANS_PATH),
    color: COLOR_TO_DECIDE,
    fields: [
      { name: 'Plateforme', value: input.platformShard, inline: true },
      { name: 'À faire', value: 'Valider ou refuser dans « Clans en attente »', inline: true },
    ],
    footer: { text: `Clan n° ${input.clanId}` },
  }
}

export function clanDiscoveredAlert(input: {
  clanId: number
  clanName: string
  clanTag: string
  waitingPlayers: number
}): DiscordEmbed {
  const players = input.waitingPlayers > 1 ? `${input.waitingPlayers} joueurs du parking jouent` : 'Un joueur du parking joue'
  return {
    title: `🔎 Clan découvert — ${clanLabel(input.clanTag, input.clanName)}`,
    description: `${players} dans ce clan PUBG, encore inconnu du site. Personne ne l’a demandé : ils y seront rattachés si tu le valides.`,
    url: linkTo(PENDING_CLANS_PATH),
    color: COLOR_TO_DECIDE,
    fields: [{ name: 'À faire', value: 'Valider ou refuser dans « Clans en attente »', inline: true }],
    footer: { text: `Clan n° ${input.clanId}` },
  }
}

export function orphanJoinRequestAlert(input: { clanId: number; clanName: string; clanTag: string; playerName: string }): DiscordEmbed {
  return {
    title: `🙋 Demande d’adhésion sans Owner — ${clanLabel(input.clanTag, input.clanName)}`,
    description: `**${input.playerName}** demande à rejoindre ce clan, qui n’a aucun Owner actif pour lui répondre.`,
    url: linkTo(`/clans/${input.clanId}/settings/members?tab=demandes`),
    color: COLOR_TO_DECIDE,
    fields: [{ name: 'À faire', value: 'Accepter ou refuser dans « Demandes d’adhésion »', inline: true }],
    footer: { text: `Clan n° ${input.clanId}` },
  }
}

/** Passage du cycle de vie en échec ; le coupe-circuit, lui, a son propre message (`discord-notifier.ts`). */
export function lifecycleFailedAlert(input: { runId: string | null; message?: string | null }): DiscordEmbed {
  return {
    title: '⚠️ Cycle de vie des clans — passage en échec',
    description: `${input.message ?? 'Erreur sans message.'}\n\nRien n’a été appliqué ; le prochain passage réessaiera.`,
    url: linkTo('/settings/clans/lifecycle?tab=health'),
    color: COLOR_INCIDENT,
    footer: { text: input.runId ? `Passage ${input.runId}` : 'Passage sans identifiant' },
  }
}

const DEADLINE_FORMAT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })

export function privacyRequestAlert(input: { id: number; kind: PrivacyRequestKind; deadline: Date }): DiscordEmbed {
  return {
    title: '🛡️ Demande « Retirer mes données »',
    description: 'Une demande vient d’arriver par la page de confidentialité. Le détail (pseudo, adresse, motif) reste sur le site.',
    url: linkTo('/settings/privacy-requests'),
    color: COLOR_PRIVACY,
    fields: [
      { name: 'Type', value: PRIVACY_REQUEST_KIND_LABELS[input.kind], inline: true },
      { name: 'Réponse avant le', value: DEADLINE_FORMAT.format(input.deadline), inline: true },
    ],
    footer: { text: `Demande n° ${input.id}` },
  }
}

export function resourceQueueAlert(
  input:
    | { submission: 'proposal'; mapKey: string; pointKind: ResourcePointKind; queueSize: number }
    | { submission: 'report'; mapKey: string; pointKind: ResourcePointKind; reportKind: ResourceReportKind; queueSize: number }
): DiscordEmbed {
  const map = resourceMap(input.mapKey)?.label ?? input.mapKey
  const point = RESOURCE_POINT_KIND_LABELS[input.pointKind].singular
  const what =
    input.submission === 'proposal'
      ? `Nouveau point proposé : **${point}** sur ${map}.`
      : `Signalement « ${RESOURCE_REPORT_KIND_LABELS[input.reportKind]} » sur un point **${point}** de ${map}.`
  return {
    title: input.submission === 'proposal' ? '📍 Carte des ressources — proposition' : '📍 Carte des ressources — signalement',
    description: what,
    url: linkTo('/carte-des-ressources?tab=validation'),
    color: COLOR_INFO,
    fields: [{ name: 'File de validation', value: input.queueSize > 1 ? `${input.queueSize} éléments` : '1 élément', inline: true }],
  }
}

const DIGEST_MAX_LINES = 12
const TONE_MARK: Record<AdminInboxTone, string> = { urgent: '🔴', todo: '🟠', info: '⚪' }

/**
 * Veille du matin (`daily_digest`) : la boîte « À traiter » de l'accueil Plateforme, décisions et incidents d'abord ;
 * les lignes « à relire » sont résumées en pied. L'appelant n'envoie rien quand aucune ligne n'attend d'action.
 */
export function dailyDigestAlert(inbox: AdminInbox): DiscordEmbed {
  const actionable = inbox.items.filter((item) => item.tone !== 'info')
  const toRead = inbox.items.filter((item) => item.tone === 'info')
  const lines = actionable.slice(0, DIGEST_MAX_LINES).map((item) => {
    const detail = item.detail ? ` — ${item.detail}` : ''
    return `${TONE_MARK[item.tone]} **${item.count}** ${item.label}${detail}`
  })
  if (actionable.length > DIGEST_MAX_LINES) lines.push(`_… et ${actionable.length - DIGEST_MAX_LINES} autre(s)_`)
  const urgent = actionable.filter((item) => item.tone === 'urgent').length
  const footer = [
    toRead.length > 0 ? `Aussi : ${toRead.map((item) => `${item.label} (${item.count})`).join(', ')}` : null,
    inbox.unavailable.length > 0 ? `Non lu : ${inbox.unavailable.join(', ')}` : null,
  ].filter(Boolean)
  return {
    title: `📋 À traiter ce matin — ${actionable.length} ${actionable.length > 1 ? 'sujets' : 'sujet'}`,
    // Discord borne une description à 4096 caractères : chaque détail est court, la liste est bornée.
    description: lines.join('\n').slice(0, 4000),
    url: linkTo('/settings'),
    color: urgent > 0 ? COLOR_INCIDENT : COLOR_TO_DECIDE,
    footer: footer.length > 0 ? { text: footer.join(' · ').slice(0, 2000) } : undefined,
  }
}

const COACH_SETTINGS_PATH = '/settings/coach'
const COACH_USAGE_PATH = '/settings/coach/usage'
const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' })

/** Plafond global du Coach IA à 80 %, puis atteint : à ce niveau, il se met en pause jusqu'au mois suivant. */
export function coachBudgetAlert(input: { level: 80 | 100; spentEur: number; budgetEur: number; periodEnd: Date }): DiscordEmbed {
  const reached = input.level === 100
  return {
    title: reached ? '⛔ Coach IA en pause — plafond du mois atteint' : '⚠️ Coach IA — plafond du mois à 80 %',
    description: reached
      ? `${EUR.format(input.spentEur)} dépensés sur ${EUR.format(input.budgetEur)} : plus aucune question jusqu’au ${DAY_MONTH_YEAR.format(input.periodEnd)}, sauf pour toi.`
      : `${EUR.format(input.spentEur)} dépensés sur ${EUR.format(input.budgetEur)}. Au plafond, le Coach se ferme à tous jusqu’au ${DAY_MONTH_YEAR.format(input.periodEnd)}.`,
    url: linkTo(COACH_USAGE_PATH),
    color: reached ? COLOR_INCIDENT : COLOR_TO_DECIDE,
    fields: [{ name: 'À faire', value: reached ? 'Relever le plafond dans « Coach IA », ou laisser passer le mois' : 'Surveiller la consommation ; relever le plafond si besoin', inline: false }],
  }
}

/** Erreurs répétées du fournisseur : le Coach ne répond plus, cause probable en pied (jamais la clé). */
export function coachProviderErrorsAlert(input: { errors: number; windowMinutes: number; lastMessage: string | null }): DiscordEmbed {
  return {
    title: '🛑 Coach IA — réponses en échec',
    description: `**${input.errors}** réponses en erreur en ${input.windowMinutes} minutes : les membres voient « Le Coach n’a pas pu répondre ».`,
    url: linkTo(COACH_USAGE_PATH),
    color: COLOR_INCIDENT,
    fields: [
      { name: 'Dernière erreur', value: (input.lastMessage ?? 'non précisée').slice(0, 200), inline: false },
      { name: 'À faire', value: 'Vérifier la clé et le quota Google, ou changer de modèle dans « Coach IA »', inline: false },
    ],
  }
}

/** Arrêt annoncé ou changement de prix du modèle actif, dans les trente jours. */
export function coachModelNoticeAlert(input: {
  model: { id: string; label: string }
  notice: { kind: 'shutdown' | 'price'; date: string }
  now: Date
}): DiscordEmbed {
  const [year, month, day] = input.notice.date.split('-').map(Number)
  const when = DAY_MONTH_YEAR.format(new Date(Date.UTC(year, month - 1, day, 12)))
  const shutdown = input.notice.kind === 'shutdown'
  return {
    title: shutdown ? `📅 Coach IA — arrêt annoncé de ${input.model.label}` : `📅 Coach IA — nouveau prix de ${input.model.label}`,
    description: shutdown
      ? `Google peut arrêter **${input.model.label}** (\`${input.model.id}\`) à partir du ${when} : le Coach cesserait de répondre.`
      : `Le tarif de **${input.model.label}** (\`${input.model.id}\`) change le ${when} : le coût par question suit.`,
    url: linkTo(COACH_SETTINGS_PATH),
    color: COLOR_INFO,
    fields: [{ name: 'À faire', value: shutdown ? 'Choisir un autre modèle dans « Coach IA » avant cette date' : 'Vérifier les budgets dans « Coach IA », ou changer de modèle', inline: false }],
  }
}

/** Message du bouton « Envoyer un test » : ce que le salon recevra désormais. */
export function adminAlertTestMessage(events: AdminAlertEvents): DiscordEmbed {
  const enabled = ADMIN_ALERT_EVENTS.filter((definition) => events[definition.key])
  return {
    title: '✅ Salon d’administration relié',
    description:
      enabled.length > 0
        ? ['Ce salon recevra :', ...enabled.map((definition) => `• ${definition.label}${definition.toAct ? ' — avec mention' : ''}`)].join('\n')
        : 'Aucune alerte n’est activée : ce salon ne recevra rien tant que tu n’en actives pas une.',
    url: linkTo('/settings/clans/lifecycle?tab=settings'),
    color: COLOR_INFO,
    footer: { text: 'Message de contrôle — aucun événement n’a eu lieu.' },
  }
}
