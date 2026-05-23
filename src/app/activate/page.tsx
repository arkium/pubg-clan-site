'use client'

import Link from 'next/link'
import { Suspense, type FormEvent, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

function ActivatePageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tokenFromUrl = useMemo(() => searchParams.get('token') ?? '', [searchParams])

  const [token, setToken] = useState(tokenFromUrl)
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas')
      return
    }

    try {
      setSubmitting(true)
      setError('')

      const response = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          token,
          password,
          displayName: displayName.trim() || undefined,
        }),
      })

      const payload = (await response.json()) as { error?: string }
      if (!response.ok) {
        throw new Error(payload.error ?? 'Activation failed')
      }

      router.replace('/')
      router.refresh()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Activation failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 items-center px-4 py-10">
      <section className="w-full rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-gray-900">Activation du compte</h1>
        <p className="mt-2 text-sm text-gray-600">
          Définissez votre mot de passe pour activer votre accès joueur.
        </p>

        <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <label className="block text-sm text-gray-700">
            Token d&apos;activation
            <input
              type="text"
              required
              value={token}
              onChange={(event) => setToken(event.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              autoComplete="off"
            />
          </label>

          <label className="block text-sm text-gray-700">
            Nom affiché (optionnel)
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              autoComplete="nickname"
            />
          </label>

          <label className="block text-sm text-gray-700">
            Mot de passe
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              autoComplete="new-password"
            />
          </label>

          <label className="block text-sm text-gray-700">
            Confirmer le mot de passe
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

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {submitting ? 'Activation...' : 'Activer mon compte'}
          </button>
        </form>

        <p className="mt-4 text-xs text-gray-500">
          Déjà activé ? <Link href="/login" className="underline">Se connecter</Link>
        </p>
      </section>
    </main>
  )
}

export default function ActivatePage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-md flex-1 items-center px-4 py-10">
          <p className="text-sm text-gray-600">Chargement...</p>
        </main>
      }
    >
      <ActivatePageContent />
    </Suspense>
  )
}
