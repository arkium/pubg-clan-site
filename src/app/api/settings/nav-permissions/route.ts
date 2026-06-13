import { requireRole } from '@/middleware/auth-permission'
import {
  getNavPermissions,
  setNavPermission,
  getNavPositions,
  setNavSectionOrder,
} from '@/lib/nav-permissions-service'
import type { NavRole, NavSection } from '@/lib/nav-permissions-registry'

export async function GET() {
  try {
    const [permissions, positions] = await Promise.all([getNavPermissions(), getNavPositions()])
    const roles = Object.fromEntries(permissions.map(({ navKey, role }) => [navKey, role]))
    return Response.json({ roles, positions })
  } catch {
    return Response.json({ error: 'Erreur serveur' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  const roleError = await requireRole(['Owner'])(request, {})
  if (roleError) return roleError

  try {
    const body = (await request.json()) as
      | { action: 'role'; navKey: string; role: NavRole }
      | { action: 'position'; section: NavSection; orderedKeys: string[] }

    if (!body.action) {
      return Response.json({ error: 'action requise' }, { status: 400 })
    }

    if (body.action === 'role') {
      const { navKey, role } = body
      if (!navKey) return Response.json({ error: 'navKey requis' }, { status: 400 })
      if (!role) return Response.json({ error: 'role requis' }, { status: 400 })
      await setNavPermission(navKey, role)
      return Response.json({ ok: true })
    }

    if (body.action === 'position') {
      const { section, orderedKeys } = body
      if (!section) return Response.json({ error: 'section requise' }, { status: 400 })
      if (!Array.isArray(orderedKeys)) return Response.json({ error: 'orderedKeys requis' }, { status: 400 })
      await setNavSectionOrder(section, orderedKeys)
      return Response.json({ ok: true })
    }

    return Response.json({ error: 'action inconnue' }, { status: 400 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur inconnue'
    return Response.json({ error: message }, { status: 400 })
  }
}
