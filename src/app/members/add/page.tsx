'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Gamepad2,
  HelpCircle,
  Info,
  Search,
  ShieldCheck,
  UserPlus,
  Users,
} from 'lucide-react'

import MobileDropdownNav, { type MobileDropdownNavItem } from '@/components/ui/MobileDropdownNav'
import { useAuthSession } from '@/hooks/useAuthSession'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import { NavigationTrail } from '@/components/ui/NavigationTrail'

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

export default function AddMemberPage() {
  const { clanId } = useSelectedClan()
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
          clanId: clanId ?? undefined,
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
          clanId: clanId ?? undefined,
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
      <main className="app-container app-main flex-1">
        <NavigationTrail
          currentLabel="Ajouter un joueur"
          currentHref="/members/add"
          fallbackParent={{ href: clanId ? `/clans/${clanId}/members` : '/members', label: 'Membres', altHref: '/clans' }}
        />
        <div className="flex h-48 items-center justify-center">
          <p className="text-sm text-gray-500">Vérification des autorisations...</p>
        </div>
      </main>
    )
  }

  if (!canManageMembers) {
    return (
      <main className="app-container app-main flex-1">
        <NavigationTrail
          currentLabel="Ajouter un joueur"
          currentHref="/members/add"
          fallbackParent={{ href: clanId ? `/clans/${clanId}/members` : '/members', label: 'Membres', altHref: '/clans' }}
        />
        <div className="app-panel mt-4 rounded-xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-center gap-2 text-amber-900">
            <AlertCircle className="h-5 w-5" />
            <h1 className="text-xl font-semibold">Accès réservé</h1>
          </div>
          <p className="mt-2 text-sm text-amber-800">
            Cette page est réservée aux administrateurs et owners autorisés à gérer les membres du clan.
          </p>
          <Link
            href={clanId ? `/clans/${clanId}/members` : '/members'}
            className="mt-5 inline-flex app-btn app-btn--md app-btn--secondary"
          >
            Retour à la liste des joueurs
          </Link>
        </div>
      </main>
    )
  }

  return (
    <>
      <main className="app-container app-main flex-1 space-y-6">
        <NavigationTrail
          currentLabel="Ajouter un joueur"
          currentHref="/members/add"
          fallbackParent={{ href: clanId ? `/clans/${clanId}/members` : '/members', label: 'Membres', altHref: '/clans' }}
        />

        {/* Hero Header Gaming avec Banner */}
        <header
          className="relative min-h-[10rem] overflow-hidden rounded-2xl bg-cover bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/banner-members.jpg')`, backgroundPosition: 'center 25%' }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 px-4 py-3 sm:px-6 sm:py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <UserPlus className="h-5 w-5 text-emerald-400 sm:h-7 sm:w-7" aria-hidden="true" />
                  <h1 className="text-lg font-bold tracking-tight text-white drop-shadow-md sm:text-2xl md:text-3xl">
                    Ajouter un joueur
                  </h1>
                </div>
                <p className="mt-1 max-w-2xl text-xs font-medium text-gray-200 drop-shadow-md sm:text-sm">
                  Recherchez et intégrez un joueur officiel PUBG à votre communauté pour synchroniser son historique, ses performances et sa progression.
                </p>
              </div>
              <Link
                href={clanId ? `/clans/${clanId}/members` : '/members'}
                className="app-btn app-btn--sm app-btn--secondary self-start sm:self-auto inline-flex items-center gap-1.5"
              >
                <Users className="h-4 w-4" />
                <span>Voir les membres</span>
              </Link>
            </div>
          </div>
        </header>

        {/* Alertes d'état */}
        {error ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800" role="alert">
            <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
            <div>
              <p className="font-semibold">Une erreur est survenue</p>
              <p className="mt-0.5">{error}</p>
            </div>
          </div>
        ) : null}

        {success ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800" role="status">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="font-semibold">Succès !</p>
              <p className="mt-0.5">{success}</p>
            </div>
          </div>
        ) : null}

        {/* Grille Formulaire + Explications UI/UX */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Colonne principale : Formulaire (2 cols) */}
          <section className="app-panel p-5 sm:p-6 lg:col-span-2">
            <div className="mb-5 border-b border-gray-100 pb-3 dark:border-slate-800">
              <h2 className="text-base font-bold text-gray-900 sm:text-lg">
                Formulaire d'enregistrement
              </h2>
              <p className="mt-0.5 text-xs text-gray-500 sm:text-sm">
                Renseignez le pseudo en jeu pour lancer la vérification sur l'API PUBG.
              </p>
            </div>

            <form onSubmit={handleAddMember} className="space-y-5">
              {/* 1. Pseudo PUBG (Obligatoire) */}
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="pubgPlayerName" className="block text-sm font-semibold text-gray-900">
                    Pseudo PUBG officiel <span className="text-rose-600">*</span>
                  </label>
                  <span className="text-[11px] font-medium text-rose-600">Requis</span>
                </div>
                <div className="relative mt-1.5">
                  <input
                    id="pubgPlayerName"
                    type="text"
                    value={pubgPlayerName}
                    onChange={(event) => setPubgPlayerName(event.target.value)}
                    placeholder="ex: ProGamer_99"
                    className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm font-mono transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    required
                    autoFocus
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Le pseudo exact du joueur dans PUBG (sensible à la casse, sans balise de clan [TAG]).
                </p>
              </div>

              {/* 2. Plateforme */}
              <div>
                <label className="block text-sm font-semibold text-gray-900">
                  Plateforme de jeu
                </label>
                <div className="mt-1.5">
                  <MobileDropdownNav
                    id="add-member-platform"
                    label="Plateforme"
                    currentLabel={selectedPlatformLabel}
                    items={platformItems}
                    variant="compact"
                    visibilityClass="block"
                    className="w-full"
                    leftIcon={<Gamepad2 className="h-4 w-4 text-gray-500" />}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Sélectionnez l'écosystème sur lequel le joueur dispose de son compte PUBG.
                </p>
              </div>

              {/* 3. Nom affiché (Optionnel) */}
              <div>
                <div className="flex items-center justify-between">
                  <label htmlFor="displayName" className="block text-sm font-semibold text-gray-900">
                    Nom affiché sur le site
                  </label>
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600 dark:bg-slate-800 dark:text-gray-400">
                    Optionnel
                  </span>
                </div>
                <div className="relative mt-1.5">
                  <input
                    id="displayName"
                    type="text"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder={pubgPlayerName.trim() ? `Par défaut : ${pubgPlayerName.trim()}` : 'Laisser vide pour utiliser le pseudo PUBG'}
                    className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm transition focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  Prénom ou alias convivial affiché dans les classements. Si laissé vide, le <strong className="font-semibold text-gray-700">pseudo PUBG sera automatiquement utilisé</strong>.
                </p>
              </div>

              {/* Bouton de validation */}
              <div className="pt-3">
                <button
                  type="submit"
                  disabled={checkingPlayer || submitting}
                  className="app-btn app-btn--md app-btn--primary w-full flex items-center justify-center gap-2 text-base font-semibold"
                >
                  {checkingPlayer ? (
                    <>
                      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      <span>Recherche sur les serveurs PUBG...</span>
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      <span>Vérifier et prévisualiser sur PUBG</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>

          {/* Colonne latérale : Guide d'explication pédagogique UI/UX */}
          <aside className="space-y-4">
            <div className="app-panel-muted rounded-xl p-5 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
                <HelpCircle className="h-5 w-5 text-emerald-500 shrink-0" />
                <h3 className="text-sm font-bold">Comment fonctionne l'ajout ?</h3>
              </div>

              <ol className="mt-4 space-y-3.5 text-xs text-gray-600 dark:text-gray-300">
                <li className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                    1
                  </span>
                  <div>
                    <strong className="font-semibold text-gray-800 dark:text-gray-200">Recherche officielle PUBG :</strong>
                    <p className="mt-0.5">Le pseudo est interrogé auprès de l'API PUBG pour confirmer son existence et récupérer son identifiant unique.</p>
                  </div>
                </li>

                <li className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                    2
                  </span>
                  <div>
                    <strong className="font-semibold text-gray-800 dark:text-gray-200">Détection de clan PUBG :</strong>
                    <p className="mt-0.5">Si le joueur appartient à un clan PUBG officiel, son clan et son tag sont détectés automatiquement.</p>
                  </div>
                </li>

                <li className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                    3
                  </span>
                  <div>
                    <strong className="font-semibold text-gray-800 dark:text-gray-200">Validation en 2 étapes :</strong>
                    <p className="mt-0.5">Une fenêtre de confirmation vous affiche les données trouvées avant d'enregistrer le joueur dans votre clan.</p>
                  </div>
                </li>

                <li className="flex items-start gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                    4
                  </span>
                  <div>
                    <strong className="font-semibold text-gray-800 dark:text-gray-200">Suivi & Rôles :</strong>
                    <p className="mt-0.5">Une fois ajouté, vous pourrez lui assigner un rôle, lui envoyer une invitation de connexion ou consulter ses statistiques.</p>
                  </div>
                </li>
              </ol>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-200">
              <div className="flex items-center gap-1.5 font-semibold">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span>Astuce : Nom affiché</span>
              </div>
              <p className="mt-1 text-blue-800 dark:text-blue-300">
                Vous n'avez pas besoin de saisir le nom affiché si vous souhaitez qu'il soit identique au pseudo PUBG. Laissez simplement le champ vide !
              </p>
            </div>
          </aside>
        </div>
      </main>

      {/* Modal de confirmation enrichie */}
      {showConfirmModal && previewData ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="app-panel w-full max-w-lg rounded-2xl border border-gray-200 p-6 shadow-2xl dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white">Joueur trouvé sur PUBG !</h2>
                <p className="text-xs text-gray-500">
                  Vérifiez les informations détectées avant de valider l'intégration.
                </p>
              </div>
            </div>

            <div className="app-panel-muted mt-5 rounded-xl border border-gray-200 p-4 space-y-3 dark:border-slate-800">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2.5 dark:border-slate-800">
                <span className="text-xs font-medium text-gray-500">Pseudo PUBG :</span>
                <span className="font-mono text-sm font-bold text-gray-900 dark:text-emerald-400">
                  {previewData.player.pubgPlayerName}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-gray-100 pb-2.5 dark:border-slate-800">
                <span className="text-xs font-medium text-gray-500">Nom affiché sur le site :</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {previewData.player.displayName}
                  {previewData.player.displayName === previewData.player.pubgPlayerName ? (
                    <span className="ml-1.5 text-[11px] font-normal text-gray-500 italic">(identique au pseudo)</span>
                  ) : null}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-gray-100 pb-2.5 dark:border-slate-800">
                <span className="text-xs font-medium text-gray-500">Plateforme :</span>
                <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-slate-800 dark:bg-slate-700 dark:text-slate-200">
                  {previewData.player.platformShard}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">Clan PUBG détecté :</span>
                {previewData.clan ? (
                  <span className="text-xs font-bold text-cyan-700 dark:text-cyan-400">
                    {previewData.clan.name} <span className="font-mono">[{previewData.clan.tag}]</span>
                  </span>
                ) : (
                  <span className="text-xs text-gray-500 italic">
                    Aucun clan PUBG officiel
                  </span>
                )}
              </div>
            </div>

            <p className="mt-4 text-xs text-gray-500">
              En confirmant, ce joueur sera rattaché à votre clan et son historique de parties commencera à être suivi.
            </p>

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
                className="app-btn app-btn--md app-btn--primary flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    <span>Ajout en cours...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Confirmer et ajouter</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
