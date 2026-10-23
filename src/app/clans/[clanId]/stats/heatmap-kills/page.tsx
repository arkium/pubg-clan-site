import { redirect } from 'next/navigation'

/**
 * Ancienne page « Heatmap kills » du clan (compteurs techniques du lobby), remplacée le 2026-10-23 par la page Cartes
 * du clan (docs/TODO/cartes-clan.md). Gardée en redirection pour les liens et favoris déjà publiés.
 */
export default async function LegacyClanHeatmapKillsPage({ params }: { params: Promise<{ clanId: string }> }) {
  const { clanId } = await params
  redirect(`/clans/${encodeURIComponent(clanId)}/stats/maps`)
}
