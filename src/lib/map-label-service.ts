import { prisma } from '@/lib/prisma'

const MAP_LABELS_KEY = 'pubg_map_labels'

export const DEFAULT_MAP_LABELS: Record<string, string> = {
  Baltic_Main: 'Erangel',
  Savage_Main: 'Sanhok',
  Desert_Main: 'Miramar',
  DihorOtok_Main: 'Vikendi',
  Range_Main: 'Camp Jackal',
  Summerland_Main: 'Karakin',
  Tiger_Main: 'Taego',
  Kiki_Main: 'Deston',
  Chimera_Main: 'Paramo',
  Heaven_Main: 'Haven',
  Neon_Main: 'Rondo',
}

const MAX_LABEL_LENGTH = 40

function sanitizeLabel(raw: string, fallback: string) {
  const trimmed = raw.trim()
  if (!trimmed) {
    return fallback
  }

  return trimmed.slice(0, MAX_LABEL_LENGTH)
}

function parseStoredMapLabels(value: string | null) {
  if (!value) {
    return {}
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string'
      )
    )
  } catch {
    return {}
  }
}

export function normalizeMapLabels(input: Record<string, string>) {
  const keys = new Set<string>([
    ...Object.keys(DEFAULT_MAP_LABELS),
    ...Object.keys(input),
  ])

  const normalized: Record<string, string> = {}

  for (const key of keys) {
    const fallback = DEFAULT_MAP_LABELS[key] ?? key
    normalized[key] = sanitizeLabel(input[key] ?? '', fallback)
  }

  return normalized
}

export async function getMapLabels() {
  const config = await prisma.appConfig.findUnique({
    where: { key: MAP_LABELS_KEY },
    select: { value: true },
  })

  const stored = parseStoredMapLabels(config?.value ?? null)
  return normalizeMapLabels(stored)
}

export async function updateMapLabels(next: Record<string, string>) {
  const normalized = normalizeMapLabels(next)

  await prisma.appConfig.upsert({
    where: { key: MAP_LABELS_KEY },
    update: {
      value: JSON.stringify(normalized),
    },
    create: {
      key: MAP_LABELS_KEY,
      value: JSON.stringify(normalized),
    },
  })

  return normalized
}

export function mapDisplayName(mapName: string, mapLabels: Record<string, string>) {
  return mapLabels[mapName] ?? DEFAULT_MAP_LABELS[mapName] ?? mapName
}
