'use client'

import { Crosshair, Crown, Flame, Target, type LucideIcon } from 'lucide-react'

import RankCell from '@/components/ui/RankCell'
import ArmoryWeaponImage from '@/components/weapons/ArmoryWeaponImage'
import { formatCount, type ArmoryFeat, type ArmoryWeapon, type LoadoutSlot } from '@/lib/weapons/armory'
import type { WeaponCategoryInfo } from '@/lib/weapons/weapon-category-info'

/** Blocs de l'armurerie du clan (docs/features/weapons.md §7) : loadout, fiche de catégorie, râtelier, hauts faits. */

function SectionTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <h2 className="text-[17px] font-extrabold text-gray-900">{title}</h2>
      {meta ? <span className="text-[13px] text-gray-500">{meta}</span> : null}
    </div>
  )
}

/** Le sac du clan : les cinq emplacements comme en jeu ; un clic ouvre la catégorie de l'arme. */
export function ArmoryLoadout({ slots, onOpen }: { slots: LoadoutSlot[]; onOpen: (weapon: ArmoryWeapon) => void }) {
  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="armory-loadout-title">
      <div className="flex flex-col gap-0.5">
        <h2 id="armory-loadout-title" className="text-[17px] font-extrabold text-gray-900">Le loadout du clan</h2>
        <span className="text-[13px] text-gray-500">L&apos;arme qui a fait le plus de kills pour chaque emplacement du sac.</span>
      </div>
      <div className="grid grid-cols-6 gap-2.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
        {slots.map(({ slot, label, weapon }) => {
          const main = slot <= 2
          const content = (
            <>
              <span className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
                <span className="armory-slot-key">{slot}</span>
                <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/65">{label}</span>
              </span>
              {weapon ? (
                <>
                  {main ? (
                    <span className="absolute right-2.5 top-2 text-xs font-extrabold tabular-nums text-amber-300">
                      {formatCount(weapon.kills)} kills
                    </span>
                  ) : null}
                  <ArmoryWeaponImage id={weapon.iconId} onDark variant="showcase" />
                  <span className="absolute inset-x-3 bottom-2.5 flex min-w-0 items-baseline gap-2">
                    <b className="truncate text-sm">{weapon.name}</b>
                    {main ? (
                      weapon.master ? (
                        <span className="truncate text-[11px] text-white/65">
                          {weapon.master.displayName} en a {formatCount(weapon.master.kills)}
                        </span>
                      ) : null
                    ) : (
                      // Emplacement étroit : les kills descendent à côté du nom, le maître reste au râtelier.
                      <span className="ml-auto shrink-0 text-[11px] font-extrabold tabular-nums text-amber-300">
                        {formatCount(weapon.kills)}
                      </span>
                    )}
                  </span>
                </>
              ) : (
                <span className="absolute inset-0 grid place-items-center text-xs text-white/50">Emplacement vide</span>
              )}
            </>
          )
          const className = `armory-showcase relative overflow-hidden rounded-[14px] text-left ${
            main ? 'col-span-6 h-[130px] sm:col-span-3 lg:col-span-1 lg:h-[170px]' : 'col-span-2 h-[110px] lg:col-span-1 lg:h-[170px]'
          }`
          return weapon ? (
            <button
              key={slot}
              type="button"
              onClick={() => onOpen(weapon)}
              className={`${className} armory-showcase--interactive`}
              aria-label={`${label} : ${weapon.name}, ${formatCount(weapon.kills)} kills. Ouvrir sa catégorie`}
            >
              {content}
            </button>
          ) : (
            <div key={slot} className={className}>
              {content}
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** Fiche d'une catégorie : accroche, description, conseil pro (quand le texte existe) et part des kills du clan. */
export function ArmoryCategoryBrief({ info, sharePercent }: { info: WeaponCategoryInfo | undefined; sharePercent: number }) {
  const share = (
    <div className="app-panel flex flex-col gap-2 p-3.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.08em] text-gray-500">Part des kills du clan</span>
        <b className="t-hero text-[28px] text-gray-900">{sharePercent} %</b>
      </div>
      <div className="h-2 overflow-hidden rounded bg-[var(--game-track)]">
        <div className="armory-share-bar h-full rounded" style={{ width: `${Math.min(100, sharePercent)}%` }} />
      </div>
    </div>
  )

  if (!info) return share

  return (
    <section className="grid gap-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" aria-label="Fiche de la catégorie">
      <div className="app-panel flex flex-col gap-2 p-4">
        <p className="text-[17px] font-extrabold italic text-[var(--game-gold)]">« {info.tagline} »</p>
        <p className="text-sm leading-relaxed text-gray-700 [text-wrap:pretty]">{info.description}</p>
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2.5 rounded-[14px] border border-[var(--game-gold-ring)] bg-[var(--game-gold-soft)] p-3.5">
          <Crosshair className="mt-px h-[18px] w-[18px] shrink-0 text-[var(--game-gold)]" aria-hidden="true" />
          <div className="flex flex-col gap-0.5">
            <b className="text-xs uppercase tracking-[0.08em] text-[var(--game-gold)]">Conseil pro</b>
            <span className="text-[13px] leading-normal text-gray-700 [text-wrap:pretty]">{info.tip}</span>
          </div>
        </div>
        {share}
      </div>
    </section>
  )
}

const AMMO_SLOTS = 10

/** Le râtelier d'une catégorie : médailles, maître de l'arme, chargeur de précision ; armes sans kill en gris. */
export function ArmoryRack({ weapons }: { weapons: ArmoryWeapon[] }) {
  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="armory-rack-title">
      <div className="flex flex-wrap items-baseline gap-x-2" id="armory-rack-title">
        <SectionTitle title="Le râtelier" meta={`${weapons.length} arme${weapons.length > 1 ? 's' : ''} · classées par kills`} />
      </div>
      <ul className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {weapons.map((weapon, index) => {
          const used = weapon.kills > 0
          const filled = weapon.accuracy === null ? 0 : Math.round(weapon.accuracy / 10)
          return (
            <li
              key={weapon.id}
              className={`armory-rack-card relative aspect-[3/2] overflow-hidden rounded-[10px] ${used ? '' : 'armory-rack-card--unused'}`}
            >
              <ArmoryWeaponImage id={weapon.iconId} alt={weapon.name} onDark variant="rack" />
              {used && index < 3 ? (
                <span className="absolute left-2 top-2 rounded-full bg-black/40 p-0.5">
                  <RankCell rank={index + 1} size="sm" />
                </span>
              ) : null}
              {used ? (
                <span className="absolute right-2 top-2 rounded-[7px] bg-black/60 px-[7px] py-[3px] text-center">
                  <b className="block text-[13px] leading-none tabular-nums">{formatCount(weapon.kills)}</b>
                  <span className="text-[11px] text-slate-400">kills</span>
                </span>
              ) : null}
              <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/90 to-transparent px-2.5 pb-2 pt-[18px]">
                <b className="truncate text-[13px] leading-tight">{weapon.name}</b>
                <span className="truncate text-[11px] text-slate-300">
                  {used && weapon.master ? `Maître : ${weapon.master.displayName}` : 'Aucun kill sur la période'}
                </span>
                {used && weapon.accuracy !== null ? (
                  <span
                    className="flex items-center gap-0.5"
                    title={`Précision : ${Math.round(weapon.accuracy)} % des balles touchent (${formatCount(weapon.hitsLanded)} touches sur ${formatCount(weapon.shotsFired)} tirs)`}
                  >
                    {Array.from({ length: AMMO_SLOTS }, (_, slot) => (
                      <span key={slot} className={`armory-ammo ${slot < filled ? 'armory-ammo--filled' : ''}`} />
                    ))}
                    <span className="ml-1 text-[11px] font-bold tabular-nums text-amber-300">{Math.round(weapon.accuracy)} %</span>
                  </span>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const FEAT_ICONS: Record<ArmoryFeat['id'], LucideIcon> = {
  longest: Crosshair,
  headshots: Crown,
  surgeon: Target,
  trigger: Flame,
}

/** Hauts faits, recalculés sur la sélection. */
export function ArmoryFeats({ feats, scope }: { feats: ArmoryFeat[]; scope: string }) {
  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="armory-feats-title">
      <div id="armory-feats-title">
        <SectionTitle title="Hauts faits" meta={scope} />
      </div>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {feats.map((feat) => {
          const Icon = FEAT_ICONS[feat.id]
          return (
            <div key={feat.id} className="app-panel flex min-w-0 flex-col gap-1.5 p-3.5">
              <span className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--game-gold-soft)]">
                  <Icon className="h-[15px] w-[15px] text-[var(--game-gold)]" aria-hidden="true" />
                </span>
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-gray-500">{feat.label}</span>
              </span>
              <b className="t-hero text-[30px] text-gray-900">{feat.value ?? '–'}</b>
              <span className="truncate text-xs text-gray-700">{feat.who ?? 'Pas assez de données'}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
