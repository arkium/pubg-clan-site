import { MemoryMetrics } from './memory-monitor'

export interface WorkerMetricsSnapshot {
  jobsProcessed: number
  jobsSucceeded: number
  jobsFailed: number
  avgDurationMs: number
  peakMemory: number
  currentMemory: number
  lastJobAt: Date | null
  isHealthy: boolean
}

export class WorkerHealthMonitor {
  private jobsProcessed = 0
  private jobsSucceeded = 0
  private jobsFailed = 0
  private totalDurationMs = 0
  private peakMemory = 0
  private currentMemory = 0
  private lastJobAt: Date | null = null
  private startedAt: Date
  private memoryMetrics: MemoryMetrics[] = []
  private readonly maxMemoryMetrics = 50

  constructor() {
    this.startedAt = new Date()
  }

  recordJobStart(): void {
    // Reset for new job (but we track duration separately)
  }

  recordJobEnd(success: boolean, durationMs: number): void {
    this.jobsProcessed++
    if (success) {
      this.jobsSucceeded++
    } else {
      this.jobsFailed++
    }
    this.totalDurationMs += durationMs
    this.lastJobAt = new Date()
  }

  recordMemorySample(metrics: MemoryMetrics): void {
    this.currentMemory = metrics.heapUsed
    if (metrics.heapUsed > this.peakMemory) {
      this.peakMemory = metrics.heapUsed
    }

    this.memoryMetrics.push(metrics)
    if (this.memoryMetrics.length > this.maxMemoryMetrics) {
      this.memoryMetrics.shift()
    }
  }

  getMetrics(): WorkerMetricsSnapshot {
    const avgDurationMs =
      this.jobsProcessed > 0 ? Math.round(this.totalDurationMs / this.jobsProcessed) : 0

    return {
      jobsProcessed: this.jobsProcessed,
      jobsSucceeded: this.jobsSucceeded,
      jobsFailed: this.jobsFailed,
      avgDurationMs,
      peakMemory: this.peakMemory,
      currentMemory: this.currentMemory,
      lastJobAt: this.lastJobAt,
      isHealthy: this.jobsFailed < this.jobsProcessed * 0.5, // Healthy if < 50% failure
    }
  }

  getUptimeMs(): number {
    return Date.now() - this.startedAt.getTime()
  }

  getMemoryTrend(): 'stable' | 'rising' | 'falling' {
    if (this.memoryMetrics.length < 3) {
      return 'stable'
    }

    const recent = this.memoryMetrics.slice(-3)
    const firstMemory = recent[0].heapUsed
    const lastMemory = recent[recent.length - 1].heapUsed
    const diff = lastMemory - firstMemory

    if (diff > 10 * 1024 * 1024) {
      // > 10MB increase
      return 'rising'
    }
    if (diff < -10 * 1024 * 1024) {
      // > 10MB decrease
      return 'falling'
    }

    return 'stable'
  }

  formatMetrics(m: WorkerMetricsSnapshot): string {
    return (
      `Jobs: ${m.jobsProcessed} (${m.jobsSucceeded}✓ ${m.jobsFailed}✗) | ` +
      `Avg: ${m.avgDurationMs}ms | ` +
      `Mem: ${(m.currentMemory / 1024 / 1024).toFixed(1)}MB / Peak: ${(m.peakMemory / 1024 / 1024).toFixed(1)}MB | ` +
      `Health: ${m.isHealthy ? '✓' : '⚠'}`
    )
  }
}
