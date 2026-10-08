'use client'

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Crown, Gamepad2, LogIn, Search, ShieldCheck, Sparkles, Trophy, UserPlus, Users } from 'lucide-react'

import pubgLogo from '@/assets/pubg-logo-official.webp'
import { AuthAlert, AuthCard, AuthGuide, AuthHighlights, AuthPage, AuthVisual, FieldLabel, type AuthHighlight } from '@/components/auth/AuthLayout'
import { ButtonSpinner, Callout, ChoiceMenu, ClanLabel, ConfirmDialog, Tag, type ChoiceOption } from '@/components/ui/CharteKit'
import { useAuthSession } from '@/hooks/useAuthSession'

/**
 * Rejoindre un clan ou en créer un — page plein écran, sans le shell. Selon la charte UI (docs/ui/index.html) et la mise
 * en page des pages d'accès (`AuthLayout`) : vérification du pseudo sur l'API PUBG (aperçu sans écriture), puis
 * confirmation dans la modale de la charte avant l'enregistrement de la demande.
 */

type JoinStatus = 'idle' | 'loading' | 'success' | 'error'

interface JoinResponse {
  status: 'pending' | 'created'
  clanId: number
  clanName: string
  memberId: number
  message: string
}

interface JoinPreviewData {
  mode: 'preview'
  authenticated?: boolean
  player: {
    pubgPlayerName: string
    platformShard: string
    pubgAccountId: string
  }
  clan: {
    pubgClanId: string
    name: string
    tag: string
    existsOnSite: boolean
    isActive?: boolean
    /** Clan dont la demande avait été refusée : la nouvelle demande le soumet de nouveau au SuperUser. */
    reopensRejectedRequest?: boolean
  } | null
  actionType: 'join_existing' | 'create_clan'
  targetClanName: string
  targetClanTag: string
}

type PlatformShard = 'steam' | 'xbox' | 'psn' | 'kakao'

const PLATFORM_OPTIONS: ChoiceOption<PlatformShard>[] = [
  { value: 'steam', label: 'Steam (PC)', icon: Gamepad2 },
  { value: 'xbox', label: 'Xbox', icon: Gamepad2 },
  { value: 'psn', label: 'PlayStation Network', icon: Gamepad2 },
  { value: 'kakao', label: 'Kakao (Corée)', icon: Gamepad2 },
]

function platformLabel(shard: string) {
  return PLATFORM_OPTIONS.find((option) => option.value === shard)?.label ?? shard
}

const HIGHLIGHTS: AuthHighlight[] = [
  { icon: Sparkles, tone: 'pos', title: 'Détection automatique', text: 'le clan officiel PUBG est reconnu instantanément, sans configuration.' },
  { icon: Users, tone: 'sky', title: 'Statistiques et télémétrie', text: 'frags, dégâts, positions de largage et synergie d’équipe.' },
  { icon: Trophy, tone: 'warn', title: 'Défis et compétition', text: 'défis communautaires, tournois et classements.' },
]

const GUIDE = [
  { tone: 'pos' as const, title: 'Rejoindre un clan existant', body: 'la demande d’adhésion est validée par l’administrateur du clan.' },
  {
    tone: 'warn' as const,
    title: 'Créer un nouveau clan',
    body: 'pour écarter les bots et préserver l’intégrité de la ligue, toute création est validée par le SuperUser.',
  },
]

