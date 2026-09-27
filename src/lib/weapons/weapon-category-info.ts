import type { WeaponCategory } from './weapon-categories'

export type WeaponCategoryInfo = {
  tagline: string
  description: string
  tip: string
}

/**
 * Accroche, description et conseil pro d'une catégorie, affichés par l'armurerie du clan (docs/features/weapons.md §7).
 * Toutes les catégories en ont un ; une catégorie sans texte n'afficherait que la part des kills.
 */
export const WEAPON_CATEGORY_INFO: Partial<Record<WeaponCategory, WeaponCategoryInfo>> = {
  AR: {
    tagline: 'Polyvalents à moyenne portée.',
    description:
      "Le couteau suisse du Battle Royale. C'est l'arme principale par défaut. Idéal pour arroser un buisson suspect à 50 mètres ou tenter un spray héroïque en fermant les yeux.",
    tip: 'Privilégiez le 5.56mm (M416, SCAR) si vous aimez viser droit, et le 7.62mm (Beryl, AKM) si vous avez des avant-bras en acier pour gérer le recul.',
  },
  DMR: {
    tagline: 'Précision à longue distance.',
    description:
      "La machine à clic. Deux fois plus de dégâts qu'un AR, pas besoin de recharger après chaque balle comme un sniper. C'est l'arme parfaite pour traumatiser un joueur qui court en ligne droite dans la pampa.",
    tip: "Le spam-clic est un art. Équipez un appuie-joue et un compensateur d'AR pour transformer votre SLR ou Mk12 en rayon laser semi-automatique.",
  },
  SR: {
    tagline: 'Dégâts massifs par tir.',
    description:
      'Le créateur de clips Twitch. Vous passez 15 minutes à chercher un viseur x8 pour rater trois tirs sur un mec immobile, mais LE tir unique qui fait sauter un casque de niveau 2 à 300 mètres guérit instantanément votre dépression.',
    tip: "Si l'ennemi a un casque T3 (coucou les drops), le sniper perd de sa superbe face à un DMR. Ne restez pas figé dans votre lunette après avoir tiré, ou vous subirez le même sort.",
  },
  SMG: {
    tagline: 'Cadence élevée au corps à corps.',
    description:
      "Le hachoir à viande ambulant. Ça tire tellement vite que l'ennemi est mort avant que son cerveau ne reçoive l'info. En plus, vous courez à la vitesse de la lumière avec ça en main.",
    tip: 'Le buff de PUBG sur les SMG les rend terrifiantes. Pas besoin de viser la tête : visez les jambes ou le buste, le multiplicateur de dégâts sur les membres fait fondre les PV, armure T3 ou pas.',
  },
  LMG: {
    tagline: 'Tir de suppression.',
    description:
      'Le syndrome « Rambo ». Le DP-28 ou la M249 sont là pour une seule chose : détruire des carrosseries de Dacia et vider des chargeurs de 150 balles en hurlant dans votre micro.',
    tip: 'Couchez-vous ! Allongé, le bipied se déploie automatiquement et le recul disparaît presque totalement. Vous devenez une tourelle de défense fixe.',
  },
  SG: {
    tagline: 'Puissance dévastatrice à bout portant.',
    description:
      "Le briseur d'amitiés en début de partie. Vous entrez dans une maison, il est là, tapi dans l'ombre des escaliers avec un DBS ou un S12K. Un bruit de détonation, et retour au lobby direct.",
    tip: 'Le choke (étrangleur) est obligatoire. Sans lui, vos plombs partent cueillir des champignons. Avec lui, vous pouvez sniper des gens à une distance indécente pour un pompe.',
  },
  PISTOL: {
    tagline: 'Armes secondaires.',
    description:
      'Le plan Z. Utile pendant les 12 premières secondes de la partie quand vous contestez une maison. Mention spéciale au Skorpion (qui est juste une mini-SMG) et au Glock en mode automatique.',
    tip: "Gardez toujours un pistolet équipé d'un viseur point rouge : cela ne prend pas de place dans le sac et ça permet de transporter un viseur de secours pour vos grosses armes.",
  },
  MELEE: {
    tagline: 'Le corps-à-corps, pour l’honneur.',
    description:
      "L'humiliation ultime. Personne ne se relève moralement d'une élimination à la poêle : le « bong » résonne encore dans le vocal trois parties plus tard. Machette, faucille, pied-de-biche : l'arme de ceux qui ont atterri sans rien trouver… ou qui visent le clip de la soirée.",
    tip: "Rangée à la ceinture, la poêle arrête les balles qui visent vos hanches. Et une arme de mêlée se lance : de quoi achever un joueur à terre à quelques mètres sans gaspiller une balle.",
  },
  THROWABLE: {
    tagline: 'Des dégâts de zone, sans viser.',
    description:
      "L'argument massue contre les campeurs. Une grenade bien placée ne laisse pas le temps de réfléchir, un cocktail Molotov force toute une équipe à quitter son abri — de préférence face à vos fusils.",
    tip: "Dégoupillez et gardez la grenade en main quelques secondes avant de la lancer : elle explose à l'arrivée, sans laisser le temps de fuir. Comptez bien, au bout de cinq secondes, c'est dans votre main qu'elle explose.",
  },
  SPECIAL: {
    tagline: 'Le reste de l’arsenal, rarement vu.',
    description:
      "Les armes qu'on ramasse pour la beauté du geste : l'arbalète silencieuse, le Panzerfaust qui change un véhicule en épave, le mortier qui arrose une maison sans jamais la voir. Rares, lentes, mais chaque kill mérite un replay.",
    tip: "Le Panzerfaust ne tire qu'une roquette : gardez-le pour un véhicule ou une équipe regroupée, jamais pour un duel. L'arbalète, elle, ne trahit pas votre position : parfaite pour ouvrir le combat.",
  },
  OTHER: {
    tagline: 'Tout sauf une arme.',
    description:
      "Écrasés par une Dacia, achevés aux poings, grillés près d'un jerrican : les kills que personne n'avait prévus, mais que tout le monde raconte encore à la fin de la soirée.",
    tip: "Un véhicule reste la meilleure arme contre une équipe qui réanime à découvert : un passage suffit. Mais un véhicule arrêté devient un cercueil : sortez dès qu'il s'immobilise.",
  },
}
