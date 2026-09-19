// Step 0 - Frontend Lightweight Performance Telemetry

export class TelemetryTracker {
  private windowDurationMs = 10000; // 10-second sliding window
  private renderTimes: { val: number; timestamp: number }[] = [];
  private domUpdateTimes: { val: number; timestamp: number }[] = [];
  private wsParseTimes: { val: number; timestamp: number }[] = [];
  private wsHandleTimes: { val: number; timestamp: number }[] = [];
  private drawCalls: { val: number; timestamp: number }[] = [];
  private vehicleCounts: { val: number; timestamp: number }[] = [];
  private rafTimestamps: number[] = [];

  private currentDrawCalls = 0;
  private isCountingDraws = false;

  constructor() {
    this.startRafLoop();
  }

  private startRafLoop() {
    const loop = (now: number) => {
      this.rafTimestamps.push(now);
      const cutoff = now - this.windowDurationMs;
      while (this.rafTimestamps.length > 0 && this.rafTimestamps[0] < cutoff) {
        this.rafTimestamps.shift();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  public recordWsParse(ms: number) {
    const now = performance.now();
    this.wsParseTimes.push({ val: ms, timestamp: now });
    this.prune(this.wsParseTimes, now);
  }

  public recordWsHandle(ms: number) {
    const now = performance.now();
    this.wsHandleTimes.push({ val: ms, timestamp: now });
    this.prune(this.wsHandleTimes, now);
  }

  public recordRender(ms: number) {
    const now = performance.now();
    this.renderTimes.push({ val: ms, timestamp: now });
    this.prune(this.renderTimes, now);
  }

  public recordDomUpdate(ms: number) {
    const now = performance.now();
    this.domUpdateTimes.push({ val: ms, timestamp: now });
    this.prune(this.domUpdateTimes, now);
  }

  public recordDrawCalls(count: number) {
    const now = performance.now();
    this.drawCalls.push({ val: count, timestamp: now });
    this.prune(this.drawCalls, now);
  }

  public recordVehicleCount(count: number) {
    const now = performance.now();
    this.vehicleCounts.push({ val: count, timestamp: now });
    this.prune(this.vehicleCounts, now);
  }

  public startDrawCount() {
    this.currentDrawCalls = 0;
    this.isCountingDraws = true;
  }

  public incrementDraw() {
    if (this.isCountingDraws) {
      this.currentDrawCalls++;
    }
  }

  public endDrawCount(): number {
    this.isCountingDraws = false;
    this.recordDrawCalls(this.currentDrawCalls);
    return this.currentDrawCalls;
  }

  private prune(arr: { val: number; timestamp: number }[], now: number) {
    const cutoff = now - this.windowDurationMs;
    while (arr.length > 0 && arr[0].timestamp < cutoff) {
      arr.shift();
    }
  }

  private calcStats(arr: { val: number; timestamp: number }[]) {
    if (arr.length === 0) return { avg: 0, p95: 0, count: 0 };
    const vals = arr.map(a => a.val).sort((a, b) => a - b);
    const sum = vals.reduce((s, v) => s + v, 0);
    const avg = sum / vals.length;
    const p95Idx = Math.min(vals.length - 1, Math.floor(vals.length * 0.95));
    const p95 = vals[p95Idx];
    return {
      avg: Number(avg.toFixed(2)),
      p95: Number(p95.toFixed(2)),
      count: vals.length
    };
  }

  public getSummary() {
    const renderStats = this.calcStats(this.renderTimes);
    const domStats = this.calcStats(this.domUpdateTimes);
    const parseStats = this.calcStats(this.wsParseTimes);
    const handleStats = this.calcStats(this.wsHandleTimes);
    const drawStats = this.calcStats(this.drawCalls);
    const vehicleStats = this.calcStats(this.vehicleCounts);

    // Sustained FPS
    let sustainedFps = 0;
    if (this.rafTimestamps.length > 1) {
      const elapsedMs = this.rafTimestamps[this.rafTimestamps.length - 1] - this.rafTimestamps[0];
      if (elapsedMs > 0) {
        sustainedFps = Number(((this.rafTimestamps.length - 1) / (elapsedMs / 1000)).toFixed(1));
      }
    }

    const domNodes = document.querySelectorAll('*').length;
    const currentVehicles = this.vehicleCounts.length > 0 ? this.vehicleCounts[this.vehicleCounts.length - 1].val : 0;

    return {
      render_ms: renderStats,
      dom_update_ms: domStats,
      ws_parse_ms: parseStats,
      ws_handle_ms: handleStats,
      draw_calls: drawStats,
      vehicle_count_current: currentVehicles,
      vehicle_count_avg: vehicleStats.avg,
      dom_nodes_total: domNodes,
      sustained_fps: sustainedFps
    };
  }
}

export const frontendTelemetry = new TelemetryTracker();
if (typeof window !== 'undefined') {
  (window as any).__PERF_METRICS__ = frontendTelemetry;
  (window as any).getPerfSummary = () => frontendTelemetry.getSummary();
}
