import { getClanLabel, getLoginWelcomeSettings, getPrimaryClanId } from '@/lib/login-welcome-service'

// Lecture seule. L'ancien PUT (écriture de l'accueil du plus ancien clan actif par l'admin de n'importe
// quel clan) est supprimé : l'écriture passe par /api/clans/[clanId]/settings/login-welcome.
export async function GET() {
  const clanId = await getPrimaryClanId()

  if (!clanId) {
    return Response.json({ settings: null, clanLabel: null })
  }

  const [settings, clanLabel] = await Promise.all([
    getLoginWelcomeSettings(clanId),
    getClanLabel(clanId),
  ])

  return Response.json({ settings, clanLabel })
}
