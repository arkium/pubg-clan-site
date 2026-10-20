'use client'

import { Bot, Gauge, MessageSquare, Save, Send, ShieldCheck } from 'lucide-react'
import { useId, useState } from 'react'

import { ButtonSpinner, ChoiceMenu, LifecycleCard, Switch, Tag, type LifecycleSettings, type Notify } from '@/components/clan-lifecycle/LifecycleShared'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { ADMIN_ALERT_EVENTS, ADMIN_ALERT_GROUPS, type AdminAlertEvents } from '@/lib/admin-alerts/catalog'
import type { DiscordMention, DiscordMentionType } from '@/lib/discord/discord-config'

/**
 * Onglet « Paramètres » (docs/features/cycle-de-vie-clan.md §8), selon la charte : cartes `app-panel`, champs
 * `app-input` à intitulé au-dessus et aide en méta, interrupteurs de la charte, mode en tuiles. Chaque réglage
 * s'enregistre seul, comme avant (un `PATCH` par changement, mêmes corps).
 *
 * La carte du salon Discord d'administration porte aussi, depuis le 2026-10-19, la mention et les alertes envoyées
 * (src/lib/admin-alerts/, docs/features/discord-notifications.md « Salon d'administration »).
 */

type Patch = Partial<Pick<LifecycleSettings, 'mode' | 'confirmationsRequired' | 'maxMovesRatioPercent' | 'archiveAfterDays' | 'autoArchive' | 'autoPromote' | 'mention'>> & {
  webhookUrl?: string
  /** Seulement les interrupteurs changés : la route fusionne avec ceux en vigueur. */
  alertEvents?: Partial<AdminAlertEvents>
}

const MENTION_OPTIONS: { value: DiscordMentionType; label: string }[] = [
  { value: 'none', label: 'Aucune' },
  { value: 'here', label: '@here' },
  { value: 'everyone', label: '@everyone' },
  { value: 'role', label: 'Un rôle' },
]

