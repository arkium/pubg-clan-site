/**
 * Entraînement au mortier (`/mortier`, docs/features/mortier.md) : règles du jeu, cibles d'une série, impact et score.
 *
 * Fichier pur, sans import `@/` : la page, les routes (qui recalculent le score à partir de la graine — un client ne
 * peut pas envoyer un faux écart) et les tests e2e partagent exactement les mêmes calculs.
 *
 * Repère : mètres sur l'extrait de carte `MORTAR_MAP` (origine en haut à gauche, x vers l'est, y vers le sud).
 */

/** Portée du mortier PUBG : en dessous de 121 m il refuse de tirer, au-delà de 700 m il ne porte pas. */
export const MORTAR_RANGE = { min: 121, max: 700 } as const
/** Pas de réglage : flèches = 1 m, Maj + flèche ou boutons ±25 = 25 m. */
export const MORTAR_STEP = { fine: 1, coarse: 25 } as const
export const MORTAR_DEFAULT_SETTING = 300
export const MORTAR_TARGETS_PER_SERIES = 10

/**
 * Fond de carte : 1 000 × 600 m de Sanhok autour de Bootcamp, découpés dans la carte officielle haute définition et
 * calés sur la grille de 100 m du jeu (scripts/build-mortar-map.ts).
 */
export const MORTAR_MAP = {
  key: 'sanhok-bootcamp',
  mapName: 'Sanhok',
  image: '/maps/mortar/sanhok-bootcamp.webp',
  width: 1000,
  height: 600,
  grid: 100,
  origin: { x: 1500, y: 1700 },
} as const

export const MORTAR_DIFFICULTIES = ['easy', 'medium', 'hard'] as const
export type MortarDifficulty = (typeof MORTAR_DIFFICULTIES)[number]

export type MortarDifficultyRules = {
  label: string
  /** Écart accepté pour un tir « au but » (m). */
  tolerance: number
  minDistance: number
  maxDistance: number
  /** Dénivelé maximal entre le tireur et la cible (m) ; 0 = terrain plat. */
  maxElevation: number
}

export const MORTAR_DIFFICULTY_RULES: Record<MortarDifficulty, MortarDifficultyRules> = {
  easy: { label: 'Facile', tolerance: 15, minDistance: 150, maxDistance: 400, maxElevation: 0 },
  medium: { label: 'Moyen', tolerance: 10, minDistance: MORTAR_RANGE.min, maxDistance: MORTAR_RANGE.max, maxElevation: 0 },
  hard: { label: 'Difficile', tolerance: 5, minDistance: MORTAR_RANGE.min, maxDistance: MORTAR_RANGE.max, maxElevation: 40 },
}

/**
 * Règle d'entraînement du mode Difficile : l'obus retombe en cloche, une cible plus haute que le tireur est touchée
 * plus tôt sur la trajectoire. Chaque mètre de dénivelé décale l'impact d'un demi-mètre : vise 5 m plus loin pour une
 * cible 10 m plus haute, 5 m plus court pour une cible 10 m plus basse. Simplification assumée (docs/features/mortier.md).
 */
export const MORTAR_ELEVATION_FACTOR = 0.5

export function parseMortarDifficulty(value: unknown): MortarDifficulty | null {
  return typeof value === 'string' && (MORTAR_DIFFICULTIES as readonly string[]).includes(value) ? (value as MortarDifficulty) : null
}

// --- Cibles d'une série --------------------------------------------------------------------------------------------

export type MortarPoint = { x: number; y: number }

export type MortarTarget = {
  index: number
  shooter: MortarPoint
  target: MortarPoint
  /** Distance à plat tireur → cible, au mètre (ce que mesure la grille). */
  distance: number
  /** Dénivelé de la cible par rapport au tireur (m, positif = plus haute) ; 0 hors mode Difficile. */
  elevation: number
}

/** Marge au bord de la carte : ni le tireur ni la cible ne collent au cadre. */
const MAP_MARGIN = 40

