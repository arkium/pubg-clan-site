import { isAuthDisabled } from '@/lib/auth-mode'

/**
 * Endpoint public (pas d'auth requise) — permet au client de savoir si
 * DISABLE_AUTH_PERMISSIONS est actif pour adapter la nav (mode visiteur)
 * et le sélecteur de clan.
 */
export async function GET() {
  return Response.json({ authDisabled: isAuthDisabled() })
}
