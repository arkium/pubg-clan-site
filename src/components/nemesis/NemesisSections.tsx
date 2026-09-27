'use client'

import { ChevronDown, ChevronLeft, ChevronRight, Crosshair, Skull, Target, Video } from 'lucide-react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import ArmoryWeaponImage from '@/components/weapons/ArmoryWeaponImage'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { revengeLabel, type OpponentRow } from '@/lib/nemesis'
import { paginate } from '@/lib/pagination'
import { resolveWeaponName } from '@/lib/pubg-assets'
import { elapsedLabel } from '@/lib/relative-time'

/** Blocs de la page Némésis (maquette « Némésis », 23a–23e ; docs/features/nemesis.md). */

export type NemesisPayload = {
  playerKills: number
  playerDeaths: number
  playerKd: number
  botKillCount: number
  botDeathCount: number
  environmentalDeathCount: number
  topDeathWeapons: Array<{ weaponName: string; count: number }>
  topKillers: OpponentRow[]
  topVictims: OpponentRow[]
  availableWeapons: string[]
  selectedWeapon: string | null
  /** Libellé de chaque arme renvoyée, calculé par la route. */
  weaponLabels?: Record<string, string>
}

/** Libellé d'une arme : celui de la route, sinon le dictionnaire du client. */
export const weaponLabelOf = (labels: Record<string, string> | undefined, id: string) => labels?.[id] ?? resolveWeaponName(id)

