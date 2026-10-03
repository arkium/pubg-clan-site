'use client'

import { ChevronDown, ChevronLeft, ChevronRight, Crosshair, ShieldCheck, Skull, Target, Video } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'

import RankCell from '@/components/ui/RankCell'
import ArmoryWeaponImage from '@/components/weapons/ArmoryWeaponImage'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { revengeLabel, type OpponentRow, type TrackedClanDuel, type TrackedClanInfo } from '@/lib/nemesis'
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
  /** Morts par sa propre main (grenade, véhicule…) : hors classements, comptées à part. */
  suicideCount?: number
  topDeathWeapons: Array<{ weaponName: string; count: number }>
  topKillers: OpponentRow[]
  topVictims: OpponentRow[]
  availableWeapons: string[]
  selectedWeapon: string | null
  /** Libellé de chaque arme renvoyée, calculé par la route. */
  weaponLabels?: Record<string, string>
  /** Duels contre les autres clans suivis (carte « Clans suivis »). */
  trackedDuels?: { killCount: number; deathCount: number; recentKills: TrackedClanDuel[]; recentDeaths: TrackedClanDuel[] }
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

/**
 * Écusson d'un joueur d'un clan suivi par le site : bouclier + tag, à l'accent. `onDark` : sur les cartes de duel (fond
 * toujours sombre). Sans écusson, le tag PUBG reste en gris : joueur extérieur au site.
 */
