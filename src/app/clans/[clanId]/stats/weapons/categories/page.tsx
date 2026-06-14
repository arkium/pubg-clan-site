import ClanSectionNav from '@/components/ClanSectionNav'
import { prisma } from '@/lib/prisma'
import { weaponIconUrl } from '@/lib/pubg-assets/asset-url'
import {
  getWeaponCategoryAliases,
  type WeaponCategory,
} from '@/lib/weapons/weapon-categories'

type PageProps = {
  params: Promise<{ clanId: string }>
}

const CATEGORY_ORDER: WeaponCategory[] = [
  'AR',
  'DMR',
  'SR',
  'SMG',
  'LMG',
  'SG',
  'PISTOL',
  'MELEE',
  'THROWABLE',
  'SPECIAL',
  'OTHER',
]

const CATEGORY_LABELS: Record<WeaponCategory, string> = {
  AR: "Fusils d'assaut",
  DMR: 'Fusils de précision',
  SR: 'Snipers',
  SMG: 'Pistolets-mitrailleurs',
  LMG: 'Mitrailleuses',
  SG: 'Fusils à pompe',
  PISTOL: 'Pistolets',
  MELEE: 'Mêlée',
  THROWABLE: 'Explosifs',
  SPECIAL: 'Spécial',
  OTHER: 'Autre',
}

type CategoryInfo = {
  tagline: string
  description: string
  tip: string
}

const CATEGORY_INFO: Partial<Record<WeaponCategory, CategoryInfo>> = {
  AR: {
    tagline: '"Polyvalents à moyenne portée."',
    description:
      "Le couteau suisse du Battle Royale. C'est l'arme principale par défaut. Idéal pour arroser un buisson suspect à 50 mètres ou tenter un spray héroïque en fermant les yeux.",
    tip: 'Privilégiez le 5.56mm (M416, SCAR) si vous aimez viser droit, et le 7.62mm (Beryl, AKM) si vous avez des avant-bras en acier pour gérer le recul.',
  },
  DMR: {
    tagline: '"Précision à longue distance."',
    description:
      'La machine à clic. Deux fois plus de dégâts qu\'un AR, pas besoin de recharger après chaque balle comme un sniper. C\'est l\'arme parfaite pour traumatiser un joueur qui court en ligne droite dans la pampa.',
    tip: 'Le spam-clic est un art. Équipez un appuie-joue et un compensateur d\'AR pour transformer votre SLR ou Mk12 en rayon laser semi-automatique.',
  },
  SR: {
    tagline: '"Dégâts massifs par tir."',
    description:
      'Le créateur de clips Twitch. Vous passez 15 minutes à chercher un viseur x8 pour rater trois tirs sur un mec immobile, mais LE tir unique qui fait sauter un casque de niveau 2 à 300 mètres guérit instantanément votre dépression.',
    tip: "Si l'ennemi a un casque T3 (coucou les drops), le sniper perd de sa superbe face à un DMR. Ne restez pas figé dans votre lunette après avoir tiré, ou vous subirez le même sort.",
  },
  SMG: {
    tagline: '"Cadence élevée au corps à corps."',
    description:
      'Le hachoir à viande ambulant. Ça tire tellement vite que l\'ennemi est mort avant que son cerveau ne reçoive l\'info. En plus, vous courez à la vitesse de la lumière avec ça en main.',
    tip: 'Le buff de PUBG sur les SMG les rend terrifiantes. Pas besoin de viser la tête : visez les jambes ou le buste, le multiplicateur de dégâts sur les membres fait fondre les PV, armure T3 ou pas.',
  },
  SG: {
    tagline: '"Puissance dévastatrice à bout portant."',
    description:
      "Le briseur d'amitiés en début de partie. Vous entrez dans une maison, il est là, tapi dans l'ombre des escaliers avec un DBS ou un S12K. Un bruit de détonation, et retour au lobby direct.",
    tip: 'Le choke (étrangleur) est obligatoire. Sans lui, vos plombs partent cueillir des champignons. Avec lui, vous pouvez sniper des gens à une distance indécente pour un pompe.',
  },
  LMG: {
    tagline: '"Tir de suppression."',
    description:
      'Le syndrome "Rambo". Le DP-28 ou la M249 sont là pour une seule chose : détruire des carrosseries de Dacia et vider des chargeurs de 150 balles en hurlant dans votre micro.',
    tip: "Couchez-vous ! Allongé, le bipied se déploie automatiquement et le recul disparaît presque totalement. Vous devenez une tourelle de défense fixe.",
  },
  PISTOL: {
    tagline: '"Armes secondaires."',
    description:
      "Le plan Z. Utile pendant les 12 premières secondes de la partie quand vous contestez une maison. Mention spéciale au Skorpion (qui est juste une mini-SMG) et au Glock en mode automatique.",
    tip: "Gardez toujours un pistolet équipé d'un viseur point rouge : cela ne prend pas de place dans le sac et ça permet de transporter un viseur de secours pour vos grosses armes.",
  },
}