/** Champ entier borné + « Appliquer » : erreur au jeton négatif sous le champ, mêmes bornes que la route. */
function NumberSetting({
  label,
  hint,
  value,
  min,
  max,
  disabled,
  testId,
  onCommit,
}: {
  label: string
  hint: string
  value: number
  min: number
  max: number
  disabled: boolean
  testId: string
  onCommit: (value: number) => void
}) {
  const id = useId()
  const [local, setLocal] = useState(String(value))
  const parsed = Number(local)
  const valid = local.trim() !== '' && Number.isInteger(parsed) && parsed >= min && parsed <= max
  const error = valid ? null : `Entier entre ${min} et ${max}.`

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-[13px] font-semibold text-gray-700">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={local}
          disabled={disabled}
          onChange={(event) => setLocal(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-help`}
          className="app-input t-num w-24 font-semibold"
          data-testid={testId}
        />
        <button
          type="button"
          disabled={disabled || !valid || parsed === value}
          onClick={() => onCommit(parsed)}
          className="app-btn app-btn--sm app-btn--secondary"
        >
          Appliquer
        </button>
      </div>
      <span id={`${id}-help`} className={error ? 'text-[12px] font-semibold text-[var(--theme-ui-negative)]' : 't-meta'}>
        {error ?? hint}
      </span>
    </div>
  )
}

/** Ligne d'interrupteur : intitulé et aide à gauche, interrupteur à droite. */
function SwitchSetting({
  label,
  hint,
  badge,
  checked,
  disabled,
  testId,
  onChange,
}: {
  label: string
  hint: string
  /** Pastille après l'intitulé (« À traiter · mention » pour une alerte d'administration). */
  badge?: string
  checked: boolean
  disabled: boolean
  testId: string
  onChange: (checked: boolean) => void
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4 border-t border-gray-200 pt-3 first:border-t-0 first:pt-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span id={`${id}-label`} className="text-[13px] font-semibold text-gray-900">
            {label}
          </span>
          {badge ? <Tag tone="warn">{badge}</Tag> : null}
        </span>
        <span id={`${id}-hint`} className="t-meta">
          {hint}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <span className="t-meta hidden sm:inline" aria-hidden="true">
          {checked ? 'Activé' : 'Désactivé'}
        </span>
        <Switch checked={checked} onChange={onChange} disabled={disabled} labelledBy={`${id}-label`} describedBy={`${id}-hint`} testId={testId} />
      </div>
    </div>
  )
}

export function SettingsSection({ settings, onSaved, onToast }: { settings: LifecycleSettings; onSaved: () => void; onToast: Notify }) {
  const webhookId = useId()
  const [draft, setDraft] = useState(settings)
  const [webhookInput, setWebhookInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  // Valeurs en vigueur relues après un enregistrement : le brouillon s'y réaligne, sans remonter la section (une
  // saisie en cours, l'adresse du webhook par exemple, n'est pas effacée par le rechargement d'un autre réglage).
  const [syncedSettings, setSyncedSettings] = useState(settings)
  if (syncedSettings !== settings) {
    setSyncedSettings(settings)
    setDraft(settings)
  }

  async function save(patch: Patch) {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/clan-lifecycle', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload?.error ?? 'Échec de l’enregistrement')
      if (patch.webhookUrl !== undefined) setWebhookInput('')
      onToast('Réglage enregistré.', 'success')
      onSaved()
    } catch (err) {
      // Refusé : l'écran revient aux valeurs en vigueur plutôt que d'afficher un réglage qui n'a pas été pris.
      setDraft(settings)
      onToast(err instanceof Error ? err.message : 'Erreur inconnue', 'error')
    } finally {
      setSaving(false)
    }
  }

  function apply(patch: Patch) {
    setDraft((current) => ({
      ...current,
      ...patch,
      alertEvents: { ...current.alertEvents, ...patch.alertEvents },
      mention: patch.mention ?? current.mention,
    }))
    void save(patch)
  }

  async function sendTest() {
    setTesting(true)
    try {
      const res = await fetch('/api/settings/clan-lifecycle/webhook-test', { method: 'POST' })
      const payload = await res.json()
      if (!res.ok) throw new Error(payload?.error ?? 'Échec de l’envoi')
      onToast(payload.message ?? 'Message de test envoyé.', 'success')
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Erreur inconnue', 'error')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="grid items-start gap-[18px] lg:grid-cols-2" data-testid="lifecycle-settings">
      <LifecycleCard
        id="lifecycle-mode-title"
        icon={ShieldCheck}
        title="Mode d’exécution"
        meta="La seule décision qui engage : relis les mouvements confirmés avant de basculer."
      >
        <p className="t-body text-gray-700">
          En <b className="text-gray-900">observation</b>, les écarts sont journalisés sans qu’aucun membre ne soit déplacé. En{' '}
          <b className="text-gray-900">application</b>, les mouvements confirmés sont appliqués automatiquement.
        </p>
        <div data-testid="lifecycle-mode-control">
          <SegmentedControl
            options={[
              { value: 'observe', label: 'Observation' },
              { value: 'apply', label: 'Application' },
            ]}
            value={draft.mode}
            onChange={(mode) => apply({ mode })}
            size="sm"
          />
        </div>
      </LifecycleCard>

      <LifecycleCard id="lifecycle-thresholds-title" icon={Gauge} title="Seuils" meta="Chaque valeur s’applique seule, au prochain passage quotidien.">
        <div className="flex flex-col gap-4">
          <NumberSetting
            label="Confirmations exigées"
            hint="Passages quotidiens concordants avant d’agir. Mesuré le 2026-09-20 : 2 aurait déclenché à tort."
            key={`confirmationsRequired-${draft.confirmationsRequired}`}
            value={draft.confirmationsRequired}
            min={1}
            max={10}
            disabled={saving}
            testId="lifecycle-confirmations"
            onCommit={(confirmationsRequired) => apply({ confirmationsRequired })}
          />
          <NumberSetting
            label="Coupe-circuit (% de l’effectif)"
            hint="Au-delà, le passage s’abandonne sans rien appliquer."
            key={`maxMovesRatioPercent-${draft.maxMovesRatioPercent}`}
            value={draft.maxMovesRatioPercent}
            min={1}
            max={100}
            disabled={saving}
            testId="lifecycle-max-moves"
            onCommit={(maxMovesRatioPercent) => apply({ maxMovesRatioPercent })}
          />
          <NumberSetting
            label="Archivage du parking (jours)"
            hint="Inactivité au-delà de laquelle un joueur du parking devient archivable."
            key={`archiveAfterDays-${draft.archiveAfterDays}`}
            value={draft.archiveAfterDays}
            min={1}
            max={3650}
            disabled={saving}
            testId="lifecycle-archive-days"
            onCommit={(archiveAfterDays) => apply({ archiveAfterDays })}
          />
        </div>
      </LifecycleCard>

      <LifecycleCard id="lifecycle-automation-title" icon={Bot} title="Automatisation du parking" meta="Ce que le cron fait seul, sans validation.">
        <div className="flex flex-col gap-3">
          <SwitchSetting
            label="Promotion automatique depuis le parking"
            hint="Sort un joueur du parking dès que son clan est détecté, si ce clan est déjà suivi."
            checked={draft.autoPromote}
            disabled={saving}
            testId="lifecycle-auto-promote"
            onChange={(autoPromote) => apply({ autoPromote })}
          />
          <SwitchSetting
            label="Archivage automatique du parking"
            hint="Archive sans validation au-delà du seuil. Désactivé, le cron se contente de marquer les candidats."
            checked={draft.autoArchive}
            disabled={saving}
            testId="lifecycle-auto-archive"
            onChange={(autoArchive) => apply({ autoArchive })}
          />
        </div>
      </LifecycleCard>

      {/* Pleine largeur : adresse et mention à gauche, alertes envoyées à droite. */}
      <div className="lg:col-span-2">
        <LifecycleCard
          id="lifecycle-webhook-title"
          icon={MessageSquare}
          title="Salon Discord d’administration"
          meta="Webhook global, distinct de celui de chaque clan : toutes les alertes de la plateforme y arrivent."
          testId="lifecycle-admin-alerts"
        >
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-4">
              <p className="t-body text-gray-700">
                Demandes à traiter, incidents et comptes rendus partent dans ce salon. Laisse l’adresse vide pour tout
                couper — ce n’est pas une erreur.
              </p>
              <p className="t-meta break-all font-mono" data-testid="lifecycle-webhook-current">
                Actuel : {settings.webhookUrl ?? 'non configuré'}
              </p>
              {/* `noValidate` : une adresse invalide part au serveur, qui renvoie son message (comportement d'avant). */}
              <form
                noValidate
                className="flex flex-col gap-1"
                onSubmit={(event) => {
                  event.preventDefault()
                  void save({ webhookUrl: webhookInput })
                }}
              >
                <label htmlFor={webhookId} className="text-[13px] font-semibold text-gray-700">
                  Nouvelle adresse du webhook
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id={webhookId}
                    type="url"
                    value={webhookInput}
                    onChange={(event) => setWebhookInput(event.target.value)}
                    placeholder="https://discord.com/api/webhooks/..."
                    className="app-input sm:flex-1"
                    data-testid="lifecycle-webhook-input"
                  />
                  <button type="submit" disabled={saving} className="app-btn app-btn--sm app-btn--primary shrink-0 gap-1.5">
                    {saving ? <ButtonSpinner /> : <Save className="h-3.5 w-3.5" aria-hidden="true" />}
                    Enregistrer
                  </button>
                </div>
              </form>

              <MentionSetting
                key={`${draft.mention.type}-${draft.mention.roleId}`}
                mention={draft.mention}
                disabled={saving}
                onCommit={(mention) => apply({ mention })}
              />

              <div className="flex flex-col gap-1">
                <div>
                  <button
                    type="button"
                    onClick={() => void sendTest()}
                    disabled={testing || !settings.webhookUrl}
                    className="app-btn app-btn--sm app-btn--secondary gap-1.5"
                    data-testid="lifecycle-webhook-test"
                  >
                    {testing ? <ButtonSpinner /> : <Send className="h-3.5 w-3.5" aria-hidden="true" />}
                    Envoyer un test
                  </button>
                </div>
                <span className="t-meta">
                  {settings.webhookUrl
                    ? 'Un message de contrôle, avec la mention, liste ce que le salon recevra.'
                    : 'Enregistre d’abord l’adresse du webhook.'}
                </span>
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-4" data-testid="lifecycle-alert-events">
              {ADMIN_ALERT_GROUPS.map((group) => (
                <fieldset key={group.key} className="min-w-0">
                  <legend className="t-label mb-2">{group.label}</legend>
                  {/* Enveloppe propre : le filet `first:` des lignes ne doit pas compter la légende. */}
                  <div className="flex flex-col gap-3">
                    {ADMIN_ALERT_EVENTS.filter((definition) => definition.group === group.key).map((definition) => (
                      <SwitchSetting
                        key={definition.key}
                        label={definition.label}
                        hint={definition.hint}
                        badge={definition.toAct ? 'À traiter · mention' : undefined}
                        checked={draft.alertEvents[definition.key]}
                        disabled={saving}
                        testId={`lifecycle-alert-${definition.key}`}
                        onChange={(checked) => apply({ alertEvents: { [definition.key]: checked } })}
                      />
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
          </div>
        </LifecycleCard>
      </div>
    </div>
  )
}

/**
 * Mention des alertes à traiter : appliquée dès le choix, sauf « Un rôle », qui attend son identifiant (clic droit sur
 * le rôle dans Discord → Copier l'identifiant, mode développeur activé).
 */
function MentionSetting({ mention, disabled, onCommit }: { mention: DiscordMention; disabled: boolean; onCommit: (mention: DiscordMention) => void }) {
  const roleInputId = useId()
  const [type, setType] = useState<DiscordMentionType>(mention.type)
  const [roleId, setRoleId] = useState(mention.roleId)
  const roleValid = /^\d{5,20}$/.test(roleId)

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[13px] font-semibold text-gray-700">Mention des alertes à traiter</span>
      <ChoiceMenu
        label="Mention des alertes à traiter"
        value={type}
        options={MENTION_OPTIONS}
        testId="lifecycle-alert-mention"
        onChange={(next) => {
          setType(next)
          if (next !== 'role') onCommit({ type: next, roleId: '' })
        }}
      />
      {type === 'role' ? (
        <div className="mt-1 flex flex-col gap-1">
          <label htmlFor={roleInputId} className="text-[13px] font-semibold text-gray-700">
            Identifiant du rôle Discord
          </label>
          <div className="flex gap-2">
            <input
              id={roleInputId}
              type="text"
              inputMode="numeric"
              maxLength={20}
              value={roleId}
              disabled={disabled}
              onChange={(event) => setRoleId(event.target.value.replace(/\D/g, ''))}
              placeholder="123456789012345678"
              className="app-input t-num min-w-0 flex-1 font-mono"
              data-testid="lifecycle-alert-mention-role"
            />
            <button
              type="button"
              disabled={disabled || !roleValid || (mention.type === 'role' && mention.roleId === roleId)}
              onClick={() => onCommit({ type: 'role', roleId })}
              className="app-btn app-btn--sm app-btn--secondary shrink-0"
            >
              Appliquer
            </button>
          </div>
        </div>
      ) : null}
      <span className="t-meta">
        Portée seulement par ce qui attend ta décision ; un compte rendu ne réveille personne.
      </span>
    </div>
  )
}
