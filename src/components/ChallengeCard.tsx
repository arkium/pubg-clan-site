'use client'

import Link from 'next/link'

import { CHALLENGE_TYPES } from '@/lib/challenge-types'

type Participant = {
  memberId: number
  displayName: string
  progress: number
}

type Challenge = {
  id: string
  clanId: number
  title: string
  description: string | null
  type: string
  duration: string
  startDate: string
  endDate: string
  status: string
  target: number | null
  rewards: Record<string, number>
  participants: Participant[]
}

type Props = {
  challenge: Challenge
  currentMemberId?: number
  onJoin?: (challengeId: string) => void
}

function getChallengeTypeMeta(type: string) {
  return (
    Object.values(CHALLENGE_TYPES).find((t) => t.key === type) ?? {
      name: type,
      icon: '🎯',
      description: '',
    }
  )
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'À venir',
  active: 'Actif',
  ended: 'Terminé',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  active: 'bg-green-100 text-green-800',
  ended: 'bg-gray-100 text-gray-700',
}

export default function ChallengeCard({ challenge, currentMemberId, onJoin }: Props) {
  const meta = getChallengeTypeMeta(challenge.type)
  const isJoined = currentMemberId
    ? challenge.participants.some((p) => p.memberId === currentMemberId)
    : false

  const top3 = challenge.participants.slice(0, 3)

  return (
    <div className="rounded border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden>
            {meta.icon}
          </span>
          <div>
            <h3 className="font-semibold text-gray-900">{challenge.title}</h3>
            <p className="text-xs text-gray-500">{meta.name}</p>
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[challenge.status] ?? 'bg-gray-100 text-gray-700'}`}
        >
          {STATUS_LABELS[challenge.status] ?? challenge.status}
        </span>
      </div>

      {challenge.description ? (
        <p className="mb-3 text-sm text-gray-600">{challenge.description}</p>
      ) : null}

      <div className="mb-3 flex items-center gap-4 text-xs text-gray-500">
        <span>Du {formatDate(challenge.startDate)}</span>
        <span>au {formatDate(challenge.endDate)}</span>
      </div>

      {top3.length > 0 ? (
        <div className="mb-3">
          <p className="mb-1 text-xs font-medium text-gray-500">Top 3</p>
          <ol className="space-y-1">
            {top3.map((p, i) => (
              <li key={p.memberId} className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1">
                  <span>{['🥇', '🥈', '🥉'][i]}</span>
                  <span className="text-gray-800">{p.displayName}</span>
                </span>
                <span className="font-medium text-gray-700">{p.progress}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <Link
          href={`/clans/${challenge.clanId}/challenges/${challenge.id}`}
          className="text-xs text-blue-600 hover:underline"
        >
          Voir le détail
        </Link>

        {challenge.status === 'active' && !isJoined && onJoin ? (
          <button
            type="button"
            onClick={() => onJoin(challenge.id)}
            className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
          >
            Rejoindre
          </button>
        ) : null}

        {challenge.status === 'active' && isJoined ? (
          <span className="text-xs font-medium text-green-600">✓ Inscrit</span>
        ) : null}
      </div>
    </div>
  )
}
