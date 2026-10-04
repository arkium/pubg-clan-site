'use client'

import { KeyRound, Save, UserRound, Users } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import {
  AccountBanner,
  AccountCard,
  AvatarPicker,
  FormStatus,
  LinkedMembersList,
  PasswordConfirmDialog,
  TextField,
  type AvatarSuggestion,
} from '@/components/account/AccountSections'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
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

/**
 * Mon compte — email, pseudo d'affichage, avatar, membres liés et mot de passe, selon la charte UI
 * (docs/ui/index.html). Blocs de présentation : src/components/account/AccountSections.tsx.
 */
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

          throw new Error('error' in payload ? payload.error : 'Chargement du profil impossible')
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
          setError(loadError instanceof Error ? loadError.message : 'Chargement du profil impossible')
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
        throw new Error('error' in payload ? payload.error : 'Mise à jour du profil impossible')
      }

      const profile = (payload as { profile: Pick<ProfilePayload, 'email' | 'displayName' | 'avatarUrl'> }).profile
      setEmail(profile.email)
      setDisplayName(profile.displayName ?? '')
      setAvatarUrl(profile.avatarUrl ?? '')
      setSuccess('Profil mis à jour')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Mise à jour du profil impossible')
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
        throw new Error(payload.error ?? 'Mise à jour du mot de passe impossible')
      }

      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordSuccess(payload.message ?? 'Mot de passe mis à jour')
    } catch (submitError) {
      setPasswordError(submitError instanceof Error ? submitError.message : 'Mise à jour du mot de passe impossible')
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

  function markAvatarFailed(id: string) {
    setFailedAvatarIds((current) => {
      if (current[id]) {
        return current
      }
      return {
        ...current,
        [id]: true,
      }
    })
  }

  return (
    // `.charte` : page migrée vers la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    // Pas de bandeau de filtres : colonne `app-container app-main` ; le shell fournit déjà le <main>.
    <div className="app-container app-main charte flex flex-1 flex-col gap-[18px]">
      <AccountBanner dashboardHref={dashboardHref} />

      {loading ? (
        <div aria-busy="true" aria-label="Chargement du compte">
          <CardSkeleton />
        </div>
      ) : null}

      {!loading ? (
        <>
          <AccountCard
            id="account-profile-title"
            icon={UserRound}
            title="Profil"
            meta="Email de connexion, pseudo affiché sur le site et avatar."
            testId="account-profile"
          >
            <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField label="Email" type="email" required value={email} onChange={setEmail} autoComplete="email" />
                <TextField
                  label="Pseudo d’affichage"
                  value={displayName}
                  onChange={setDisplayName}
                  autoComplete="nickname"
                  maxLength={60}
                />
              </div>

              <AvatarPicker
                avatarUrl={avatarUrl}
                onAvatarUrlChange={setAvatarUrl}
                suggestions={avatarSuggestions}
                failedIds={failedAvatarIds}
                onSuggestionError={markAvatarFailed}
                onRegenerate={() => {
                  setAvatarSeriesSeed(generateSeriesSeed())
                  setFailedAvatarIds({})
                }}
              />

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-200 pt-4">
                <button type="submit" disabled={saving} className="app-btn app-btn--md app-btn--primary gap-1.5">
                  <Save className="h-4 w-4" aria-hidden="true" />
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                <FormStatus error={error} success={success} />
              </div>
            </form>
          </AccountCard>

          <AccountCard
            id="account-members-title"
            icon={Users}
            title="Membres liés"
            meta="Lecture seule : le nom de joueur PUBG n’est pas modifiable ici."
            testId="account-members"
          >
            <LinkedMembersList members={activeMembers} />
          </AccountCard>

          <AccountCard
            id="account-password-title"
            icon={KeyRound}
            title="Changer le mot de passe"
            meta="Renseigne ton mot de passe actuel puis choisis-en un nouveau (8 caractères minimum)."
            testId="account-password"
          >
            <form onSubmit={(event) => void handlePasswordSubmit(event)} className="flex flex-col gap-4">
              <TextField
                label="Mot de passe actuel"
                type="password"
                required
                value={currentPassword}
                onChange={setCurrentPassword}
                autoComplete="current-password"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Nouveau mot de passe"
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={setNewPassword}
                  autoComplete="new-password"
                />
                <TextField
                  label="Confirmer le nouveau mot de passe"
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                  autoComplete="new-password"
                />
              </div>

              {/* Un seul bouton principal par écran (charte) : celui du profil ; celui-ci est secondaire. */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-gray-200 pt-4">
                <button type="submit" disabled={passwordSaving} className="app-btn app-btn--md app-btn--secondary">
                  {passwordSaving ? 'Mise à jour…' : 'Mettre à jour le mot de passe'}
                </button>
                <FormStatus error={passwordError} success={passwordSuccess} />
              </div>
            </form>
          </AccountCard>
        </>
      ) : null}

      {/* Dans le conteneur `.charte` : le bouton principal de la modale prend l'accent. */}
      {showPasswordConfirm ? (
        <PasswordConfirmDialog
          saving={passwordSaving}
          onCancel={cancelPasswordConfirm}
          onConfirm={() => void submitPasswordChange()}
        />
      ) : null}
    </div>
  )
}
