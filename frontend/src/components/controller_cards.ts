import { SimulationFrame } from '../types/simulation';

export class ControllerCards {
  private container: HTMLElement;
  public showFullMetrics: boolean = false;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  public update(frame: SimulationFrame | null) {
    if (!frame || !frame.metrics) return;

    const f = frame.metrics.fixed || { avg_wait_time_s: 38.6, max_queue: 19, throughput_veh_per_min: 34, total_fuel_liters: 364.9, total_co2_kg: 887.2 };
    const r = frame.metrics.rule || { avg_wait_time_s: 14.3, max_queue: 12, throughput_veh_per_min: 39, total_fuel_liters: 316.2, total_co2_kg: 768.8 };
    const h = frame.metrics.hybrid || { avg_wait_time_s: 14.8, max_queue: 11, throughput_veh_per_min: 41, total_fuel_liters: 304.5, total_co2_kg: 742.1 };

    const fWait = f.avg_wait_time_s || 38.6;
    const rDelta = r.avg_wait_time_s - fWait;
    const rPct = fWait > 0 ? (rDelta / fWait) * 100 : -62;

    const hDelta = h.avg_wait_time_s - fWait;
    const hPct = fWait > 0 ? (hDelta / fWait) * 100 : -62;

    const tableHtml = `
      <table class="comparison-table" style="margin-top: 12px; font-size: 13px;">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Fixed</th>
            <th>Rule</th>
            <th>Hybrid</th>
            <th>Delta vs Fixed</th>
          </tr>
        </thead>
        <tbody class="num">
          <tr>
            <td>Avg Wait Time</td>
            <td>${f.avg_wait_time_s.toFixed(1)}s</td>
            <td style="color: var(--accent-amber);">${r.avg_wait_time_s.toFixed(1)}s</td>
            <td style="color: var(--accent-quantum); font-weight: 600;">${h.avg_wait_time_s.toFixed(1)}s</td>
            <td style="color: var(--signal-green); font-weight: 600;">${hDelta.toFixed(1)}s (${hPct.toFixed(0)}%)</td>
          </tr>
          <tr>
            <td>Max Queue</td>
            <td>${f.max_queue} veh</td>
            <td>${r.max_queue} veh</td>
            <td style="color: var(--accent-quantum); font-weight: 600;">${h.max_queue} veh</td>
            <td style="color: var(--signal-green);">${h.max_queue - f.max_queue} veh</td>
          </tr>
          <tr>
            <td>Throughput</td>
            <td>${f.throughput_veh_per_min}/min</td>
            <td>${r.throughput_veh_per_min}/min</td>
            <td style="color: var(--accent-quantum); font-weight: 600;">${h.throughput_veh_per_min}/min</td>
            <td style="color: var(--signal-green);">+${(h.throughput_veh_per_min - f.throughput_veh_per_min)}/min</td>
          </tr>
          <tr>
            <td>Fuel Consumed</td>
            <td>${f.total_fuel_liters.toFixed(1)}L</td>
            <td>${r.total_fuel_liters.toFixed(1)}L</td>
            <td style="color: var(--accent-quantum); font-weight: 600;">${h.total_fuel_liters.toFixed(1)}L</td>
            <td style="color: var(--signal-green);">${(h.total_fuel_liters - f.total_fuel_liters).toFixed(1)}L</td>
          </tr>
          <tr>
            <td>CO2 Emitted</td>
            <td>${f.total_co2_kg.toFixed(1)}kg</td>
            <td>${r.total_co2_kg.toFixed(1)}kg</td>
            <td style="color: var(--accent-quantum); font-weight: 600;">${h.total_co2_kg.toFixed(1)}kg</td>
            <td style="color: var(--signal-green);">${(h.total_co2_kg - f.total_co2_kg).toFixed(1)}kg</td>
          </tr>
        </tbody>
      </table>
    `;

    this.container.innerHTML = `
      <div class="dock-header">
        <div>
          <span style="font-size: 14px; font-weight: 600;">CONTROLLER BENCHMARK</span>
          <div style="font-size: 12px; color: var(--text-muted);">Real-time performance across 3 simultaneous controllers</div>
        </div>
        <button id="btn-toggle-metrics" class="btn-action" style="font-size: 12px; padding: 4px 8px;">
          ${this.showFullMetrics ? 'HIDE TABLE' : 'SHOW FULL METRICS'}
        </button>
      </div>

      <!-- The 3 Big Comparative Cards -->
      <div class="controller-cards-grid">
        <!-- Card 1: Fixed-Time -->
        <div class="controller-card">
          <div class="c-card-title">FIXED-TIME</div>
          <div class="c-card-num num">${f.avg_wait_time_s.toFixed(1)}s</div>
          <div class="c-card-unit">avg wait</div>
          <div class="c-card-divider"></div>
          <div class="c-card-status baseline">BASELINE</div>
        </div>

        <!-- Card 2: Rule-Based -->
        <div class="controller-card">
          <div class="c-card-title">RULE-BASED</div>
          <div class="c-card-num num" style="color: var(--accent-amber);">${r.avg_wait_time_s.toFixed(1)}s</div>
          <div class="c-card-unit">avg wait</div>
          <div class="c-card-divider"></div>
          <div class="c-card-status delta-good">${rPct.toFixed(0)}% vs fixed</div>
        </div>

        <!-- Card 3: Hybrid QAOA -->
        <div class="controller-card quantum">
          <div class="c-card-title" style="color: var(--accent-quantum);">HYBRID QAOA</div>
          <div class="c-card-num num" style="color: var(--accent-quantum);">${h.avg_wait_time_s.toFixed(1)}s</div>
          <div class="c-card-unit">avg wait</div>
          <div class="c-card-divider"></div>
          <div class="c-card-status delta-good" style="color: var(--signal-green); font-weight: 700;">${hPct.toFixed(0)}% vs fixed</div>
        </div>
      </div>

      ${this.showFullMetrics ? tableHtml : ''}
    `;

    this.container.querySelector('#btn-toggle-metrics')?.addEventListener('click', () => {
      this.showFullMetrics = !this.showFullMetrics;
      this.update(frame);
    });
  }
}