const decimal = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const plural = (count: number, one: string, many: string) => (count > 1 ? many : one)
const opponentName = (row: OpponentRow) => (row.resolved ? row.name : 'Joueur inconnu')
const PAGE_SIZE = 5
const SM_QUERY = '(min-width: 640px)'
function subscribeSmallScreen(onChange: () => void) {
  const query = window.matchMedia(SM_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
const useIsSmall = () => useSyncExternalStore(subscribeSmallScreen, () => !window.matchMedia(SM_QUERY).matches, () => false)

function Silhouette({ weapon, onDark = false, className }: { weapon: string | null; onDark?: boolean; className: string }) {
  if (!weapon) return <span className={className} aria-hidden="true" />
  return (
    <span className={`relative flex shrink-0 items-center justify-center ${className}`} aria-hidden="true">
      <ArmoryWeaponImage id={weapon} variant="row" onDark={onDark} />
    </span>
  )
}

// ── Menu d'armes du bandeau ──────────────────────────────────────────────────────────────────────

export function WeaponMenu({ weapons, value, onChange, labels }: { weapons: string[]; value: string | null; onChange: (weapon: string | null) => void; labels?: Record<string, string> }) {
  const label = (id: string) => weaponLabelOf(labels, id)
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  const active = value !== null
  const choose = (weapon: string | null) => {
    onChange(weapon)
    setOpen(false)
  }
  return (
    <div ref={rootRef} className="relative ml-auto min-w-0">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Arme : ${active ? label(value) : 'toutes les armes'}`}
        className={`inline-flex h-[34px] max-w-full items-center gap-1.5 whitespace-nowrap rounded-[10px] border px-2.5 text-[13px] font-bold ${
          active ? 'border-[var(--theme-ui-accent-ring)] bg-[var(--theme-ui-accent-soft)] text-[var(--theme-ui-accent-text)]' : 'border-gray-200 bg-white text-gray-900'
        }`}
        data-testid="weapon-chip"
      >
        <Crosshair className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">
          {active ? label(value) : (
            <>
              <span className="sm:hidden">Armes</span>
              <span className="hidden sm:inline">Toutes les armes</span>
            </>
          )}
        </span>
        <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" aria-label="Arme" className="app-panel absolute right-0 top-10 z-50 flex max-h-[60vh] w-[230px] flex-col gap-0.5 overflow-y-auto p-1.5 shadow-xl">
          <button type="button" role="menuitemradio" aria-checked={!active} onClick={() => choose(null)} className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] font-semibold text-gray-900 hover:bg-gray-100 ${!active ? 'bg-gray-100' : ''}`}>
            <span className="h-[22px] w-11 shrink-0" aria-hidden="true" />
            Toutes les armes
          </button>
          {weapons.map((weapon) => (
            <button
              key={weapon}
              type="button"
              role="menuitemradio"
              aria-checked={value === weapon}
              onClick={() => choose(weapon)}
              className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-[13px] font-semibold text-gray-900 hover:bg-gray-100 ${value === weapon ? 'bg-gray-100' : ''}`}
            >
              <Silhouette weapon={weapon} className="h-[22px] w-11" />
              {label(weapon)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

// ── Face-à-face et revanche ──────────────────────────────────────────────────────────────────────

function DuelCard({ row, tone, now, emptyText, labels }: { row: OpponentRow | null; tone: 'nemesis' | 'prey'; now: Date; emptyText: string; labels?: Record<string, string> }) {
  const nemesis = tone === 'nemesis'
  const Icon = nemesis ? Crosshair : Target
  return (
    <article
      aria-label={nemesis ? 'Ton némésis' : 'Ta proie favorite'}
      className={`relative flex min-w-0 flex-col gap-2.5 overflow-hidden rounded-2xl border p-4 text-white ${
        nemesis ? 'border-rose-500/50 bg-[linear-gradient(160deg,#2a0a12,#0b0f1a_70%)]' : 'border-emerald-400/45 bg-[linear-gradient(160deg,#052e22,#0b0f1a_70%)]'
      }`}
    >
      <Icon className={`absolute -right-7 -top-7 h-36 w-36 opacity-[0.12] ${nemesis ? 'text-rose-500' : 'text-emerald-400'}`} aria-hidden="true" />
      <span className={`text-[11px] font-black tracking-[0.18em] ${nemesis ? 'text-rose-300' : 'text-emerald-300'}`}>
        {nemesis ? 'TON NÉMÉSIS · T’A ÉLIMINÉ' : 'TA PROIE FAVORITE · TU L’AS ÉLIMINÉ'}
      </span>
      {row ? (
        <>
          <div className="flex min-w-0 items-baseline gap-2">
            <b className={`truncate text-[22px] font-black tracking-tight sm:text-[26px] ${row.resolved ? '' : 'italic text-white/70'}`}>{opponentName(row)}</b>
            {row.clanTag ? <span className="shrink-0 font-mono text-xs text-slate-300">[{row.clanTag}]</span> : null}
          </div>
          <div className="flex items-center gap-3">
            <span className={`text-[40px] font-black leading-none tabular-nums ${nemesis ? 'text-rose-400' : 'text-emerald-400'}`}>×{row.count}</span>
            <Silhouette weapon={row.topWeapon} onDark className="h-[34px] w-[84px]" />
          </div>
          <span className="text-xs text-slate-300">
            {row.topWeapon ? `au ${weaponLabelOf(labels, row.topWeapon)} · ` : ''}dernière fois {elapsedLabel(row.lastAt, now)}
          </span>
        </>
      ) : (
        <span className="relative text-sm text-slate-300">{emptyText}</span>
      )}
    </article>
  )
}

export function FaceOff({ payload, now, weaponLabel }: { payload: NemesisPayload; now: Date; weaponLabel: string | null }) {
  const nemesis = payload.topKillers[0] ?? null
  const prey = payload.topVictims[0] ?? null
  const revenge = revengeLabel(nemesis)
  const suffix = weaponLabel ? ` au ${weaponLabel}` : ''
  return (
    <section aria-label="Face-à-face" className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_180px_minmax(0,1fr)]">
      <DuelCard row={nemesis} tone="nemesis" now={now} emptyText={`Personne ne t’a éliminé${suffix} sur la période.`} labels={payload.weaponLabels} />
      <article aria-label="Revanche" className="app-panel flex flex-col items-center justify-center gap-1.5 px-4 py-3.5 text-center">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-gray-500">Revanche</span>
        {nemesis ? (
          <>
            <span className="flex items-baseline gap-2 text-4xl font-black leading-none tabular-nums">
              <span className="text-[var(--theme-ui-positive)]">{nemesis.reverseCount}</span>
              <span className="text-xl text-gray-500">–</span>
              <span className="text-[var(--theme-ui-negative)]">{nemesis.count}</span>
            </span>
            <span className="max-w-full truncate text-xs text-gray-500">toi – {opponentName(nemesis)}</span>
            {revenge ? (
              <span
                className={`mt-1 rounded-md px-2 py-0.5 text-[11px] font-extrabold ${revenge.settled ? 'bg-emerald-500/15 text-[var(--theme-ui-positive)]' : 'bg-rose-500/15 text-[var(--theme-ui-negative)]'}`}
                data-testid="revenge"
              >
                {revenge.text}
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-sm text-gray-500">Aucun compte à régler.</span>
        )}
      </article>
      <DuelCard row={prey} tone="prey" now={now} emptyText={`Aucun joueur éliminé${suffix} sur la période.`} labels={payload.weaponLabels} />
    </section>
  )
}

export function Tally({ payload }: { payload: NemesisPayload }) {
  const items = [
    { value: String(payload.playerKills), label: plural(payload.playerKills, 'kill', 'kills'), color: 'var(--theme-ui-positive)' },
    { value: String(payload.playerDeaths), label: plural(payload.playerDeaths, 'mort', 'morts'), color: 'var(--theme-ui-negative)' },
    { value: decimal.format(payload.playerKd), label: 'K/D', color: undefined },
    { value: String(payload.botKillCount), label: plural(payload.botKillCount, 'bot neutralisé', 'bots neutralisés'), color: undefined },
    { value: String(payload.botDeathCount), label: 'fois tué par un bot', color: undefined },
    { value: String(payload.environmentalDeathCount), label: plural(payload.environmentalDeathCount, 'mort par la zone', 'morts par la zone'), color: undefined },
  ]
  return (
    <section aria-label="Bilan" className="app-panel flex flex-wrap items-center gap-x-[22px] gap-y-1.5 px-3.5 py-2.5 text-[13px] tabular-nums text-gray-500">
      {items.map((item) => (
        <span key={item.label}>
          <b className="text-[15px] text-gray-900" style={item.color ? { color: item.color } : undefined}>{item.value}</b> {item.label}
        </span>
      ))}
    </section>
  )
}

// ── Chasseurs et proies ─────────────────────────────────────────────────────────────────────────

function OpponentList({ kind, rows, now, weaponLabel, labels }: { kind: 'hunters' | 'prey'; rows: OpponentRow[]; now: Date; weaponLabel: string | null; labels?: Record<string, string> }) {
  const [page, setPage] = useState(1)
  const { current, pageCount, visible, start } = paginate(rows, page, PAGE_SIZE)
  const hunters = kind === 'hunters'
  const title = hunters ? 'Tes chasseurs' : 'Tes proies'
  const Icon = hunters ? Skull : Target
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${hunters ? 'text-rose-400' : 'text-emerald-400'}`} aria-hidden="true" />
        <h2 className="text-base font-extrabold text-gray-900">{title}</h2>
        <span className="text-xs text-gray-500">{hunters ? 'ils t’ont éliminé' : 'tu les as éliminés'}</span>
        {pageCount > 1 ? (
          <nav className="ml-auto flex items-center gap-0.5" aria-label={`Pages · ${title}`}>
            <button type="button" className="app-pager-button" onClick={() => setPage(current - 1)} disabled={current === 1} aria-label="Page précédente">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="min-w-[28px] text-center text-xs font-bold tabular-nums text-gray-600">{current}/{pageCount}</span>
            <button type="button" className="app-pager-button" onClick={() => setPage(current + 1)} disabled={current === pageCount} aria-label="Page suivante">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </nav>
        ) : null}
      </div>
      <div className="app-panel overflow-hidden">
        {rows.length === 0 ? (
          <p className="px-3 py-4 text-center text-[13px] text-gray-500">{weaponLabel ? `Personne au ${weaponLabel} sur la période.` : 'Personne sur la période.'}</p>
        ) : (
          <ol aria-label={title}>
            {visible.map((row, index) => {
              const me = hunters ? row.reverseCount : row.count
              const them = hunters ? row.count : row.reverseCount
              return (
                <li key={row.key} className="flex items-center gap-2.5 border-t border-gray-200 px-3 py-2 first:border-t-0">
                  <span className="w-[18px] shrink-0 text-right text-[13px] font-black tabular-nums text-gray-500">{start + index + 1}</span>
                  <Silhouette weapon={row.topWeapon} className="h-6 w-14" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <b className={`truncate text-sm ${row.resolved ? 'text-gray-900' : 'italic text-gray-500'}`}>{opponentName(row)}</b>
                      {row.clanTag ? <span className="shrink-0 font-mono text-[11px] text-gray-500">[{row.clanTag}]</span> : null}
                    </span>
                    <span className="truncate text-xs text-gray-500">
                      {row.topWeapon ? `${weaponLabelOf(labels, row.topWeapon)} · ` : ''}
                      {elapsedLabel(row.lastAt, now)}
                    </span>
                  </span>
                  {row.reverseCount > 0 ? (
                    <span
                      className={`shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums ${
                        me >= them ? 'bg-emerald-500/15 text-[var(--theme-ui-positive)]' : 'bg-rose-500/15 text-[var(--theme-ui-negative)]'
                      }`}
                      title={`Toi ${me} – ${them} ${opponentName(row)}`}
                      data-testid="duel-badge"
                    >
                      {me}–{them}
                    </span>
                  ) : null}
                  <span
                    className={`min-w-10 shrink-0 rounded-full px-2 py-0.5 text-center text-[13px] font-black tabular-nums ${
                      hunters ? 'bg-rose-500/15 text-[var(--theme-ui-negative)]' : 'bg-emerald-500/15 text-[var(--theme-ui-positive)]'
                    }`}
                  >
                    ×{row.count}
                  </span>
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}

export function HuntersAndPrey({ payload, now, weaponLabel }: { payload: NemesisPayload; now: Date; weaponLabel: string | null }) {
  const [tab, setTab] = useState<'hunters' | 'prey'>('hunters')
  const small = useIsSmall()
  return (
    <div className="flex min-w-0 flex-col gap-2.5">
      {small ? (
        <div role="group" aria-label="Liste affichée">
          <SegmentedControl
            options={[
              { value: 'hunters', label: 'Chasseurs' },
              { value: 'prey', label: 'Proies' },
            ]}
            value={tab}
            onChange={setTab}
            size="sm"
            fullWidthOnMobile
          />
        </div>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {!small || tab === 'hunters' ? <OpponentList key={`h-${weaponLabel}`} kind="hunters" rows={payload.topKillers} now={now} weaponLabel={weaponLabel} labels={payload.weaponLabels} /> : null}
        {!small || tab === 'prey' ? <OpponentList key={`p-${weaponLabel}`} kind="prey" rows={payload.topVictims} now={now} weaponLabel={weaponLabel} labels={payload.weaponLabels} /> : null}
      </div>
    </div>
  )
}

// ── Death cam ────────────────────────────────────────────────────────────────────────────────────

export function DeathCam({ weapons, labels }: { weapons: NemesisPayload['topDeathWeapons']; labels?: Record<string, string> }) {
  const max = weapons[0]?.count ?? 0
  return (
    <aside aria-label="Death cam" className="app-panel flex flex-col gap-2 p-3.5">
      <div className="flex items-center gap-2">
        <Video className="h-4 w-4 text-rose-400" aria-hidden="true" />
        <h2 className="text-[15px] font-extrabold text-gray-900">Death cam</h2>
        <span className="text-xs text-gray-500">les armes qui t’ont eu</span>
      </div>
      {weapons.length > 0 ? (
        <ol className="flex flex-col gap-2" aria-label="Armes qui t’ont eu">
          {weapons.map((weapon) => (
            <li key={weapon.weaponName} className="flex items-center gap-2.5">
              <Silhouette weapon={weapon.weaponName} className="h-6 w-14" />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex justify-between text-[13px]">
                  <span className="truncate font-semibold text-gray-900">{weaponLabelOf(labels, weapon.weaponName)}</span>
                  <b className="tabular-nums text-gray-900">{weapon.count}</b>
                </span>
                <span className="h-[5px] overflow-hidden rounded-full bg-[var(--theme-ui-surface-strong)]" aria-hidden="true">
                  <span className="block h-full rounded-full bg-rose-400" style={{ width: `${max > 0 ? Math.round((weapon.count / max) * 100) : 0}%` }} />
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-gray-500">Aucune mort par arme sur la période.</p>
      )}
      <span className="mt-1 text-xs text-gray-500">Toujours sur toutes tes morts de la période, même avec un filtre d’arme.</span>
    </aside>
  )
}
