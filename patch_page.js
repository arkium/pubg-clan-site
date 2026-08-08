const fs = require('fs')
const path = require('path')

const filePath = path.join('d:', 'Sources', 'pubg-clan-site', 'src', 'app', 'settings', 'opponents', 'page.tsx')
let content = fs.readFileSync(filePath, 'utf-8')

// 1. Add states and handlers
const stateInjection = `  const [expandedOpponentId, setExpandedOpponentId] = useState<string | null>(null)
  const [opponentDetails, setOpponentDetails] = useState<Record<string, DetailState<OpponentClanDetail>>>({})

  const [trackPending, setTrackPending] = useState<Set<string>>(new Set())

  async function handleTrackMember(playerId: string, targetClanId: number) {
    try {
      setTrackPending((prev) => new Set(prev).add(playerId))
      const res = await fetch('/api/settings/opponents/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, targetClanId })
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Erreur lors du suivi')
      alert('Joueur suivi avec succès !')
    } catch (err: any) {
      console.error(err)
      alert(err.message)
    } finally {
      setTrackPending((prev) => {
        const next = new Set(prev)
        next.delete(playerId)
        return next
      })
    }
  }

  async function handleFavoritePlayer(playerId: string, current: boolean, opponentClanId: string) {
    try {
      setOpponentDetails((prev) => {
        const next = { ...prev }
        if (next[opponentClanId]?.status === 'ready') {
          next[opponentClanId] = {
            ...next[opponentClanId],
            data: {
              ...next[opponentClanId].data,
              players: next[opponentClanId].data.players.map((p) =>
                p.playerId === playerId ? { ...p, isFavorite: !current } : p
              )
            }
          }
        }
        return next
      })
      const res = await fetch(\`/api/settings/players/\${playerId}/favorite\`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isFavorite: !current })
      })
      if (!res.ok) throw new Error('Failed to update favorite')
    } catch(err) {
      console.error(err)
    }
  }`

content = content.replace(
  "  const [expandedOpponentId, setExpandedOpponentId] = useState<string | null>(null)\n  const [opponentDetails, setOpponentDetails] = useState<Record<string, DetailState<OpponentClanDetail>>>({})",
  stateInjection
)

// 2. Pass props
content = content.replaceAll(
  "<ClanDetailPanel detail={clanDetails[row.id]} />", 
  "<ClanDetailPanel detail={clanDetails[row.id]} clanId={row.id} onTrack={handleTrackMember} trackPending={trackPending} />"
)

content = content.replaceAll(
  "<OpponentDetailPanel detail={detail} />", 
  "<OpponentDetailPanel detail={detail} opponentClanId={row.id} trackedClans={trackedClans?.rows || []} onTrack={handleTrackMember} trackPending={trackPending} onToggleFavorite={handleFavoritePlayer} />"
)

content = content.replaceAll(
  "<OpponentDetailPanel detail={opponentDetails[row.id]} />", 
  "<OpponentDetailPanel detail={opponentDetails[row.id]} opponentClanId={row.id} trackedClans={trackedClans?.rows || []} onTrack={handleTrackMember} trackPending={trackPending} onToggleFavorite={handleFavoritePlayer} />"
)

// 3. Update ClanDetailPanel signature
content = content.replace(
  "function ClanDetailPanel({ detail }: { detail: DetailState<ClanDetail> | undefined }) {",
  `function ClanDetailPanel({ 
  detail, clanId, onTrack, trackPending 
}: { 
  detail: DetailState<ClanDetail> | undefined
  clanId: number
  onTrack: (playerId: string, clanId: number) => void
  trackPending: Set<string>
}) {`
)

content = content.replace(
  `<span
                  title="La création automatique de membre n'est pas encore implémentée"
                  className="inline-flex cursor-not-allowed items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-400"
                >
                  <UserPlus className="h-3 w-3" aria-hidden />
                  Ajouter
                </span>`,
  `<button
                  type="button"
                  onClick={() => onTrack(candidate.playerId, clanId)}
                  disabled={trackPending.has(candidate.playerId)}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <UserPlus className="h-3 w-3" aria-hidden />
                  {trackPending.has(candidate.playerId) ? 'Ajout...' : 'Ajouter'}
                </button>`
)


// 4. Update OpponentDetailPanel signature
content = content.replace(
  "function OpponentDetailPanel({ detail }: { detail: DetailState<OpponentClanDetail> | undefined }) {",
  `function OpponentDetailPanel({ 
  detail, opponentClanId, trackedClans, onTrack, trackPending, onToggleFavorite 
}: { 
  detail: DetailState<OpponentClanDetail> | undefined
  opponentClanId: string
  trackedClans: TrackedClanRow[]
  onTrack: (playerId: string, targetClanId: number) => void
  trackPending: Set<string>
  onToggleFavorite: (playerId: string, current: boolean, opponentClanId: string) => void
}) {
  const [selectedClanId, setSelectedClanId] = useState<number>(trackedClans[0]?.id || 0)`
)

// Add useState to import if needed
if (!content.includes("import { Fragment, useEffect, useState } from 'react'")) {
    content = content.replace("import { Fragment, useEffect }", "import { Fragment, useEffect, useState }")
}

// 5. Update Suivre and Favorite
const opponentPlayerRender = `{players.map((player) => (
          <li key={player.playerId} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1 text-slate-700">
              <button onClick={() => onToggleFavorite(player.playerId, player.isFavorite, opponentClanId)} className="text-slate-400 hover:text-amber-500">
                <Star className={\`h-3.5 w-3.5 \${player.isFavorite ? 'fill-amber-400 text-amber-500' : ''}\`} />
              </button>
              {player.pubgPlayerName}
            </span>
            <span className="flex items-center gap-2">
              {player.trackedMember ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                  Membre de {player.trackedMember.clanTag ?? '?'}
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <select
                    className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] text-slate-700"
                    value={selectedClanId}
                    onChange={(e) => setSelectedClanId(Number(e.target.value))}
                  >
                    {trackedClans.map(c => <option key={c.id} value={c.id}>{c.tag}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedClanId) onTrack(player.playerId, selectedClanId)
                    }}
                    disabled={trackPending.has(player.playerId)}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <UserPlus className="h-3 w-3" aria-hidden />
                    {trackPending.has(player.playerId) ? '...' : 'Suivre'}
                  </button>
                </span>
              )}
            </span>
          </li>
        ))}`

content = content.replace(
  /\{players\.map\(\(player\) => \([\s\S]*?\}\)\)\}/g,
  opponentPlayerRender
)

fs.writeFileSync(filePath, content, 'utf-8')
console.log('Patched page.tsx successfully')
