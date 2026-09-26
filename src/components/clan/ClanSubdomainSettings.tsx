'use client'

import { Globe } from 'lucide-react'
import { useEffect, useState } from 'react'

type SubdomainSummary = {
  clan: {
    id: number
    name: string
    tag: string
    isActive: boolean
    isSystem: boolean
    subdomain: string | null
    suggestion: string
  }
  root: string | null
}

/**
 * Adresse `<sous-domaine>.chickendinner.fr` du clan, modifiable par le SuperUser —
 * docs/TODO/chickendinnerfr.md §4.B. L'ancien sous-domaine est libéré dès l'enregistrement.
 */
export default function ClanSubdomainSettings({ clanId }: { clanId: number }) {
  const [summary, setSummary] = useState<SubdomainSummary | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ text: string; tone: 'success' | 'error' } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/settings/clans/${clanId}/subdomain`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => null)
        if (!response.ok) throw new Error(body?.error ?? 'Chargement impossible.')
        const loaded = body as SubdomainSummary
        setSummary(loaded)
        setValue(loaded.clan.subdomain ?? loaded.clan.suggestion)
        setLoadError(null)
      })
      .catch((caught: unknown) => {
        if (caught instanceof Error && caught.name === 'AbortError') return
        setLoadError(caught instanceof Error ? caught.message : 'Chargement impossible.')
      })
    return () => controller.abort()
  }, [clanId])

  async function save() {
    try {
      setSaving(true)
      setFeedback(null)
      const response = await fetch(`/api/settings/clans/${clanId}/subdomain`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subdomain: value }),
      })
      const body = (await response.json().catch(() => null)) as { error?: string; subdomain?: string } | null
      if (!response.ok || !body?.subdomain) throw new Error(body?.error ?? 'Enregistrement impossible.')
      const saved = body.subdomain
      setSummary((current) => (current ? { ...current, clan: { ...current.clan, subdomain: saved } } : current))
      setValue(saved)
      setFeedback({ text: 'Sous-domaine enregistré. Il est actif sous 5 minutes au plus.', tone: 'success' })
    } catch (caught) {
      setFeedback({ text: caught instanceof Error ? caught.message : 'Enregistrement impossible.', tone: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const clan = summary?.clan
  const root = summary?.root ?? 'chickendinner.fr'

  return (
    <section className="app-panel p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-sky-500/20 bg-sky-500/10 text-sky-500">
          <Globe className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-gray-900">Adresse du clan</h2>
          <p className="mt-1 text-sm text-gray-600">
            Le sous-domaine mène à la vue d&apos;ensemble du clan. Il ne change pas si le tag PUBG change. Réservé au
            SuperUser.
          </p>

          {loadError ? <p className="mt-3 text-sm text-red-600">{loadError}</p> : null}

          {clan?.isSystem ? (
            <p className="mt-3 text-sm text-gray-600">Le clan système n&apos;a pas de sous-domaine.</p>
          ) : clan ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-gray-700">
                Adresse actuelle :{' '}
                {clan.subdomain ? (
                  <strong className="font-semibold text-gray-900">
                    {clan.subdomain}.{root}
                  </strong>
                ) : (
                  <span className="text-gray-500">aucune {clan.isActive ? '' : '(attribuée à l’activation du clan)'}</span>
                )}
                {!summary?.root ? (
                  <span className="text-gray-500"> — redirection pas encore activée sur ce serveur</span>
                ) : null}
              </p>
              <label className="block text-sm font-medium text-gray-700" htmlFor={`clan-subdomain-${clanId}`}>
                Sous-domaine
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  id={`clan-subdomain-${clanId}`}
                  value={value}
                  onChange={(event) => setValue(event.target.value.toLowerCase())}
                  maxLength={63}
                  className="w-full max-w-xs rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900"
                  aria-describedby={`clan-subdomain-help-${clanId}`}
                />
                <span className="text-sm text-gray-500">.{root}</span>
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || !value || value === clan.subdomain}
                  className="app-btn app-btn--sm app-btn--primary"
                >
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
              <p id={`clan-subdomain-help-${clanId}`} className="text-xs text-gray-500">
                Lettres minuscules, chiffres et tirets, 2 à 63 caractères. Les adresses techniques (www, api, mail…)
                sont réservées.
              </p>
              {feedback ? (
                <p className={`text-sm ${feedback.tone === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                  {feedback.text}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}
