import { getSessionFromRequest } from '@/lib/auth-session'
import { parseMortarDifficulty } from '@/lib/mortar/mortar-game'
import { getMortarLeaderboard } from '@/lib/mortar/mortar-service'

/**
 * « Artilleurs du clan » (docs/features/mortier.md) : `?clanId=&difficulty=` → `MortarLeaderboard`.
 * Lecture publique ; un lecteur connecté reçoit en plus sa propre ligne (`viewer`), même hors des dix premiers.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const clanId = Number(url.searchParams.get('clanId'))
  if (!Number.isInteger(clanId) || clanId <= 0) return Response.json({ error: 'ID de clan invalide.' }, { status: 400 })
  const difficulty = parseMortarDifficulty(url.searchParams.get('difficulty'))
  if (!difficulty) return Response.json({ error: 'Difficulté inconnue (easy, medium ou hard).' }, { status: 400 })

  try {
    const session = await getSessionFromRequest(request)
    const leaderboard = await getMortarLeaderboard(clanId, difficulty, session?.activeMemberId ?? null)
    return Response.json(leaderboard)
  } catch (error) {
    console.error('[mortar/leaderboard] Classement illisible :', error)
    return Response.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