// Static mapping: weapon-categories.ts key → PUBG telemetry ID (for icon lookup)
const KEY_TO_TELEMETRY_ID: Record<string, string> = {
  akm: 'WeapAK47_C',
  m16a4: 'WeapM16A4_C',
  m416: 'WeapHK416_C',
  'scar-l': 'WeapSCAR-L_C',
  'beryl m762': 'WeapBerylM762_C',
  'aug a3': 'WeapAUG_C',
  ace32: 'WeapACE32_C',
  qbz95: 'WeapQBZ95_C',
  g36c: 'WeapG36C_C',
  k2: 'WeapK2_C',
  'mk47 mutant': 'WeapMk47Mutant_C',
  mini14: 'WeapMini14_C',
  slr: 'WeapFNFal_C',
  sks: 'WeapSKS_C',
  mk12: 'WeapMk12_C',
  vss: 'WeapVSS_C',
  qbu88: 'WeapQBU88_C',
  mk14: 'WeapMk14_C',
  kar98k: 'WeapKar98k_C',
  m24: 'WeapM24_C',
  awm: 'WeapAWM_C',
  'mosin nagant': 'WeapMosinNagant_C',
  win94: 'WeapWin94_C',
  'lynx amr': 'WeapL6_C',
  ump9: 'WeapUMP_C',
  vector: 'WeapVector_C',
  'tommy gun': 'WeapThompson_C',
  'micro uzi': 'WeapUZI_C',
  mp5k: 'WeapMP5K_C',
  'pp-19 bizon': 'WeapBizonPP19_C',
  mp9: 'WeapMP9_C',
  js9: 'WeapJS9_C',
  m249: 'WeapM249_C',
  'dp-28': 'WeapDP28_C',
  mg3: 'WeapMG3_C',
  s12k: 'WeapSaiga12_C',
  s1897: 'WeapWinchester_C',
  s686: 'WeapBerreta686_C',
  dbs: 'WeapDP12_C',
  o12: 'WeapOriginS12_C',
  p92: 'WeapM9_C',
  p1911: 'WeapM1911_C',
  p18c: 'WeapG18_C',
  r1895: 'WeapNagantM1895_C',
  r45: 'WeapRhino_C',
  deagle: 'WeapDesertEagle_C',
  skorpion: 'Weapvz61Skorpion_C',
  pan: 'WeapPan_C',
  machete: 'WeapMachete_C',
  crowbar: 'WeapCowbar_C',
  sickle: 'WeapSickle_C',
  crossbow: 'WeapCrossbow_1_C',
  panzerfaust: 'WeapPanzerFaust100M1_C',
}

