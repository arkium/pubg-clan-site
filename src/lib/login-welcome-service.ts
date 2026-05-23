import { prisma } from '@/lib/prisma'

const LOGIN_WELCOME_BADGE_KEY = 'login_welcome_badge'
const LOGIN_WELCOME_TITLE_KEY = 'login_welcome_title'
const LOGIN_WELCOME_MESSAGE_KEY = 'login_welcome_message'
const LOGIN_WELCOME_IMAGE_URL_KEY = 'login_welcome_image_url'

const DEFAULT_BADGE = 'Bienvenue au clan'
const DEFAULT_TITLE = 'Connexion escouade'
const DEFAULT_MESSAGE =
  'Connectez-vous pour retrouver vos statistiques, votre progression et les outils de coordination du clan.'

const MAX_BADGE_LENGTH = 60
const MAX_TITLE_LENGTH = 100
const MAX_MESSAGE_LENGTH = 260

export type LoginWelcomeSettings = {
  badge: string
  title: string
  message: string
  imageUrl: string | null
}

function sanitizeText(value: string, fallback: string, maxLength: number) {
  const trimmed = value.trim()
  if (!trimmed) {
    return fallback
  }

  return trimmed.slice(0, maxLength)
}

export function normalizeLoginWelcomeSettings(input: {
  badge?: string
  title?: string
  message?: string
  imageUrl?: string | null
}): LoginWelcomeSettings {
  const rawImageUrl = typeof input.imageUrl === 'string' ? input.imageUrl.trim() : ''

  return {
    badge: sanitizeText(input.badge ?? '', DEFAULT_BADGE, MAX_BADGE_LENGTH),
    title: sanitizeText(input.title ?? '', DEFAULT_TITLE, MAX_TITLE_LENGTH),
    message: sanitizeText(input.message ?? '', DEFAULT_MESSAGE, MAX_MESSAGE_LENGTH),
    imageUrl: rawImageUrl.length > 0 ? rawImageUrl.slice(0, 500) : null,
  }
}

export async function getLoginWelcomeSettings(): Promise<LoginWelcomeSettings> {
  const entries = await prisma.appConfig.findMany({
    where: {
      key: {
        in: [
          LOGIN_WELCOME_BADGE_KEY,
          LOGIN_WELCOME_TITLE_KEY,
          LOGIN_WELCOME_MESSAGE_KEY,
          LOGIN_WELCOME_IMAGE_URL_KEY,
        ],
      },
    },
    select: {
      key: true,
      value: true,
    },
  })

  const map = new Map(entries.map((entry) => [entry.key, entry.value]))

  return normalizeLoginWelcomeSettings({
    badge: map.get(LOGIN_WELCOME_BADGE_KEY),
    title: map.get(LOGIN_WELCOME_TITLE_KEY),
    message: map.get(LOGIN_WELCOME_MESSAGE_KEY),
    imageUrl: map.get(LOGIN_WELCOME_IMAGE_URL_KEY) ?? null,
  })
}

export async function updateLoginWelcomeSettings(next: LoginWelcomeSettings) {
  await prisma.$transaction([
    prisma.appConfig.upsert({
      where: { key: LOGIN_WELCOME_BADGE_KEY },
      update: { value: next.badge },
      create: {
        key: LOGIN_WELCOME_BADGE_KEY,
        value: next.badge,
      },
    }),
    prisma.appConfig.upsert({
      where: { key: LOGIN_WELCOME_TITLE_KEY },
      update: { value: next.title },
      create: {
        key: LOGIN_WELCOME_TITLE_KEY,
        value: next.title,
      },
    }),
    prisma.appConfig.upsert({
      where: { key: LOGIN_WELCOME_MESSAGE_KEY },
      update: { value: next.message },
      create: {
        key: LOGIN_WELCOME_MESSAGE_KEY,
        value: next.message,
      },
    }),
    prisma.appConfig.upsert({
      where: { key: LOGIN_WELCOME_IMAGE_URL_KEY },
      update: { value: next.imageUrl ?? '' },
      create: {
        key: LOGIN_WELCOME_IMAGE_URL_KEY,
        value: next.imageUrl ?? '',
      },
    }),
  ])

  return next
}

export async function getPrimaryClanLabel() {
  const clan = await prisma.clan.findFirst({
    where: {
      isActive: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      name: true,
      tag: true,
    },
  })

  if (!clan) {
    return null
  }

  return `${clan.name} [${clan.tag}]`
}
