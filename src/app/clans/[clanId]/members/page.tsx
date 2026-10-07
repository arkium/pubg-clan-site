'use client'

import Link from 'next/link'
import { ChevronDown, Search, Users, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'

import MemberCard, { MemberAvatar } from '@/components/members/MemberCard'
import { DockingToolbar } from '@/components/ui/DockingToolbar'
import { NavigationTrail } from '@/components/ui/NavigationTrail'
import SegmentedControl from '@/components/ui/SegmentedControl'
import { CardSkeleton } from '@/components/ui/skeletons/CardSkeleton'
import { usePageData } from '@/hooks/usePageData'
import { useSelectedClan } from '@/hooks/useSelectedClan'
import {
  filterRoster,
  lastSeenLabel,
  playedTonight,
  ROSTER_ROLES,
  sortRoster,
  splitRoster,
  type RosterMember,
  type RosterRoleFilter,
  type RosterSort,
} from '@/lib/member-roster'

type CardsPayload = {
  clan: { id: number; name: string; tag: string }
  members: RosterMember[]
  /** `null` : le lecteur ne peut pas traiter les demandes. */
  pendingCount: number | null
}

const pickCards = (payload: unknown) => (payload as CardsPayload | null) ?? null

const ROLE_OPTIONS: Array<{ value: RosterRoleFilter; label: string; icon: ReactNode }> = [
  { value: 'all', label: 'Tous', icon: <span className="h-2 w-2 rounded-full bg-[var(--theme-ui-text-muted)]" aria-hidden="true" /> },
  ...ROSTER_ROLES.map((role) => ({
    value: role.id as RosterRoleFilter,
    label: role.label,
    icon: <span className="h-2 w-2 rounded-full" style={{ backgroundColor: role.color }} aria-hidden="true" />,
  })),
]

const SORT_OPTIONS: Array<{ value: RosterSort; label: string }> = [
  { value: 'activity', label: 'Activité' },
  { value: 'name', label: 'Nom' },
  { value: 'kpm', label: 'K/M' },
  { value: 'medals', label: 'Médailles' },
]

function parseClanId(value: string | string[] | undefined) {
  if (!value || Array.isArray(value)) return null
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`

/**
 * Membres du clan — une fiche soldat par joueur (maquette « Membres et joueur », 16a–16c ; docs/features/membres.md).
 * Filtre par rôle, recherche et tri côté client ; les joueurs sans partie depuis 30 jours passent « en réserve ».
 */
export default function ClanMembersPage() {
  const params = useParams()
  const router = useRouter()
  const { setClanId } = useSelectedClan({ redirectIfMissing: true, redirectPath: '/clans' })
  const clanId = useMemo(() => parseClanId(params.clanId), [params.clanId])

  const [role, setRole] = useState<RosterRoleFilter>('all')
  const [sort, setSort] = useState<RosterSort>('activity')
  const [query, setQuery] = useState('')
  const [reserveOpen, setReserveOpen] = useState(false)
  const [now] = useState(() => new Date())

  useEffect(() => {
    if (!clanId) {
      router.replace('/clans')
      return
    }
    setClanId(clanId)
  }, [clanId, router, setClanId])

  const { data, loading, error } = usePageData(clanId ? `/api/clans/${clanId}/members/cards` : null, pickCards)
  const members = useMemo(() => data?.members ?? [], [data])
  const { active, reserve } = useMemo(() => splitRoster(members, now), [members, now])
  const visible = useMemo(() => sortRoster(filterRoster(active, role, query), sort), [active, role, query, sort])
  const visibleReserve = useMemo(() => filterRoster(reserve, role, query), [reserve, role, query])
  const tonightCount = members.filter((member) => playedTonight(member.lastMatchAt, now)).length

  if (!clanId) return null

  return (
    // Page à bandeau (docs/TODO/sticky.md §4.A) : pleine largeur, blocs internes alignés sur la grille.
    // `.charte` : page migrée vers la charte UI (accent jaune, Teko, classes de rôle) — docs/ui/index.html.
    <div className="app-main-flush charte flex-1">
      <div className="app-container app-gutter">
        <NavigationTrail
          currentLabel="Membres"
          currentHref={`/clans/${clanId}/members`}
          fallbackParent={{ href: `/clans/${clanId}/overview`, label: "Vue d'ensemble", altHref: '/clans' }}
        />

        <header
          className="app-on-photo bg-hero-fallback relative min-h-[10rem] overflow-hidden rounded-[14px] bg-cover bg-no-repeat sm:min-h-[13rem]"
          style={{ backgroundImage: `url('/members.jpg')`, backgroundPosition: 'center 30%' }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent sm:bg-gradient-to-r sm:from-slate-950/90 sm:via-slate-950/40 sm:to-transparent" />
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 px-3 py-2.5 sm:px-5 sm:py-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Users className="h-5 w-5 text-[var(--theme-ui-accent)] sm:h-6 sm:w-6" aria-hidden="true" />
              <h1 className="t-banner-title text-white drop-shadow-md">Membres du clan</h1>
            </div>
            {data ? (
              <div className="flex flex-wrap gap-1.5 text-xs font-semibold text-white">
                <span className="rounded-full border border-white/30 bg-white/15 px-2.5 py-0.5">
                  {data.clan.name} · {plural(members.length, 'joueur')}
                </span>
                {tonightCount > 0 ? (
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--game-pos-ring)] bg-[var(--game-pos-soft)] px-2.5 py-0.5"
                    data-testid="tonight-count"
                  >
                    <span className="h-[7px] w-[7px] rounded-full bg-[var(--game-pos)] shadow-[0_0_0_3px_var(--game-pos-soft)]" aria-hidden="true" />
                    {tonightCount} {tonightCount > 1 ? 'ont joué ce soir' : 'a joué ce soir'}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>
      </div>

      {/* Pas de période : le bandeau ne docke pas sur mobile (docs/TODO/sticky.md §2). Une seule hauteur par ligne :
          recherche et lien s'étirent à la hauteur du rail segmented. */}
      <DockingToolbar ariaLabel="Filtres des membres" dockOnMobile={false}>
        <div className="flex w-full flex-wrap items-center gap-2.5">
          <label className="app-toolbar-search min-w-[150px] flex-1">
            <Search className="h-[15px] w-[15px] shrink-0" aria-hidden="true" />
            <span className="sr-only">Rechercher un membre</span>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nom ou pseudo" />
            {query ? (
              <button type="button" onClick={() => setQuery('')} aria-label="Effacer la recherche" className="text-gray-500 hover:text-gray-900">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </label>
          <div role="group" aria-label="Rôle" className="flex self-stretch">
            <SegmentedControl options={ROLE_OPTIONS} value={role} onChange={setRole} />
          </div>
          <div role="group" aria-label="Trier par" className="flex self-stretch">
            <SegmentedControl options={SORT_OPTIONS} value={sort} onChange={setSort} />
          </div>
          {data && data.pendingCount !== null ? (
            // « En attente » en orange (charte §1.3) dès qu'une demande attend.
            <Link href={`/clans/${clanId}/settings/members?tab=demandes`} className="app-toolbar-btn shrink-0 self-stretch">
              Demandes en attente <span className={data.pendingCount > 0 ? 't-warn font-extrabold' : ''}>({data.pendingCount})</span>
            </Link>
          ) : null}
        </div>
      </DockingToolbar>

      <div className={`app-container app-gutter flex flex-col gap-6 pb-8 transition-opacity ${loading && data ? 'opacity-60' : ''}`}>
        {error ? <p className="app-panel p-4 text-sm text-[var(--theme-ui-negative)]">{error}</p> : null}
        {!data && loading ? <CardSkeleton /> : null}

        {data ? (
          <section className="flex flex-col gap-2.5" aria-labelledby="members-active">
            <div className="flex items-baseline gap-2">
              <h2 id="members-active" className="t-section-title">Actifs</h2>
              <span className="t-meta">{plural(visible.length, 'joueur')} · parties sur 30 jours</span>
            </div>
            {visible.length > 0 ? (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Membres actifs">
                {visible.map((member) => (
                  <li key={member.memberId} className="flex">
                    <MemberCard member={member} now={now} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="app-panel-muted t-body p-4 text-gray-500">
                {members.length === 0
                  ? 'Aucun membre suivi dans ce clan pour l’instant.'
                  : active.length === 0
                    ? 'Aucun joueur n’a joué depuis 30 jours.'
                    : 'Aucun joueur actif ne correspond à ces filtres.'}
              </p>
            )}
          </section>
        ) : null}

        {data && reserve.length > 0 ? (
          <section className="flex flex-col gap-2.5" aria-labelledby="members-reserve">
            <button
              type="button"
              onClick={() => setReserveOpen((open) => !open)}
              aria-expanded={reserveOpen}
              aria-controls="members-reserve-list"
              className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-left"
            >
              <span className="h-2 w-2 rounded-full bg-[var(--theme-ui-text-muted)]" aria-hidden="true" />
              <h2 id="members-reserve" className="t-section-title whitespace-nowrap">En réserve</h2>
              <span className="t-meta">{plural(reserve.length, 'joueur')} · pas de partie depuis 30 jours</span>
              <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-gray-700">
                {reserveOpen ? 'Masquer' : 'Afficher'}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${reserveOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </span>
            </button>
            {reserveOpen ? (
              <ul id="members-reserve-list" className="app-panel divide-y divide-gray-200 overflow-hidden" aria-label="Membres en réserve">
                {visibleReserve.length > 0 ? (
                  visibleReserve.map((member) => (
                    <li key={member.memberId}>
                      <Link
                        href={`/members/${member.memberId}/dashboard`}
                        className="flex items-center gap-3 px-3.5 py-2.5 opacity-80 transition hover:bg-gray-50 hover:opacity-100"
                      >
                        <MemberAvatar member={member} size="sm" now={now} />
                        <b className="min-w-0 truncate text-[13px] text-gray-900">{member.displayName}</b>
                        <span className="t-meta ml-auto shrink-0">{lastSeenLabel(member.lastMatchAt, now)}</span>
                      </Link>
                    </li>
                  ))
                ) : (
                  <li className="t-body px-3.5 py-2.5 text-gray-500">Aucun joueur en réserve ne correspond à ces filtres.</li>
                )}
              </ul>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  )
}
