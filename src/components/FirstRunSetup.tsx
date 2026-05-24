'use client'

import { FormEvent, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function FirstRunSetup() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [pubgPlayerName, setPubgPlayerName] = useState('')
  const [platformShard, setPlatformShard] = useState('steam')
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = useMemo(() => {
    return (
      displayName.trim().length > 0 &&
      pubgPlayerName.trim().length > 0 &&
      platformShard.trim().length > 0 &&
      email.trim().length > 0
    )
  }, [displayName, email, platformShard, pubgPlayerName])

  async function handleSetupSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canSubmit || submitting) {
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/setup/initialize', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          displayName: displayName.trim(),
          pubgPlayerName: pubgPlayerName.trim(),
          platformShard: platformShard.trim(),
          email: email.trim(),
        }),
      })

      const payload = (await response.json().catch(() => null)) as
        | {
            invite?: {
              activationUrl?: string
            }
            error?: string
          }
        | null

      if (!response.ok) {
        setError(payload?.error ?? "Impossible de terminer l'initialisation")
        return
      }

      router.replace('/')
      router.refresh()
    } catch {
      setError('Erreur reseau pendant l\'initialisation')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 items-center justify-center p-6">
      <section className="w-full rounded-2xl border border-amber-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Initialisation du clan</h1>
          <p className="mt-2 text-sm text-gray-600">
            Premiere configuration detectee: recherchez votre joueur PUBG pour creer le clan et
            initialiser le compte Owner.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSetupSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="displayName">
              Nom affiche
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-amber-300 focus:border-amber-500 focus:ring"
              placeholder="Ex: Pagiotte"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="pubgPlayerName">
              Pseudo PUBG
            </label>
            <input
              id="pubgPlayerName"
              type="text"
              value={pubgPlayerName}
              onChange={(event) => setPubgPlayerName(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-amber-300 focus:border-amber-500 focus:ring"
              placeholder="Ex: pagiotte"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="platformShard">
              Plateforme
            </label>
            <select
              id="platformShard"
              value={platformShard}
              onChange={(event) => setPlatformShard(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-amber-300 focus:border-amber-500 focus:ring"
            >
              <option value="steam">steam</option>
              <option value="kakao">kakao</option>
              <option value="xbox">xbox</option>
              <option value="psn">psn</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="email">
              Email Owner
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none ring-amber-300 focus:border-amber-500 focus:ring"
              placeholder="owner@example.com"
              required
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="inline-flex items-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Initialisation...' : "Creer le clan et l'Owner"}
          </button>
        </form>
      </section>
    </main>
  )
}
