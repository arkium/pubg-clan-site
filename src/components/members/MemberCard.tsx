'use client'

/* eslint-disable @next/next/no-img-element -- avatars et icônes d'armes locales, tailles fixes */

import Link from 'next/link'
import { useState } from 'react'

import {
  killsPerMatch,
  lastSeenLabel,
  playedTonight,
  rosterInitials,
  rosterRole,
  winRatePercent,
  type RosterMember,
} from '@/lib/member-roster'
import { weaponWhiteIconUrl } from '@/lib/pubg-assets'

const decimal = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const percent = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const MEDALS = [
  { key: 'gold', src: '/icons/medal-gold.svg', label: 'or' },
  { key: 'silver', src: '/icons/medal-silver.svg', label: 'argent' },
  { key: 'bronze', src: '/icons/medal-bronze.svg', label: 'bronze' },
] as const

/** Silhouette blanche de l'arme (noire en thème clair, `pubg-icon-filter`) ; rien si l'image manque. */
function WeaponSilhouette({ id, className }: { id: string; className: string }) {
  const [failed, setFailed] = useState(false)
  if (failed) return null
  return (
    <img
      src={weaponWhiteIconUrl(id)}
      alt=""
      aria-hidden="true"
      className={`pubg-icon-filter object-contain ${className}`}
      ref={(img) => {
        if (img && img.complete && img.naturalWidth === 0) setFailed(true)
      }}
      onError={() => setFailed(true)}
    />
  )
}

export function MemberAvatar({ member, size, now }: { member: Pick<RosterMember, 'displayName' | 'avatarUrl' | 'lastMatchAt' | 'role'>; size: 'sm' | 'md'; now: Date }) {
  const [failed, setFailed] = useState(false)
  const color = member.role ? rosterRole(member.role.id).color : 'var(--theme-ui-border)'
  const tonight = playedTonight(member.lastMatchAt, now)
  const box = size === 'md' ? 'h-[52px] w-[52px] rounded-[14px] text-[17px]' : 'h-8 w-8 rounded-[9px] text-xs'
  return (
    <span
      className={`relative grid shrink-0 place-items-center border-2 bg-[#0b1120] font-black tracking-wide text-white ${box}`}
      style={{ borderColor: color }}
    >
      {member.avatarUrl && !failed ? (
        <img src={member.avatarUrl} alt="" className="h-full w-full rounded-[inherit] object-cover" onError={() => setFailed(true)} />
      ) : (
        rosterInitials(member.displayName)
      )}
      {tonight ? (
        <span
          className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-[var(--theme-ui-surface)] bg-emerald-500"
          title="A joué ce soir"
          data-testid="played-tonight"
        />
      ) : null}
    </span>
  )
}

/** Fiche soldat d'un membre actif (maquette « Membres », 16a–16c). Toute la carte ouvre son tableau de bord. */
export default function MemberCard({ member, now }: { member: RosterMember; now: Date }) {
  const role = member.role ? rosterRole(member.role.id) : null
  const tonight = playedTonight(member.lastMatchAt, now)
  const stats = [
    { label: 'K/M', value: member.recent.matches > 0 ? decimal.format(killsPerMatch(member)) : '–' },
    { label: 'Win rate', value: member.recent.matches > 0 ? `${percent.format(winRatePercent(member))} %` : '–' },
    { label: 'Parties', value: String(member.recent.matches) },
  ]
  return (
    <Link
      href={`/members/${member.memberId}/dashboard`}
      aria-label={member.displayName}
      className="app-panel group relative flex w-full min-w-0 flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-[var(--theme-ui-accent-ring)] hover:shadow-lg"
    >
      <div
        className="relative flex items-center gap-3 px-3.5 pb-3 pt-3.5"
        style={role ? { background: `linear-gradient(135deg, ${role.tint} 0%, transparent 70%)` } : undefined}
      >
        {member.favoriteWeapon ? (
          <WeaponSilhouette id={member.favoriteWeapon.id} className="pointer-events-none absolute -right-4 top-1.5 h-14 w-[150px] -rotate-[8deg] opacity-[0.13]" />
        ) : null}
        <MemberAvatar member={member} size="md" now={now} />
        <span className="relative flex min-w-0 flex-col gap-1">
          <b className="truncate text-[15px] text-gray-900">{member.displayName}</b>
          <span className="flex min-w-0 items-center gap-1.5">
            {role ? (
              <span className="shrink-0 rounded-[5px] px-1.5 py-px text-[10px] font-black uppercase tracking-[0.08em] text-[#0b1120]" style={{ backgroundColor: role.color }}>
                {role.label}
              </span>
            ) : null}
            <span className={`truncate text-xs ${tonight ? 'font-semibold text-[var(--theme-ui-positive)]' : 'text-gray-500'}`}>
              {lastSeenLabel(member.lastMatchAt, now)}
            </span>
          </span>
        </span>
      </div>
      <dl className="grid grid-cols-3 border-y border-gray-200 tabular-nums">
        {stats.map((stat, index) => (
          <div key={stat.label} className={`flex flex-col-reverse items-center px-1 py-2 ${index < 2 ? 'border-r border-gray-200' : ''}`}>
            <dt className="text-[10px] font-bold uppercase tracking-[0.06em] text-gray-500">{stat.label}</dt>
            <dd className="text-base font-extrabold text-gray-900">{stat.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-gray-600">
          {member.favoriteWeapon ? (
            <>
              <WeaponSilhouette id={member.favoriteWeapon.id} className="h-4 w-10 shrink-0" />
              <span className="truncate">Arme fétiche : {member.favoriteWeapon.label}</span>
            </>
          ) : (
            <span className="truncate text-gray-500">Pas encore d’arme fétiche</span>
          )}
        </span>
        <span className="flex shrink-0 gap-2 text-xs font-extrabold tabular-nums text-gray-900">
          {MEDALS.map((medal) => {
            const count = member.medals[medal.key]
            return (
              <span key={medal.key} className={`inline-flex items-center gap-0.5 ${count ? '' : 'opacity-35'}`} title={`Médailles ${medal.label}`}>
                <img src={medal.src} width={15} height={15} alt={`Médailles ${medal.label}`} />
                {count}
              </span>
            )
          })}
        </span>
      </div>
    </Link>
  )
}
