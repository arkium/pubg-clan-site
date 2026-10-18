'use client'

import { Crown, GitCompareArrows, Info, Plus, Search, Sigma, User, Users, X } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

import { comparatorSlot, slotInk } from '@/components/comparator/ComparatorUi'
import PlayersRadar, { SLOT_DASHES } from '@/components/players/PlayersRadar'
import { PlayerAvatar, PlayerName, useDismiss } from '@/components/players/PlayersUi'
import WeaponIcon from '@/components/ui/WeaponIcon'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { usePageData } from '@/hooks/usePageData'
import { PERIOD_WHEN_LABELS, type StandardPeriod } from '@/lib/period'
import {
  COMPARISON_SECTIONS,
  MAX_COMPARED,
  PLAYER_ROLES,
  bestSlots,
  comparisonReading,
  filterPlayers,
  searchKey,
  type PlayerRankingEntry,
  type PlayersMode,
} from '@/lib/players-ranking'
import type { ComparedSlot, PlayersComparisonPayload } from '@/lib/players-ranking-service'

/**
 * Onglet « Comparateur » de la page Joueurs (maquette « Joueurs », états 7 à 11 ; docs/features/joueurs.md) : deux ou
 * trois éléments — joueurs ou moyenne d'un clan —, choisis par recherche, raccourcis (« Moi », « Un coéquipier »,
 * « La moyenne de mon clan ») ou cases du classement. Couleurs de slot du comparateur de clans (P1 bleu, P2 orange,
 * P3 émeraude, docs/ui/index.html#comparateur) au lieu du jaune / bleu / blanc de la maquette : le jaune est réservé à
 * l'accent et au meilleur (couronne). Sélection dans l'URL (`?tab=compare&ids=12,34,clan-5`).
 */

const pickComparison = (payload: unknown) => (payload as PlayersComparisonPayload | null) ?? null
const shortDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' })
const longDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Paris' })

/** Grille du tableau : libellé puis une colonne par élément ; sur mobile, le libellé passe au-dessus des valeurs. */
const GRID: Record<2 | 3, { row: string; label: string }> = {
  2: { row: 'grid grid-cols-2 sm:grid-cols-[minmax(9rem,1.2fr)_repeat(2,minmax(0,1fr))]', label: 'col-span-2 sm:col-span-1' },
  3: { row: 'grid grid-cols-3 sm:grid-cols-[minmax(9rem,1.2fr)_repeat(3,minmax(0,1fr))]', label: 'col-span-3 sm:col-span-1' },
}

type ClanOption = { clanId: number; name: string; tag: string }

