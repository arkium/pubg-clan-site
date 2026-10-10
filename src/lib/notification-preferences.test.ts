import { readFileSync } from 'node:fs'
import path from 'node:path'
import { Prisma } from '@prisma/client'
import { describe, expect, it } from 'vitest'

import {
  NOTIFICATION_PREFERENCE_DEFAULTS,
  NOTIFICATION_PREFERENCE_FIELDS,
  pickPreferenceUpdate,
} from '@/lib/notification-preferences'

// Aucun accès à la base : le client Prisma généré et le schéma suffisent.
const MODEL_FIELDS = Object.keys(Prisma.NotificationPreferenceScalarFieldEnum).filter(
  (field) => !['id', 'memberId', 'updatedAt'].includes(field)
)

function schemaDefaults(): Record<string, boolean> {
  const schema = readFileSync(path.resolve(__dirname, '../../prisma/schema.prisma'), 'utf8')
  const model = schema.match(/model NotificationPreference \{([\s\S]*?)\n\}/)?.[1] ?? ''
  return Object.fromEntries(
    [...model.matchAll(/^\s*(\w+)\s+Boolean\s+@default\((true|false)\)/gm)].map(([, field, value]) => [field, value === 'true'])
  )
}

describe('notification-preferences', () => {
  it('couvre exactement les champs booléens du modèle Prisma (aucun champ retiré du schéma, comme reportReady)', () => {
    expect([...NOTIFICATION_PREFERENCE_FIELDS].sort()).toEqual([...MODEL_FIELDS].sort())
  })

  it('reprend les @default du schéma', () => {
    expect(NOTIFICATION_PREFERENCE_DEFAULTS).toEqual(schemaDefaults())
  })

  it('ne garde que les booléens des champs connus', () => {
    expect(
      pickPreferenceUpdate({ squadDetected: false, emailNotifications: 'oui', reportReady: true, memberId: 3, inAppNotifications: true })
    ).toEqual({ squadDetected: false, inAppNotifications: true })
  })
})
