'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Copy, Info, Lock, MessageSquare, Save, Send, Trophy } from 'lucide-react'

import DiscordEmbedPreview from '@/components/discord/DiscordEmbedPreview'
import ClanSettingsBanner from '@/components/clan-settings/ClanSettingsBanner'
import { ButtonSpinner, Callout, ChoiceMenu, ErrorState, ListSkeleton, SectionCard, Switch } from '@/components/ui/CharteKit'
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
    <p className={`t-body m-0 flex items-start gap-2 ${isSuccess ? 't-pos' : 't-neg'}`} role="status">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{feedback.message}</span>
    </p>
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
    <div className="flex flex-col gap-1">
      <span className="t-label">Mention en tête de message</span>
      <ChoiceMenu
        label="Mention en tête de message"
        value={mention.type}
        onChange={(type) => onChange({ type, roleId: type === 'role' ? mention.roleId : '' })}
        options={MENTION_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
      />
      {mention.type === 'role' ? (
        <input
          id={`${idPrefix}-mention-role`}
          type="text"
          value={mention.roleId}
          maxLength={20}
          aria-label="Identifiant du rôle Discord"
          onChange={(event) => onChange({ type: 'role', roleId: event.target.value.replace(/\D/g, '') })}
          className="app-input"
          placeholder="Identifiant du rôle (clic droit sur le rôle → Copier l’identifiant)"
        />
      ) : null}
    </div>
  )
}

/** Interrupteur à intitulé et précision (charte §5e), pour activer un type d'annonce. */
function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string
  label: string
  hint: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col">
        <span id={`${id}-label`} className="t-body font-semibold text-gray-900">
          {label}
        </span>
        <span id={`${id}-hint`} className="t-meta">
          {hint}
        </span>
      </div>
      <Switch checked={checked} onChange={onChange} labelledBy={`${id}-label`} describedBy={`${id}-hint`} />
    </div>
  )
}

