import { MemoryMonitor } from './memory-monitor'

export class BackpressureController {
  private readonly monitor: MemoryMonitor
  private readonly highPressureDelayMs: number
  private readonly criticalPauseDelayMs: number
  private isPaused = false

  constructor(monitor: MemoryMonitor, options?: {
    highPressureDelayMs?: number
    criticalPauseDelayMs?: number
  }) {
    this.monitor = monitor
    this.highPressureDelayMs = options?.highPressureDelayMs ?? 5000
    this.criticalPauseDelayMs = options?.criticalPauseDelayMs ?? 2000
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  async ensureMemoryAvailable(workerId: string, maxRetries = 3): Promise<void> {
    let retries = 0

    while (retries < maxRetries) {
      if (this.monitor.isCritical()) {
        this.isPaused = true
        const metrics = this.monitor.getMetrics()
        console.log(
          `[Backpressure] CRITICAL: ${this.monitor.formatMetrics(metrics)}. Worker paused.`
        )
        this.monitor.recordMetric()
        await this.sleep(this.criticalPauseDelayMs)
        retries++
        continue
      }

      if (this.monitor.isHighPressure()) {
        const metrics = this.monitor.getMetrics()
        console.log(
          `[Backpressure] HIGH: ${this.monitor.formatMetrics(metrics)}. Waiting before next job...`
        )
        this.monitor.recordMetric()
        await this.sleep(this.highPressureDelayMs)
        retries++
        continue
      }

      this.isPaused = false
      this.monitor.recordMetric()
      break
    }

    if (retries >= maxRetries && this.monitor.isCritical()) {
      const metrics = this.monitor.getMetrics()
      const error = new Error(
        `[Backpressure] CRITICAL after ${maxRetries} retries: ${this.monitor.formatMetrics(metrics)}`
      )
      console.error(error.message)
      throw error
    }
  }

  async processWithBackpressure<T>(
    fn: () => Promise<T>,
    jobId: string,
    workerId: string
  ): Promise<T> {
    await this.ensureMemoryAvailable(workerId)

    try {
      const result = await fn()
      this.monitor.forceGC()
      this.monitor.recordMetric()
      return result
    } catch (error) {
      this.monitor.recordMetric()
      throw error
    }
  }

  isPressureActive(): boolean {
    return this.monitor.isHighPressure() || this.isPaused
  }

  getStatus() {
    const metrics = this.monitor.getMetrics()
    return {
      isPaused: this.isPaused,
      isHighPressure: this.monitor.isHighPressure(),
      isCritical: this.monitor.isCritical(),
      currentMemory: this.monitor.formatMetrics(metrics),
      metrics,
    }
  }
}
