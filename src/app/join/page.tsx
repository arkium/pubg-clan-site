'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type JoinStatus = 'idle' | 'loading' | 'success' | 'error'

interface JoinResponse {
  status: 'pending' | 'created'
  clanId: number
  clanName: string
  memberId: number
  message: string
}

export default function JoinPage() {
  const router = useRouter()
  const [playerName, setPlayerName] = useState('')
  const [platformShard, setPlatformShard] = useState('steam')
  const [joinStatus, setJoinStatus] = useState<JoinStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [successData, setSuccessData] = useState<JoinResponse | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!playerName.trim()) {
      setError('Player name is required')
      return
    }

    try {
      setJoinStatus('loading')
      setError(null)
      setSuccessData(null)

      const response = await fetch('/api/join', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          pubgPlayerName: playerName.trim(),
          platformShard,
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | JoinResponse
        | { error?: string }
        | null

      if (!response.ok) {
        const errorMessage =
          typeof payload?.error === 'string' ? payload.error : 'Failed to join clan'
        setError(errorMessage)
        setJoinStatus('error')
        return
      }

      if (payload && 'status' in payload) {
        setSuccessData(payload)
        setJoinStatus('success')

        // Redirect based on status
        if (payload.status === 'created') {
          // New clan created - redirect to clan dashboard after a delay
          setTimeout(() => {
            router.push(`/clans/${payload.clanId}`)
          }, 2000)
        } else {
          // Pending approval - go to home
          setTimeout(() => {
            router.push('/clans')
          }, 2000)
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An error occurred'
      setError(message)
      setJoinStatus('error')
    }
  }

  return (
    <main className="app-container app-main">
      <div className="flex flex-col items-center py-16">
        <div className="w-full max-w-md space-y-8">
          <div className="space-y-2 text-center">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
              Rejoindre ou créer un clan
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              Entrez votre nom de joueur PUBG pour rejoindre un clan existant ou créer un nouveau
            </p>
          </div>

          {successData ? (
            <div className="app-panel space-y-4 px-6 py-8">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-900/20">
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
                  ✓ Succès !
                </p>
                <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-200">
                  {successData.message}
                </p>
              </div>

              <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
                <p>
                  <strong>Clan :</strong> {successData.clanName}
                </p>
                <p>
                  <strong>Votre statut :</strong>{' '}
                  {successData.status === 'pending'
                    ? 'En attente d\'approbation'
                    : 'Actif (Propriétaire)'}
                </p>
              </div>

              <p className="text-center text-xs text-slate-500 dark:text-slate-400">
                Redirection en 2 secondes...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="app-panel space-y-6 px-6 py-8">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                  <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
              )}

              <div className="space-y-2">
                <label
                  htmlFor="playerName"
                  className="block text-sm font-semibold text-slate-900 dark:text-white"
                >
                  Nom du joueur PUBG
                </label>
                <input
                  id="playerName"
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Entrez votre nom PUBG"
                  disabled={joinStatus === 'loading'}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 placeholder:text-slate-500 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-400"
                  maxLength={32}
                  required
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="platformShard"
                  className="block text-sm font-semibold text-slate-900 dark:text-white"
                >
                  Plateforme
                </label>
                <select
                  id="platformShard"
                  value={platformShard}
                  onChange={(e) => setPlatformShard(e.target.value)}
                  disabled={joinStatus === 'loading'}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-slate-900 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                >
                  <option value="steam">Steam (PC)</option>
                  <option value="xbox">Xbox</option>
                  <option value="psn">PlayStation Network</option>
                  <option value="kakao">Kakao (Corée)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={joinStatus === 'loading'}
                className="w-full rounded-lg bg-blue-600 py-2 font-semibold text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-700 dark:hover:bg-blue-600"
              >
                {joinStatus === 'loading' ? 'Traitement...' : 'Rejoindre ou créer'}
              </button>

              <div className="border-t border-slate-200 pt-4 text-center text-sm dark:border-slate-700">
                <p className="text-slate-600 dark:text-slate-400">
                  Vous avez déjà un compte ?{' '}
                  <Link
                    href="/login"
                    className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Se connecter
                  </Link>
                </p>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}