export default async function WeaponCategoryAliasesPage({ params }: PageProps) {
  const { clanId } = await params
  const parsedClanId = Number(clanId)

  const entries = getWeaponCategoryAliases()

  const weaponStatsRows = await prisma.memberWeaponStats.findMany({
    where: {
      member: { clanId: parsedClanId },
      period: 'all-time',
    },
    select: { weaponName: true, kills: true },
  })

  const killsByTelemetryId = new Map<string, number>()
  for (const row of weaponStatsRows) {
    killsByTelemetryId.set(row.weaponName, (killsByTelemetryId.get(row.weaponName) ?? 0) + row.kills)
  }

  const grouped = CATEGORY_ORDER.map((category) => ({
    category,
    items: entries.filter((entry) => entry.category === category),
  })).filter((group) => group.items.length > 0)

  return (
    <main className="app-container app-main space-y-6">
      <section className="app-panel p-4">
        <div className="px-1 py-1">
          <h1 className="text-2xl font-bold text-gray-900">Catégories armes</h1>
          <p className="mt-1 text-sm text-gray-600">
            Mapping utilisé pour classer les armes par catégorie dans la télémétrie.
          </p>
        </div>
        <ClanSectionNav clanId={parsedClanId} />
      </section>

      <section className="space-y-4">
        {grouped.map((group) => {
          const info = CATEGORY_INFO[group.category]
          return (
            <article key={group.category} className="app-panel overflow-hidden">
              {/* Category header */}
              <div className="border-b border-gray-200 px-4 py-4 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-xs font-bold tracking-wider text-white">
                    {group.category}
                  </span>
                  <h2 className="text-base font-bold text-gray-900">
                    {CATEGORY_LABELS[group.category]}
                  </h2>
                  <span className="ml-auto shrink-0 text-xs text-gray-400">
                    {group.items.length} armes
                  </span>
                </div>

                {info && (
                  <>
                    <p className="text-sm italic text-gray-500">{info.tagline}</p>

                    <div className="grid gap-3 md:grid-cols-2">
                      <p className="text-sm text-gray-700">{info.description}</p>

                      <div className="flex gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5">
                        <span className="mt-0.5 shrink-0 text-base leading-none">🎯</span>
                        <div>
                          <p className="text-xs font-semibold text-gray-900">Conseil Pro</p>
                          <p className="mt-0.5 text-sm text-gray-600">{info.tip}</p>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Weapon cards */}
              <div className="p-4">
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {group.items.map((entry) => {
                    const telemetryId = KEY_TO_TELEMETRY_ID[entry.key]
                    const clanKills = telemetryId ? (killsByTelemetryId.get(telemetryId) ?? 0) : 0

                    return (
                      <li
                        key={entry.key}
                        className="relative aspect-[3/2] overflow-hidden rounded-xl bg-slate-900 shadow-md"
                      >
                        {telemetryId ? (
                          <img
                            src={weaponIconUrl(telemetryId)}
                            alt={entry.key}
                            className="absolute inset-0 h-full w-full object-contain p-5"
                          />
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="h-12 w-12 rounded-full bg-slate-700" />
                          </div>
                        )}

                        {/* Bottom gradient + weapon name */}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-3 pb-3 pt-10">
                          <p className="truncate text-sm font-bold leading-tight text-white">
                            {entry.key}
                          </p>
                          {entry.aliases.length > 1 && (
                            <p className="truncate text-[11px] leading-tight text-slate-400">
                              {entry.aliases.slice(1).join(' · ')}
                            </p>
                          )}
                        </div>

                        {/* Kills badge */}
                        {clanKills > 0 && (
                          <div className="absolute right-2 top-2 rounded-lg bg-black/60 px-2 py-1 backdrop-blur-sm ring-1 ring-white/10">
                            <p className="text-sm font-bold tabular-nums leading-none text-white">
                              {clanKills.toLocaleString('fr-FR')}
                            </p>
                            <p className="mt-0.5 text-right text-[10px] leading-none text-slate-400">
                              kills
                            </p>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            </article>
          )
        })}
      </section>
    </main>
  )
}
