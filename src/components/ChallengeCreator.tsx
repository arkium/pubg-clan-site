'use client'

import { useState } from 'react'

import { CHALLENGE_TYPES } from '@/lib/challenge-types'
import { type ChallengeDuration, type ChallengeRewards } from '@/lib/challenge-service'

type Props = {
  onSubmit: (data: {
    title: string
    description?: string
    type: string
    duration: ChallengeDuration
    target?: number
    rewards: ChallengeRewards
  }) => Promise<void>
  loading?: boolean
}

const DURATION_LABELS: Record<ChallengeDuration, string> = {
  daily: 'Quotidien',
  weekly: 'Hebdomadaire',
  monthly: 'Mensuel',
}

export default function ChallengeCreator({ onSubmit, loading }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<string>(CHALLENGE_TYPES.KILL_RACE.key)
  const [duration, setDuration] = useState<ChallengeDuration>('weekly')
  const [target, setTarget] = useState('')
  const [reward1st, setReward1st] = useState('100')
  const [reward2nd, setReward2nd] = useState('50')
  const [reward3rd, setReward3rd] = useState('25')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!title.trim()) {
      setError('Le titre est obligatoire.')
      return
    }

    const rewards: ChallengeRewards = {
      '1st': Number(reward1st) || 0,
      '2nd': Number(reward2nd) || 0,
      '3rd': Number(reward3rd) || 0,
    }

    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim() || undefined,
        type,
        duration,
        target: target ? Number(target) : undefined,
        rewards,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue.')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error ? (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}

      <div>
        <label htmlFor="challenge-title" className="block text-sm font-medium text-gray-700">
          Titre <span className="text-red-500">*</span>
        </label>
        <input
          id="challenge-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Ex: Kill Race du weekend"
          required
        />
      </div>

      <div>
        <label htmlFor="challenge-desc" className="block text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          id="challenge-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Décrivez l'objectif du challenge..."
        />
      </div>

      <div>
        <label htmlFor="challenge-type" className="block text-sm font-medium text-gray-700">
          Type de challenge
        </label>
        <select
          id="challenge-type"
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {Object.values(CHALLENGE_TYPES).map((t) => (
            <option key={t.key} value={t.key}>
              {t.icon} {t.name} — {t.description}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="challenge-duration" className="block text-sm font-medium text-gray-700">
          Durée
        </label>
        <select
          id="challenge-duration"
          value={duration}
          onChange={(e) => setDuration(e.target.value as ChallengeDuration)}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {(Object.entries(DURATION_LABELS) as [ChallengeDuration, string][]).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="challenge-target" className="block text-sm font-medium text-gray-700">
          Objectif (optionnel)
        </label>
        <input
          id="challenge-target"
          type="number"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          min={0}
          className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Ex: 100 kills"
        />
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-gray-700">Récompenses (points)</legend>
        <div className="mt-2 grid grid-cols-3 gap-3">
          {(
            [
              { label: '🥇 1er', value: reward1st, set: setReward1st },
              { label: '🥈 2e', value: reward2nd, set: setReward2nd },
              { label: '🥉 3e', value: reward3rd, set: setReward3rd },
            ] as const
          ).map(({ label, value, set }) => (
            <div key={label}>
              <label className="block text-xs text-gray-600">{label}</label>
              <input
                type="number"
                value={value}
                onChange={(e) => set(e.target.value)}
                min={0}
                className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          ))}
        </div>
      </fieldset>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Création...' : 'Créer le challenge'}
        </button>
      </div>
    </form>
  )
}
