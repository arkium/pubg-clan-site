import { describe, expect, it, vi } from 'vitest'

import { createCronScheduleRunner, resolveCronSchedule, type CronScheduleSpec } from '@/lib/cron-schedule-runner'

type Key = 'daily_sync' | 'daily_lifetime_stats_sync'

const run = async () => undefined
const SPECS: CronScheduleSpec<Key>[] = [
  { key: 'daily_sync', envVar: 'CLAN_MATCH_SYNC_CRON', defaultExpression: '*/30 * * * *', run },
  { key: 'daily_lifetime_stats_sync', envVar: 'CLAN_LIFETIME_STATS_SYNC_CRON', defaultExpression: '0 */4 * * *', run },
]

function setup(options: { overrides?: Record<string, string>; env?: Record<string, string>; invalid?: string[] } = {}) {
  const state = { overrides: new Map(Object.entries(options.overrides ?? {})), env: options.env ?? {} }
  const tasks: Array<{ expression: string; stop: ReturnType<typeof vi.fn> }> = []
  const schedule = vi.fn((expression: string) => {
    const task = { expression, stop: vi.fn() }
    tasks.push(task)
    return task
  })
  const loadOverrides = vi.fn(async () => state.overrides)
  const log = { info: vi.fn(), warn: vi.fn() }
  const runner = createCronScheduleRunner<Key>({
    specs: SPECS,
    loadOverrides,
    schedule,
    validate: (expression) => !(options.invalid ?? []).includes(expression),
    env: () => state.env,
    timezone: 'Europe/Paris',
    log,
  })
  return { runner, state, tasks, schedule, loadOverrides, log }
}

describe('resolveCronSchedule', () => {
  const spec = SPECS[1]

  it('prend la base, sinon le .env, sinon le défaut du code', () => {
    const env = { CLAN_LIFETIME_STATS_SYNC_CRON: '0 4 * * *' }
    expect(resolveCronSchedule(spec, '0 1 * * *', env)).toEqual({ expression: '0 1 * * *', source: 'db' })
    expect(resolveCronSchedule(spec, null, env)).toEqual({ expression: '0 4 * * *', source: 'env' })
    expect(resolveCronSchedule(spec, undefined, {})).toEqual({ expression: '0 */4 * * *', source: 'default' })
  })

  it('ignore une valeur vide', () => {
    expect(resolveCronSchedule(spec, ' ', { CLAN_LIFETIME_STATS_SYNC_CRON: '' })).toEqual({
      expression: '0 */4 * * *',
      source: 'default',
    })
  })
})

describe('createCronScheduleRunner', () => {
  it('planifie chaque tâche au démarrage, avec son horaire effectif', async () => {
    const { runner, schedule } = setup({ overrides: { daily_sync: '*/15 * * * *' }, env: { CLAN_LIFETIME_STATS_SYNC_CRON: '0 4 * * *' } })
    await runner.start()

    expect(schedule.mock.calls.map(([expression]) => expression)).toEqual(['*/15 * * * *', '0 4 * * *'])
    expect(runner.expressionOf('daily_sync')).toBe('*/15 * * * *')
  })

  it('garde le défaut du code pour une expression invalide au démarrage', async () => {
    const { runner, log } = setup({ env: { CLAN_MATCH_SYNC_CRON: 'n importe quoi' }, invalid: ['n importe quoi'] })
    await runner.start()

    expect(runner.expressionOf('daily_sync')).toBe('*/30 * * * *')
    expect(log.warn).toHaveBeenCalledTimes(1)
  })

  it('ne planifie rien sans démarrage : un processus sans tâches (le web) ne lit même pas la base', async () => {
    const { runner, schedule, loadOverrides } = setup({ overrides: { daily_sync: '*/15 * * * *' } })

    expect(await runner.refresh()).toEqual([])
    expect(loadOverrides).not.toHaveBeenCalled()
    expect(schedule).not.toHaveBeenCalled()
  })

  it('reprend un horaire changé en base : l’ancienne tâche est arrêtée, une seule nouvelle part', async () => {
    const { runner, state, tasks, schedule } = setup()
    await runner.start()
    expect(await runner.refresh()).toEqual([])

    state.overrides.set('daily_sync', '*/15 * * * *')
    expect(await runner.refresh()).toEqual(['daily_sync'])
    expect(tasks[0].stop).toHaveBeenCalledTimes(1)
    expect(tasks[1].stop).not.toHaveBeenCalled()
    expect(schedule).toHaveBeenCalledTimes(3)
    expect(runner.expressionOf('daily_sync')).toBe('*/15 * * * *')

    // Même horaire au passage suivant : rien ne bouge.
    expect(await runner.refresh()).toEqual([])
    expect(schedule).toHaveBeenCalledTimes(3)
  })

  it('revient au .env, sinon au défaut, quand le réglage de la base est retiré', async () => {
    const { runner, state } = setup({
      overrides: { daily_sync: '0 * * * *', daily_lifetime_stats_sync: '0 4 * * *' },
      env: { CLAN_MATCH_SYNC_CRON: '*/20 * * * *' },
    })
    await runner.start()

    state.overrides.clear()
    expect(await runner.refresh()).toEqual(['daily_sync', 'daily_lifetime_stats_sync'])
    expect(runner.expressionOf('daily_sync')).toBe('*/20 * * * *')
    expect(runner.expressionOf('daily_lifetime_stats_sync')).toBe('0 */4 * * *')
  })

  it('garde l’horaire en cours devant une expression invalide en base, signalée une seule fois', async () => {
    const { runner, state, schedule, log } = setup({ invalid: ['61 * * * *'] })
    await runner.start()

    state.overrides.set('daily_sync', '61 * * * *')
    expect(await runner.refresh()).toEqual([])
    expect(await runner.refresh()).toEqual([])
    expect(runner.expressionOf('daily_sync')).toBe('*/30 * * * *')
    expect(schedule).toHaveBeenCalledTimes(2)
    expect(log.warn).toHaveBeenCalledTimes(1)
  })

  it('garde les tâches en place quand la base ne répond pas', async () => {
    const { runner, loadOverrides, tasks } = setup()
    await runner.start()

    loadOverrides.mockRejectedValueOnce(new Error('connexion perdue'))
    expect(await runner.refresh()).toEqual([])
    expect(tasks.every((task) => task.stop.mock.calls.length === 0)).toBe(true)
  })
})