function TrackedClanBadge({ tracked, onDark = false }: { tracked: TrackedClanInfo; onDark?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--theme-ui-accent-ring)] bg-[var(--theme-ui-accent-soft)] px-1.5 py-px text-[11px] font-extrabold ${
        onDark ? 'text-[var(--theme-ui-accent)]' : 'text-[var(--theme-ui-accent-text)]'
      }`}
      title={tracked.sameClan ? `Ton clan : ${tracked.clanName}` : `Clan suivi par le site : ${tracked.clanName}`}
      data-testid="tracked-clan"
    >
      <ShieldCheck className="h-3 w-3" aria-hidden="true" />
      {/* « Ton clan » : le bouclier seul sous 640 px, la place va au nom (le titre reste au survol et pour l'accessibilité). */}
      {tracked.sameClan ? <span className="sr-only sm:not-sr-only">Ton clan</span> : tracked.clanTag}
    </span>
  )
}

/** Tag du joueur : écusson s'il est d'un clan suivi, sinon le tag PUBG en gris. */
function ClanMark({ row, onDark = false }: { row: Pick<OpponentRow, 'clanTag' | 'tracked'>; onDark?: boolean }) {
  if (row.tracked) return <TrackedClanBadge tracked={row.tracked} onDark={onDark} />
  if (!row.clanTag) return null
  return <span className={`shrink-0 font-mono text-[11px] ${onDark ? 'text-slate-300' : 'text-gray-500'}`}>[{row.clanTag}]</span>
}

/** Nom d'un adversaire : lien vers sa page s'il est du même clan (les pages joueur ne s'ouvrent qu'au même clan). */
function OpponentName({ name, tracked, className }: { name: string; tracked: TrackedClanInfo | null | undefined; className: string }) {
  if (tracked?.sameClan) {
    return (
      <Link href={`/members/${tracked.memberId}/dashboard`} className={`app-link ${className}`}>
        {name}
      </Link>
    )
  }
  return <b className={className}>{name}</b>
}

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
    // Étiré à la hauteur de la ligne du bandeau : même hauteur que le segmented voisin.
    <div ref={rootRef} className="relative ml-auto flex min-w-0 self-stretch">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Arme : ${active ? label(value) : 'toutes les armes'}`}
        className={`app-menu-trigger max-w-full ${active ? 'app-menu-trigger--active' : ''}`}
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
        <div role="menu" aria-label="Arme" className="app-menu absolute right-0 top-full z-50 mt-1.5 w-[230px]">
          <button type="button" role="menuitemradio" aria-checked={!active} onClick={() => choose(null)} className={`app-menu__item justify-start gap-2.5 ${!active ? 'app-menu__item--active' : ''}`}>
            <span className="h-[22px] w-11 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-left">Toutes les armes</span>
          </button>
          {weapons.map((weapon) => (
            <button
              key={weapon}
              type="button"
              role="menuitemradio"
              aria-checked={value === weapon}
              onClick={() => choose(weapon)}
              className={`app-menu__item justify-start gap-2.5 ${value === weapon ? 'app-menu__item--active' : ''}`}
            >
              <Silhouette weapon={weapon} className="h-[22px] w-11" />
              <span className="min-w-0 flex-1 truncate text-left">{label(weapon)}</span>
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
      className={`duel-card ${nemesis ? 'duel-card--nemesis' : 'duel-card--prey'} relative flex min-w-0 flex-col gap-2.5 overflow-hidden border p-4`}
    >
      <Icon className="duel-card__icon absolute -right-7 -top-7 h-36 w-36 opacity-[0.12]" aria-hidden="true" />
      <span className="duel-card__eyebrow text-[11px] font-black tracking-[0.18em]">
        {nemesis ? 'TON NÉMÉSIS · T’A ÉLIMINÉ' : 'TA PROIE FAVORITE · TU L’AS ÉLIMINÉ'}
      </span>
      {row ? (
        <>
          <div className="flex min-w-0 items-baseline gap-2">
            <OpponentName name={opponentName(row)} tracked={row.tracked} className={`truncate text-[22px] font-black tracking-tight sm:text-[26px] ${row.resolved ? '' : 'italic text-white/70'}`} />
            <ClanMark row={row} onDark />
          </div>
          <div className="flex items-center gap-3">
            <span className="duel-card__count t-hero t-hero--lg">×{row.count}</span>
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
        <span className="t-label">Revanche</span>
        {nemesis ? (
          <>
            <span className="t-hero t-hero--lg flex items-baseline gap-2">
              <span className="text-[var(--theme-ui-positive)]">{nemesis.reverseCount}</span>
              <span className="text-xl text-gray-500">–</span>
              <span className="text-[var(--theme-ui-negative)]">{nemesis.count}</span>
            </span>
            <span className="t-meta max-w-full truncate">toi – {opponentName(nemesis)}</span>
            {revenge ? (
              <span
                className={`mt-1 rounded-md px-2 py-0.5 text-[11px] font-extrabold ${revenge.settled ? 'bg-[color-mix(in_srgb,var(--theme-ui-positive)_15%,transparent)] t-pos' : 'bg-[color-mix(in_srgb,var(--theme-ui-negative)_15%,transparent)] t-neg'}`}
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
    { value: String(payload.playerKills), label: plural(payload.playerKills, 'kill', 'kills'), tone: 't-pos' },
    { value: String(payload.playerDeaths), label: plural(payload.playerDeaths, 'mort', 'morts'), tone: 't-neg' },
    { value: decimal.format(payload.playerKd), label: 'K/D', tone: 'text-gray-900' },
    { value: String(payload.botKillCount), label: plural(payload.botKillCount, 'bot neutralisé', 'bots neutralisés'), tone: 'text-gray-900' },
    { value: String(payload.botDeathCount), label: 'fois tué par un bot', tone: 'text-gray-900' },
    { value: String(payload.environmentalDeathCount), label: plural(payload.environmentalDeathCount, 'mort par la zone', 'morts par la zone'), tone: 'text-gray-900' },
    { value: String(payload.suicideCount ?? 0), label: plural(payload.suicideCount ?? 0, 'suicide', 'suicides'), tone: 'text-gray-900' },
  ]
  return (
    <section aria-label="Bilan" className="app-panel t-num flex flex-wrap items-center gap-x-[22px] gap-y-1.5 px-3.5 py-2.5 text-[13px] text-gray-500">
      {items.map((item) => (
        <span key={item.label}>
          <b className={`text-[15px] ${item.tone}`}>{item.value}</b> {item.label}
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
        <Icon className={`h-4 w-4 ${hunters ? 't-neg' : 't-pos'}`} aria-hidden="true" />
        <h2 className="t-card-title">{title}</h2>
        <span className="t-meta">{hunters ? 'ils t’ont éliminé' : 'tu les as éliminés'}</span>
        {pageCount > 1 ? (
          <nav className="ml-auto flex items-center gap-0.5" aria-label={`Pages · ${title}`}>
            <button type="button" className="app-pager-button" onClick={() => setPage(current - 1)} disabled={current === 1} aria-label="Page précédente">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <span className="t-num min-w-[28px] text-center text-xs font-bold text-gray-600">{current}/{pageCount}</span>
            <button type="button" className="app-pager-button" onClick={() => setPage(current + 1)} disabled={current === pageCount} aria-label="Page suivante">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </nav>
        ) : null}
      </div>
      <div className="app-panel overflow-hidden">
        {rows.length === 0 ? (
          <p className="t-body px-3 py-4 text-center text-gray-500">{weaponLabel ? `Personne au ${weaponLabel} sur la période.` : 'Personne sur la période.'}</p>
        ) : (
          <ol aria-label={title}>
            {visible.map((row, index) => {
              const me = hunters ? row.reverseCount : row.count
              const them = hunters ? row.count : row.reverseCount
              return (
                <li key={row.key} className="flex items-center gap-2.5 border-t border-gray-200 px-3 py-2 first:border-t-0">
                  <span className="flex w-5 shrink-0 justify-center"><RankCell rank={start + index + 1} size="xs" /></span>
                  <Silhouette weapon={row.topWeapon} className="h-6 w-14" />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <OpponentName name={opponentName(row)} tracked={row.tracked} className={`truncate text-sm font-bold ${row.resolved ? 'text-gray-900' : 'italic text-gray-500'}`} />
                      <ClanMark row={row} />
                    </span>
                    <span className="t-meta truncate">
                      {row.topWeapon ? `${weaponLabelOf(labels, row.topWeapon)} · ` : ''}
                      {elapsedLabel(row.lastAt, now)}
                    </span>
                  </span>
                  {row.reverseCount > 0 ? (
                    <span
                      className={`shrink-0 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-extrabold tabular-nums ${
                        me >= them ? 'bg-[color-mix(in_srgb,var(--theme-ui-positive)_15%,transparent)] t-pos' : 'bg-[color-mix(in_srgb,var(--theme-ui-negative)_15%,transparent)] t-neg'
                      }`}
                      title={`Toi ${me} – ${them} ${opponentName(row)}`}
                      data-testid="duel-badge"
                    >
                      {me}–{them}
                    </span>
                  ) : null}
                  <span
                    className={`min-w-10 shrink-0 rounded-full px-2 py-0.5 text-center text-[13px] font-black tabular-nums ${
                      hunters ? 'bg-[color-mix(in_srgb,var(--theme-ui-negative)_15%,transparent)] t-neg' : 'bg-[color-mix(in_srgb,var(--theme-ui-positive)_15%,transparent)] t-pos'
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

// ── Clans suivis ─────────────────────────────────────────────────────────────────────────────────

/** Une liste de la carte : les 3 derniers joueurs (distincts) éliminés, ou les 3 derniers à t'avoir eu. */
function TrackedDuelList({ duels, tone, now, labels }: { duels: TrackedClanDuel[]; tone: 'kill' | 'death'; now: Date; labels?: Record<string, string> }) {
  const kill = tone === 'kill'
  const title = kill ? 'Derniers éliminés' : 'Derniers à t’avoir eu'
  return (
    <div className="flex flex-col gap-1.5" data-testid={kill ? 'tracked-recent-kills' : 'tracked-recent-deaths'}>
      <span className={`t-label ${kill ? 't-pos' : 't-neg'}`}>{title}</span>
      {duels.length > 0 ? (
        <ol className="flex flex-col gap-2" aria-label={title}>
          {duels.map((duel) => (
            <li key={duel.key} className="flex items-center gap-2.5">
              <Silhouette weapon={duel.weapon} className="h-6 w-14" />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-1.5">
                  <OpponentName name={duel.name} tracked={duel.tracked} className="truncate text-sm font-bold text-gray-900" />
                  <TrackedClanBadge tracked={duel.tracked} />
                </span>
                <span className="t-meta truncate">
                  {duel.weapon ? `${weaponLabelOf(labels, duel.weapon)} · ` : ''}
                  {elapsedLabel(duel.at, now)}
                </span>
              </span>
              <span
                className={`t-num min-w-9 shrink-0 rounded-full px-2 py-0.5 text-center text-[13px] font-black ${
                  kill ? 'bg-[color-mix(in_srgb,var(--theme-ui-positive)_15%,transparent)] t-pos' : 'bg-[color-mix(in_srgb,var(--theme-ui-negative)_15%,transparent)] t-neg'
                }`}
                title={`${duel.count} fois sur la période`}
              >
                ×{duel.count}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <span className="t-meta">{kill ? 'Aucun joueur d’un autre clan suivi éliminé.' : 'Aucun joueur d’un autre clan suivi ne t’a eu.'}</span>
      )}
    </div>
  )
}

/** Duels récents contre les autres clans suivis par le site : les 3 derniers éliminés, les 3 derniers à t'avoir eu, les totaux. */
export function TrackedClans({ duels, now, labels }: { duels: NemesisPayload['trackedDuels']; now: Date; labels?: Record<string, string> }) {
  return (
    <aside aria-label="Clans suivis" className="app-panel flex flex-col gap-3 p-3.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <ShieldCheck className="h-4 w-4 text-[var(--theme-ui-accent-text)]" aria-hidden="true" />
        <h2 className="t-card-title whitespace-nowrap">Clans suivis</h2>
        <span className="t-meta">tes derniers duels contre les autres clans du site</span>
      </div>
      <TrackedDuelList duels={duels?.recentKills ?? []} tone="kill" now={now} labels={labels} />
      <TrackedDuelList duels={duels?.recentDeaths ?? []} tone="death" now={now} labels={labels} />
      <span className="t-meta t-num mt-auto border-t border-gray-200 pt-2.5" data-testid="tracked-totals">
        Sur la période : <b className="t-pos">{duels?.killCount ?? 0}</b> {(duels?.killCount ?? 0) > 1 ? 'kills' : 'kill'} ·{' '}
        <b className="t-neg">{duels?.deathCount ?? 0}</b> {(duels?.deathCount ?? 0) > 1 ? 'morts' : 'mort'} contre les clans suivis, quelle que soit l’arme choisie.
      </span>
    </aside>
  )
}

// ── Death cam ────────────────────────────────────────────────────────────────────────────────────

export function DeathCam({ weapons, labels }: { weapons: NemesisPayload['topDeathWeapons']; labels?: Record<string, string> }) {
  const max = weapons[0]?.count ?? 0
  return (
    <aside aria-label="Death cam" className="app-panel flex flex-col gap-2 p-3.5">
      <div className="flex items-center gap-2">
        <Video className="h-4 w-4 t-neg" aria-hidden="true" />
        <h2 className="t-card-title">Death cam</h2>
        <span className="t-meta">les armes qui t’ont eu</span>
      </div>
      {weapons.length > 0 ? (
        <ol className="flex flex-col gap-2" aria-label="Armes qui t’ont eu">
          {weapons.map((weapon) => (
            <li key={weapon.weaponName} className="flex items-center gap-2.5">
              <Silhouette weapon={weapon.weaponName} className="h-6 w-14" />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex justify-between text-[13px]">
                  <span className="truncate font-semibold text-gray-900">{weaponLabelOf(labels, weapon.weaponName)}</span>
                  <b className="t-num text-gray-900">{weapon.count}</b>
                </span>
                <span className="h-[5px] overflow-hidden rounded-full bg-[var(--theme-ui-surface-strong)]" aria-hidden="true">
                  <span className="block h-full rounded-full bg-[var(--game-neg)]" style={{ width: `${max > 0 ? Math.round((weapon.count / max) * 100) : 0}%` }} />
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="t-body text-gray-500">Aucune mort par arme sur la période.</p>
      )}
      <span className="t-meta mt-1">Toutes tes morts de la période, quelle que soit l’arme choisie.</span>
    </aside>
  )
}
