'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'

import MemberPageHeader from '@/components/member/MemberPageHeader'
import PlayerNameBadge from '@/components/ui/PlayerNameBadge'
import WeaponIcon from '@/components/ui/WeaponIcon'
import WeaponSelect from '@/components/ui/WeaponSelect'
import { resolveWeaponName } from '@/lib/pubg-assets'

type OpponentRow = {
  key: string
  name: string
  clanTag: string | null
  isBot: boolean
  resolved: boolean
  count: number
  lastAt: string
  topWeapon: string | null
}

type WeaponCount = {
  weaponName: string
  count: number
}

type NemesisPayload = {
  totalDeathsTracked: number
  totalKillsTracked: number
  botKillCount: number
  botDeathCount: number
  environmentalDeathCount: number
  availableWeapons: string[]
  selectedWeapon: string | null
  topDeathWeapons: WeaponCount[]
  topKillers: OpponentRow[]
  topVictims: OpponentRow[]
}

type NemesisResponse = {
  data?: NemesisPayload
  error?: string
}

function parseMemberId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) {
    return null
  }

  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }

  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatRatio(kills: number, deaths: number) {
  if (deaths === 0) {
    return kills > 0 ? kills.toFixed(2) : '-'
  }

  return (kills / deaths).toFixed(2)
}

function podiumTone(rank: number) {
  if (rank === 1) return 'app-podium-badge--gold'
  if (rank === 2) return 'app-podium-badge--silver'
  return 'app-podium-badge--bronze'
}

function countBadgeClass(tone: 'danger' | 'success', rank: number) {
  const intense = rank === 1
  if (tone === 'danger') {
    return intense
      ? 'border-rose-300 bg-rose-100 text-rose-800'
      : 'border-rose-200 bg-rose-50 text-rose-700'
  }

  return intense
    ? 'border-emerald-300 bg-emerald-100 text-emerald-800'
    : 'border-emerald-200 bg-emerald-50 text-emerald-700'
}

