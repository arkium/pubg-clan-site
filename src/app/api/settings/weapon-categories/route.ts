import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getSessionFromRequest } from '@/lib/auth-session'
import { getMemberPermissionKeys } from '@/lib/role-service'
import {
  CATEGORY_CODES,
  getCategoryLabels,
  getWeaponCategories,
  updateCategoryLabels,
  updateWeaponCategories,
} from '@/lib/weapon-category-service'

const UpdateWeaponCategoriesSchema = z.object({
  weaponCategories: z.record(z.string(), z.enum(CATEGORY_CODES)).optional(),
  categoryLabels: z.record(z.string(), z.string().max(50)).optional(),
})

function hasManageSettings(permissions: string[]) {
  return permissions.includes('*') || permissions.includes('manage_settings')
}

export async function GET(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session?.activeMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const permissions = await getMemberPermissionKeys(session.activeMemberId)
  if (!hasManageSettings(permissions)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [weaponCategories, categoryLabels] = await Promise.all([
    getWeaponCategories(),
    getCategoryLabels(),
  ])

  return NextResponse.json({ weaponCategories, categoryLabels })
}

export async function PUT(request: Request) {
  const session = await getSessionFromRequest(request)
  if (!session?.activeMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const permissions = await getMemberPermissionKeys(session.activeMemberId)
  if (!hasManageSettings(permissions)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = (await request.json().catch(() => null)) as unknown
  const validated = UpdateWeaponCategoriesSchema.safeParse(body)

  if (!validated.success) {
    return NextResponse.json(
      { error: validated.error.issues[0]?.message ?? 'Invalid payload' },
      { status: 400 }
    )
  }

  const [weaponCategories, categoryLabels] = await Promise.all([
    validated.data.weaponCategories
      ? updateWeaponCategories(validated.data.weaponCategories)
      : getWeaponCategories(),
    validated.data.categoryLabels
      ? updateCategoryLabels(validated.data.categoryLabels)
      : getCategoryLabels(),
  ])

  return NextResponse.json({ success: true, weaponCategories, categoryLabels })
}
