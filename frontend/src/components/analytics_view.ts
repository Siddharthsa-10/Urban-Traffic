export class AnalyticsView {
  private container: HTMLElement;
  private pollInterval: number | null = null;
  private isVisible: boolean = false;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId)!;
    this.render();
  }

  public show() {
    this.container.classList.add("active");
    this.isVisible = true;
    this.fetchDataAndDraw();
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = window.setInterval(() => this.fetchDataAndDraw(), 1000);
  }

  public hide() {
    this.container.classList.remove("active");
    this.isVisible = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private render() {
    this.container.innerHTML = `
      <div class="scenarios-modal-card" style="width: 1040px; max-height: 90vh; overflow-y: auto; background: #14110F; border: 1px solid var(--color-panel-border); border-radius: 6px; padding: 24px; box-shadow: 0 16px 40px rgba(0,0,0,0.85); color: var(--color-paper); margin: auto;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-panel-border); padding-bottom: 14px;">
          <div>
            <div style="font-size: 11px; font-family: var(--font-mono); color: var(--color-quantum); letter-spacing: 0.08em;">
              OPERATIONS AUDIT & TELEMETRY
            </div>
            <div style="font-size: 20px; font-weight: 700; color: var(--color-paper); margin-top: 2px;">
              Digital Twin Performance Analytics
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span style="font-family: var(--font-mono); font-size: 11px; color: var(--color-paper-muted);" id="analytics-sim-badge">
              LIVE SIMULATION
            </span>
            <button class="btn-cancel" id="btn-close-analytics" style="padding: 6px 14px;">✕ Close</button>
          </div>
        </div>

        <!-- KPI Cards Row -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 18px;" id="analytics-kpi-row">
          <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 4px; padding: 12px;">
            <div style="font-size: 11px; color: var(--color-paper-muted);">Resilience Index</div>
            <div style="font-size: 24px; font-weight: 700; color: var(--color-paper); margin-top: 4px;" id="kpi-resilience">--</div>
            <div style="font-size: 10px; color: var(--color-signal-green); margin-top: 2px;" id="kpi-resilience-sub">Adaptive System Stability</div>
          </div>
          <div style="display: grid; background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 4px; padding: 12px;">
            <div style="font-size: 11px; color: var(--color-paper-muted);">Decision Confidence</div>
            <div style="font-size: 24px; font-weight: 700; color: var(--color-quantum); margin-top: 4px;" id="kpi-confidence">--%</div>
            <div style="font-size: 10px; color: var(--color-paper-muted); margin-top: 2px;">Dynamic Platoon Stability</div>
          </div>
          <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 4px; padding: 12px;">
            <div style="font-size: 11px; color: var(--color-paper-muted);">Avg Wait Reduction</div>
            <div style="font-size: 24px; font-weight: 700; color: var(--color-signal-green); margin-top: 4px;" id="kpi-wait">--%</div>
            <div style="font-size: 10px; color: var(--color-paper-muted); margin-top: 2px;">vs fixed cycle baseline</div>
          </div>
          <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 4px; padding: 12px;">
            <div style="font-size: 11px; color: var(--color-paper-muted);">Active Vehicles / Output</div>
            <div style="font-size: 24px; font-weight: 700; color: var(--color-sodium); margin-top: 4px;" id="kpi-flow">0 / 0</div>
            <div style="font-size: 10px; color: var(--color-paper-muted); margin-top: 2px;" id="kpi-db-status">Active / Completed</div>
          </div>
        </div>

        <!-- Charts Grid (5 Focused Telemetry Charts) -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 20px;">
          <!-- Chart 1: Wait Time Over Time -->
          <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 6px; padding: 14px; position: relative;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-size: 12px; font-weight: 600; color: var(--color-paper);">Average Vehicle Wait Time (s)</span>
              <span style="font-size: 10px; font-family: var(--font-mono); color: var(--color-paper-muted);">Amber: Fixed | Cyan: Hybrid</span>
            </div>
            <div style="position: relative; height: 160px; width: 100%;">
              <canvas id="chart-wait" class="analytics-chart-canvas" width="460" height="160"></canvas>
            </div>
          </div>

          <!-- Chart 2: Queue Length Over Time -->
          <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 6px; padding: 14px; position: relative;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-size: 12px; font-weight: 600; color: var(--color-paper);">Peak Arterial Queue Length (veh)</span>
              <span style="font-size: 10px; font-family: var(--font-mono); color: var(--color-paper-muted);">Amber: Fixed | Cyan: Hybrid</span>
            </div>
            <div style="position: relative; height: 160px; width: 100%;">
              <canvas id="chart-queue" class="analytics-chart-canvas" width="460" height="160"></canvas>
            </div>
          </div>

          <!-- Chart 3: Active Vehicles & Completed Trips -->
          <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 6px; padding: 14px; position: relative;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-size: 12px; font-weight: 600; color: var(--color-paper);">Vehicle Flow & Trip Ingress</span>
              <span style="font-size: 10px; font-family: var(--font-mono); color: var(--color-paper-muted);">Cyan: Active | Green: Trips Completed</span>
            </div>
            <div style="position: relative; height: 160px; width: 100%;">
              <canvas id="chart-flow" class="analytics-chart-canvas" width="460" height="160"></canvas>
            </div>
          </div>

          <!-- Chart 4: Traffic Pressure Across Intersections -->
          <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 6px; padding: 14px; position: relative;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-size: 12px; font-weight: 600; color: var(--color-paper);">Intersection Traffic Pressure (%)</span>
              <span style="font-size: 10px; font-family: var(--font-mono); color: var(--color-paper-muted);">J1(Gold) · J2(Cyan) · J3(Grn) · J4(Red)</span>
            </div>
            <div style="position: relative; height: 160px; width: 100%;">
              <canvas id="chart-pressure" class="analytics-chart-canvas" width="460" height="160"></canvas>
            </div>
          </div>
        </div>

        <!-- Chart 5: System Resilience Over Time (Full Width) -->
        <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 6px; padding: 14px; position: relative; margin-top: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 12px; font-weight: 600; color: var(--color-paper);">District Traffic Resilience Index (0–100 Scale Over Time)</span>
            <span style="font-size: 10px; font-family: var(--font-mono); color: var(--color-paper-muted);">Vertical lines denote Weather & Road events</span>
          </div>
          <div style="position: relative; height: 140px; width: 100%;">
            <canvas id="chart-resilience" class="analytics-chart-canvas" width="980" height="140"></canvas>
          </div>
        </div>

        <!-- Resilience Breakdown Cards -->
        <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 6px; padding: 16px; margin-top: 16px;">
          <div style="font-size: 13px; font-weight: 600; color: var(--color-paper); margin-bottom: 12px;">
            Traffic Resilience Index Breakdown (Formula: 0.35·Queue + 0.20·Emergency + 0.20·Balance + 0.15·Spillback + 0.10·Efficiency)
          </div>
          <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px;" id="resilience-breakdown-cards">
            <div style="background: #14110F; padding: 10px; border-radius: 4px; border: 1px solid var(--color-panel-border);">
              <div style="font-size: 10px; color: var(--color-paper-muted);">Queue Stability</div>
              <div style="font-size: 18px; font-weight: 700; color: var(--color-paper); margin-top: 4px;" id="rb-queue">--</div>
              <div style="font-size: 9px; color: var(--color-paper-muted);">Variance penalty</div>
            </div>
            <div style="background: #14110F; padding: 10px; border-radius: 4px; border: 1px solid var(--color-panel-border);">
              <div style="font-size: 10px; color: var(--color-paper-muted);">Emergency Ready</div>
              <div style="font-size: 18px; font-weight: 700; color: var(--color-quantum); margin-top: 4px;" id="rb-emerg">--</div>
              <div style="font-size: 9px; color: var(--color-paper-muted);">Corridor preemption</div>
            </div>
            <div style="background: #14110F; padding: 10px; border-radius: 4px; border: 1px solid var(--color-panel-border);">
              <div style="font-size: 10px; color: var(--color-paper-muted);">Network Balance</div>
              <div style="font-size: 18px; font-weight: 700; color: var(--color-paper); margin-top: 4px;" id="rb-net">--</div>
              <div style="font-size: 9px; color: var(--color-paper-muted);">NS vs EW pressure</div>
            </div>
            <div style="background: #14110F; padding: 10px; border-radius: 4px; border: 1px solid var(--color-panel-border);">
              <div style="font-size: 10px; color: var(--color-paper-muted);">Spillback Guard</div>
              <div style="font-size: 18px; font-weight: 700; color: var(--color-signal-green); margin-top: 4px;" id="rb-spill">--</div>
              <div style="font-size: 9px; color: var(--color-paper-muted);">Margin to capacity</div>
            </div>
            <div style="background: #14110F; padding: 10px; border-radius: 4px; border: 1px solid var(--color-panel-border);">
              <div style="font-size: 10px; color: var(--color-paper-muted);">Signal Efficiency</div>
              <div style="font-size: 18px; font-weight: 700; color: var(--color-sodium); margin-top: 4px;" id="rb-eff">--</div>
              <div style="font-size: 9px; color: var(--color-paper-muted);">Discharge ratio</div>
            </div>
          </div>
        </div>
      </div>
    `;

    const closeBtn = this.container.querySelector("#btn-close-analytics");
    if (closeBtn) closeBtn.addEventListener("click", () => this.hide());
  }

  private async fetchDataAndDraw() {
    if (!this.isVisible) return;

    try {
      const summaryRes = await fetch("/api/analytics/summary");
      const summary = await summaryRes.json();

      const kpiRes = document.getElementById("kpi-resilience");
      if (kpiRes && summary.resilience_index) {
        kpiRes.textContent = summary.resilience_index.overall.toFixed(1);
      }

      const kpiConf = document.getElementById("kpi-confidence");
      if (kpiConf && summary.decision_confidence) {
        kpiConf.textContent = `${summary.decision_confidence.percentage}%`;
      }

      const kpiWait = document.getElementById("kpi-wait");
      if (kpiWait) {
        const wr = summary.wait_reduction_pct !== undefined ? summary.wait_reduction_pct : 0;
        kpiWait.textContent = wr >= 0 ? `-${wr.toFixed(1)}%` : `+${Math.abs(wr).toFixed(1)}%`;
        kpiWait.style.color = wr >= 0 ? "var(--color-signal-green)" : "var(--color-signal-red)";
      }

      const kpiFlow = document.getElementById("kpi-flow");
      if (kpiFlow) {
        kpiFlow.textContent = `${summary.active_vehicles || 0} / ${summary.total_throughput || 0}`;
      }

      const simBadge = document.getElementById("analytics-sim-badge");
      if (simBadge && summary.simulation_id) {
        simBadge.textContent = `SESSION: ${summary.simulation_id} · DB: ${summary.database_connected ? "ONLINE" : "CACHE"}`;
      }

      const rb = summary.resilience_index?.breakdown;
      if (rb) {
        const elQ = document.getElementById("rb-queue");
        if (elQ) elQ.textContent = rb.queue_stability.toFixed(1);
        const elE = document.getElementById("rb-emerg");
        if (elE) elE.textContent = rb.emergency_readiness.toFixed(1);
        const elN = document.getElementById("rb-net");
        if (elN) elN.textContent = rb.network_balance.toFixed(1);
        const elS = document.getElementById("rb-spill");
        if (elS) elS.textContent = rb.spillback_protection.toFixed(1);
        const elEf = document.getElementById("rb-eff");
        if (elEf) elEf.textContent = rb.signal_efficiency.toFixed(1);
      }

      // Fetch authoritative time-series snapshots
      const histRes = await fetch("/api/analytics/history?limit=60");
      const history = await histRes.json();

      // Draw all 5 charts
      this.drawChart("chart-wait", history, "wait_fixed", "wait_hybrid", "#F2A33A", "#9FD8FF", "s");
      this.drawChart("chart-queue", history, "peak_queue_fixed", "peak_queue_hybrid", "#F2A33A", "#9FD8FF", "v");
      this.drawChart("chart-flow", history, "active_vehicles", "throughput", "#9FD8FF", "#6CC58A", "");
      this.drawMultiChart("chart-pressure", history, [
        { key: "pressure_J1", color: "#F2A33A", label: "J1" },
        { key: "pressure_J2", color: "#9FD8FF", label: "J2" },
        { key: "pressure_J3", color: "#6CC58A", label: "J3" },
        { key: "pressure_J4", color: "#E5533D", label: "J4" }
      ], "%");
      this.drawSingleChart("chart-resilience", history, "resilience_index", "#9FD8FF", "/100");
    } catch (e) {
      console.warn("Analytics fetch error:", e);
    }
  }

  private drawChart(
    canvasId: string,
    data: any[],
    key1: string,
    key2: string,
    color1: string,
    color2: string,
    unit: string
  ) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!data || data.length === 0) {
      ctx.fillStyle = "rgba(237, 228, 211, 0.4)";
      ctx.font = "11px Inter, sans-serif";
      ctx.fillText("Gathering live telemetry snapshots...", 24, h / 2);
      return;
    }

    const padL = 36;
    const padR = 16;
    const padT = 16;
    const padB = 22;

    let maxVal = 5.0;
    for (const d of data) {
      maxVal = Math.max(maxVal, d[key1] || 0, d[key2] || 0);
    }
    maxVal = Math.ceil(maxVal * 1.15);

    // Grid lines
    ctx.strokeStyle = "rgba(237, 228, 211, 0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const y = padT + ((h - padT - padB) / 3) * i;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();

      const val = (maxVal * (3 - i)) / 3;
      ctx.fillStyle = "rgba(237, 228, 211, 0.45)";
      ctx.font = "9px monospace";
      ctx.fillText(`${val.toFixed(0)}${unit}`, 6, y + 3);
    }

    const getX = (idx: number) => padL + (idx / Math.max(1, data.length - 1)) * (w - padL - padR);
    const getY = (val: number) => padT + (1 - Math.max(0, val) / maxVal) * (h - padT - padB);

    // Event markers
    this.drawEventMarkers(ctx, data, padL, padR, padT, h - padB);

    // Series 1
    ctx.strokeStyle = color1;
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((d, idx) => {
      const x = getX(idx);
      const y = getY(d[key1] || 0);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Series 2
    ctx.strokeStyle = color2;
    ctx.lineWidth = 2;
    ctx.beginPath();
    data.forEach((d, idx) => {
      const x = getX(idx);
      const y = getY(d[key2] || 0);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  private drawMultiChart(
    canvasId: string,
    data: any[],
    series: Array<{ key: string; color: string; label: string }>,
    unit: string
  ) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!data || data.length === 0) {
      ctx.fillStyle = "rgba(237, 228, 211, 0.4)";
      ctx.font = "11px Inter, sans-serif";
      ctx.fillText("Gathering intersection pressure data...", 24, h / 2);
      return;
    }

    const padL = 36;
    const padR = 16;
    const padT = 16;
    const padB = 22;
    const maxVal = 100.0;

    // Grid lines
    ctx.strokeStyle = "rgba(237, 228, 211, 0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 2; i++) {
      const y = padT + ((h - padT - padB) / 2) * i;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();

      const val = (maxVal * (2 - i)) / 2;
      ctx.fillStyle = "rgba(237, 228, 211, 0.45)";
      ctx.font = "9px monospace";
      ctx.fillText(`${val.toFixed(0)}${unit}`, 6, y + 3);
    }

    const getX = (idx: number) => padL + (idx / Math.max(1, data.length - 1)) * (w - padL - padR);
    const getY = (val: number) => padT + (1 - Math.max(0, Math.min(100, val)) / maxVal) * (h - padT - padB);

    this.drawEventMarkers(ctx, data, padL, padR, padT, h - padB);

    for (const s of series) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      data.forEach((d, idx) => {
        const x = getX(idx);
        const y = getY(d[s.key] !== undefined ? d[s.key] : 20);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }

  private drawSingleChart(
    canvasId: string,
    data: any[],
    key: string,
    color: string,
    unit: string
  ) {
    const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!data || data.length === 0) {
      ctx.fillStyle = "rgba(237, 228, 211, 0.4)";
      ctx.font = "11px Inter, sans-serif";
      ctx.fillText("Tracking network resilience score over time...", 24, h / 2);
      return;
    }

    const padL = 40;
    const padR = 20;
    const padT = 16;
    const padB = 22;
    const minVal = 50.0;
    const maxVal = 100.0;

    // Grid lines
    ctx.strokeStyle = "rgba(237, 228, 211, 0.08)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 2; i++) {
      const y = padT + ((h - padT - padB) / 2) * i;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();

      const val = maxVal - ((maxVal - minVal) / 2) * i;
      ctx.fillStyle = "rgba(237, 228, 211, 0.45)";
      ctx.font = "9px monospace";
      ctx.fillText(`${val.toFixed(0)}${unit}`, 6, y + 3);
    }

    const getX = (idx: number) => padL + (idx / Math.max(1, data.length - 1)) * (w - padL - padR);
    const getY = (val: number) => {
      const clamped = Math.max(minVal, Math.min(maxVal, val));
      return padT + (1 - (clamped - minVal) / (maxVal - minVal)) * (h - padT - padB);
    };

    this.drawEventMarkers(ctx, data, padL, padR, padT, h - padB);

    // Area fill
    ctx.fillStyle = "rgba(159, 216, 255, 0.08)";
    ctx.beginPath();
    data.forEach((d, idx) => {
      const x = getX(idx);
      const y = getY(d[key] || 90);
      if (idx === 0) {
        ctx.moveTo(x, h - padB);
        ctx.lineTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    const lastX = getX(data.length - 1);
    ctx.lineTo(lastX, h - padB);
    ctx.closePath();
    ctx.fill();

    // Line
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    data.forEach((d, idx) => {
      const x = getX(idx);
      const y = getY(d[key] || 90);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  private drawEventMarkers(
    ctx: CanvasRenderingContext2D,
    data: any[],
    padL: number,
    padR: number,
    topY: number,
    botY: number
  ) {
    const totalW = ctx.canvas.width - padL - padR;
    data.forEach((d, idx) => {
      if (d.event_marker) {
        const x = padL + (idx / Math.max(1, data.length - 1)) * totalW;
        ctx.save();
        ctx.strokeStyle = "rgba(242, 163, 58, 0.45)";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, topY);
        ctx.lineTo(x, botY);
        ctx.stroke();

        ctx.font = "8px monospace";
        ctx.fillStyle = "#F2A33A";
        ctx.textAlign = "center";
        const shortName = d.event_marker.replace("CLOSURE_", "CLOSED:").replace("ACCIDENT_", "INCIDENT:");
        ctx.fillText(shortName.slice(0, 10), x, topY + 8);
        ctx.restore();
      }
    });
  }
}
