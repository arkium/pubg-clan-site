export interface MemoryMetrics {
  heapUsed: number
  heapTotal: number
  external: number
  percentUsed: number
  timestamp: Date
}

export class MemoryMonitor {
  private readonly threshold: number
  private readonly criticalThreshold: number
  private readonly gcEnabled: boolean
  private metrics: MemoryMetrics[] = []
  private readonly maxStoredMetrics = 20

  constructor(options?: {
    thresholdPercent?: number
    criticalThresholdPercent?: number
    gcEnabled?: boolean
  }) {
    this.threshold = options?.thresholdPercent ?? 80
    this.criticalThreshold = options?.criticalThresholdPercent ?? 95
    this.gcEnabled = options?.gcEnabled ?? false
  }

  getMetrics(): MemoryMetrics {
    const mem = process.memoryUsage()
    const heapUsed = mem.heapUsed
    const heapTotal = mem.heapTotal
    const external = mem.external ?? 0
    const percentUsed = (heapUsed / heapTotal) * 100

    return {
      heapUsed,
      heapTotal,
      external,
      percentUsed,
      timestamp: new Date(),
    }
  }

  isHighPressure(): boolean {
    const metrics = this.getMetrics()
    return metrics.percentUsed > this.threshold
  }

  isCritical(): boolean {
    const metrics = this.getMetrics()
    return metrics.percentUsed > this.criticalThreshold
  }

  recordMetric(): void {
    const metrics = this.getMetrics()
    this.metrics.push(metrics)

    if (this.metrics.length > this.maxStoredMetrics) {
      this.metrics.shift()
    }
  }

  forceGC(): void {
    if (!this.gcEnabled) {
      return
    }

    try {
      if (typeof global.gc === 'function') {
        global.gc()
      }
    } catch (error) {
      console.warn('[MemoryMonitor] GC not available (use --expose-gc flag)')
    }
  }

  getStoredMetrics(): MemoryMetrics[] {
    return [...this.metrics]
  }

  getAverageHeapUsedPercent(): number {
    if (this.metrics.length === 0) {
      return 0
    }

    const sum = this.metrics.reduce((acc, m) => acc + m.percentUsed, 0)
    return sum / this.metrics.length
  }

  getPeakHeapUsedPercent(): number {
    if (this.metrics.length === 0) {
      return 0
    }

    return Math.max(...this.metrics.map((m) => m.percentUsed))
  }

  formatMetrics(metrics?: MemoryMetrics): string {
    const m = metrics ?? this.getMetrics()
    const heapMB = (m.heapUsed / 1024 / 1024).toFixed(1)
    const totalMB = (m.heapTotal / 1024 / 1024).toFixed(1)

    return `${heapMB}MB / ${totalMB}MB (${m.percentUsed.toFixed(1)}%)`
  }
}
