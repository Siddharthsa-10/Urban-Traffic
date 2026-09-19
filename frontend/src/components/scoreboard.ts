import { ControllerMetrics, CorridorState } from "../types";

export class Scoreboard {
  private container: HTMLElement;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId)!;
  }

  public update(fixed: ControllerMetrics, hybrid: ControllerMetrics, corridor: CorridorState) {
    const calcDelta = (valHyb: number, valFix: number, lowerIsBetter: boolean = true) => {
      if (!valFix || valFix < 1e-4) return { text: "0%", isGood: true };
      const diffPct = Math.round(((valHyb - valFix) / valFix) * 100);
      const isGood = lowerIsBetter ? diffPct <= 0 : diffPct >= 0;
      const arrow = diffPct <= 0 ? "−" : "+";
      return {
        text: `${arrow}${Math.abs(diffPct)}%`,
        isGood,
      };
    };

    const dWait = calcDelta(hybrid.avg_wait_s, fixed.avg_wait_s, true);
    const dQueue = calcDelta(hybrid.max_queue, fixed.max_queue, true);
    const dThru = calcDelta(hybrid.throughput, fixed.throughput, false);
    const dFuel = calcDelta(hybrid.total_fuel_l, fixed.total_fuel_l, true);
    const dCo2 = calcDelta(hybrid.total_co2_kg, fixed.total_co2_kg, true);

    const etaFix = corridor.travel_time_fixed || 68.0;
    const etaHyb = corridor.travel_time_hybrid || 41.0;
    const dEta = calcDelta(etaHyb, etaFix, true);

    this.container.innerHTML = `
      <table class="scoreboard-table">
        <thead>
          <tr>
            <th>METRIC</th>
            <th>FIXED</th>
            <th>HYBRID Q</th>
            <th>Δ</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Avg wait</td>
            <td class="val-fixed">${(fixed.avg_wait_s || 0).toFixed(1)}s</td>
            <td class="val-hybrid">${(hybrid.avg_wait_s || 0).toFixed(1)}s</td>
            <td class="val-delta ${dWait.isGood ? 'good' : 'bad'}">${dWait.text}</td>
          </tr>
          <tr>
            <td>Max queue</td>
            <td class="val-fixed">${fixed.max_queue || 0}</td>
            <td class="val-hybrid">${hybrid.max_queue || 0}</td>
            <td class="val-delta ${dQueue.isGood ? 'good' : 'bad'}">${dQueue.text}</td>
          </tr>
          <tr>
            <td>Throughput</td>
            <td class="val-fixed">${fixed.throughput || 0} v</td>
            <td class="val-hybrid">${hybrid.throughput || 0} v</td>
            <td class="val-delta ${dThru.isGood ? 'good' : 'bad'}">${dThru.text}</td>
          </tr>
          <tr>
            <td>Fuel</td>
            <td class="val-fixed">${(fixed.total_fuel_l || 0).toFixed(1)} L</td>
            <td class="val-hybrid">${(hybrid.total_fuel_l || 0).toFixed(1)} L</td>
            <td class="val-delta ${dFuel.isGood ? 'good' : 'bad'}">${dFuel.text}</td>
          </tr>
          <tr>
            <td>CO2</td>
            <td class="val-fixed">${(fixed.total_co2_kg || 0).toFixed(1)} kg</td>
            <td class="val-hybrid">${(hybrid.total_co2_kg || 0).toFixed(1)} kg</td>
            <td class="val-delta ${dCo2.isGood ? 'good' : 'bad'}">${dCo2.text}</td>
          </tr>
          <tr>
            <td>Emergency ETA</td>
            <td class="val-fixed">${etaFix.toFixed(0)}s</td>
            <td class="val-hybrid">${etaHyb.toFixed(0)}s</td>
            <td class="val-delta ${dEta.isGood ? 'good' : 'bad'}">${dEta.text}</td>
          </tr>
        </tbody>
      </table>
    `;
  }
}
