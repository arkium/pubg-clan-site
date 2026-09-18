'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, MessageSquare, Trophy } from 'lucide-react'

import DiscordEmbedPreview from '@/components/discord/DiscordEmbedPreview'
import SettingsPageHeader from '@/components/settings/SettingsPageHeader'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { useAuthSession } from '@/hooks/useAuthSession'
import {
  DEFAULT_DISCORD_SETTINGS,
  isValidDiscordWebhookUrl,
  renderDiscordMention,
  type DiscordMatchType,
  type DiscordMention,
  type DiscordSettings,
  type DiscordTeamMode,
} from '@/lib/discord/discord-config'
import { buildTop1WebhookPayload } from '@/lib/discord/discord-top1-embed'
import { buildTournamentRoundWebhookPayload } from '@/lib/discord/discord-tournament-embed'

const TEAM_MODE_LABELS: Record<DiscordTeamMode, string> = {
  duo: 'Duo (2 membres)',
  trio: 'Trio (3 membres)',
  squad: 'Squad (4 membres)',
}

const MATCH_TYPE_LABELS: Record<DiscordMatchType, string> = {
  official: 'Officiel (matchmaking classé)',
  casual: 'Casual',
  airoyale: 'Matchs IA (airoyale)',
  custom: 'Parties personnalisées (custom)',
}

const MENTION_OPTIONS = [
  { value: 'none', label: 'Aucune' },
  { value: 'here', label: '@here' },
  { value: 'everyone', label: '@everyone' },
  { value: 'role', label: 'Rôle personnalisé' },
] as const

const SAMPLE_PLAYED_AT = new Date('2026-01-01T20:15:00.000Z')

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

type Feedback = { tone: 'success' | 'error'; message: string }

