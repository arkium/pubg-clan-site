import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Chaque route d'écriture d'administration passe par le journal des actions (docs/TODO/administration.md Q10) :
 * ses handlers POST, PUT, PATCH et DELETE sont exportés enveloppés par `withAdminActionLog`, avec le gabarit de la
 * route pour action. Une route d'administration = une route qui appelle une garde d'administration, ou l'une des
 * routes qui vérifient le SuperUser elles-mêmes (elles notent alors leur acteur par `rememberSessionActor`).
 */
const API_DIR = path.join(process.cwd(), 'src', 'app', 'api')
const ADMIN_GUARD = /requirePlatformAdmin|requireClanFeature|requireClanAccess|requireSuperUser/
const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const

/** Routes qui contrôlent le SuperUser à la main, et notent elles-mêmes leur acteur. */
const SELF_CHECKED_ADMIN_ROUTES = [
  'clans/[clanId]/members/[memberId]/role',
  'resources/admin/decisions',
  'resources/admin/history/[actionId]/undo',
  'resources/admin/maps/[map]',
  'settings/clans',
  'settings/cron-schedules',
  'settings/cron-schedules/[key]',
  'settings/pubg-api-calls',
  'settings/telemetry-recoveries/enqueue-backlog',
]

/** Routes d'administration sans écriture malgré leur méthode POST. */
const NOT_JOURNALED = new Map([['settings/league/preview', 'aperçu du classement, rien n’est écrit']])

function listRoutes(dir: string, prefix = ''): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return listRoutes(path.join(dir, entry.name), prefix ? `${prefix}/${entry.name}` : entry.name)
    return entry.name === 'route.ts' ? [prefix] : []
  })
}

const read = (route: string) => fs.readFileSync(path.join(API_DIR, route, 'route.ts'), 'utf8')
const writeMethods = (source: string) =>
  WRITE_METHODS.filter((method) =>
    new RegExp(`^export (async function ${method}\\(|const ${method} = )`, 'm').test(source)
  )

const adminRoutes = listRoutes(API_DIR)
  .filter((route) => SELF_CHECKED_ADMIN_ROUTES.includes(route) || ADMIN_GUARD.test(read(route)))
  .filter((route) => writeMethods(read(route)).length > 0)
  .filter((route) => !NOT_JOURNALED.has(route))
  .sort()

describe('journal des actions d’administration', () => {
  it('trouve les routes d’écriture d’administration', () => {
    expect(adminRoutes.length).toBeGreaterThan(55)
    for (const route of SELF_CHECKED_ADMIN_ROUTES) expect(adminRoutes).toContain(route)
  })

  it.each(adminRoutes)('%s : chaque écriture est enveloppée avec le gabarit de la route', (route) => {
    const source = read(route)
    for (const method of writeMethods(source)) {
      expect(source, `${route} ${method}`).toMatch(
        new RegExp(`^export const ${method} = withAdminActionLog\\('${route.replace(/[[\]]/g, '\\$&')}', `, 'm')
      )
    }
  })

  it.each(SELF_CHECKED_ADMIN_ROUTES)('%s note son acteur une fois le contrôle passé', (route) => {
    expect(read(route)).toMatch(/remember(SessionActor|AdminActor)\(request, /)
  })
})