export default function JoinPage() {
  const router = useRouter()
  // Purge un jeton de session expiré (401) ; la connexion elle-même est lue par l'aperçu de `/api/join`.
  useAuthSession()
  const [playerName, setPlayerName] = useState('')
  const [platformShard, setPlatformShard] = useState<PlatformShard>('steam')
  const [joinStatus, setJoinStatus] = useState<JoinStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [successData, setSuccessData] = useState<JoinResponse | null>(null)

  // Modale de confirmation
  const [previewData, setPreviewData] = useState<JoinPreviewData | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  // Adresse de contact, exigée uniquement pour une création de clan.
  const [contactEmail, setContactEmail] = useState('')

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    const trimmedPlayerName = playerName.trim()
    if (!trimmedPlayerName) {
      setError('Le pseudo PUBG est requis')
      setErrorCode(null)
      return
    }

    try {
      setJoinStatus('loading')
      setError(null)
      setErrorCode(null)
      setConfirmError(null)
      setSuccessData(null)

      // Étape 1 : appel en mode « preview » pour vérification PUBG sans écriture en base
      const response = await fetch('/api/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pubgPlayerName: trimmedPlayerName,
          platformShard,
          mode: 'preview',
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | (JoinPreviewData & { error?: string; code?: string })
        | { error?: string; code?: string }
        | null

      if (!response.ok) {
        const errorMessage =
          payload && 'error' in payload && typeof payload.error === 'string'
            ? payload.error
            : 'Impossible de vérifier votre compte PUBG. Vérifiez votre pseudo et votre plateforme.'
        setError(errorMessage)
        setErrorCode(payload && 'code' in payload && typeof payload.code === 'string' ? payload.code : null)
        setJoinStatus('error')
        return
      }

      if (payload && 'mode' in payload && payload.mode === 'preview') {
        setPreviewData(payload)
        setJoinStatus('idle')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Une erreur inattendue est survenue'
      setError(message)
      setErrorCode(null)
      setJoinStatus('error')
    }
  }

  async function handleConfirmJoin() {
    if (!previewData) return

    if (previewData.actionType === 'create_clan' && !contactEmail.trim()) {
      setConfirmError('Saisissez une adresse e-mail de contact.')
      return
    }

    try {
      setIsConfirming(true)
      setConfirmError(null)

      // Étape 2 : exécution définitive de l'adhésion ou de la création
      const response = await fetch('/api/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pubgPlayerName: previewData.player.pubgPlayerName,
          platformShard: previewData.player.platformShard,
          mode: 'join',
          contactEmail: contactEmail.trim() || undefined,
        }),
      })

      const payload = (await response.json().catch(() => null)) as JoinResponse | { error?: string } | null

      if (!response.ok) {
        const errorMessage =
          payload && 'error' in payload && typeof payload.error === 'string' ? payload.error : 'Impossible de finaliser l’opération.'
        setConfirmError(errorMessage)
        setIsConfirming(false)
        return
      }

      if (payload && 'status' in payload) {
        setPreviewData(null)
        setSuccessData(payload)
        setJoinStatus('success')
        setIsConfirming(false)

        const target = payload.status === 'created' ? `/clans/${payload.clanId}` : '/clans'
        setTimeout(() => {
          router.push(target)
        }, 2500)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Une erreur inattendue est survenue'
      setConfirmError(message)
      setIsConfirming(false)
    }
  }

  function handleCancelConfirm() {
    setPreviewData(null)
    setConfirmError(null)
  }

  const loading = joinStatus === 'loading'
  const successTarget = successData?.status === 'created' ? `/clans/${successData.clanId}` : '/clans'

  return (
    <AuthPage>
      <div className="relative z-10 mb-4 flex w-full max-w-5xl flex-wrap items-center justify-between gap-2">
        <Link href="/clans" className="app-btn app-btn--sm app-btn--secondary gap-1.5">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Retour à l’accueil du site
        </Link>
        <Link href="/login" className="app-link inline-flex items-center gap-1 text-xs font-semibold">
          Espace connexion
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <AuthCard
        visual={
          <AuthVisual
            image="/squad.jpg"
            header={<img src={pubgLogo.src} alt="PUBG Battlegrounds" className="h-10 w-auto self-start object-contain" />}
            kicker="Recrutement et clans"
            title="Rejoignez l’escouade"
            text="Intégrez un clan officiel PUBG ou fondez votre propre structure : statistiques, victoires et classements synchronisés en continu."
          >
            <AuthHighlights items={HIGHLIGHTS} />
          </AuthVisual>
        }
      >
        <div className="flex flex-col gap-1">
          <h2 className="t-section-title m-0 flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
            Rejoindre ou créer un clan
          </h2>
          <p className="t-meta m-0">Le pseudo officiel PUBG identifie le profil et rattache le joueur à son clan.</p>
        </div>

        <AuthGuide icon={ShieldCheck} title="Validation obligatoire avant activation" items={GUIDE} />

        {successData ? (
          <div className="flex flex-col gap-3">
            <AuthAlert tone="pos" title="Demande enregistrée">
              {successData.message}
            </AuthAlert>
            <dl className="app-panel-muted m-0 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 px-3.5 py-3 text-[13px]">
              <dt className="t-meta">Clan</dt>
              <dd className="m-0 truncate text-right font-semibold text-gray-900">{successData.clanName}</dd>
              <dt className="t-meta">Statut</dt>
              <dd className="m-0 text-right">
                <Tag tone="warn">En attente de validation</Tag>
              </dd>
            </dl>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="t-meta">
                {successData.status === 'created' ? 'Redirection vers la page du clan…' : 'Redirection vers la liste des clans…'}
              </span>
              <Link href={successTarget} className="app-btn app-btn--sm app-btn--primary gap-1.5">
                Continuer
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
            {error ? (
              <AuthAlert tone="neg" title={error}>
                {errorCode === 'PLAYER_ALREADY_MEMBER' ? (
                  <Link href="/login" className="app-link inline-flex items-center gap-1 font-semibold">
                    Se connecter à son compte
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                ) : null}
              </AuthAlert>
            ) : null}

            <label className="flex flex-col gap-1">
              <FieldLabel required>Pseudo PUBG officiel</FieldLabel>
              <input
                id="playerName"
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="ex : Balthazar_99"
                disabled={loading}
                className="app-input font-mono"
                maxLength={32}
                required
                autoFocus
              />
              <span className="t-meta">Le nom exact du compte PUBG (sensible à la casse, sans balise de clan).</span>
            </label>

            <div className="flex flex-col gap-1">
              <FieldLabel>Plateforme de jeu</FieldLabel>
              <ChoiceMenu label="Plateforme de jeu" options={PLATFORM_OPTIONS} value={platformShard} onChange={setPlatformShard} />
              <span className="t-meta">L’écosystème où le joueur évolue.</span>
            </div>

            <button type="submit" disabled={loading} className="app-btn app-btn--md app-btn--primary mt-1 w-full gap-2">
              {loading ? <ButtonSpinner /> : <Search className="h-4 w-4" aria-hidden="true" />}
              {loading ? 'Vérification sur les serveurs PUBG…' : 'Vérifier et continuer'}
            </button>
          </form>
        )}

        <div className="flex flex-col gap-3 border-t border-gray-200 pt-5">
          <Link href="/clans" className="app-btn app-btn--md app-btn--secondary w-full gap-2">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Retour à la page principale
          </Link>
          <p className="t-meta m-0 text-center">
            Compte déjà actif ?{' '}
            <Link href="/login" className="app-link font-semibold">
              Se connecter
            </Link>
          </p>
        </div>
      </AuthCard>

      {/* Confirmation avant de rejoindre ou de créer un clan */}
      {previewData ? (
        <JoinConfirmDialog
          preview={previewData}
          contactEmail={contactEmail}
          onContactEmailChange={setContactEmail}
          error={confirmError}
          busy={isConfirming}
          onCancel={handleCancelConfirm}
          onConfirm={() => (previewData.authenticated ? void handleConfirmJoin() : router.push('/login?redirect=/join'))}
        />
      ) : null}
    </AuthPage>
  )
}