function FeedbackBanner({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null

  const isSuccess = feedback.tone === 'success'
  const Icon = isSuccess ? CheckCircle2 : AlertTriangle

  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
        isSuccess
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-300'
          : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-300'
      }`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{feedback.message}</span>
    </div>
  )
}

function MentionField({
  idPrefix,
  mention,
  onChange,
}: {
  idPrefix: string
  mention: DiscordMention
  onChange: (mention: DiscordMention) => void
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={`${idPrefix}-mention`} className="text-sm font-medium text-gray-700">
        Mention en tête de message
      </label>
      <select
        id={`${idPrefix}-mention`}
        value={mention.type}
        onChange={(event) =>
          onChange({
            type: event.target.value as DiscordMention['type'],
            roleId: event.target.value === 'role' ? mention.roleId : '',
          })
        }
        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
      >
        {MENTION_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {mention.type === 'role' ? (
        <input
          type="text"
          value={mention.roleId}
          maxLength={20}
          onChange={(event) => onChange({ type: 'role', roleId: event.target.value.replace(/\D/g, '') })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="ID numérique du rôle (clic droit sur le rôle → Copier l'identifiant)"
        />
      ) : null}
    </div>
  )
}

export default function ClanDiscordSettingsPage() {
  const router = useRouter()
  const params = useParams()
  const clanId = parseClanId(params.clanId)

  const { loading, authenticated, permissions, isSuperUser } = useAuthSession()
  const canManageSettings =
    isSuperUser || permissions.includes('*') || permissions.includes('manage_settings')

  const [settings, setSettings] = useState<DiscordSettings>(DEFAULT_DISCORD_SETTINGS)
  const [clanLabel, setClanLabel] = useState<string | null>(null)
  const [dataLoaded, setDataLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testingKind, setTestingKind] = useState<'top1' | 'tournament' | null>(null)
  // Un retour par action, affiche au contact du bouton qui le declenche : le
  // formulaire est trop long pour un bandeau unique.
  const [top1TestFeedback, setTop1TestFeedback] = useState<Feedback | null>(null)
  const [tournamentTestFeedback, setTournamentTestFeedback] = useState<Feedback | null>(null)
  const [formFeedback, setFormFeedback] = useState<Feedback | null>(null)

  const { top1, tournament } = settings

  useEffect(() => {
    if (!loading && !authenticated) {
      router.replace(`/login?redirect=/clans/${clanId ?? ''}/settings/discord`)
    }
  }, [authenticated, loading, router, clanId])

  useEffect(() => {
    if (loading || !authenticated || !canManageSettings || !clanId) return

    let cancelled = false

    async function loadSettings() {
      try {
        const response = await fetch(`/api/clans/${clanId}/settings/discord`, { cache: 'no-store' })
        const payload = (await response.json().catch(() => null)) as
          | { settings?: DiscordSettings; clanLabel?: string | null; error?: string }
          | null

        if (!response.ok) {
          throw new Error(payload?.error ?? 'Impossible de charger la configuration Discord')
        }

        if (!cancelled) {
          setSettings(payload?.settings ?? DEFAULT_DISCORD_SETTINGS)
          setClanLabel(payload?.clanLabel ?? null)
        }
      } catch (loadError) {
        if (!cancelled) {
          setFormFeedback({
            tone: 'error',
            message:
              loadError instanceof Error
                ? loadError.message
                : 'Impossible de charger la configuration Discord',
          })
        }
      } finally {
        if (!cancelled) setDataLoaded(true)
      }
    }

    void loadSettings()

    return () => {
      cancelled = true
    }
  }, [authenticated, canManageSettings, loading, clanId])

  function updateTop1(patch: Partial<DiscordSettings['top1']>) {
    setSettings((current) => ({ ...current, top1: { ...current.top1, ...patch } }))
  }

  function updateTournament(patch: Partial<DiscordSettings['tournament']>) {
    setSettings((current) => ({ ...current, tournament: { ...current.tournament, ...patch } }))
  }

  function clearFeedback() {
    setFormFeedback(null)
    setTop1TestFeedback(null)
    setTournamentTestFeedback(null)
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setSaving(true)
      clearFeedback()

      const response = await fetch(`/api/clans/${clanId}/settings/discord`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(settings),
      })

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; settings?: DiscordSettings }
        | null

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Échec de la sauvegarde')
      }

      if (payload?.settings) setSettings(payload.settings)
      setFormFeedback({ tone: 'success', message: 'Configuration Discord enregistrée.' })
    } catch (saveError) {
      setFormFeedback({
        tone: 'error',
        message: saveError instanceof Error ? saveError.message : 'Échec de la sauvegarde',
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleTestWebhook(kind: 'top1' | 'tournament') {
    const setFeedback = kind === 'top1' ? setTop1TestFeedback : setTournamentTestFeedback
    const webhookUrl = kind === 'top1' ? top1.webhookUrl : tournament.webhookUrl

    try {
      setTestingKind(kind)
      clearFeedback()

      const response = await fetch(`/api/clans/${clanId}/settings/discord/test`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ webhookUrl, kind }),
      })

      const payload = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        throw new Error(payload?.error ?? "Échec de l'envoi du message de test")
      }

      setFeedback({
        tone: 'success',
        message: 'Message de test publié sur Discord — vérifiez le canal du webhook.',
      })
    } catch (testError) {
      setFeedback({
        tone: 'error',
        message:
          testError instanceof Error ? testError.message : "Échec de l'envoi du message de test",
      })
    } finally {
      setTestingKind(null)
    }
  }

  const [clanTag, clanName] = useMemo(() => {
    const match = clanLabel?.match(/^\[([^\]]*)\]\s*(.*)$/)
    return [match?.[1] ?? 'TAG', match?.[2] ?? 'Votre clan']
  }, [clanLabel])

  const top1Preview = useMemo(
    () =>
      buildTop1WebhookPayload({
        clanId: clanId ?? 0,
        clanName,
        clanTag,
        squadMatchId: 'exemple',
        mapKey: 'Baltic_Main',
        mapLabel: 'Erangel',
        gameModeLabel: 'Squad FPP',
        matchTypeLabel: 'Match officiel',
        playedAt: SAMPLE_PLAYED_AT,
        members: [
          { displayName: 'Joueur1', kills: 7, damage: 820, assists: 2, revives: 0, timeSurvived: 1834 },
          { displayName: 'Joueur2', kills: 4, damage: 410, assists: 0, revives: 1, timeSurvived: 1834 },
        ],
        mention: renderDiscordMention(top1.mention),
        siteUrl: '',
      }),
    [clanId, clanName, clanTag, top1.mention]
  )

  const tournamentPreview = useMemo(() => {
    const label = `[${clanTag}] ${clanName}`

    return buildTournamentRoundWebhookPayload({
      tournamentId: 'exemple',
      tournamentTitle: 'Coupe inter-clans',
      roundNumber: 2,
      totalRounds: 3,
      squadMatchId: 'exemple',
      telemetryClanId: null,
      mapLabel: 'Miramar',
      gameModeLabel: 'Squad FPP',
      playedAt: SAMPLE_PLAYED_AT,
      // Aperçu du mode historique : les autres modes changent le vocabulaire, pas la structure de l'embed.
      mode: 'inter_clan',
      mixedSquadRule: 'full_share',
      results: [
        {
          label,
          bestPlacement: 1,
          totalKills: 8,
          placementScore: 15,
          killScore: 8,
          winBonus: 5,
          points: 28,
        },
        {
          label: '[BRV] Clan Bravo',
          bestPlacement: 2,
          totalKills: 5,
          placementScore: 12,
          killScore: 5,
          winBonus: 0,
          points: 17,
        },
      ],
      mvp: { displayName: 'Joueur1', clanLabel: label, kills: 6, damage: 940 },
      standings: tournament.includeStandings
        ? [
            { label, totalPoints: 45, totalKills: 14 },
            { label: '[BRV] Clan Bravo', totalPoints: 31, totalKills: 11 },
          ]
        : null,
      mention: renderDiscordMention(tournament.mention),
      siteUrl: '',
    })
  }, [clanName, clanTag, tournament.includeStandings, tournament.mention])

  if (loading || (authenticated && canManageSettings && !dataLoaded)) {
    return (
      <main className="app-container app-main flex flex-1 items-center justify-center">
        <p className="text-sm text-gray-600">Chargement de la configuration...</p>
      </main>
    )
  }

  if (!authenticated) return null

  if (!clanId) {
    return (
      <main className="app-container app-main flex-1">
        <section className="app-panel p-6">
          <p className="text-sm text-rose-700">Identifiant de clan invalide.</p>
        </section>
      </main>
    )
  }

  if (!canManageSettings) {
    return (
      <main className="app-container app-main flex-1">
        <section className="app-panel p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-600">Permissions</p>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">Accès restreint</h1>
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-800">
              Cette page est réservée au Owner ou aux admins disposant de la permission
              manage_settings.
            </p>
          </div>
          <Link href={`/clans/${clanId}/settings`} className="mt-5 app-btn app-btn--md app-btn--secondary">
            Retour aux paramètres
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main className="app-container app-main flex-1">
      <NavigationTrail
        currentLabel="Notifications Discord"
        currentHref={`/clans/${clanId}/settings/discord`}
        fallbackParent={{ href: `/clans/${clanId}/settings`, label: 'Paramètres', altHref: '/clans' }}
      />

      <form onSubmit={handleSave} className="space-y-6">
        <section className="app-panel p-5 sm:p-6">
          <SettingsPageHeader
            title="Notifications Discord"
            subtitle={
              clanLabel
                ? `Publiez automatiquement les résultats de ${clanLabel} dans vos canaux Discord.`
                : 'Publiez automatiquement les résultats du clan dans vos canaux Discord.'
            }
          />

          <div className="mt-6 flex items-center gap-2 border-t border-gray-200 pt-5">
            <MessageSquare className="h-4 w-4 text-amber-500" aria-hidden="true" />
            <h2 className="text-base font-semibold text-gray-900">Alertes Top 1 (Chicken Dinner)</h2>
          </div>

          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <div className="app-panel-muted space-y-5 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <input
                  id="top1-enabled"
                  type="checkbox"
                  checked={top1.enabled}
                  onChange={(event) => updateTop1({ enabled: event.target.checked })}
                  className="mt-0.5 h-4 w-4"
                />
                <label htmlFor="top1-enabled" className="text-sm font-medium text-gray-700">
                  Activer les alertes Top 1
                  <span className="mt-0.5 block text-xs font-normal text-gray-500">
                    Un message part dès qu&apos;une escouade du clan termine première.
                  </span>
                </label>
              </div>

              <div className="space-y-1 text-sm font-medium text-gray-700">
                <label htmlFor="top1-webhook">URL du webhook Discord</label>
                <input
                  id="top1-webhook"
                  type="url"
                  value={top1.webhookUrl}
                  maxLength={500}
                  onChange={(event) => updateTop1({ webhookUrl: event.target.value })}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="https://discord.com/api/webhooks/..."
                />
                <p className="text-xs font-normal text-gray-500">
                  Serveur Discord → Paramètres du salon → Intégrations → Webhooks → Copier l&apos;URL.
                </p>
                <button
                  type="button"
                  onClick={() => handleTestWebhook('top1')}
                  disabled={testingKind !== null || !isValidDiscordWebhookUrl(top1.webhookUrl)}
                  className="app-btn app-btn--sm app-btn--secondary mt-1"
                >
                  {testingKind === 'top1' ? 'Envoi en cours...' : 'Tester le webhook Top 1'}
                </button>
                <div className="pt-1 font-normal">
                  <FeedbackBanner feedback={top1TestFeedback} />
                </div>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-gray-700">Modes d&apos;équipe</legend>
                {(Object.keys(TEAM_MODE_LABELS) as DiscordTeamMode[]).map((mode) => (
                  <label key={mode} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={top1.teamModes[mode]}
                      onChange={(event) =>
                        updateTop1({ teamModes: { ...top1.teamModes, [mode]: event.target.checked } })
                      }
                      className="h-4 w-4"
                    />
                    {TEAM_MODE_LABELS[mode]}
                  </label>
                ))}
              </fieldset>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-gray-700">Types de match</legend>
                {(Object.keys(MATCH_TYPE_LABELS) as DiscordMatchType[]).map((type) => (
                  <label key={type} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={top1.matchTypes[type]}
                      onChange={(event) =>
                        updateTop1({ matchTypes: { ...top1.matchTypes, [type]: event.target.checked } })
                      }
                      className="h-4 w-4"
                    />
                    {MATCH_TYPE_LABELS[type]}
                  </label>
                ))}
              </fieldset>

              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">
                  Membres du clan minimum dans l&apos;escouade
                </p>
                <SegmentedControl
                  size="sm"
                  value={String(top1.minClanMembers)}
                  onChange={(value) => updateTop1({ minClanMembers: Number(value) })}
                  options={[
                    { value: '2', label: '2 membres' },
                    { value: '3', label: '3 membres' },
                    { value: '4', label: '4 membres' },
                  ]}
                />
                <p className="text-xs text-gray-500">
                  Une escouade est enregistrée à partir de 2 membres du clan : les victoires en solo
                  ne peuvent pas être détectées.
                </p>
              </div>

              <MentionField
                idPrefix="top1"
                mention={top1.mention}
                onChange={(mention) => updateTop1({ mention })}
              />
            </div>

            <section className="app-panel-muted space-y-3 p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-gray-900">Aperçu du message</h3>
              <DiscordEmbedPreview payload={top1Preview} />
            </section>
          </div>
        </section>

        <section className="app-panel p-5 sm:p-6">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-indigo-500" aria-hidden="true" />
            <h2 className="text-base font-semibold text-gray-900">Tournois inter-clans</h2>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Les résultats de manche ne partent jamais tout seuls : ils se diffusent depuis la page
            de gestion des tournois, après validation dans une modale d&apos;aperçu.
          </p>

          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <div className="app-panel-muted space-y-5 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <input
                  id="tournament-enabled"
                  type="checkbox"
                  checked={tournament.enabled}
                  onChange={(event) => updateTournament({ enabled: event.target.checked })}
                  className="mt-0.5 h-4 w-4"
                />
                <label htmlFor="tournament-enabled" className="text-sm font-medium text-gray-700">
                  Activer les annonces de tournoi
                  <span className="mt-0.5 block text-xs font-normal text-gray-500">
                    Débloque le bouton « Diffuser sur Discord » sur vos tournois.
                  </span>
                </label>
              </div>

              <div className="space-y-1 text-sm font-medium text-gray-700">
                <label htmlFor="tournament-webhook">URL du webhook Discord</label>
                <input
                  id="tournament-webhook"
                  type="url"
                  value={tournament.webhookUrl}
                  maxLength={500}
                  onChange={(event) => updateTournament({ webhookUrl: event.target.value })}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="https://discord.com/api/webhooks/..."
                />
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => updateTournament({ webhookUrl: top1.webhookUrl })}
                    disabled={!top1.webhookUrl}
                    className="app-btn app-btn--sm app-btn--secondary"
                  >
                    📋 Identique au canal Top 1
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTestWebhook('tournament')}
                    disabled={testingKind !== null || !isValidDiscordWebhookUrl(tournament.webhookUrl)}
                    className="app-btn app-btn--sm app-btn--secondary"
                  >
                    {testingKind === 'tournament' ? 'Envoi en cours...' : 'Tester le webhook Tournoi'}
                  </button>
                </div>
                <div className="pt-1 font-normal">
                  <FeedbackBanner feedback={tournamentTestFeedback} />
                </div>
              </div>

              <div className="flex items-start gap-3">
                <input
                  id="tournament-standings"
                  type="checkbox"
                  checked={tournament.includeStandings}
                  onChange={(event) => updateTournament({ includeStandings: event.target.checked })}
                  className="mt-0.5 h-4 w-4"
                />
                <label htmlFor="tournament-standings" className="text-sm font-medium text-gray-700">
                  Inclure le classement général provisoire
                  <span className="mt-0.5 block text-xs font-normal text-gray-500">
                    Ajoute le cumul du tournoi sous le récapitulatif de la manche.
                  </span>
                </label>
              </div>

              <MentionField
                idPrefix="tournament"
                mention={tournament.mention}
                onChange={(mention) => updateTournament({ mention })}
              />
            </div>

            <section className="app-panel-muted space-y-3 p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-gray-900">Aperçu du message</h3>
              <DiscordEmbedPreview payload={tournamentPreview} />
            </section>
          </div>

          <div className="mt-6 space-y-4 border-t border-gray-200 pt-5">
            <div className="app-modal-callout rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-600">
                Les vignettes de carte et les liens vers le site utilisent
                <code className="mx-1 rounded bg-gray-100 px-1 py-0.5 text-[11px] dark:bg-slate-800">
                  NEXT_PUBLIC_APP_URL
                </code>
                : ils ne s&apos;afficheront dans Discord que si le site est joignable publiquement.
                Les aperçus ci-dessus les omettent volontairement.
              </p>
            </div>

            <FeedbackBanner feedback={formFeedback} />

            <button type="submit" disabled={saving} className="app-btn app-btn--md app-btn--primary">
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </section>
      </form>
    </main>
  )
}
