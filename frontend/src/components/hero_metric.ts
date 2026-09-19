import { ControllerMetrics } from "../types";

export class HeroMetric {
  private container: HTMLElement;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId)!;
  }

  public update(metricsHybrid: ControllerMetrics, metricsFixed: ControllerMetrics, viewMode: string) {
    const waitHyb = metricsHybrid.avg_wait_s || 0;
    const waitFix = metricsFixed.avg_wait_s || 0;

    let deltaPct = 0;
    if (waitFix > 0.1) {
      deltaPct = Math.round(((waitHyb - waitFix) / waitFix) * 100);
    }
    const deltaSign = deltaPct <= 0 ? "" : "+";
    const deltaClass = deltaPct <= 0 ? "good" : "bad";

    if (viewMode === "split") {
      this.container.innerHTML = `
        <div class="hero-metric-overlay split-left">
          <div class="hero-label">TRADITIONAL · FIXED-TIME</div>
          <div class="hero-value" style="color: var(--color-sodium);">${waitFix.toFixed(1)}s</div>
        </div>
        <div class="hero-metric-overlay split-right">
          <div class="hero-label">OURS · HYBRID QUANTUM</div>
          <div class="hero-value" style="color: var(--color-quantum);">
            ${waitHyb.toFixed(1)}s
            <span class="hero-delta ${deltaClass}">(${deltaSign}${deltaPct}% vs fixed)</span>
          </div>
        </div>
      `;
    } else {
      this.container.innerHTML = `
        <div class="hero-metric-overlay">
          <div class="hero-label">AVG VEHICLE WAIT TIME</div>
          <div class="hero-value">
            ${waitHyb.toFixed(1)}s
            <span class="hero-delta ${deltaClass}">(${deltaSign}${deltaPct}% vs fixed)</span>
          </div>
        </div>
      `;
    }
  }
}
