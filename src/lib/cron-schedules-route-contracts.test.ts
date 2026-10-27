import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { beforeEach, describe, expect, it, vi } from 'vitest'

// Vitest ne collecte que `src/lib/**` (voir vitest.config.ts) : ce fichier importe les handlers depuis src/app.
const mocks = vi.hoisted(() => ({
  isSuperUserSession: vi.fn(),
  getSessionFromRequest: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
  getEffectiveCronSchedules: vi.fn(),
  refreshCronSchedules: vi.fn(),
}))

vi.mock('@/middleware/auth-permission', () => ({ isSuperUserSession: mocks.isSuperUserSession }))
vi.mock('@/lib/auth-session', () => ({ getSessionFromRequest: mocks.getSessionFromRequest }))
vi.mock('@/lib/auth/admin-actor', () => ({ rememberSessionActor: vi.fn() }))
vi.mock('@/lib/admin-action-log', () => ({
  withAdminActionLog: (_route: string, handler: unknown) => handler,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { cronSchedule: { upsert: mocks.upsert, deleteMany: mocks.deleteMany } },
}))
vi.mock('@/lib/cron-jobs', () => ({
  getEffectiveCronSchedules: mocks.getEffectiveCronSchedules,
  refreshCronSchedules: mocks.refreshCronSchedules,
  isCronScheduleKey: (key: string) => ['daily_sync', 'daily_lifetime_stats_sync'].includes(key),
}))

import { PUT } from '@/app/api/settings/cron-schedules/route'
import { DELETE } from '@/app/api/settings/cron-schedules/[key]/route'

const SCHEDULES = [{ key: 'daily_sync', expression: '*/30 * * * *', timezone: 'Europe/Paris', source: 'db' }]

function put(body: unknown) {
  return PUT(
    new Request('http://localhost:3000/api/settings/cron-schedules', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  )
}

function del(key: string) {
  return DELETE(new Request(`http://localhost:3000/api/settings/cron-schedules/${key}`, { method: 'DELETE' }), {
    params: Promise.resolve({ key }),
  })
}

describe('cron-schedules route contracts', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.isSuperUserSession.mockResolvedValue(true)
    mocks.getSessionFromRequest.mockResolvedValue({ userId: 1 })
    mocks.getEffectiveCronSchedules.mockResolvedValue(SCHEDULES)
    mocks.refreshCronSchedules.mockResolvedValue([])
  })

  it('PUT enregistre en base puis laisse le processus des tâches replanifier', async () => {
    const response = await put({ key: 'daily_sync', expression: '*/30 * * * *' })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true, schedules: SCHEDULES })
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { key: 'daily_sync' },
      update: { expression: '*/30 * * * *', updatedBy: 1 },
      create: { key: 'daily_sync', expression: '*/30 * * * *', updatedBy: 1 },
    })
    expect(mocks.refreshCronSchedules).toHaveBeenCalledTimes(1)
    expect(mocks.upsert.mock.invocationCallOrder[0]).toBeLessThan(mocks.refreshCronSchedules.mock.invocationCallOrder[0])
  })

  it('PUT refuse une tâche inconnue sans rien écrire', async () => {
    const response = await put({ key: 'clan_match_sync', expression: '*/30 * * * *' })

    expect(response.status).toBe(400)
    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(mocks.refreshCronSchedules).not.toHaveBeenCalled()
  })

  it('PUT refuse une expression invalide', async () => {
    const response = await put({ key: 'daily_sync', expression: '61 * * * *' })

    expect(response.status).toBe(400)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('PUT est réservé au SuperUser', async () => {
    mocks.isSuperUserSession.mockResolvedValue(false)
    const response = await put({ key: 'daily_sync', expression: '*/30 * * * *' })

    expect(response.status).toBe(403)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it('DELETE retire le réglage puis laisse le processus des tâches replanifier', async () => {
    const response = await del('daily_lifetime_stats_sync')

    expect(response.status).toBe(200)
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { key: 'daily_lifetime_stats_sync' } })
    expect(mocks.refreshCronSchedules).toHaveBeenCalledTimes(1)
  })

  it('DELETE refuse une tâche inconnue', async () => {
    const response = await del('inconnue')

    expect(response.status).toBe(400)
    expect(mocks.deleteMany).not.toHaveBeenCalled()
  })
})

// Contrôle statique : le 2026-10-27, la route PUT replanifiait la tâche dans le processus qui recevait la requête —
// le web —, ce qui a doublé la synchronisation des parties. Seul cron-jobs.ts planifie, dans le processus des tâches.
describe('planification des tâches', () => {
  const SRC = path.resolve(__dirname, '..')

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name)
      if (statSync(full).isDirectory()) return sourceFiles(full)
      return /\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) ? [full] : []
    })
  }

  it('node-cron ne planifie que dans cron-jobs.ts', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => /cron\.schedule\(|rescheduleJob/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file).replace(/\\/g, '/'))

    expect(offenders).toEqual(['lib/cron-jobs.ts'])
  })
})
