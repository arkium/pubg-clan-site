/**
 * Mise en route d'un clan — checklist du SuperUser, de la validation à la ligue (docs/features/inscription-clan.md).
 * Construction pure : les faits sont lus par `service.ts`, la page `/settings/clans/[clanId]/mise-en-route` les
 * affiche, la boîte « À traiter » (`src/lib/admin-inbox/`) en tire les clans récents à suivre.
 *
 * Chaque étape dit son état et, s'il y a quelque chose à faire, où le faire. `waiting` : la nuit ou le worker s'en
 * chargent ; `blocked` : une étape précédente manque, rien à faire ici.
 */

export type OnboardingStepStatus = 'done' | 'todo' | 'waiting' | 'blocked'

export type OnboardingAction =
  | { kind: 'link'; label: string; href: string }
  /** Boutons de la page : `POST /api/clans/[id]/cron-control` et `POST /api/clans/[id]/telemetry/recoveries`. */
  | { kind: 'sync_matches'; label: string }
  | { kind: 'enqueue_telemetry'; label: string }

export type OnboardingStepKey = 'validation' | 'owner' | 'members' | 'matches' | 'telemetry' | 'stats' | 'league'

export type OnboardingStep = {
  key: OnboardingStepKey
  title: string
  status: OnboardingStepStatus
  detail: string
  actions: OnboardingAction[]
  /** Le site marche sans : affichée, jamais remontée dans la boîte « À traiter ». */
  optional?: boolean
}

export type ClanOnboarding = {
  clan: { id: number; name: string; tag: string; state: 'pending' | 'active' | 'archived'; subdomain: string | null; createdAt: string }
  steps: OnboardingStep[]
  done: number
  total: number
  /** Première étape **obligatoire** à faire, pour la boîte « À traiter ». */
  nextTodo: OnboardingStep | null
}

export type ClanOnboardingFacts = {
  clan: {
    id: number
    name: string
    tag: string
    pubgClanId: string | null
    isActive: boolean
    archivedAt: Date | null
    archivedReason: string | null
    subdomain: string | null
    createdAt: Date
  }
  /** Membres au rôle Owner, actifs ou en attente. */
  owners: Array<{
    playerName: string
    active: boolean
    hasAccount: boolean
    /** Dernière invitation ni acceptée ni révoquée. */
    invite: { expiresAt: Date } | null
  }>
  activeMembers: number
  pendingJoinRequests: number
  /** Coéquipiers croisés dont le clan PUBG est celui-ci, pas encore suivis ; `null` sans `pubgClanId`. */
  detectedCandidates: number | null
  matches: { individual: number; squads: number; officialSquads: number; lastSquadAt: Date | null }
  /** Dernière synchronisation des matchs du clan (cron de 02:00 ou action manuelle). */
  lastMatchSync: { status: string; startedAt: Date } | null
  /** Ligne du clan dans le bilan de télémétrie ; `null` : aucune partie en escouade. */
  telemetry: { toQueue: number; urgent: number; inQueue: number; completionRate: number | null } | null
  statsReady: boolean
}

const DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', timeZone: 'Europe/Paris' })
const DATE_TIME = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count > 1 ? pluralForm : singular}`
}

function validationStep(facts: ClanOnboardingFacts, state: ClanOnboarding['clan']['state']): OnboardingStep {
  if (state === 'pending') {
    return {
      key: 'validation',
      title: 'Validation du clan',
      status: 'todo',
      detail: 'Le clan attend ta décision : rien ne se synchronise avant.',
      actions: [{ kind: 'link', label: 'Clans en attente', href: '/settings/clans/lifecycle?tab=pending' }],
    }
  }
  if (state === 'archived') {
    const when = facts.clan.archivedAt ? ` le ${DATE.format(facts.clan.archivedAt)}` : ''
    return {
      key: 'validation',
      title: 'Validation du clan',
      status: 'blocked',
      detail: facts.clan.archivedReason === 'rejected' ? `Demande refusée${when}.` : `Suivi arrêté${when}.`,
      actions: [{ kind: 'link', label: 'Clans archivés', href: '/settings/clans/lifecycle?tab=archived' }],
    }
  }
  return {
    key: 'validation',
    title: 'Validation du clan',
    status: 'done',
    detail: facts.clan.subdomain ? `Clan suivi, sous-domaine « ${facts.clan.subdomain} ».` : 'Clan suivi.',
    actions: [],
  }
}

function ownerStep(facts: ClanOnboardingFacts, state: ClanOnboarding['clan']['state'], now: Date): OnboardingStep {
  const membersHref = `/clans/${facts.clan.id}/settings/members`
  // Facultative : le site marche sans compte d'Owner, et en pratique le SuperUser administre seul
  // (docs/TODO/administration.md §4). Sans ce drapeau, presque tous les clans récents resteraient « à suivre ».
  const base = { key: 'owner' as const, title: 'Compte de l’Owner', optional: true }
  if (state !== 'active') return { ...base, status: 'blocked', detail: 'Après la validation du clan.', actions: [] }

  const withAccount = facts.owners.find((owner) => owner.active && owner.hasAccount)
  if (withAccount) return { ...base, status: 'done', detail: `${withAccount.playerName} a son compte.`, actions: [] }

  const owner = facts.owners.find((candidate) => candidate.active) ?? facts.owners[0]
  if (!owner) {
    return {
      ...base,
      status: 'todo',
      detail: 'Aucun Owner : le clan a été découvert sans demandeur. Désigne-en un parmi ses membres (rôle Owner).',
      actions: [{ kind: 'link', label: 'Membres du clan', href: membersHref }],
    }
  }
  if (owner.invite && owner.invite.expiresAt > now) {
    return {
      ...base,
      status: 'waiting',
      detail: `Invitation envoyée à ${owner.playerName}, valable jusqu’au ${DATE_TIME.format(owner.invite.expiresAt)}.`,
      actions: [],
    }
  }
  return {
    ...base,
    status: 'todo',
    detail: owner.invite
      ? `L’invitation de ${owner.playerName} a expiré : renvoie-la depuis les membres (e-mail ou lien à copier sur Discord).`
      : `${owner.playerName} n’a pas de compte ni d’invitation en cours : invite-le depuis les membres.`,
    actions: [{ kind: 'link', label: 'Inviter depuis les membres', href: membersHref }],
  }
}

function membersStep(facts: ClanOnboardingFacts, state: ClanOnboarding['clan']['state']): OnboardingStep {
  const base = { key: 'members' as const, title: 'Au moins deux joueurs suivis' }
  if (state !== 'active') return { ...base, status: 'blocked', detail: 'Après la validation du clan.', actions: [] }

  const actions: OnboardingAction[] = []
  if (facts.pendingJoinRequests > 0) {
    actions.push({ kind: 'link', label: `Demandes d’adhésion (${facts.pendingJoinRequests})`, href: `/clans/${facts.clan.id}/settings/members?tab=demandes` })
  }
  if (facts.detectedCandidates) {
    actions.push({ kind: 'link', label: `Candidats détectés (${facts.detectedCandidates})`, href: '/settings/clans' })
  }

  if (facts.activeMembers >= 2) {
    const extra = facts.detectedCandidates ? ` ${plural(facts.detectedCandidates, 'coéquipier détecté', 'coéquipiers détectés')} pas encore suivi${facts.detectedCandidates > 1 ? 's' : ''}.` : ''
    return { ...base, status: 'done', detail: `${plural(facts.activeMembers, 'membre actif', 'membres actifs')}.${extra}`, actions }
  }
  actions.push({ kind: 'link', label: 'Ajouter un joueur', href: `/clans/${facts.clan.id}/settings/members?tab=ajout` })
  return {
    ...base,
    status: 'todo',
    detail: `${plural(facts.activeMembers, 'membre actif', 'membres actifs')} : une partie ne compte que si deux membres suivis jouent dans la même escouade.`,
    actions,
  }
}

function matchesStep(facts: ClanOnboardingFacts, state: ClanOnboarding['clan']['state']): OnboardingStep {
  const base = { key: 'matches' as const, title: 'Parties importées' }
  if (state !== 'active') return { ...base, status: 'blocked', detail: 'Après la validation du clan.', actions: [] }
  if (facts.activeMembers === 0) return { ...base, status: 'blocked', detail: 'Aucun membre actif dont importer les parties.', actions: [] }

  const sync: OnboardingAction = { kind: 'sync_matches', label: 'Synchroniser les matchs' }
  const lastSync = facts.lastMatchSync
    ? ` Dernière synchronisation : ${DATE_TIME.format(facts.lastMatchSync.startedAt)}${facts.lastMatchSync.status === 'failed' ? ' (en échec)' : ''}.`
    : ''

  if (facts.matches.squads > 0) {
    const last = facts.matches.lastSquadAt ? `, la dernière le ${DATE.format(facts.matches.lastSquadAt)}` : ''
    return { ...base, status: 'done', detail: `${plural(facts.matches.squads, 'partie en escouade', 'parties en escouade')}${last}.`, actions: [] }
  }
  if (facts.matches.individual > 0) {
    return {
      ...base,
      status: 'todo',
      detail: `${plural(facts.matches.individual, 'partie importée', 'parties importées')}, aucune jouée à deux membres suivis : il manque des joueurs.${lastSync}`,
      actions: [sync],
    }
  }
  return {
    ...base,
    status: 'todo',
    detail: `Aucune partie importée. PUBG ne garde que 14 jours : lance la synchronisation sans attendre la nuit.${lastSync}`,
    actions: [sync],
  }
}

function telemetryStep(facts: ClanOnboardingFacts): OnboardingStep {
  const base = { key: 'telemetry' as const, title: 'Télémétrie analysée' }
  const recoveries: OnboardingAction = { kind: 'link', label: 'Données › Rattrapages', href: `/clans/${facts.clan.id}/settings/data/recoveries` }
  const telemetry = facts.telemetry
  if (facts.matches.squads === 0 || !telemetry) {
    return { ...base, status: 'blocked', detail: 'Après les premières parties en escouade.', actions: [] }
  }
  if (telemetry.toQueue > 0) {
    const urgent = telemetry.urgent > 0 ? `, dont ${telemetry.urgent} qui expire${telemetry.urgent > 1 ? 'nt' : ''} sous 7 jours` : ''
    return {
      ...base,
      status: 'todo',
      detail: `${plural(telemetry.toQueue, 'partie à mettre en file', 'parties à mettre en file')}${urgent}.`,
      actions: [{ kind: 'enqueue_telemetry', label: 'Mettre en file' }, recoveries],
    }
  }
  if (telemetry.inQueue > 0) {
    return { ...base, status: 'waiting', detail: `${plural(telemetry.inQueue, 'analyse en file', 'analyses en file')} : le worker les traite.`, actions: [recoveries] }
  }
  const rate = telemetry.completionRate === null ? '' : ` (${telemetry.completionRate.toLocaleString('fr-FR')} %)`
  return { ...base, status: 'done', detail: `Parties analysées${rate}.`, actions: [] }
}

function statsStep(facts: ClanOnboardingFacts): OnboardingStep {
  const base = { key: 'stats' as const, title: 'Statistiques du clan' }
  if (facts.statsReady) {
    return { ...base, status: 'done', detail: 'Calculées : la vue d’ensemble est remplie.', actions: [{ kind: 'link', label: 'Vue d’ensemble', href: `/clans/${facts.clan.id}/overview` }] }
  }
  if (facts.matches.squads === 0) return { ...base, status: 'blocked', detail: 'Après les premières parties en escouade.', actions: [] }
  return { ...base, status: 'waiting', detail: 'Calculées chaque nuit à 3 h : la vue d’ensemble reste vide jusque-là.', actions: [] }
}

function leagueStep(facts: ClanOnboardingFacts): OnboardingStep {
  const base = { key: 'league' as const, title: 'Ligue des clans' }
  if (!facts.clan.pubgClanId) {
    return {
      ...base,
      status: 'blocked',
      detail: 'Pas de clan PUBG (le demandeur n’en avait pas) : ce clan ne peut pas entrer dans la ligue.',
      actions: [],
    }
  }
  if (facts.matches.officialSquads === 0) {
    return { ...base, status: 'waiting', detail: 'Le clan entre au classement avec ses parties officielles en escouade, au minimum de la période.', actions: [] }
  }
  return {
    ...base,
    status: 'done',
    detail: `${plural(facts.matches.officialSquads, 'partie officielle', 'parties officielles')} en escouade comptent pour la ligue.`,
    actions: [{ kind: 'link', label: 'Ligue des clans', href: '/clans-leaderboard' }],
  }
}

export function buildClanOnboarding(facts: ClanOnboardingFacts, now: Date = new Date()): ClanOnboarding {
  const state: ClanOnboarding['clan']['state'] = facts.clan.archivedAt ? 'archived' : facts.clan.isActive ? 'active' : 'pending'
  const steps = [
    validationStep(facts, state),
    ownerStep(facts, state, now),
    membersStep(facts, state),
    matchesStep(facts, state),
    telemetryStep(facts),
    statsStep(facts),
    leagueStep(facts),
  ]
  return {
    clan: {
      id: facts.clan.id,
      name: facts.clan.name,
      tag: facts.clan.tag,
      state,
      subdomain: facts.clan.subdomain,
      createdAt: facts.clan.createdAt.toISOString(),
    },
    steps,
    done: steps.filter((step) => step.status === 'done').length,
    total: steps.length,
    nextTodo: steps.find((step) => step.status === 'todo' && !step.optional) ?? null,
  }
}
