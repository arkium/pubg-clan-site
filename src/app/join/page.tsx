'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Crown,
  Gamepad2,
  Home,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserPlus,
  Users,
  X,
} from 'lucide-react'

import pubgLogo from '@/assets/pubg-logo-official.webp'
import { useAuthSession } from '@/hooks/useAuthSession'

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
  } | null
  actionType: 'join_existing' | 'create_clan'
  targetClanName: string
  targetClanTag: string
}

const PLATFORM_OPTIONS = [
  { value: 'steam', label: 'Steam (PC)' },
  { value: 'xbox', label: 'Xbox' },
  { value: 'psn', label: 'PlayStation Network' },
  { value: 'kakao', label: 'Kakao (Corée)' },
]

export default function JoinPage() {
  const router = useRouter()
  const { authenticated, loading: authLoading } = useAuthSession()
  const [playerName, setPlayerName] = useState('')
  const [platformShard, setPlatformShard] = useState('steam')
  const [joinStatus, setJoinStatus] = useState<JoinStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [successData, setSuccessData] = useState<JoinResponse | null>(null)

  // Confirmation modal state
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [previewData, setPreviewData] = useState<JoinPreviewData | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)

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

      // Étape 1 : Appel en mode "preview" pour vérification PUBG sans écriture DB
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
        setShowConfirmModal(true)
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

    try {
      setIsConfirming(true)
      setConfirmError(null)

      // Étape 2 : Exécution définitive de l'adhésion ou création
      const response = await fetch('/api/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pubgPlayerName: previewData.player.pubgPlayerName,
          platformShard: previewData.player.platformShard,
          mode: 'join',
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | JoinResponse
        | { error?: string }
        | null

      if (!response.ok) {
        const errorMessage =
          payload && 'error' in payload && typeof payload.error === 'string'
            ? payload.error
            : 'Impossible de finaliser l’opération.'
        setConfirmError(errorMessage)
        setIsConfirming(false)
        return
      }

      if (payload && 'status' in payload) {
        setShowConfirmModal(false)
        setSuccessData(payload)
        setJoinStatus('success')
        setIsConfirming(false)

        if (payload.status === 'created') {
          setTimeout(() => {
            router.push(`/clans/${payload.clanId}`)
          }, 2500)
        } else {
          setTimeout(() => {
            router.push('/clans')
          }, 2500)
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Une erreur inattendue est survenue'
      setConfirmError(message)
      setIsConfirming(false)
    }
  }

  function handleCancelConfirm() {
    setShowConfirmModal(false)
    setConfirmError(null)
  }

  return (
    <main className="relative flex min-h-screen flex-1 flex-col items-center justify-center overflow-hidden px-4 py-8 sm:px-6">
      {/* Arrière-plan subtilement illuminé */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_44%),radial-gradient(circle_at_bottom_right,_rgba(14,165,233,0.14),_transparent_40%)]" />

      {/* Barre supérieure d'accès rapide avec retour à l'accueil */}
      <div className="relative z-10 mb-4 flex w-full max-w-5xl items-center justify-between">
        <Link
          href="/clans"
          className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/85 px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm backdrop-blur-md transition hover:border-emerald-500 hover:bg-white hover:text-slate-950 dark:border-slate-800 dark:bg-slate-900/85 dark:text-slate-300 dark:hover:border-emerald-500 dark:hover:bg-slate-800 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4 text-emerald-500" />
          <span>Retour à l&apos;accueil du site</span>
        </Link>

        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 transition hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400"
        >
          <span>Espace connexion</span>
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <section className="relative mx-auto grid w-full max-w-5xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Colonne gauche : Visuel immersif Squad PUBG */}
        <div className="relative flex flex-col justify-between overflow-hidden bg-slate-950 p-7 text-white sm:p-10">
          <img
            src="/squad.jpg"
            alt="Escouade PUBG"
            className="absolute inset-0 h-full w-full object-cover object-[center_35%] scale-105 opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/75 to-slate-950/40" />
          <div className="pointer-events-none absolute -left-10 top-14 h-40 w-40 rounded-full bg-emerald-400/25 blur-2xl" />
          <div className="pointer-events-none absolute -right-14 bottom-8 h-52 w-52 rounded-full bg-sky-500/25 blur-2xl" />

          {/* En-tête gauche avec Logo PUBG */}
          <div className="relative z-10">
            <div className="mb-5 flex items-center">
              <img
                src={pubgLogo.src}
                alt="PUBG Battlegrounds"
                className="h-10 w-auto object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]"
              />
            </div>
            <p className="inline-flex rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">
              Portail Recrutement & Clans
            </p>
            <h1 className="mt-4 text-3xl font-black leading-tight sm:text-4xl text-white">
              Rejoignez l&apos;escouade
            </h1>
            <p className="mt-3 max-w-md text-sm text-slate-200">
              Intégrez un clan officiel PUBG ou fondez votre propre structure. Vos statistiques, vos victoires et vos classements seront synchronisés en temps réel.
            </p>
          </div>

          {/* Points forts / Avantages gaming */}
          <div className="relative z-10 mt-8 space-y-3 border-t border-white/15 pt-6 text-xs text-slate-200">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <strong className="text-white">Détection automatique de clan :</strong> Votre clan officiel PUBG est reconnu instantanément sans configuration.
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30">
                <Users className="h-4 w-4" />
              </span>
              <div>
                <strong className="text-white">Statistiques & Télémétrie :</strong> Suivi précis de vos frags, dégâts, positions de largage et synergie d&apos;équipe.
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Trophy className="h-4 w-4" />
              </span>
              <div>
                <strong className="text-white">Défis & Compétition :</strong> Participez aux défis communautaires et hissez-vous au sommet du classement.
              </div>
            </div>
          </div>
        </div>

        {/* Colonne droite : Formulaire interactif */}
        <div className="flex flex-col justify-between p-7 sm:p-10">
          <div>
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">
                Rejoindre ou créer un clan
              </h2>
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Renseignez votre pseudo officiel PUBG pour identifier votre profil et rattacher votre joueur à son clan.
            </p>

            {/* Processus de validation et contrôle */}
            <div className="mt-5 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-4 text-xs text-slate-600 dark:border-slate-800/80 dark:bg-slate-800/40 dark:text-slate-300">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                <span>Validation obligatoire avant activation</span>
              </div>
              <ul className="mt-2.5 space-y-2 text-slate-600 dark:text-slate-400">
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  <span>
                    <strong className="text-slate-800 dark:text-slate-200">Rejoindre un clan existant :</strong> Votre demande d&apos;adhésion doit être <strong>validée par l&apos;administrateur du clan</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  <span>
                    <strong className="text-slate-800 dark:text-slate-200">Créer un nouveau clan :</strong> Afin d&apos;éviter les bots et préserver l&apos;intégrité de la ligue, toute création de structure doit être <strong>validée par le SuperUser</strong> avant activation.
                  </span>
                </li>
              </ul>
            </div>

            {/* État de succès */}
            {successData ? (
              <div className="mt-6 space-y-4 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 dark:border-emerald-900/40 dark:bg-emerald-950/30">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900 dark:text-emerald-300">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-bold text-emerald-950 dark:text-emerald-100">
                      Demande enregistrée !
                    </p>
                    <p className="text-xs text-emerald-800 dark:text-emerald-300">
                      {successData.message}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 rounded-xl border border-emerald-200/60 bg-white/70 p-3.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-300">
                  <p>
                    <strong className="text-slate-900 dark:text-white">Clan :</strong> {successData.clanName}
                  </p>
                  <p>
                    <strong className="text-slate-900 dark:text-white">Statut :</strong>{' '}
                    En attente de validation
                  </p>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-[11px] font-medium text-slate-500">
                    Redirection vers la liste des clans...
                  </span>
                  <Link
                    href="/clans"
                    className="app-btn app-btn--xs app-btn--primary inline-flex items-center gap-1"
                  >
                    <span>Continuer</span>
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                {error && (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
                    <div className="flex items-start gap-2.5">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
                      <div className="space-y-2">
                        <p className="font-semibold text-rose-950 dark:text-rose-100">{error}</p>
                        {errorCode === 'PLAYER_ALREADY_MEMBER' && (
                          <div className="pt-0.5">
                            <Link
                              href="/login"
                              className="app-btn app-btn--xs app-btn--primary inline-flex items-center gap-1.5 font-semibold"
                            >
                              <span>Se connecter à mon compte</span>
                              <ArrowRight className="h-3 w-3" />
                            </Link>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label
                    htmlFor="playerName"
                    className="block text-sm font-semibold text-slate-900 dark:text-white"
                  >
                    Pseudo PUBG officiel <span className="text-rose-600">*</span>
                  </label>
                  <div className="relative mt-1.5">
                    <input
                      id="playerName"
                      type="text"
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      placeholder="ex: Balthazar_99"
                      disabled={joinStatus === 'loading'}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-mono text-slate-900 placeholder:text-slate-400 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      maxLength={32}
                      required
                      autoFocus
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Le nom exact du compte PUBG (sensible à la casse, sans balise de clan).
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="platformShard"
                    className="block text-sm font-semibold text-slate-900 dark:text-white"
                  >
                    Plateforme de jeu
                  </label>
                  <div className="relative mt-1.5">
                    <select
                      id="platformShard"
                      value={platformShard}
                      onChange={(e) => setPlatformShard(e.target.value)}
                      disabled={joinStatus === 'loading'}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      {PLATFORM_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Sélectionnez l&apos;écosystème où votre joueur évolue.
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={joinStatus === 'loading'}
                    className="app-btn app-btn--md app-btn--primary w-full flex items-center justify-center gap-2 text-sm font-semibold"
                  >
                    {joinStatus === 'loading' ? (
                      <>
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                        <span>Vérification sur les serveurs PUBG...</span>
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4" />
                        <span>Vérifier et continuer</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>

          <div className="mt-6 border-t border-slate-200 pt-5 space-y-3 dark:border-slate-800">
            <Link
              href="/clans"
              className="app-btn app-btn--md app-btn--secondary w-full flex items-center justify-center gap-2 text-sm font-semibold"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Retour à la page principale</span>
            </Link>

            <div className="text-center text-xs">
              <p className="text-slate-600 dark:text-slate-400">
                Vous avez déjà un compte actif ?{' '}
                <Link
                  href="/login"
                  className="font-bold text-slate-900 underline underline-offset-2 hover:text-emerald-600 dark:text-white dark:hover:text-emerald-400"
                >
                  Se connecter
                </Link>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Fenêtre de confirmation avant de rejoindre ou créer un clan */}
      {showConfirmModal && previewData ? (
        <div className="app-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="app-modal-card w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:p-7">
            {/* En-tête de la modale */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                {previewData.actionType === 'create_clan' ? (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    <Crown className="h-6 w-6" />
                  </div>
                ) : (
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    <ShieldCheck className="h-6 w-6" />
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">
                    {previewData.actionType === 'create_clan'
                      ? 'Créer et diriger le clan'
                      : 'Rejoindre le clan'}
                  </h3>
                  <p className="app-modal-subtitle text-xs text-slate-500 dark:text-slate-400">
                    Confirmation requise avant enregistrement définitif
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancelConfirm}
                disabled={isConfirming}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Fermer la fenêtre"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Erreur de confirmation si l'exécution échoue */}
            {confirmError && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <div>{confirmError}</div>
              </div>
            )}

            {/* Fiche récapitulative des données PUBG */}
            <div className="app-modal-inner-card mt-5 space-y-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-xs dark:border-slate-800/80 dark:bg-slate-800/50">
              <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5 dark:border-slate-700/60">
                <span className="text-slate-500 dark:text-slate-400">Compte PUBG détecté :</span>
                <span className="font-mono text-sm font-bold text-slate-900 dark:text-emerald-400">
                  {previewData.player.pubgPlayerName}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5 dark:border-slate-700/60">
                <span className="text-slate-500 dark:text-slate-400">Plateforme :</span>
                <span className="rounded-md bg-slate-200 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-800 dark:bg-slate-700 dark:text-slate-200">
                  {previewData.player.platformShard}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-slate-200/60 pb-2.5 dark:border-slate-700/60">
                <span className="text-slate-500 dark:text-slate-400">Clan PUBG officiel :</span>
                {previewData.clan ? (
                  <span className="font-bold text-sky-600 dark:text-sky-400">
                    {previewData.clan.name}{' '}
                    <span className="font-mono text-xs">[{previewData.clan.tag}]</span>
                  </span>
                ) : (
                  <span className="italic text-slate-400">
                    Aucun clan PUBG officiel détecté
                  </span>
                )}
              </div>

              <div className="flex items-start justify-between pt-0.5">
                <span className="text-slate-500 dark:text-slate-400">Action à exécuter :</span>
                <div className="text-right">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${
                      previewData.actionType === 'create_clan'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    }`}
                  >
                    {previewData.actionType === 'create_clan'
                      ? 'Création de clan (Validation SuperUser)'
                      : 'Adhésion (Validation Admin)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Explication contextuelle claire */}
            <div className="app-modal-callout mt-4 rounded-xl border border-slate-200/80 bg-white/60 p-3.5 text-xs leading-relaxed text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
              {previewData.actionType === 'create_clan' ? (
                <p>
                  <strong className="text-slate-900 dark:text-white">Fonder un clan :</strong> Ce clan n&apos;existe pas encore sur le site. Afin d&apos;éviter les bots et préserver l&apos;intégrité de la ligue, sa création doit être <strong className="text-amber-600 dark:text-amber-400">validée par le SuperUser</strong>. Une fois approuvé par l&apos;administrateur de la plateforme, le clan <strong>[{previewData.targetClanTag}] {previewData.targetClanName}</strong> sera activé et vous en serez le <strong>Propriétaire (Owner)</strong>.
                </p>
              ) : (
                <p>
                  <strong className="text-slate-900 dark:text-white">Rejoindre l&apos;escouade :</strong> Le clan <strong className="text-emerald-600 dark:text-emerald-400">[{previewData.targetClanTag}] {previewData.targetClanName}</strong> existe déjà. Une demande d&apos;adhésion sera transmise pour <strong className="text-emerald-600 dark:text-emerald-400">validation par l&apos;administrateur du clan</strong>. Vous deviendrez membre actif dès son approbation.
                </p>
              )}
            </div>

            {/* Avertissement de connexion dans la modale si non connecté */}
            {!previewData.authenticated && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/90 p-3.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-200">
                <p className="font-semibold text-amber-950 dark:text-amber-100">
                  Connexion requise pour finaliser
                </p>
                <p className="mt-1 leading-relaxed text-amber-800 dark:text-amber-300">
                  {previewData.actionType === 'join_existing'
                    ? `Vous devez vous connecter à votre compte utilisateur pour que votre demande soit transmise aux administrateurs du clan "${previewData.targetClanName}".`
                    : `Vous devez vous connecter à votre compte utilisateur pour soumettre ce clan à la validation du SuperUser.`}
                </p>
              </div>
            )}

            {/* Boutons d'action */}
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={handleCancelConfirm}
                disabled={isConfirming}
                className="app-btn app-btn--md app-btn--secondary"
              >
                Annuler / Modifier
              </button>

              {!previewData.authenticated ? (
                <Link
                  href="/login?redirect=/join"
                  className="app-btn app-btn--md app-btn--primary inline-flex items-center gap-2"
                >
                  <span>Se connecter pour continuer</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleConfirmJoin()}
                  disabled={isConfirming}
                  className={`app-btn app-btn--md flex items-center gap-2 ${
                    previewData.actionType === 'create_clan'
                      ? 'app-btn--primary bg-amber-600 hover:bg-amber-500 dark:bg-amber-600'
                      : 'app-btn--primary'
                  }`}
                >
                  {isConfirming ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      <span>Envoi en cours...</span>
                    </>
                  ) : (
                    <>
                      {previewData.actionType === 'create_clan' ? (
                        <>
                          <Crown className="h-4 w-4" />
                          <span>Soumettre au SuperUser</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          <span>Envoyer la demande à l&apos;admin</span>
                        </>
                      )}
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  )
}
