'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'

import MobileDropdownNav, { type MobileDropdownNavItem } from '@/components/ui/MobileDropdownNav'
import { useAuthSession } from '@/hooks/useAuthSession'

const PLATFORM_OPTIONS = [
  { value: 'steam', label: 'Steam' },
  { value: 'console', label: 'Console' },
  { value: 'kakao', label: 'Kakao' },
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

export default function AddMemberPage() {
  const { loading: authLoading, permissions } = useAuthSession()
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
    () => permissions.includes('*') || permissions.includes('manage_members'),
    [permissions]
  )
  const selectedPlatformLabel = PLATFORM_OPTIONS.find((option) => option.value === platformShard)?.label ?? 'Steam'
  const platformItems: MobileDropdownNavItem[] = PLATFORM_OPTIONS.map((option) => ({
    key: option.value,
    label: option.label,
    active: option.value === platformShard,
    onSelect: () => setPlatformShard(option.value),
  }))

  async function handleAddMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

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
          displayName,
          pubgPlayerName,
          platformShard,
          mode: 'preview',
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | (AddMemberPreviewResponse & { error?: string })
        | null

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to add member')
      }

      if (!payload || payload.mode !== 'preview') {
        throw new Error('Réponse de prévisualisation invalide')
      }

      setPreviewData(payload)
      setShowConfirmModal(true)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unknown error')
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
          displayName,
          pubgPlayerName,
          platformShard,
          mode: 'create',
        }),
      })

      const payload = (await response.json().catch(() => null)) as { error?: string } | null

      if (!response.ok) {
        throw new Error(payload?.error ?? 'Failed to add member')
      }

      setSuccess('Joueur ajouté avec succès.')
      setDisplayName('')
      setPubgPlayerName('')
      setPlatformShard('steam')
      setShowConfirmModal(false)
      setPreviewData(null)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unknown error')
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading) {
    return (
      <main className="app-container app-main flex-1">
        <p className="text-sm text-gray-600">Verification des permissions...</p>
      </main>
    )
  }

  if (!canManageMembers) {
    return (
      <main className="app-container app-main flex-1">
        <div className="app-panel rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h1 className="text-xl font-semibold text-amber-900">Accès réservé</h1>
          <p className="mt-2 text-sm text-amber-800">
            Seuls les admins et owners peuvent ajouter des joueurs.
          </p>
          <Link
            href="/members"
            className="mt-4 app-btn app-btn--md app-btn--secondary"
          >
            Retour à la liste des joueurs
          </Link>
        </div>
      </main>
    )
  }

  return (
    <>
      <main className="app-container app-main flex-1">
        <section className="app-panel mb-6 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-2xl font-bold text-gray-900">Ajouter un joueur</h1>
            <Link
              href="/members"
              className="app-btn app-btn--md app-btn--secondary"
            >
              Voir la liste
            </Link>
          </div>
        </section>

        <section className="app-panel p-6">
          <form onSubmit={handleAddMember} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Nom affiché</label>
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="ex: John"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Pseudo PUBG</label>
              <input
                type="text"
                value={pubgPlayerName}
                onChange={(event) => setPubgPlayerName(event.target.value)}
                placeholder="ex: ProGamer123"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                required
              />
            </div>

            <div>
              <MobileDropdownNav
                id="add-member-platform"
                label="Plateforme"
                currentLabel={selectedPlatformLabel}
                items={platformItems}
                variant="compact"
                visibilityClass="block"
                className="w-full"
                leftIcon={(
                  <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none">
                    <path
                      d="M4.5 15.5h11M4.5 10h11M4.5 4.5h11"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
              />
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

            <button
              type="submit"
              disabled={checkingPlayer || submitting}
              className="app-btn app-btn--md app-btn--primary w-full"
            >
              {checkingPlayer ? 'Vérification en cours...' : 'Ajouter le joueur'}
            </button>
          </form>
        </section>
      </main>

      {showConfirmModal && previewData ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
          <div className="app-panel w-full max-w-md p-6">
            <h2 className="text-lg font-bold text-gray-900">Confirmer l'ajout du joueur</h2>
            <p className="mt-2 text-sm text-gray-600">
              Le joueur a été trouvé sur PUBG. Veux-tu l'ajouter maintenant ?
            </p>

            <div className="app-panel-muted mt-4 p-3">
              <p className="text-sm text-gray-700">
                <span className="font-semibold text-gray-900">Nom affiché:</span> {previewData.player.displayName}
              </p>
              <p className="mt-1 text-sm text-gray-700">
                <span className="font-semibold text-gray-900">Pseudo PUBG:</span> {previewData.player.pubgPlayerName}
              </p>
              <p className="mt-1 text-sm text-gray-700">
                <span className="font-semibold text-gray-900">Plateforme:</span> {previewData.player.platformShard}
              </p>
              {previewData.clan ? (
                <p className="mt-1 text-sm text-gray-700">
                  <span className="font-semibold text-gray-900">Clan détecté:</span> {previewData.clan.name} [{previewData.clan.tag}]
                </p>
              ) : null}
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={cancelConfirm}
                disabled={submitting}
                className="app-btn app-btn--md app-btn--secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void confirmAddMember()}
                disabled={submitting}
                className="app-btn app-btn--md app-btn--primary"
              >
                {submitting ? 'Ajout en cours...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