/** Empreinte FNV-1a sur 32 bits : une graine texte → un entier. */
function hashSeed(seed: string) {
  let hash = 0x811c9dc5
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Générateur pseudo-aléatoire déterministe (mulberry32) : même graine, mêmes cibles, côté client comme serveur. */
function seededRandom(seed: string) {
  let state = hashSeed(seed)
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const insideMap = (point: MortarPoint) =>
  point.x >= MAP_MARGIN && point.x <= MORTAR_MAP.width - MAP_MARGIN && point.y >= MAP_MARGIN && point.y <= MORTAR_MAP.height - MAP_MARGIN

/** Réglage parfait pour une cible : distance à plat corrigée du dénivelé. */
export function requiredSetting(target: Pick<MortarTarget, 'distance' | 'elevation'>) {
  return target.distance + MORTAR_ELEVATION_FACTOR * target.elevation
}

/**
 * Les dix cibles d'une série, tirées de la graine. Chaque cible a son propre tireur (placé au hasard sur la carte) :
 * c'est ce qui permet de couvrir toute la portée, 700 m compris, sur un extrait de 1 000 × 600 m.
 */
export function generateMortarTargets(seed: string, difficulty: MortarDifficulty): MortarTarget[] {
  const rules = MORTAR_DIFFICULTY_RULES[difficulty]
  const random = seededRandom(`${seed}:${difficulty}`)
  const between = (min: number, max: number) => min + random() * (max - min)
  const targets: MortarTarget[] = []

  for (let index = 0; index < MORTAR_TARGETS_PER_SERIES; index += 1) {
    let candidate: MortarTarget | null = null
    for (let attempt = 0; attempt < 1000 && !candidate; attempt += 1) {
      const shooter = { x: Math.round(between(MAP_MARGIN, MORTAR_MAP.width - MAP_MARGIN)), y: Math.round(between(MAP_MARGIN, MORTAR_MAP.height - MAP_MARGIN)) }
      const wanted = between(rules.minDistance, rules.maxDistance)
      const angle = random() * 2 * Math.PI
      const target = { x: Math.round(shooter.x + wanted * Math.cos(angle)), y: Math.round(shooter.y + wanted * Math.sin(angle)) }
      if (!insideMap(target)) continue
      const distance = Math.round(Math.hypot(target.x - shooter.x, target.y - shooter.y))
      if (distance < rules.minDistance || distance > rules.maxDistance) continue
      // Dénivelé par pas de 10 m, jamais nul en Difficile : la correction fait partie de l'exercice.
      const steps = rules.maxElevation / 10
      const elevation = steps > 0 ? (Math.floor(random() * steps) + 1) * 10 * (random() < 0.5 ? -1 : 1) : 0
      const setting = requiredSetting({ distance, elevation })
      if (setting < MORTAR_RANGE.min || setting > MORTAR_RANGE.max) continue
      candidate = { index, shooter, target, distance, elevation }
    }
    // Filet de sécurité (jamais atteint en pratique) : une cible plate à 300 m, toujours valide.
    targets.push(candidate ?? { index, shooter: { x: 200, y: 300 }, target: { x: 500, y: 300 }, distance: 300, elevation: 0 })
  }
  return targets
}

/** Graine aléatoire d'une série jouée sans enregistrement (visiteur). */
export function randomMortarSeed() {
  return Math.random().toString(36).slice(2, 12)
}

// --- Tir et score --------------------------------------------------------------------------------------------------

export function clampSetting(value: number) {
  return Math.min(MORTAR_RANGE.max, Math.max(MORTAR_RANGE.min, Math.round(value)))
}

/** Distance réellement parcourue par l'obus avant de toucher le sol, pour un réglage donné. */
export function landingDistance(setting: number, target: Pick<MortarTarget, 'elevation'>) {
  return setting - MORTAR_ELEVATION_FACTOR * target.elevation
}

/** Écart signé au mètre : négatif = trop court, positif = trop long. */
export function shotError(setting: number, target: Pick<MortarTarget, 'distance' | 'elevation'>) {
  return Math.round(landingDistance(setting, target) - target.distance)
}

export type MortarVerdict = 'hit' | 'short' | 'long'

export function shotVerdict(error: number, difficulty: MortarDifficulty): MortarVerdict {
  if (Math.abs(error) <= MORTAR_DIFFICULTY_RULES[difficulty].tolerance) return 'hit'
  return error < 0 ? 'short' : 'long'
}

/** Point d'impact : sur la ligne tireur → cible, à la distance parcourue par l'obus. */
export function impactPoint(target: MortarTarget, setting: number): MortarPoint {
  const ratio = landingDistance(setting, target) / target.distance
  return {
    x: target.shooter.x + (target.target.x - target.shooter.x) * ratio,
    y: target.shooter.y + (target.target.y - target.shooter.y) * ratio,
  }
}

export type MortarShotInput = { setting: number; timeMs: number }

export type MortarShotResult = {
  index: number
  distance: number
  elevation: number
  setting: number
  error: number
  verdict: MortarVerdict
  timeMs: number
}

export type MortarSeriesScore = {
  results: MortarShotResult[]
  /** Moyenne des écarts absolus, au dixième de mètre : la mesure du classement (le plus bas en tête). */
  meanError: number
  hits: number
  avgTimeMs: number
  totalTimeMs: number
}

export function scoreMortarSeries(targets: MortarTarget[], shots: MortarShotInput[], difficulty: MortarDifficulty): MortarSeriesScore {
  const results = targets.map((target, index) => {
    const shot = shots[index]
    const error = shotError(shot.setting, target)
    return { index, distance: target.distance, elevation: target.elevation, setting: shot.setting, error, verdict: shotVerdict(error, difficulty), timeMs: shot.timeMs }
  })
  const totalTimeMs = results.reduce((sum, result) => sum + result.timeMs, 0)
  const meanError = results.reduce((sum, result) => sum + Math.abs(result.error), 0) / Math.max(1, results.length)
  return {
    results,
    meanError: Math.round(meanError * 10) / 10,
    hits: results.filter((result) => result.verdict === 'hit').length,
    avgTimeMs: Math.round(totalTimeMs / Math.max(1, results.length)),
    totalTimeMs,
  }
}

/** Bornes d'un temps de visée : un tir en moins de 0,3 s ou après 5 min n'est pas plausible. */
export const MORTAR_SHOT_TIME_BOUNDS = { min: 300, max: 5 * 60_000 } as const

export type MortarShotsValidation = { ok: true; shots: MortarShotInput[] } | { ok: false; error: string }

/** Contrôle des tirs reçus par la route de fin de série : dix réglages entiers dans la portée, des temps plausibles. */
export function validateMortarShots(value: unknown): MortarShotsValidation {
  if (!Array.isArray(value) || value.length !== MORTAR_TARGETS_PER_SERIES) {
    return { ok: false, error: `Une série compte ${MORTAR_TARGETS_PER_SERIES} tirs` }
  }
  const shots: MortarShotInput[] = []
  for (const raw of value) {
    const setting = (raw as { setting?: unknown })?.setting
    const timeMs = (raw as { timeMs?: unknown })?.timeMs
    if (typeof setting !== 'number' || !Number.isInteger(setting) || setting < MORTAR_RANGE.min || setting > MORTAR_RANGE.max) {
      return { ok: false, error: `Réglage hors portée (${MORTAR_RANGE.min} à ${MORTAR_RANGE.max} m)` }
    }
    if (typeof timeMs !== 'number' || !Number.isInteger(timeMs) || timeMs < MORTAR_SHOT_TIME_BOUNDS.min || timeMs > MORTAR_SHOT_TIME_BOUNDS.max) {
      return { ok: false, error: 'Temps de tir invalide' }
    }
    shots.push({ setting, timeMs })
  }
  return { ok: true, shots }
}

// --- Guide ---------------------------------------------------------------------------------------------------------

/** Distance à plat pour L carrés en largeur et H en hauteur (carrés de 100 m), au mètre. */
export function gridDistance(across: number, down: number) {
  return Math.round(MORTAR_MAP.grid * Math.hypot(across, down))
}

export type MortarGridCell = { across: number; distance: number; inRange: boolean }

/** Table « Mesurer à la grille » du guide : 0 à `size` carrés dans chaque sens ; hors portée = grisé. */
export function mortarGridTable(size = 5): Array<{ down: number; cells: MortarGridCell[] }> {
  return Array.from({ length: size + 1 }, (_, down) => ({
    down,
    cells: Array.from({ length: size + 1 }, (_, across) => {
      const distance = gridDistance(across, down)
      return { across, distance, inRange: distance >= MORTAR_RANGE.min && distance <= MORTAR_RANGE.max }
    }),
  }))
}

// --- Affichage -----------------------------------------------------------------------------------------------------

const METERS = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 0 })
const METERS_ONE_DECIMAL = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })

/** « 11,4 m », « 300 m » ; `signed` : « +6 m », « −18 m » (vrai signe moins). */
export function formatMeters(value: number, options: { decimals?: boolean; signed?: boolean } = {}) {
  const format = options.decimals ? METERS_ONE_DECIMAL : METERS
  const text = format.format(Math.abs(value))
  const sign = options.signed ? (value > 0 ? '+' : value < 0 ? '−' : '') : value < 0 ? '−' : ''
  return `${sign}${text} m`
}

/** « 15,0 s » : temps moyen par cible. */
export function formatSeconds(ms: number) {
  return `${METERS_ONE_DECIMAL.format(ms / 1000)} s`
}

/** Chronomètre de série « 02:30 ». */
export function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
