'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, Gamepad2, HelpCircle, Search, ShieldCheck, UserPlus } from 'lucide-react'

import MobileDropdownNav, { type MobileDropdownNavItem } from '@/components/ui/MobileDropdownNav'
import { useAuthSession } from '@/hooks/useAuthSession'
import { MembersSectionHeader } from '@/components/clan-settings/MembersSettingsTabs'
import { ButtonSpinner, Callout, ConfirmDialog, ListSkeleton, toneStyle } from '@/components/ui/CharteKit'

const PLATFORM_OPTIONS = [
  { value: 'steam', label: 'Steam (PC)' },
  { value: 'console', label: 'Console (PlayStation / Xbox)' },
  { value: 'kakao', label: 'Kakao (Corée)' },
]

type AddMemberPreviewResponse = {
  mode: 'preview'
  player: {
    displayName: string
    pubgPlayerName: string
    platformShard: string
  }
  clan: {
    id: number
    name: string
    tag: string
  } | null
}

/**
 * Onglet « Ajouter un joueur » de /clans/[clanId]/settings/members (ex-/members/add, lot 3b) : l'ajout se fait dans le
 * clan de l'adresse ; faire suivre un nouveau clan PUBG reste au SuperUser (Q15).
 */
export default function AddMemberPanel({ clanId }: { clanId: number }) {
  const { loading: authLoading, permissions, isSuperUser } = useAuthSession()
  const [submitting, setSubmitting] = useState(false)
  const [checkingPlayer, setCheckingPlayer] = useState(false)
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [previewData, setPreviewData] = useState<AddMemberPreviewResponse | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [pubgPlayerName, setPubgPlayerName] = useState('')
  const [platformShard, setPlatformShard] = useState('steam')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const canManageMembers = useMemo(
    () => isSuperUser || permissions.includes('*') || permissions.includes('manage_members'),
    [isSuperUser, permissions]
  )

  const selectedPlatformLabel =
    PLATFORM_OPTIONS.find((option) => option.value === platformShard)?.label ?? 'Steam (PC)'

  const platformItems: MobileDropdownNavItem[] = PLATFORM_OPTIONS.map((option) => ({
    key: option.value,
    label: option.label,
    active: option.value === platformShard,
    onSelect: () => setPlatformShard(option.value),
  }))

  // Si le nom affiché est vide, on prend automatiquement le pseudo PUBG
  const effectiveDisplayName = displayName.trim() || pubgPlayerName.trim()

  async function handleAddMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedPubg = pubgPlayerName.trim()
    if (!trimmedPubg) {
      setError('Veuillez renseigner le pseudo PUBG du joueur.')
      return
    }

    setError('')
    setSuccess('')
    setCheckingPlayer(true)

    try {
      const response = await fetch('/api/members', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          displayName: effectiveDisplayName,
          pubgPlayerName: trimmedPubg,
          platformShard,
          clanId,
          mode: 'preview',
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | (AddMemberPreviewResponse & { error?: string })
        | null

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Impossible de vérifier le joueur sur PUBG.')
      }

      if (!payload || payload.mode !== 'preview') {
        throw new Error('Réponse de prévisualisation invalide du serveur.')
      }

      setPreviewData(payload)
      setShowConfirmModal(true)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Erreur inconnue')
    } finally {
      setCheckingPlayer(false)
    }
  }

  function cancelConfirm() {
    if (submitting) {
      return
    }

    setShowConfirmModal(false)
  }

  async function confirmAddMember() {
    const trimmedPubg = pubgPlayerName.trim()
    if (!trimmedPubg) return

    try {
      setSubmitting(true)
      setError('')
      setSuccess('')

      const response = await fetch('/api/members', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          displayName: effectiveDisplayName,
          pubgPlayerName: trimmedPubg,
          platformShard,
          clanId,
          mode: 'create',
        }),
      })

      const payload = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Impossible d’ajouter le joueur.')
      }

      setSuccess(`Le joueur « ${effectiveDisplayName} » (${trimmedPubg}) a été ajouté avec succès au clan !`)
      setDisplayName('')
      setPubgPlayerName('')
      setPlatformShard('steam')
      setShowConfirmModal(false)
      setPreviewData(null)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Erreur inconnue')
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading) {
    return (
      <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
        <ListSkeleton rows={2} />
      </div>
    )
  }

  if (!canManageMembers) {
    return (
      <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
        <Callout tone="warn" icon={AlertCircle} title="Accès réservé">
          Cette page est réservée à l’Owner du clan et au SuperUser.{' '}
          <Link href={`/clans/${clanId}/members`} className="app-link font-semibold">
            Retour aux membres du clan
          </Link>
        </Callout>
      </div>
    )
  }

  return (
    // `.charte` : page écrite selon la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-container app-main game-ui charte flex flex-1 flex-col gap-4">
      <MembersSectionHeader
        clanId={clanId}
        active="ajout"
        title="Ajouter un joueur"
        subtitle="Recherchez un joueur sur PUBG et intégrez-le au clan pour suivre ses parties et sa progression."
        icon={UserPlus}
      />

      {error ? (
        <Callout tone="warn" icon={AlertCircle} title="Une erreur est survenue">
          {error}
        </Callout>
      ) : null}
      {success ? (
        <p className="t-body t-pos m-0 flex items-start gap-2" role="status">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {success}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="app-panel flex flex-col gap-4 p-4 sm:p-5 lg:col-span-2" aria-labelledby="add-member-form-title">
          <div className="flex flex-col gap-0.5">
            <h2 id="add-member-form-title" className="t-section-title m-0">
              Rechercher le joueur
            </h2>
            <p className="t-meta m-0">Le pseudo est vérifié sur l’API PUBG avant tout enregistrement.</p>
          </div>

          <form onSubmit={handleAddMember} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span className="flex items-center justify-between gap-2">
                <span className="t-label">Pseudo PUBG</span>
                <span className="t-meta">Requis</span>
              </span>
              <input
                id="pubgPlayerName"
                type="text"
                value={pubgPlayerName}
                onChange={(event) => setPubgPlayerName(event.target.value)}
                placeholder="ex. ProGamer_99"
                className="app-input font-mono"
                required
                autoFocus
              />
              <span className="t-meta">Le pseudo exact en jeu (sensible à la casse, sans le tag de clan).</span>
            </label>

            <div className="flex flex-col gap-1">
              <MobileDropdownNav
                id="add-member-platform"
                label="Plateforme"
                currentLabel={selectedPlatformLabel}
                items={platformItems}
                variant="compact"
                visibilityClass="block"
                className="w-full"
                leftIcon={<Gamepad2 className="h-4 w-4 text-gray-500" aria-hidden="true" />}
              />
            </div>

            <label className="flex flex-col gap-1">
              <span className="flex items-center justify-between gap-2">
                <span className="t-label">Nom affiché sur le site</span>
                <span className="t-meta">Facultatif</span>
              </span>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={pubgPlayerName.trim() ? `Par défaut : ${pubgPlayerName.trim()}` : 'Vide : le pseudo PUBG est utilisé'}
                className="app-input"
              />
              <span className="t-meta">Alias affiché dans les classements. Vide : le pseudo PUBG est utilisé.</span>
            </label>

            <button
              type="submit"
              disabled={checkingPlayer || submitting}
              className="app-btn app-btn--md app-btn--primary w-full gap-2"
            >
              {checkingPlayer ? <ButtonSpinner /> : <Search className="h-4 w-4" aria-hidden="true" />}
              {checkingPlayer ? 'Recherche sur PUBG…' : 'Vérifier sur PUBG'}
            </button>
          </form>
        </section>

        <aside className="app-panel-muted flex flex-col gap-3 p-4" aria-labelledby="add-member-help-title">
          <p id="add-member-help-title" className="t-card-title m-0 flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
            Comment se passe l’ajout ?
          </p>
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {ADD_STEPS.map((step, index) => (
              <li key={step.title} className="flex items-start gap-2.5">
                <span
                  className="t-num grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                  style={toneStyle('pos')}
                >
                  {index + 1}
                </span>
                <span className="flex flex-col">
                  <span className="t-body font-semibold text-gray-900">{step.title}</span>
                  <span className="t-meta">{step.text}</span>
                </span>
              </li>
            ))}
          </ol>
        </aside>
      </div>

      {showConfirmModal && previewData ? (
        <ConfirmDialog
          icon={ShieldCheck}
          title="Joueur trouvé sur PUBG"
          confirmLabel="Ajouter au clan"
          tone="primary"
          busy={submitting}
          onCancel={cancelConfirm}
          onConfirm={() => void confirmAddMember()}
        >
          <dl className="app-panel-muted m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-3.5 py-3 text-[13px]">
            <dt className="text-gray-500">Pseudo PUBG</dt>
            <dd className="m-0 font-mono font-bold text-gray-900">{previewData.player.pubgPlayerName}</dd>
            <dt className="text-gray-500">Nom affiché</dt>
            <dd className="m-0 font-semibold text-gray-900">
              {previewData.player.displayName}
              {previewData.player.displayName === previewData.player.pubgPlayerName ? (
                <span className="t-meta"> (identique au pseudo)</span>
              ) : null}
            </dd>
            <dt className="text-gray-500">Plateforme</dt>
            <dd className="m-0 font-semibold uppercase text-gray-900">{previewData.player.platformShard}</dd>
            <dt className="text-gray-500">Clan PUBG</dt>
            <dd className="m-0 text-gray-900">
              {previewData.clan ? (
                <>
                  {previewData.clan.name} <span className="font-mono font-bold">[{previewData.clan.tag}]</span>
                </>
              ) : (
                <span className="t-meta">Aucun clan PUBG officiel</span>
              )}
            </dd>
          </dl>
          <p className="t-meta m-0 mt-2">Le joueur est rattaché au clan et le suivi de ses parties commence.</p>
        </ConfirmDialog>
      ) : null}
    </div>
  )
}

const ADD_STEPS = [
  { title: 'Recherche sur PUBG', text: 'Le pseudo est vérifié sur l’API PUBG, qui renvoie l’identifiant unique du joueur.' },
  { title: 'Clan PUBG détecté', text: 'S’il appartient à un clan PUBG officiel, son clan et son tag sont repérés.' },
  { title: 'Confirmation', text: 'Une fenêtre affiche les données trouvées avant d’enregistrer le joueur dans le clan.' },
  { title: 'Rôle et invitation', text: 'Ensuite, vous pouvez lui attribuer un rôle et l’inviter à se connecter au site.' },
]