function JoinConfirmDialog({
  preview,
  contactEmail,
  onContactEmailChange,
  error,
  busy,
  onCancel,
  onConfirm,
}: {
  preview: JoinPreviewData
  contactEmail: string
  onContactEmailChange: (value: string) => void
  error: string | null
  busy: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const creating = preview.actionType === 'create_clan'
  const authenticated = Boolean(preview.authenticated)
  const target = (
    <b className="text-gray-900">
      [{preview.targetClanTag}] {preview.targetClanName}
    </b>
  )

  return (
    <ConfirmDialog
      icon={creating ? Crown : ShieldCheck}
      title={creating ? 'Créer et diriger le clan' : 'Rejoindre le clan'}
      confirmLabel={!authenticated ? 'Se connecter pour continuer' : creating ? 'Soumettre au SuperUser' : 'Envoyer la demande à l’admin'}
      tone="primary"
      busy={busy}
      onCancel={onCancel}
      onConfirm={onConfirm}
      testId="join-confirm"
    >
      <div className="flex flex-col gap-3">
        <p className="m-0">
          {preview.clan?.reopensRejectedRequest ? (
            <>Le clan {target} avait été refusé : la demande le soumet de nouveau à la validation du SuperUser.</>
          ) : creating ? (
            <>
              Le clan {target} n’existe pas encore sur le site. Sa création est validée par le SuperUser ; une fois approuvé, le clan est
              activé et vous en êtes le propriétaire (Owner).
            </>
          ) : (
            <>
              Le clan {target} existe déjà : la demande d’adhésion est transmise à son administrateur, et vous devenez membre actif dès son
              approbation.
            </>
          )}
        </p>

        <dl className="app-panel-muted m-0 grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-2 px-3.5 py-3 text-[13px]">
          <dt className="t-meta">Compte PUBG</dt>
          <dd className="m-0 truncate text-right font-mono font-bold text-gray-900">{preview.player.pubgPlayerName}</dd>
          <dt className="t-meta">Plateforme</dt>
          <dd className="m-0 text-right">
            <Tag tone="neutral">{platformLabel(preview.player.platformShard)}</Tag>
          </dd>
          <dt className="t-meta">Clan PUBG</dt>
          <dd className="m-0 flex min-w-0 justify-end">
            {preview.clan ? <ClanLabel tag={preview.clan.tag} name={preview.clan.name} /> : <span className="t-meta">Aucun clan officiel détecté</span>}
          </dd>
          <dt className="t-meta">Validation</dt>
          <dd className="m-0 text-right">
            <Tag tone={creating ? 'warn' : 'pos'}>{creating ? 'SuperUser' : 'Admin du clan'}</Tag>
          </dd>
        </dl>

        {creating && authenticated ? (
          <label className="flex flex-col gap-1">
            <FieldLabel required>Adresse e-mail de contact</FieldLabel>
            <input
              type="email"
              required
              value={contactEmail}
              onChange={(event) => onContactEmailChange(event.target.value)}
              disabled={busy}
              placeholder="vous@exemple.com"
              className="app-input"
              autoComplete="email"
            />
            <span className="t-meta">Pour vous notifier de la décision et préparer votre accès au site.</span>
          </label>
        ) : null}

        {!authenticated ? (
          <Callout tone="warn" icon={LogIn} title="Connexion requise pour finaliser">
            {creating
              ? 'Se connecter à son compte pour soumettre ce clan à la validation du SuperUser.'
              : `Se connecter à son compte pour transmettre la demande aux administrateurs du clan « ${preview.targetClanName} ».`}
          </Callout>
        ) : null}

        {error ? <AuthAlert tone="neg" title={error} /> : null}
      </div>
    </ConfirmDialog>
  )
}
