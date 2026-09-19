export type OperationsView = "live" | "simulation" | "scenarios" | "optimizer" | "comparison" | "analytics" | "decision_log";

export class TopBar {
  private container: HTMLElement;
  public onViewChange?: (view: OperationsView) => void;
  public onGuidedDemoClick?: () => void;
  public onHomeClick?: () => void;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId)!;
    this.render();
  }

  private render() {
    this.container.innerHTML = `
      <div class="brand-section" id="btn-brand-home" style="cursor: pointer;" title="Open Digital Twin Architecture & Overview">
        <div class="brand-title">THE NIGHT SHIFT</div>
        <div class="brand-subtitle">Predictive Urban Traffic Digital Twin</div>
      </div>

      <div class="view-tabs" id="operations-nav-tabs">
        <button class="view-tab active" data-view="live">LIVE TWIN</button>
        <button class="view-tab" data-view="simulation">SIMULATION</button>
        <button class="view-tab" data-view="scenarios">SCENARIOS</button>
        <button class="view-tab" data-view="optimizer">OPTIMIZER</button>
        <button class="view-tab" data-view="comparison">COMPARISON</button>
        <button class="view-tab" data-view="analytics">ANALYTICS</button>
        <button class="view-tab" data-view="decision_log">DECISION LOG</button>
      </div>

      <div class="status-tray">
        <div class="status-badge" id="badge-sim-live-status" style="display: flex; align-items: center; gap: 6px; font-weight: 700; font-size: 11px; padding: 4px 10px; border-radius: 4px; border: 1px solid rgba(0, 255, 136, 0.4); background: rgba(0, 30, 20, 0.6); color: #00ff88; letter-spacing: 0.5px;">
          <span class="pulse-dot" id="dot-sim-live" style="background: #00ff88; box-shadow: 0 0 8px #00ff88;"></span>
          <span id="txt-sim-live-status">● SIMULATION LIVE · 00:00:00 · 0 VEHICLES</span>
        </div>
        <div class="status-badge quantum" id="badge-quantum-status" title="Honest Quantum Optimization Method">
          <span class="pulse-dot"></span>
          <span id="txt-quantum-status">QAOA Sim (Qiskit Aer) · Optimal</span>
        </div>
        <div class="status-badge classical" id="badge-weather">
          <span id="txt-weather">CLEAR</span>
        </div>
        <button class="btn-guided-demo" id="btn-guided-demo">GUIDED DEMO</button>
      </div>
    `;

    // View tab click listeners
    const tabs = this.container.querySelectorAll<HTMLButtonElement>(".view-tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const view = tab.getAttribute("data-view") as OperationsView;
        if (this.onViewChange) this.onViewChange(view);
      });
    });

    const demoBtn = this.container.querySelector("#btn-guided-demo")!;
    demoBtn.addEventListener("click", () => {
      if (this.onGuidedDemoClick) this.onGuidedDemoClick();
    });

    const brandEl = this.container.querySelector("#btn-brand-home")!;
    brandEl.addEventListener("click", () => {
      if (this.onHomeClick) this.onHomeClick();
    });
  }

  public setActiveView(view: OperationsView) {
    const tabs = this.container.querySelectorAll<HTMLButtonElement>(".view-tab");
    tabs.forEach((tab) => {
      tab.classList.toggle("active", tab.getAttribute("data-view") === view);
    });
  }

  public updateStatus(fallbackLevel: string, weather: string) {
    const txtQuantum = document.getElementById("txt-quantum-status");
    const badgeQuantum = document.getElementById("badge-quantum-status");
    const txtWeather = document.getElementById("txt-weather");

    if (txtQuantum && badgeQuantum) {
      if (fallbackLevel === "QUANTUM_OPTIMAL") {
        txtQuantum.textContent = "QAOA Sim (Qiskit Aer) · Optimal";
        badgeQuantum.className = "status-badge quantum";
      } else if (fallbackLevel === "CLASSICAL_EXACT") {
        txtQuantum.textContent = "Fallback: Classical Exact";
        badgeQuantum.className = "status-badge classical";
      } else {
        txtQuantum.textContent = `Fallback: ${fallbackLevel}`;
        badgeQuantum.className = "status-badge classical";
      }
    }

    if (txtWeather) {
      txtWeather.textContent = weather;
    }
  }

  public updateSimulationStatus(state: "live" | "paused" | "disconnected", simTimeS: number = 0, vehicleCount: number = 0) {
    const badge = document.getElementById("badge-sim-live-status");
    const dot = document.getElementById("dot-sim-live");
    const txt = document.getElementById("txt-sim-live-status");
    if (!badge || !dot || !txt) return;

    const totalSec = Math.floor(simTimeS);
    const hh = Math.floor(totalSec / 3600).toString().padStart(2, "0");
    const mm = Math.floor((totalSec % 3600) / 60).toString().padStart(2, "0");
    const ss = Math.floor(totalSec % 60).toString().padStart(2, "0");
    const timeStr = `${hh}:${mm}:${ss}`;

    if (state === "live") {
      badge.style.borderColor = "rgba(0, 255, 136, 0.4)";
      badge.style.background = "rgba(0, 30, 20, 0.6)";
      dot.style.background = "#00ff88";
      dot.style.boxShadow = "0 0 8px #00ff88";
      txt.style.color = "#00ff88";
      txt.textContent = `● SIMULATION LIVE · ${timeStr} · ${vehicleCount} VEHICLES`;
    } else if (state === "paused") {
      badge.style.borderColor = "rgba(255, 187, 0, 0.4)";
      badge.style.background = "rgba(40, 30, 0, 0.6)";
      dot.style.background = "#ffbb00";
      dot.style.boxShadow = "0 0 8px #ffbb00";
      txt.style.color = "#ffbb00";
      txt.textContent = `Ⅱ SIMULATION PAUSED · ${timeStr} · ${vehicleCount} VEHICLES`;
    } else {
      badge.style.borderColor = "rgba(255, 68, 68, 0.4)";
      badge.style.background = "rgba(40, 10, 10, 0.6)";
      dot.style.background = "#ff4444";
      dot.style.boxShadow = "0 0 8px #ff4444";
      txt.style.color = "#ff4444";
      txt.textContent = `○ SERVER DISCONNECTED`;
    }
  }
}
