'use client'

type LifetimeStats = {
  combat: {
    kills: number
    deaths: number
    kdRatio: number
    headshots: number
    assists: number
    knockouts: number
    highestKillstreak: number
    longestKill: number
    teamkills: number
    suicides: number
  }
  victory: {
    wins: number
    losses: number
    winLossRatio: number
    longestTimeAlive: number
  }
  support: {
    teammatesRevived: number
    boostsUsed: number
    healed: number
  }
  vehicle: {
    vehiclesDestroyed: number
    roadkills: number
  }
  movement: {
    drivenDistance: number
    walkedDistance: number
    swamDistance: number
  }
  other: {
    weaponsPicked: number
    damageGiven: number
  }
}

type MemberLifetimeStatsPanelProps = {
  lifetimeStats: LifetimeStats | null
  loadingStats: boolean
  statsError: string
  lastRefreshedAt: string | null
  refreshingStats: boolean
  onRefresh: () => void
}

function formatDurationLong(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m ${remainingSeconds}s`
  }

  return `${minutes}m ${remainingSeconds}s`
}

function formatNumber(value: number) {
  return value.toLocaleString()
}

function formatRatio(value: number) {
  return value.toFixed(2)
}

function formatDistanceMetersToKm(value: number) {
  return `${(value / 1000).toFixed(2)} km`
}

export default function MemberLifetimeStatsPanel({
  lifetimeStats,
  loadingStats,
  statsError,
  lastRefreshedAt,
  refreshingStats,
  onRefresh,
}: MemberLifetimeStatsPanelProps) {
  return (
    <section className="rounded bg-white p-6 shadow">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Statistiques globales</h2>
          <p className="text-sm text-gray-500">
            Vue complete des statistiques PUBG cumulées pour ce joueur.
          </p>
          {lastRefreshedAt ? (
            <p className="mt-1 text-xs text-gray-400">
              Derniere mise a jour : {new Date(lastRefreshedAt).toLocaleString('fr-FR')}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshingStats || loadingStats}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {refreshingStats ? 'Actualisation...' : 'Actualiser les stats'}
        </button>
      </div>

      {loadingStats && !lifetimeStats ? (
        <p className="text-sm text-gray-500">Chargement des statistiques globales...</p>
      ) : statsError && !lifetimeStats ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {statsError}
        </div>
      ) : lifetimeStats ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <article className="rounded border border-gray-200 p-4">
            <h3 className="mb-3 text-lg font-semibold">Combat</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt>Kills</dt><dd>{formatNumber(lifetimeStats.combat.kills)}</dd></div>
              <div className="flex justify-between"><dt>Morts</dt><dd>{formatNumber(lifetimeStats.combat.deaths)}</dd></div>
              <div className="flex justify-between"><dt>Ratio K/D</dt><dd>{formatRatio(lifetimeStats.combat.kdRatio)}</dd></div>
              <div className="flex justify-between"><dt>Headshots</dt><dd>{formatNumber(lifetimeStats.combat.headshots)}</dd></div>
              <div className="flex justify-between"><dt>Assists</dt><dd>{formatNumber(lifetimeStats.combat.assists)}</dd></div>
              <div className="flex justify-between"><dt>KO</dt><dd>{formatNumber(lifetimeStats.combat.knockouts)}</dd></div>
              <div className="flex justify-between"><dt>Serie max</dt><dd>{formatNumber(lifetimeStats.combat.highestKillstreak)}</dd></div>
              <div className="flex justify-between"><dt>Distance max</dt><dd>{lifetimeStats.combat.longestKill.toFixed(2)} m</dd></div>
              <div className="flex justify-between"><dt>Teamkills</dt><dd>{formatNumber(lifetimeStats.combat.teamkills)}</dd></div>
              <div className="flex justify-between"><dt>Suicides</dt><dd>{formatNumber(lifetimeStats.combat.suicides)}</dd></div>
            </dl>
          </article>

          <article className="rounded border border-gray-200 p-4">
            <h3 className="mb-3 text-lg font-semibold">Victoires</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt>Victoires</dt><dd>{formatNumber(lifetimeStats.victory.wins)}</dd></div>
              <div className="flex justify-between"><dt>Defaites</dt><dd>{formatNumber(lifetimeStats.victory.losses)}</dd></div>
              <div className="flex justify-between"><dt>Ratio V/D</dt><dd>{formatRatio(lifetimeStats.victory.winLossRatio)}</dd></div>
              <div className="flex justify-between"><dt>Temps max en vie</dt><dd>{formatDurationLong(lifetimeStats.victory.longestTimeAlive)}</dd></div>
            </dl>
          </article>

          <article className="rounded border border-gray-200 p-4">
            <h3 className="mb-3 text-lg font-semibold">Support</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt>Coequipiers releves</dt><dd>{formatNumber(lifetimeStats.support.teammatesRevived)}</dd></div>
              <div className="flex justify-between"><dt>Boosts utilises</dt><dd>{formatNumber(lifetimeStats.support.boostsUsed)}</dd></div>
              <div className="flex justify-between"><dt>Soin</dt><dd>{formatNumber(lifetimeStats.support.healed)}</dd></div>
            </dl>
          </article>

          <article className="rounded border border-gray-200 p-4">
            <h3 className="mb-3 text-lg font-semibold">Vehicules</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt>Vehicules detruits</dt><dd>{formatNumber(lifetimeStats.vehicle.vehiclesDestroyed)}</dd></div>
              <div className="flex justify-between"><dt>Roadkills</dt><dd>{formatNumber(lifetimeStats.vehicle.roadkills)}</dd></div>
            </dl>
          </article>

          <article className="rounded border border-gray-200 p-4">
            <h3 className="mb-3 text-lg font-semibold">Deplacements</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt>Distance en vehicule</dt><dd>{formatDistanceMetersToKm(lifetimeStats.movement.drivenDistance)}</dd></div>
              <div className="flex justify-between"><dt>Distance a pied</dt><dd>{formatDistanceMetersToKm(lifetimeStats.movement.walkedDistance)}</dd></div>
              <div className="flex justify-between"><dt>Distance a la nage</dt><dd>{formatDistanceMetersToKm(lifetimeStats.movement.swamDistance)}</dd></div>
            </dl>
          </article>

          <article className="rounded border border-gray-200 p-4">
            <h3 className="mb-3 text-lg font-semibold">Autres</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt>Armes ramassees</dt><dd>{formatNumber(lifetimeStats.other.weaponsPicked)}</dd></div>
              <div className="flex justify-between"><dt>Degats infliges</dt><dd>{formatNumber(lifetimeStats.other.damageGiven)}</dd></div>
            </dl>
          </article>
        </div>
      ) : (
        <p className="text-sm text-gray-500">Aucune statistique globale disponible.</p>
      )}
    </section>
  )
}