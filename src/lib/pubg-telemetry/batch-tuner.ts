import { WorkerHealthMonitor } from './worker-health'
import { MemoryMonitor } from './memory-monitor'

export class BatchSizeTuner {
  private readonly health: WorkerHealthMonitor
  private readonly monitor: MemoryMonitor
  private currentBatchSize: number
  private recommendedBatchSize: number
  private lastAdjustmentTime: Date | null = null
  private readonly adjustmentCooldownMs = 60000 // 1 minute

  constructor(health: WorkerHealthMonitor, monitor: MemoryMonitor, initialBatchSize = 5) {
    this.health = health
    this.monitor = monitor
    this.currentBatchSize = initialBatchSize
    this.recommendedBatchSize = initialBatchSize
  }

  analyze(): {
    currentBatchSize: number
    recommendedBatchSize: number
    reason: string
    shouldAdjust: boolean
  } {
    const now = Date.now()
    const timeSinceLastAdjustment = this.lastAdjustmentTime
      ? now - this.lastAdjustmentTime.getTime()
      : Infinity

    // Check if we should even consider adjustment
    if (timeSinceLastAdjustment < this.adjustmentCooldownMs) {
      return {
        currentBatchSize: this.currentBatchSize,
        recommendedBatchSize: this.recommendedBatchSize,
        reason: 'Adjustment cooldown active',
        shouldAdjust: false,
      }
    }

    const metrics = this.health.getMetrics()
    const memoryStatus = this.monitor.getMetrics()
    const trend = this.health.getMemoryTrend()

    // If critical memory pressure
    if (this.monitor.isCritical()) {
      const rec = Math.max(1, this.currentBatchSize - 2)
      if (rec !== this.recommendedBatchSize) {
        this.recommendedBatchSize = rec
        this.lastAdjustmentTime = new Date()
        return {
          currentBatchSize: this.currentBatchSize,
          recommendedBatchSize: rec,
          reason: `Memory critical (${memoryStatus.percentUsed.toFixed(1)}%). Reduce batch size.`,
          shouldAdjust: true,
        }
      }
    }

    // If high memory pressure with slow jobs
    if (this.monitor.isHighPressure() && metrics.avgDurationMs > 10000) {
      const rec = Math.max(1, this.currentBatchSize - 1)
      if (rec !== this.recommendedBatchSize) {
        this.recommendedBatchSize = rec
        this.lastAdjustmentTime = new Date()
        return {
          currentBatchSize: this.currentBatchSize,
          recommendedBatchSize: rec,
          reason: `High memory (${memoryStatus.percentUsed.toFixed(1)}%) with slow jobs (${metrics.avgDurationMs}ms avg). Reduce batch size.`,
          shouldAdjust: true,
        }
      }
    }

    // If memory is dropping and we're low, increase batch size
    if (trend === 'falling' && !this.monitor.isHighPressure() && this.currentBatchSize < 5) {
      const rec = Math.min(5, this.currentBatchSize + 1)
      if (rec !== this.recommendedBatchSize) {
        this.recommendedBatchSize = rec
        this.lastAdjustmentTime = new Date()
        return {
          currentBatchSize: this.currentBatchSize,
          recommendedBatchSize: rec,
          reason: `Memory pressure easing (${memoryStatus.percentUsed.toFixed(1)}%, trend: ${trend}). Increase batch size.`,
          shouldAdjust: true,
        }
      }
    }

    return {
      currentBatchSize: this.currentBatchSize,
      recommendedBatchSize: this.recommendedBatchSize,
      reason: 'Batch size optimal',
      shouldAdjust: false,
    }
  }

  updateBatchSize(newSize: number): void {
    if (newSize > 0 && newSize <= 20) {
      this.currentBatchSize = newSize
      this.lastAdjustmentTime = new Date()
    }
  }

  getCurrentBatchSize(): number {
    return this.currentBatchSize
  }

  getRecommendedBatchSize(): number {
    return this.recommendedBatchSize
  }

  getAnalysis(): string {
    const analysis = this.analyze()
    return (
      `Batch: ${analysis.currentBatchSize} (rec: ${analysis.recommendedBatchSize}) - ` +
      `${analysis.reason}`
    )
  }
}
