declare module 'node-cron' {
  export type ScheduledTask = {
    start: () => void
    stop: () => void
    destroy?: () => void
  }

  export type ScheduleOptions = {
    scheduled?: boolean
    timezone?: string
    recoverMissedExecutions?: boolean
    name?: string
  }

  export function schedule(
    expression: string,
    func: () => void | Promise<void>,
    options?: ScheduleOptions
  ): ScheduledTask

  const cron: {
    schedule: typeof schedule
  }

  export default cron
}
