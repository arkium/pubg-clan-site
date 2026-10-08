'use client'

import { Globe, Save } from 'lucide-react'
import { useEffect, useState } from 'react'

import { ButtonSpinner, ListSkeleton, SectionCard } from '@/components/ui/CharteKit'

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
    <SectionCard
      id={`clan-subdomain-title-${clanId}`}
      icon={Globe}
      title="Adresse du clan"
      meta="Le sous-domaine mène à la vue d’ensemble du clan. Il ne change pas si le tag PUBG change."
    >
      {loadError ? <p className="t-body t-neg m-0">{loadError}</p> : null}

      {clan?.isSystem ? (
        <p className="t-meta m-0">Le clan technique n’a pas de sous-domaine.</p>
      ) : clan ? (
        <div className="flex flex-col gap-3">
          <p className="t-body m-0 text-gray-700">
            Adresse actuelle :{' '}
            {clan.subdomain ? (
              <strong className="font-mono font-semibold text-gray-900">
                {clan.subdomain}.{root}
              </strong>
            ) : (
              <span className="text-gray-500">aucune {clan.isActive ? '' : '(attribuée à l’activation du clan)'}</span>
            )}
            {!summary?.root ? <span className="text-gray-500"> — redirection pas encore activée sur ce serveur</span> : null}
          </p>
          <div className="flex flex-col gap-1">
            <label className="t-label" htmlFor={`clan-subdomain-${clanId}`}>
              Sous-domaine
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id={`clan-subdomain-${clanId}`}
                value={value}
                onChange={(event) => setValue(event.target.value.toLowerCase())}
                maxLength={63}
                className="app-input w-full max-w-xs font-mono"
                aria-describedby={`clan-subdomain-help-${clanId}`}
              />
              <span className="t-body font-mono text-gray-500">.{root}</span>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !value || value === clan.subdomain}
                className="app-btn app-btn--md app-btn--primary gap-1.5"
              >
                {saving ? <ButtonSpinner /> : <Save className="h-4 w-4" aria-hidden="true" />}
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
            <span id={`clan-subdomain-help-${clanId}`} className="t-meta">
              Lettres minuscules, chiffres et tirets, de 2 à 63 caractères. Les adresses techniques (www, api, mail…) sont
              réservées.
            </span>
          </div>
          {feedback ? (
            <p className={`t-body m-0 ${feedback.tone === 'success' ? 't-pos' : 't-neg'}`} role="status">
              {feedback.text}
            </p>
          ) : null}
        </div>
      ) : (
        <ListSkeleton rows={1} />
      )}
    </SectionCard>
  )
}
