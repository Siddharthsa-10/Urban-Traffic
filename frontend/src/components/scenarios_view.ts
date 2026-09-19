export class ScenariosView {
  private container: HTMLElement;
  public onTriggerWorkflow?: (name: string) => void;

  constructor(containerId: string) {
    this.container = document.getElementById(containerId)!;
    this.render();
  }

  public show() {
    this.container.classList.add("active");
  }

  public hide() {
    this.container.classList.remove("active");
  }

  private render() {
    this.container.innerHTML = `
      <div class="scenarios-modal-card" style="width: 880px; max-height: 88vh; overflow-y: auto; background: #14110F; border: 1px solid var(--color-panel-border); border-radius: 6px; padding: 24px; box-shadow: 0 16px 40px rgba(0,0,0,0.85); color: var(--color-paper); margin: auto;">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-panel-border); padding-bottom: 14px;">
          <div>
            <div style="font-size: 11px; font-family: var(--font-mono); color: var(--color-sodium); letter-spacing: 0.08em;">
              OPERATIONAL SCENARIOS & WHAT-IF LAB
            </div>
            <div style="font-size: 20px; font-weight: 700; color: var(--color-paper); margin-top: 2px;">
              Predictive Scenario Sandbox
            </div>
          </div>
          <button class="btn-cancel" id="btn-close-scenarios" style="padding: 6px 14px;">✕ Close</button>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 18px;">
          <!-- Left: What-If Simulation Lab -->
          <div style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 6px; padding: 16px;">
            <div style="font-size: 13px; font-weight: 700; color: var(--color-quantum); margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
              <span>🧪</span> WHAT-IF SIMULATION LAB
            </div>

            <div style="display: flex; flex-direction: column; gap: 14px;">
              <!-- Vehicle Inflow -->
              <div>
                <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                  <span style="color: var(--color-paper-muted);">Vehicle Inflow Demand</span>
                  <span id="lbl-inflow" style="font-family: var(--font-mono); color: var(--color-quantum);">+40%</span>
                </div>
                <input type="range" id="slider-inflow" min="-50" max="150" value="40" step="5" style="width: 100%; accent-color: var(--color-quantum);" />
              </div>

              <!-- Emergency Vehicles -->
              <div>
                <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                  <span style="color: var(--color-paper-muted);">Emergency Vehicles En Route</span>
                  <span id="lbl-emergency" style="font-family: var(--font-mono); color: var(--color-signal-red);">1</span>
                </div>
                <input type="range" id="slider-emergency" min="0" max="3" value="1" step="1" style="width: 100%; accent-color: var(--color-signal-red);" />
              </div>

              <!-- Road Capacity -->
              <div>
                <div style="display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px;">
                  <span style="color: var(--color-paper-muted);">Arterial Road Capacity</span>
                  <span id="lbl-capacity" style="font-family: var(--font-mono); color: var(--color-sodium);">-30%</span>
                </div>
                <input type="range" id="slider-capacity" min="-70" max="0" value="-30" step="5" style="width: 100%; accent-color: var(--color-sodium);" />
              </div>

              <!-- Weather Dropdown -->
              <div>
                <div style="font-size: 12px; color: var(--color-paper-muted); margin-bottom: 4px;">Weather Condition</div>
                <select id="sel-whatif-weather" style="width: 100%; background: #1a1715; border: 1px solid var(--color-panel-border); color: var(--color-paper); padding: 8px; border-radius: 4px; font-family: var(--font-mono); font-size: 12px;">
                  <option value="CLEAR">Clear Sky (1.0x traction)</option>
                  <option value="RAIN">Moderate Rain (1.2x braking distance)</option>
                  <option value="HEAVY_RAIN" selected>Heavy Rain (1.25x braking, -18% speed)</option>
                  <option value="FOG">Dense Fog (reduced sight distance)</option>
                  <option value="FLOODED">Flooded Link (isolated lowlands)</option>
                </select>
              </div>

              <!-- Pedestrian Density & Accident -->
              <div style="display: flex; gap: 14px; align-items: center; justify-content: space-between;">
                <div>
                  <div style="font-size: 11px; color: var(--color-paper-muted); margin-bottom: 4px;">Pedestrians</div>
                  <select id="sel-ped-density" style="background: #1a1715; border: 1px solid var(--color-panel-border); color: var(--color-paper); padding: 6px; border-radius: 4px; font-size: 11px;">
                    <option value="LOW">Low</option>
                    <option value="MEDIUM" selected>Medium</option>
                    <option value="HIGH">High (+14s walk)</option>
                  </select>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; margin-top: 14px;">
                  <input type="checkbox" id="chk-whatif-accident" style="accent-color: var(--color-signal-red); width: 16px; height: 16px;" />
                  <label for="chk-whatif-accident" style="font-size: 12px; color: var(--color-paper-muted); cursor: pointer;">Accident Blockage</label>
                </div>
              </div>

              <button class="btn-confirm" id="btn-run-whatif" style="width: 100%; padding: 10px; font-size: 13px; margin-top: 6px;">
                ⚡ RUN SCENARIO PROJECTION
              </button>
            </div>
          </div>

          <!-- Right: What-If Result / 12 Workflow Selector -->
          <div style="display: flex; flex-direction: column; gap: 14px;">
            <!-- Output Display Card -->
            <div id="whatif-output-card" style="background: var(--color-ink); border: 1px solid var(--color-panel-border); border-radius: 6px; padding: 16px; min-height: 210px; display: flex; flex-direction: column;">
              <div style="font-size: 10px; font-family: var(--font-mono); color: var(--color-quantum); letter-spacing: 0.08em;" id="wf-result-tag">
                SCENARIO SIMULATION RESULT
              </div>
              <div style="font-size: 15px; font-weight: 700; color: var(--color-paper); margin-top: 4px;" id="wf-result-title">
                Ready to simulate scenario conditions
              </div>
              <div style="font-size: 12px; color: var(--color-paper-muted); margin-top: 8px; line-height: 1.5; flex: 1;" id="wf-result-statement">
                Adjust the scenario parameters on the left or select an event workflow below to project queue propagation and signal adaptation across the digital twin.
              </div>
              <div id="wf-result-metrics" style="margin-top: 10px; display: none; grid-template-columns: 1fr 1fr 1fr; gap: 8px; font-family: var(--font-mono); font-size: 11px;"></div>
            </div>

            <!-- 12 Workflow Buttons Grid -->
            <div>
              <div style="font-size: 11px; font-family: var(--font-mono); color: var(--color-paper-muted); margin-bottom: 8px;">
                SELECT OPERATIONAL EVENT WORKFLOW (12 UNIQUE MODES):
              </div>
              <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
                <button class="btn-ctrl wf-btn" data-wf="emergency">1. Emergency</button>
                <button class="btn-ctrl wf-btn" data-wf="congestion">2. Congestion</button>
                <button class="btn-ctrl wf-btn" data-wf="accident">3. Accident</button>
                <button class="btn-ctrl wf-btn" data-wf="closure">4. Road Closure</button>
                <button class="btn-ctrl wf-btn" data-wf="weather">5. Weather</button>
                <button class="btn-ctrl wf-btn" data-wf="predictive">6. Predictive</button>
                <button class="btn-ctrl wf-btn" data-wf="what_if">7. What-If Lab</button>
                <button class="btn-ctrl wf-btn" data-wf="qaoa">8. QAOA Sim</button>
                <button class="btn-ctrl wf-btn" data-wf="comparison">9. Classical vs Q</button>
                <button class="btn-ctrl wf-btn" data-wf="ghost">10. Ghost View</button>
                <button class="btn-ctrl wf-btn" data-wf="safety">11. Fail-Safe</button>
                <button class="btn-ctrl wf-btn" data-wf="replay">12. Replay</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.setupListeners();
  }

  private setupListeners() {
    const closeBtn = this.container.querySelector("#btn-close-scenarios");
    if (closeBtn) closeBtn.addEventListener("click", () => this.hide());

    // Sliders
    const sInflow = this.container.querySelector("#slider-inflow") as HTMLInputElement;
    const lInflow = this.container.querySelector("#lbl-inflow")!;
    sInflow.addEventListener("input", () => {
      const v = parseInt(sInflow.value, 10);
      lInflow.textContent = `${v >= 0 ? '+' : ''}${v}%`;
    });

    const sEmerg = this.container.querySelector("#slider-emergency") as HTMLInputElement;
    const lEmerg = this.container.querySelector("#lbl-emergency")!;
    sEmerg.addEventListener("input", () => {
      lEmerg.textContent = sEmerg.value;
    });

    const sCap = this.container.querySelector("#slider-capacity") as HTMLInputElement;
    const lCap = this.container.querySelector("#lbl-capacity")!;
    sCap.addEventListener("input", () => {
      lCap.textContent = `${sCap.value}%`;
    });

    // Run What-If button
    const runBtn = this.container.querySelector("#btn-run-whatif")!;
    runBtn.addEventListener("click", async () => {
      runBtn.textContent = "Simulating Scenario...";
      try {
        const payload = {
          inflow_pct: parseFloat(sInflow.value),
          emergency_count: parseInt(sEmerg.value, 10),
          road_capacity_pct: parseFloat(sCap.value),
          weather: (this.container.querySelector("#sel-whatif-weather") as HTMLSelectElement).value,
          pedestrian_density: (this.container.querySelector("#sel-ped-density") as HTMLSelectElement).value,
          accident_active: (this.container.querySelector("#chk-whatif-accident") as HTMLInputElement).checked
        };

        const res = await fetch("/api/scenarios/what-if", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();

        document.getElementById("wf-result-tag")!.textContent = "WHAT-IF SIMULATION COMPLETED";
        document.getElementById("wf-result-title")!.textContent = `Primary Bottleneck: ${data.bottleneck_junction} in ~${data.bottleneck_sec}s`;
        document.getElementById("wf-result-statement")!.textContent = data.statement;

        const metricsEl = document.getElementById("wf-result-metrics")!;
        metricsEl.style.display = "grid";
        metricsEl.innerHTML = `
          <div style="background: #14110F; padding: 6px; border: 1px solid var(--color-panel-border); border-radius: 4px;">
            <div style="color: var(--color-paper-muted); font-size: 10px;">Projected Queue</div>
            <div style="color: var(--color-signal-red); font-size: 14px; font-weight: 700;">${data.projected_queue} veh</div>
          </div>
          <div style="background: #14110F; padding: 6px; border: 1px solid var(--color-panel-border); border-radius: 4px;">
            <div style="color: var(--color-paper-muted); font-size: 10px;">Projected Wait</div>
            <div style="color: var(--color-sodium); font-size: 14px; font-weight: 700;">${data.projected_wait_s}s</div>
          </div>
          <div style="background: #14110F; padding: 6px; border: 1px solid var(--color-panel-border); border-radius: 4px;">
            <div style="color: var(--color-paper-muted); font-size: 10px;">Time to Spillback</div>
            <div style="color: var(--color-quantum); font-size: 14px; font-weight: 700;">${data.bottleneck_sec}s</div>
          </div>
        `;
      } catch (e) {
        console.warn("What-if simulation error:", e);
      } finally {
        runBtn.textContent = "⚡ RUN SCENARIO PROJECTION";
      }
    });

    // Workflow Buttons
    const wfButtons = this.container.querySelectorAll<HTMLButtonElement>(".wf-btn");
    wfButtons.forEach((btn) => {
      btn.addEventListener("click", async () => {
        const wfName = btn.getAttribute("data-wf") || "emergency";
        try {
          const res = await fetch(`/api/scenarios/workflow?name=${wfName}`);
          const data = await res.json();

          document.getElementById("wf-result-tag")!.textContent = `WORKFLOW RESULT · ${wfName.toUpperCase()}`;
          document.getElementById("wf-result-title")!.textContent = data.title;
          document.getElementById("wf-result-statement")!.textContent = data.statement || data.difference_statement || "Workflow executed.";

          const metricsEl = document.getElementById("wf-result-metrics")!;
          if (data.expected_delay) {
            metricsEl.style.display = "grid";
            metricsEl.innerHTML = `
              <div style="background: #14110F; padding: 6px; border: 1px solid var(--color-panel-border); border-radius: 4px;">
                <div style="color: var(--color-paper-muted); font-size: 10px;">Ambulance ETA</div>
                <div style="color: var(--color-signal-green); font-size: 13px; font-weight: 700;">${data.expected_delay}</div>
              </div>
              <div style="background: #14110F; padding: 6px; border: 1px solid var(--color-panel-border); border-radius: 4px;">
                <div style="color: var(--color-paper-muted); font-size: 10px;">Origin -> Dest</div>
                <div style="color: var(--color-quantum); font-size: 11px;">${data.origin} -> ${data.destination}</div>
              </div>
              <div style="background: #14110F; padding: 6px; border: 1px solid var(--color-panel-border); border-radius: 4px;">
                <div style="color: var(--color-paper-muted); font-size: 10px;">Congestion Risk</div>
                <div style="color: var(--color-signal-green); font-size: 13px; font-weight: 700;">${data.secondary_congestion_risk}</div>
              </div>
            `;
          } else {
            metricsEl.style.display = "none";
          }

          if (this.onTriggerWorkflow) this.onTriggerWorkflow(wfName);
        } catch (e) {
          console.warn("Workflow fetch error:", e);
        }
      });
    });
  }
}
