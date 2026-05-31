'use client'

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import { useAuthSession } from '@/hooks/useAuthSession'

type ProfileMember = {
  memberId: number
  displayName: string
  pubgPlayerName: string
  platformShard: string
  isActive: boolean
}

type ProfilePayload = {
  id: number
  email: string
  displayName: string | null
  avatarUrl: string | null
  members: ProfileMember[]
}

type AvatarSuggestion = {
  id: string
  label: string
  url: string
  fallbackUrl: string
}

const AVATAR_STYLES = [
  'bottts',
  'avataaars',
  'pixel-art',
  'identicon',
  'icons',
  'adventurer',
  'adventurer-neutral',
  'big-ears',
  'big-smile',
  'lorelei',
  'micah',
  'notionists',
] as const

const LOCAL_FALLBACK_COUNT = 8

function generateSeriesSeed() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export default function AccountPage() {
  const router = useRouter()
  const { activeMemberId } = useAuthSession()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [members, setMembers] = useState<ProfileMember[]>([])
  const [avatarSeriesSeed, setAvatarSeriesSeed] = useState(generateSeriesSeed)
  const [failedAvatarIds, setFailedAvatarIds] = useState<Record<string, boolean>>({})

  const activeMembers = useMemo(() => members.filter((member) => member.isActive), [members])
  const dashboardHref = activeMemberId ? `/members/${activeMemberId}/dashboard` : '/members'
  const avatarSuggestions = useMemo<AvatarSuggestion[]>(() => {
    const source = displayName.trim() || email.trim() || 'player'

    return AVATAR_STYLES.map((style, index) => {
      const seed = encodeURIComponent(`${source}-${style}-${avatarSeriesSeed}`)
      const fallbackIndex = (index % LOCAL_FALLBACK_COUNT) + 1
      return {
        id: style,
        label: style,
        url: `https://api.dicebear.com/9.x/${style}/svg?seed=${seed}`,
        fallbackUrl: `/avatars/fallback-${fallbackIndex}.svg`,
      }
    })
  }, [displayName, email, avatarSeriesSeed])

  useEffect(() => {
    let cancelled = false

    async function loadProfile() {
      try {
        setLoading(true)
        setError('')

        const response = await fetch('/api/auth/profile', {
          cache: 'no-store',
        })

        const payload = (await response.json()) as
          | { profile: ProfilePayload }
          | { error?: string }

        if (!response.ok) {
          if (response.status === 401) {
            router.replace('/login?redirect=%2Faccount')
            return
          }

          throw new Error('error' in payload ? payload.error : 'Failed to load profile')
        }

        if (cancelled) {
          return
        }

        const profile = (payload as { profile: ProfilePayload }).profile
        setEmail(profile.email)
        setDisplayName(profile.displayName ?? '')
        setAvatarUrl(profile.avatarUrl ?? '')
        setMembers(profile.members)
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load profile')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadProfile()

    return () => {
      cancelled = true
    }
  }, [router])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      setSaving(true)
      setError('')
      setSuccess('')

      const response = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email,
          displayName,
          avatarUrl,
        }),
      })

      const payload = (await response.json()) as
        | { success: true; profile: Pick<ProfilePayload, 'email' | 'displayName' | 'avatarUrl'> }
        | { error?: string }

      if (!response.ok) {
        throw new Error('error' in payload ? payload.error : 'Failed to update profile')
      }

      const profile = (payload as { profile: Pick<ProfilePayload, 'email' | 'displayName' | 'avatarUrl'> }).profile
      setEmail(profile.email)
      setDisplayName(profile.displayName ?? '')
      setAvatarUrl(profile.avatarUrl ?? '')
      setSuccess('Profil mis à jour')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  function validatePasswordChange() {
    if (newPassword.length < 8) {
      setPasswordError('Le nouveau mot de passe doit contenir au moins 8 caractères')
      setPasswordSuccess('')
      return false
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Les nouveaux mots de passe ne correspondent pas')
      setPasswordSuccess('')
      return false
    }

    return true
  }

  async function submitPasswordChange() {
    try {
      setPasswordSaving(true)
      setPasswordError('')
      setPasswordSuccess('')
      setShowPasswordConfirm(false)

      const response = await fetch('/api/auth/password', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      })

      const payload = (await response.json()) as { success?: boolean; message?: string; error?: string }

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to update password')
      }

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSuccess(payload.message ?? 'Mot de passe mis à jour')
    } catch (submitError) {
      setPasswordError(submitError instanceof Error ? submitError.message : 'Failed to update password')
    } finally {
      setPasswordSaving(false)
    }
  }

  function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!validatePasswordChange()) {
      return
    }

    setPasswordError('')
    setPasswordSuccess('')
    setShowPasswordConfirm(true)
  }

  function cancelPasswordConfirm() {
    if (passwordSaving) {
      return
    }

    setShowPasswordConfirm(false)
  }

  return (
    <>
      <main className="app-container app-main flex-1">
        <header className="app-panel mb-6 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Mon compte</h1>
              <p className="text-sm text-gray-600">Modifie ton email, ton pseudo d&apos;affichage et ton avatar.</p>
            </div>
            <Link
              href={dashboardHref}
              className="app-btn app-btn--md app-btn--secondary"
            >
              Dashboard
            </Link>
          </div>
        </header>

        {loading ? <p className="text-sm text-gray-600">Chargement...</p> : null}
        {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
        {success ? <p className="mb-4 text-sm text-green-600">{success}</p> : null}

        {!loading ? (
          <>
            <form onSubmit={(event) => void handleSubmit(event)} className="app-panel space-y-4 p-5">
              <label className="block text-sm text-gray-700">
                Email
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  autoComplete="email"
                />
              </label>

              <label className="block text-sm text-gray-700">
                Pseudo d&apos;affichage
                <input
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  autoComplete="nickname"
                  maxLength={60}
                />
              </label>

              <label className="block text-sm text-gray-700">
                Avatar URL
                <input
                  type="url"
                  value={avatarUrl}
                  onChange={(event) => setAvatarUrl(event.target.value)}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  placeholder="https://..."
                  autoComplete="url"
                />
              </label>

              {avatarUrl.trim() ? (
                <div className="app-panel-muted p-3">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-600">Aperçu avatar</p>
                  <img
                    src={avatarUrl}
                    alt="Avatar"
                    className="h-14 w-14 rounded-full border border-gray-300 object-cover"
                  />
                </div>
              ) : null}

              <div className="app-panel-muted p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-600">Avatars proposés</p>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarSeriesSeed(generateSeriesSeed())
                        setFailedAvatarIds({})
                      }}
                      className="app-btn app-btn--xs app-btn--secondary"
                    >
                      Régénérer série
                    </button>
                    <button
                      type="button"
                      onClick={() => setAvatarUrl('')}
                      className="app-btn app-btn--xs app-btn--secondary"
                    >
                      Retirer avatar
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                  {avatarSuggestions.map((suggestion) => {
                    const resolvedUrl = failedAvatarIds[suggestion.id] ? suggestion.fallbackUrl : suggestion.url
                    const selected = avatarUrl.trim() === resolvedUrl

                    return (
                      <button
                        key={suggestion.id}
                        type="button"
                        onClick={() => setAvatarUrl(resolvedUrl)}
                        className={`flex w-full items-center justify-center rounded-lg border p-1 transition ${
                          selected
                            ? 'border-gray-900 bg-gray-100'
                            : 'border-gray-300 bg-white hover:border-gray-500'
                        }`}
                        title={`Choisir ${suggestion.label}`}
                      >
                        <img
                          src={resolvedUrl}
                          alt={`Avatar ${suggestion.label}`}
                          className="block h-10 w-10 rounded object-cover"
                          onError={() => {
                            setFailedAvatarIds((current) => {
                              if (current[suggestion.id]) {
                                return current
                              }
                              return {
                                ...current,
                                [suggestion.id]: true,
                              }
                            })
                          }}
                        />
                      </button>
                    )
                  })}
                </div>

                {Object.keys(failedAvatarIds).length > 0 ? (
                  <p className="mt-2 text-xs text-gray-600">
                    Certains avatars externes sont indisponibles, fallback local appliqué automatiquement.
                  </p>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={saving}
                className="app-btn app-btn--md app-btn--primary"
              >
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </form>

            <section className="app-panel mt-6 p-5">
              <h2 className="text-lg font-semibold text-gray-900">Membres liés (lecture seule)</h2>
              <p className="mt-1 text-sm text-gray-600">
                Le nom joueur PUBG n&apos;est pas modifiable ici.
              </p>

              <ul className="mt-4 space-y-2">
                {activeMembers.map((member) => (
                  <li key={member.memberId} className="rounded border border-gray-200 px-3 py-2">
                    <p className="text-sm font-medium text-gray-900">{member.displayName}</p>
                    <p className="text-xs text-gray-600">
                      PUBG: {member.pubgPlayerName} ({member.platformShard})
                    </p>
                  </li>
                ))}
                {activeMembers.length === 0 ? (
                  <li className="text-sm text-gray-600">Aucun membre actif lié.</li>
                ) : null}
              </ul>
            </section>

            <section className="app-panel mt-6 p-5">
              <h2 className="text-lg font-semibold text-gray-900">Changer le mot de passe</h2>
              <p className="mt-1 text-sm text-gray-600">
                Renseigne ton mot de passe actuel puis choisis un nouveau mot de passe (8 caractères minimum).
              </p>

              <form onSubmit={(event) => void handlePasswordSubmit(event)} className="mt-4 space-y-4">
                <label className="block text-sm text-gray-700">
                  Mot de passe actuel
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    autoComplete="current-password"
                  />
                </label>

                <label className="block text-sm text-gray-700">
                  Nouveau mot de passe
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    autoComplete="new-password"
                  />
                </label>

                <label className="block text-sm text-gray-700">
                  Confirmer le nouveau mot de passe
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    autoComplete="new-password"
                  />
                </label>

                {passwordError ? <p className="text-sm text-red-600">{passwordError}</p> : null}
                {passwordSuccess ? <p className="text-sm text-green-600">{passwordSuccess}</p> : null}

                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="app-btn app-btn--md app-btn--primary"
                >
                  {passwordSaving ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
                </button>
              </form>
            </section>
          </>
        ) : null}
      </main>

      {showPasswordConfirm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4 py-6">
          <div className="app-panel w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-gray-900">Confirmer la mise à jour</h3>
            <p className="mt-2 text-sm text-gray-600">
              Veux-tu vraiment changer ton mot de passe maintenant ?
            </p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={cancelPasswordConfirm}
                disabled={passwordSaving}
                className="app-btn app-btn--md app-btn--secondary"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void submitPasswordChange()}
                disabled={passwordSaving}
                className="app-btn app-btn--md app-btn--primary"
              >
                {passwordSaving ? 'Mise à jour...' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
