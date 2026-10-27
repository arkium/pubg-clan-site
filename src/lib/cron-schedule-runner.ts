/**
 * Horaires des tâches planifiées. Un horaire vient de la base (`CronSchedule`, page /settings/cron), sinon du .env,
 * sinon du défaut du code.
 *
 * Seul le processus des tâches (`ENABLE_CRON_JOBS`, le service cron) porte des tâches : la page enregistre en base
 * depuis le web, et ce processus relit la base chaque minute (`refresh`). Une route ne planifie jamais rien — le
 * 2026-10-27, un horaire changé depuis la page avait lancé une seconde synchronisation des parties dans le web.
 */

export type CronScheduleSource = 'db' | 'env' | 'default'

export type CronScheduleSpec<K extends string> = {
  key: K
  envVar: string
  defaultExpression: string
  run: () => Promise<void>
}

export type CronRunnerTask = { stop: () => void }

type Env = Record<string, string | undefined>

/** Délai de reprise d'un horaire changé depuis la page, par le processus des tâches. */
export const CRON_SCHEDULE_REFRESH_MS = 60_000

/**
 * Horaire effectif : la ligne `CronSchedule` de la tâche, sinon le .env (une valeur vide ne compte pas), sinon le
 * défaut du code. Seule règle du site : la page des tâches, le service cron et les pages qui annoncent un délai.
 */
export function resolveCronSchedule(
  spec: Pick<CronScheduleSpec<string>, 'envVar' | 'defaultExpression'>,
  override: string | null | undefined,
  env: Env
): { expression: string; source: CronScheduleSource } {
  const fromDb = override?.trim()
  if (fromDb) return { expression: fromDb, source: 'db' }
  const fromEnv = env[spec.envVar]?.trim()
  if (fromEnv) return { expression: fromEnv, source: 'env' }
  return { expression: spec.defaultExpression, source: 'default' }
}

export function createCronScheduleRunner<K extends string>(options: {
  specs: ReadonlyArray<CronScheduleSpec<K>>
  loadOverrides: () => Promise<ReadonlyMap<string, string>>
  schedule: (expression: string, run: () => Promise<void>) => CronRunnerTask
  validate: (expression: string) => boolean
  env?: () => Env
  timezone: string
  log?: Pick<Console, 'info' | 'warn'>
}) {
  const env = options.env ?? (() => process.env)
  const log = options.log ?? console
  const applied = new Map<K, { expression: string; task: CronRunnerTask }>()
  // Dernière expression refusée par tâche : une ligne invalide en base n'est signalée qu'une fois, pas chaque minute.
  const rejected = new Map<K, string>()

  function apply(spec: CronScheduleSpec<K>, expression: string, verb: string) {
    applied.get(spec.key)?.task.stop()
    applied.set(spec.key, { expression, task: options.schedule(expression, spec.run) })
    rejected.delete(spec.key)
    log.info(`[Cron] "${spec.key}" ${verb} "${expression}" (${options.timezone})`)
  }

  return {
    /** Planifie chaque tâche ; une expression invalide laisse la tâche sur le défaut du code. */
    async start() {
      const overrides = await options.loadOverrides()
      for (const spec of options.specs) {
        const { expression } = resolveCronSchedule(spec, overrides.get(spec.key), env())
        if (options.validate(expression)) {
          apply(spec, expression, 'scheduled with')
        } else {
          log.warn(`[Cron] "${spec.key}": invalid expression "${expression}", default "${spec.defaultExpression}" used`)
          apply(spec, spec.defaultExpression, 'scheduled with')
        }
      }
    },

    /** Replanifie les tâches dont l'horaire effectif a changé et rend leurs clés ; rien avant `start`. */
    async refresh(): Promise<K[]> {
      if (applied.size === 0) return []
      let overrides: ReadonlyMap<string, string>
      try {
        overrides = await options.loadOverrides()
      } catch (error) {
        log.warn('[Cron] Schedules not refreshed: overrides unreadable', error)
        return []
      }

      const changed: K[] = []
      for (const spec of options.specs) {
        const { expression } = resolveCronSchedule(spec, overrides.get(spec.key), env())
        const current = applied.get(spec.key)?.expression
        if (current === expression) continue
        if (!options.validate(expression)) {
          if (rejected.get(spec.key) !== expression) {
            log.warn(`[Cron] "${spec.key}" keeps "${current}": invalid expression "${expression}"`)
            rejected.set(spec.key, expression)
          }
          continue
        }
        apply(spec, expression, 'rescheduled to')
        changed.push(spec.key)
      }
      return changed
    },

    expressionOf(key: K): string | null {
      return applied.get(key)?.expression ?? null
    },
  }
}

export type CronScheduleRunner<K extends string> = ReturnType<typeof createCronScheduleRunner<K>>