function SlotPicker({
  index,
  candidates,
  clans,
  exclude,
  onPick,
  myEntry,
  myClan,
}: {
  index: number
  candidates: PlayerRankingEntry[]
  clans: ClanOption[]
  exclude: string[]
  onPick: (key: string) => void
  myEntry: PlayerRankingEntry | null
  myClan: ClanOption | null
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, rootRef, close)

  const key = searchKey(query)
  const players = key === '' ? [] : filterPlayers(candidates, query, null).filter((entry) => !exclude.includes(String(entry.memberId))).slice(0, 8)
  const clanMatches =
    key === '' ? [] : clans.filter((clan) => !exclude.includes(`clan-${clan.clanId}`) && (searchKey(clan.name).includes(key) || searchKey(clan.tag) === key)).slice(0, 3)
  const pick = (value: string) => {
    onPick(value)
    setQuery('')
    setOpen(false)
  }
  const label = `Joueur ${index + 1}`
  return (
    <div ref={rootRef} className="relative flex flex-col gap-2 rounded-[14px] border border-dashed border-gray-200 p-3" data-testid={`compare-picker-${index + 1}`}>
      <span className="t-label">{label}</span>
      <label className="app-toolbar-search">
        <Search className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder="Pseudo du joueur"
          aria-label={`${label} : pseudo, clan ou tag`}
        />
      </label>
      {open && (players.length > 0 || clanMatches.length > 0) ? (
        <div role="menu" aria-label={`Suggestions pour le ${label.toLowerCase()}`} className="app-menu absolute inset-x-3 top-[5.25rem] z-50 max-h-[min(60vh,24rem)] overflow-y-auto">
          {players.map((entry) => (
            <button key={entry.memberId} type="button" role="menuitem" onClick={() => pick(String(entry.memberId))} className="app-menu__item">
              <PlayerAvatar name={entry.name} size={22} />
              <span className="min-w-0 truncate font-semibold">{entry.name}</span>
              <span className="shrink-0 font-mono text-[11px] opacity-75">[{entry.clanTag}]</span>
              <span className="t-num ml-auto shrink-0 text-[11px] opacity-75">{entry.matches} p.</span>
            </button>
          ))}
          {clanMatches.map((clan) => (
            <button key={clan.clanId} type="button" role="menuitem" onClick={() => pick(`clan-${clan.clanId}`)} className="app-menu__item">
              <Sigma className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate font-semibold">Moyenne {clan.name}</span>
              <span className="shrink-0 font-mono text-[11px] opacity-75">[{clan.tag}]</span>
            </button>
          ))}
        </div>
      ) : null}
      {myEntry || myClan ? (
        <div className="flex flex-wrap gap-1.5">
          {myEntry && !exclude.includes(String(myEntry.memberId)) ? (
            <button type="button" onClick={() => pick(String(myEntry.memberId))} className="app-toolbar-btn">
              <User className="h-3.5 w-3.5" aria-hidden="true" />
              Moi
            </button>
          ) : null}
          {myClan ? (
            <button
              type="button"
              onClick={() => {
                // Le tag du clan liste ses joueurs (recherche exacte sur le tag) : on choisit ensuite dans la liste.
                setQuery(myClan.tag)
                setOpen(true)
                inputRef.current?.focus()
              }}
              className="app-toolbar-btn"
            >
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              Un coéquipier
            </button>
          ) : null}
          {myClan && !exclude.includes(`clan-${myClan.clanId}`) ? (
            <button type="button" onClick={() => pick(`clan-${myClan.clanId}`)} className="app-toolbar-btn">
              <Sigma className="h-3.5 w-3.5" aria-hidden="true" />
              La moyenne de mon clan
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function SlotCard({ index, name, subtitle, isClan, onRemove }: { index: number; name: string; subtitle: string; isClan: boolean; onRemove: () => void }) {
  const slot = comparatorSlot(index)
  return (
    <div className="app-panel flex min-w-0 items-center gap-2.5 p-3 shadow-[inset_3px_0_0_var(--slot)]" style={{ ['--slot' as string]: slot.hex }} data-testid={`compare-slot-${index + 1}`}>
      {isClan ? (
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--theme-ui-surface-strong)] text-gray-900" aria-hidden="true">
          <Sigma className="h-4 w-4" />
        </span>
      ) : (
        <PlayerAvatar name={name} size={32} />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="truncate text-sm text-gray-900">{name}</b>
        <span className="truncate text-xs text-gray-500">{subtitle}</span>
      </span>
      <button type="button" onClick={onRemove} aria-label={`Retirer ${name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-gray-500 transition hover:bg-gray-50 hover:text-gray-900">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}

function slotSubtitle(slot: ComparedSlot | null, fallback: { clanName: string; matches: number } | null) {
  if (slot?.kind === 'clan') return `${slot.players ?? 0} joueur${(slot.players ?? 0) > 1 ? 's' : ''} · ${slot.matches} parties`
  const source = slot ?? fallback
  return source ? `${source.clanName} · ${source.matches} partie${source.matches > 1 ? 's' : ''}` : ''
}

function ComparisonTable({ data, periodWhen, canOpen }: { data: PlayersComparisonPayload; periodWhen: string; canOpen: (clanId: number) => boolean }) {
  const count = (data.slots.length === 3 ? 3 : 2) as 2 | 3
  const grid = GRID[count]
  const eligible = data.slots.map((slot) => slot.qualified)
  return (
    <section aria-label="Comparaison" className="app-table-shell overflow-hidden text-[13px]">
      <div className={`${grid.row} border-b border-gray-200`}>
        <div className="hidden sm:block" />
        {data.slots.map((slot, index) => {
          const favourite = slot.weapons[0] ?? null
          return (
            <div
              key={slot.key}
              className="flex min-w-0 flex-col gap-0.5 border-t-[3px] px-2.5 py-3 sm:px-3"
              style={{ borderTopColor: comparatorSlot(index).hex }}
              data-testid={`compare-head-${index + 1}`}
            >
              {slot.kind === 'player' && slot.memberId !== null ? (
                <span className="flex min-w-0">
                  <PlayerName name={slot.name} memberId={slot.memberId} canOpen={canOpen(slot.clanId)} className="max-w-full truncate" />
                </span>
              ) : (
                <b className="truncate text-sm text-gray-900">{slot.name}</b>
              )}
              <span className="truncate text-xs text-gray-500">
                [{slot.clanTag}] {slot.clanName}
              </span>
              <span className={`text-xs ${slot.qualified ? 'text-gray-600' : 'font-semibold text-[var(--game-warn)]'}`}>
                {slot.kind === 'clan'
                  ? `Moyenne de ${slot.players ?? 0} joueurs · ${slot.matches} parties jouées ${periodWhen}`
                  : `${slot.matches} partie${slot.matches > 1 ? 's' : ''} ${periodWhen}`}
              </span>
              {favourite ? (
                // Sous 640 px, trois colonnes étroites : la ligne de l'arme laisse la place aux chiffres.
                <span className="hidden min-w-0 items-center gap-1.5 text-xs text-gray-600 sm:flex">
                  <WeaponIcon id={favourite.iconId} label={favourite.name} size="sm" className="w-10!" />
                  <span className="truncate">Arme la plus jouée : {favourite.name}</span>
                </span>
              ) : null}
            </div>
          )
        })}
      </div>
      {COMPARISON_SECTIONS.map((section) => (
        <div key={section.id} role="group" aria-label={section.title}>
          <div className="app-table-head flex items-baseline gap-2 px-3 py-1.5">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.12em]">{section.title}</span>
            {section.note ? <span className="text-[11px] normal-case">· agrégats de la période, {section.note}</span> : null}
          </div>
          {section.rows.map((row) => {
            const values = data.slots.map((slot) => slot.values[row.metric])
            const best = bestSlots(values, row.better, eligible)
            return (
              <div key={row.metric} className={`${grid.row} border-b border-gray-200 last:border-b-0`} data-testid={`compare-row-${row.metric}`}>
                <div className={`${grid.label} flex flex-col justify-center px-3 pb-0 pt-2 sm:py-2`}>
                  <span className="font-semibold text-gray-900">{row.label}</span>
                  {row.hint ? <span className="text-[11px] text-gray-500">{row.hint}</span> : null}
                </div>
                {values.map((value, index) => {
                  const isBest = best.has(index)
                  return (
                    <div
                      key={data.slots[index].key}
                      className={`t-num flex items-center gap-1.5 px-2.5 py-2 sm:px-3 ${isBest ? 'bg-[var(--theme-ui-accent-soft)]' : ''} ${eligible[index] ? '' : 'opacity-60'}`}
                    >
                      {isBest ? <Crown className="h-3.5 w-3.5 shrink-0 text-[var(--theme-ui-accent-text)]" aria-label="Meilleur" /> : null}
                      <span className={`text-[15px] font-extrabold ${isBest ? 'text-[var(--theme-ui-accent-text)]' : 'text-gray-900'}`}>{value !== null ? row.format(value) : '—'}</span>
                      {isBest ? <span className="hidden text-[11px] font-bold text-[var(--theme-ui-accent-text)] sm:inline">meilleur</span> : null}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      ))}
      <div role="group" aria-label="Armes">
        <div className="app-table-head flex items-baseline gap-2 px-3 py-1.5">
          <span className="text-[11px] font-extrabold uppercase tracking-[0.12em]">Armes</span>
          <span className="text-[11px] normal-case">· agrégats de la période, tous modes</span>
        </div>
        <div className={grid.row} data-testid="compare-row-weapons">
          <div className={`${grid.label} flex flex-col justify-center px-3 pb-0 pt-2 sm:py-2`}>
            <span className="font-semibold text-gray-900">Les 3 plus jouées</span>
            <span className="text-[11px] text-gray-500">précision · kills</span>
          </div>
          {data.slots.map((slot, index) => (
            <ul key={slot.key} className={`flex min-w-0 flex-col gap-1.5 px-2.5 py-2 sm:px-3 ${eligible[index] ? '' : 'opacity-60'}`}>
              {slot.weapons.length === 0 ? <li className="text-gray-500">—</li> : null}
              {slot.weapons.map((weapon) => (
                <li key={weapon.id} className="flex min-w-0 items-center gap-1.5">
                  <WeaponIcon id={weapon.iconId} label={weapon.name} size="md" className="hidden w-12! sm:block" />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <b className="truncate text-xs text-gray-900">{weapon.name}</b>
                    <span className="truncate text-[11px] text-gray-500">
                      {weapon.accuracy !== null ? `${Math.round(weapon.accuracy)} % préc. · ` : ''}
                      {weapon.kills} kill{weapon.kills > 1 ? 's' : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </section>
  )
}

function DuelsCard({ data }: { data: PlayersComparisonPayload }) {
  const slotOf = (key: string) => data.slots.findIndex((slot) => slot.key === key)
  return (
    <section aria-labelledby="duels-title" className="app-panel flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <h3 id="duels-title" className="t-card-title">
          Duels directs
        </h3>
        <span className="t-meta">depuis le début, tous modes</span>
      </div>
      {data.duels.length === 0 ? <p className="text-sm text-gray-600">Pas de duels avec une moyenne de clan.</p> : null}
      {data.duels.map((duel) => {
        const a = data.slots[slotOf(duel.a)]
        const b = data.slots[slotOf(duel.b)]
        if (!a || !b) return null
        const total = duel.aKills + duel.bKills
        const winner = duel.last ? data.slots[slotOf(duel.last.killer)] : null
        const loser = winner === a ? b : a
        const date = duel.last ? new Date(duel.last.date) : null
        return (
          <div key={`${duel.a}-${duel.b}`} className="flex flex-col gap-1.5 rounded-[10px] bg-[var(--theme-ui-surface-soft)] p-3" data-testid="duel">
            <b className="text-sm text-gray-900">
              {a.name} et {b.name}
              {total > 0 ? ` · ${total} élimination${total > 1 ? 's' : ''}` : ''}
            </b>
            {total === 0 ? (
              <p className="text-sm text-gray-600">Ces joueurs ne se sont jamais croisés.</p>
            ) : (
              <>
                <div className="flex items-center gap-2 text-xs font-bold">
                  <span className="t-num whitespace-nowrap" style={{ color: slotInk(comparatorSlot(slotOf(duel.a))) }}>
                    {a.name} {duel.aKills}
                  </span>
                  <span className="flex h-2 flex-1 overflow-hidden rounded-full bg-[var(--theme-ui-surface-strong)]" aria-hidden="true">
                    <span style={{ width: `${(duel.aKills / total) * 100}%`, backgroundColor: comparatorSlot(slotOf(duel.a)).hex }} />
                    <span style={{ width: `${(duel.bKills / total) * 100}%`, backgroundColor: comparatorSlot(slotOf(duel.b)).hex }} />
                  </span>
                  <span className="t-num whitespace-nowrap" style={{ color: slotInk(comparatorSlot(slotOf(duel.b))) }}>
                    {duel.bKills} {b.name}
                  </span>
                </div>
                {duel.last && date && winner ? (
                  <p className="text-xs text-gray-600">
                    Dernière rencontre : {(date.getFullYear() === new Date().getFullYear() ? shortDate : longDate).format(date)}, {duel.last.mapName}. {winner.name} a éliminé {loser.name}.
                  </p>
                ) : null}
              </>
            )}
          </div>
        )
      })}
    </section>
  )
}

export default function PlayersComparator({
  candidates,
  clans,
  keys,
  onKeys,
  period,
  mode,
  myMemberId,
  myClan,
  canOpen,
  onPickInRanking,
}: {
  /** Joueurs qui ont joué sur la période (classés et en qualification) : la recherche des emplacements. */
  candidates: PlayerRankingEntry[]
  clans: ClanOption[]
  keys: string[]
  onKeys: (keys: string[]) => void
  period: StandardPeriod
  mode: PlayersMode
  myMemberId: number | null
  myClan: ClanOption | null
  canOpen: (clanId: number) => boolean
  onPickInRanking: () => void
}) {
  const [extraOpen, setExtraOpen] = useState(false)
  const periodWhen = PERIOD_WHEN_LABELS[period]
  const ready = keys.length >= 2
  const { data, loading, error } = usePageData(ready ? `/api/players/compare?ids=${keys.join(',')}&period=${period}&mode=${mode}` : null, pickComparison)
  // Réponse d'une autre sélection (pendant un rechargement) : les en-têtes suivent l'URL, les chiffres sont estompés.
  const slotsByKey = new Map((data?.slots ?? []).map((slot) => [slot.key, slot]))
  const myEntry = myMemberId !== null ? (candidates.find((entry) => entry.memberId === myMemberId) ?? null) : null
  const slotCount = keys.length >= MAX_COMPARED ? MAX_COMPARED : keys.length < 2 ? 2 : extraOpen ? 3 : 2

  const remove = (key: string) => onKeys(keys.filter((entry) => entry !== key))
  const add = (key: string) => {
    if (!keys.includes(key)) onKeys([...keys, key].slice(0, MAX_COMPARED))
    setExtraOpen(false)
  }

  const reading = data ? comparisonReading(data.slots.map((slot) => ({ name: slot.name, values: slot.values, qualified: slot.qualified, matches: slot.matches }))) : []

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="grid gap-2.5 sm:grid-cols-3" aria-label="Éléments comparés">
        {Array.from({ length: slotCount }, (_, index) => {
          const key = keys[index]
          if (key) {
            const slot = slotsByKey.get(key) ?? null
            const clan = key.startsWith('clan-') ? (clans.find((entry) => `clan-${entry.clanId}` === key) ?? null) : null
            const entry = clan ? null : (candidates.find((candidate) => String(candidate.memberId) === key) ?? null)
            const name = slot?.name ?? (clan ? `Moyenne ${clan.name}` : (entry?.name ?? `Joueur ${key}`))
            return (
              <SlotCard
                key={key}
                index={index}
                name={name}
                isClan={Boolean(clan) || slot?.kind === 'clan'}
                subtitle={slotSubtitle(slot, entry ? { clanName: entry.clanName, matches: entry.matches } : null)}
                onRemove={() => remove(key)}
              />
            )
          }
          return <SlotPicker key={`picker-${index}`} index={index} candidates={candidates} clans={clans} exclude={keys} onPick={add} myEntry={myEntry} myClan={myClan} />
        })}
        {slotCount < MAX_COMPARED && keys.length >= 2 ? (
          <button
            type="button"
            onClick={() => setExtraOpen(true)}
            className="flex min-h-[4.5rem] items-center justify-center gap-2 rounded-[14px] border border-dashed border-gray-200 p-3 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 hover:text-gray-900"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Ajouter un 3e joueur
          </button>
        ) : null}
      </div>

      {!ready ? (
        <section className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-gray-200 px-4 py-8 text-center" data-testid="compare-empty">
          <span className="grid h-10 w-10 place-items-center rounded-[10px] bg-[var(--theme-ui-surface-strong)] text-gray-600" aria-hidden="true">
            <GitCompareArrows className="h-5 w-5" />
          </span>
          <h2 className="t-card-title">Choisis au moins deux joueurs</h2>
          <p className="max-w-md text-sm text-gray-600">
            Cherche un pseudo{myEntry ? ', utilise « Moi » ou « Un coéquipier »,' : ''} ou compare un joueur à la moyenne d’un clan. Tu peux aussi cocher jusqu’à {MAX_COMPARED} joueurs dans le classement.
          </p>
          <button type="button" onClick={onPickInRanking} className="app-toolbar-btn mt-1">
            Choisir dans le classement
          </button>
        </section>
      ) : null}

      {ready && error ? <p className="app-panel p-4 text-sm text-[var(--theme-ui-negative)]">{error}</p> : null}
      {ready && !data && loading ? <CardSkeleton /> : null}

      {ready && data ? (
        <div className={`flex flex-col gap-4 transition-opacity sm:gap-5 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
          {data.slots
            .filter((slot) => !slot.qualified)
            .map((slot) => (
              <p key={slot.key} className="app-panel-muted flex items-start gap-2 p-3 text-sm text-gray-700" data-testid="compare-unqualified">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" aria-hidden="true" />
                {slot.name} a {slot.matches} partie{slot.matches > 1 ? 's' : ''} de clan {periodWhen} : moins de {data.minMatches}, ses chiffres sont indicatifs et n’entrent pas dans la mise en
                évidence des meilleures valeurs.
              </p>
            ))}
          <ComparisonTable data={data} periodWhen={periodWhen} canOpen={canOpen} />
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <section aria-labelledby="roles-title" className="app-panel flex flex-col gap-3 p-4">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h3 id="roles-title" className="t-card-title">
                  Profil par rôle
                </h3>
                <span className="t-meta">score de 0 à 100, entre tous les clans</span>
              </div>
              <div className="flex flex-col items-center gap-3">
                <PlayersRadar slots={data.slots} />
                <table className="w-full table-fixed text-xs" aria-label="Scores par rôle">
                  <thead className="text-gray-500">
                    <tr>
                      <th className="w-[40%] py-1 text-left font-semibold">
                        <span className="sr-only">Élément comparé</span>
                      </th>
                      {PLAYER_ROLES.map((role) => (
                        <th key={role.id} className="px-1 py-1 text-right font-semibold">
                          {role.id === 'sniper' ? 'Tireur' : role.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.slots.map((slot, index) => (
                      <tr key={slot.key} className="border-t border-gray-200">
                        <td className="py-1.5">
                          <span className="flex min-w-0 items-center gap-2">
                            <svg width="22" height="6" className="shrink-0" aria-hidden="true">
                              <line x1="1" y1="3" x2="21" y2="3" stroke={comparatorSlot(index).hex} strokeWidth="2.5" strokeDasharray={SLOT_DASHES[index] || undefined} />
                            </svg>
                            <b className="truncate text-gray-900">{slot.name}</b>
                          </span>
                        </td>
                        {PLAYER_ROLES.map((role) => (
                          <td key={role.id} className="t-num px-1 py-1.5 text-right font-bold text-gray-900">
                            {slot.roles[role.id] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <div className="flex flex-col gap-4">
              <DuelsCard data={data} />
              <section aria-labelledby="reading-title" className="app-panel flex flex-col gap-2.5 p-4">
                <h3 id="reading-title" className="t-card-title">
                  Lecture
                </h3>
                <ul className="flex flex-col gap-2" data-testid="compare-reading">
                  {data.slots.map((slot, index) => (
                    <li key={slot.key} className="border-l-[3px] pl-2.5 text-sm text-gray-700" style={{ borderLeftColor: comparatorSlot(index).hex }}>
                      <b className="text-gray-900">{slot.name}</b> {reading[index]}
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
