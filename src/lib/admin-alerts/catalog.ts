/**
 * Alertes d'administration — catalogue des événements (docs/features/discord-notifications.md, « Salon
 * d'administration »). Module pur : la page « Cycle de vie des clans » l'importe pour ses interrupteurs.
 *
 * Toutes les alertes partent dans le **même** salon Discord, le webhook global
 * `AppConfig.clan_lifecycle_discord_webhook_url`. Chaque événement s'active seul ; ceux qui attendent une décision
 * (`toAct`) portent la mention réglée sur la page (@here, @everyone ou un rôle), pour que le téléphone sonne. Les
 * comptes rendus, eux, n'en portent jamais.
 */

export const ADMIN_ALERT_GROUPS = [
  { key: 'clans', label: 'Clans et joueurs' },
  { key: 'platform', label: 'Plateforme' },
] as const

export type AdminAlertGroup = (typeof ADMIN_ALERT_GROUPS)[number]['key']

export type AdminAlertDefinition = {
  key: string
  group: AdminAlertGroup
  label: string
  hint: string
  /** Attend une décision du SuperUser : le message porte la mention. */
  toAct: boolean
  defaultEnabled: boolean
}

export const ADMIN_ALERT_EVENTS = [
  {
    key: 'clan_request',
    group: 'clans',
    label: 'Demande d’inscription d’un clan',
    hint: 'Un joueur inscrit son clan depuis /join, ou redemande un clan refusé. À décider dans « Clans en attente ».',
    toAct: true,
    defaultEnabled: true,
  },
  {
    key: 'clan_discovered',
    group: 'clans',
    label: 'Clan découvert par la synchronisation',
    hint: 'Le passage quotidien trouve des joueurs du parking dans un clan PUBG inconnu : le clan attend ta décision.',
    toAct: true,
    defaultEnabled: true,
  },
  {
    key: 'orphan_join_request',
    group: 'clans',
    label: 'Demande d’adhésion sans Owner pour y répondre',
    hint: 'Un joueur demande à rejoindre un clan qui n’a aucun Owner actif : toi seul peux lui répondre.',
    toAct: true,
    defaultEnabled: true,
  },
  {
    key: 'lifecycle_report',
    group: 'clans',
    label: 'Mouvements automatiques du cycle de vie',
    hint: 'Compte rendu de chaque passage quotidien qui détecte un écart : transferts, bascules au parking.',
    toAct: false,
    defaultEnabled: true,
  },
  {
    key: 'lifecycle_incident',
    group: 'clans',
    label: 'Passage du cycle de vie abandonné ou en échec',
    hint: 'Coupe-circuit déclenché ou passage en erreur : rien n’a été appliqué, il faut regarder pourquoi.',
    toAct: true,
    defaultEnabled: true,
  },
  {
    key: 'privacy_request',
    group: 'platform',
    label: 'Demande « Retirer mes données »',
    hint: 'Réponse due sous un mois. Seuls le type et l’échéance partent sur Discord, jamais le pseudo ni l’adresse.',
    toAct: true,
    defaultEnabled: true,
  },
  {
    key: 'daily_digest',
    group: 'platform',
    label: 'Veille du matin : ce qui reste à traiter',
    hint: 'Chaque matin à 9 h, la boîte « À traiter » de l’accueil Plateforme, seulement si une décision ou un incident t’attend : tâches en échec, worker arrêté, parties qui expirent, configuration.',
    toAct: true,
    defaultEnabled: true,
  },
  {
    key: 'resource_queue',
    group: 'platform',
    label: 'Carte des ressources : proposition ou signalement',
    hint: 'Un joueur propose un point ou signale une erreur : à traiter dans la file de validation de la carte.',
    toAct: false,
    defaultEnabled: true,
  },
  {
    key: 'coach_budget',
    group: 'platform',
    label: 'Coach IA : plafond global du mois à 80 %, puis atteint',
    hint: 'Une alerte à 80 % du plafond, une autre quand il est atteint (le Coach se met alors en pause jusqu’au 1er du mois). Plafond réglable dans « Coach IA ».',
    toAct: true,
    defaultEnabled: true,
  },
  {
    key: 'coach_provider_errors',
    group: 'platform',
    label: 'Coach IA : erreurs répétées du fournisseur',
    hint: 'Cinq réponses en échec en un quart d’heure (clé refusée, quota Google, panne) : le Coach ne répond plus. Une alerte, puis silence six heures.',
    toAct: true,
    defaultEnabled: true,
  },
  {
    key: 'coach_model_notice',
    group: 'platform',
    label: 'Coach IA : arrêt ou changement de prix du modèle actif',
    hint: 'Trente jours avant une date annoncée par Google pour le modèle en service : à changer de modèle dans « Coach IA », ou à accepter le nouveau prix.',
    toAct: false,
    defaultEnabled: true,
  },
] as const satisfies readonly AdminAlertDefinition[]

export type AdminAlertEvent = (typeof ADMIN_ALERT_EVENTS)[number]['key']

export type AdminAlertEvents = Record<AdminAlertEvent, boolean>

export function adminAlertDefinition(event: AdminAlertEvent): AdminAlertDefinition {
  return ADMIN_ALERT_EVENTS.find((definition) => definition.key === event) as AdminAlertDefinition
}

export function isAdminAlertEvent(value: unknown): value is AdminAlertEvent {
  return typeof value === 'string' && ADMIN_ALERT_EVENTS.some((definition) => definition.key === value)
}

export const DEFAULT_ADMIN_ALERT_EVENTS = Object.fromEntries(
  ADMIN_ALERT_EVENTS.map((definition) => [definition.key, definition.defaultEnabled])
) as AdminAlertEvents

/**
 * Lit les interrupteurs enregistrés (`{ "clan_request": false, … }`) : un événement absent garde sa valeur par
 * défaut — un événement ajouté plus tard part donc sans qu'on ait à réenregistrer la page —, une valeur qui n'est pas
 * un booléen aussi.
 */
export function normalizeAdminAlertEvents(value: unknown): AdminAlertEvents {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  return Object.fromEntries(
    ADMIN_ALERT_EVENTS.map((definition) => {
      const stored = raw[definition.key]
      return [definition.key, typeof stored === 'boolean' ? stored : definition.defaultEnabled]
    })
  ) as AdminAlertEvents
}

/** Garde d'un corps de requête les seuls interrupteurs connus et booléens. */
export function pickAdminAlertEventsPatch(value: unknown): Partial<AdminAlertEvents> {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  const patch: Partial<AdminAlertEvents> = {}
  for (const definition of ADMIN_ALERT_EVENTS) {
    const candidate = raw[definition.key]
    if (typeof candidate === 'boolean') patch[definition.key] = candidate
  }
  return patch
}