function OpponentList({
  rows,
  tone,
  emptyLabel,
}: {
  rows: OpponentRow[]
  tone: 'danger' | 'success'
  emptyLabel: string
}) {
  if (rows.length === 0) {
    return (
      <p className="mt-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
        {emptyLabel}
      </p>
    )
  }

  return (
    <div className="mt-3 space-y-2">
      {rows.map((row, index) => {
        const rank = index + 1
        const isPodium = rank <= 3

        return (
          <article
            key={row.key}
            className="flex items-stretch overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
          >
            <div className="flex w-16 shrink-0 items-center justify-center border-r border-slate-200 bg-white">
              {row.topWeapon ? (
                <WeaponIcon id={row.topWeapon} size="xl" />
              ) : (
                <span className="text-2xl" title="Environnement" aria-label="Environnement">
                  🌀
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1 px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {isPodium ? <span className={`app-podium-badge ${podiumTone(rank)}`}>#{rank}</span> : null}
                  {row.resolved ? (
                    <PlayerNameBadge name={row.name} className="min-w-0 truncate font-semibold text-slate-900" />
                  ) : (
                    <span className="min-w-0">
                      <span className="italic text-slate-500">Joueur inconnu</span>
                      <span className="block max-w-[12rem] truncate text-[10px] text-slate-400" title={row.key}>
                        {row.key}
                      </span>
                    </span>
                  )}
                  {row.clanTag ? (
                    <span className="shrink-0 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      [{row.clanTag}]
                    </span>
                  ) : null}
                </div>

                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold tabular-nums ${countBadgeClass(tone, rank)}`}
                >
                  ×{row.count}
                </span>
              </div>

              <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600">
                <span>{row.topWeapon ? resolveWeaponName(row.topWeapon) : 'Environnement'}</span>
                <span className="text-slate-300">·</span>
                <span>Dernière fois : {formatDate(row.lastAt)}</span>
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

export default function MemberNemesisPage() {
  const params = useParams()
  const memberId = useMemo(() => parseMemberId(params.id), [params.id])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [payload, setPayload] = useState<NemesisPayload | null>(null)
  const [weaponFilter, setWeaponFilter] = useState('all')

  useEffect(() => {
    if (!memberId) {
      setLoading(false)
      setError('Identifiant de membre invalide')
      return
    }

    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        const query = weaponFilter !== 'all' ? `?weapon=${encodeURIComponent(weaponFilter)}` : ''
        const response = await fetch(`/api/members/${memberId}/nemesis${query}`, { cache: 'no-store' })
        const data = (await response.json().catch(() => null)) as NemesisResponse | null

        if (!response.ok || !data?.data) {
          if (!cancelled) {
            setPayload(null)
            setError(data?.error ?? 'Chargement du némésis impossible')
          }
          return
        }

        if (!cancelled) {
          setPayload(data.data)
          setError(null)
        }
      } catch {
        if (!cancelled) {
          setPayload(null)
          setError('Chargement du némésis impossible')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [memberId, weaponFilter])

  return (
    <main className="app-container app-main space-y-4">
      <MemberPageHeader
        title="Némésis"
        subtitle="Qui vous a le plus tué, et qui vous avez le plus tué — construit progressivement à partir des nouveaux matchs et d'un backfill partiel, pas d'historique complet garanti."
      />

      {payload ? (
        <section className="app-panel p-4">
          <WeaponSelect
            label="Filtrer par arme"
            value={weaponFilter}
            weapons={payload.availableWeapons}
            onChange={setWeaponFilter}
            className="max-w-xs"
          />
        </section>
      ) : null}

      {loading ? <p className="text-sm text-slate-600">Chargement...</p> : null}
      {!loading && error ? (
        <section className="app-panel p-4 text-sm text-rose-800">{error}</section>
      ) : null}

      {!loading && payload ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Morts trackées</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{payload.totalDeathsTracked}</p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Kills trackés</p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{payload.totalKillsTracked}</p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Ratio K/D tracké</p>
              <p className="mt-2 text-2xl font-bold text-sky-700">
                {formatRatio(payload.totalKillsTracked, payload.totalDeathsTracked)}
              </p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Bots neutralisés</p>
              <p className="mt-2 text-2xl font-bold text-emerald-700">{payload.botKillCount}</p>
            </article>
            <article className="app-panel p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Tué par un bot</p>
              <p className="mt-2 text-2xl font-bold text-slate-500">{payload.botDeathCount}</p>
            </article>
          </section>

          {payload.topDeathWeapons.length > 0 ? (
            <section className="app-panel p-4">
              <h2 className="text-lg font-semibold text-slate-900">Armes qui vous tuent le plus</h2>
              <p className="mt-1 text-xs text-slate-500">
                Toutes armes confondues, tous adversaires confondus — reste global même si un filtre est actif ci-dessus.
              </p>
              <div className="mt-3 space-y-1.5">
                {payload.topDeathWeapons.map((entry) => {
                  const max = payload.topDeathWeapons[0]?.count || 1
                  const widthPercent = Math.max(8, Math.round((entry.count / max) * 100))

                  return (
                    <div key={entry.weaponName} className="flex items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-200 bg-white">
                        <WeaponIcon id={entry.weaponName} size="sm" />
                      </span>
                      <span className="w-32 shrink-0 truncate text-sm text-slate-700">
                        {resolveWeaponName(entry.weaponName)}
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <span
                          className="block h-full rounded-full bg-rose-400"
                          style={{ width: `${widthPercent}%` }}
                        />
                      </span>
                      <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-800">
                        {entry.count}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          ) : null}

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="app-panel p-4">
              <h2 className="text-lg font-semibold text-slate-900">Qui vous a le plus tué</h2>
              <p className="mt-1 text-xs text-slate-500">
                Bots exclus (voir &laquo; Tué par un bot &raquo;) — {payload.environmentalDeathCount} mort(s) par la zone/l&apos;environnement également exclue(s), sans tueur réel.
              </p>
              <OpponentList
                rows={payload.topKillers}
                tone="danger"
                emptyLabel="Aucune donnée pour l'instant."
              />
            </div>

            <div className="app-panel p-4">
              <h2 className="text-lg font-semibold text-slate-900">Qui vous avez le plus tué</h2>
              <p className="mt-1 text-xs text-slate-500">Les bots sont exclus de ce classement — voir &laquo; Bots neutralisés &raquo; ci-dessus.</p>
              <OpponentList
                rows={payload.topVictims}
                tone="success"
                emptyLabel="Aucune donnée pour l'instant."
              />
            </div>
          </section>
        </>
      ) : null}
    </main>
  )
}