/** Case à cocher de la charte (accent), avec son libellé. */
function CheckOption({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <label className="t-body flex items-center gap-2 text-gray-900">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-[var(--theme-ui-accent)]"
      />
      {children}
    </label>
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
      <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
        <ListSkeleton rows={3} />
      </div>
    )
  }

  if (!authenticated) return null

  if (!clanId) {
    return (
      <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
        <section className="app-panel">
          <ErrorState message="Identifiant de clan invalide." />
        </section>
      </div>
    )
  }

  if (!canManageSettings) {
    return (
      <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
        <Callout tone="warn" icon={Lock} title="Accès réservé">
          Cette page est réservée à l’Owner du clan et au SuperUser.{' '}
          <Link href={`/clans/${clanId}/settings`} className="app-link font-semibold">
            Retour aux paramètres du clan
          </Link>
        </Callout>
      </div>
    )
  }

  return (
    // `.charte` : page écrite selon la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
      <ClanSettingsBanner
        clanId={clanId}
        title="Notifications Discord"
        subtitle={
          clanLabel
            ? `Les résultats de ${clanLabel} publiés automatiquement dans vos canaux Discord.`
            : 'Les résultats du clan publiés automatiquement dans vos canaux Discord.'
        }
        icon={MessageSquare}
        image="/discord-chicken-dinner.jpg"
        currentHref={`/clans/${clanId}/settings/discord`}
        pills={[top1.enabled ? 'Top 1 actif' : 'Top 1 coupé', tournament.enabled ? 'Tournois actifs' : 'Tournois coupés']}
      />

      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <SectionCard
          id="discord-top1"
          icon={MessageSquare}
          title="Alertes Top 1"
          meta="Un message part dès qu’une escouade du clan termine première."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <SwitchRow
                id="top1-enabled"
                label="Activer les alertes Top 1"
                hint="Publication automatique après chaque victoire du clan."
                checked={top1.enabled}
                onChange={(enabled) => updateTop1({ enabled })}
              />

              <label className="flex flex-col gap-1">
                <span className="t-label">URL du webhook Discord</span>
                <input
                  id="top1-webhook"
                  type="url"
                  value={top1.webhookUrl}
                  maxLength={500}
                  onChange={(event) => updateTop1({ webhookUrl: event.target.value })}
                  className="app-input"
                  placeholder="https://discord.com/api/webhooks/…"
                />
                <span className="t-meta">Serveur Discord → Paramètres du salon → Intégrations → Webhooks → Copier l’URL.</span>
              </label>
              <div className="flex flex-col gap-2">
                <div>
                  <button
                    type="button"
                    onClick={() => handleTestWebhook('top1')}
                    disabled={testingKind !== null || !isValidDiscordWebhookUrl(top1.webhookUrl)}
                    className="app-btn app-btn--sm app-btn--secondary gap-1.5"
                  >
                    {testingKind === 'top1' ? <ButtonSpinner /> : <Send className="h-3.5 w-3.5" aria-hidden="true" />}
                    {testingKind === 'top1' ? 'Envoi en cours…' : 'Tester le webhook'}
                  </button>
                </div>
                <FeedbackBanner feedback={top1TestFeedback} />
              </div>

              <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
                <legend className="t-label mb-1">Modes d’équipe</legend>
                {(Object.keys(TEAM_MODE_LABELS) as DiscordTeamMode[]).map((mode) => (
                  <CheckOption
                    key={mode}
                    checked={top1.teamModes[mode]}
                    onChange={(checked) => updateTop1({ teamModes: { ...top1.teamModes, [mode]: checked } })}
                  >
                    {TEAM_MODE_LABELS[mode]}
                  </CheckOption>
                ))}
              </fieldset>

              <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
                <legend className="t-label mb-1">Types de match</legend>
                {(Object.keys(MATCH_TYPE_LABELS) as DiscordMatchType[]).map((type) => (
                  <CheckOption
                    key={type}
                    checked={top1.matchTypes[type]}
                    onChange={(checked) => updateTop1({ matchTypes: { ...top1.matchTypes, [type]: checked } })}
                  >
                    {MATCH_TYPE_LABELS[type]}
                  </CheckOption>
                ))}
              </fieldset>

              <div className="flex flex-col gap-1.5">
                <span className="t-label">Membres du clan dans l’escouade, au moins</span>
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
                <span className="t-meta">
                  Une escouade compte à partir de 2 membres du clan : les victoires en solo ne sont pas détectées.
                </span>
              </div>

              <MentionField idPrefix="top1" mention={top1.mention} onChange={(mention) => updateTop1({ mention })} />
            </div>

            <div className="flex flex-col gap-2">
              <span className="t-label">Aperçu du message</span>
              <DiscordEmbedPreview payload={top1Preview} />
            </div>
          </div>
        </SectionCard>

        <SectionCard
          id="discord-tournament"
          icon={Trophy}
          title="Tournois inter-clans"
          meta="Les résultats de manche ne partent jamais seuls : ils se diffusent depuis la gestion des tournois, après un aperçu."
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="flex flex-col gap-4">
              <SwitchRow
                id="tournament-enabled"
                label="Activer les annonces de tournoi"
                hint="Débloque le bouton « Diffuser sur Discord » sur vos tournois."
                checked={tournament.enabled}
                onChange={(enabled) => updateTournament({ enabled })}
              />

              <label className="flex flex-col gap-1">
                <span className="t-label">URL du webhook Discord</span>
                <input
                  id="tournament-webhook"
                  type="url"
                  value={tournament.webhookUrl}
                  maxLength={500}
                  onChange={(event) => updateTournament({ webhookUrl: event.target.value })}
                  className="app-input"
                  placeholder="https://discord.com/api/webhooks/…"
                />
              </label>
              <div className="flex flex-col gap-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => updateTournament({ webhookUrl: top1.webhookUrl })}
                    disabled={!top1.webhookUrl}
                    className="app-btn app-btn--sm app-btn--secondary gap-1.5"
                  >
                    <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    Même canal que le Top 1
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTestWebhook('tournament')}
                    disabled={testingKind !== null || !isValidDiscordWebhookUrl(tournament.webhookUrl)}
                    className="app-btn app-btn--sm app-btn--secondary gap-1.5"
                  >
                    {testingKind === 'tournament' ? <ButtonSpinner /> : <Send className="h-3.5 w-3.5" aria-hidden="true" />}
                    {testingKind === 'tournament' ? 'Envoi en cours…' : 'Tester le webhook'}
                  </button>
                </div>
                <FeedbackBanner feedback={tournamentTestFeedback} />
              </div>

              <SwitchRow
                id="tournament-standings"
                label="Inclure le classement général provisoire"
                hint="Ajoute le cumul du tournoi sous le récapitulatif de la manche."
                checked={tournament.includeStandings}
                onChange={(includeStandings) => updateTournament({ includeStandings })}
              />

              <MentionField
                idPrefix="tournament"
                mention={tournament.mention}
                onChange={(mention) => updateTournament({ mention })}
              />
            </div>

            <div className="flex flex-col gap-2">
              <span className="t-label">Aperçu du message</span>
              <DiscordEmbedPreview payload={tournamentPreview} />
            </div>
          </div>
        </SectionCard>

        <div className="flex flex-col gap-3">
          <p className="app-panel-muted t-body m-0 flex items-start gap-2.5 px-3.5 py-3 text-gray-700">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
            <span>
              Les vignettes de carte et les liens vers le site utilisent <code className="font-mono text-xs">NEXT_PUBLIC_APP_URL</code> :
              ils ne s’affichent dans Discord que si le site est joignable publiquement. Les aperçus ci-dessus les omettent.
            </span>
          </p>
          <FeedbackBanner feedback={formFeedback} />
          <div>
            <button type="submit" disabled={saving} className="app-btn app-btn--md app-btn--primary gap-2">
              {saving ? <ButtonSpinner /> : <Save className="h-4 w-4" aria-hidden="true" />}
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
