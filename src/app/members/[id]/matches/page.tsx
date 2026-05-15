'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface MatchInfo {
  memberId: number
  playerId: string
  shard: string
  matchIds: string[]
  totalMatches: number
}

interface Match {
  id: string
  mode: string
  createdAt: string
  durationSeconds: number
  stats: {
    kills: number
    assists: number
    damageDealt: number
    headshotKills: number
    revives: number
    position: number
  }
}

export default function MatchesPage() {
  const params = useParams()
  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMatchInfo()
  }, [params.id])

  const fetchMatchInfo = async () => {
    try {
      const res = await fetch(`/api/members/${params.id}/matches`)
      const data = await res.json()
      setMatchInfo(data)
      
      // Fetch details for each match with delay
      fetchMatchDetails(data)
    } catch (error) {
      console.error('Failed to fetch match info:', error)
      setLoading(false)
    }
  }

  const fetchMatchDetails = async (info: MatchInfo) => {
    const matches: Match[] = []
    const delayMs = 6000 // 10 RPM limit
    
    for (let i = 0; i < info.matchIds.length; i++) {
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
      
      try {
        const res = await fetch(
          `/api/matches/${info.matchIds[i]}?shard=${info.shard}&playerId=${info.playerId}&memberId=${info.memberId}`
        )
        const match = await res.json()
        matches.push(match)
        setMatches([...matches])
      } catch (error) {
        console.error(`Failed to fetch match ${info.matchIds[i]}:`, error)
      }
    }
    
    setLoading(false)
  }

  if (loading) {
    return <div className="p-8">Loading matches...</div>
  }

  if (!matchInfo) {
    return <div className="p-8">Failed to load matches</div>
  }

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Matches ({matches.length}/{matchInfo.totalMatches})</h1>
      
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead className="bg-gray-100">
            <tr>
              <th className="border p-2">Mode</th>
              <th className="border p-2">Date</th>
              <th className="border p-2">Kills</th>
              <th className="border p-2">Assists</th>
              <th className="border p-2">Damage</th>
              <th className="border p-2">Headshots</th>
              <th className="border p-2">Revives</th>
              <th className="border p-2">Position</th>
            </tr>
          </thead>
          <tbody>
            {matches.map(match => (
              <tr key={match.id} className="hover:bg-gray-50">
                <td className="border p-2">{match.mode}</td>
                <td className="border p-2">{new Date(match.createdAt).toLocaleString()}</td>
                <td className="border p-2 text-center">{match.stats.kills}</td>
                <td className="border p-2 text-center">{match.stats.assists}</td>
                <td className="border p-2 text-center">{match.stats.damageDealt.toFixed(0)}</td>
                <td className="border p-2 text-center">{match.stats.headshotKills}</td>
                <td className="border p-2 text-center">{match.stats.revives}</td>
                <td className="border p-2 text-center">{match.stats.position}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {matches.length < matchInfo.matchIds.length && (
        <p className="mt-4 text-gray-600">Loading {matchInfo.matchIds.length - matches.length} more matches...</p>
      )}
    </div>
  )
}